import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Payment } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_PAYMENTS_KEY = 'vistaar_local_payments_db';

export class PaymentService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getPayments(): Promise<{ data: Payment[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data, error } = await supabase
          .from('payments')
          .select('*')
          .eq('workspace_id', wsId)
          .order('created_at', { ascending: false });

        if (error) {
          const errStr = handleSupabaseError(error, 'getPayments');
          const fallback = safeGetTenantStorage<Payment>(LOCAL_PAYMENTS_KEY, []);
          return { data: fallback, error: errStr };
        }

        const mapped: Payment[] = (data || []).map((p: any) => ({
          id: p.id,
          paymentNumber: p.payment_number || `PAY-${p.id.substring(0, 8)}`,
          customerId: p.customer_id,
          customerName: p.customer_name || 'Customer',
          invoiceId: p.invoice_id,
          invoiceNumber: p.invoice_number,
          amount: Number(p.amount) || 0,
          date: p.payment_date || (p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
          method: p.method || 'Cash',
          referenceNo: p.reference_no,
          notes: p.notes,
          createdAt: p.created_at,
        }));

        return { data: mapped };
      }

      const fallback = safeGetTenantStorage<Payment>(LOCAL_PAYMENTS_KEY, []);
      return { data: fallback };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getPayments');
      const fallback = safeGetTenantStorage<Payment>(LOCAL_PAYMENTS_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  private async syncInvoicePaymentTotals(invoiceId?: string | null, invoiceNumber?: string): Promise<void> {
    const wsId = this.getWorkspaceId();
    if (!invoiceId && !invoiceNumber) return;

    try {
      let query = supabase.from('invoices').select('id, invoice_number, customer_id, customer_name, customer_phone, date, due_date, grand_total, paid_amount, balance_amount, status');
      if (invoiceId && isValidUuid(invoiceId)) {
        query = query.eq('id', invoiceId);
      } else if (invoiceNumber) {
        query = query.eq('invoice_number', invoiceNumber);
      }
      if (isValidUuid(wsId)) {
        query = query.eq('workspace_id', wsId);
      }

      const { data: invData, error: invErr } = await query.maybeSingle();
      if (invErr || !invData) return;

      const targetId = invData.id;
      const grandTotal = Number(invData.grand_total) || 0;
      const finalInvNumber = invData.invoice_number || invoiceNumber || `INV-${targetId.substring(0, 8)}`;

      // Ensure any payments linked by invoice_number have invoice_id set
      if (finalInvNumber) {
        try {
          let linkQuery = supabase
            .from('payments')
            .update({ invoice_id: targetId })
            .is('invoice_id', null)
            .eq('invoice_number', finalInvNumber);
          if (isValidUuid(wsId)) {
            linkQuery = linkQuery.eq('workspace_id', wsId);
          }
          await linkQuery;
        } catch (e) {
          // ignore
        }
      }

      let payQuery = supabase.from('payments').select('amount').eq('invoice_id', targetId);
      if (isValidUuid(wsId)) {
        payQuery = payQuery.eq('workspace_id', wsId);
      }

      const { data: payments } = await payQuery;
      const totalPaid = (payments || []).reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);
      const balanceAmount = Math.max(0, Number((grandTotal - totalPaid).toFixed(2)));

      let newStatus = invData.status || 'Issued';
      if (Math.abs(grandTotal - totalPaid) < 0.01 || totalPaid >= grandTotal) {
        newStatus = 'Paid';
      } else if (totalPaid > 0) {
        newStatus = 'Partially Paid';
      }

      let updateQuery = supabase
        .from('invoices')
        .update({
          paid_amount: totalPaid,
          balance_amount: balanceAmount,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetId);

      if (isValidUuid(wsId)) {
        updateQuery = updateQuery.eq('workspace_id', wsId);
      }
      await updateQuery;

      // Authoritative Daybook update for original Invoice Sale entry
      try {
        const { daybookService } = await import('./daybookService');
        const pStatus = balanceAmount <= 0.01 ? 'PAID' : (totalPaid > 0 ? 'PARTIALLY PAID' : 'UNPAID');
        await daybookService.recordFinancialTransaction({
          referenceType: 'INVOICE',
          referenceId: targetId,
          referenceNumber: finalInvNumber,
          transactionType: 'SALE',
          direction: 'IN',
          amount: totalPaid,
          totalAmount: grandTotal,
          remainingAmount: balanceAmount,
          paymentStatus: pStatus,
          partyType: 'customer',
          partyId: invData.customer_id || undefined,
          partyName: invData.customer_name || 'Customer',
          description: `Invoice #${finalInvNumber}`,
          transactionDate: invData.date || new Date().toISOString().split('T')[0],
        });
      } catch (dbErr) {
        console.warn('[syncInvoicePaymentTotals] Daybook sync notice:', dbErr);
      }

      // Synchronize Udhari & Follow-up
      try {
        const { udhariService } = await import('./udhariService');
        await udhariService.syncInvoiceUdhari({
          invoiceId: targetId,
          invoiceNumber: finalInvNumber,
          customerId: invData.customer_id,
          customerName: invData.customer_name || 'Customer',
          customerPhone: invData.customer_phone || '9999999999',
          grandTotal,
          paidAmount: totalPaid,
          balanceAmount,
          dueDate: invData.due_date,
        });
      } catch (uErr) {
        console.warn('[syncInvoicePaymentTotals] Udhari sync notice:', uErr);
      }
    } catch (e) {
      console.warn('[syncInvoicePaymentTotals] notice:', e);
    }
  }

  public async createPayment(payment: Partial<Payment>): Promise<{ paymentId?: string; error?: string }> {
    const amount = Number(payment.amount) || 0;
    if (isNaN(amount) || amount <= 0) {
      return { error: 'Payment amount must be greater than zero.' };
    }

    try {
      const { customerPaymentService } = await import('./customerPaymentService');
      const res = await customerPaymentService.recordCustomerPayment({
        invoiceId: payment.invoiceId,
        invoiceNumber: payment.invoiceNumber,
        customerId: payment.customerId,
        customerName: payment.customerName,
        amount,
        paymentMethod: payment.method || 'Cash',
        paymentDate: payment.date,
        reference: payment.referenceNo,
        notes: payment.notes,
      });

      if (!res.success) {
        return { error: res.error || 'Payment failed — no financial records were changed.' };
      }

      return { paymentId: res.paymentId };
    } catch (err: any) {
      const errStr = handleSupabaseError(err, 'createPayment');
      return { error: errStr || 'Payment transaction failed' };
    }
  }
}

export const paymentService = new PaymentService();
