import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingDown,
  Plus,
  Search,
  Calendar,
  Filter,
  X,
  Edit2,
  Trash2,
  AlertCircle,
  RotateCcw,
  Receipt,
  CalendarRange,
  Wallet,
} from 'lucide-react';
import { store } from '../services/store';
import { Expense, ExpenseCategory } from '../types';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';
import { DedicatedWorkspace } from '../components/DedicatedWorkspace';

const MONTH_OPTIONS = [
  { value: 'ALL', label: 'All Months' },
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

// Helper to format date string YYYY-MM-DD safely
function getTodayStr(): string {
  const d = new Date();
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

// Get Monday to Sunday bounds for a given YYYY-MM-DD date string (Defensive)
function getWeekBounds(dateStr?: string) {
  const safeDateStr = dateStr && typeof dateStr === 'string' && dateStr.includes('-') ? dateStr : getTodayStr();
  const [y, m, d] = safeDateStr.split('-').map(Number);
  
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    const today = new Date();
    const mondayObj = new Date(today);
    mondayObj.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
    return { mondayStr: '', sundayStr: '', formattedRange: '', mondayObj };
  }

  const dateObj = new Date(y, m - 1, d);
  const day = dateObj.getDay(); // 0 = Sun, 1 = Mon...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const mondayObj = new Date(dateObj);
  mondayObj.setDate(dateObj.getDate() + diffToMonday);

  const sundayObj = new Date(mondayObj);
  sundayObj.setDate(mondayObj.getDate() + 6);

  const formatYMD = (dt: Date) => {
    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  const mondayStr = formatYMD(mondayObj);
  const sundayStr = formatYMD(sundayObj);

  const formatShort = (dt: Date) => {
    return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const formattedRange = `${formatShort(mondayObj)} – ${formatShort(sundayObj)}`;

  return { mondayStr, sundayStr, formattedRange, mondayObj };
}

// Format nice date, e.g. "23 Aug 2026" (Defensive)
function formatNiceDate(dateStr?: string): string {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) {
    return '—';
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Format month & year, e.g. "August 2026" (Defensive)
function formatMonthYear(dateStr?: string): string {
  if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) {
    return '—';
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

interface ExpensesViewProps {
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({ onNavigateTab, activeTab }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Form State
  const [category, setCategory] = useState<ExpenseCategory>('Rent');
  const [expenseName, setExpenseName] = useState('');
  const [expenseNameError, setExpenseNameError] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(getTodayStr());
  const [paidTo, setPaidTo] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');

  // Filter States
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterYear, setFilterYear] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');

  const settings = store.getSettings();

  useEffect(() => {
    const updateData = () => {
      const fetched = store.getExpenses();
      setExpenses(Array.isArray(fetched) ? fetched : []);
    };
    updateData();
    return store.subscribe(updateData);
  }, []);

  // Compute available years dynamically from existing expense records + current year
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    const yearsSet = new Set<string>([currentYear]);
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    safeExpenses.forEach((e) => {
      if (e && e.date && typeof e.date === 'string') {
        const y = e.date.split('-')[0];
        if (y && y.length === 4) yearsSet.add(y);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  // GLOBAL KPI CALCULATIONS (Must remain independent of history filters)
  const kpiData = useMemo(() => {
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const todayStr = getTodayStr();

    // Yesterday
    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yr = yesterdayObj.getFullYear();
    const mo = String(yesterdayObj.getMonth() + 1).padStart(2, '0');
    const da = String(yesterdayObj.getDate()).padStart(2, '0');
    const yesterdayStr = `${yr}-${mo}-${da}`;

    // Today KPI
    const todayTotal = safeExpenses
      .filter((e) => e && e.date === todayStr)
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    const yesterdayTotal = safeExpenses
      .filter((e) => e && e.date === yesterdayStr)
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    // Week bounds
    const { mondayStr, sundayStr, formattedRange, mondayObj } = getWeekBounds(todayStr);

    // Prev week bounds
    const prevWeekMon = new Date(mondayObj);
    prevWeekMon.setDate(mondayObj.getDate() - 7);
    const prevWeekSun = new Date(prevWeekMon);
    prevWeekSun.setDate(prevWeekMon.getDate() + 6);

    const formatYMD = (dt: Date) => {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const prevWeekMondayStr = formatYMD(prevWeekMon);
    const prevWeekSundayStr = formatYMD(prevWeekSun);

    const thisWeekTotal = safeExpenses
      .filter((e) => e && e.date && e.date >= mondayStr && e.date <= sundayStr)
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    const lastWeekTotal = safeExpenses
      .filter((e) => e && e.date && e.date >= prevWeekMondayStr && e.date <= prevWeekSundayStr)
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    // Month bounds
    const thisMonthPrefix = todayStr.substring(0, 7); // e.g. "2026-08"

    const prevMonthObj = new Date();
    prevMonthObj.setMonth(prevMonthObj.getMonth() - 1);
    const prevMonthPrefix = formatYMD(prevMonthObj).substring(0, 7);

    const thisMonthTotal = safeExpenses
      .filter((e) => e && e.date && e.date.startsWith(thisMonthPrefix))
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    const lastMonthTotal = safeExpenses
      .filter((e) => e && e.date && e.date.startsWith(prevMonthPrefix))
      .reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

    // Helper for trend %
    const calcTrend = (current: number, previous: number) => {
      if (previous <= 0) return null;
      const pct = ((current - previous) / previous) * 100;
      return {
        pct: Math.abs(pct).toFixed(1),
        isUp: pct > 0,
      };
    };

    return {
      todayStr,
      todayTotal,
      todayTrend: calcTrend(todayTotal, yesterdayTotal),
      thisWeekTotal,
      weekFormattedRange: formattedRange,
      weekTrend: calcTrend(thisWeekTotal, lastWeekTotal),
      thisMonthTotal,
      monthFormatted: formatMonthYear(todayStr),
      monthTrend: calcTrend(thisMonthTotal, lastMonthTotal),
    };
  }, [expenses]);

  // Modal handlers
  const openAddModal = () => {
    setEditingExpenseId(null);
    setCategory('Rent');
    setExpenseName('');
    setExpenseNameError('');
    setAmount('');
    setDate(getTodayStr());
    setPaidTo('');
    setReferenceNo('');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (exp: Expense) => {
    if (!exp) return;
    setEditingExpenseId(exp.id);
    setCategory(exp.category || 'Rent');
    setExpenseName(exp.expenseName || '');
    setExpenseNameError('');
    setAmount(exp.amount !== undefined ? exp.amount.toString() : '');
    setDate(exp.date || getTodayStr());
    setPaidTo(exp.paidTo || '');
    setReferenceNo(exp.referenceNo || '');
    setNotes(exp.notes || '');
    setModalOpen(true);
  };

  // Category Change Handler
  const handleCategoryChange = (newCat: ExpenseCategory) => {
    setCategory(newCat);
    if (newCat !== 'Other') {
      setExpenseName('');
      setExpenseNameError('');
    }
  };

  // Form Submission
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();

    let hasError = false;

    if (category === 'Other' && !expenseName.trim()) {
      setExpenseNameError('Please enter the expense name.');
      hasError = true;
    } else {
      setExpenseNameError('');
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Amount must be greater than zero.', 'error');
      hasError = true;
    }

    if (hasError) return;

    const payload = {
      category,
      expenseName: category === 'Other' ? expenseName.trim() : undefined,
      amount: numAmount,
      date: date || getTodayStr(),
      paidTo: paidTo.trim() || undefined,
      referenceNo: referenceNo.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    if (editingExpenseId) {
      store.updateExpense(editingExpenseId, payload);
      showToast('Expense updated successfully!', 'success');
    } else {
      store.addExpense(payload);
      const catLabel = category === 'Other' ? `Other (${expenseName.trim()})` : category;
      showToast(`Recorded expense of ${(settings?.currency || '₹')}${numAmount.toLocaleString()} under ${catLabel}!`, 'success');
    }

    setModalOpen(false);
  };

  // Delete Expense Handler
  const handleDeleteExpense = (exp: Expense) => {
    if (!exp) return;
    const label = exp.category === 'Other' && exp.expenseName ? `Other (${exp.expenseName})` : (exp.category || 'Expense');
    const currency = settings?.currency || '₹';
    if (window.confirm(`Are you sure you want to delete this expense: ${label} (${currency}${exp.amount || 0})?`)) {
      store.deleteExpense(exp.id);
      showToast('Expense deleted successfully.', 'info');
    }
  };

  // Filter Clear Handler
  const handleClearFilters = () => {
    setSearch('');
    setFilterDate('');
    setFilterMonth('ALL');
    setFilterYear('ALL');
    setFilterCategory('ALL');
  };

  // Check if any filter is active
  const isFiltered =
    search.trim() !== '' ||
    filterDate !== '' ||
    filterMonth !== 'ALL' ||
    filterYear !== 'ALL' ||
    filterCategory !== 'ALL';

  const safeExpenses = Array.isArray(expenses) ? expenses : [];

  // Filtered Expenses Computation (Affects only the history table & filtered total)
  const filteredExpenses = safeExpenses.filter((e) => {
    if (!e) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchCategory = e.category ? e.category.toLowerCase().includes(q) : false;
      const matchName = e.expenseName ? e.expenseName.toLowerCase().includes(q) : false;
      const matchPaidTo = e.paidTo ? e.paidTo.toLowerCase().includes(q) : false;
      const matchRef = e.referenceNo ? e.referenceNo.toLowerCase().includes(q) : false;
      const matchNotes = e.notes ? e.notes.toLowerCase().includes(q) : false;

      if (!matchCategory && !matchName && !matchPaidTo && !matchRef && !matchNotes) {
        return false;
      }
    }

    if (filterCategory !== 'ALL' && e.category !== filterCategory) {
      return false;
    }

    if (filterDate) {
      if (e.date !== filterDate) return false;
    } else {
      if (e.date && typeof e.date === 'string') {
        const parts = e.date.split('-');
        const expYear = parts[0];
        const expMonth = parts[1];

        if (filterYear !== 'ALL' && expYear !== filterYear) return false;
        if (filterMonth !== 'ALL' && expMonth !== filterMonth) return false;
      }
    }

    return true;
  });

  const unfilteredTotal = safeExpenses.reduce((acc, e) => acc + (Number(e?.amount) || 0), 0);
  const filteredTotal = filteredExpenses.reduce((acc, e) => acc + (Number(e?.amount) || 0), 0);
  const currencySymbol = settings?.currency || '₹';

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Banner */}
      <div className="bg-gradient-to-r from-rose-900 to-slate-900 p-6 rounded-2xl text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
            <TrendingDown className="w-4 h-4" />
            <span>Operating Expense Management</span>
          </div>
          <h2 className="text-2xl font-extrabold mt-1">
            Total Expenses: {currencySymbol}{unfilteredTotal.toLocaleString()}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Manage business expenses and track spending across periods
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add Expense</span>
        </button>
      </div>

      {/* KPI SUMMARY CARDS SECTION (Independent of History Filters) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* TODAY'S EXPENSE */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Today's Expense</span>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              {currencySymbol}{kpiData.todayTotal.toLocaleString()}
            </h3>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">{formatNiceDate(kpiData.todayStr)}</span>
              {kpiData.todayTrend && (
                <span
                  className={`font-bold text-[11px] flex items-center gap-0.5 ${
                    kpiData.todayTrend.isUp ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {kpiData.todayTrend.isUp ? '↑' : '↓'} {kpiData.todayTrend.pct}% vs yesterday
                </span>
              )}
            </div>
          </div>
        </div>

        {/* THIS WEEK */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">This Week</span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <CalendarRange className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              {currencySymbol}{kpiData.thisWeekTotal.toLocaleString()}
            </h3>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                {kpiData.weekFormattedRange ? `Week of ${kpiData.weekFormattedRange}` : 'This Week'}
              </span>
              {kpiData.weekTrend && (
                <span
                  className={`font-bold text-[11px] flex items-center gap-0.5 ${
                    kpiData.weekTrend.isUp ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {kpiData.weekTrend.isUp ? '↑' : '↓'} {kpiData.weekTrend.pct}% vs last week
                </span>
              )}
            </div>
          </div>
        </div>

        {/* THIS MONTH */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">This Month</span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              {currencySymbol}{kpiData.thisMonthTotal.toLocaleString()}
            </h3>
            <div className="flex items-center justify-between mt-1 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">{kpiData.monthFormatted}</span>
              {kpiData.monthTrend && (
                <span
                  className={`font-bold text-[11px] flex items-center gap-0.5 ${
                    kpiData.monthTrend.isUp ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {kpiData.monthTrend.isUp ? '↑' : '↓'} {kpiData.monthTrend.pct}% vs last month
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FILTER TOOLBAR CONTAINER */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold text-xs uppercase tracking-wider">
            <Filter className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span>Filter Expense History</span>
          </div>
          {isFiltered && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Filters</span>
            </button>
          )}
        </div>

        {/* Responsive Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Search Box */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase">Search</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Category, name, paid to..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 transition-colors"
              />
            </div>
          </div>

          {/* Date Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase">Date</label>
            <div className="relative">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 transition-colors"
              />
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="absolute right-2 top-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-600"
                  title="Clear Date"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Month Filter */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase">Month</label>
              {filterDate && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">Disabled</span>}
            </div>
            <select
              value={filterMonth}
              disabled={!!filterDate}
              onChange={(e) => setFilterMonth(e.target.value)}
              className={`w-full px-3 py-2 border rounded-xl text-xs font-medium transition-colors ${
                filterDate
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900'
              }`}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            {filterDate && (
              <p className="text-[10px] text-amber-600 font-medium italic">Specific date selected</p>
            )}
          </div>

          {/* Year Filter */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase">Year</label>
              {filterDate && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">Disabled</span>}
            </div>
            <select
              value={filterYear}
              disabled={!!filterDate}
              onChange={(e) => setFilterYear(e.target.value)}
              className={`w-full px-3 py-2 border rounded-xl text-xs font-medium transition-colors ${
                filterDate
                  ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900'
              }`}
            >
              <option value="ALL">All Years</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
            {filterDate && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium italic">Specific date selected</p>
            )}
          </div>

          {/* Category Filter */}
          <div className="space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-medium focus:bg-white dark:focus:bg-slate-900 transition-colors"
            >
              <option value="ALL">All Categories</option>
              <option value="Rent">Rent</option>
              <option value="Salary">Salary</option>
              <option value="Electricity">Electricity</option>
              <option value="Internet">Internet</option>
              <option value="Transport">Transport</option>
              <option value="Marketing">Marketing</option>
              <option value="Software">Software</option>
              <option value="Office">Office</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
      </div>

      {/* EXPENSE LOG TABLE CARD */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Expense History</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {filteredExpenses.length === 0
                ? 'No expenses found'
                : `Showing ${filteredExpenses.length} ${filteredExpenses.length === 1 ? 'expense' : 'expenses'}`}
            </p>
          </div>

          {isFiltered && (
            <div className="text-right">
              <span className="text-xs font-extrabold text-rose-600 dark:text-rose-400">
                Filtered Total: {currencySymbol}{filteredTotal.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Category</th>
                <th className="p-3.5">Expense / Name</th>
                <th className="p-3.5">Paid To / Vendor</th>
                <th className="p-3.5">Ref / Cheque #</th>
                <th className="p-3.5 text-right">Amount</th>
                <th className="p-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 dark:text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                      <p className="font-medium">No expenses found.</p>
                      {isFiltered && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          Try adjusting your active filters or clear them to see all records.
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-3.5 text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">{e.date || '-'}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          e.category === 'Other'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {e.category || 'Expense'}
                      </span>
                    </td>
                    <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                      {e.category === 'Other' ? (
                        <div>
                          <span className="text-slate-900 dark:text-slate-100 font-extrabold">{e.expenseName || '—'}</span>
                          {e.notes && <p className="text-[10px] font-normal text-slate-400 dark:text-slate-500 mt-0.5">{e.notes}</p>}
                        </div>
                      ) : (
                        <div>
                          <span>{e.category || 'Expense'}</span>
                          {e.notes && <p className="text-[10px] font-normal text-slate-400 dark:text-slate-500 mt-0.5">{e.notes}</p>}
                        </div>
                      )}
                    </td>
                    <td className="p-3.5 text-slate-700 dark:text-slate-300">{e.paidTo || '-'}</td>
                    <td className="p-3.5 text-slate-500 dark:text-slate-400 font-mono text-[11px]">{e.referenceNo || '-'}</td>
                    <td className="p-3.5 text-right font-extrabold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                      {currencySymbol}{(Number(e.amount) || 0).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditModal(e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
                          title="Edit Expense"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT EXPENSE WORKSPACE */}
      {modalOpen && (
        <DedicatedWorkspace
          title={editingExpenseId ? 'Edit Operational Expense' : 'Add Operational Expense'}
          subtitle="Record and track operating expenses, rent, salaries, utilities & more"
          badgeText="EXPENSE"
          icon={TrendingDown}
          onClose={() => setModalOpen(false)}
          onNavigateTab={onNavigateTab}
          activeTab={activeTab || 'expenses'}
        >
          <form onSubmit={handleSaveExpense} className="space-y-6 max-w-4xl mx-auto bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value as ExpenseCategory)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                >
                  <option value="Rent">Rent</option>
                  <option value="Salary">Salary</option>
                  <option value="Electricity">Electricity</option>
                  <option value="Internet">Internet</option>
                  <option value="Transport">Transport</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Software">Software</option>
                  <option value="Office">Office</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Dynamic Expense Name field when Category = Other */}
              {category === 'Other' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Expense Name *
                  </label>
                  <input
                    type="text"
                    value={expenseName}
                    onChange={(e) => {
                      setExpenseName(e.target.value);
                      if (e.target.value.trim()) setExpenseNameError('');
                    }}
                    onBlur={() => {
                      if (!expenseName.trim()) setExpenseNameError('Please enter the expense name.');
                    }}
                    placeholder="Enter expense name"
                    className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 transition-colors ${
                      expenseNameError ? 'border-rose-500 bg-rose-50/20' : 'border-slate-200 dark:border-slate-800'
                    }`}
                  />
                  {expenseNameError && (
                    <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>{expenseNameError}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Amount ({currencySymbol}) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                />
              </div>

              {/* Paid To / Vendor */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Paid To / Vendor
                </label>
                <input
                  type="text"
                  value={paidTo}
                  onChange={(e) => setPaidTo(e.target.value)}
                  placeholder="e.g. Landlord, Vendor or Contractor"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                />
              </div>

              {/* Reference / Cheque # */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Ref / Cheque #
                </label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="e.g. TXN-1234 or Cheque #0001"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                />
              </div>

              {/* Description / Notes */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add optional expense notes..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 transition-colors"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-md shadow-rose-600/20 transition-colors cursor-pointer"
              >
                {editingExpenseId ? 'Update Expense' : 'Save Expense'}
              </button>
            </div>
          </form>
        </DedicatedWorkspace>
      )}
    </div>
  );
};
