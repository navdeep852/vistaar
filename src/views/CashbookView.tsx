import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Plus,
  Filter,
  Calendar,
  Search,
  Building2,
  QrCode,
  CreditCard,
  Banknote,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  HelpCircle,
  Settings2,
} from 'lucide-react';
import { cashbookService } from '../services/supabase/cashbookService';
import { financialAccountService } from '../services/supabase/financialAccountService';
import {
  DaybookTransaction,
  FinancialAccount,
  FinancialAccountType,
  CashbookFilterOptions,
  CashbookSummaryMetrics,
} from '../types';
import { showToast } from '../components/Toast';

export const CashbookView: React.FC = () => {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<DaybookTransaction[]>([]);
  const [metrics, setMetrics] = useState<CashbookSummaryMetrics>({
    totalOpeningBalance: 0,
    totalReceipts: 0,
    totalPayments: 0,
    totalTransfers: 0,
    totalClosingBalance: 0,
    accountSummaries: [],
  });
  const [loading, setLoading] = useState(true);

  // Filter States
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [selectedFY, setSelectedFY] = useState<string>('CURRENT_FY');
  const [dateRangePreset, setDateRangePreset] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals State
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [manualEntryModalOpen, setManualEntryModalOpen] = useState(false);
  const [accountManageModalOpen, setAccountManageModalOpen] = useState(false);
  const [selectedTxDetail, setSelectedTxDetail] = useState<DaybookTransaction | null>(null);

  // Transfer Form State
  const [transferSourceAcc, setTransferSourceAcc] = useState<string>('');
  const [transferTargetAcc, setTransferTargetAcc] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');

  // Account Form State
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<FinancialAccountType>('BANK');
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newAccIFSC, setNewAccIFSC] = useState('');
  const [newAccOpeningBal, setNewAccOpeningBal] = useState('0');

  // Manual Entry Form State
  const [entryType, setEntryType] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');
  const [entryAmount, setEntryAmount] = useState('');
  const [entryAccountId, setEntryAccountId] = useState('');
  const [entryPartyName, setEntryPartyName] = useState('');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryGstApplicable, setEntryGstApplicable] = useState(false);
  const [entryGstin, setEntryGstin] = useState('');

  // Fetch initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const fetchedAccounts = await financialAccountService.getAccounts();
      setAccounts(fetchedAccounts);

      if (fetchedAccounts.length > 0 && !transferSourceAcc) {
        setTransferSourceAcc(fetchedAccounts[0].id);
        if (fetchedAccounts.length > 1) {
          setTransferTargetAcc(fetchedAccounts[1].id);
        }
      }

      const options: CashbookFilterOptions = {
        financialAccountId: selectedAccountId,
        financialYear: selectedFY,
        dateRange: dateRangePreset as any,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: searchQuery || undefined,
      };

      const txResult = await cashbookService.getTransactions(options);
      setTransactions(txResult.data || []);

      const summaryResult = await cashbookService.getSummaryMetrics(options);
      setMetrics(summaryResult);
    } catch (e) {
      showToast('Failed to load Cashbook data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedAccountId, selectedFY, dateRangePreset, startDate, endDate, searchQuery]);

  // Compute Indian Financial Year Label
  const fyInfo = useMemo(() => {
    return cashbookService.getFinancialYearBounds(selectedFY);
  }, [selectedFY]);

  // Account Type Icons Map
  const getAccountIcon = (type: FinancialAccountType) => {
    switch (type) {
      case 'CASH':
        return Banknote;
      case 'BANK':
        return Building2;
      case 'UPI':
        return QrCode;
      case 'CARD':
        return CreditCard;
      default:
        return Wallet;
    }
  };

  // Handle Inter-Account Transfer Submission
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseFloat(transferAmount);
    if (isNaN(numAmt) || numAmt <= 0) {
      showToast('Please enter a valid transfer amount.', 'error');
      return;
    }
    if (transferSourceAcc === transferTargetAcc) {
      showToast('Source and Target accounts must be different.', 'error');
      return;
    }

    const res = await cashbookService.transferFunds({
      sourceAccountId: transferSourceAcc,
      targetAccountId: transferTargetAcc,
      amount: numAmt,
      notes: transferNotes.trim() || undefined,
    });

    if (res.success) {
      showToast(`Transferred ₹${numAmt.toLocaleString('en-IN')} successfully!`, 'success');
      setTransferModalOpen(false);
      setTransferAmount('');
      setTransferNotes('');
      loadData();
    } else {
      showToast(res.error || 'Transfer failed.', 'error');
    }
  };

  // Handle New Account Creation
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) {
      showToast('Account name is required.', 'error');
      return;
    }

    const res = await financialAccountService.createAccount({
      name: newAccName.trim(),
      accountType: newAccType,
      accountNumber: newAccNumber.trim() || undefined,
      ifscCode: newAccIFSC.trim() || undefined,
      openingBalance: parseFloat(newAccOpeningBal) || 0,
    });

    if (res.success) {
      showToast(`Account "${newAccName}" created successfully!`, 'success');
      setNewAccName('');
      setNewAccNumber('');
      setNewAccIFSC('');
      setNewAccOpeningBal('0');
      setAccountManageModalOpen(false);
      loadData();
    } else {
      showToast(res.error || 'Failed to create account.', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Top Banner & Main Actions */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-indigo-950 p-6 rounded-3xl text-white shadow-xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <Wallet className="w-4 h-4" />
            <span>Liquidity & Cashbook Management</span>
            <span className="bg-emerald-900/60 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full border border-emerald-700/50">
              {fyInfo.label}
            </span>
          </div>
          <h2 className="text-3xl font-extrabold mt-1 text-white">
            ₹{metrics.totalClosingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Total Financial Account Balance (Cash, Bank, UPI & Cards)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setTransferModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/10 transition-colors"
          >
            <ArrowRightLeft className="w-4 h-4 text-amber-400" />
            <span>⇄ Transfer Funds</span>
          </button>

          <button
            onClick={() => setAccountManageModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/10 transition-colors"
          >
            <Settings2 className="w-4 h-4 text-blue-400" />
            <span>Manage Accounts</span>
          </button>
        </div>
      </div>

      {/* Financial Accounts Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.accountSummaries.map((summary) => {
          const acc = summary.account;
          const IconComponent = getAccountIcon(acc.accountType);
          const isSelected = selectedAccountId === acc.id;

          return (
            <div
              key={acc.id}
              onClick={() => setSelectedAccountId(isSelected ? 'ALL' : acc.id)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-card flex flex-col justify-between ${
                isSelected
                  ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate max-w-[140px]">
                  {acc.name}
                </span>
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    acc.accountType === 'CASH'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : acc.accountType === 'BANK'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                      : acc.accountType === 'UPI'
                      ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <IconComponent className="w-4 h-4" />
                </div>
              </div>

              <div className="mt-4">
                <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  ₹{summary.closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </h3>
                <div className="flex items-center justify-between mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <span>Op. Bal: ₹{summary.openingBalance.toLocaleString('en-IN')}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">+₹{summary.totalReceipts.toLocaleString('en-IN')}</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">-₹{summary.totalPayments.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter Toolbar & Account Selector */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Cashbook Filters</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedAccountId('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                selectedAccountId === 'ALL'
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              All Accounts
            </button>
            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  selectedAccountId === acc.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {acc.name}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Indian Financial Year Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">
              Indian Financial Year
            </label>
            <select
              value={selectedFY}
              onChange={(e) => setSelectedFY(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium text-slate-900 dark:text-slate-100"
            >
              <option value="CURRENT_FY">Current FY (2026–27)</option>
              <option value="PREVIOUS_FY">Previous FY (2025–26)</option>
              <option value="ALL">All Time</option>
            </select>
          </div>

          {/* Date Range Presets */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">
              Date Preset
            </label>
            <select
              value={dateRangePreset}
              onChange={(e) => setDateRangePreset(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium text-slate-900 dark:text-slate-100"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">
              Search Transactions
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Party name, reference #, cheque #, GSTIN..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Cashbook Transactions Log Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Money Movement Journal ({transactions.length} Records)
          </h3>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            Net Cash Movement: ₹{(metrics.totalReceipts - metrics.totalPayments).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Account</th>
                <th className="p-3.5">Transaction Type</th>
                <th className="p-3.5">Party / Reference</th>
                <th className="p-3.5 text-right">Receipt (+₹)</th>
                <th className="p-3.5 text-right">Payment (-₹)</th>
                <th className="p-3.5 text-center">GST Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    <p className="font-medium">No Cashbook transactions found for active filters.</p>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isReceipt = tx.direction === 'IN';
                  const isTransfer = tx.transactionType === 'TRANSFER';
                  const acc = accounts.find((a) => a.id === tx.financialAccountId);

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTxDetail(tx)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="p-3.5 whitespace-nowrap font-medium text-slate-600 dark:text-slate-400">
                        {tx.transactionDate}
                      </td>

                      <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                        {acc ? acc.name : tx.paymentMode || 'Cash'}
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                            isTransfer
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                              : isReceipt
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                          }`}
                        >
                          {isTransfer ? (
                            <ArrowRightLeft className="w-3 h-3" />
                          ) : isReceipt ? (
                            <ArrowDownLeft className="w-3 h-3" />
                          ) : (
                            <ArrowUpRight className="w-3 h-3" />
                          )}
                          <span>{tx.transactionType.replace('_', ' ')}</span>
                        </span>
                      </td>

                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{tx.partyName || '—'}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {tx.referenceNumber || tx.transactionCode}
                        </div>
                      </td>

                      <td className="p-3.5 text-right font-extrabold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {isReceipt && !isTransfer ? `+₹${tx.amount.toLocaleString('en-IN')}` : '—'}
                      </td>

                      <td className="p-3.5 text-right font-extrabold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {!isReceipt && !isTransfer ? `-₹${tx.amount.toLocaleString('en-IN')}` : isTransfer ? `₹${tx.amount.toLocaleString('en-IN')}` : '—'}
                      </td>

                      <td className="p-3.5 text-center">
                        {tx.gstApplicable ? (
                          <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            GST Preserved
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Non-GST</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INTER-ACCOUNT FUND TRANSFER MODAL */}
      {transferModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-extrabold text-base">
                <ArrowRightLeft className="w-5 h-5 text-amber-500" />
                <span>Inter-Account Fund Transfer</span>
              </div>
              <button onClick={() => setTransferModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  From (Source Account) *
                </label>
                <select
                  value={transferSourceAcc}
                  onChange={(e) => setTransferSourceAcc(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-900 dark:text-slate-100"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Bal: ₹{(a.currentBalance || a.openingBalance).toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  To (Target Account) *
                </label>
                <select
                  value={transferTargetAcc}
                  onChange={(e) => setTransferTargetAcc(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-900 dark:text-slate-100"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Bal: ₹{(a.currentBalance || a.openingBalance).toLocaleString('en-IN')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Transfer Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-base font-extrabold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Notes / Reference
                </label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="Cash withdrawal for shop / Deposit..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTransferModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-extrabold shadow-lg shadow-amber-600/30"
                >
                  Confirm Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE FINANCIAL ACCOUNTS MODAL */}
      {accountManageModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-extrabold text-base">
                <Building2 className="w-5 h-5 text-blue-600" />
                <span>Financial Account Management</span>
              </div>
              <button onClick={() => setAccountManageModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
              <h4 className="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                + Create New Account
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                    placeholder="e.g. HDFC Bank, Shop UPI"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Account Type *
                  </label>
                  <select
                    value={newAccType}
                    onChange={(e) => setNewAccType(e.target.value as FinancialAccountType)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-900 dark:text-slate-100"
                  >
                    <option value="BANK">Bank Account</option>
                    <option value="CASH">Cash Account</option>
                    <option value="UPI">UPI Account</option>
                    <option value="CARD">Card POS</option>
                    <option value="OTHER">Other Account</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Opening Balance (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newAccOpeningBal}
                    onChange={(e) => setNewAccOpeningBal(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Account No. / UPI VPA
                  </label>
                  <input
                    type="text"
                    value={newAccNumber}
                    onChange={(e) => setNewAccNumber(e.target.value)}
                    placeholder="e.g. 5010029302"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl font-medium text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAccountManageModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold shadow-lg shadow-blue-600/30"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRANSACTION AUDIT DETAIL MODAL */}
      {selectedTxDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-extrabold text-base">
                <FileText className="w-5 h-5 text-emerald-600" />
                <span>Cashbook Transaction Audit</span>
              </div>
              <button onClick={() => setSelectedTxDetail(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Amount</span>
                  <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                    ₹{selectedTxDetail.amount.toLocaleString('en-IN')}
                  </h3>
                </div>
                <span
                  className={`px-3 py-1 rounded-xl text-xs font-extrabold ${
                    selectedTxDetail.direction === 'IN'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {selectedTxDetail.direction === 'IN' ? 'Receipt (+₹)' : 'Payment (-₹)'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-slate-700 dark:text-slate-300">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Date & Time</span>
                  <span className="font-bold">{selectedTxDetail.transactionDate} {selectedTxDetail.transactionTime || ''}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Transaction Code</span>
                  <span className="font-mono font-bold">{selectedTxDetail.transactionCode}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Party</span>
                  <span className="font-bold">{selectedTxDetail.partyName || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Payment Mode</span>
                  <span className="font-bold">{selectedTxDetail.paymentMode}</span>
                </div>
              </div>

              {selectedTxDetail.gstApplicable && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-2">
                  <h4 className="font-extrabold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider text-[11px]">
                    Preserved GST Metadata
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-indigo-800 dark:text-indigo-300">
                    <div>Taxable: ₹{(selectedTxDetail.taxableAmount || 0).toLocaleString('en-IN')}</div>
                    <div>Total Tax: ₹{(selectedTxDetail.totalTaxAmount || 0).toLocaleString('en-IN')}</div>
                    <div>CGST: ₹{(selectedTxDetail.cgstAmount || 0).toLocaleString('en-IN')}</div>
                    <div>SGST: ₹{(selectedTxDetail.sgstAmount || 0).toLocaleString('en-IN')}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedTxDetail(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-extrabold text-xs"
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
