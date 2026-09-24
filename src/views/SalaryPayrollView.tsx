import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
  CreditCard,
  Building,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Printer,
  Download,
  RotateCcw,
  ArrowUpRight,
  ShieldCheck,
  ChevronDown,
  X,
  Eye,
  Sliders,
  Wallet,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { payrollService } from '../services/supabase/payrollService';
import { supabaseAuthService } from '../services/supabaseAuth';
import { store } from '../services/store';
import {
  SalaryPayment,
  SalaryStructure,
  PayrollSummaryMetrics,
  SalaryFilterOptions,
  PayrollAuditSummary,
} from '../types/payroll';
import { UserAccount } from '../types';
import { showToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import {
  downloadPayslipPdf,
  downloadPayrollReportPdf,
  downloadPayrollReportExcel,
  formatInr,
} from '../services/payrollExportService';

interface SalaryPayrollViewProps {
  onNavigateTab: (tab: string, extraParam?: string) => void;
  activeTab?: string;
}

const MONTH_NAMES = [
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

export const SalaryPayrollView: React.FC<SalaryPayrollViewProps> = ({ onNavigateTab }) => {
  const today = new Date();
  const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
  const currentYear = String(today.getFullYear());

  // Navigation Sub-tab
  const [activeSubTab, setActiveSubTab] = useState<'history' | 'calendar' | 'structures'>('history');

  // Filter States
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth);
  const [filterYear, setFilterYear] = useState<string>(currentYear);
  const [filterDepartment, setFilterDepartment] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPaymentMode, setFilterPaymentMode] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [employees, setEmployees] = useState<UserAccount[]>([]);
  const [summary, setSummary] = useState<PayrollSummaryMetrics>({
    totalPayrollThisMonth: 0,
    salaryPaid: 0,
    salaryPending: 0,
    employeesPaidCount: 0,
    totalEmployees: 0,
    activeEmployees: 0,
    totalGross: 0,
    totalDeductions: 0,
    monthLabel: `${MONTH_NAMES.find((m) => m.value === currentMonth)?.label} ${currentYear}`,
  });

  // Modal States
  const [isRecordModalOpen, setIsRecordModalOpen] = useState<boolean>(false);
  const [isStructureModalOpen, setIsStructureModalOpen] = useState<boolean>(false);
  const [selectedPayslipPayment, setSelectedPayslipPayment] = useState<SalaryPayment | null>(null);
  const [paymentToCancel, setPaymentToCancel] = useState<SalaryPayment | null>(null);
  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [cancelling, setCancelling] = useState<boolean>(false);

  // Consistency Audit State
  const [auditSummary, setAuditSummary] = useState<PayrollAuditSummary | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [auditing, setAuditing] = useState<boolean>(false);

  // Form State for Record Payment
  const [formEmployeeId, setFormEmployeeId] = useState<string>('');
  const [formPeriodMonth, setFormPeriodMonth] = useState<string>(currentMonth);
  const [formPeriodYear, setFormPeriodYear] = useState<string>(currentYear);
  const [formPaymentDate, setFormPaymentDate] = useState<string>(today.toISOString().split('T')[0]);
  const [formGrossAmount, setFormGrossAmount] = useState<string>('');
  const [formDeductions, setFormDeductions] = useState<string>('0');
  const [formBonus, setFormBonus] = useState<string>('0');
  const [formPaymentMode, setFormPaymentMode] = useState<string>('Bank Transfer');
  const [formReferenceNo, setFormReferenceNo] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'PAID' | 'PENDING'>('PAID');
  const [formTxType, setFormTxType] = useState<'REGULAR' | 'ADVANCE' | 'BONUS' | 'ADJUSTMENT'>('REGULAR');
  const [savingPayment, setSavingPayment] = useState<boolean>(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Form State for Salary Structure
  const [structEmployeeId, setStructEmployeeId] = useState<string>('');
  const [structBaseSalary, setStructBaseSalary] = useState<string>('');
  const [structHra, setStructHra] = useState<string>('0');
  const [structOtherAllowances, setStructOtherAllowances] = useState<string>('0');
  const [structStandardDeductions, setStructStandardDeductions] = useState<string>('0');
  const [structPaymentMode, setStructPaymentMode] = useState<string>('Bank Transfer');
  const [structBankName, setStructBankName] = useState<string>('');
  const [structAccountNo, setStructAccountNo] = useState<string>('');
  const [structIfsc, setStructIfsc] = useState<string>('');
  const [structUpiId, setStructUpiId] = useState<string>('');
  const [structNotes, setStructNotes] = useState<string>('');
  const [savingStructure, setSavingStructure] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // LOAD DATA
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load employees
      let empList = await supabaseAuthService.loadEmployees();
      if (!empList || empList.length === 0) {
        empList = supabaseAuthService.getEmployees() || [];
      }
      setEmployees(empList);

      // 2. Load salary structures
      const { data: structData } = await payrollService.getSalaryStructures();
      setStructures(structData || []);

      // 3. Load payments
      const { data: paymentData } = await payrollService.getSalaryPayments({
        month: filterMonth,
        year: filterYear,
        department: filterDepartment,
        status: filterStatus,
        paymentMode: filterPaymentMode,
        search: searchQuery,
      });
      setPayments(paymentData || []);

      // 4. Load summary metrics
      const sum = await payrollService.getPayrollSummary(filterMonth, filterYear);
      setSummary(sum);
    } catch (err: any) {
      console.warn('Error loading payroll data:', err);
      showToast('Error loading salary & payroll data', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear, filterDepartment, filterStatus, filterPaymentMode, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Active employees for selection
  const activeEmployees = useMemo(() => {
    return employees.filter((e) => (e.status || 'Active') === 'Active');
  }, [employees]);

  // Departments list
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.department?.trim()) set.add(e.department.trim());
    });
    return Array.from(set);
  }, [employees]);

  // Structure map
  const structureMap = useMemo(() => {
    const map = new Map<string, SalaryStructure>();
    structures.forEach((s) => map.set(s.employeeId, s));
    return map;
  }, [structures]);

  // ---------------------------------------------------------------------------
  // RECORD PAYMENT FORM LOGIC
  // ---------------------------------------------------------------------------

  const openRecordModalForEmployee = async (emp?: UserAccount) => {
    const targetEmp = emp || activeEmployees[0];
    if (!targetEmp) {
      showToast('No active employees found to record salary for.', 'info');
      return;
    }

    setFormEmployeeId(targetEmp.id);
    setFormPeriodMonth(filterMonth !== 'ALL' ? filterMonth : currentMonth);
    setFormPeriodYear(filterYear !== 'ALL' ? filterYear : currentYear);
    setFormPaymentDate(today.toISOString().split('T')[0]);
    setFormStatus('PAID');
    setFormTxType('REGULAR');
    setFormNotes('');
    setFormBonus('0');

    // Auto-fill from structure if configured
    const s = structureMap.get(targetEmp.id);
    if (s) {
      const gross = s.baseSalary + s.hraAllowance + s.otherAllowances;
      setFormGrossAmount(String(gross));
      setFormDeductions(String(s.standardDeductions));
      setFormPaymentMode(s.paymentMode || 'Bank Transfer');
    } else {
      setFormGrossAmount('');
      setFormDeductions('0');
      setFormPaymentMode('Bank Transfer');
    }

    const ref = await payrollService.generateNextSalaryReference();
    setFormReferenceNo(ref);
    setDuplicateWarning(null);
    setIsRecordModalOpen(true);
  };

  // Re-check structure and duplicate when employee or period changes
  useEffect(() => {
    if (!isRecordModalOpen || !formEmployeeId) return;

    const s = structureMap.get(formEmployeeId);
    if (s && !formGrossAmount) {
      const gross = s.baseSalary + s.hraAllowance + s.otherAllowances;
      setFormGrossAmount(String(gross));
      setFormDeductions(String(s.standardDeductions));
      setFormPaymentMode(s.paymentMode || 'Bank Transfer');
    }

    // Check duplicate
    const daysInMonth = new Date(parseInt(formPeriodYear, 10), parseInt(formPeriodMonth, 10), 0).getDate();
    const periodStart = `${formPeriodYear}-${formPeriodMonth}-01`;
    const periodEnd = `${formPeriodYear}-${formPeriodMonth}-${String(daysInMonth).padStart(2, '0')}`;

    payrollService.checkDuplicateSalary(formEmployeeId, periodStart, periodEnd, formTxType).then((res) => {
      if (res.isDuplicate) {
        setDuplicateWarning(
          `Salary for this employee for this period is already recorded (${res.existingPayment?.referenceNo}, Status: ${res.existingPayment?.status}). Duplicate salary will be blocked.`
        );
      } else {
        setDuplicateWarning(null);
      }
    });
  }, [formEmployeeId, formPeriodMonth, formPeriodYear, formTxType, isRecordModalOpen, structureMap]);

  const computedNetSalary = useMemo(() => {
    const gross = Math.max(0, Number(formGrossAmount) || 0);
    const bonus = Math.max(0, Number(formBonus) || 0);
    const ded = Math.max(0, Number(formDeductions) || 0);
    return Math.max(0, gross + bonus - ded);
  }, [formGrossAmount, formBonus, formDeductions]);

  const handleSaveSalaryPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateWarning) {
      showToast(duplicateWarning, 'error');
      return;
    }

    const emp = employees.find((x) => x.id === formEmployeeId);
    if (!emp) {
      showToast('Please select a valid employee', 'error');
      return;
    }

    const gross = Number(formGrossAmount) || 0;
    if (gross <= 0) {
      showToast('Gross salary must be greater than zero', 'error');
      return;
    }

    const daysInMonth = new Date(parseInt(formPeriodYear, 10), parseInt(formPeriodMonth, 10), 0).getDate();
    const periodStart = `${formPeriodYear}-${formPeriodMonth}-01`;
    const periodEnd = `${formPeriodYear}-${formPeriodMonth}-${String(daysInMonth).padStart(2, '0')}`;
    const monthLabel = `${MONTH_NAMES.find((m) => m.value === formPeriodMonth)?.label || 'Month'} ${formPeriodYear}`;

    setSavingPayment(true);
    try {
      const bonus = Number(formBonus) || 0;
      const ded = Number(formDeductions) || 0;

      const items: any[] = [
        { itemType: 'EARNING', itemName: 'Base & Allowances', amount: gross },
      ];
      if (bonus > 0) {
        items.push({ itemType: 'EARNING', itemName: 'Bonus / Incentive', amount: bonus });
      }
      if (ded > 0) {
        items.push({ itemType: 'DEDUCTION', itemName: 'Deductions / Adjustments', amount: ded });
      }

      const res = await payrollService.recordSalaryPayment({
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.employeeId || 'VST-EMP',
        department: emp.department,
        designation: emp.designation,
        salaryPeriodStart: periodStart,
        salaryPeriodEnd: periodEnd,
        salaryPeriodLabel: monthLabel,
        paymentDate: formPaymentDate,
        grossAmount: gross + bonus,
        deductionAmount: ded,
        additionAmount: bonus,
        netAmount: computedNetSalary,
        paymentMode: formPaymentMode,
        referenceNo: formReferenceNo,
        status: formStatus,
        transactionType: formTxType,
        notes: formNotes,
        items,
      });

      if (res.success) {
        showToast(
          `Salary payment of ${formatInr(computedNetSalary)} recorded successfully for ${emp.name}!`,
          'success'
        );
        setIsRecordModalOpen(false);
        await loadData();
      } else {
        showToast(res.error || 'Failed to record salary payment', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error recording salary payment', 'error');
    } finally {
      setSavingPayment(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CONFIGURE STRUCTURE FORM LOGIC
  // ---------------------------------------------------------------------------

  const openStructureModal = (emp?: UserAccount) => {
    const targetEmp = emp || activeEmployees[0];
    if (!targetEmp) {
      showToast('No active employees found.', 'info');
      return;
    }

    setStructEmployeeId(targetEmp.id);
    const existing = structureMap.get(targetEmp.id);
    if (existing) {
      setStructBaseSalary(String(existing.baseSalary));
      setStructHra(String(existing.hraAllowance));
      setStructOtherAllowances(String(existing.otherAllowances));
      setStructStandardDeductions(String(existing.standardDeductions));
      setStructPaymentMode(existing.paymentMode || 'Bank Transfer');
      setStructBankName(existing.bankName || '');
      setStructAccountNo(existing.bankAccountNo || '');
      setStructIfsc(existing.bankIfsc || '');
      setStructUpiId(existing.upiId || '');
      setStructNotes(existing.notes || '');
    } else {
      setStructBaseSalary('');
      setStructHra('0');
      setStructOtherAllowances('0');
      setStructStandardDeductions('0');
      setStructPaymentMode('Bank Transfer');
      setStructBankName('');
      setStructAccountNo('');
      setStructIfsc('');
      setStructUpiId('');
      setStructNotes('');
    }

    setIsStructureModalOpen(true);
  };

  const handleSaveStructure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!structEmployeeId) {
      showToast('Please select an employee', 'error');
      return;
    }

    const base = Number(structBaseSalary) || 0;
    if (base <= 0) {
      showToast('Base salary must be greater than zero', 'error');
      return;
    }

    setSavingStructure(true);
    try {
      const res = await payrollService.upsertSalaryStructure({
        employeeId: structEmployeeId,
        baseSalary: base,
        hraAllowance: Number(structHra) || 0,
        otherAllowances: Number(structOtherAllowances) || 0,
        standardDeductions: Number(structStandardDeductions) || 0,
        paymentMode: structPaymentMode,
        bankName: structBankName || undefined,
        bankAccountNo: structAccountNo || undefined,
        bankIfsc: structIfsc || undefined,
        upiId: structUpiId || undefined,
        notes: structNotes || undefined,
      });

      if (res.success) {
        showToast('Salary structure updated successfully', 'success');
        setIsStructureModalOpen(false);
        await loadData();
      } else {
        showToast(res.error || 'Failed to update salary structure', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating salary structure', 'error');
    } finally {
      setSavingStructure(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CANCELLATION LOGIC
  // ---------------------------------------------------------------------------

  const handleConfirmCancel = async () => {
    if (!paymentToCancel) return;
    setCancelling(true);
    try {
      const res = await payrollService.cancelSalaryPayment(
        paymentToCancel.id,
        cancellationReason.trim() || 'Salary cancelled by administrator'
      );

      if (res.success) {
        showToast(
          `Salary payment ${paymentToCancel.referenceNo} reversed. Linked expense, Daybook, and Cashbook entries cancelled.`,
          'success'
        );
        setPaymentToCancel(null);
        setCancellationReason('');
        await loadData();
      } else {
        showToast(res.error || 'Failed to cancel salary payment', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Error cancelling payment', 'error');
    } finally {
      setCancelling(false);
    }
  };

  // ---------------------------------------------------------------------------
  // AUDIT RUNNER
  // ---------------------------------------------------------------------------

  const handleRunAudit = async () => {
    setAuditing(true);
    try {
      const rep = await payrollService.auditPayrollConsistency();
      setAuditSummary(rep);
      setIsAuditModalOpen(true);
    } catch (err: any) {
      showToast('Error running financial audit', 'error');
    } finally {
      setAuditing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // EXPORT HANDLERS
  // ---------------------------------------------------------------------------

  const handleExportPdf = () => {
    const settings = store.getSettings();
    downloadPayrollReportPdf(payments, summary.monthLabel, settings);
  };

  const handleExportExcel = () => {
    downloadPayrollReportExcel(payments, summary.monthLabel);
  };

  // ---------------------------------------------------------------------------
  // RENDER HELPERS
  // ---------------------------------------------------------------------------

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            PAID
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3" />
            PENDING
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800 line-through">
            <RotateCcw className="w-3 h-3" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. PROFESSIONAL HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Salary & Payroll</h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Manage employee compensation, record verified salary disbursements, and inspect linked financial postings.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleRunAudit}
            disabled={auditing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            title="Cross-check Salary ↔ Expense ↔ Daybook ↔ Cashbook consistency"
          >
            <ShieldCheck className={`w-4 h-4 ${auditing ? 'animate-spin text-blue-500' : 'text-emerald-600 dark:text-emerald-400'}`} />
            <span>Audit Payroll</span>
          </button>

          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-1 hidden group-hover:block z-30">
              <button
                onClick={handleExportPdf}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Export as PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Export as Excel
              </button>
            </div>
          </div>

          <button
            onClick={() => openStructureModal()}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Sliders className="w-4 h-4 text-slate-500" />
            <span>Salary Structures</span>
          </button>

          <button
            onClick={() => openRecordModalForEmployee()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Salary Payment</span>
          </button>
        </div>
      </div>

      {/* 2. TOP PAYROLL KPI CARDS (PART 4 SPECIFICATION) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Payroll */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Payroll This Month
            </span>
            <div className="p-2 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950/80 dark:text-blue-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatInr(summary.totalPayrollThisMonth)}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              For {summary.monthLabel} ({summary.activeEmployees} active staff)
            </p>
          </div>
        </div>

        {/* Salary Paid */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Salary Paid
            </span>
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {formatInr(summary.salaryPaid)}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Disbursed and recorded in Expenses & Outflows
            </p>
          </div>
        </div>

        {/* Salary Pending */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              Salary Pending
            </span>
            <div className="p-2 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
              {formatInr(summary.salaryPending)}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Awaiting disbursement for this period
            </p>
          </div>
        </div>

        {/* Employees Paid Count */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              Employees Paid
            </span>
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {summary.employeesPaidCount} / {summary.activeEmployees}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {summary.employeesPaidCount === summary.activeEmployees && summary.activeEmployees > 0
                ? 'All staff salaries cleared for the month'
                : `${summary.activeEmployees - summary.employeesPaidCount} employee(s) pending`}
            </p>
          </div>
        </div>
      </div>

      {/* 3. SUB-NAVIGATION TABS */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          onClick={() => setActiveSubTab('history')}
          className={`pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeSubTab === 'history'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Payroll History & Transactions
        </button>
        <button
          onClick={() => setActiveSubTab('calendar')}
          className={`pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeSubTab === 'calendar'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Monthly Payroll Register ({summary.monthLabel})
        </button>
        <button
          onClick={() => setActiveSubTab('structures')}
          className={`pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer ${
            activeSubTab === 'structures'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          Salary Structures & Profiles ({activeEmployees.length})
        </button>
      </div>

      {/* 4. FILTER CONTROLS BAR (FOR HISTORY TAB) */}
      {activeSubTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-2 relative">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Employee name, ID, ref..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Month Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Month
              </label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none font-medium"
              >
                {MONTH_NAMES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Year
              </label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none font-medium"
              >
                <option value="ALL">All Years</option>
                <option value="2026">2026</option>
                <option value="2025">2025</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="PAID">Paid</option>
                <option value="PENDING">Pending</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Payment Mode */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Mode
              </label>
              <select
                value={filterPaymentMode}
                onChange={(e) => setFilterPaymentMode(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none font-medium"
              >
                <option value="ALL">All Modes</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB 1: PAYROLL HISTORY TABLE */}
      {activeSubTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Salary History & Linked Postings
            </h3>
            <span className="text-xs text-slate-500">
              Showing {payments.length} {payments.length === 1 ? 'record' : 'records'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-3.5">Employee</th>
                  <th className="p-3.5">Emp ID</th>
                  <th className="p-3.5">Period</th>
                  <th className="p-3.5 text-right">Gross</th>
                  <th className="p-3.5 text-right">Deductions</th>
                  <th className="p-3.5 text-right">Net Salary</th>
                  <th className="p-3.5">Payment Date</th>
                  <th className="p-3.5">Mode</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Reference</th>
                  <th className="p-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400">
                      Loading salary records...
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                        <p className="font-medium">No salary payments found for the selected period.</p>
                        <button
                          onClick={() => openRecordModalForEmployee()}
                          className="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          + Record your first salary payment
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                        <div>
                          <span>{p.employeeName}</span>
                          {p.designation && (
                            <span className="block text-[10px] font-normal text-slate-400">
                              {p.designation} {p.department ? `• ${p.department}` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {p.employeeCode}
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                        {p.salaryPeriodLabel}
                      </td>
                      <td className="p-3.5 text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {formatInr(p.grossAmount)}
                      </td>
                      <td className="p-3.5 text-right font-medium text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {p.deductionAmount > 0 ? `-${formatInr(p.deductionAmount)}` : '—'}
                      </td>
                      <td className="p-3.5 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                        {formatInr(p.netAmount)}
                      </td>
                      <td className="p-3.5 text-slate-500 whitespace-nowrap">{p.paymentDate}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {p.paymentMode}
                        </span>
                      </td>
                      <td className="p-3.5 whitespace-nowrap">{renderStatusBadge(p.status)}</td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {p.referenceNo}
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedPayslipPayment(p)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
                            title="View & Download Payslip"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          {p.status === 'PAID' && (
                            <button
                              onClick={() => {
                                setPaymentToCancel(p);
                                setCancellationReason('');
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                              title="Cancel & Reverse Salary Payment"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. TAB 2: MONTHLY REGISTER / CALENDAR */}
      {activeSubTab === 'calendar' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Monthly Staff Register — {summary.monthLabel}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Quickly clear or check payment status for all active employees for this salary period.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Cleared: {summary.employeesPaidCount} / {summary.activeEmployees}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-3.5">Employee</th>
                  <th className="p-3.5">Emp ID</th>
                  <th className="p-3.5">Department</th>
                  <th className="p-3.5 text-right">Configured Base</th>
                  <th className="p-3.5 text-right">Allowances</th>
                  <th className="p-3.5 text-right">Net Payable</th>
                  <th className="p-3.5">Disbursement Status</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeEmployees.map((emp) => {
                  const s = structureMap.get(emp.id);
                  const base = s?.baseSalary || 0;
                  const allow = (s?.hraAllowance || 0) + (s?.otherAllowances || 0);
                  const net = Math.max(0, base + allow - (s?.standardDeductions || 0));

                  // Find if paid for this month
                  const daysInMonth = new Date(parseInt(filterYear, 10), parseInt(filterMonth, 10), 0).getDate();
                  const periodStart = `${filterYear}-${filterMonth}-01`;
                  const periodEnd = `${filterYear}-${filterMonth}-${String(daysInMonth).padStart(2, '0')}`;

                  const paidPayment = payments.find(
                    (p) =>
                      p.employeeId === emp.id &&
                      p.salaryPeriodStart === periodStart &&
                      p.status === 'PAID'
                  );
                  const isPaid = Boolean(paidPayment);

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                        {emp.name}
                        {emp.designation && (
                          <span className="block text-[10px] font-normal text-slate-400">
                            {emp.designation}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {emp.employeeId || 'VST-EMP'}
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400">
                        {emp.department || 'General'}
                      </td>
                      <td className="p-3.5 text-right font-medium text-slate-700 dark:text-slate-300">
                        {base > 0 ? formatInr(base) : <span className="text-amber-500 italic">Unconfigured</span>}
                      </td>
                      <td className="p-3.5 text-right font-medium text-slate-700 dark:text-slate-300">
                        {allow > 0 ? formatInr(allow) : '—'}
                      </td>
                      <td className="p-3.5 text-right font-black text-slate-900 dark:text-white">
                        {net > 0 ? formatInr(net) : '—'}
                      </td>
                      <td className="p-3.5">
                        {isPaid ? (
                          renderStatusBadge('PAID')
                        ) : (
                          renderStatusBadge('PENDING')
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        {isPaid ? (
                          <button
                            onClick={() => setSelectedPayslipPayment(paidPayment!)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
                          >
                            View Payslip
                          </button>
                        ) : (
                          <button
                            onClick={() => openRecordModalForEmployee(emp)}
                            className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors cursor-pointer"
                          >
                            Pay Salary
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. TAB 3: SALARY STRUCTURES */}
      {activeSubTab === 'structures' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Staff Compensation & Bank Profiles
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Configure monthly base salary, allowances, default payment mode, and bank accounts per staff member.
              </p>
            </div>
            <button
              onClick={() => openStructureModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Configure Structure</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-3.5">Employee</th>
                  <th className="p-3.5">Emp ID</th>
                  <th className="p-3.5">Frequency</th>
                  <th className="p-3.5 text-right">Base Salary</th>
                  <th className="p-3.5 text-right">HRA</th>
                  <th className="p-3.5 text-right">Other Allowances</th>
                  <th className="p-3.5 text-right">Deductions</th>
                  <th className="p-3.5">Payment Mode</th>
                  <th className="p-3.5">Bank / UPI</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeEmployees.map((emp) => {
                  const s = structureMap.get(emp.id);
                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                        {emp.name}
                        {emp.designation && (
                          <span className="block text-[10px] font-normal text-slate-400">
                            {emp.designation} {emp.department ? `• ${emp.department}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {emp.employeeId || 'VST-EMP'}
                      </td>
                      <td className="p-3.5 text-slate-600 dark:text-slate-400">
                        {s?.salaryFrequency || 'Monthly'}
                      </td>
                      <td className="p-3.5 text-right font-black text-slate-900 dark:text-white">
                        {s ? formatInr(s.baseSalary) : <span className="text-amber-500 font-normal italic">Not set</span>}
                      </td>
                      <td className="p-3.5 text-right font-medium text-slate-600 dark:text-slate-400">
                        {s?.hraAllowance ? formatInr(s.hraAllowance) : '—'}
                      </td>
                      <td className="p-3.5 text-right font-medium text-slate-600 dark:text-slate-400">
                        {s?.otherAllowances ? formatInr(s.otherAllowances) : '—'}
                      </td>
                      <td className="p-3.5 text-right font-medium text-rose-600">
                        {s?.standardDeductions ? `-${formatInr(s.standardDeductions)}` : '—'}
                      </td>
                      <td className="p-3.5 text-slate-700 dark:text-slate-300">
                        {s?.paymentMode || 'Bank Transfer'}
                      </td>
                      <td className="p-3.5 text-[11px] text-slate-500">
                        {s?.upiId ? (
                          <span className="font-mono text-blue-600 dark:text-blue-400">{s.upiId}</span>
                        ) : s?.bankAccountNo ? (
                          <span>
                            {s.bankName || 'Bank'}: ••••{s.bankAccountNo.slice(-4)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => openStructureModal(emp)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* MODAL 1: RECORD SALARY PAYMENT */}
      {/* ======================================================================= */}
      {isRecordModalOpen && (
        <Modal
          isOpen={isRecordModalOpen}
          onClose={() => setIsRecordModalOpen(false)}
          title="Record Salary Payment"
          maxWidth="2xl"
        >
          <form onSubmit={handleSaveSalaryPayment} className="space-y-4">
            {duplicateWarning && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <p className="font-bold">Duplicate Salary Detected</p>
                  <p className="mt-0.5">{duplicateWarning}</p>
                </div>
              </div>
            )}

            {/* Employee & Transaction Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Employee *
                </label>
                <select
                  value={formEmployeeId}
                  onChange={(e) => setFormEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-none"
                  required
                >
                  {activeEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.employeeId || 'VST-EMP'}) {e.department ? `— ${e.department}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Disbursement Type
                </label>
                <select
                  value={formTxType}
                  onChange={(e) => setFormTxType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-none"
                >
                  <option value="REGULAR">Regular Monthly Salary</option>
                  <option value="ADVANCE">Salary Advance</option>
                  <option value="BONUS">Bonus / Incentive Only</option>
                  <option value="ADJUSTMENT">Arrears / Adjustment</option>
                </select>
              </div>
            </div>

            {/* Salary Period & Payment Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Salary Month *
                </label>
                <select
                  value={formPeriodMonth}
                  onChange={(e) => setFormPeriodMonth(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-none"
                >
                  {MONTH_NAMES.filter((m) => m.value !== 'ALL').map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Salary Year *
                </label>
                <select
                  value={formPeriodYear}
                  onChange={(e) => setFormPeriodYear(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-none"
                >
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  value={formPaymentDate}
                  onChange={(e) => setFormPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-none"
                  required
                />
              </div>
            </div>

            {/* Financial Breakdown (Gross, Additions, Deductions) */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Compensation Breakdown
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Gross / Base Salary (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formGrossAmount}
                    onChange={(e) => setFormGrossAmount(e.target.value)}
                    placeholder="30000"
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Bonus / Allowances (+₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formBonus}
                    onChange={(e) => setFormBonus(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Deductions / Recovery (-₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formDeductions}
                    onChange={(e) => setFormDeductions(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 outline-none"
                  />
                </div>
              </div>

              {/* Dynamic Net Pay Box */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Calculated Net Disbursable Salary:
                </span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  {formatInr(computedNetSalary)}
                </span>
              </div>
            </div>

            {/* Payment Mode, Reference & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Payment Mode *
                </label>
                <select
                  value={formPaymentMode}
                  onChange={(e) => setFormPaymentMode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-none"
                >
                  <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Reference No *
                </label>
                <input
                  type="text"
                  value={formReferenceNo}
                  onChange={(e) => setFormReferenceNo(e.target.value)}
                  placeholder="SAL-2026-09-0001"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-none"
                >
                  <option value="PAID">Paid (Create Financial Postings)</option>
                  <option value="PENDING">Pending (Salary Due / No Cash Outflow)</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Notes & Remarks
              </label>
              <input
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Disbursement via HDFC salary account / September performance incentive..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
              />
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsRecordModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPayment || Boolean(duplicateWarning)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 disabled:opacity-50 transition-all cursor-pointer"
              >
                {savingPayment ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================================================================= */}
      {/* MODAL 2: CONFIGURE SALARY STRUCTURE */}
      {/* ======================================================================= */}
      {isStructureModalOpen && (
        <Modal
          isOpen={isStructureModalOpen}
          onClose={() => setIsStructureModalOpen(false)}
          title="Configure Employee Salary Structure"
          maxWidth="xl"
        >
          <form onSubmit={handleSaveStructure} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Employee *
              </label>
              <select
                value={structEmployeeId}
                onChange={(e) => {
                  setStructEmployeeId(e.target.value);
                  const existing = structureMap.get(e.target.value);
                  if (existing) {
                    setStructBaseSalary(String(existing.baseSalary));
                    setStructHra(String(existing.hraAllowance));
                    setStructOtherAllowances(String(existing.otherAllowances));
                    setStructStandardDeductions(String(existing.standardDeductions));
                    setStructPaymentMode(existing.paymentMode || 'Bank Transfer');
                    setStructBankName(existing.bankName || '');
                    setStructAccountNo(existing.bankAccountNo || '');
                    setStructIfsc(existing.bankIfsc || '');
                    setStructUpiId(existing.upiId || '');
                  }
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium outline-none"
                required
              >
                {activeEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.employeeId || 'VST-EMP'}) {e.department ? `— ${e.department}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Monthly Base Salary (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={structBaseSalary}
                  onChange={(e) => setStructBaseSalary(e.target.value)}
                  placeholder="30000"
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  HRA Allowance (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={structHra}
                  onChange={(e) => setStructHra(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Other Monthly Allowances (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={structOtherAllowances}
                  onChange={(e) => setStructOtherAllowances(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Standard Deductions (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={structStandardDeductions}
                  onChange={(e) => setStructStandardDeductions(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>

            {/* Bank / UPI Details */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-3">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Disbursement Account Details
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Payment Mode</label>
                  <select
                    value={structPaymentMode}
                    onChange={(e) => setStructPaymentMode(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">UPI ID</label>
                  <input
                    type="text"
                    value={structUpiId}
                    onChange={(e) => setStructUpiId(e.target.value)}
                    placeholder="user@upi / mobile@okhdfcbank"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={structBankName}
                    onChange={(e) => setStructBankName(e.target.value)}
                    placeholder="HDFC Bank"
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={structAccountNo}
                    onChange={(e) => setStructAccountNo(e.target.value)}
                    placeholder="50100234567890"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={structIfsc}
                    onChange={(e) => setStructIfsc(e.target.value)}
                    placeholder="HDFC0001234"
                    className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsStructureModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingStructure}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 disabled:opacity-50 transition-all cursor-pointer"
              >
                {savingStructure ? 'Saving...' : 'Save Structure'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======================================================================= */}
      {/* MODAL 3: PAYSLIP PREVIEW & PDF DOWNLOAD */}
      {/* ======================================================================= */}
      {selectedPayslipPayment && (
        <Modal
          isOpen={Boolean(selectedPayslipPayment)}
          onClose={() => setSelectedPayslipPayment(null)}
          title={`Payslip — ${selectedPayslipPayment.employeeName}`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {/* Visual Payslip Paper Card */}
            <div className="p-6 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-5">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                    {store.getSettings()?.legalName || 'VISTAAR BUSINESS OS'}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Monthly Salary Disbursement Slip
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                    {selectedPayslipPayment.salaryPeriodLabel}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Ref: {selectedPayslipPayment.referenceNo}
                  </span>
                </div>
              </div>

              {/* Employee Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-xs">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase">Employee</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{selectedPayslipPayment.employeeName}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase">Employee ID</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{selectedPayslipPayment.employeeCode}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase">Designation</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedPayslipPayment.designation || 'Staff'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase">Department</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedPayslipPayment.department || 'General'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase">Payment Date</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedPayslipPayment.paymentDate}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase">Payment Mode</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedPayslipPayment.paymentMode}</span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase">Status</span>
                  <div>{renderStatusBadge(selectedPayslipPayment.status)}</div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block uppercase">Type</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedPayslipPayment.transactionType}</span>
                </div>
              </div>

              {/* Breakdown Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                    <tr>
                      <th className="p-2.5">Earnings</th>
                      <th className="p-2.5 text-right">Amount</th>
                      <th className="p-2.5">Deductions</th>
                      <th className="p-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr>
                      <td className="p-2.5 text-slate-700 dark:text-slate-300">Base Salary & Allowances</td>
                      <td className="p-2.5 text-right font-medium text-slate-900 dark:text-slate-100">
                        {formatInr(selectedPayslipPayment.grossAmount)}
                      </td>
                      <td className="p-2.5 text-slate-700 dark:text-slate-300">Deductions & Adjustments</td>
                      <td className="p-2.5 text-right font-medium text-rose-600">
                        {selectedPayslipPayment.deductionAmount > 0
                          ? `-${formatInr(selectedPayslipPayment.deductionAmount)}`
                          : '₹0.00'}
                      </td>
                    </tr>
                    <tr className="bg-slate-50 dark:bg-slate-900/60 font-bold">
                      <td className="p-2.5 text-slate-900 dark:text-white">Gross Earnings</td>
                      <td className="p-2.5 text-right text-slate-900 dark:text-white">
                        {formatInr(selectedPayslipPayment.grossAmount)}
                      </td>
                      <td className="p-2.5 text-slate-900 dark:text-white">Total Deductions</td>
                      <td className="p-2.5 text-right text-rose-600">
                        {formatInr(selectedPayslipPayment.deductionAmount)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Net Disbursed Box */}
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                    Net Take-Home Salary
                  </span>
                  <span className="text-xs text-slate-500">Disbursed to employee account</span>
                </div>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatInr(selectedPayslipPayment.netAmount)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-400 italic">
                System-generated digital payslip with linked ledger audit trail.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  onClick={() => {
                    const settings = store.getSettings();
                    downloadPayslipPdf(selectedPayslipPayment, settings);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ======================================================================= */}
      {/* MODAL 4: CANCEL PAYMENT CONFIRMATION */}
      {/* ======================================================================= */}
      {paymentToCancel && (
        <Modal
          isOpen={Boolean(paymentToCancel)}
          onClose={() => setPaymentToCancel(null)}
          title="Cancel & Reverse Salary Payment"
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-bold">Auditable Financial Reversal</p>
                <p className="mt-0.5">
                  Cancelling this salary payment will reverse the linked Expense record, mark the Daybook journal transaction as VOID, and remove the Cashbook outflow. The payment record itself will be retained as CANCELLED for full audit history.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Employee:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{paymentToCancel.employeeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Period:</span>
                <span className="font-medium text-slate-700 dark:text-slate-300">{paymentToCancel.salaryPeriodLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount:</span>
                <span className="font-black text-rose-600">{formatInr(paymentToCancel.netAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reference:</span>
                <span className="font-mono text-slate-600 dark:text-slate-400">{paymentToCancel.referenceNo}</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                Reason for Cancellation *
              </label>
              <input
                type="text"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Incorrect amount entered / Disbursed via incorrect account..."
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPaymentToCancel(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Keep Payment
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelling}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {cancelling ? 'Reversing...' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ======================================================================= */}
      {/* MODAL 5: FINANCIAL CONSISTENCY AUDIT REPORT */}
      {/* ======================================================================= */}
      {isAuditModalOpen && auditSummary && (
        <Modal
          isOpen={isAuditModalOpen}
          onClose={() => setIsAuditModalOpen(false)}
          title="Payroll Financial Consistency Audit"
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                auditSummary.overallStatus === 'PASS'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                  : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
              }`}
            >
              {auditSummary.overallStatus === 'PASS' ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs">
                <p className="font-extrabold text-sm uppercase tracking-wide">
                  {auditSummary.overallStatus === 'PASS'
                    ? '100% Reconciled Financial Ledger'
                    : 'Reconciliation Variances Found'}
                </p>
                <p className="mt-1">{auditSummary.summaryText}</p>
                <p className="mt-0.5 text-[11px] opacity-80">
                  Checked: {auditSummary.totalPaymentsChecked} payments • Reconciled: {auditSummary.reconciledCount} • Mismatches: {auditSummary.mismatchesFound}
                </p>
              </div>
            </div>

            {/* Detailed Results List */}
            <div className="max-h-72 overflow-y-auto space-y-2 text-xs">
              {auditSummary.results.length === 0 ? (
                <p className="text-center text-slate-400 py-4">No payments recorded to audit.</p>
              ) : (
                auditSummary.results.map((r) => (
                  <div
                    key={r.paymentId}
                    className={`p-3 rounded-xl border flex items-center justify-between ${
                      r.isFullyReconciled
                        ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        : 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{r.employeeName}</span>
                        <span className="font-mono text-[10px] text-slate-400">({r.referenceNo})</span>
                        {renderStatusBadge(r.status)}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {r.periodLabel} • {formatInr(r.netAmount)} on {r.paymentDate}
                      </p>
                      {r.issues.length > 0 && (
                        <ul className="mt-1 list-disc list-inside text-[11px] text-rose-600 dark:text-rose-400">
                          {r.issues.map((iss, i) => (
                            <li key={i}>{iss}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      {r.isFullyReconciled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          <AlertCircle className="w-3.5 h-3.5" /> Discrepancy
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Close Audit Report
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
