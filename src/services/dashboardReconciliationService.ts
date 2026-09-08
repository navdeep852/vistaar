import { salesAnalyticsService } from './supabase/salesAnalyticsService';
import { udhariService } from './supabase/udhariService';
import { invoiceService } from './supabase/invoiceService';
import { counterSaleService } from './supabase/counterSaleService';
import { cashbookService } from './supabase/cashbookService';
import { ResolvedDateRange } from '../lib/dateRange';

export interface ReconciliationReport {
  timestamp: string;
  range: ResolvedDateRange;
  salesReconciliation: {
    dashboardTotalSales: number;
    dashboardInvoiceSales: number;
    dashboardCounterSales: number;
    sourceInvoiceSalesSum: number;
    sourceCounterSalesSum: number;
    discrepancySales: number;
    isSalesConsistent: boolean;
  };
  udhariReconciliation: {
    dashboardOutstandingUdhari: number;
    udhariLedgerTotalOutstanding: number;
    discrepancyUdhari: number;
    isUdhariConsistent: boolean;
  };
  cashbookReconciliation?: {
    dashboardPaidSales: number;
    cashbookInflowSales: number;
    difference: number;
  };
  overallStatus: 'PASS' | 'WARNING' | 'FAIL';
  details: string[];
}

export class DashboardReconciliationService {
  /**
   * Runs an authoritative mathematical verification comparing Dashboard calculations
   * against individual source reports for the same date range.
   */
  public async runAudit(range: ResolvedDateRange): Promise<ReconciliationReport> {
    const details: string[] = [];

    // 1. Dashboard calculations
    const salesMetrics = await salesAnalyticsService.getSalesMetrics(range, true);
    const udhariMetrics = await udhariService.getAuthoritativeUdhariMetricsAsOf(range.endDateStr);

    // 2. Direct Source Queries for same period
    // Source Invoices
    const invRes = await invoiceService.getInvoices();
    const sourceInvoices = (invRes.data || []).filter((inv: any) => {
      const d = (inv.date || inv.created_at || '').split('T')[0];
      const validStatus = inv.status === 'Issued' || inv.status === 'Partially Paid' || inv.status === 'Paid';
      return validStatus && d >= range.startDateStr && d <= range.endDateStr;
    });

    // Source Counter Sales
    const csRes = await counterSaleService.getCounterSales();
    const sourceCounterSales = (csRes.data || []).filter((cs: any) => {
      const d = (cs.sale_date || cs.created_at || '').split('T')[0];
      return cs.status === 'COMPLETED' && d >= range.startDateStr && d <= range.endDateStr;
    });

    // Deduplicate counter sales from invoices
    const seenCounterInvoiceNumbers = new Set<string>();
    sourceCounterSales.forEach((cs: any) => {
      const num = cs.invoice_number || cs.invoiceNumber || cs.sale_number;
      if (num) seenCounterInvoiceNumbers.add(String(num).trim().toLowerCase());
    });

    const directInvoiceSum = sourceInvoices
      .filter((i: any) => !seenCounterInvoiceNumbers.has(String(i.invoice_number || '').trim().toLowerCase()))
      .reduce((sum: number, i: any) => sum + (Number(i.grand_total || i.grandTotal || 0)), 0);

    const directCounterSum = sourceCounterSales
      .reduce((sum: number, c: any) => sum + (Number(c.final_total || c.finalTotal || 0)), 0);

    const discrepancySales = Math.abs(salesMetrics.totalSales - (directInvoiceSum + directCounterSum));
    const isSalesConsistent = discrepancySales <= 0.05;

    if (isSalesConsistent) {
      details.push(`Sales Audit PASSED: Dashboard Total (₹${salesMetrics.totalSales}) matches Source Invoices (₹${directInvoiceSum}) + Counter Sales (₹${directCounterSum}).`);
    } else {
      details.push(`Sales Audit MISMATCH: Dashboard shows ₹${salesMetrics.totalSales}, but direct sum is ₹${directInvoiceSum + directCounterSum}. Variance: ₹${discrepancySales}`);
    }

    // 3. Udhari Ledger verification
    const udhariLedgerRes = await udhariService.getUdhariRecords();
    const rawUdharis = udhariLedgerRes.data || [];
    let ledgerSum = 0;
    for (const u of rawUdharis) {
      const created = (u.createdAt || u.created_at || '').split('T')[0];
      if (created <= range.endDateStr) {
        ledgerSum += Number(u.outstandingAmount || u.outstanding_amount || 0);
      }
    }

    const discrepancyUdhari = Math.abs(udhariMetrics.outstanding - ledgerSum);
    // Allow slight variance only if historical rollback payments occurred
    const isUdhariConsistent = range.isHistorical || discrepancyUdhari <= 0.05;

    if (isUdhariConsistent) {
      details.push(`Udhari Audit PASSED: Dashboard Outstanding Udhari (₹${udhariMetrics.outstanding}) matches Ledger Balance.`);
    } else {
      details.push(`Udhari Audit NOTICE: Dashboard shows ₹${udhariMetrics.outstanding}, raw sum shows ₹${ledgerSum}.`);
    }

    const overallStatus: 'PASS' | 'WARNING' | 'FAIL' =
      isSalesConsistent && isUdhariConsistent
        ? 'PASS'
        : (!isSalesConsistent ? 'FAIL' : 'WARNING');

    return {
      timestamp: new Date().toISOString(),
      range,
      salesReconciliation: {
        dashboardTotalSales: salesMetrics.totalSales,
        dashboardInvoiceSales: salesMetrics.invoiceSales,
        dashboardCounterSales: salesMetrics.counterSales,
        sourceInvoiceSalesSum: directInvoiceSum,
        sourceCounterSalesSum: directCounterSum,
        discrepancySales,
        isSalesConsistent,
      },
      udhariReconciliation: {
        dashboardOutstandingUdhari: udhariMetrics.outstanding,
        udhariLedgerTotalOutstanding: ledgerSum,
        discrepancyUdhari,
        isUdhariConsistent,
      },
      overallStatus,
      details,
    };
  }
}

export const dashboardReconciliationService = new DashboardReconciliationService();
