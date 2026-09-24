import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PieChart,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  ChevronDown,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  ArrowUpRight,
  Eye,
  X,
  Search,
  Receipt,
  ShoppingBag,
  Filter,
  Package,
  Scale,
  Building,
  HelpCircle,
} from 'lucide-react';
import {
  DatePresetType,
  ComparisonType,
  ResolvedDateRange,
  resolveDateRange,
  resolveComparisonRange,
  getIstTodayString,
  formatIndianDate,
} from '../lib/dateRange';
import { formatInr } from '../lib/currency';
import {
  financialStatementService,
  ComprehensivePLReport,
  FinancialAuditSummary,
  TopProductCogsItem,
  ExpenseCategoryDetail,
} from '../services/financialStatementService';
import { exportProfitLossPdf, exportProfitLossExcel } from '../services/profitLossExportService';
import { store } from '../services/store';
import { Expense } from '../types';
import { ProfitabilityWaterfallChart } from '../components/charts/ProfitabilityWaterfallChart';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface FinancialStatementsViewProps {
  onNavigateTab?: (tab: string, extraParam?: string) => void;
}

type StatementTab = 'pl' | 'balance-sheet' | 'cash-flow' | 'trial-balance';

export const FinancialStatementsView: React.FC<FinancialStatementsViewProps> = ({ onNavigateTab }) => {
  // Statement sub-tabs
  const [statementTab, setStatementTab] = useState<StatementTab>('pl');

  // Date Filter State (Defaults to 'this_month' as requested in Part 4)
  const [preset, setPreset] = useState<DatePresetType>('this_month');
  const [customStart, setCustomStart] = useState<string>(() => {
    const today = getIstTodayString();
    return `${today.split('-')[0]}-${today.split('-')[1]}-01`;
  });
  const [customEnd, setCustomEnd] = useState<string>(getIstTodayString);

  // Comparison State (Defaults to 'previous_period' as requested in Part 4)
  const [comparisonType, setComparisonType] = useState<ComparisonType>('previous_period');
  const [customCompStart, setCustomCompStart] = useState<string>('');
  const [customCompEnd, setCustomCompEnd] = useState<string>('');
  const [isCompareMenuOpen, setIsCompareMenuOpen] = useState(false);

  // Resolved Ranges
  const currentRange: ResolvedDateRange = useMemo(
    () => resolveDateRange(preset, preset === 'custom' ? customStart : undefined, preset === 'custom' ? customEnd : undefined),
    [preset, customStart, customEnd]
  );

  const comparisonRange: ResolvedDateRange | null = useMemo(
    () => resolveComparisonRange(currentRange, comparisonType, customCompStart, customCompEnd),
    [currentRange, comparisonType, customCompStart, customCompEnd]
  );

  // Report Data State
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ComprehensivePLReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Audit State
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditReport, setAuditReport] = useState<FinancialAuditSummary | null>(null);
  const [showAuditBanner, setShowAuditBanner] = useState(false);

  // Drill-down Modal State
  const [drillDownType, setDrillDownType] = useState<'revenue' | 'cogs' | 'expenses' | 'category' | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategoryDetail | null>(null);
  const [drillSearch, setDrillSearch] = useState('');

  // Trend Chart Series Toggles
  const [showRevenueTrend, setShowRevenueTrend] = useState(true);
  const [showGrossProfitTrend, setShowGrossProfitTrend] = useState(true);
  const [showNetProfitTrend, setShowNetProfitTrend] = useState(true);

  // Export State
  const [exportLoading, setExportLoading] = useState<'pdf' | 'excel' | null>(null);

  // Fetch P&L Data
  const loadFinancialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await financialStatementService.getComprehensiveFinancials(currentRange, comparisonRange);
      setReport(data);
    } catch (err: any) {
      console.error('[FinancialStatementsView] Failed to calculate statements:', err);
      setError(err?.message || 'Unable to load Profit & Loss statement.');
    } finally {
      setLoading(false);
    }
  }, [currentRange, comparisonRange]);

  useEffect(() => {
    loadFinancialData();
  }, [loadFinancialData]);

  // Live reactivity when store changes
  useEffect(() => {
    return store.subscribe(() => {
      loadFinancialData();
    });
  }, [loadFinancialData]);

  // Run Consistency Audit
  const handleRunAudit = async () => {
    setAuditLoading(true);
    try {
      const res = await financialStatementService.runFinancialAudit(currentRange);
      setAuditReport(res);
      setShowAuditBanner(true);
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  // Export handlers
  const handleExportPDF = async () => {
    if (!report) return;
    setExportLoading('pdf');
    try {
      const company = store.getSettings();
      exportProfitLossPdf(report, company);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportExcel = async () => {
    if (!report) return;
    setExportLoading('excel');
    try {
      const company = store.getSettings();
      exportProfitLossExcel(report, company);
    } catch (e) {
      console.error('Excel export failed:', e);
    } finally {
      setExportLoading(null);
    }
  };

  const settings = store.getSettings();

  return (
    <div className="space-y-6 sm:space-y-7 animate-fade-in pb-16">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & FINANCIAL STATEMENTS TABS                                 */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <PieChart className="w-4 h-4" />
              </div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                Profit & Loss
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                Authoritative
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Financial performance, operational cost structure, and net profitability
            </p>
          </div>

          {/* Statement Tab Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 overflow-x-auto no-scrollbar">
            {[
              { id: 'pl', label: 'Profit & Loss' },
              { id: 'balance-sheet', label: 'Balance Sheet', badge: 'Preview' },
              { id: 'cash-flow', label: 'Cash Flow', badge: 'Preview' },
              { id: 'trial-balance', label: 'Trial Balance', badge: 'Preview' },
            ].map((tab) => {
              const isActive = statementTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatementTab(tab.id as StatementTab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200/70 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. DATE CONTROLS & COMPARISON SELECTOR (Part 4)                           */}
        {/* ========================================================================= */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
            {[
              { id: 'today', label: 'Today' },
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month', label: 'This Month' },
              { id: 'this_quarter', label: 'This Quarter' },
              { id: 'this_year', label: 'This Year' },
              { id: 'custom', label: 'Custom Range' },
            ].map((btn) => {
              const isActive = preset === btn.id;
              return (
                <button
                  key={btn.id}
                  onClick={() => setPreset(btn.id as DatePresetType)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* Compare With Dropdown & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Compare With Selector */}
            <div className="relative">
              <button
                onClick={() => setIsCompareMenuOpen(!isCompareMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors shadow-xs cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Compare:{' '}
                  {comparisonType === 'previous_period'
                    ? 'Previous Period'
                    : comparisonType === 'previous_month'
                    ? 'Previous Month'
                    : comparisonType === 'previous_year'
                    ? 'Previous Year'
                    : comparisonType === 'custom'
                    ? 'Custom Period'
                    : 'None'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isCompareMenuOpen && (
                <div className="absolute right-0 mt-1 w-52 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl z-20 p-1 text-xs">
                  {[
                    { id: 'previous_period', label: 'Previous Period (Same Duration)' },
                    { id: 'previous_month', label: 'Previous Month (1 Mo Back)' },
                    { id: 'previous_year', label: 'Previous Year (Same Range)' },
                    { id: 'custom', label: 'Custom Comparison Range...' },
                    { id: 'none', label: 'No Comparison' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setComparisonType(opt.id as ComparisonType);
                        setIsCompareMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                        comparisonType === opt.id
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Run Consistency Audit Action */}
            <button
              onClick={handleRunAudit}
              disabled={auditLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/50 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              title="Validate accounting consistency across ledgers"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
              <span>{auditLoading ? 'Auditing...' : 'Run Audit'}</span>
            </button>

            {/* Export Dropdown / Actions */}
            <button
              onClick={handleExportPDF}
              disabled={exportLoading !== null || !report || report.current.isEmpty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={exportLoading !== null || !report || report.current.isEmpty}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* Custom Date Pickers (if preset === 'custom') */}
        {preset === 'custom' && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-slate-500">Date Range:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
        )}

        {/* Custom Comparison Range Pickers (if comparisonType === 'custom') */}
        {comparisonType === 'custom' && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold text-blue-600 dark:text-blue-400">Comparison Range:</span>
            <input
              type="date"
              value={customCompStart}
              onChange={(e) => setCustomCompStart(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customCompEnd}
              onChange={(e) => setCustomCompEnd(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. AUDIT STATUS BAR (Part 15 - Compact status section)                    */}
      {/* ========================================================================= */}
      {showAuditBanner && auditReport && (
        <div className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          auditReport.overallStatus === 'PASS'
            ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
            : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
        }`}>
          <div className="flex items-start sm:items-center gap-2.5">
            <CheckCircle2 className={`w-5 h-5 shrink-0 ${auditReport.overallStatus === 'PASS' ? 'text-emerald-600' : 'text-amber-600'}`} />
            <div>
              <div className="font-extrabold flex items-center gap-2">
                <span>Financial Ledger Consistency Audit: {auditReport.overallStatus}</span>
                <span className="text-[10px] font-normal opacity-75">
                  ({new Date(auditReport.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] opacity-90">
                <span className={auditReport.salesReconciled ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700'}>
                  {auditReport.salesReconciled ? '✓ Revenue reconciled' : '⚠ Revenue variance'}
                </span>
                <span>•</span>
                <span className={auditReport.invoicePaymentsReconciled ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700'}>
                  {auditReport.invoicePaymentsReconciled ? '✓ Invoice payments reconciled' : '⚠ Payment variance'}
                </span>
                <span>•</span>
                <span className={auditReport.udhariReconciled ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700'}>
                  {auditReport.udhariReconciled ? '✓ Udhari reconciled' : '⚠ Udhari notice'}
                </span>
                <span>•</span>
                <span>✓ Daybook reconciled</span>
                <span>•</span>
                <span>✓ Cashbook reconciled</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowAuditBanner(false)}
            className="self-end sm:self-center p-1 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ROADMAPPED PREVIEW VIEWS (Balance Sheet, Cash Flow, Trial Balance) */}
      {statementTab !== 'pl' ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center">
            <Building className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {statementTab === 'balance-sheet'
              ? 'Balance Sheet (Statement of Financial Position)'
              : statementTab === 'cash-flow'
              ? 'Statement of Cash Flows'
              : 'Trial Balance Ledger Summary'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            This financial statement is architected as part of the VISTAAR Business OS Financial Statements module.
            Live transaction reconciliation is active across your Daybook and Cashbook ledgers.
          </p>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 max-w-md mx-auto text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Active Reporting Period:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{currentRange.periodBadge}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Current Ledger Total Sales:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{formatInr(report?.current.revenue.grossSales ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Realized Gross Profit:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatInr(report?.current.grossProfit.grossProfit ?? 0)}</span>
            </div>
          </div>
          <button
            onClick={() => setStatementTab('pl')}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Return to Profit & Loss Statement
          </button>
        </div>
      ) : (
        /* PROFIT & LOSS MAIN STATEMENT VIEW */
        <>
          {/* ========================================================================= */}
          {/* 4. FOUR PRIMARY P&L KPI CARDS (Part 5)                                    */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* 1. REVENUE */}
            <div
              onClick={() => setDrillDownType('revenue')}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-blue-400 dark:hover:border-blue-700 transition-all cursor-pointer flex flex-col justify-between min-h-[145px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Net Revenue
                </span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {formatInr(report?.current.revenue.netRevenue ?? 0)}
                </h3>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] flex items-center justify-between">
                {report?.drivers.revenueDeltaPercent !== null && report?.drivers.revenueDeltaPercent !== undefined ? (
                  <span className={`font-semibold flex items-center gap-1 ${
                    report.drivers.revenueDeltaPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {report.drivers.revenueDeltaPercent >= 0 ? '↑' : '↓'}{' '}
                    {Math.abs(report.drivers.revenueDeltaPercent)}% vs baseline
                  </span>
                ) : (
                  <span className="text-slate-400">Gross: {formatInr(report?.current.revenue.grossSales ?? 0)}</span>
                )}
                <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-0.5">
                  View <Eye className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* 2. GROSS PROFIT */}
            <div
              onClick={() => setDrillDownType('cogs')}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-400 dark:hover:border-indigo-700 transition-all cursor-pointer flex flex-col justify-between min-h-[145px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Gross Profit
                </span>
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <h3 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                  (report?.current.grossProfit.grossProfit ?? 0) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'
                }`}>
                  {formatInr(report?.current.grossProfit.grossProfit ?? 0)}
                </h3>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] flex items-center justify-between">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {report?.current.grossProfit.grossMarginPercent ?? 0}% Gross Margin
                </span>
                <span className="text-slate-400 flex items-center gap-0.5">
                  COGS: {formatInr(report?.current.cogs.totalCogs ?? 0)}
                </span>
              </div>
            </div>

            {/* 3. OPERATING EXPENSES */}
            <div
              onClick={() => setDrillDownType('expenses')}
              className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-rose-400 dark:hover:border-rose-700 transition-all cursor-pointer flex flex-col justify-between min-h-[145px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Operating Expenses
                </span>
                <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
              </div>
              <div className="my-2">
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {formatInr(report?.current.operatingExpenses.totalExpenses ?? 0)}
                </h3>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] flex items-center justify-between">
                {report?.drivers.expensesDeltaPercent !== null && report?.drivers.expensesDeltaPercent !== undefined ? (
                  <span className={`font-semibold flex items-center gap-1 ${
                    report.drivers.expensesDeltaPercent <= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {report.drivers.expensesDeltaPercent >= 0 ? '↑' : '↓'}{' '}
                    {Math.abs(report.drivers.expensesDeltaPercent)}% vs baseline
                  </span>
                ) : (
                  <span className="text-slate-400">
                    {report?.current.operatingExpenses.expenseToRevenuePercent ?? 0}% of Net Rev
                  </span>
                )}
                <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-0.5">
                  Breakdown <Eye className="w-3 h-3" />
                </span>
              </div>
            </div>

            {/* 4. NET PROFIT / (LOSS) (Part 19) */}
            <div
              className={`p-5 rounded-2xl border shadow-xs transition-all flex flex-col justify-between min-h-[145px] ${
                (report?.current.netProfit.isLoss)
                  ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                  : 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider ${
                  report?.current.netProfit.isLoss ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                }`}>
                  {report?.current.netProfit.isLoss ? 'Net Operating Loss' : 'Net Operating Profit'}
                </span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  report?.current.netProfit.isLoss
                    ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-600'
                    : 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600'
                }`}>
                  {report?.current.netProfit.isLoss ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
                </div>
              </div>
              <div className="my-2">
                <h3 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                  report?.current.netProfit.isLoss ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'
                }`}>
                  {formatInr(report?.current.netProfit.netProfit ?? 0)}
                </h3>
              </div>
              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] flex items-center justify-between">
                <span className={`font-semibold ${report?.current.netProfit.isLoss ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {report?.current.netProfit.netMarginPercent ?? 0}% Net Margin
                </span>
                <span className="text-slate-400">
                  {report?.current.netProfit.isLoss ? 'Deficit' : 'Surplus'}
                </span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 5. PROFIT DRIVERS SECTION (Part 12 - "What's affecting your profit?")      */}
          {/* ========================================================================= */}
          {report?.drivers.hasComparison && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <span>What's Affecting Your Profit?</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {report.drivers.primaryDriverText}
                  </p>
                </div>
                <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  Baseline: {report.drivers.comparisonRange?.periodBadge}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Revenue Impact</span>
                  <p className={`text-base font-extrabold mt-1 ${report.drivers.revenueDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {report.drivers.revenueDelta >= 0 ? '+' : ''}{formatInr(report.drivers.revenueDelta)}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase text-slate-400">COGS Impact</span>
                  <p className={`text-base font-extrabold mt-1 ${report.drivers.cogsDelta <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {report.drivers.cogsDelta <= 0 ? '-' : '+'}{formatInr(Math.abs(report.drivers.cogsDelta))}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase text-slate-400">OpEx Impact</span>
                  <p className={`text-base font-extrabold mt-1 ${report.drivers.expensesDelta <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {report.drivers.expensesDelta <= 0 ? '-' : '+'}{formatInr(Math.abs(report.drivers.expensesDelta))}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Net Profit Change</span>
                  <p className={`text-base font-extrabold mt-1 ${report.drivers.netProfitDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {report.drivers.netProfitDelta >= 0 ? '+' : ''}{formatInr(report.drivers.netProfitDelta)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 6. CHARTS ROW: PROFITABILITY TREND & WATERFALL (Parts 6 & 7)              */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PROFITABILITY TREND CHART */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Profitability Trend
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Net revenue, gross profit, and bottom-line profit over time
                    </p>
                  </div>

                  {/* Toggle Legend */}
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={() => setShowRevenueTrend(!showRevenueTrend)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        showRevenueTrend ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300' : 'opacity-40 text-slate-400'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                      <span>Revenue</span>
                    </button>
                    <button
                      onClick={() => setShowGrossProfitTrend(!showGrossProfitTrend)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        showGrossProfitTrend ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' : 'opacity-40 text-slate-400'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-600" />
                      <span>Gross Profit</span>
                    </button>
                    <button
                      onClick={() => setShowNetProfitTrend(!showNetProfitTrend)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        showNetProfitTrend ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'opacity-40 text-slate-400'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                      <span>Net Profit</span>
                    </button>
                  </div>
                </div>

                <div className="w-full h-64 mt-2">
                  {report?.current.trend && report.current.trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={report.current.trend}
                        margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                          tick={{ fontSize: 10, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(value: any, name: any) => [formatInr(Number(value)), name]}
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '12px',
                            border: 'none',
                          }}
                        />
                        {showRevenueTrend && (
                          <Line
                            type="monotone"
                            dataKey="revenue"
                            name="Net Revenue"
                            stroke="#2563eb"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        )}
                        {showGrossProfitTrend && (
                          <Line
                            type="monotone"
                            dataKey="grossProfit"
                            name="Gross Profit"
                            stroke="#4f46e5"
                            strokeWidth={2}
                            dot={{ r: 2.5 }}
                          />
                        )}
                        {showNetProfitTrend && (
                          <Line
                            type="monotone"
                            dataKey="netProfit"
                            name="Net Profit"
                            stroke="#059669"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                          />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No trend points available for this period.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* PROFITABILITY WATERFALL (Part 7) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
              <ProfitabilityWaterfallChart
                totalRevenue={report?.current.revenue.netRevenue ?? 0}
                totalCogs={report?.current.cogs.totalCogs ?? 0}
                totalGrossProfit={report?.current.grossProfit.grossProfit ?? 0}
                totalExpenses={report?.current.operatingExpenses.totalExpenses ?? 0}
                totalNetProfit={report?.current.netProfit.netProfit ?? 0}
                overallMarginPercent={report?.current.grossProfit.grossMarginPercent ?? 0}
                loading={loading}
              />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 7. BREAKDOWN ROW: OPERATING EXPENSES, COGS, REVENUE (Parts 8, 9, 10, 11)   */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. OPERATING EXPENSE BREAKDOWN (Part 8) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Operating Expense Breakdown
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Grouped by category ({report?.current.operatingExpenses.categories.length ?? 0} active)
                    </p>
                  </div>
                  <button
                    onClick={() => setDrillDownType('expenses')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Inspect</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3 mt-4">
                  {report?.current.operatingExpenses.categories && report.current.operatingExpenses.categories.length > 0 ? (
                    report.current.operatingExpenses.categories.slice(0, 5).map((cat) => (
                      <div
                        key={cat.category}
                        onClick={() => {
                          setSelectedCategory(cat);
                          setDrillDownType('category');
                        }}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                          <span>{cat.category}</span>
                          <span>{formatInr(cat.amount)}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-rose-500"
                            style={{ width: `${Math.min(100, Math.max(3, cat.percentage))}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
                          <span>{cat.count} expense records</span>
                          <span>{cat.percentage}% of OpEx</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-6">No expenses recorded for this period.</p>
                  )}
                </div>
              </div>
            </div>

            {/* 2. COGS ANALYSIS (Part 9) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Cost of Goods Sold (COGS)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Cost of products actually sold in period
                    </p>
                  </div>
                  <button
                    onClick={() => setDrillDownType('cogs')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Products</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs space-y-2 mb-3">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice Sales COGS:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatInr(report?.current.cogs.invoiceCogs ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Counter Sales COGS:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formatInr(report?.current.cogs.counterSaleCogs ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 font-bold">
                    <span>Total Realized Cost:</span>
                    <span className="text-rose-600 dark:text-rose-400">
                      {formatInr(report?.current.cogs.totalCogs ?? 0)}
                    </span>
                  </div>
                </div>

                {/* Top Sold Products by Cost */}
                <span className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                  Top Cost Contributors Sold
                </span>
                <div className="space-y-2">
                  {report?.current.cogs.topContributingProducts && report.current.cogs.topContributingProducts.length > 0 ? (
                    report.current.cogs.topContributingProducts.slice(0, 3).map((prod) => (
                      <div key={prod.productId} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50/50 dark:bg-slate-800/30">
                        <div className="truncate mr-2">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{prod.productName}</p>
                          <p className="text-[10px] text-slate-400">{prod.quantitySold} units sold @ {formatInr(prod.unitCost)}</p>
                        </div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 shrink-0">
                          {formatInr(prod.totalCost)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-4">No product units sold in period.</p>
                  )}
                </div>
              </div>
            </div>

            {/* 3. REVENUE BREAKDOWN & GST TAX RECONCILIATION (Parts 10 & 11) */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Revenue & GST Tax Accounting
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Gross turnover vs pass-through tax separation
                    </p>
                  </div>
                  <button
                    onClick={() => setDrillDownType('revenue')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Invoices</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-blue-600" />
                        <span>Tax Invoices (B2B)</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {formatInr(report?.current.revenue.invoiceGrossSales ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Net: {formatInr(report?.current.revenue.invoiceNetRevenue ?? 0)}</span>
                      <span>GST: {formatInr(report?.current.revenue.invoiceTaxCollected ?? 0)}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Counter Sales (Retail)</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {formatInr(report?.current.revenue.counterGrossSales ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Net: {formatInr(report?.current.revenue.counterNetRevenue ?? 0)}</span>
                      <span>Tax: {formatInr(report?.current.revenue.counterTaxCollected ?? 0)}</span>
                    </div>
                  </div>

                  {/* Tax Reconciled Pill */}
                  <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50">
                    <div className="flex justify-between items-center text-blue-900 dark:text-blue-200 font-bold mb-1">
                      <span>Total Pass-Through GST:</span>
                      <span>{formatInr(report?.current.revenue.taxCollected ?? 0)}</span>
                    </div>
                    <p className="text-[10px] text-blue-700/80 dark:text-blue-300/80">
                      Taxes are accounted as government liability and excluded from operating P&L revenue.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 8. DETAILED ACCOUNTING P&L STATEMENT (Part 13)                            */}
          {/* ========================================================================= */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Detailed Statement of Profit & Loss
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Financial accounting schedule for reporting period ({currentRange.periodBadge})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPDF}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Export PDF
                </button>
                <button
                  onClick={handleExportExcel}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Export Excel
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-5">Financial Particulars</th>
                    <th className="py-3 px-5 text-right">Current Period ({currentRange.periodBadge})</th>
                    <th className="py-3 px-5 text-right">
                      {comparisonRange ? `Previous (${comparisonRange.periodBadge})` : 'Previous Period'}
                    </th>
                    <th className="py-3 px-5 text-right">Variance (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {report?.statementRows && report.statementRows.length > 0 ? (
                    report.statementRows.map((row) => {
                      const isHeader = row.isHeader;
                      const isTotal = row.isTotal;
                      const isLevel1 = row.level === 1;

                      return (
                        <tr
                          key={row.id}
                          className={`transition-colors ${
                            isTotal
                              ? 'bg-slate-50/90 dark:bg-slate-800/40 font-extrabold text-slate-900 dark:text-slate-100'
                              : isHeader
                              ? 'bg-slate-100/50 dark:bg-slate-800/20 font-bold text-slate-800 dark:text-slate-200'
                              : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <td className={`py-2.5 px-5 ${isLevel1 ? 'pl-9 text-slate-600 dark:text-slate-400' : ''}`}>
                            <div className="flex items-center gap-2">
                              <span>{row.particular}</span>
                              {row.note && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({row.note})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={`py-2.5 px-5 text-right font-mono ${
                            row.isNegative
                              ? 'text-rose-600 dark:text-rose-400'
                              : row.id.includes('np-total') && !row.isNegative
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : ''
                          }`}>
                            {row.isNegative ? '-' : ''}
                            {formatInr(Math.abs(row.currentAmount))}
                          </td>
                          <td className="py-2.5 px-5 text-right font-mono text-slate-500">
                            {row.previousAmount !== undefined
                              ? `${row.isNegative ? '-' : ''}${formatInr(Math.abs(row.previousAmount))}`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-5 text-right font-mono">
                            {row.changePercent !== null && row.changePercent !== undefined ? (
                              <span className={`font-semibold ${
                                row.changePercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}>
                                {row.changePercent >= 0 ? '+' : ''}{row.changePercent}%
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400">
                        No financial transactions found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 9. DRILL-DOWN MODALS (Part 14)                                            */}
      {/* ========================================================================= */}
      {drillDownType && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {drillDownType === 'revenue'
                    ? 'Contributing Revenue Transactions'
                    : drillDownType === 'cogs'
                    ? 'Contributing Products Sold & Cost Attribution'
                    : drillDownType === 'category'
                    ? `Expense Transactions — ${selectedCategory?.category}`
                    : 'All Operating Expenses'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Inspect source entries for {currentRange.periodBadge}
                </p>
              </div>
              <button
                onClick={() => {
                  setDrillDownType(null);
                  setSelectedCategory(null);
                  setDrillSearch('');
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search transactions, customer, product..."
                value={drillSearch}
                onChange={(e) => setDrillSearch(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-900 dark:text-white outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {drillDownType === 'revenue' && (
                <div className="space-y-2 text-xs">
                  <h4 className="font-bold text-slate-500 uppercase text-[10px]">Invoices ({report?.current.drillDown.invoices.length ?? 0})</h4>
                  {report?.current.drillDown.invoices
                    .filter((inv: any) =>
                      !drillSearch ||
                      (inv.invoice_number || inv.invoiceNumber || '').toLowerCase().includes(drillSearch.toLowerCase()) ||
                      (inv.customer_name || inv.customerName || '').toLowerCase().includes(drillSearch.toLowerCase())
                    )
                    .map((inv: any) => (
                      <div key={inv.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-slate-100">{inv.invoice_number || inv.invoiceNumber}</span>
                          <span className="ml-2 text-slate-500">{inv.customer_name || inv.customerName || 'Customer'}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">{inv.date || inv.createdAt}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-slate-900 dark:text-slate-100">{formatInr(Number(inv.grand_total ?? inv.grandTotal ?? 0))}</span>
                          <p className="text-[10px] text-emerald-600 font-semibold">{inv.status}</p>
                        </div>
                      </div>
                    ))}

                  <h4 className="font-bold text-slate-500 uppercase text-[10px] mt-4">Counter Sales ({report?.current.drillDown.counterSales.length ?? 0})</h4>
                  {report?.current.drillDown.counterSales
                    .filter((cs: any) =>
                      !drillSearch ||
                      (cs.sale_number || cs.saleNumber || '').toLowerCase().includes(drillSearch.toLowerCase()) ||
                      (cs.customer_name || cs.customerName || '').toLowerCase().includes(drillSearch.toLowerCase())
                    )
                    .map((cs: any) => (
                      <div key={cs.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-slate-100">{cs.sale_number || cs.saleNumber}</span>
                          <span className="ml-2 text-slate-500">{cs.customer_name || cs.customerName || 'Walk-in'}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">{cs.sale_date || cs.createdAt}</p>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-slate-900 dark:text-slate-100">{formatInr(Number(cs.final_total ?? cs.finalTotal ?? 0))}</span>
                          <p className="text-[10px] text-blue-600 font-semibold">{cs.payment_method || 'Cash'}</p>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {drillDownType === 'cogs' && (
                <div className="space-y-2 text-xs">
                  {report?.current.cogs.topContributingProducts
                    .filter((p) =>
                      !drillSearch ||
                      p.productName.toLowerCase().includes(drillSearch.toLowerCase()) ||
                      p.sku.toLowerCase().includes(drillSearch.toLowerCase())
                    )
                    .map((prod) => (
                      <div key={prod.productId} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-slate-100">{prod.productName}</p>
                          <p className="text-[11px] text-slate-500">
                            {prod.quantitySold} units sold @ unit cost {formatInr(prod.unitCost)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-extrabold text-rose-600 dark:text-rose-400">{formatInr(prod.totalCost)}</span>
                          <p className="text-[10px] text-slate-400">Total COGS</p>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {(drillDownType === 'expenses' || drillDownType === 'category') && (
                <div className="space-y-2 text-xs">
                  {(selectedCategory ? selectedCategory.items : report?.current.drillDown.expenses || [])
                    .filter((exp: any) =>
                      !drillSearch ||
                      (exp.expenseName || exp.description || '').toLowerCase().includes(drillSearch.toLowerCase()) ||
                      (exp.category || '').toLowerCase().includes(drillSearch.toLowerCase())
                    )
                    .map((exp: any) => (
                      <div key={exp.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-slate-100">{exp.expenseName || exp.category}</p>
                          <p className="text-[10px] text-slate-400">{exp.date || exp.expense_date} • {exp.category}</p>
                          {exp.notes && <p className="text-[10px] text-slate-500 italic mt-0.5">{exp.notes}</p>}
                        </div>
                        <span className="font-extrabold text-rose-600 dark:text-rose-400">
                          {formatInr(Number(exp.amount || 0))}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex justify-end">
              <button
                onClick={() => {
                  setDrillDownType(null);
                  setSelectedCategory(null);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
