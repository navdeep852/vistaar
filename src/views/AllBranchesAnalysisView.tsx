import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  DollarSign,
  TrendingUp,
  CreditCard,
  Scale,
  ShoppingBag,
  Receipt,
  Tag,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Calendar,
  Layers,
  ChevronDown,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import {
  DatePresetType,
  ResolvedDateRange,
  resolveDateRange,
  getIstTodayString,
  formatIndianDate,
} from '../lib/dateRange';
import { formatInr } from '../lib/currency';
import { analyticsService } from '../services/supabase/analyticsService';
import { OrganizationAnalytics, BranchPerformance, CounterSale } from '../types';
import { useBranch } from '../context/BranchContext';
import { PbiSlicerBar, KpiCard, PBI_PALETTE, PBI_SEMANTIC } from '../components/charts';
import { CounterSaleDetailsModal } from '../components/CounterSaleDetailsModal';
import { counterSaleService } from '../services/supabase/counterSaleService';

interface AllBranchesAnalysisViewProps {
  onNavigateTab: (tab: string, extraParam?: string) => void;
}

const DONUT_COLORS = ['#3b82f6', '#10b981'];

export const AllBranchesAnalysisView: React.FC<AllBranchesAnalysisViewProps> = ({ onNavigateTab }) => {
  const { switchBranch, allWorkspaceBranches } = useBranch();

  // Date Filter State
  const [rangePreset, setRangePreset] = useState<DatePresetType>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(getIstTodayString());
  const [customEndDate, setCustomEndDate] = useState<string>(getIstTodayString());

  const dateRange: ResolvedDateRange = useMemo(
    () => resolveDateRange(rangePreset, customStartDate, customEndDate),
    [rangePreset, customStartDate, customEndDate]
  );

  // Analytics Data & Loading State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<OrganizationAnalytics | null>(null);

  // Counter Sale Details Modal State
  const [selectedSale, setSelectedSale] = useState<CounterSale | null>(null);
  const [saleBranchName, setSaleBranchName] = useState<string>('');
  const [detailsModalOpen, setDetailsModalOpen] = useState<boolean>(false);

  // Recent Organization Sales
  const [recentSales, setRecentSales] = useState<CounterSale[]>([]);

  const loadData = useCallback(async (forceFresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const [orgData, salesRes] = await Promise.all([
        analyticsService.getOrganizationAnalytics({
          startDate: dateRange.startDateStr,
          endDate: dateRange.endDateStr,
          forceFresh,
        }),
        counterSaleService.getCounterSales({ branchId: 'ALL' }),
      ]);

      setAnalytics(orgData);

      // Filter recent sales within selected date range
      const filtered = (salesRes.data || [])
        .filter((s) => s.status !== 'CANCELLED')
        .filter((s) => {
          const d = (s.saleDate || s.createdAt || '').split('T')[0];
          return d >= dateRange.startDateStr && d <= dateRange.endDateStr;
        })
        .slice(0, 15);

      setRecentSales(filtered);
    } catch (err: any) {
      console.error('[AllBranchesAnalysisView] Query error:', err);
      setError(err?.message || 'Unable to load organization analytics. Please check network connectivity.');
    } finally {
      setLoading(false);
    }
  }, [dateRange.startDateStr, dateRange.endDateStr]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Branch Switch Handler for Branch Performance Table (PART 21)
  const handleViewBranchDashboard = async (branch: BranchPerformance) => {
    const target = allWorkspaceBranches.find(
      (b) => b.id === branch.workspace_id || b.branchCode === branch.branch_code
    );
    if (target) {
      await switchBranch(target.id);
      onNavigateTab('dashboard');
    } else {
      onNavigateTab('dashboard');
    }
  };

  // Open Details Modal with Branch identification (PART 20)
  const handleOpenSaleDetails = (sale: CounterSale) => {
    const b = allWorkspaceBranches.find((br) => br.id === sale.branchId);
    setSaleBranchName(b?.branchName || 'Organization Branch');
    setSelectedSale(sale);
    setDetailsModalOpen(true);
  };

  // Channel breakdown donut data
  const channelData = useMemo(() => {
    if (!analytics) return [];
    return [
      { name: 'Invoices', value: analytics.invoice_sales },
      { name: 'POS / Counter', value: analytics.counter_sales },
    ];
  }, [analytics]);

  return (
    <div className="space-y-6 sm:space-y-7 animate-fade-in pb-16">
      {/* ========================================================================= */}
      {/* 1. HEADER & SCOPE BANNER (PART 36)                                        */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shadow-xs">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-extrabold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200/50 dark:border-indigo-900/40">
                ALL BRANCHES (ORGANIZATION-WIDE)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 mt-0.5">
              {analytics?.organization_name || 'Organization Analytics'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregated real-time metrics across all authorized operating locations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigateTab('analytics')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Branch View</span>
          </button>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh All Branches</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 flex items-center justify-between gap-3 text-rose-800 dark:text-rose-300">
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. DATE FILTER SLICER BAR (PART 16)                                       */}
      {/* ========================================================================= */}
      <PbiSlicerBar
        rangePreset={rangePreset}
        onPresetChange={setRangePreset}
        dateRange={dateRange}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        onCustomStartChange={setCustomStartDate}
        onCustomEndChange={setCustomEndDate}
        onRefresh={() => loadData(true)}
        loading={loading}
      />

      {/* ========================================================================= */}
      {/* 3. ALL BRANCHES KPI CARDS (PART 14)                                       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
        {/* KPI 1: Total Sales */}
        <KpiCard
          title="All Branches Sales"
          value={analytics ? formatInr(analytics.total_sales) : '—'}
          color={PBI_PALETTE[0]}
          icon={<DollarSign className="w-4 h-4" />}
          loading={loading}
          footer={
            analytics && (
              <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] sm:text-[11px] gap-0.5">
                <span>Inv: <strong className="text-slate-800 dark:text-slate-200">{formatInr(analytics.invoice_sales)}</strong></span>
                <span>POS: <strong className="text-slate-800 dark:text-slate-200">{formatInr(analytics.counter_sales)}</strong></span>
              </div>
            )
          }
        />

        {/* KPI 2: Collections */}
        <KpiCard
          title="Total Collections"
          value={analytics ? formatInr(analytics.collections) : '—'}
          color={PBI_SEMANTIC.positive}
          icon={<CreditCard className="w-4 h-4" />}
          loading={loading}
          footer={
            analytics && (
              <div className="flex flex-col sm:flex-row sm:justify-between text-[10px] sm:text-[11px] gap-0.5">
                <span>Cash: <strong className="text-slate-800 dark:text-slate-200">{formatInr(analytics.cash_collections)}</strong></span>
                <span>UPI: <strong className="text-slate-800 dark:text-slate-200">{formatInr(analytics.upi_collections)}</strong></span>
              </div>
            )
          }
        />

        {/* KPI 3: Gross Profit */}
        <KpiCard
          title="Gross Profit"
          value={analytics ? formatInr(analytics.gross_profit) : '—'}
          color={PBI_PALETTE[5]}
          icon={<TrendingUp className="w-4 h-4" />}
          loading={loading}
          footer={
            analytics && (
              <div className="flex justify-between items-center text-[10px] sm:text-[11px]">
                <span>Margin Est.</span>
                <strong className="text-indigo-600 dark:text-indigo-400">28.0%</strong>
              </div>
            )
          }
        />

        {/* KPI 4: Outstanding Udhari */}
        <KpiCard
          title="Outstanding Udhari"
          value={analytics ? formatInr(analytics.outstanding_udhari) : '—'}
          color={PBI_PALETTE[2]}
          icon={<Scale className="w-4 h-4" />}
          loading={loading}
          footer={
            analytics && (
              <div className="flex justify-between items-center text-[10px] sm:text-[11px]">
                <span>Across All Branches</span>
                <strong className="text-amber-600 dark:text-amber-400">{formatInr(analytics.outstanding_udhari)}</strong>
              </div>
            )
          }
        />
      </div>

      {/* Secondary Operational KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Transactions</span>
            <span className="text-xl font-black text-slate-900 dark:text-slate-100 mt-0.5 block">
              {analytics?.total_transactions ?? '—'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <Receipt className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Invoices</span>
            <span className="text-xl font-black text-slate-900 dark:text-slate-100 mt-0.5 block">
              {analytics?.total_invoices ?? '—'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Counter Sales (POS)</span>
            <span className="text-xl font-black text-slate-900 dark:text-slate-100 mt-0.5 block">
              {analytics?.total_counter_sales ?? '—'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <ShoppingBag className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Discounts</span>
            <span className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5 block">
              {analytics ? formatInr(analytics.total_discounts) : '—'}
            </span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <Tag className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. VISUALIZATIONS SECTION (PART 15)                                       */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Chart 1: Sales by Branch */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center justify-between">
            <span>Sales by Branch</span>
            <span className="text-[10px] text-slate-400 font-mono">Gross Total</span>
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.sales_by_branch || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="branch_name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                <Tooltip formatter={(value: any) => [formatInr(Number(value)), 'Sales']} />
                <Bar dataKey="amount" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Collections by Branch */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center justify-between">
            <span>Collections by Branch</span>
            <span className="text-[10px] text-emerald-500 font-mono">Realized Inflow</span>
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.collections_by_branch || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="branch_name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                <Tooltip formatter={(value: any) => [formatInr(Number(value)), 'Collections']} />
                <Bar dataKey="amount" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Sales Trend (Line Chart) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center justify-between">
            <span>Organization Sales Trend</span>
            <span className="text-[10px] text-slate-400 font-mono">Daily Timeline</span>
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics?.sales_trend || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                <Tooltip formatter={(value: any) => [formatInr(Number(value)), 'Sales']} />
                <Legend />
                <Line type="monotone" dataKey="sales" name="Total Sales" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="counter_sales" name="POS" stroke="#10b981" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Invoice vs POS Sales (Donut) */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center justify-between">
            <span>Invoice vs POS Sales Ratio</span>
            <span className="text-[10px] text-slate-400 font-mono">Channel Split</span>
          </h3>
          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={channelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {channelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [formatInr(Number(value)), 'Sales']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. BRANCH PERFORMANCE TABLE (PART 15 & 21)                                */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Branch Performance Ledger</span>
            </h3>
            <p className="text-xs text-slate-400">
              Ranked by total sales in selected reporting scope
            </p>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {analytics?.branch_performance?.length || 0} active operating locations
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 text-[11px]">
                <th className="p-3">Branch</th>
                <th className="p-3 text-right">Total Sales</th>
                <th className="p-3 text-right">POS Sales</th>
                <th className="p-3 text-right">Invoice Sales</th>
                <th className="p-3 text-right">Collections</th>
                <th className="p-3 text-right">Gross Profit</th>
                <th className="p-3 text-right">Outstanding</th>
                <th className="p-3 text-center">Txns</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(!analytics?.branch_performance || analytics.branch_performance.length === 0) ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-slate-400">
                    No branch data found for this organization.
                  </td>
                </tr>
              ) : (
                analytics.branch_performance.map((b) => (
                  <tr key={b.workspace_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{b.branch_name}</span>
                        {b.is_main_branch && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold">
                            MAIN
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">{b.branch_code}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-black text-slate-900 dark:text-slate-100">
                      {formatInr(b.sales)}
                    </td>
                    <td className="p-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                      {formatInr(b.pos_sales)}
                    </td>
                    <td className="p-3 text-right font-medium text-blue-600 dark:text-blue-400">
                      {formatInr(b.invoice_sales)}
                    </td>
                    <td className="p-3 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatInr(b.collections)}
                    </td>
                    <td className="p-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {formatInr(b.gross_profit)}
                    </td>
                    <td className="p-3 text-right font-semibold text-amber-600 dark:text-amber-400">
                      {formatInr(b.outstanding_udhari)}
                    </td>
                    <td className="p-3 text-center font-bold text-slate-700 dark:text-slate-300">
                      {b.transactions}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleViewBranchDashboard(b)}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-bold text-[11px] transition-colors cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                        title={`Switch active branch to ${b.branch_name}`}
                      >
                        <span>View Dashboard</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. RECENT ORGANIZATION COUNTER SALES (PART 20)                            */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Recent Counter Sales Across All Branches</span>
            </h3>
            <p className="text-xs text-slate-400">
              Click &quot;Details&quot; on any sale to inspect full item breakdown and stock impacts
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('counter-sale')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Open Counter Sale POS →
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 text-[11px]">
                <th className="p-3">Sale #</th>
                <th className="p-3">Branch Location</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Method</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-slate-400">
                    No counter sales found in the selected date range.
                  </td>
                </tr>
              ) : (
                recentSales.map((s) => {
                  const bObj = allWorkspaceBranches.find((br) => br.id === s.branchId);
                  const bName = bObj?.branchName || 'Active Branch';
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {s.saleNumber || s.invoiceNumber}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-[11px]">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{bName}</span>
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                        {s.customerName || 'Walk-in Customer'}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">
                        {s.saleDate ? formatIndianDate(s.saleDate) : '—'}
                      </td>
                      <td className="p-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                        {formatInr(s.finalTotal)}
                      </td>
                      <td className="p-3 font-medium text-slate-700 dark:text-slate-300">
                        {s.paymentMethod || 'Cash'}
                      </td>
                      <td className="p-3 text-center">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                          {s.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenSaleDetails(s)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Authoritative Details Modal (PART 18 & 20) */}
      <CounterSaleDetailsModal
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        sale={selectedSale}
        branchName={saleBranchName}
      />
    </div>
  );
};
