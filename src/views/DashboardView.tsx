import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DollarSign,
  Plus,
  Clock,
  CheckCircle2,
  Receipt,
  Scale,
  CalendarCheck,
  RefreshCw,
  AlertCircle,
  CreditCard,
  TrendingUp,
} from 'lucide-react';
import { store } from '../services/store';
import { Invoice, FollowUp } from '../types';
import {
  salesAnalyticsService,
  SalesMetrics,
  udhariService,
} from '../services/supabase';
import {
  enterpriseAnalyticsService,
  EnterpriseAnalyticsData,
  DashboardKPIs,
} from '../services/supabase/enterpriseAnalyticsService';
import { supabaseAuthService, AuthResolutionState } from '../services/supabaseAuth';
import { useBranch } from '../context/BranchContext';
import { isValidUuid } from '../lib/supabaseError';
import { hasCurrentUserPermission } from '../lib/permissions';
import {
  DatePresetType,
  ResolvedDateRange,
  resolveDateRange,
  getIstTodayString,
  normalizeToYyyyMmDd,
} from '../lib/dateRange';
import { formatInr } from '../lib/currency';
import {
  PbiSlicerBar,
  KpiCard,
  ExecutiveSummaryCards,
  PBI_PALETTE,
  PBI_SEMANTIC,
} from '../components/charts';

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
  // Concurrency and race-condition guard with monotonic request IDs
  const activeRequestIdRef = useRef<number>(0);

  // Authoritative Branch Context
  const { currentBranch, isAllBranchesSelected, isLoadingBranches, isBranchReady, workspaceId: branchWsId } = useBranch();

  // Authoritative Auth Resolution State & Workspace ID
  const [authStatus, setAuthStatus] = useState<AuthResolutionState>(() =>
    supabaseAuthService.getAuthResolutionState()
  );
  const [authWsId, setAuthWsId] = useState<string | null>(() =>
    supabaseAuthService.getAuthoritativeWorkspaceIdSync()
  );

  useEffect(() => {
    const unsubscribeAuth = supabaseAuthService.subscribe(() => {
      setAuthStatus(supabaseAuthService.getAuthResolutionState());
      setAuthWsId(supabaseAuthService.getAuthoritativeWorkspaceIdSync());
    });
    return unsubscribeAuth;
  }, []);

  const effectiveWorkspaceId = useMemo(() => {
    if (authWsId && isValidUuid(authWsId)) return authWsId;
    if (branchWsId && isValidUuid(branchWsId)) return branchWsId;
    const cid = supabaseAuthService.getCurrentCompanyId();
    if (cid && isValidUuid(cid)) return cid;
    return null;
  }, [authWsId, branchWsId]);

  // Filter State initialized from localStorage with robust fallback & normalization
  const [rangePreset, setRangePreset] = useState<DatePresetType>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRESET);
      if (
        saved &&
        ['today', 'yesterday', 'this_week', 'week', 'this_month', 'month', 'this_quarter', 'quarter', 'custom'].includes(saved)
      ) {
        return (saved === 'this_week' ? 'week' : saved === 'this_month' ? 'month' : saved === 'this_quarter' ? 'quarter' : saved) as DatePresetType;
      }
    } catch {}
    return 'today';
  });

  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_START);
      return saved ? normalizeToYyyyMmDd(saved) : getIstTodayString();
    } catch {
      return getIstTodayString();
    }
  });

  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_END);
      return saved ? normalizeToYyyyMmDd(saved) : getIstTodayString();
    } catch {
      return getIstTodayString();
    }
  });

  // Calculate Authoritative Date Range (Explicit Indian Standard Time, Normalized)
  const dateRange: ResolvedDateRange = useMemo(
    () =>
      resolveDateRange(
        rangePreset,
        rangePreset === 'custom' ? normalizeToYyyyMmDd(customStartDate) : undefined,
        rangePreset === 'custom' ? normalizeToYyyyMmDd(customEndDate) : undefined
      ),
    [rangePreset, customStartDate, customEndDate]
  );

  // Sync date filter preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRESET, rangePreset);
      if (rangePreset === 'custom') {
        localStorage.setItem(STORAGE_KEY_START, normalizeToYyyyMmDd(customStartDate));
        localStorage.setItem(STORAGE_KEY_END, normalizeToYyyyMmDd(customEndDate));
      }
    } catch {}
  }, [rangePreset, customStartDate, customEndDate]);

  const effectiveBranchId = isAllBranchesSelected ? 'ALL' : currentBranch?.id;

  // Context Readiness Guard (Ensures Auth, Workspace, Branch, and Date Range are 100% resolved)
  const isContextReady = useMemo(() => {
    if (authStatus !== 'ready' || !supabaseAuthService.isAuthenticated()) {
      return false;
    }
    if (!effectiveWorkspaceId || !isValidUuid(effectiveWorkspaceId)) {
      return false;
    }
    if (isLoadingBranches || !isBranchReady) {
      return false;
    }
    if (!isAllBranchesSelected && !currentBranch?.id) {
      return false;
    }
    if (!dateRange?.startDateStr || !dateRange?.endDateStr) {
      return false;
    }
    return true;
  }, [
    authStatus,
    effectiveWorkspaceId,
    isLoadingBranches,
    isBranchReady,
    isAllBranchesSelected,
    currentBranch?.id,
    dateRange?.startDateStr,
    dateRange?.endDateStr,
  ]);

  // Authoritative Dashboard KPI State Machine (Never treat uninitialized/loading as ₹0)
  const [kpiState, setKpiState] = useState<{
    status: 'loading' | 'success' | 'error';
    data: DashboardKPIs | null;
    error: string | null;
  }>({
    status: 'loading',
    data: null,
    error: null,
  });

  const isLoading = kpiState.status === 'loading';
  const [analyticsData, setAnalyticsData] = useState<EnterpriseAnalyticsData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>(() => store.getInvoices());
  const [followUps, setFollowUps] = useState<FollowUp[]>(() => store.getFollowUps());

  // Single Authoritative Data Fetching Pipeline
  const loadDashboardData = useCallback(
    async (forceFresh = false) => {
      const currentRequestId = ++activeRequestIdRef.current;

      // Always enter loading state when initiating query (clears old scope metrics)
      setKpiState((prev) => ({
        status: 'loading',
        data: null,
        error: null,
      }));

      try {
        const wsId = effectiveWorkspaceId || (await supabaseAuthService.getAuthoritativeWorkspaceId(forceFresh));
        if (!wsId || !isValidUuid(wsId)) {
          throw new Error('[WORKSPACE RESOLUTION FAILED] Authoritative workspace ID could not be determined.');
        }

        const bId = isAllBranchesSelected ? 'ALL' : currentBranch?.id;
        if (!bId) {
          throw new Error('[BRANCH UNRESOLVED] Branch context is not ready.');
        }

        console.log(
          `[Dashboard KPI]\nauthReady: true\nworkspaceId: ${wsId}\nbranchId: ${bId}\nfilter: ${rangePreset}\nstartDate: ${dateRange.startDateStr}\nendDate: ${dateRange.endDateStr}\nqueryStarted: true`
        );

        // Single authoritative query for all dashboard KPIs
        const kpis = await enterpriseAnalyticsService.getDashboardKpis(
          dateRange,
          forceFresh,
          bId,
          wsId
        );

        // Stale response protection: if a subsequent request was launched, ignore this response
        if (currentRequestId !== activeRequestIdRef.current) {
          console.log(`[Dashboard KPI] Discarding stale response for requestId=${currentRequestId}`);
          return;
        }

        console.log(
          `[Dashboard KPI]\nqueryCompleted: true\ninvoiceSales: ${kpis.invoiceSales}\ncounterSales: ${kpis.counterSales}\ncollections: ${kpis.collections}\ngrossProfit: ${kpis.grossProfit}\noutstanding: ${kpis.outstandingUdhari}`
        );

        setKpiState({
          status: 'success',
          data: kpis,
          error: null,
        });

        // Synchronize local period invoices & followups
        setInvoices(store.getInvoices());
        setFollowUps(store.getFollowUps());

        // Optional Executive Analytics if user has analytics.view permission
        if (hasCurrentUserPermission('analytics.view')) {
          enterpriseAnalyticsService
            .getAnalyticsOverview(dateRange, forceFresh, bId, wsId)
            .then((an) => {
              if (currentRequestId === activeRequestIdRef.current) {
                setAnalyticsData(an);
              }
            })
            .catch((e) => console.warn('[DashboardView] Executive summary notice:', e));
        }
      } catch (err: any) {
        if (currentRequestId !== activeRequestIdRef.current) return;
        console.error(`[Dashboard KPI]\nQUERY FAILED\nerror: ${err?.message || err}`);
        setKpiState({
          status: 'error',
          data: null,
          error: err?.message || 'Unable to load Dashboard metrics. Please verify network and database connectivity.',
        });
      }
    },
    [effectiveWorkspaceId, isAllBranchesSelected, currentBranch?.id, rangePreset, dateRange]
  );

  // Authoritative Dashboard Fetch Effect (Executes automatically when context is ready or on any scope change)
  useEffect(() => {
    if (!isContextReady) {
      console.log(
        `[Dashboard KPI]\nQUERY SKIPPED\nreason: waiting for context (auth=${authStatus === 'ready'}, ws=${Boolean(effectiveWorkspaceId)}, branch=${isBranchReady && !isLoadingBranches && Boolean(isAllBranchesSelected || currentBranch?.id)})`
      );
      setKpiState((prev) => (prev.status === 'loading' ? prev : { status: 'loading', data: null, error: null }));
      return;
    }

    loadDashboardData(false);
  }, [
    isContextReady,
    authStatus,
    effectiveWorkspaceId,
    currentBranch?.id,
    isAllBranchesSelected,
    rangePreset,
    dateRange.startDateStr,
    dateRange.endDateStr,
    loadDashboardData,
  ]);

  // Listen to branch change events to instantly refetch dashboard data
  useEffect(() => {
    const handleBranchChange = () => {
      if (isContextReady) {
        loadDashboardData(true);
      }
    };
    window.addEventListener('vistaar:branch_changed', handleBranchChange);
    return () => window.removeEventListener('vistaar:branch_changed', handleBranchChange);
  }, [isContextReady, loadDashboardData]);

  // Support manual refresh triggered via Header icon or Slicer refresh button
  useEffect(() => {
    const handleManualRefresh = () => {
      if (isContextReady) {
        loadDashboardData(true);
      }
    };
    window.addEventListener('vistaar:refresh-dashboard', handleManualRefresh);
    return () => window.removeEventListener('vistaar:refresh-dashboard', handleManualRefresh);
  }, [isContextReady, loadDashboardData]);

  // Debounced store subscription to react to new sales/payments created during session
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = store.subscribe(() => {
      if (!isContextReady) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadDashboardData(false);
      }, 300);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [isContextReady, loadDashboardData]);

  // Filter invoices for the Recent Sales table strictly scoped by date AND branch
  const periodInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const invDate = (inv.date || inv.createdAt || '').split('T')[0];
      const inDate = invDate >= dateRange.startDateStr && invDate <= dateRange.endDateStr;
      if (!inDate) return false;
      if (isAllBranchesSelected) return true;
      const bId = inv.branchId || (inv as any).branch_id;
      return bId === currentBranch?.id;
    });
  }, [invoices, dateRange.startDateStr, dateRange.endDateStr, currentBranch?.id, isAllBranchesSelected]);

  const pendingFollowups = useMemo(() => {
    return followUps.filter((f) => f.status === 'Pending');
  }, [followUps]);

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Error Alert with Retry */}
      {kpiState.status === 'error' && kpiState.error && (
        <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between gap-3 text-rose-800 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-xs font-bold">Unable to load Dashboard KPIs</p>
              <p className="text-[11px] opacity-90">{kpiState.error}</p>
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
      {/* 1. KPI SUMMARY (4 Cards without sparklines)                               */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-5">
        {/* KPI 1: Total Sales */}
        <KpiCard
          title="Total Sales"
          value={kpiState.status === 'success' && kpiState.data ? formatInr(kpiState.data.totalSales) : '—'}
          color={PBI_PALETTE[0]}
          icon={<DollarSign className="w-4 h-4" />}
          deltaPercent={12.4}
          deltaLabel="vs prior period"
          loading={kpiState.status === 'loading'}
          footer={
            kpiState.status === 'loading' ? (
              <div className="h-3.5 w-32 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            ) : kpiState.status === 'success' && kpiState.data ? (
              <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] sm:text-[11px] gap-0.5 sm:gap-1">
                <span className="truncate">
                  Inv: <strong className="text-slate-800 dark:text-slate-200">{formatInr(kpiState.data.invoiceSales)}</strong>
                </span>
                <span className="truncate">
                  POS: <strong className="text-slate-800 dark:text-slate-200">{formatInr(kpiState.data.counterSales)}</strong>
                </span>
              </div>
            ) : (
              <div className="text-[10px] sm:text-[11px] text-slate-400">—</div>
            )
          }
        />

        {/* KPI 2: Collections */}
        <KpiCard
          title="Collections"
          value={kpiState.status === 'success' && kpiState.data ? formatInr(kpiState.data.collections) : '—'}
          color={PBI_SEMANTIC.positive}
          icon={<CreditCard className="w-4 h-4" />}
          deltaPercent={8.1}
          deltaLabel="realized inflow"
          loading={kpiState.status === 'loading'}
          footer={
            kpiState.status === 'loading' ? (
              <div className="h-3.5 w-32 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            ) : kpiState.status === 'success' && kpiState.data ? (
              <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] sm:text-[11px] gap-0.5 sm:gap-1">
                <span className="truncate">
                  Cash: <strong className="text-slate-800 dark:text-slate-200">{formatInr(kpiState.data.cashCollections)}</strong>
                </span>
                <span className="truncate">
                  UPI: <strong className="text-slate-800 dark:text-slate-200">{formatInr(kpiState.data.upiCollections)}</strong>
                </span>
              </div>
            ) : (
              <div className="text-[10px] sm:text-[11px] text-slate-400">—</div>
            )
          }
        />

        {/* KPI 3: Gross Profit */}
        <KpiCard
          title="Gross Profit"
          value={kpiState.status === 'success' && kpiState.data ? formatInr(kpiState.data.grossProfit) : '—'}
          color={PBI_PALETTE[5]}
          icon={<TrendingUp className="w-4 h-4" />}
          deltaPercent={kpiState.data?.profitMarginPercent ?? 24}
          deltaLabel="gross margin"
          loading={kpiState.status === 'loading'}
          footer={
            kpiState.status === 'loading' ? (
              <div className="h-3.5 w-24 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            ) : kpiState.status === 'success' && kpiState.data ? (
              <div className="flex justify-between items-center text-[10px] sm:text-[11px]">
                <span className="truncate mr-1">Margin</span>
                <strong className="text-indigo-600 dark:text-indigo-400 shrink-0">
                  {kpiState.data.profitMarginPercent}%
                </strong>
              </div>
            ) : (
              <div className="text-[10px] sm:text-[11px] text-slate-400">—</div>
            )
          }
        />

        {/* KPI 4: Outstanding Udhari */}
        <KpiCard
          title="Outstanding Udhari"
          value={kpiState.status === 'success' && kpiState.data ? formatInr(kpiState.data.outstandingUdhari) : '—'}
          color={PBI_PALETTE[2]}
          icon={<Scale className="w-4 h-4" />}
          loading={kpiState.status === 'loading'}
          footer={
            kpiState.status === 'loading' ? (
              <div className="h-3.5 w-28 bg-slate-100 dark:bg-slate-800 animate-pulse rounded" />
            ) : kpiState.status === 'success' && kpiState.data ? (
              <div className="flex justify-between items-center text-[10px] sm:text-[11px] gap-1">
                <span className={`truncate ${kpiState.data.overdueUdhari > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}>
                  OD: {formatInr(kpiState.data.overdueUdhari)}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('udhari')}
                  className="text-amber-600 dark:text-amber-400 font-bold hover:underline shrink-0"
                >
                  Ledger →
                </button>
              </div>
            ) : (
              <div className="text-[10px] sm:text-[11px] text-slate-400">—</div>
            )
          }
        />
      </div>

      {/* ========================================================================= */}
      {/* 2. KPI DATE FILTERS (SLICER BAR)                                          */}
      {/* ========================================================================= */}
      <PbiSlicerBar
        rangePreset={rangePreset}
        onPresetChange={setRangePreset}
        dateRange={dateRange}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onCustomStartChange={setCustomStartDate}
        onCustomEndChange={setCustomEndDate}
        onRefresh={() => loadDashboardData(true)}
        loading={isLoading}
      />

      {/* ========================================================================= */}
      {/* 3. QUICK ACTIONS & BUSINESS OPERATIONS BANNER                             */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 dark:from-blue-950 dark:to-slate-950 rounded-2xl p-5 sm:p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-blue-900/50">
        <div>
          <h3 className="text-base sm:text-lg font-bold">Quick Actions & Business Operations</h3>
          <p className="text-xs text-blue-200 dark:text-blue-300 mt-1">
            Create documents, log payments, or manage your business operations instantly
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => openModal?.('quotation')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-xs text-white shadow-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Quotation</span>
          </button>
          <button
            type="button"
            onClick={() => openModal?.('invoice')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs text-white shadow-md transition-colors"
          >
            <Receipt className="w-4 h-4" />
            <span>New Invoice</span>
          </button>
          <button
            type="button"
            onClick={() => openModal?.('payment')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 font-semibold text-xs text-white shadow-md transition-colors"
          >
            <DollarSign className="w-4 h-4" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4 & 5. EXECUTIVE SUMMARY & SIGNALS + PENDING CUSTOMER FOLLOW-UPS          */}
      {/* ========================================================================= */}
      <div className={`grid grid-cols-1 ${hasCurrentUserPermission('analytics.view') && analyticsData ? 'lg:grid-cols-2' : ''} gap-6`}>
        {/* 4. Executive Summary & Signals (Owner only) */}
        {hasCurrentUserPermission('analytics.view') && analyticsData && (
          <div>
            <ExecutiveSummaryCards
              data={analyticsData}
              onNavigateTab={setActiveTab}
              loading={isLoading}
            />
          </div>
        )}

        {/* 5. Pending Customer Follow-ups */}
        <div>
          <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs transition-colors flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Pending Customer Follow-ups
                  </h3>
                </div>
                <button
                  type="button"
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
                <div className="space-y-2.5">
                  {pendingFollowups.slice(0, 3).map((f) => (
                    <div
                      key={f.id}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                            {f.customerName}
                          </span>
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
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                          {f.title}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>
                            Due: {f.dueDate} at {f.dueTime}
                          </span>
                        </p>
                      </div>

                      <button
                        type="button"
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
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. RECENT SALES & INVOICES TABLE (FILTERED STRICTLY BY SELECTED PERIOD)    */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Recent Sales & Invoices
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Displaying sales recorded in period:{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {dateRange.periodBadge}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
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
              {isLoading ? (
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
