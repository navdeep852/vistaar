import { salesAnalyticsService } from './supabase/salesAnalyticsService';
import { udhariService } from './supabase/udhariService';
import { invoiceService } from './supabase/invoiceService';
import { counterSaleService } from './supabase/counterSaleService';
import { cashbookService } from './supabase/cashbookService';
import { supabaseAuthService } from './supabaseAuth';
import { ResolvedDateRange } from '../lib/dateRange';
import { calculateAuthoritativeUdhariMetrics } from './financialCalculationService';

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
  public async runAudit(range: ResolvedDateRange, branchId?: string): Promise<ReconciliationReport> {
    const details: string[] = [];

    const wsId = await supabaseAuthService.getAuthoritativeWorkspaceId();

    // 1. Dashboard calculations
    const salesMetrics = await salesAnalyticsService.getSalesMetrics(range, true, wsId, branchId);
    const udhariMetrics = await udhariService.getAuthoritativeUdhariMetricsAsOf(range.endDateStr, wsId, branchId);

    // 2. Direct Source Queries for same period
    // Source Invoices
    const invRes = await invoiceService.getInvoices({ workspaceId: wsId });
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
    const udhariLedgerRes = await udhariService.getUdhariRecords(wsId, { branchId });
    const rawUdharis = udhariLedgerRes.data || [];
    const ledgerMetrics = calculateAuthoritativeUdhariMetrics(rawUdharis, {
      branchId,
      asOfDate: range.endDateStr,
    });
    const ledgerSum = ledgerMetrics.outstanding;

    const discrepancyUdhari = Math.abs(udhariMetrics.outstanding - ledgerSum);
    const isUdhariConsistent = discrepancyUdhari <= 0.05;

    if (isUdhariConsistent) {
      details.push(`Udhari Audit PASSED: Dashboard Outstanding Udhari (₹${udhariMetrics.outstanding}) matches Ledger Balance (₹${ledgerSum}).`);
    } else {
      details.push(`Udhari Audit MISMATCH: Dashboard shows ₹${udhariMetrics.outstanding}, but ledger sum shows ₹${ledgerSum}. Variance: ₹${discrepancyUdhari}`);
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
