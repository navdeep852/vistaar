import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Calendar,
  Filter,
  Search,
  Plus,
  RefreshCw,
  Eye,
  Trash2,
  X,
  CreditCard,
  Building,
  Smartphone,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react';
import { daybookService } from '../services/supabase/daybookService';
import { DaybookTransaction, DaybookFilterOptions, DaybookSummaryMetrics } from '../types';
import { showToast } from '../components/Toast';

export const DaybookView: React.FC = () => {


  const [transactions, setTransactions] = useState<DaybookTransaction[]>([]);
  const [metrics, setMetrics] = useState<DaybookSummaryMetrics>({
    totalInflow: 0,
    totalOutflow: 0,
    netMovement: 0,
    totalCount: 0,
    modeBreakdown: {},
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Filters State
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom'>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [transactionType, setTransactionType] = useState('ALL');
  const [paymentMode, setPaymentMode] = useState('ALL');
  const [search, setSearch] = useState('');

  // Modals
  const [selectedTx, setSelectedTx] = useState<DaybookTransaction | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [txToVoid, setTxToVoid] = useState<DaybookTransaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);

  // Manual Transaction Form State
  const [manualType, setManualType] = useState<'OTHER_INCOME' | 'EXPENSE' | 'OTHER_PAYMENT' | 'ADJUSTMENT' | 'SUPPLIER_PAYMENT'>('OTHER_INCOME');
  const [manualDirection, setManualDirection] = useState<'IN' | 'OUT'>('IN');
  const [manualAmount, setManualAmount] = useState('');
  const [manualMode, setManualMode] = useState('Cash');
  const [manualParty, setManualParty] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);

  const loadData = async () => {
    setLoading(true);
    try {
      const opts: DaybookFilterOptions = {
        dateRange,
        startDate: dateRange === 'custom' ? startDate : undefined,
        endDate: dateRange === 'custom' ? endDate : undefined,
        transactionType,
        paymentMode,
        search,
      };

      const [txRes, metRes] = await Promise.all([
        daybookService.getTransactions(opts),
        daybookService.getSummaryMetrics(opts),
      ]);

      setTransactions(txRes.data || []);
      setMetrics(metRes);
    } catch (err: any) {
      showToast(err.message || 'Failed to load Daybook transactions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange, startDate, endDate, transactionType, paymentMode]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const handleSyncHistorical = async () => {
    setSyncing(true);
    try {
      const { syncedCount } = await daybookService.syncHistoricalTransactions();
      showToast(`Synchronized ${syncedCount} historical financial transactions!`, 'success');
      await loadData();
    } catch (e: any) {
      showToast(e.message || 'Failed to sync historical data', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleTypeChange = (type: any) => {
    setManualType(type);
    if (type === 'OTHER_INCOME') setManualDirection('IN');
    else if (type === 'EXPENSE' || type === 'OTHER_PAYMENT' || type === 'SUPPLIER_PAYMENT') setManualDirection('OUT');
  };

  const handleCreateManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(manualAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Please enter a valid positive amount', 'error');
      return;
    }
    if (!manualDescription.trim()) {
      showToast('Please enter a transaction description', 'error');
      return;
    }

    setSubmittingManual(true);
    try {
      const res = await daybookService.createManualTransaction({
        transactionType: manualType as any,
        direction: manualDirection,
        amount: amt,
        paymentMode: manualMode as any,
        partyName: manualParty.trim() || undefined,
        description: manualDescription.trim(),
        notes: manualNotes.trim() || undefined,
        transactionDate: manualDate,
      });

      if (res.success) {
        showToast('Financial transaction recorded successfully!', 'success');
        setIsManualModalOpen(false);
        // Reset form
        setManualAmount('');
        setManualParty('');
        setManualDescription('');
        setManualNotes('');
        await loadData();
      } else {
        showToast(res.error || 'Failed to record transaction', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error creating transaction', 'error');
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleConfirmVoid = async () => {
    if (!txToVoid) return;
    try {
      const res = await daybookService.voidTransaction(txToVoid.id, voidReason);
      if (res.success) {
        showToast('Transaction voided successfully', 'success');
        setIsVoidModalOpen(false);
        setTxToVoid(null);
        setVoidReason('');
        await loadData();
      } else {
        showToast(res.error || 'Failed to void transaction', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error voiding transaction', 'error');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  const renderPaymentModeIcon = (mode: string) => {
    switch (mode) {
      case 'UPI':
        return <Smartphone className="w-3.5 h-3.5 text-purple-500" />;
      case 'Bank Transfer':
        return <Building className="w-3.5 h-3.5 text-blue-500" />;
      case 'Card':
        return <CreditCard className="w-3.5 h-3.5 text-indigo-500" />;
      default:
        return <Wallet className="w-3.5 h-3.5 text-emerald-500" />;
    }
  };

  const renderTypeBadge = (tx: DaybookTransaction) => {
    if (tx.status === 'VOID') {
      return (
        <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 line-through">
          VOIDED
        </span>
      );
    }

    const typeLabels: Record<string, string> = {
      SALE: 'Sale Inflow',
      CUSTOMER_PAYMENT: 'Customer Payment',
      SUPPLIER_PAYMENT: 'Supplier Payment',
      EXPENSE: 'Expense',
      REFUND: 'Refund',
      OTHER_INCOME: 'Other Income',
      OTHER_PAYMENT: 'Other Payment',
      ADJUSTMENT: 'Adjustment',
      TRANSFER: 'Transfer',
    };

    const isOut = tx.direction === 'OUT';
    const isNonCash = tx.direction === 'NON_CASH';

    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg ${
          isNonCash
            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            : isOut
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
        }`}
      >
        {isNonCash ? (
          <RefreshCw className="w-3 h-3 text-slate-500" />
        ) : isOut ? (
          <ArrowUpRight className="w-3 h-3 text-rose-500" />
        ) : (
          <ArrowDownLeft className="w-3 h-3 text-emerald-500" />
        )}
        {typeLabels[tx.transactionType] || tx.transactionType}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 rounded-xl">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Daybook Journal</h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Centralized financial journal tracking every inflow, outflow, and transaction event across your business.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleSyncHistorical}
            disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            title="Scan and synchronize past sales, expenses, and payments into Daybook"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-blue-500' : 'text-slate-500'}`} />
            <span>{syncing ? 'Syncing...' : 'Sync History'}</span>
          </button>

          <button
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Transaction</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Inflow Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Inflow (+₹)</span>
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {formatCurrency(metrics.totalInflow)}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              <span>Money received in chosen period</span>
            </p>
          </div>
        </div>

        {/* Total Outflow Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Outflow (-₹)</span>
            <div className="p-2 rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
              {formatCurrency(metrics.totalOutflow)}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1 font-medium">
              <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
              <span>Expenses & payments paid out</span>
            </p>
          </div>
        </div>

        {/* Net Movement Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Net Movement</span>
            <div className="p-2 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/80 dark:text-blue-400">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className={`text-2xl font-black tracking-tight ${metrics.netMovement >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-600 dark:text-rose-400'}`}>
              {formatCurrency(metrics.netMovement)}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Inflow minus Outflow balance
            </p>
          </div>
        </div>

        {/* Total Transactions Count Card */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Count</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Calendar className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {metrics.totalCount} <span className="text-xs font-medium text-slate-400">Entries</span>
            </h3>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {Object.entries(metrics.modeBreakdown).map(([mode, val]) => (
                <span key={mode} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  {renderPaymentModeIcon(mode)} {mode}: {formatCurrency(val)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Toolbar Area */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        {/* Preset Date Range Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Date:
          </span>
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'custom', label: 'Custom Range' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setDateRange(btn.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                dateRange === btn.id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Custom Date Pickers */}
        {dateRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        )}

        {/* Dropdowns & Search Form */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* Transaction Type Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
              Transaction Type
            </label>
            <select
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ALL">All Types</option>
              <option value="SALE">Sale Inflows</option>
              <option value="CUSTOMER_PAYMENT">Customer Payments</option>
              <option value="SUPPLIER_PAYMENT">Supplier Payments</option>
              <option value="EXPENSE">Expenses</option>
              <option value="REFUND">Refunds</option>
              <option value="OTHER_INCOME">Other Income</option>
              <option value="OTHER_PAYMENT">Other Payment</option>
              <option value="ADJUSTMENT">Adjustments</option>
            </select>
          </div>

          {/* Payment Mode Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
              Payment Mode
            </label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="ALL">All Payment Modes</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Card">Card</option>
              <option value="Cheque">Cheque</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="sm:col-span-2 lg:col-span-2 flex items-end gap-2">
            <div className="relative flex-1">
              <label className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by party, ref #, description..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer h-[34px]"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Main Transactions Table (Desktop) & Card List (Mobile) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-xs font-medium text-slate-500">Loading Daybook journal transactions...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No Transactions Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no financial transactions recorded for the selected date range and filter options.
            </p>
            <button
              onClick={() => setIsManualModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer mt-2"
            >
              <Plus className="w-4 h-4" /> Record First Transaction
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-5 py-3.5">Date & Code</th>
                    <th className="px-4 py-3.5">Type & Event</th>
                    <th className="px-4 py-3.5">Party / Customer / Vendor</th>
                    <th className="px-4 py-3.5">Description</th>
                    <th className="px-4 py-3.5">Mode</th>
                    <th className="px-4 py-3.5 text-right">Inflow (+₹)</th>
                    <th className="px-4 py-3.5 text-right">Outflow (-₹)</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                  {transactions.map((tx) => {
                    const isOut = tx.direction === 'OUT';
                    const isNonCash = tx.direction === 'NON_CASH';
                    const isVoided = tx.status === 'VOID';

                    return (
                      <tr
                        key={tx.id}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                          isVoided ? 'opacity-50 bg-slate-50/40 dark:bg-slate-950/40' : ''
                        }`}
                      >
                        {/* Date & Code */}
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{tx.transactionDate}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{tx.transactionCode}</div>
                        </td>

                        {/* Type Badge */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          {renderTypeBadge(tx)}
                          {tx.referenceNumber && (
                            <div className="text-[10px] text-slate-400 font-mono mt-1">Ref: {tx.referenceNumber}</div>
                          )}
                        </td>

                        {/* Party Name */}
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {tx.partyName || 'N/A'}
                          </div>
                          {tx.partyType && (
                            <span className="text-[10px] uppercase text-slate-400 font-medium tracking-wide">
                              {tx.partyType}
                            </span>
                          )}
                        </td>

                        {/* Description */}
                        <td className="px-4 py-4 max-w-xs truncate text-slate-600 dark:text-slate-300">
                          {tx.description || tx.notes || '—'}
                        </td>

                        {/* Payment Mode */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium">
                            {renderPaymentModeIcon(tx.paymentMode)}
                            {tx.paymentMode || 'Cash'}
                          </span>
                        </td>

                        {/* Inflow (+₹) */}
                        <td className="px-4 py-4 text-right whitespace-nowrap font-mono font-bold text-sm">
                          {!isOut && !isNonCash && !isVoided ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{formatCurrency(tx.amount)}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </td>

                        {/* Outflow (-₹) */}
                        <td className="px-4 py-4 text-right whitespace-nowrap font-mono font-bold text-sm">
                          {isOut && !isVoided ? (
                            <span className="text-rose-600 dark:text-rose-400">
                              -{formatCurrency(tx.amount)}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedTx(tx)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              title="View Transaction Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {!isVoided && (
                              <button
                                onClick={() => {
                                  setTxToVoid(tx);
                                  setIsVoidModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                                title="Void Financial Transaction"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((tx) => {
                const isOut = tx.direction === 'OUT';
                const isVoided = tx.status === 'VOID';

                return (
                  <div
                    key={tx.id}
                    className={`p-4 space-y-2.5 ${isVoided ? 'opacity-50 bg-slate-50/50 dark:bg-slate-950/50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">{tx.transactionDate}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{tx.transactionCode}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1">
                          {tx.partyName || 'Walk-in / General'}
                        </h4>
                      </div>
                      {renderTypeBadge(tx)}
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {tx.description || tx.notes || 'No description provided'}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
                        {renderPaymentModeIcon(tx.paymentMode)} {tx.paymentMode}
                      </span>

                      <div className="font-mono font-bold text-sm">
                        {isOut ? (
                          <span className="text-rose-600 dark:text-rose-400">-{formatCurrency(tx.amount)}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">+{formatCurrency(tx.amount)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Transaction Details Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Transaction Audit Details</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedTx.transactionCode}</p>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl">
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Transaction Type</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedTx.transactionType}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Financial Direction</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedTx.direction}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Amount</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                    {formatCurrency(selectedTx.amount)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Payment Mode</span>
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1 mt-0.5">
                    {renderPaymentModeIcon(selectedTx.paymentMode)} {selectedTx.paymentMode}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 py-1.5">
                  <span className="text-slate-500">Transaction Date:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedTx.transactionDate}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 py-1.5">
                  <span className="text-slate-500">Party / Contact Name:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedTx.partyName || 'N/A'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 py-1.5">
                  <span className="text-slate-500">Reference Type:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">{selectedTx.referenceType}</span>
                </div>
                {selectedTx.referenceNumber && (
                  <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 py-1.5">
                    <span className="text-slate-500">Reference Number:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{selectedTx.referenceNumber}</span>
                  </div>
                )}
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 py-1.5">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedTx.status}</span>
                </div>
              </div>

              {selectedTx.description && (
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px] mb-1">Description</span>
                  <p className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-slate-700 dark:text-slate-300">
                    {selectedTx.description}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedTx(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Manual Transaction Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Record Manual Financial Entry</h3>
                <p className="text-xs text-slate-500 mt-0.5">Add custom income, expense, or adjustment to Daybook</p>
              </div>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualSubmit} className="space-y-4 text-xs">
              {/* Type Select */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Transaction Category</label>
                <select
                  value={manualType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="OTHER_INCOME">Other Income (Money In +₹)</option>
                  <option value="EXPENSE">Expense (Money Out -₹)</option>
                  <option value="OTHER_PAYMENT">Other Outflow Payment (-₹)</option>
                  <option value="SUPPLIER_PAYMENT">Supplier Outflow Payment (-₹)</option>
                  <option value="ADJUSTMENT">Accounting Adjustment</option>
                </select>
              </div>

              {/* Amount & Mode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 font-mono font-bold text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Mode</label>
                  <select
                    value={manualMode}
                    onChange={(e) => setManualMode(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card">Card</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Party Name & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Party / Payee Name</label>
                  <input
                    type="text"
                    value={manualParty}
                    onChange={(e) => setManualParty(e.target.value)}
                    placeholder="Customer / Vendor / Name"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Transaction Date</label>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Description *</label>
                <input
                  type="text"
                  required
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="e.g. Office Stationery Purchase or Bonus Income"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManual}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingManual ? 'Saving...' : 'Record Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {isVoidModalOpen && txToVoid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Void Transaction?</h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Are you sure you want to void transaction <span className="font-mono font-bold">{txToVoid.transactionCode}</span> ({formatCurrency(txToVoid.amount)})? This will remove it from financial totals without deleting audit history.
            </p>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Reason for Voiding</label>
              <input
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Duplicate entry or customer cancellation"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsVoidModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmVoid}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
