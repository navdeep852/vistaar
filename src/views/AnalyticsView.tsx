import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Calendar,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Receipt,
  Scale,
  CreditCard,
  PieChart,
  BarChart3,
  ArrowUpRight,
} from 'lucide-react';
import {
  DatePresetType,
  ResolvedDateRange,
  resolveDateRange,
  getIstTodayString,
  formatReportingPeriodSubtitle,
  formatIndianDate,
} from '../lib/dateRange';
import { formatInr } from '../lib/currency';
import {
  enterpriseAnalyticsService,
  EnterpriseAnalyticsData,
} from '../services/supabase/enterpriseAnalyticsService';
import {
  SalesTrendChart,
  SalesChannelChart,
  ReceivablesAgingChart,
  TopProductsChart,
  ProfitabilityChart,
  InventoryHealthChart,
  QuotationFunnelChart,
  ExpenseAnalysisChart,
} from '../components/analytics/AnalyticsCharts';

interface AnalyticsViewProps {
  onNavigateTab: (tab: string, extraParam?: string) => void;
}

const STORAGE_KEY_ANALYTICS_PRESET = 'vistaar_analytics_filter_preset';
const STORAGE_KEY_ANALYTICS_START = 'vistaar_analytics_filter_start';
const STORAGE_KEY_ANALYTICS_END = 'vistaar_analytics_filter_end';

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ onNavigateTab }) => {
  // Global Analytics Date Filter State (reusing centralized Date resolution)
  const [rangePreset, setRangePreset] = useState<DatePresetType>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY_ANALYTICS_PRESET);
      if (saved && ['today', 'yesterday', 'week', 'month', 'custom'].includes(saved)) {
        return saved as DatePresetType;
      }
    } catch {
      // ignore
    }
    return 'today';
  });

  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_ANALYTICS_START) || getIstTodayString();
    } catch {
      return getIstTodayString();
    }
  });

  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_ANALYTICS_END) || getIstTodayString();
    } catch {
      return getIstTodayString();
    }
  });

  // Authoritative Resolved Date Range
  const dateRange: ResolvedDateRange = resolveDateRange(rangePreset, customStartDate, customEndDate);

  // Sync filter to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_ANALYTICS_PRESET, rangePreset);
      sessionStorage.setItem(STORAGE_KEY_ANALYTICS_START, customStartDate);
      sessionStorage.setItem(STORAGE_KEY_ANALYTICS_END, customEndDate);
    } catch {
      // ignore
    }
  }, [rangePreset, customStartDate, customEndDate]);

  // Analytics Data & Loading State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EnterpriseAnalyticsData | null>(null);

  const loadAnalytics = useCallback(async (forceFresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await enterpriseAnalyticsService.getAnalyticsOverview(dateRange, forceFresh);
      setData(res);
    } catch (err: any) {
      console.error('[AnalyticsView] Failed to compute enterprise analytics:', err);
      setError(err?.message || 'Unable to load enterprise analytics. Please check network and database connectivity.');
    } finally {
      setLoading(false);
    }
  }, [dateRange.rangeType, dateRange.startDateStr, dateRange.endDateStr]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return (
    <div className="space-y-6 sm:space-y-7 animate-fade-in pb-16">
      {/* ========================================================================= */}
      {/* 1. ANALYTICS HEADER & NAVIGATION TOOLBAR                                  */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateTab('dashboard')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold text-xs transition-colors shadow-xs"
            title="Return to Executive Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Enterprise Analytics
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                Live Insights
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Business intelligence & multi-channel performance
            </p>
          </div>
        </div>

        {/* Global Reporting Period Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 self-stretch md:self-auto">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
              { id: 'custom', label: 'Custom Range' },
            ].map((btn) => {
              const isActive = rangePreset === btn.id;
              return (
                <button
                  key={btn.id}
                  onClick={() => setRangePreset(btn.id as DatePresetType)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-xs shadow-blue-600/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => loadAnalytics(true)}
            disabled={loading}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 self-end sm:self-auto"
            title="Refresh Analytics Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Compact Custom Range Date Selector */}
      {rangePreset === 'custom' && (
        <div className="bg-white dark:bg-slate-900 p-3 sm:px-5 sm:py-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs animate-fade-in flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Custom Scope:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {formatIndianDate(dateRange.startDateStr)} – {formatIndianDate(dateRange.endDateStr)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">From:</span>
              <input
                type="date"
                value={customStartDate}
                max={customEndDate || undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomStartDate(val);
                  if (customEndDate && val > customEndDate) setCustomEndDate(val);
                }}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-blue-500 outline-none text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">To:</span>
              <input
                type="date"
                value={customEndDate}
                min={customStartDate || undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomEndDate(val);
                  if (customStartDate && val < customStartDate) setCustomStartDate(val);
                }}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-blue-500 outline-none text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between gap-3 text-rose-800 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-xs font-bold">Unable to load Analytics</p>
              <p className="text-[11px] opacity-90">{error}</p>
            </div>
          </div>
          <button
            onClick={() => loadAnalytics(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. ANALYTICS KPI SUMMARY ROW (Strictly Consistent with Dashboard)         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* TOTAL SALES */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Sales
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            {loading ? (
              <div className="h-8 w-28 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {formatInr(data?.kpis.totalSales ?? 0)}
              </h3>
            )}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <span>Invoices + Counter Sales</span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold">{dateRange.periodBadge}</span>
          </div>
        </div>

        {/* COLLECTIONS */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Collections
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            {loading ? (
              <div className="h-8 w-28 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
                {formatInr(data?.kpis.collections ?? 0)}
              </h3>
            )}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <span>Cash + UPI Inflows</span>
            <span className="text-emerald-600 font-semibold">Realized</span>
          </div>
        </div>

        {/* GROSS PROFIT */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Gross Profit
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            {loading ? (
              <div className="h-8 w-28 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {formatInr(data?.kpis.grossProfit ?? 0)}
              </h3>
            )}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <span>Margin: {data?.kpis.profitMarginPercent ?? 0}%</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Sales − COGS</span>
          </div>
        </div>

        {/* OUTSTANDING UDHARI */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors flex flex-col justify-between min-h-[140px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Outstanding Udhari
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            {loading ? (
              <div className="h-8 w-28 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
                {formatInr(data?.kpis.outstandingUdhari ?? 0)}
              </h3>
            )}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <span>Customer Receivables</span>
            <button
              onClick={() => onNavigateTab('udhari')}
              className="text-amber-600 hover:underline font-semibold"
            >
              Ledgers →
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. FULL-WIDTH SALES TREND CHART                                           */}
      {/* ========================================================================= */}
      {loading ? (
        <div className="h-72 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
      ) : data ? (
        <SalesTrendChart
          points={data.salesTrend.points}
          granularity={data.salesTrend.granularity}
          totalSales={data.salesTrend.totalSales}
          peakSales={data.salesTrend.peakSales}
          peakLabel={data.salesTrend.peakLabel}
        />
      ) : null}

      {/* ========================================================================= */}
      {/* 4. 2-COLUMN CHART GRID                                                    */}
      {/* ========================================================================= */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="h-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="h-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="h-80 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Row 1: Sales by Channel & Receivables Aging */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SalesChannelChart
              totalInvoiceSales={data.channelBreakdown.totalInvoiceSales}
              totalCounterSales={data.channelBreakdown.totalCounterSales}
              invoicePercentage={data.channelBreakdown.invoicePercentage}
              counterPercentage={data.channelBreakdown.counterPercentage}
              points={data.channelBreakdown.points}
              onDrillDown={(ch) => onNavigateTab(ch)}
            />

            <ReceivablesAgingChart
              totalOutstanding={data.receivablesAging.totalOutstanding}
              overdueAmount={data.receivablesAging.overdueAmount}
              buckets={data.receivablesAging.buckets}
              onDrillDown={() => onNavigateTab('udhari')}
            />
          </div>

          {/* Row 2: Top Selling Products & Inventory Health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopProductsChart
              byValue={data.topProducts.byValue}
              byQuantity={data.topProducts.byQuantity}
              onDrillDown={() => onNavigateTab('products')}
            />

            <InventoryHealthChart
              metrics={data.inventoryHealth}
              onDrillDown={() => onNavigateTab('stock')}
            />
          </div>

          {/* Row 3: Profitability & Quotation Conversion Funnel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProfitabilityChart
              totalRevenue={data.profitability.totalRevenue}
              totalCogs={data.profitability.totalCogs}
              totalGrossProfit={data.profitability.totalGrossProfit}
              totalExpenses={data.profitability.totalExpenses}
              totalNetProfit={data.profitability.totalNetProfit}
              overallMarginPercent={data.profitability.overallMarginPercent}
              points={data.profitability.points}
            />

            <QuotationFunnelChart
              conversionRatePercent={data.quotationFunnel.conversionRatePercent}
              stages={data.quotationFunnel.stages}
              totalQuotations={data.quotationFunnel.totalQuotations}
              convertedCount={data.quotationFunnel.convertedCount}
              convertedValue={data.quotationFunnel.convertedValue}
              onDrillDown={() => onNavigateTab('quotations')}
            />
          </div>

          {/* Row 4: Expense Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ExpenseAnalysisChart
              totalExpenses={data.expenseAnalysis.totalExpenses}
              categories={data.expenseAnalysis.categories}
              onDrillDown={() => onNavigateTab('expenses')}
            />

            {/* Quick Analytics Summary & Export Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-xs transition-colors space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Executive Summary & Takeaways
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Automated high-level business intelligence signals
                </p>
              </div>

              <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">Gross Margin Health: </span>
                    <span>Your business generated a {data.kpis.profitMarginPercent}% gross margin on {formatInr(data.kpis.totalSales)} total sales.</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">Receivables Watch: </span>
                    <span>{formatInr(data.kpis.outstandingUdhari)} outstanding across customer ledgers with {data.receivablesAging.overdueAmount > 0 ? `${formatInr(data.receivablesAging.overdueAmount)} overdue.` : 'zero overdue balance.'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100">Quotation Pipeline: </span>
                    <span>{data.quotationFunnel.conversionRatePercent}% conversion rate with {data.quotationFunnel.convertedCount} estimates successfully converted to billing invoices.</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400">All data reconciled across ledgers</span>
                <button
                  onClick={() => onNavigateTab('reports')}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>Detailed Reports</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
