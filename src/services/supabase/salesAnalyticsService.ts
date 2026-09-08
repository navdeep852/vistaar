import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage } from './safeStorage';
import { ResolvedDateRange, resolveDateRange } from '../../lib/dateRange';

export interface SalesMetrics {
  totalSales: number;
  todaySales: number;
  thisMonthSales: number;
  invoiceSales: number;
  counterSales: number;
  paidSales: number;
  creditSales: number;
  cashSales: number;
  bankUpiSales: number;
  totalTransactions: number;
  periodStartDate?: string;
  periodEndDate?: string;
  periodLabel?: string;
}

const LOCAL_INVOICES_KEY = 'vistaar_local_invoices_db';
const LOCAL_SALES_KEY = 'vistaar_local_counter_sales_db';

export class SalesAnalyticsService {
  private cache = new Map<string, { metrics: SalesMetrics; timestamp: number }>();
  private CACHE_TTL_MS = 15000; // 15 seconds cache per filter range

  private async getWorkspaceId(): Promise<string> {
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e) {
      console.warn('Failed to get authoritative workspace ID in salesAnalyticsService:', e);
    }
    return supabaseAuthService.getCurrentCompanyId() || '';
  }

  public invalidateCache(): void {
    this.cache.clear();
  }

  /**
   * Calculate Authoritative Sales Metrics for Dashboard
   * Aggregates completed Counter Sales + Issued/Paid Invoices within the selected date range.
   * Strictly excludes Draft, Cancelled, Voided records.
   * Eliminates any potential double-counting between Invoices & Counter Sales.
   */
  public async getSalesMetrics(dateRange?: ResolvedDateRange, forceFresh = false): Promise<SalesMetrics> {
    const range = dateRange || resolveDateRange('today');
    const wsId = await this.getWorkspaceId();
    const cacheKey = `${wsId}:${range.rangeType}:${range.startDateStr}:${range.endDateStr}`;

    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (!forceFresh && cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.metrics;
    }

    let counterSales: any[] = [];
    let invoices: any[] = [];

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        // 1. Fetch Authoritative Completed Counter Sales bounded by sale_date
        const { data: csData, error: csErr } = await supabase
          .from('counter_sales')
          .select('id, sale_number, invoice_number, sale_date, final_total, status, payment_method, amount_received, balance_amount, created_at')
          .eq('workspace_id', wsId)
          .eq('status', 'COMPLETED')
          .gte('sale_date', range.startDateStr)
          .lte('sale_date', range.endDateStr);

        if (!csErr && csData) {
          counterSales = csData;
        }

        // 2. Fetch Authoritative Valid Invoices bounded by date (Excluding Draft and Cancelled)
        const { data: invData, error: invErr } = await supabase
          .from('invoices')
          .select('id, invoice_number, date, grand_total, paid_amount, balance_amount, status, created_at')
          .eq('workspace_id', wsId)
          .in('status', ['Issued', 'Partially Paid', 'Paid'])
          .gte('date', range.startDateStr)
          .lte('date', range.endDateStr);

        if (!invErr && invData) {
          invoices = invData;
        }
      } catch (err) {
        console.warn('[salesAnalyticsService] Failed to query Supabase, checking local tenant cache:', err);
      }
    }

    // Fallback to local storage if offline or empty Supabase return while offline
    if (counterSales.length === 0 && invoices.length === 0) {
      const localCS = safeGetTenantStorage<any>(LOCAL_SALES_KEY, []);
      counterSales = localCS.filter((s: any) => {
        if (s.status === 'CANCELLED') return false;
        const d = (s.sale_date ?? s.saleDate ?? s.created_at ?? '').split('T')[0];
        return d >= range.startDateStr && d <= range.endDateStr;
      });

      const localInv = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      invoices = localInv.filter((i: any) => {
        if (i.status === 'Draft' || i.status === 'Cancelled') return false;
        const d = (i.date ?? i.created_at ?? '').split('T')[0];
        return d >= range.startDateStr && d <= range.endDateStr;
      });
    }

    // De-duplication: Track seen invoice/reference numbers to prevent double counting
    const seenCounterInvoiceNumbers = new Set<string>();
    counterSales.forEach((cs) => {
      const num = cs.invoice_number || cs.invoiceNumber || cs.sale_number || cs.saleNumber;
      if (num) seenCounterInvoiceNumbers.add(String(num).trim().toLowerCase());
    });

    let totalCounterSalesVal = 0;
    let totalInvoiceSalesVal = 0;
    let paidSalesVal = 0;
    let creditSalesVal = 0;
    let cashSalesVal = 0;
    let bankUpiSalesVal = 0;
    let totalTransactions = 0;

    // Process Counter Sales for the selected period
    for (const cs of counterSales) {
      const total = Number(cs.final_total ?? cs.finalTotal ?? 0);
      const method = (cs.payment_method ?? cs.paymentMethod ?? 'Cash').toLowerCase();
      const rec = Number(cs.amount_received ?? cs.amountReceived ?? (method.includes('credit') || method.includes('udhari') ? 0 : total));
      const bal = Number(cs.balance_amount ?? cs.balanceAmount ?? Math.max(0, total - rec));

      totalCounterSalesVal += total;
      paidSalesVal += rec;
      creditSalesVal += bal;
      totalTransactions += 1;

      if (method.includes('cash')) {
        cashSalesVal += rec;
      } else if (method.includes('upi') || method.includes('bank') || method.includes('card')) {
        bankUpiSalesVal += rec;
      }
    }

    // Process Invoices for the selected period (Ignore if duplicate of counter sale)
    for (const inv of invoices) {
      const invNum = String(inv.invoice_number ?? inv.invoiceNumber ?? '').trim().toLowerCase();
      if (invNum && seenCounterInvoiceNumbers.has(invNum)) {
        // Skip duplicate already accounted for via Counter Sale
        continue;
      }

      const total = Number(inv.grand_total ?? inv.grandTotal ?? 0);
      const paid = Number(inv.paid_amount ?? inv.paidAmount ?? 0);
      const bal = Number(inv.balance_amount ?? inv.balanceAmount ?? Math.max(0, total - paid));

      totalInvoiceSalesVal += total;
      paidSalesVal += paid;
      creditSalesVal += bal;
      totalTransactions += 1;
    }

    const totalSales = totalCounterSalesVal + totalInvoiceSalesVal;

    const metrics: SalesMetrics = {
      totalSales,
      todaySales: totalSales, // Period-aware sales
      thisMonthSales: totalSales,
      invoiceSales: totalInvoiceSalesVal,
      counterSales: totalCounterSalesVal,
      paidSales: paidSalesVal,
      creditSales: creditSalesVal,
      cashSales: cashSalesVal,
      bankUpiSales: bankUpiSalesVal,
      totalTransactions,
      periodStartDate: range.startDateStr,
      periodEndDate: range.endDateStr,
      periodLabel: range.periodBadge,
    };

    this.cache.set(cacheKey, { metrics, timestamp: now });
    return metrics;
  }
}

export const salesAnalyticsService = new SalesAnalyticsService();
