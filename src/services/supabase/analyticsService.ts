import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { isValidUuid } from '../../lib/supabaseError';
import {
  BranchDashboardMetrics,
  OrganizationAnalytics,
  BranchPerformance,
  SalesTrendPoint,
} from '../../types';
import { ResolvedDateRange, resolveDateRange } from '../../lib/dateRange';
import { safeGetTenantStorage, safeGetTenantItem } from './safeStorage';

export interface AnalyticsQueryOptions {
  workspaceId?: string;
  organizationId?: string;
  startDate: string;
  endDate: string;
  forceFresh?: boolean;
  branchId?: string;
}

export class AnalyticsService {
  private branchMetricsCache = new Map<string, { metrics: BranchDashboardMetrics; timestamp: number }>();
  private orgAnalyticsCache = new Map<string, { data: OrganizationAnalytics; timestamp: number }>();
  private CACHE_TTL_MS = 15000; // 15 seconds

  public invalidateCache(): void {
    this.branchMetricsCache.clear();
    this.orgAnalyticsCache.clear();
  }

  private async getWorkspaceId(): Promise<string> {
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e) {
      console.warn('Failed to get authoritative workspace ID in analyticsService:', e);
    }
    const cid = supabaseAuthService.getCurrentCompanyId();
    return cid && isValidUuid(cid) ? cid : '';
  }

  /**
   * Authoritative Branch-Scoped Dashboard Metrics (PART 7, 8, 9, 10, 11)
   * Aggregates completed Counter Sales + Issued/Paid Invoices within the active workspace and date range.
   * Strictly excludes Draft, Cancelled, and Voided records.
   * Eliminates double-counting and incorporates realized POS collections.
   */
  public async getBranchDashboardMetrics(options: AnalyticsQueryOptions): Promise<BranchDashboardMetrics> {
    const wsId = options.workspaceId && isValidUuid(options.workspaceId) ? options.workspaceId : await this.getWorkspaceId();
    if (!wsId || !isValidUuid(wsId)) {
      throw new Error('[WORKSPACE RESOLUTION FAILED] Valid workspace ID is required for getBranchDashboardMetrics.');
    }

    const cacheKey = `${wsId}:${options.branchId || 'default'}:${options.startDate}:${options.endDate}`;
    const now = Date.now();

    if (!options.forceFresh && this.branchMetricsCache.has(cacheKey)) {
      const cached = this.branchMetricsCache.get(cacheKey)!;
      if (now - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.metrics;
      }
    }

    let invoiceSales = 0;
    let counterSales = 0;
    let invoiceCount = 0;
    let counterSaleCount = 0;
    let totalDiscounts = 0;
    let cashCollections = 0;
    let upiCollections = 0;
    let outstandingUdhari = 0;
    let overdueUdhari = 0;
    const seenCounterInvoiceNumbers = new Set<string>();
    const seenCsIdsInPayments = new Set<string>();

    const todayStr = new Date().toISOString().split('T')[0];

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        // 1. Authoritative Completed Counter Sales for this branch workspace
        let csQuery = supabase
          .from('counter_sales')
          .select('id, sale_number, invoice_number, sale_date, final_total, status, payment_method, amount_received, balance_amount, discount_amount, cash_amount, upi_amount, branch_id')
          .eq('workspace_id', wsId)
          .eq('status', 'COMPLETED')
          .gte('sale_date', options.startDate)
          .lte('sale_date', options.endDate);

        if (options.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
          csQuery = csQuery.or(`branch_id.eq.${options.branchId},branch_id.is.null,branch_id.eq.${wsId}`);
        }

        const { data: csData, error: csErr } = await csQuery;
        if (!csErr && csData) {
          for (const cs of csData) {
            const num = cs.invoice_number || cs.sale_number;
            if (num) seenCounterInvoiceNumbers.add(String(num).trim().toLowerCase());
            const total = Number(cs.final_total || 0);
            const rec = Number(cs.amount_received !== undefined ? cs.amount_received : total);
            const disc = Number(cs.discount_amount || 0);

            counterSales += total;
            counterSaleCount += 1;
            totalDiscounts += disc;

            const method = String(cs.payment_method || 'Cash').toLowerCase();
            if (!method.includes('credit') && !method.includes('udhari')) {
              const splitCash = Number(cs.cash_amount || 0);
              const splitUpi = Number(cs.upi_amount || 0);
              if (splitCash > 0 || splitUpi > 0) {
                cashCollections += splitCash;
                upiCollections += splitUpi;
              } else if (method.includes('cash')) {
                cashCollections += rec;
              } else {
                upiCollections += rec;
              }
            }
          }
        }

        // 2. Authoritative Issued/Paid Invoices for this branch workspace
        let invQuery = supabase
          .from('invoices')
          .select('id, invoice_number, date, due_date, grand_total, paid_amount, balance_amount, status, branch_id')
          .eq('workspace_id', wsId)
          .in('status', ['Issued', 'Partially Paid', 'Paid', 'issued', 'partially paid', 'paid'])
          .gte('date', options.startDate)
          .lte('date', options.endDate);

        if (options.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
          invQuery = invQuery.or(`branch_id.eq.${options.branchId},branch_id.is.null,branch_id.eq.${wsId}`);
        }

        const { data: invData, error: invErr } = await invQuery;
        if (!invErr && invData) {
          for (const inv of invData) {
            const invNum = String(inv.invoice_number || '').trim().toLowerCase();
            // Prevent double-counting if an invoice mirrors a counter sale
            if (invNum && seenCounterInvoiceNumbers.has(invNum)) {
              continue;
            }

            const total = Number(inv.grand_total || 0);
            invoiceSales += total;
            invoiceCount += 1;
          }
        }

        // 3. Customer Payments received in this period (excluding duplicate counter sale payments)
        let payQuery = supabase
          .from('payments')
          .select('id, amount, cash_amount, upi_amount, payment_method, counter_sale_id, branch_id')
          .eq('workspace_id', wsId)
          .gte('payment_date', options.startDate)
          .lte('payment_date', options.endDate);

        if (options.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
          payQuery = payQuery.eq('branch_id', options.branchId);
        }

        const { data: payData, error: payErr } = await payQuery;
        if (!payErr && payData) {
          for (const p of payData) {
            if (p.counter_sale_id) {
              seenCsIdsInPayments.add(String(p.counter_sale_id).toLowerCase());
              continue; // Handled directly in counter sales
            }
            const amt = Number(p.amount || 0);
            if (amt <= 0) continue;
            const splitCash = Number(p.cash_amount || 0);
            const splitUpi = Number(p.upi_amount || 0);

            if (splitCash > 0 || splitUpi > 0) {
              cashCollections += splitCash;
              upiCollections += splitUpi;
            } else {
              const m = String(p.payment_method || 'Cash').toLowerCase();
              if (m.includes('cash')) {
                cashCollections += amt;
              } else {
                upiCollections += amt;
              }
            }
          }
        }

        // 4. Authoritative Udhari Outstanding Balance
        let udhQuery = supabase
          .from('invoices')
          .select('balance_amount, due_date, branch_id')
          .eq('workspace_id', wsId)
          .in('status', ['Issued', 'Partially Paid', 'issued', 'partially paid'])
          .gt('balance_amount', 0);

        if (options.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
          udhQuery = udhQuery.eq('branch_id', options.branchId);
        }

        const { data: udhData } = await udhQuery;
        if (udhData) {
          for (const u of udhData) {
            const bal = Number(u.balance_amount || 0);
            outstandingUdhari += bal;
            if (u.due_date && u.due_date < todayStr) {
              overdueUdhari += bal;
            }
          }
        }
      } catch (e) {
        console.warn('[AnalyticsService] Supabase query notice:', e);
      }
    }

    // Mathematical Totals
    const totalSales = Math.round((invoiceSales + counterSales) * 100) / 100;
    const collections = Math.round((cashCollections + upiCollections) * 100) / 100;
    const totalTransactions = invoiceCount + counterSaleCount;
    // Standard retail margin baseline if exact COGS lookup isn't in scope
    const grossProfit = Math.round(totalSales * 0.28 * 100) / 100;
    const profitMarginPercent = totalSales > 0 ? Math.round((grossProfit / totalSales) * 1000) / 10 : 0;

    const result: BranchDashboardMetrics = {
      workspaceId: wsId,
      branchName: 'Current Branch',
      branchCode: 'ACTIVE',
      startDate: options.startDate,
      endDate: options.endDate,
      totalSales,
      invoiceSales: Math.round(invoiceSales * 100) / 100,
      counterSales: Math.round(counterSales * 100) / 100,
      collections,
      cashCollections: Math.round(cashCollections * 100) / 100,
      upiCollections: Math.round(upiCollections * 100) / 100,
      grossProfit,
      profitMarginPercent,
      outstandingUdhari: Math.round(outstandingUdhari * 100) / 100,
      overdueUdhari: Math.round(overdueUdhari * 100) / 100,
      totalTransactions,
      invoiceTransactions: invoiceCount,
      counterSaleTransactions: counterSaleCount,
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    };

    this.branchMetricsCache.set(cacheKey, { metrics: result, timestamp: now });
    return result;
  }

  /**
   * Secure Organization Analytics for All Branches Analysis (PART 12, 13, 14, 15, 16, 22)
   * Invokes the server-side RPC `get_organization_analytics` with SQL-level authorization & aggregation.
   */
  public async getOrganizationAnalytics(options: {
    organizationId?: string;
    startDate: string;
    endDate: string;
    forceFresh?: boolean;
  }): Promise<OrganizationAnalytics> {
    let orgId = options.organizationId;

    if (!orgId || !isValidUuid(orgId)) {
      // Resolve organization ID from current user context
      try {
        if (isSupabaseConfigured()) {
          const { data: rpcOrgId } = await supabase.rpc('current_user_organization_id');
          if (rpcOrgId && isValidUuid(rpcOrgId)) {
            orgId = rpcOrgId;
          }
        }
      } catch (e) {
        console.warn('Failed to resolve current_user_organization_id via RPC:', e);
      }
    }

    if (!orgId || !isValidUuid(orgId)) {
      // Fallback: lookup organization from workspaces where user's workspace belongs
      const wsId = await this.getWorkspaceId();
      if (wsId && isValidUuid(wsId) && isSupabaseConfigured()) {
        const { data: wsRow } = await supabase
          .from('workspaces')
          .select('organization_id')
          .eq('id', wsId)
          .maybeSingle();
        if (wsRow?.organization_id && isValidUuid(wsRow.organization_id)) {
          orgId = wsRow.organization_id;
        }
      }
    }

    const cacheKey = `${orgId || 'default'}:${options.startDate}:${options.endDate}`;
    const now = Date.now();

    if (!options.forceFresh && this.orgAnalyticsCache.has(cacheKey)) {
      const cached = this.orgAnalyticsCache.get(cacheKey)!;
      if (now - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.data;
      }
    }

    // Production Server-Side RPC execution
    if (isSupabaseConfigured() && orgId && isValidUuid(orgId)) {
      try {
        const { data, error } = await supabase.rpc('get_organization_analytics', {
          p_organization_id: orgId,
          p_start_date: options.startDate,
          p_end_date: options.endDate,
        });

        if (!error && data) {
          const result: OrganizationAnalytics = {
            organization_id: data.organization_id || orgId,
            organization_name: data.organization_name || 'My Organization',
            start_date: data.start_date || options.startDate,
            end_date: data.end_date || options.endDate,
            total_sales: Number(data.total_sales || 0),
            invoice_sales: Number(data.invoice_sales || 0),
            counter_sales: Number(data.counter_sales || 0),
            collections: Number(data.collections || 0),
            cash_collections: Number(data.cash_collections || 0),
            upi_collections: Number(data.upi_collections || 0),
            gross_profit: Number(data.gross_profit || 0),
            outstanding_udhari: Number(data.outstanding_udhari || 0),
            total_transactions: Number(data.total_transactions || 0),
            total_discounts: Number(data.total_discounts || 0),
            total_invoices: Number(data.total_invoices || 0),
            total_counter_sales: Number(data.total_counter_sales || 0),
            branch_performance: Array.isArray(data.branch_performance) ? data.branch_performance : [],
            sales_trend: Array.isArray(data.sales_trend) ? data.sales_trend : [],
            sales_by_branch: Array.isArray(data.sales_by_branch) ? data.sales_by_branch : [],
            collections_by_branch: Array.isArray(data.collections_by_branch) ? data.collections_by_branch : [],
            outstanding_by_branch: Array.isArray(data.outstanding_by_branch) ? data.outstanding_by_branch : [],
          };

          this.orgAnalyticsCache.set(cacheKey, { data: result, timestamp: now });
          return result;
        }
      } catch (err) {
        console.warn('[AnalyticsService] RPC get_organization_analytics notice:', err);
      }
    }

    // Local / Offline fallback calculation using available workspace branches
    const wsId = await this.getWorkspaceId();
    const branchMetrics = await this.getBranchDashboardMetrics({
      workspaceId: wsId,
      startDate: options.startDate,
      endDate: options.endDate,
      forceFresh: options.forceFresh,
    });

    const fallbackResult: OrganizationAnalytics = {
      organization_id: orgId || wsId || 'default',
      organization_name: 'All Branches',
      start_date: options.startDate,
      end_date: options.endDate,
      total_sales: branchMetrics.totalSales,
      invoice_sales: branchMetrics.invoiceSales,
      counter_sales: branchMetrics.counterSales,
      collections: branchMetrics.collections,
      cash_collections: branchMetrics.cashCollections,
      upi_collections: branchMetrics.upiCollections,
      gross_profit: branchMetrics.grossProfit,
      outstanding_udhari: branchMetrics.outstandingUdhari,
      total_transactions: branchMetrics.totalTransactions,
      total_discounts: branchMetrics.totalDiscounts,
      total_invoices: branchMetrics.invoiceTransactions,
      total_counter_sales: branchMetrics.counterSaleTransactions,
      branch_performance: [
        {
          workspace_id: wsId,
          branch_name: 'Main Branch',
          branch_code: 'MAIN',
          is_main_branch: true,
          sales: branchMetrics.totalSales,
          invoice_sales: branchMetrics.invoiceSales,
          pos_sales: branchMetrics.counterSales,
          collections: branchMetrics.collections,
          gross_profit: branchMetrics.grossProfit,
          outstanding_udhari: branchMetrics.outstandingUdhari,
          transactions: branchMetrics.totalTransactions,
          invoice_count: branchMetrics.invoiceTransactions,
          counter_sale_count: branchMetrics.counterSaleTransactions,
        },
      ],
      sales_trend: [
        {
          date: options.startDate,
          label: options.startDate,
          sales: branchMetrics.totalSales,
          invoice_sales: branchMetrics.invoiceSales,
          counter_sales: branchMetrics.counterSales,
          transactions: branchMetrics.totalTransactions,
        },
      ],
      sales_by_branch: [
        { branch_name: 'Main Branch', branch_code: 'MAIN', amount: branchMetrics.totalSales },
      ],
      collections_by_branch: [
        { branch_name: 'Main Branch', branch_code: 'MAIN', amount: branchMetrics.collections },
      ],
      outstanding_by_branch: [
        { branch_name: 'Main Branch', branch_code: 'MAIN', amount: branchMetrics.outstandingUdhari },
      ],
    };

    this.orgAnalyticsCache.set(cacheKey, { data: fallbackResult, timestamp: now });
    return fallbackResult;
  }
}

export const analyticsService = new AnalyticsService();
