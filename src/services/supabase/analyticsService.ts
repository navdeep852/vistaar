import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { isValidUuid } from '../../lib/supabaseError';
import {
  BranchDashboardMetrics,
  OrganizationAnalytics,
  BranchPerformance,
  SalesTrendPoint,
} from '../../types';
import { resolveDateRange, formatIndianDate } from '../../lib/dateRange';
import { safeGetTenantItem } from './safeStorage';
import { udhariService } from './udhariService';
import { branchService } from './branchService';
import { enterpriseAnalyticsService } from './enterpriseAnalyticsService';
import { financialStatementService } from '../financialStatementService';

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
    enterpriseAnalyticsService.invalidateCache();
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
   * Authoritative Branch-Scoped Dashboard Metrics
   * Delegates to enterpriseAnalyticsService for consistent, authoritative calculations.
   */
  public async getBranchDashboardMetrics(options: AnalyticsQueryOptions): Promise<BranchDashboardMetrics> {
    if (options.workspaceId !== undefined && !isValidUuid(options.workspaceId)) {
      throw new Error('[WORKSPACE RESOLUTION FAILED] Valid workspace ID is required for getBranchDashboardMetrics.');
    }
    const wsId = options.workspaceId || await this.getWorkspaceId();
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

    const dateRange = resolveDateRange('custom', options.startDate, options.endDate);
    const [kpis, raw] = await Promise.all([
      enterpriseAnalyticsService.getDashboardKpis(dateRange, options.forceFresh, options.branchId, wsId),
      enterpriseAnalyticsService.fetchRawTransactionsForPeriod(wsId, dateRange, options.branchId),
    ]);

    let totalDiscounts = 0;
    raw.invoices.forEach((inv: any) => {
      totalDiscounts += Number(inv.discount_total ?? inv.discountTotal ?? 0);
    });
    raw.counterSales.forEach((cs: any) => {
      totalDiscounts += Number(cs.discount_amount ?? cs.discountAmount ?? 0);
    });

    const result: BranchDashboardMetrics = {
      workspaceId: wsId,
      branchName: 'Current Branch',
      branchCode: 'ACTIVE',
      startDate: options.startDate,
      endDate: options.endDate,
      totalSales: kpis.totalSales,
      invoiceSales: kpis.invoiceSales,
      counterSales: kpis.counterSales,
      collections: kpis.collections,
      cashCollections: kpis.cashCollections,
      upiCollections: kpis.upiCollections,
      grossProfit: kpis.grossProfit,
      profitMarginPercent: kpis.profitMarginPercent,
      outstandingUdhari: kpis.outstandingUdhari,
      overdueUdhari: kpis.overdueUdhari,
      totalTransactions: raw.invoices.length + raw.counterSales.length,
      invoiceTransactions: raw.invoices.length,
      counterSaleTransactions: raw.counterSales.length,
      totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    };

    this.branchMetricsCache.set(cacheKey, { metrics: result, timestamp: now });
    return result;
  }

  /**
   * Secure Organization Analytics for All Branches Analysis
   * Aggregates authorized branch records across the workspace.
   * Uses authoritative KPI definitions identical to the Main Branch Dashboard.
   */
  public async getOrganizationAnalytics(options: {
    organizationId?: string;
    startDate: string;
    endDate: string;
    forceFresh?: boolean;
  }): Promise<OrganizationAnalytics> {
    if (options.organizationId !== undefined && !isValidUuid(options.organizationId)) {
      throw new Error('[WORKSPACE RESOLUTION FAILED] Valid workspace ID is required for getOrganizationAnalytics.');
    }
    const wsId = options.organizationId || await this.getWorkspaceId();
    if (!wsId || !isValidUuid(wsId)) {
      throw new Error('[WORKSPACE RESOLUTION FAILED] Valid workspace ID is required for getOrganizationAnalytics.');
    }

    const cacheKey = `${wsId}:${options.startDate}:${options.endDate}`;
    const now = Date.now();

    if (!options.forceFresh && this.orgAnalyticsCache.has(cacheKey)) {
      const cached = this.orgAnalyticsCache.get(cacheKey)!;
      if (now - cached.timestamp < this.CACHE_TTL_MS) {
        return cached.data;
      }
    }

    const dateRange = resolveDateRange('custom', options.startDate, options.endDate);

    // 1. Resolve authorized branches for the authenticated user
    const { data: authorizedBranches = [] } = await branchService.getUserAuthorizedBranches();
    let activeBranches = authorizedBranches.filter((b) => b.status === 'Active');
    if (activeBranches.length === 0) {
      const { data: allB = [] } = await branchService.getBranches({ activeOnly: true });
      activeBranches = allB;
    }
    if (activeBranches.length === 0) {
      activeBranches = [
        {
          id: wsId,
          workspaceId: wsId,
          branchCode: 'MAIN',
          branchName: 'Main Branch',
          branchType: 'Store',
          isMainBranch: true,
          status: 'Active',
        } as any,
      ];
    }

    // Identify main branch
    let mainBranchObj = activeBranches.find((b) => b.isMainBranch) || null;
    if (!mainBranchObj) {
      const savedMainId = safeGetTenantItem<string>('main_branch_id');
      if (savedMainId) {
        mainBranchObj = activeBranches.find((b) => b.id === savedMainId) || activeBranches[0];
      } else {
        mainBranchObj = activeBranches[0];
      }
    }
    const mainBranchId = mainBranchObj?.id;

    // 2. Fetch raw authoritative transactions across ALL branches
    const allRaw = await enterpriseAnalyticsService.fetchRawTransactionsForPeriod(wsId, dateRange, 'ALL');
    const { invoices: allInvoices, counterSales: allCounterSales, payments: allPayments, productsList, expensesList: allExpenses } = allRaw;

    // 3. Partition and compute metrics for each branch
    const branchPerformances: BranchPerformance[] = [];
    let orgTotalDiscounts = 0;

    for (const branch of activeBranches) {
      const isMain = branch.id === mainBranchId || Boolean(branch.isMainBranch);

      const branchInvoices = allInvoices.filter((inv: any) => {
        const w = inv.workspaceId || inv.workspace_id;
        if (w && w !== wsId) return false;
        const b = inv.branchId || inv.branch_id;
        if (b) return b === branch.id;
        return isMain;
      });

      const branchCounterSales = allCounterSales.filter((cs: any) => {
        const w = cs.workspaceId || cs.workspace_id;
        if (w && w !== wsId) return false;
        const b = cs.branchId || cs.branch_id;
        if (b) return b === branch.id;
        return isMain;
      });

      const branchPayments = allPayments.filter((p: any) => {
        const w = p.workspaceId || p.workspace_id;
        if (w && w !== wsId) return false;
        const b = p.branchId || p.branch_id;
        if (b) return b === branch.id;
        return isMain;
      });

      const branchExpenses = allExpenses.filter((exp: any) => {
        const w = exp.workspaceId || exp.workspace_id;
        if (w && w !== wsId) return false;
        const b = exp.branchId || exp.branch_id;
        if (b) return b === branch.id;
        return isMain;
      });

      // Invoice Sales & Discounts
      let branchInvSales = 0;
      let branchInvCount = 0;
      const seenCsInvoiceNumbers = new Set<string>();

      branchCounterSales.forEach((cs: any) => {
        const num = cs.invoice_number || cs.invoiceNumber || cs.sale_number || cs.saleNumber;
        if (num) seenCsInvoiceNumbers.add(String(num).trim().toLowerCase());
        const disc = Number(cs.discount_amount ?? cs.discountAmount ?? 0);
        orgTotalDiscounts += disc;
      });

      branchInvoices.forEach((inv: any) => {
        const num = String(inv.invoice_number ?? inv.invoiceNumber ?? '').trim().toLowerCase();
        if (num && seenCsInvoiceNumbers.has(num)) {
          return; // Prevent double-counting duplicate counter-sale invoice representation
        }
        branchInvSales += Number(inv.grand_total ?? inv.grandTotal ?? 0);
        branchInvCount += 1;
        const disc = Number(inv.discount_total ?? inv.discountTotal ?? 0);
        orgTotalDiscounts += disc;
      });

      // POS / Counter Sales
      let branchPosSales = 0;
      branchCounterSales.forEach((cs: any) => {
        branchPosSales += Number(cs.final_total ?? cs.finalTotal ?? 0);
      });
      const branchCsCount = branchCounterSales.length;

      const branchTotalSales = Math.round((branchInvSales + branchPosSales) * 100) / 100;

      // Collections (Cash vs UPI receipts)
      const { totalCollections: branchCol, cashCollections: branchCash, upiCollections: branchUpi } =
        enterpriseAnalyticsService.computeCollections(branchPayments, branchCounterSales, branchInvoices);

      // Gross profit using FIFO / catalog costing
      const branchFinancials = financialStatementService.computePeriodFinancials(dateRange, {
        invoices: branchInvoices,
        counterSales: branchCounterSales,
        expenses: branchExpenses,
        products: productsList,
      });
      const branchGrossProfit = branchFinancials.grossProfit.grossProfit;

      // Outstanding Udhari for this branch
      const branchUdhariRes = await udhariService.getAuthoritativeUdhariMetricsAsOf(
        options.endDate,
        wsId,
        branch.id
      );

      branchPerformances.push({
        workspace_id: branch.id,
        branch_name: branch.branchName || 'Branch',
        branch_code: branch.branchCode || 'BR',
        is_main_branch: Boolean(branch.isMainBranch),
        sales: branchTotalSales,
        invoice_sales: Math.round(branchInvSales * 100) / 100,
        pos_sales: Math.round(branchPosSales * 100) / 100,
        collections: branchCol,
        cash_collections: branchCash,
        upi_collections: branchUpi,
        gross_profit: branchGrossProfit,
        outstanding_udhari: branchUdhariRes.outstanding,
        transactions: branchInvCount + branchCsCount,
        invoice_count: branchInvCount,
        counter_sale_count: branchCsCount,
      });
    }

    // Sort branch performance: Main branch first, then by sales descending
    branchPerformances.sort((a, b) => {
      if (a.is_main_branch) return -1;
      if (b.is_main_branch) return 1;
      return b.sales - a.sales;
    });

    // 4. Calculate Authoritative Organization Totals
    const totalSales = Math.round(branchPerformances.reduce((acc, b) => acc + b.sales, 0) * 100) / 100;
    const invoiceSales = Math.round(branchPerformances.reduce((acc, b) => acc + b.invoice_sales, 0) * 100) / 100;
    const counterSales = Math.round(branchPerformances.reduce((acc, b) => acc + b.pos_sales, 0) * 100) / 100;
    const cashCollections = branchPerformances.reduce((acc, b) => acc + (b.cash_collections || 0), 0);
    const upiCollections = branchPerformances.reduce((acc, b) => acc + (b.upi_collections || 0), 0);
    const collections = cashCollections + upiCollections;
    const grossProfit = Math.round(branchPerformances.reduce((acc, b) => acc + b.gross_profit, 0) * 100) / 100;

    // Overall Organization Udhari
    const orgUdhariRes = await udhariService.getAuthoritativeUdhariMetricsAsOf(
      options.endDate,
      wsId,
      'ALL'
    );
    const outstandingUdhari = orgUdhariRes.outstanding;

    const totalTransactions = branchPerformances.reduce((acc, b) => acc + b.transactions, 0);
    const totalInvoices = branchPerformances.reduce((acc, b) => acc + b.invoice_count, 0);
    const totalCounterSales = branchPerformances.reduce((acc, b) => acc + b.counter_sale_count, 0);

    // 5. Visualizations Data
    const sales_by_branch = branchPerformances.map((b) => ({
      branch_name: b.branch_name,
      branch_code: b.branch_code,
      amount: b.sales,
    }));

    const collections_by_branch = branchPerformances.map((b) => ({
      branch_name: b.branch_name,
      branch_code: b.branch_code,
      amount: b.collections,
    }));

    const outstanding_by_branch = branchPerformances.map((b) => ({
      branch_name: b.branch_name,
      branch_code: b.branch_code,
      amount: b.outstanding_udhari,
    }));

    const gross_profit_by_branch = branchPerformances.map((b) => ({
      branch_name: b.branch_name,
      branch_code: b.branch_code,
      amount: b.gross_profit,
    }));

    // Sales Trend: timeline across dateRange
    const sales_trend: SalesTrendPoint[] = [];
    const isSingleDay = options.startDate === options.endDate;

    if (isSingleDay) {
      sales_trend.push({
        date: options.startDate,
        label: formatIndianDate(options.startDate),
        sales: totalSales,
        invoice_sales: invoiceSales,
        counter_sales: counterSales,
        transactions: totalTransactions,
      });
    } else {
      // Generate daily timeline points between startDate and endDate
      const cur = new Date(options.startDate);
      const end = new Date(options.endDate);

      while (cur <= end) {
        const dStr = cur.toISOString().split('T')[0];

        let dInv = 0;
        let dCs = 0;
        let dTx = 0;

        allInvoices.forEach((inv: any) => {
          const invD = (inv.date || inv.createdAt || '').split('T')[0];
          if (invD === dStr) {
            dInv += Number(inv.grand_total ?? inv.grandTotal ?? 0);
            dTx += 1;
          }
        });

        allCounterSales.forEach((cs: any) => {
          const csD = (cs.sale_date ?? cs.saleDate ?? cs.created_at ?? '').split('T')[0];
          if (csD === dStr) {
            dCs += Number(cs.final_total ?? cs.finalTotal ?? 0);
            dTx += 1;
          }
        });

        sales_trend.push({
          date: dStr,
          label: formatIndianDate(dStr),
          sales: Math.round((dInv + dCs) * 100) / 100,
          invoice_sales: Math.round(dInv * 100) / 100,
          counter_sales: Math.round(dCs * 100) / 100,
          transactions: dTx,
        });

        cur.setDate(cur.getDate() + 1);
      }
    }

    const result: OrganizationAnalytics = {
      organization_id: wsId,
      organization_name: 'All Branches',
      start_date: options.startDate,
      end_date: options.endDate,
      total_sales: totalSales,
      invoice_sales: invoiceSales,
      counter_sales: counterSales,
      collections,
      cash_collections: cashCollections,
      upi_collections: upiCollections,
      gross_profit: grossProfit,
      outstanding_udhari: outstandingUdhari,
      total_transactions: totalTransactions,
      total_discounts: Math.round(orgTotalDiscounts * 100) / 100,
      total_invoices: totalInvoices,
      total_counter_sales: totalCounterSales,
      branch_performance: branchPerformances,
      sales_trend,
      sales_by_branch,
      collections_by_branch,
      outstanding_by_branch,
      gross_profit_by_branch,
    };

    this.orgAnalyticsCache.set(cacheKey, { data: result, timestamp: now });
    return result;
  }
}

export const analyticsService = new AnalyticsService();
