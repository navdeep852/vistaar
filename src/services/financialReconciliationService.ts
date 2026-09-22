import { store } from './store';
import { Invoice, Payment, UdhariRecord } from '../types';
import { calculateInvoiceFinancials, calculateUdhariFinancials } from './financialCalculationService';

export interface FinancialMismatch {
  type: 'INVOICE_PAYMENT_MISMATCH' | 'UDHARI_SUM_MISMATCH' | 'INVOICE_UDHARI_DESYNC';
  reference: string;
  customerName: string;
  details: string;
  expected: number;
  actual: number;
  invoiceId?: string;
  udhariId?: string;
}

export interface ReconciliationReport {
  timestamp: string;
  totalInvoicesAudited: number;
  totalUdharisAudited: number;
  totalPaymentsAudited: number;
  mismatchesFound: number;
  mismatches: FinancialMismatch[];
}

export class FinancialReconciliationService {
  /**
   * Read-only audit of the entire financial pipeline
   */
  public auditFinancialPipeline(): ReconciliationReport {
    const invoices = store.getInvoices();
    const udharis = store.getUdharis();
    const payments = store.getPayments();

    const mismatches: FinancialMismatch[] = [];

    // 1. Audit Invoices vs Payments
    for (const inv of invoices) {
      if (inv.status === 'Draft' || inv.status === 'Cancelled') continue;

      const grandTotal = Number(inv.grandTotal) || 0;
      const recordedPaid = Number(inv.paidAmount) || 0;
      const recordedBalance = Number(inv.balanceAmount) || 0;

      // Actual payments allocated to this invoice
      const invPayments = payments.filter(
        (p) => p.invoiceId === inv.id || (p.invoiceNumber && p.invoiceNumber === inv.invoiceNumber)
      );
      const sumPayments = invPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

      // Check equation: grandTotal == paidAmount + balanceAmount
      if (Math.abs(grandTotal - (recordedPaid + recordedBalance)) > 0.05) {
        mismatches.push({
          type: 'INVOICE_PAYMENT_MISMATCH',
          reference: inv.invoiceNumber,
          customerName: inv.customerName,
          details: `Invoice total (₹${grandTotal}) does not match Paid (₹${recordedPaid}) + Balance (₹${recordedBalance}).`,
          expected: grandTotal,
          actual: recordedPaid + recordedBalance,
          invoiceId: inv.id,
        });
      }

      // Check payments match recorded paidAmount (if payments exist)
      if (sumPayments > 0 && Math.abs(sumPayments - recordedPaid) > 0.05) {
        mismatches.push({
          type: 'INVOICE_PAYMENT_MISMATCH',
          reference: inv.invoiceNumber,
          customerName: inv.customerName,
          details: `Sum of payment records (₹${sumPayments}) does not match invoice paidAmount (₹${recordedPaid}).`,
          expected: sumPayments,
          actual: recordedPaid,
          invoiceId: inv.id,
        });
      }
    }

    // 2. Audit Udharis Internal Sums
    for (const u of udharis) {
      const orig = Number(u.originalAmount) || 0;
      const rec = Number(u.totalReceived) || 0;
      const out = Number(u.outstandingAmount) || 0;

      if (Math.abs(orig - (rec + out)) > 0.05) {
        mismatches.push({
          type: 'UDHARI_SUM_MISMATCH',
          reference: u.id,
          customerName: u.customerNameSnapshot,
          details: `Udhari original (₹${orig}) does not match Received (₹${rec}) + Outstanding (₹${out}).`,
          expected: orig,
          actual: rec + out,
          udhariId: u.id,
        });
      }

      // Check linked Invoice desynchronization
      if (u.invoiceId || u.id.startsWith('UD-')) {
        const linkedInv = invoices.find(
          (i) => i.id === u.invoiceId || i.invoiceNumber === u.id.replace('UD-', '')
        );

        if (linkedInv) {
          const invPaid = Number(linkedInv.paidAmount) || 0;
          const invBal = Number(linkedInv.balanceAmount) || 0;

          if (Math.abs(invPaid - rec) > 0.05 || Math.abs(invBal - out) > 0.05) {
            mismatches.push({
              type: 'INVOICE_UDHARI_DESYNC',
              reference: linkedInv.invoiceNumber,
              customerName: u.customerNameSnapshot,
              details: `Invoice (${linkedInv.invoiceNumber}: Paid ₹${invPaid}, Bal ₹${invBal}) is desynchronized from Udhari (${u.id}: Rec ₹${rec}, Out ₹${out}).`,
              expected: invPaid,
              actual: rec,
              invoiceId: linkedInv.id,
              udhariId: u.id,
            });
          }
        }
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalInvoicesAudited: invoices.length,
      totalUdharisAudited: udharis.length,
      totalPaymentsAudited: payments.length,
      mismatchesFound: mismatches.length,
      mismatches,
    };
  }

  /**
   * Deterministically repair all verified financial mismatches across Store
   */
  public repairDeterministicMismatches(): { repairedCount: number; details: string[] } {
    const report = this.auditFinancialPipeline();
    const details: string[] = [];
    let repairedCount = 0;

    for (const m of report.mismatches) {
      if (m.type === 'INVOICE_UDHARI_DESYNC' || m.type === 'INVOICE_PAYMENT_MISMATCH') {
        const inv = store.getInvoices().find((i) => i.id === m.invoiceId || i.invoiceNumber === m.reference);
        if (inv) {
          const payments = store.getPayments().filter(
            (p) => p.invoiceId === inv.id || (p.invoiceNumber && p.invoiceNumber === inv.invoiceNumber)
          );
          const totalPaid = payments.length > 0
            ? payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
            : Number(inv.paidAmount) || 0;

          const { grandTotal, paidAmount: correctPaid, balanceAmount: correctBalance } = calculateInvoiceFinancials(
            inv.grandTotal,
            totalPaid
          );
          const correctStatus = correctBalance <= 0.01 ? 'Paid' : (correctPaid > 0 ? 'Partially Paid' : 'Issued');

          inv.grandTotal = grandTotal;
          inv.paidAmount = correctPaid;
          inv.balanceAmount = correctBalance;
          inv.status = correctStatus;
          inv.updatedAt = new Date().toISOString();

          // Sync or auto-create linked Udhari
          const udhari = store.getUdharis().find((u) => u.invoiceId === inv.id || u.id === `UD-${inv.invoiceNumber}`);
          if (udhari) {
            const { originalAmount, totalReceived, outstandingAmount, status: uStatus } = calculateUdhariFinancials(
              grandTotal,
              correctPaid
            );
            udhari.originalAmount = originalAmount;
            udhari.totalReceived = totalReceived;
            udhari.outstandingAmount = outstandingAmount;
            udhari.status = uStatus;
            udhari.updatedAt = new Date().toISOString();
          } else if (correctBalance > 0.01) {
            store.syncInvoiceUdhari({
              invoiceId: inv.id,
              invoiceNumber: inv.invoiceNumber,
              customerId: inv.customerId,
              customerName: inv.customerName,
              customerPhone: inv.customerPhone,
              grandTotal,
              paidAmount: correctPaid,
              balanceAmount: correctBalance,
              dueDate: inv.dueDate,
            });
          }

          // Sync linked Follow-up
          const followUp = store.getFollowUps().find(
            (f) => f.invoiceId === inv.id || f.invoiceNumber === inv.invoiceNumber || (udhari && f.udhariId === udhari.id)
          );
          if (followUp) {
            followUp.notes = `Payment follow-up for Invoice #${inv.invoiceNumber}. Outstanding: ₹${correctBalance.toLocaleString('en-IN')}`;
            if (correctBalance <= 0.01) {
              followUp.status = 'Completed';
              followUp.completedAt = new Date().toISOString();
            } else {
              followUp.status = 'Pending';
            }
          }

          details.push(`Repaired ${inv.invoiceNumber}: Grand Total ₹${grandTotal}, Paid ₹${totalPaid}, Balance ₹${correctBalance}, Status ${correctStatus}`);
          repairedCount++;
        }
      }
    }

    if (repairedCount > 0) {
      store.saveAndNotify();
    }

    return { repairedCount, details };
  }
}

export const financialReconciliationService = new FinancialReconciliationService();
