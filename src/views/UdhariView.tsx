import React, { useState, useEffect } from 'react';
import {
  Scale,
  Search,
  Plus,
  CreditCard,
  History,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Phone,
  MessageSquare,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Trash2,
  Edit2,
  FileText,
  X,
} from 'lucide-react';
import { store } from '../services/store';
import { UdhariRecord, UdhariPaymentRecord, PaymentMethod, Customer } from '../types';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';

type ViewTab = 'udharis' | 'payments' | 'customers';
type StatusFilter = 'ALL' | 'UNPAID' | 'PARTIALLY PAID' | 'PAID' | 'OVERDUE';
type DateFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'LAST_MONTH';

export const UdhariView: React.FC = () => {
  const [udharis, setUdharis] = useState<UdhariRecord[]>([]);
  const [payments, setPayments] = useState<UdhariPaymentRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Navigation & Filtering
  const [activeTab, setActiveTab] = useState<ViewTab>('udharis');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Active targets
  const [activeUdhari, setActiveUdhari] = useState<UdhariRecord | null>(null);
  const [lastPaymentResult, setLastPaymentResult] = useState<{
    payment: UdhariPaymentRecord;
    udhari: UdhariRecord;
  } | null>(null);

  // Form State: Add Udhari
  const [addCustomerName, setAddCustomerName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addAmount, setAddAmount] = useState<string>('');
  const [addDueDate, setAddDueDate] = useState<string>(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  );
  const [addNotes, setAddNotes] = useState('');
  const [addCustomerId, setAddCustomerId] = useState<string>('');

  // Form State: Record Payment
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('UPI');
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payPhone, setPayPhone] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payError, setPayError] = useState<string>('');

  // Form State: Edit Udhari
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const settings = store.getSettings();
  const metrics = store.getUdhariMetrics();

  const refreshData = () => {
    setUdharis(store.getUdharis());
    setPayments(store.getUdhariPayments());
    setCustomers(store.getCustomers());
  };

  useEffect(() => {
    refreshData();
    return store.subscribe(refreshData);
  }, []);

  // Format Helpers
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (val: number) => {
    return `${settings.currency}${val.toLocaleString('en-IN')}`;
  };

  // Date Filter logic
  const isWithinDateRange = (dateStr: string, filter: DateFilter) => {
    if (filter === 'ALL') return true;
    const target = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (filter === 'TODAY') {
      return target >= today;
    }
    if (filter === 'WEEK') {
      const weekAgo = new Date(today.getTime() - 7 * 86400000);
      return target >= weekAgo;
    }
    if (filter === 'MONTH') {
      const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
      return target >= monthAgo;
    }
    if (filter === 'LAST_MONTH') {
      const startLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const endLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      return target >= startLastMonth && target <= endLastMonth;
    }
    return true;
  };

  // Filtered Udharis
  const filteredUdharis = udharis.filter((u) => {
    // Status Filter
    if (statusFilter !== 'ALL' && u.status !== statusFilter) {
      return false;
    }
    // Date Filter
    if (!isWithinDateRange(u.createdAt, dateFilter) && !isWithinDateRange(u.dueDate, dateFilter)) {
      return false;
    }
    // Search Filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = u.customerNameSnapshot.toLowerCase().includes(q);
      const matchPhone = u.phoneSnapshot.toLowerCase().includes(q);
      const matchId = u.id.toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchId) return false;
    }
    return true;
  });

  // Filtered Payments
  const filteredPayments = payments.filter((p) => {
    if (!isWithinDateRange(p.paymentDate, dateFilter)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchId = p.id.toLowerCase().includes(q);
      const matchUdhariId = p.udhariId.toLowerCase().includes(q);
      const matchPhone = p.phoneNumber.toLowerCase().includes(q);
      const matchRef = (p.reference || '').toLowerCase().includes(q);
      const linkedUdhari = udharis.find((u) => u.id === p.udhariId);
      const matchCust = linkedUdhari?.customerNameSnapshot.toLowerCase().includes(q);
      if (!matchId && !matchUdhariId && !matchPhone && !matchRef && !matchCust) return false;
    }
    return true;
  });

  // Open Handlers
  const handleOpenAddModal = () => {
    setAddCustomerName('');
    setAddPhone('');
    setAddAmount('');
    setAddDueDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setAddNotes('');
    setAddCustomerId('');
    setAddModalOpen(true);
  };

  const handleSelectCustomerForAdd = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const custId = e.target.value;
    setAddCustomerId(custId);
    if (custId) {
      const found = customers.find((c) => c.id === custId);
      if (found) {
        setAddCustomerName(found.name);
        setAddPhone(found.phone);
      }
    }
  };

  const handleOpenPayModal = (u: UdhariRecord) => {
    setActiveUdhari(u);
    setPayAmount(String(u.outstandingAmount));
    setPayMethod('UPI');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayPhone(u.phoneSnapshot);
    setPayReference('');
    setPayNotes('');
    setPayError('');
    setPayModalOpen(true);
  };

  const handleOpenHistoryModal = (u: UdhariRecord) => {
    setActiveUdhari(u);
    setHistoryModalOpen(true);
  };

  const handleOpenEditModal = (u: UdhariRecord) => {
    setActiveUdhari(u);
    setEditCustomerName(u.customerNameSnapshot);
    setEditPhone(u.phoneSnapshot);
    setEditAmount(String(u.originalAmount));
    setEditDueDate(u.dueDate);
    setEditNotes(u.notes || '');
    setEditModalOpen(true);
  };

  // Submit Handlers
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCustomerName.trim()) {
      showToast('Please enter customer name', 'error');
      return;
    }
    if (!addPhone.trim() || addPhone.trim().length < 6) {
      showToast('Please enter a valid contact number', 'error');
      return;
    }
    const numAmount = parseFloat(addAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid Udhari amount greater than ₹0', 'error');
      return;
    }
    if (!addDueDate) {
      showToast('Please select a due date', 'error');
      return;
    }

    try {
      const newRec = store.addUdhari({
        customerNameSnapshot: addCustomerName,
        phoneSnapshot: addPhone,
        originalAmount: numAmount,
        dueDate: addDueDate,
        notes: addNotes,
        customerId: addCustomerId || undefined,
      });

      showToast(`Udhari entry ${newRec.id} created for ${newRec.customerNameSnapshot}!`, 'success');
      setAddModalOpen(false);
      refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create Udhari record', 'error');
    }
  };

  const handlePayAmountChange = (val: string) => {
    setPayAmount(val);
    if (!activeUdhari) return;
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) {
      setPayError('Please enter an amount greater than ₹0');
    } else if (num > activeUdhari.outstandingAmount) {
      setPayError('Amount received cannot be greater than the outstanding balance.');
    } else {
      setPayError('');
    }
  };

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUdhari) return;

    const numAmount = parseFloat(payAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setPayError('Please enter a valid received amount greater than ₹0.');
      return;
    }

    if (numAmount > activeUdhari.outstandingAmount) {
      setPayError('Amount received cannot be greater than the outstanding balance.');
      return;
    }

    try {
      const result = store.recordUdhariPayment({
        udhariId: activeUdhari.id,
        amount: numAmount,
        paymentMethod: payMethod,
        paymentDate: payDate,
        phoneNumber: payPhone,
        reference: payReference,
        notes: payNotes,
      });

      setLastPaymentResult(result);
      setPayModalOpen(false);
      setConfirmModalOpen(true);
      showToast(`Recorded payment of ${formatCurrency(numAmount)} from ${activeUdhari.customerNameSnapshot}!`, 'success');
      refreshData();
    } catch (err: any) {
      setPayError(err.message || 'Failed to record payment');
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUdhari) return;
    if (!editCustomerName.trim()) {
      showToast('Please enter customer name', 'error');
      return;
    }
    if (!editPhone.trim()) {
      showToast('Please enter contact number', 'error');
      return;
    }

    try {
      store.editUdhari(activeUdhari.id, {
        customerNameSnapshot: editCustomerName,
        phoneSnapshot: editPhone,
        originalAmount: activeUdhari.totalReceived === 0 ? parseFloat(editAmount) : undefined,
        dueDate: editDueDate,
        notes: editNotes,
      });
      showToast('Udhari entry updated successfully', 'success');
      setEditModalOpen(false);
      refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update Udhari entry', 'error');
    }
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this unpaid Udhari record?')) return;
    try {
      store.deleteUdhari(id);
      showToast('Udhari entry deleted', 'info');
      refreshData();
    } catch (err: any) {
      showToast(err.message || 'Cannot delete record', 'error');
    }
  };

  // WhatsApp Redirect Helper (Section 38)
  const handleWhatsAppShare = (u: UdhariRecord) => {
    const cleanPhone = u.phoneSnapshot.replace(/[^0-9]/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = `Hello ${u.customerNameSnapshot},\n\nYour outstanding balance with ${settings.businessName} is ${formatCurrency(u.outstandingAmount)}.\n\nDue Date: ${formatDate(u.dueDate)}.\n\nPlease contact us for any clarification.\n\nThank you!`;
    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/${formattedPhone}?text=${encoded}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* 1. TOP HERO & METRIC CARDS HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-6 rounded-3xl text-white shadow-2xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest">
            <Scale className="w-4 h-4" />
            <span>Udhari Ledger & Receivables Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
            Indian Business Credit Book
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Track customer Udhari, partial payments, automated overdue alerts, and auditable payment histories.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
        >
          <Plus className="w-5 h-5 stroke-[3]" />
          <span>+ Add Udhari</span>
        </button>
      </div>

      {/* 2. SUMMARY CARDS (SECTION 19 & 20) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Udhari */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Udhari Issued
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
              {formatCurrency(metrics.totalUdhari)}
            </h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 block">
              Cumulative credit records
            </span>
          </div>
        </div>

        {/* Total Outstanding */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/20 shadow-card flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              Net Outstanding
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center font-bold">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
              {formatCurrency(metrics.outstanding)}
            </h3>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-0.5 block flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Pending customer recovery</span>
            </span>
          </div>
        </div>

        {/* Total Received */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/20 shadow-card flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Total Recovered
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {formatCurrency(metrics.received)}
            </h3>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5 block flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Successfully settled</span>
            </span>
          </div>
        </div>

        {/* Overdue Amount */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/20 shadow-card flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
              Overdue Credit
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center font-bold">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">
              {formatCurrency(metrics.overdue)}
            </h3>
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-0.5 block flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Immediate follow-up required</span>
            </span>
          </div>
        </div>
      </div>

      {/* 3. TABS, SEARCH & FILTER CONTROL BAR */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 transition-colors">
        {/* Main Tab View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('udharis')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'udharis'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Udhari Ledger ({filteredUdharis.length})
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'payments'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Payment History ({filteredPayments.length})
            </button>
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'customers'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Customer Summary
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, phone, or Udhari ID (UD-...)..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 dark:text-slate-500 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills for Udhari Tab */}
        {activeTab === 'udharis' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status Filter Pills (Section 28) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase mr-1">Status:</span>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === 'ALL'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                All ({udharis.length})
              </button>
              <button
                onClick={() => setStatusFilter('UNPAID')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === 'UNPAID'
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100'
                }`}
              >
                Unpaid ({udharis.filter((u) => u.status === 'UNPAID').length})
              </button>
              <button
                onClick={() => setStatusFilter('PARTIALLY PAID')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === 'PARTIALLY PAID'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/60 hover:bg-indigo-100'
                }`}
              >
                Partial ({udharis.filter((u) => u.status === 'PARTIALLY PAID').length})
              </button>
              <button
                onClick={() => setStatusFilter('PAID')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === 'PAID'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-100'
                }`}
              >
                Paid ({udharis.filter((u) => u.status === 'PAID').length})
              </button>
              <button
                onClick={() => setStatusFilter('OVERDUE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === 'OVERDUE'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900/60 hover:bg-rose-100'
                }`}
              >
                Overdue ({udharis.filter((u) => u.status === 'OVERDUE').length})
              </button>
            </div>

            {/* Date Filter (Section 30) */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase">Range:</span>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Today</option>
                <option value="WEEK">This Week</option>
                <option value="MONTH">This Month</option>
                <option value="LAST_MONTH">Last Month</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 4. MAIN CONTENT AREA BASED ON ACTIVE TAB */}

      {/* TAB 1: UDHARI LEDGER CARDS VIEW */}
      {activeTab === 'udharis' && (
        <div className="space-y-4">
          {filteredUdharis.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card text-center space-y-3 transition-colors">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center mx-auto">
                <FileText className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No Udhari Entries Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {search || statusFilter !== 'ALL' || dateFilter !== 'ALL'
                  ? 'No entries match your search and filter criteria. Try clearing filters.'
                  : 'Start tracking customer credit by creating your first Udhari entry!'}
              </p>
              <button
                onClick={handleOpenAddModal}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Udhari</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredUdharis.map((u) => {
                const isPaid = u.status === 'PAID';
                const isOverdue = u.status === 'OVERDUE';
                const isPartial = u.status === 'PARTIALLY PAID';

                return (
                  <div
                    key={u.id}
                    className={`bg-white dark:bg-slate-900 rounded-3xl border shadow-card hover:shadow-card-hover transition-all overflow-hidden flex flex-col justify-between ${
                      isPaid
                        ? 'border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/10 dark:bg-emerald-950/10'
                        : isOverdue
                        ? 'border-rose-300/80 dark:border-rose-900/60 bg-rose-50/10 dark:bg-rose-950/10'
                        : isPartial
                        ? 'border-indigo-200/80 dark:border-indigo-900/60 bg-indigo-50/10 dark:bg-indigo-950/10'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {/* Card Top Banner */}
                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                            {u.id}
                          </span>
                          <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                            {u.customerNameSnapshot}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                            <span>{u.phoneSnapshot}</span>
                          </p>
                        </div>

                        {/* STATUS BADGE (SECTIONS 5, 15, 16, 26, 27) */}
                        <div className="text-right">
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${
                              isPaid
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                : isOverdue
                                ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse'
                                : isPartial
                                ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800'
                                : 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                            }`}
                          >
                            {isPaid && <CheckCircle2 className="w-3 h-3" />}
                            {isOverdue && <AlertTriangle className="w-3 h-3" />}
                            {u.status}
                          </span>
                        </div>
                      </div>

                      {/* Amounts Display (Section 4 & 14) */}
                      <div className="bg-slate-50/80 dark:bg-slate-950/60 rounded-2xl p-3.5 space-y-2 border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 dark:text-slate-400 font-semibold">Original Udhari:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{formatCurrency(u.originalAmount)}</span>
                        </div>

                        {u.totalReceived > 0 && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Total Recovered:</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(u.totalReceived)}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200/60 dark:border-slate-800">
                          <span className="font-bold text-slate-700 dark:text-slate-300">Outstanding Balance:</span>
                          <span
                            className={`text-base font-black ${
                              isPaid ? 'text-emerald-600 dark:text-emerald-400' : isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {formatCurrency(u.outstandingAmount)}
                          </span>
                        </div>
                      </div>

                      {/* Due Date & Notes */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Calendar className={`w-3.5 h-3.5 ${isOverdue ? 'text-rose-500 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`} />
                          <span className={isOverdue ? 'font-bold text-rose-600 dark:text-rose-400' : ''}>
                            Due: {formatDate(u.dueDate)}
                          </span>
                        </div>

                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          Created: {formatDate(u.createdAt)}
                        </span>
                      </div>

                      {u.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 bg-amber-50/40 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/40 italic">
                          "{u.notes}"
                        </p>
                      )}
                    </div>

                    {/* Card Actions Footer */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                      {/* PAYMENT BUTTON (SECTION 6 & 15) */}
                      {!isPaid ? (
                        <button
                          onClick={() => handleOpenPayModal(u)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>YES! Customer Paid</span>
                        </button>
                      ) : (
                        <div className="w-full py-2 px-4 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>PAID ✓ (Fully Settled)</span>
                        </div>
                      )}

                      {/* Secondary Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          onClick={() => handleOpenHistoryModal(u)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <History className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                          <span>View History</span>
                        </button>

                        <button
                          onClick={() => handleWhatsAppShare(u)}
                          className="flex items-center justify-center p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                          title="Share via WhatsApp"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>

                        {!isPaid && u.totalReceived === 0 && (
                          <button
                            onClick={() => handleOpenEditModal(u)}
                            className="flex items-center justify-center p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                            title="Edit Unpaid Entry"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {u.totalReceived === 0 && (
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="flex items-center justify-center p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-colors"
                            title="Delete Unpaid Entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PAYMENT HISTORY TABLE VIEW (SECTION 31) */}
      {activeTab === 'payments' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Udhari Payment Transactions</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Auditable audit log of all recovered Udhari payments</p>
            </div>
            <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-full">
              {filteredPayments.length} Records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4">Payment ID</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Udhari ID</th>
                  <th className="p-4 text-right">Amount Received</th>
                  <th className="p-4">Medium</th>
                  <th className="p-4">Phone</th>
                  <th className="p-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 dark:text-slate-500">
                      No payment transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => {
                    const linkedUdhari = udharis.find((u) => u.id === p.udhariId);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-4 font-bold text-blue-600 dark:text-blue-400">{p.id}</td>
                        <td className="p-4 text-slate-500 dark:text-slate-400 font-medium">{formatDate(p.paymentDate)}</td>
                        <td className="p-4 font-bold text-slate-900 dark:text-slate-100">
                          {linkedUdhari?.customerNameSnapshot || 'Customer'}
                        </td>
                        <td className="p-4 font-mono text-slate-500 dark:text-slate-400">{p.udhariId}</td>
                        <td className="p-4 text-right font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 text-[10px]">
                            {p.paymentMethod}
                          </span>
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-400">{p.phoneNumber}</td>
                        <td className="p-4 text-slate-400 dark:text-slate-500 font-mono text-[11px]">
                          {p.reference || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CUSTOMER-LEVEL LEDGER (SECTION 24) */}
      {activeTab === 'customers' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer Selection Column */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
              Select Customer
            </h3>
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
              {customers.map((c) => {
                const customerUdharis = udharis.filter(
                  (u) => u.customerId === c.id || u.phoneSnapshot === c.phone
                );
                const totalOutstanding = customerUdharis.reduce((acc, u) => acc + u.outstandingAmount, 0);
                const isSelected = c.id === selectedCustomerId;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCustomerId(c.id)}
                    className={`w-full text-left p-3.5 rounded-2xl transition-all flex justify-between items-center ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-100 dark:border-slate-800'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold truncate">{c.name}</p>
                      <p className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500'}`}>
                        {c.phone}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-black ${isSelected ? 'text-white' : 'text-amber-600 dark:text-amber-400'}`}>
                        {formatCurrency(totalOutstanding)}
                      </span>
                      <span className={`text-[9px] block ${isSelected ? 'text-blue-200' : 'text-slate-400 dark:text-slate-500'}`}>
                        {customerUdharis.length} Udhari
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer Ledger Details */}
          <div className="lg:col-span-2 space-y-4">
            {selectedCustomerId ? (
              (() => {
                const targetCustomer = customers.find((c) => c.id === selectedCustomerId);
                const customerUdharis = udharis.filter(
                  (u) => u.customerId === selectedCustomerId || u.phoneSnapshot === targetCustomer?.phone
                );
                const totalCreditGiven = customerUdharis.reduce((acc, u) => acc + u.originalAmount, 0);
                const totalReceived = customerUdharis.reduce((acc, u) => acc + u.totalReceived, 0);
                const currentOutstanding = customerUdharis.reduce((acc, u) => acc + u.outstandingAmount, 0);

                return (
                  <div className="space-y-4">
                    {/* Stats Header */}
                    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">{targetCustomer?.name}</h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{targetCustomer?.phone}</p>
                        </div>
                        <button
                          onClick={() => handleWhatsAppShare(customerUdharis[0])}
                          disabled={customerUdharis.length === 0}
                          className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 disabled:opacity-50 inline-flex items-center gap-1.5"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>WhatsApp Reminder</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-4">
                        <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                            Total Credit Given
                          </span>
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            {formatCurrency(totalCreditGiven)}
                          </p>
                        </div>
                        <div className="bg-emerald-50/50 dark:bg-emerald-950/40 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/40">
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                            Total Recovered
                          </span>
                          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {formatCurrency(totalReceived)}
                          </p>
                        </div>
                        <div className="bg-amber-50/50 dark:bg-amber-950/40 p-3 rounded-2xl border border-amber-100 dark:border-amber-900/40">
                          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">
                            Current Outstanding
                          </span>
                          <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">
                            {formatCurrency(currentOutstanding)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Customer Udhari List */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card p-5 space-y-3">
                      <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Udhari Records ({customerUdharis.length})
                      </h3>
                      {customerUdharis.length === 0 ? (
                        <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">
                          No Udhari records found for this customer.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {customerUdharis.map((u) => (
                            <div
                              key={u.id}
                              className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60 flex items-center justify-between gap-4"
                            >
                              <div>
                                <span className="font-bold text-xs text-blue-600 dark:text-blue-400">{u.id}</span>
                                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">
                                  Due: {formatDate(u.dueDate)}
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                  {formatCurrency(u.originalAmount)}
                                </span>
                                <p className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                                  Outstanding: {formatCurrency(u.outstandingAmount)}
                                </p>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-md text-[9px] font-bold uppercase ${
                                  u.status === 'PAID'
                                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                                    : u.status === 'OVERDUE'
                                    ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                                    : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                                }`}
                              >
                                {u.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card text-center text-slate-400 dark:text-slate-500 text-xs">
                Select a customer from the left list to view their dedicated credit statement.
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODALS IMPLEMENTATION --- */}

      {/* 1. ADD UDHAARI MODAL (SECTIONS 1, 2, 3) */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add New Udhari"
        maxWidth="md"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4">
          {/* Quick Select Customer */}
          {customers.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">
                Select Existing Customer (Optional)
              </label>
              <select
                value={addCustomerId}
                onChange={handleSelectCustomerForAdd}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                <option value="" className="bg-white dark:bg-slate-900">-- Manual Entry / New Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900">
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Customer Name *
            </label>
            <input
              type="text"
              required
              value={addCustomerName}
              onChange={(e) => setAddCustomerName(e.target.value)}
              placeholder="e.g. Rajesh Kumar"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Contact Number */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Contact Number *
            </label>
            <input
              type="tel"
              required
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Udhari Amount ({settings.currency}) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-xs">
                {settings.currency}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                placeholder="5000"
                className="w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-black text-amber-600 dark:text-amber-400 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Due Date & Quick Buttons */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                Due Date *
              </label>
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setAddDueDate(new Date().toISOString().split('T')[0])}
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAddDueDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
                  }
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Tomorrow
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAddDueDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0])
                  }
                  className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  +7 Days
                </button>
              </div>
            </div>
            <input
              type="date"
              required
              value={addDueDate}
              onChange={(e) => setAddDueDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="e.g. 2 bags rice, Material supplied..."
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>

          {/* Actions (Section 3) */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 shadow-md shadow-amber-500/20 cursor-pointer"
            >
              Add Udhari
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. RECORD RECEIVED PAYMENT MODAL (SECTIONS 6-13, 17, 41) */}
      {activeUdhari && (
        <Modal
          isOpen={payModalOpen}
          onClose={() => setPayModalOpen(false)}
          title="Record Payment Received"
          maxWidth="md"
        >
          <form onSubmit={handlePaySubmit} className="space-y-4">
            {/* Context Summary Box */}
            <div className="bg-slate-900 border border-slate-800 text-white p-4 rounded-2xl space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Customer</span>
                <span className="text-[10px] text-amber-400 font-mono">{activeUdhari.id}</span>
              </div>
              <p className="text-sm font-extrabold text-white">{activeUdhari.customerNameSnapshot}</p>
              <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                <span className="text-slate-400">Current Outstanding:</span>
                <span className="text-base font-black text-amber-400">
                  {formatCurrency(activeUdhari.outstandingAmount)}
                </span>
              </div>
            </div>

            {/* Amount Received */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Amount Received ({settings.currency}) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={payAmount}
                onChange={(e) => handlePayAmountChange(e.target.value)}
                className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border rounded-xl text-base font-black text-emerald-600 dark:text-emerald-400 focus:outline-none ${
                  payError ? 'border-rose-500 bg-rose-50/20' : 'border-slate-200 dark:border-slate-800'
                }`}
              />
              {/* INVALID PAYMENT PROTECTION ERROR DISPLAY (SECTION 17) */}
              {payError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 font-bold mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{payError}</span>
                </p>
              )}
            </div>

            {/* Payment Medium (Section 8) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Payment Medium *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'] as PaymentMethod[]).map(
                  (m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayMethod(m)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        payMethod === m
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {m}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Payment Date & Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={payPhone}
                  onChange={(e) => setPayPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Reference */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Payment Reference (Optional)
              </label>
              <input
                type="text"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="e.g. UPI Txn ID / Cheque #"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Payment Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Payment Notes (Optional)
              </label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="e.g. Customer paid partial amount"
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Form Actions (Section 13) */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!!payError}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 disabled:opacity-50 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                Record Payment
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* 3. POST-PAYMENT CONFIRMATION MODAL (SECTION 42) */}
      {lastPaymentResult && (
        <Modal
          isOpen={confirmModalOpen}
          onClose={() => setConfirmModalOpen(false)}
          title="Payment Recorded Successfully"
          maxWidth="sm"
        >
          <div className="text-center space-y-4 py-2">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                {formatCurrency(lastPaymentResult.payment.amount)} Received!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Received from <span className="font-bold text-slate-800 dark:text-slate-200">{lastPaymentResult.udhari.customerNameSnapshot}</span>
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl text-xs space-y-2 text-left border border-slate-100 dark:border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Payment ID:</span>
                <span className="font-bold font-mono text-slate-900 dark:text-slate-100">{lastPaymentResult.payment.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Payment Method:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">{lastPaymentResult.payment.paymentMethod}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
                <span className="text-slate-700 dark:text-slate-300 font-semibold">Remaining Balance:</span>
                <span className="font-black text-amber-600 dark:text-amber-400">
                  {formatCurrency(lastPaymentResult.udhari.outstandingAmount)}
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmModalOpen(false);
                  handleOpenHistoryModal(lastPaymentResult.udhari);
                }}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                View History
              </button>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 4. TRANSACTION HISTORY TIMELINE MODAL (SECTION 22 & 23) */}
      {activeUdhari && (
        <Modal
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          title={`Udhari History — ${activeUdhari.customerNameSnapshot}`}
          maxWidth="md"
        >
          {(() => {
            const { udhari, payments: historyPayments } = store.getUdhariHistory(activeUdhari.id);
            if (!udhari) return null;

            return (
              <div className="space-y-6">
                {/* Header Summary Banner */}
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-white space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-amber-400 font-mono font-bold">
                      {udhari.id}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-amber-500 text-slate-950">
                      {udhari.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Original</span>
                      <span className="font-bold text-slate-200">{formatCurrency(udhari.originalAmount)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Recovered</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(udhari.totalReceived)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Outstanding</span>
                      <span className="font-black text-amber-400">{formatCurrency(udhari.outstandingAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* Chronological Timeline (Newest First) (Section 23) */}
                <div className="space-y-4 relative pl-4 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                  {/* Payments Nodes */}
                  {historyPayments.map((p) => (
                    <div key={p.id} className="relative pl-6">
                      <div className="absolute -left-3.5 top-1.5 w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900" />
                      <div className="bg-emerald-50/50 dark:bg-emerald-950/40 p-3.5 rounded-2xl border border-emerald-100 dark:border-emerald-900/60 space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">Payment Received ({p.id})</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatDate(p.paymentDate)}</span>
                        </div>
                        <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(p.amount)}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                          <span>Method: <strong className="text-slate-800 dark:text-slate-200">{p.paymentMethod}</strong></span>
                          <span>Phone: <strong className="text-slate-800 dark:text-slate-200">{p.phoneNumber}</strong></span>
                          {p.reference && <span>Ref: <strong className="text-slate-800 dark:text-slate-200">{p.reference}</strong></span>}
                        </div>
                        {p.notes && <p className="text-xs text-slate-600 dark:text-slate-300 italic">"{p.notes}"</p>}
                      </div>
                    </div>
                  ))}

                  {/* Udhari Creation Node */}
                  <div className="relative pl-6">
                    <div className="absolute -left-3.5 top-1.5 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-white dark:ring-slate-900" />
                    <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-blue-600 dark:text-blue-400">Udhari Created ({udhari.id})</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatDate(udhari.createdAt)}</span>
                      </div>
                      <p className="text-base font-black text-slate-900 dark:text-slate-100">
                        {formatCurrency(udhari.originalAmount)}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Due Date: <strong className="text-slate-800 dark:text-slate-200">{formatDate(udhari.dueDate)}</strong>
                      </p>
                      {udhari.notes && <p className="text-xs text-slate-600 dark:text-slate-300 italic">"{udhari.notes}"</p>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* 5. EDIT UNPAID UDHAARI MODAL (SECTION 32) */}
      {activeUdhari && (
        <Modal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title="Edit Udhari Entry"
          maxWidth="md"
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Customer Name *
              </label>
              <input
                type="text"
                required
                value={editCustomerName}
                onChange={(e) => setEditCustomerName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Contact Number *
              </label>
              <input
                type="tel"
                required
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Original Amount ({settings.currency}) *
              </label>
              <input
                type="number"
                step="0.01"
                disabled={activeUdhari.totalReceived > 0}
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-black text-amber-600 dark:text-amber-400 disabled:opacity-50"
              />
              {activeUdhari.totalReceived > 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  Original amount cannot be changed after payments have been recorded.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Due Date *
              </label>
              <input
                type="date"
                required
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Notes
              </label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-500"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
