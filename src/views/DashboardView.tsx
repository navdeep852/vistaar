import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  FileText,
  AlertTriangle,
  Plus,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Receipt,
  Scale,
  CalendarCheck,
  RefreshCw,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import { store } from '../services/store';
import { Product, Invoice, FollowUp } from '../types';
import {
  productService,
  salesAnalyticsService,
  SalesMetrics,
  udhariService,
  quotationService,
} from '../services/supabase';
import {
  DatePresetType,
  ResolvedDateRange,
  resolveDateRange,
  getIstTodayString,
  formatReportingPeriodSubtitle,
} from '../lib/dateRange';
import { formatInr, formatSafeCount } from '../lib/currency';

interface DashboardViewProps {
  setActiveTab: (tab: string) => void;
  openModal?: (modalType: string) => void;
}

const STORAGE_KEY_PRESET = 'vistaar_dashboard_filter_preset';
const STORAGE_KEY_START = 'vistaar_dashboard_filter_start';
const STORAGE_KEY_END = 'vistaar_dashboard_filter_end';

export const DashboardView: React.FC<DashboardViewProps> = ({
  setActiveTab,
  openModal,
}) => {
  // Global Date Filter State (Persisted across tab navigation)
  const [rangePreset, setRangePreset] = useState<DatePresetType>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY_PRESET);
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
      return sessionStorage.getItem(STORAGE_KEY_START) || getIstTodayString();
    } catch {
      return getIstTodayString();
    }
  });

  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_END) || getIstTodayString();
    } catch {
      return getIstTodayString();
    }
  });

  // Authoritative Resolved Date Range
  const dateRange: ResolvedDateRange = resolveDateRange(rangePreset, customStartDate, customEndDate);

  // Synchronize filter persistence to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY_PRESET, rangePreset);
      sessionStorage.setItem(STORAGE_KEY_START, customStartDate);
      sessionStorage.setItem(STORAGE_KEY_END, customEndDate);
    } catch {
      // ignore
    }
  }, [rangePreset, customStartDate, customEndDate]);

  // Dashboard Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [openQuotationsCount, setOpenQuotationsCount] = useState<number>(0);

  const [salesMetrics, setSalesMetrics] = useState<SalesMetrics>({
    totalSales: 0,
    todaySales: 0,
    thisMonthSales: 0,
    invoiceSales: 0,
    counterSales: 0,
    paidSales: 0,
    creditSales: 0,
    cashSales: 0,
    bankUpiSales: 0,
    totalTransactions: 0,
  });

  const [udhariMetrics, setUdhariMetrics] = useState<{
    outstanding: number;
    totalUdhari: number;
    totalReceived: number;
    overdue: number;
    activeCount: number;
  }>({
    outstanding: 0,
    totalUdhari: 0,
    totalReceived: 0,
    overdue: 0,
    activeCount: 0,
  });

  // Authoritative Data Fetching Pipeline
  const loadDashboardData = useCallback(async (forceFresh = false) => {
    setLoading(true);
    setError(null);

    try {
      // 1. Sales Metrics (Authoritative Invoices + Counter Sales for the resolved date range)
      const salesPromise = salesAnalyticsService.getSalesMetrics(dateRange, forceFresh);

      // 2. Outstanding Udhari (Point-in-time balance as of dateRange.endDateStr)
      const udhariPromise = udhariService.getAuthoritativeUdhariMetricsAsOf(dateRange.endDateStr);

      // 3. Open Quotations (Active/Open as of dateRange.endDateStr)
      const quotationsPromise = quotationService.getOpenQuotationsCountAsOf(dateRange.endDateStr);

      // 4. Low Stock Products (Stock <= minimumStock as of dateRange.endDateStr)
      const lowStockPromise = productService.getLowStockProductsAsOf(dateRange.endDateStr);

      const [smRes, umRes, qtRes, lsRes] = await Promise.all([
        salesPromise,
        udhariPromise,
        quotationsPromise,
        lowStockPromise,
      ]);

      setSalesMetrics(smRes);
      setUdhariMetrics(umRes);
      setOpenQuotationsCount(qtRes.count);
      setLowStockCount(lsRes.lowStockCount);
      setLowStockProducts(lsRes.lowStockProducts);

      // 5. Invoices & Follow-ups from Store
      setInvoices(store.getInvoices());
      setFollowUps(store.getFollowUps());
    } catch (err: any) {
      console.error('[DashboardView] Failed to load authoritative metrics:', err);
      setError(err?.message || 'Unable to load Dashboard metrics. Please verify network and database connectivity.');
    } finally {
      setLoading(false);
    }
  }, [dateRange.rangeType, dateRange.startDateStr, dateRange.endDateStr]);

  useEffect(() => {
    loadDashboardData();
    return store.subscribe(() => loadDashboardData());
  }, [loadDashboardData]);

  // Support manual refresh triggered via Header icon
  useEffect(() => {
    const handleManualRefresh = () => {
      loadDashboardData(true);
    };
    window.addEventListener('vistaar:refresh-dashboard', handleManualRefresh);
    return () => window.removeEventListener('vistaar:refresh-dashboard', handleManualRefresh);
  }, [loadDashboardData]);

  // Filter invoices for the Recent Sales table to respect the date filter
  const periodInvoices = invoices.filter((inv) => {
    const invDate = (inv.date || inv.createdAt || '').split('T')[0];
    return invDate >= dateRange.startDateStr && invDate <= dateRange.endDateStr;
  });

  const pendingFollowups = followUps.filter((f) => f.status === 'Pending');

  return (
    <div className="space-y-6 sm:space-y-7 animate-fade-in pb-12">
      {/* Error Banner with Retry */}
      {error && (
        <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between gap-3 text-rose-800 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-xs font-bold">Unable to load Dashboard KPIs</p>
              <p className="text-[11px] opacity-90">{error}</p>
            </div>
          </div>
          <button
            onClick={() => loadDashboardData(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. PRIMARY CONTENT: 4 AUTHORITATIVE KPI METRIC CARDS (KPI-FIRST)          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* CARD 1: Total Sales */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[190px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Sales
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>

          <div className="my-auto py-2">
            {loading ? (
              <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {formatInr(salesMetrics.totalSales)}
              </h3>
            )}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1">
            <div className="flex justify-between items-center">
              <span>Invoice Sales</span>
              <strong className="text-slate-800 dark:text-slate-200 font-semibold">{formatInr(salesMetrics.invoiceSales)}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span>Counter Sales</span>
              <strong className="text-slate-800 dark:text-slate-200 font-semibold">{formatInr(salesMetrics.counterSales)}</strong>
            </div>
          </div>
        </div>

        {/* CARD 2: Outstanding Udhari */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[190px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Outstanding Udhari
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
          </div>

          <div className="my-auto py-2">
            {loading ? (
              <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
                {formatInr(udhariMetrics.outstanding)}
              </h3>
            )}
          </div>

          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1 text-xs">
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span>Overdue Balance</span>
              <strong className={udhariMetrics.overdue > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-800 dark:text-slate-200 font-semibold'}>
                {formatInr(udhariMetrics.overdue)}
              </strong>
            </div>
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span>Active Accounts</span>
              <strong className="text-slate-800 dark:text-slate-200 font-semibold">{formatSafeCount(udhariMetrics.activeCount)}</strong>
            </div>
            <button
              onClick={() => setActiveTab('udhari')}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline pt-0.5"
            >
              <span>View Customer Ledgers →</span>
            </button>
          </div>
        </div>

        {/* CARD 3: Open Quotations */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[190px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Open Quotations
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>

          <div className="my-auto py-2">
            {loading ? (
              <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {formatSafeCount(openQuotationsCount)} Active
              </h3>
            )}
          </div>

          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1 text-xs">
            <p className="text-slate-500 dark:text-slate-400">
              Open during selected period
            </p>
            <button
              onClick={() => setActiveTab('quotations')}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline pt-0.5"
            >
              <span>Manage Quotations →</span>
            </button>
          </div>
        </div>

        {/* CARD 4: Low Stock Alert */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[190px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Low Stock Alert
            </span>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                lowStockCount > 0
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          <div className="my-auto py-2">
            {loading ? (
              <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg" />
            ) : (
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                {formatSafeCount(lowStockCount)} Item{lowStockCount === 1 ? '' : 's'}
              </h3>
            )}
          </div>

          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 space-y-1 text-xs">
            <p className="text-slate-500 dark:text-slate-400">
              Current inventory status
            </p>
            <button
              onClick={() => setActiveTab('stock')}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline pt-0.5"
            >
              <span>Restock Inventory →</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. REPORTING PERIOD FILTER TOOLBAR (COMPACT SAAS CONTROL)                 */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3 sm:px-5 sm:py-3.5 shadow-xs transition-colors space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                Reporting Period
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {formatReportingPeriodSubtitle(dateRange)}
                </span>
                {dateRange.isHistorical && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
                    Historical View
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {/* Segmented Preset Controls */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
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

            {/* Dedicated Analytics Entry */}
            <button
              onClick={() => setActiveTab('analytics')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 font-semibold text-xs transition-colors shrink-0 shadow-xs"
              title="Open Enterprise Business Analytics"
            >
              <BarChart3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Analytics</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
            </button>
          </div>
        </div>


        {/* Compact Custom Date Range Inputs */}
        {rangePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 animate-fade-in text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">From:</span>
              <input
                type="date"
                value={customStartDate}
                max={customEndDate || undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomStartDate(val);
                  if (customEndDate && val > customEndDate) {
                    setCustomEndDate(val);
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-blue-500 outline-none text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">To:</span>
              <input
                type="date"
                value={customEndDate}
                min={customStartDate || undefined}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomEndDate(val);
                  if (customStartDate && val < customStartDate) {
                    setCustomStartDate(val);
                  }
                }}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-blue-500 outline-none text-xs"
              />
            </div>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              Inclusive date bounds
            </span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. QUICK ACTIONS & BUSINESS OPERATIONS BANNER                             */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 dark:from-blue-950 dark:to-slate-950 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-blue-900/50">
        <div>
          <h3 className="text-lg font-bold">Quick Actions & Business Operations</h3>
          <p className="text-xs text-blue-200 dark:text-blue-300 mt-1">Create documents, log payments, or manage your catalog instantly</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => openModal?.('quotation')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-xs text-white shadow-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Quotation</span>
          </button>
          <button
            onClick={() => openModal?.('invoice')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs text-white shadow-md transition-colors"
          >
            <Receipt className="w-4 h-4" />
            <span>New Invoice</span>
          </button>
          <button
            onClick={() => openModal?.('payment')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 font-semibold text-xs text-white shadow-md transition-colors"
          >
            <DollarSign className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MIDDLE GRID: FOLLOW-UPS & LOW STOCK WARNING                            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Follow-ups */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Pending Customer Follow-ups</h3>
            </div>
            <button
              onClick={() => setActiveTab('follow-ups')}
              className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              View All
            </button>
          </div>

          {pendingFollowups.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
              No pending follow-ups right now. Good job!
            </div>
          ) : (
            <div className="space-y-3">
              {pendingFollowups.slice(0, 4).map((f) => (
                <div
                  key={f.id}
                  className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">{f.customerName}</span>
                      <span
                        className={`px-2 py-0.5 text-[9px] font-bold rounded-md ${
                          f.priority === 'High' || f.priority === 'Urgent'
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                            : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {f.priority}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 truncate">{f.title}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Due: {f.dueDate} at {f.dueTime}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => store.updateFollowUpStatus(f.id, 'Completed')}
                    className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                    title="Mark Completed"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock Warning Widget */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Low Stock Warning</h3>
            </div>
            <button
              onClick={() => setActiveTab('stock')}
              className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              Adjust Stock
            </button>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
              All inventory levels are healthy!
            </div>
          ) : (
            <div className="space-y-3">
              {lowStockProducts.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl border border-rose-100 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/30 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">{p.name}</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">SKU: {p.sku}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                      {p.currentStock} {p.unit} left
                    </span>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Min required: {p.minimumStock}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. RECENT SALES & INVOICES TABLE (FILTERED STRICTLY BY SELECTED PERIOD)    */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Recent Sales & Invoices</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Displaying sales recorded in period: <span className="font-semibold text-slate-700 dark:text-slate-300">{dateRange.periodBadge}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('invoices')}
            className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
          >
            View All Invoices
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3.5">Invoice #</th>
                <th className="px-6 py-3.5">Customer</th>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5">Grand Total</th>
                <th className="px-6 py-3.5">Balance</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                    <span>Loading period sales...</span>
                  </td>
                </tr>
              ) : periodInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 dark:text-slate-500">
                    No sales or invoices recorded for this period ({dateRange.periodBadge}).
                  </td>
                </tr>
              ) : (
                periodInvoices.slice(0, 5).map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-blue-600 dark:text-blue-400">{inv.invoiceNumber}</td>
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-100">{inv.customerName}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{inv.date}</td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">
                      {formatInr(inv.grandTotal)}
                    </td>
                    <td className="px-6 py-4 font-bold text-amber-600 dark:text-amber-400">
                      {formatInr(inv.balanceAmount)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${
                          inv.status === 'Paid'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : inv.status === 'Partially Paid'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
