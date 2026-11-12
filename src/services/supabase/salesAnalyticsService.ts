import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeGetTenantItem } from './safeStorage';
import { ResolvedDateRange, resolveDateRange, normalizeToYyyyMmDd } from '../../lib/dateRange';
import { isRecordInBranch } from '../../lib/branchUtils';
import { financialAnalyticsRepository } from '../analytics/financialAnalyticsRepository.ts';

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
    if (!isSupabaseConfigured()) {
      return supabaseAuthService.getCurrentCompanyId() || '';
    }
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e: any) {
      console.warn('Failed to get authoritative workspace ID in salesAnalyticsService:', e?.message || e);
    }
    const currentId = supabaseAuthService.getCurrentCompanyId();
    if (currentId && isValidUuid(currentId)) return currentId;
    return currentId || '';
  }

  public invalidateCache(): void {
    this.cache.clear();
    financialAnalyticsRepository.invalidateCache();
    try {
      import('./enterpriseAnalyticsService').then((m) => m.enterpriseAnalyticsService.invalidateCache()).catch(() => {});
    } catch {}
  }

  /**
   * Calculate Authoritative Sales Metrics for Dashboard
   * Authoritatively delegates to the centralized FinancialAnalyticsRepository.
   * Eliminates disparate calculation algorithms, localStorage merging, and cross-device drift.
   */
  public async getSalesMetrics(
    dateRange?: ResolvedDateRange,
    forceFresh = false,
    explicitWsId?: string,
    branchId?: string
  ): Promise<SalesMetrics> {
    const range = dateRange || resolveDateRange('today');
    const wsId = explicitWsId && isValidUuid(explicitWsId) ? explicitWsId : await this.getWorkspaceId();
    const effectiveBranchId = branchId;

    const cacheKey = `${wsId}:${effectiveBranchId || 'all'}:${range.rangeType}:${range.startDateStr}:${range.endDateStr}`;

    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (!forceFresh && cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.metrics;
    }

    const authResult = await financialAnalyticsRepository.getAuthoritativeFinancials({
      dateRange: range,
      branchId: effectiveBranchId,
      forceFresh,
      explicitWsId: wsId,
    });

    const metrics: SalesMetrics = {
      totalSales: authResult.kpis.totalSales,
      todaySales: authResult.kpis.totalSales,
      thisMonthSales: authResult.kpis.totalSales,
      invoiceSales: authResult.kpis.invoiceSales,
      counterSales: authResult.kpis.counterSales,
      paidSales: authResult.kpis.collections,
      creditSales: authResult.kpis.outstandingUdhari,
      cashSales: authResult.kpis.cashCollections,
      bankUpiSales: authResult.kpis.upiCollections,
      totalTransactions: authResult.kpis.totalTransactions,
      periodStartDate: range.startDateStr,
      periodEndDate: range.endDateStr,
      periodLabel: range.periodBadge,
    };

    this.cache.set(cacheKey, { metrics, timestamp: now });
    return metrics;
  }
}

export const salesAnalyticsService = new SalesAnalyticsService();
