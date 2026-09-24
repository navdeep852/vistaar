import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage } from './safeStorage';
import { ResolvedDateRange, resolveDateRange, formatFriendlyDate, formatIndianDate, addDays } from '../../lib/dateRange';
import { salesAnalyticsService } from './salesAnalyticsService';
import { udhariService } from './udhariService';
import { quotationService } from './quotationService';
import { financialStatementService } from '../financialStatementService';
import { store } from '../store';
import { Invoice, Product, Expense } from '../../types';

export interface AnalyticsKPIs {
  totalSales: number;
  collections: number;
  cashCollections: number;
  upiCollections: number;
  grossProfit: number;
  outstandingUdhari: number;
  profitMarginPercent: number;
}

export interface TrendDataPoint {
  label: string;
  fullDate?: string;
  sales: number;
  invoices: number;
  counterSales: number;
  invoiceCount: number;
  counterCount: number;
}

export interface ChannelDataPoint {
  periodLabel: string;
  invoiceSales: number;
  counterSales: number;
  totalSales: number;
}

export interface AgingBucket {
  label: string;
  amount: number;
  count: number;
  color: string;
  percentage: number;
}

export interface ProductPerformanceItem {
  id: string;
  name: string;
  sku?: string;
  salesValue: number;
  quantitySold: number;
  category?: string;
}

export interface ProfitabilityDataPoint {
  periodLabel: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  marginPercent: number;
}

export interface InventoryHealthMetrics {
  healthyCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalCount: number;
  criticalItems: Array<{
    id: string;
    name: string;
    sku: string;
    currentStock: number;
    minimumStock: number;
    unit: string;
  }>;
}

export interface QuotationFunnelStage {
  stage: string;
  count: number;
  value: number;
  percentage: number;
}

export interface ExpenseCategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface EnterpriseAnalyticsData {
  kpis: AnalyticsKPIs;
  salesTrend: {
    granularity: 'hourly' | 'daily' | 'weekly' | 'monthly';
    points: TrendDataPoint[];
    totalSales: number;
    peakSales: number;
    peakLabel: string;
  };
  channelBreakdown: {
    totalInvoiceSales: number;
    totalCounterSales: number;
    invoicePercentage: number;
    counterPercentage: number;
    points: ChannelDataPoint[];
  };
  receivablesAging: {
    totalOutstanding: number;
    overdueAmount: number;
    buckets: AgingBucket[];
  };
  topProducts: {
    byValue: ProductPerformanceItem[];
    byQuantity: ProductPerformanceItem[];
  };
  profitability: {
    totalRevenue: number;
    totalCogs: number;
    totalGrossProfit: number;
    totalExpenses: number;
    totalNetProfit: number;
    overallMarginPercent: number;
    points: ProfitabilityDataPoint[];
  };
  inventoryHealth: InventoryHealthMetrics;
  quotationFunnel: {
    conversionRatePercent: number;
    stages: QuotationFunnelStage[];
    totalQuotations: number;
    convertedCount: number;
    convertedValue: number;
  };
  expenseAnalysis: {
    totalExpenses: number;
    categories: ExpenseCategoryBreakdown[];
  };
}

const LOCAL_INVOICES_KEY = 'vistaar_local_invoices_db';
const LOCAL_SALES_KEY = 'vistaar_local_counter_sales_db';
const LOCAL_PAYMENTS_KEY = 'vistaar_local_payments_db';

export class EnterpriseAnalyticsService {
  private async getWorkspaceId(): Promise<string> {
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e) {
      console.warn('Failed to get authoritative workspace ID in enterpriseAnalyticsService:', e);
    }
    return supabaseAuthService.getCurrentCompanyId() || '';
  }

  public async getAnalyticsOverview(
    dateRange: ResolvedDateRange,
    forceFresh = false
  ): Promise<EnterpriseAnalyticsData> {
    const wsId = await this.getWorkspaceId();

    // 1. Fetch Authoritative Dashboard Sales Metrics & Raw Invoices / Counter Sales (Read-Only)
    const [salesMetricsRes, udhariMetricsRes, quotationsRes] = await Promise.all([
      salesAnalyticsService.getSalesMetrics(dateRange, forceFresh, wsId),
      udhariService.getAuthoritativeUdhariMetricsAsOf(dateRange.endDateStr, wsId),
      quotationService.getQuotations(),
    ]);

    // Fetch Invoices with Items, Counter Sales with Items, Payments, Products, and Expenses (Strictly Read-Only)
    let invoices: any[] = [];
    let counterSales: any[] = [];
    let payments: any[] = [];
    let productsList: any[] = [];
    let expensesList: any[] = [];

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const [invRes, csRes, payRes, prodRes, expRes] = await Promise.all([
          supabase
            .from('invoices')
            .select('*, invoice_items(*)')
            .eq('workspace_id', wsId)
            .in('status', ['Issued', 'Partially Paid', 'Paid'])
            .gte('date', dateRange.startDateStr)
            .lte('date', dateRange.endDateStr),
          supabase
            .from('counter_sales')
            .select('*, counter_sale_items(*)')
            .eq('workspace_id', wsId)
            .eq('status', 'COMPLETED')
            .gte('sale_date', dateRange.startDateStr)
            .lte('sale_date', dateRange.endDateStr),
          supabase
            .from('payments')
            .select('*')
            .eq('workspace_id', wsId)
            .gte('payment_date', dateRange.startDateStr)
            .lte('payment_date', dateRange.endDateStr),
          supabase
            .from('products')
            .select('*')
            .eq('workspace_id', wsId),
          supabase
            .from('expenses')
            .select('*')
            .eq('workspace_id', wsId)
            .gte('expense_date', dateRange.startDateStr)
            .lte('expense_date', dateRange.endDateStr),
        ]);

        if (invRes.data) invoices = invRes.data;
        if (csRes.data) counterSales = csRes.data;
        if (payRes.data) payments = payRes.data;
        if (prodRes.data) productsList = prodRes.data;
        if (expRes.data) expensesList = expRes.data;
      } catch (err) {
        console.warn('[enterpriseAnalyticsService] Supabase query notice:', err);
      }
    }

    // Read-only fallback to local store/storage if Supabase offline or empty
    if (productsList.length === 0) {
      productsList = store.getProducts() || [];
    }
    if (expensesList.length === 0) {
      const localExps = store.getExpenses() || [];
      expensesList = localExps.filter((exp: any) => {
        const d = (exp.date || exp.expense_date || exp.createdAt || '').split('T')[0];
        return d >= dateRange.startDateStr && d <= dateRange.endDateStr;
      });
    }

    // Fallback to local storage / memory if empty or offline
    if (invoices.length === 0) {
      const localInvoices: Invoice[] = store.getInvoices().length > 0
        ? store.getInvoices()
        : safeGetTenantStorage<Invoice>(LOCAL_INVOICES_KEY, []);

      invoices = localInvoices.filter((inv) => {
        if (inv.status === 'Draft' || inv.status === 'Cancelled') return false;
        const d = (inv.date || inv.createdAt || '').split('T')[0];
        return d >= dateRange.startDateStr && d <= dateRange.endDateStr;
      });
    }

    if (counterSales.length === 0) {
      const localCS = store.getCounterSales().length > 0
        ? store.getCounterSales()
        : safeGetTenantStorage<any>(LOCAL_SALES_KEY, []);
      counterSales = localCS.filter((cs: any) => {
        if (cs.status === 'CANCELLED') return false;
        const d = (cs.sale_date ?? cs.saleDate ?? cs.created_at ?? '').split('T')[0];
        return d >= dateRange.startDateStr && d <= dateRange.endDateStr;
      });
    }

    if (payments.length === 0) {
      const localPayments = store.getPayments().length > 0
        ? store.getPayments()
        : safeGetTenantStorage<any>(LOCAL_PAYMENTS_KEY, []);
      payments = localPayments.filter((p: any) => {
        const d = (p.date || p.payment_date || p.createdAt || '').split('T')[0];
        return d >= dateRange.startDateStr && d <= dateRange.endDateStr;
      });
    }

    // De-duplication: Track seen counter sales invoice numbers
    const seenCounterInvoiceNumbers = new Set<string>();
    counterSales.forEach((cs) => {
      const num = cs.invoice_number || cs.invoiceNumber || cs.sale_number || cs.saleNumber;
      if (num) seenCounterInvoiceNumbers.add(String(num).trim().toLowerCase());
    });

    // -------------------------------------------------------------
    // CHART 1: SALES TREND (Adaptive Granularity)
    // -------------------------------------------------------------
    const isSingleDay = dateRange.startDateStr === dateRange.endDateStr;
    const diffDays = Math.max(1, Math.round(
      (new Date(dateRange.endDateStr).getTime() - new Date(dateRange.startDateStr).getTime()) / (86400000)
    ) + 1);

    let granularity: 'hourly' | 'daily' | 'weekly' | 'monthly' = 'daily';
    if (isSingleDay) {
      granularity = 'hourly';
    } else if (diffDays > 35) {
      granularity = 'monthly';
    } else if (diffDays > 14) {
      granularity = 'weekly';
    } else {
      granularity = 'daily';
    }

    const trendMap = new Map<string, { label: string; fullDate?: string; sales: number; invoices: number; counterSales: number; invoiceCount: number; counterCount: number }>();

    if (granularity === 'hourly') {
      // Setup business hours (8 AM through 9 PM)
      for (let h = 8; h <= 21; h++) {
        const hLabel = h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
        const key = String(h).padStart(2, '0');
        trendMap.set(key, {
          label: hLabel,
          fullDate: dateRange.startDateStr,
          sales: 0,
          invoices: 0,
          counterSales: 0,
          invoiceCount: 0,
          counterCount: 0,
        });
      }

      // Map Invoices by created_at hour
      invoices.forEach((inv) => {
        const num = String(inv.invoice_number ?? inv.invoiceNumber ?? '').trim().toLowerCase();
        if (num && seenCounterInvoiceNumbers.has(num)) return;

        const timeStr = inv.created_at || inv.createdAt || `${inv.date}T10:00:00`;
        const hour = new Date(timeStr).getHours();
        const key = String(hour).padStart(2, '0');
        const entry = trendMap.get(key) || {
          label: hour > 12 ? `${hour - 12} PM` : `${hour} AM`,
          sales: 0,
          invoices: 0,
          counterSales: 0,
          invoiceCount: 0,
          counterCount: 0,
        };
        const total = Number(inv.grand_total ?? inv.grandTotal ?? 0);
        entry.sales += total;
        entry.invoices += total;
        entry.invoiceCount += 1;
        trendMap.set(key, entry);
      });

      // Map Counter Sales by created_at hour
      counterSales.forEach((cs) => {
        const timeStr = cs.created_at || cs.createdAt || `${cs.sale_date}T11:00:00`;
        const hour = new Date(timeStr).getHours();
        const key = String(hour).padStart(2, '0');
        const entry = trendMap.get(key) || {
          label: hour > 12 ? `${hour - 12} PM` : `${hour} AM`,
          sales: 0,
          invoices: 0,
          counterSales: 0,
          invoiceCount: 0,
          counterCount: 0,
        };
        const total = Number(cs.final_total ?? cs.finalTotal ?? 0);
        entry.sales += total;
        entry.counterSales += total;
        entry.counterCount += 1;
        trendMap.set(key, entry);
      });
    } else {
      // Daily, Weekly, or Monthly buckets (Guarded timestamp traversal with hard iteration cap)
      const [sy, sm, sd] = (dateRange.startDateStr || '').split('-').map(Number);
      const [ey, em, ed] = (dateRange.endDateStr || '').split('-').map(Number);
      const startMs = new Date(Date.UTC(sy || 2026, (sm || 1) - 1, sd || 1)).getTime();
      const endMs = new Date(Date.UTC(ey || 2026, (em || 1) - 1, ed || 1)).getTime();

      let guard = 0;
      if (!isNaN(startMs) && !isNaN(endMs) && startMs <= endMs) {
        const dayFormatter = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short' });
        let curMs = startMs;
        while (curMs <= endMs && guard++ < 1000) {
          const curObj = new Date(curMs);
          const yStr = curObj.getUTCFullYear();
          const mStr = String(curObj.getUTCMonth() + 1).padStart(2, '0');
          const dStr = String(curObj.getUTCDate()).padStart(2, '0');
          const curDateKey = `${yStr}-${mStr}-${dStr}`;
          const dayLabel = dayFormatter.format(curObj);

          trendMap.set(curDateKey, {
            label: dayLabel,
            fullDate: curDateKey,
            sales: 0,
            invoices: 0,
            counterSales: 0,
            invoiceCount: 0,
            counterCount: 0,
          });

          curMs += 86400000; // Exact 24-hour increment in UTC ms
        }
      }

      invoices.forEach((inv) => {
        const num = String(inv.invoice_number ?? inv.invoiceNumber ?? '').trim().toLowerCase();
        if (num && seenCounterInvoiceNumbers.has(num)) return;

        const invDate = (inv.date || inv.createdAt || '').split('T')[0];
        if (trendMap.has(invDate)) {
          const entry = trendMap.get(invDate)!;
          const total = Number(inv.grand_total ?? inv.grandTotal ?? 0);
          entry.sales += total;
          entry.invoices += total;
          entry.invoiceCount += 1;
        }
      });

      counterSales.forEach((cs) => {
        const csDate = (cs.sale_date ?? cs.saleDate ?? cs.created_at ?? '').split('T')[0];
        if (trendMap.has(csDate)) {
          const entry = trendMap.get(csDate)!;
          const total = Number(cs.final_total ?? cs.finalTotal ?? 0);
          entry.sales += total;
          entry.counterSales += total;
          entry.counterCount += 1;
        }
      });
    }

    const trendPoints = Array.from(trendMap.values());
    let peakSales = 0;
    let peakLabel = '';
    trendPoints.forEach((p) => {
      if (p.sales > peakSales) {
        peakSales = p.sales;
        peakLabel = p.label;
      }
    });

    // -------------------------------------------------------------
    // CHART 2: SALES BY CHANNEL (Stacked Bar Points)
    // -------------------------------------------------------------
    const totalInvoiceSales = salesMetricsRes.invoiceSales;
    const totalCounterSales = salesMetricsRes.counterSales;
    const totalCombinedSales = Math.max(0.01, salesMetricsRes.totalSales);

    const invoicePercentage = Math.round((totalInvoiceSales / totalCombinedSales) * 100);
    const counterPercentage = Math.round((totalCounterSales / totalCombinedSales) * 100);

    const channelPoints: ChannelDataPoint[] = trendPoints.slice(0, 10).map((p) => ({
      periodLabel: p.label,
      invoiceSales: p.invoices,
      counterSales: p.counterSales,
      totalSales: p.sales,
    }));

    // -------------------------------------------------------------
    // CHART 3: RECEIVABLES / UDHARI AGING
    // -------------------------------------------------------------
    const udhariRecords = (await udhariService.getUdhariRecords()).data || [];
    const targetDate = dateRange.endDateStr;

    let bucket0_30 = 0;
    let bucket31_60 = 0;
    let bucket61_90 = 0;
    let bucket90Plus = 0;
    let count0_30 = 0;
    let count31_60 = 0;
    let count61_90 = 0;
    let count90Plus = 0;

    const targetTime = new Date(targetDate).getTime();

    for (const r of udhariRecords) {
      const cDateStr = (r.createdAt || r.created_at || '').split('T')[0];
      if (cDateStr && cDateStr > targetDate) continue;

      const orig = Number(r.originalAmount || r.original_amount || 0);
      const currentOutstanding = Number(r.outstandingAmount || r.outstanding_amount || 0);
      const paymentsList = Array.isArray(r.payments) ? r.payments : [];

      let balAsOf = currentOutstanding;
      if (targetDate < new Date().toISOString().split('T')[0]) {
        let paymentsAfter = 0;
        for (const p of paymentsList) {
          const pDate = (p.payment_date || p.paymentDate || p.created_at || '').split('T')[0];
          if (pDate && pDate > targetDate) paymentsAfter += Number(p.amount || 0);
        }
        balAsOf = Math.min(orig, currentOutstanding + paymentsAfter);
      }

      if (balAsOf > 0.01) {
        const recordTime = new Date(cDateStr || targetDate).getTime();
        const daysOld = Math.max(0, Math.floor((targetTime - recordTime) / (86400000)));

        if (daysOld <= 30) {
          bucket0_30 += balAsOf;
          count0_30 += 1;
        } else if (daysOld <= 60) {
          bucket31_60 += balAsOf;
          count31_60 += 1;
        } else if (daysOld <= 90) {
          bucket61_90 += balAsOf;
          count61_90 += 1;
        } else {
          bucket90Plus += balAsOf;
          count90Plus += 1;
        }
      }
    }

    const totalAgingAmount = bucket0_30 + bucket31_60 + bucket61_90 + bucket90Plus || udhariMetricsRes.outstanding;
    const safeTotalAging = Math.max(0.01, totalAgingAmount);

    const agingBuckets: AgingBucket[] = [
      {
        label: '0–30 Days',
        amount: Math.round(bucket0_30),
        count: count0_30,
        color: '#10b981', // emerald-500
        percentage: Math.round((bucket0_30 / safeTotalAging) * 100),
      },
      {
        label: '31–60 Days',
        amount: Math.round(bucket31_60),
        count: count31_60,
        color: '#f59e0b', // amber-500
        percentage: Math.round((bucket31_60 / safeTotalAging) * 100),
      },
      {
        label: '61–90 Days',
        amount: Math.round(bucket61_90),
        count: count61_90,
        color: '#f97316', // orange-500
        percentage: Math.round((bucket61_90 / safeTotalAging) * 100),
      },
      {
        label: '90+ Days',
        amount: Math.round(bucket90Plus),
        count: count90Plus,
        color: '#ef4444', // rose-500
        percentage: Math.round((bucket90Plus / safeTotalAging) * 100),
      },
    ];

    // -------------------------------------------------------------
    // CHART 4: TOP SELLING PRODUCTS
    // -------------------------------------------------------------
    const productAggregation = new Map<string, { id: string; name: string; sku?: string; salesValue: number; quantitySold: number }>();

    // Aggregate from Invoices
    invoices.forEach((inv) => {
      const num = String(inv.invoice_number ?? inv.invoiceNumber ?? '').trim().toLowerCase();
      if (num && seenCounterInvoiceNumbers.has(num)) return;

      const items = inv.invoice_items || inv.items || [];
      items.forEach((item: any) => {
        const name = item.product_name || item.productName || 'Product';
        const id = item.product_id || item.productId || name;
        const q = Number(item.quantity || 0);
        const v = Number(item.total || item.amount || (q * (item.selling_price || item.sellingPrice || 0)));

        const existing = productAggregation.get(id) || {
          id,
          name,
          sku: item.sku || item.partNumber,
          salesValue: 0,
          quantitySold: 0,
        };
        existing.salesValue += v;
        existing.quantitySold += q;
        productAggregation.set(id, existing);
      });
    });

    // Aggregate from Counter Sales
    counterSales.forEach((cs) => {
      const items = cs.counter_sale_items || cs.items || [];
      items.forEach((item: any) => {
        const name = item.product_name_snapshot || item.productNameSnapshot || 'Product';
        const id = item.product_id || item.productId || name;
        const q = Number(item.quantity || 0);
        const v = Number(item.amount || (q * (item.rate || 0)));

        const existing = productAggregation.get(id) || {
          id,
          name,
          sku: item.part_number_snapshot || item.partNumberSnapshot,
          salesValue: 0,
          quantitySold: 0,
        };
        existing.salesValue += v;
        existing.quantitySold += q;
        productAggregation.set(id, existing);
      });
    });

    const allAggregatedProducts = Array.from(productAggregation.values());
    const topByValue = [...allAggregatedProducts].sort((a, b) => b.salesValue - a.salesValue).slice(0, 10);
    const topByQuantity = [...allAggregatedProducts].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 10);

    // -------------------------------------------------------------
    // CHART 5: PROFITABILITY (Revenue vs COGS vs Gross Profit - Shared Authoritative Layer)
    // -------------------------------------------------------------
    const periodFinancials = financialStatementService.computePeriodFinancials(dateRange, {
      invoices,
      counterSales,
      expenses: expensesList,
      products: productsList,
    });

    const totalCogs = periodFinancials.cogs.totalCogs;
    const totalRevenue = salesMetricsRes.totalSales;
    const totalGrossProfit = periodFinancials.grossProfit.grossProfit;
    const totalExpenseAmount = periodFinancials.operatingExpenses.totalExpenses;
    const totalNetProfit = periodFinancials.netProfit.netProfit;
    const overallMarginPercent = periodFinancials.grossProfit.grossMarginPercent;

    // Build trend profitability points from shared calculation
    const profitabilityPoints: ProfitabilityDataPoint[] = periodFinancials.trend.slice(0, 10).map((p) => ({
      periodLabel: p.label,
      revenue: p.revenue,
      cogs: p.cogs,
      grossProfit: p.grossProfit,
      expenses: p.expenses,
      netProfit: p.netProfit,
      marginPercent: p.marginPercent,
    }));

    // -------------------------------------------------------------
    // CHART 6: INVENTORY HEALTH
    // -------------------------------------------------------------
    const allProducts: Product[] = productsList;
    let healthyCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const criticalCandidates: Array<{
      id: string;
      name: string;
      sku: string;
      currentStock: number;
      minimumStock: number;
      unit: string;
    }> = [];

    allProducts.forEach((p: any) => {
      const current = Number(p.currentStock ?? p.current_stock ?? 0);
      const min = Number(p.minimumStock ?? p.minimum_stock ?? 5);

      if (current <= 0) {
        outOfStockCount += 1;
        criticalCandidates.push({
          id: p.id,
          name: p.name,
          sku: p.sku || 'SKU',
          currentStock: current,
          minimumStock: min,
          unit: p.unit || 'pcs',
        });
      } else if (current <= min) {
        lowStockCount += 1;
        criticalCandidates.push({
          id: p.id,
          name: p.name,
          sku: p.sku || 'SKU',
          currentStock: current,
          minimumStock: min,
          unit: p.unit || 'pcs',
        });
      } else {
        healthyCount += 1;
      }
    });

    const criticalItems = criticalCandidates.sort((a, b) => a.currentStock - b.currentStock).slice(0, 5);

    // -------------------------------------------------------------
    // CHART 7: QUOTATION CONVERSION FUNNEL
    // -------------------------------------------------------------
    const remoteQuotations = Array.isArray(quotationsRes?.data) ? quotationsRes.data : [];
    const localQuotations = store.getQuotations() || [];

    const quotationMap = new Map<string, any>();
    // 1. Seed local store quotations
    localQuotations.forEach((q) => {
      const key = (q.quotationNumber || q.id || '').trim();
      if (key) quotationMap.set(key, q);
      if (q.id) quotationMap.set(q.id, q);
    });

    // 2. Overlay remote quotations with preference for Converted state
    remoteQuotations.forEach((rq: any) => {
      const key = (rq.quotation_number || rq.quotationNumber || rq.id || '').trim();
      const existing = (key ? quotationMap.get(key) : null) || (rq.id ? quotationMap.get(rq.id) : null);
      const isConverted =
        rq.status === 'Converted' ||
        (existing && existing.status === 'Converted') ||
        Boolean(rq.converted_invoice_id || (existing && existing.convertedInvoiceId));

      if (existing) {
        const merged = {
          ...existing,
          ...rq,
          id: existing.id || rq.id,
          quotationNumber: rq.quotation_number || existing.quotationNumber,
          customerName: rq.customer_name || existing.customerName,
          customerPhone: rq.customer_phone || existing.customerPhone,
          customerEmail: rq.customer_email || existing.customerEmail,
          status: isConverted ? 'Converted' : (rq.status || existing.status),
          date: rq.date || existing.date,
          validUntil: rq.valid_until || existing.validUntil,
          grandTotal: Number(rq.grand_total ?? existing.grandTotal ?? 0),
          convertedInvoiceId: rq.converted_invoice_id || existing.convertedInvoiceId,
          convertedAt: existing.convertedAt || rq.updated_at || existing.updatedAt,
        };
        if (key) quotationMap.set(key, merged);
        if (rq.id) quotationMap.set(rq.id, merged);
      } else {
        const mapped = {
          ...rq,
          id: rq.id,
          quotationNumber: rq.quotation_number,
          customerName: rq.customer_name,
          customerPhone: rq.customer_phone,
          customerEmail: rq.customer_email,
          status: isConverted ? 'Converted' : (rq.status || 'Draft'),
          date: rq.date,
          validUntil: rq.valid_until,
          grandTotal: Number(rq.grand_total || 0),
          subtotal: Number(rq.subtotal || 0),
          discountTotal: Number(rq.discount_total || 0),
          taxTotal: Number(rq.tax_total || 0),
          convertedInvoiceId: rq.converted_invoice_id,
          items: rq.quotation_items || [],
        };
        if (key) quotationMap.set(key, mapped);
        if (rq.id) quotationMap.set(rq.id, mapped);
      }
    });

    const uniqueQuotations = Array.from(new Set(quotationMap.values()));

    const allQuotations = uniqueQuotations.filter((q: any) => {
      const rawDate = q.date || (q.created_at ? String(q.created_at).split('T')[0] : '') || (q.createdAt ? String(q.createdAt).split('T')[0] : '');
      const d = (rawDate || '').split('T')[0];
      return d >= dateRange.startDateStr && d <= dateRange.endDateStr;
    });

    const totalCreated = allQuotations.length;
    let sentCount = 0;
    let acceptedCount = 0;
    let convertedCount = 0;
    let paidCount = 0;
    let convertedValue = 0;

    // Fast O(1) invoice lookups across both period-scoped invoices and all store invoices
    const allInvoices = store.getInvoices() || [];
    const invoicesById = new Map<string, any>();
    const invoicesByQuotationId = new Map<string, any>();

    allInvoices.forEach((inv) => {
      if (inv.id) invoicesById.set(inv.id, inv);
      const qId = inv.quotationId;
      if (qId) invoicesByQuotationId.set(qId, inv);
    });

    invoices.forEach((inv) => {
      if (inv.id) invoicesById.set(inv.id, inv);
      const qId = inv.quotationId || inv.quotation_id;
      if (qId) invoicesByQuotationId.set(qId, inv);
    });

    allQuotations.forEach((q: any) => {
      const st = String(q.status || '').toLowerCase();
      const val = Number(q.grandTotal ?? q.grand_total ?? q.total ?? 0);

      if (['sent', 'viewed', 'accepted', 'converted'].includes(st)) sentCount += 1;
      if (['accepted', 'converted'].includes(st)) acceptedCount += 1;
      if (st === 'converted' || q.invoice_id || q.invoiceId || q.converted_invoice_id || q.convertedInvoiceId) {
        convertedCount += 1;
        convertedValue += val;
        // Check if converted invoice is paid via O(1) map
        const invId = q.invoice_id || q.invoiceId || q.converted_invoice_id || q.convertedInvoiceId;
        const matchingInv =
          (invId ? invoicesById.get(invId) : null) ||
          invoicesByQuotationId.get(q.id) ||
          (q.quotationNumber ? invoicesByQuotationId.get(q.quotationNumber) : null);
        if (
          matchingInv &&
          (matchingInv.status === 'Paid' ||
            (Number(matchingInv.paidAmount || matchingInv.paid_amount || 0) >=
              Number(matchingInv.grandTotal || matchingInv.grand_total || 0) &&
              Number(matchingInv.grandTotal || matchingInv.grand_total || 0) > 0))
        ) {
          paidCount += 1;
        }
      }
    });

    const conversionRatePercent = totalCreated > 0
      ? Math.round((convertedCount / totalCreated) * 1000) / 10
      : 0;

    const baseFunnel = Math.max(1, totalCreated);
    const funnelStages: QuotationFunnelStage[] = [
      {
        stage: 'Created',
        count: totalCreated,
        value: allQuotations.reduce((sum, q) => sum + Number(q.grandTotal ?? q.grand_total ?? q.total ?? 0), 0),
        percentage: 100,
      },
      {
        stage: 'Sent / Shared',
        count: Math.max(sentCount, convertedCount),
        value: 0,
        percentage: Math.round((Math.max(sentCount, convertedCount) / baseFunnel) * 100),
      },
      {
        stage: 'Accepted',
        count: Math.max(acceptedCount, convertedCount),
        value: 0,
        percentage: Math.round((Math.max(acceptedCount, convertedCount) / baseFunnel) * 100),
      },
      {
        stage: 'Converted to Invoice',
        count: convertedCount,
        value: convertedValue,
        percentage: Math.round((convertedCount / baseFunnel) * 100),
      },
      {
        stage: 'Fully Paid',
        count: paidCount,
        value: 0,
        percentage: Math.round((paidCount / baseFunnel) * 100),
      },
    ];

    // -------------------------------------------------------------
    // CHART 8: EXPENSE ANALYSIS BY CATEGORY (Shared Authoritative Layer)
    // -------------------------------------------------------------
    const expenseCategories: ExpenseCategoryBreakdown[] = periodFinancials.operatingExpenses.categories.map((c) => ({
      category: c.category,
      amount: c.amount,
      count: c.count,
      percentage: Math.round(c.percentage),
    }));

    // -------------------------------------------------------------
    // SUMMARY KPIS (Strictly Consistent with Dashboard & Ledgers)
    // -------------------------------------------------------------
    // Collections = Payments received in period + completed counter sale cash/upi
    let cashCollectionsVal = 0;
    let upiCollectionsVal = 0;

    // 1. Process customer/invoice/udhari payments received in this period
    payments.forEach((p) => {
      const totalAmt = Number(p.amount || 0);
      if (totalAmt <= 0) return;

      // Handle split payment if present on the record
      const splitCash = Number(p.cash_amount ?? p.cashAmount ?? 0);
      const splitUpi = Number(p.upi_amount ?? p.upiAmount ?? 0);

      if (splitCash > 0 || splitUpi > 0) {
        cashCollectionsVal += splitCash;
        upiCollectionsVal += splitUpi;
      } else {
        const method = String(p.payment_method || p.method || '').toLowerCase();
        if (method.includes('cash')) {
          cashCollectionsVal += totalAmt;
        } else {
          // UPI, Bank Transfer, Card, etc. attributed to UPI/Digital
          upiCollectionsVal += totalAmt;
        }
      }
    });

    // 2. Process counter sales in this period
    counterSales.forEach((cs) => {
      const method = String(cs.payment_method ?? cs.paymentMethod ?? '').toLowerCase();
      if (method.includes('credit') || method.includes('udhari')) {
        // Credit counter sale: no cash/upi collected upfront.
        // If cleared later, payment is recorded in `payments` on clearance date.
        return;
      }

      const rec = Number(cs.amount_received ?? cs.amountReceived ?? cs.final_total ?? cs.finalTotal ?? 0);
      if (rec <= 0) return;

      // Handle split payment if present on counter sale
      const splitCash = Number(cs.cash_amount ?? cs.cashAmount ?? 0);
      const splitUpi = Number(cs.upi_amount ?? cs.upiAmount ?? 0);

      if (splitCash > 0 || splitUpi > 0) {
        cashCollectionsVal += splitCash;
        upiCollectionsVal += splitUpi;
      } else {
        if (method.includes('cash')) {
          cashCollectionsVal += rec;
        } else {
          upiCollectionsVal += rec;
        }
      }
    });

    const roundedCash = Math.round(cashCollectionsVal);
    const roundedUpi = Math.round(upiCollectionsVal);
    const totalCollections = roundedCash + roundedUpi;

    const kpis: AnalyticsKPIs = {
      totalSales: salesMetricsRes.totalSales,
      collections: totalCollections,
      cashCollections: roundedCash,
      upiCollections: roundedUpi,
      grossProfit: totalGrossProfit,
      outstandingUdhari: udhariMetricsRes.outstanding,
      profitMarginPercent: overallMarginPercent,
    };

    return {
      kpis,
      salesTrend: {
        granularity,
        points: trendPoints,
        totalSales: salesMetricsRes.totalSales,
        peakSales,
        peakLabel,
      },
      channelBreakdown: {
        totalInvoiceSales,
        totalCounterSales,
        invoicePercentage,
        counterPercentage,
        points: channelPoints,
      },
      receivablesAging: {
        totalOutstanding: udhariMetricsRes.outstanding,
        overdueAmount: udhariMetricsRes.overdue,
        buckets: agingBuckets,
      },
      topProducts: {
        byValue: topByValue,
        byQuantity: topByQuantity,
      },
      profitability: {
        totalRevenue,
        totalCogs,
        totalGrossProfit,
        totalExpenses: totalExpenseAmount,
        totalNetProfit,
        overallMarginPercent,
        points: profitabilityPoints,
      },
      inventoryHealth: {
        healthyCount,
        lowStockCount,
        outOfStockCount,
        totalCount: allProducts.length,
        criticalItems,
      },
      quotationFunnel: {
        conversionRatePercent,
        stages: funnelStages,
        totalQuotations: totalCreated,
        convertedCount,
        convertedValue,
      },
      expenseAnalysis: {
        totalExpenses: totalExpenseAmount,
        categories: expenseCategories,
      },
    };
  }
}

export const enterpriseAnalyticsService = new EnterpriseAnalyticsService();
