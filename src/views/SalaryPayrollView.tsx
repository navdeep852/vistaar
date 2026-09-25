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
  UserPlus,
  UploadCloud,
  AlertTriangle,
  Archive,
  Briefcase,
  Phone,
  Mail,
  Edit3,
  MoreVertical,
  RefreshCw,
  FileSpreadsheet,
  UserCheck,
  UserX,
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
import { UserAccount, EmploymentType, EmployeeStatus } from '../types';
import { showToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import {
  downloadPayslipPdf,
  downloadPayrollReportPdf,
  downloadPayrollReportExcel,
  downloadEmployeeDirectoryExcel,
  formatInr,
} from '../services/payrollExportService';
import { AddEmployeeModal } from '../components/payroll/AddEmployeeModal';
import { EditEmployeeModal } from '../components/payroll/EditEmployeeModal';
import { EmployeeProfileModal } from '../components/payroll/EmployeeProfileModal';
import { BulkImportEmployeesModal } from '../components/payroll/BulkImportEmployeesModal';

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

  // Navigation Sub-tab: 4 authoritative modules
  const [activeSubTab, setActiveSubTab] = useState<'employees' | 'history' | 'structures' | 'calendar'>('employees');

  // Filter States (Payroll History)
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth);
  const [filterYear, setFilterYear] = useState<string>(currentYear);
  const [filterDepartment, setFilterDepartment] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPaymentMode, setFilterPaymentMode] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Employee Master Directory Filters
  const [empSearchQuery, setEmpSearchQuery] = useState<string>('');
  const [empDepartmentFilter, setEmpDepartmentFilter] = useState<string>('ALL');
  const [empStatusFilter, setEmpStatusFilter] = useState<string>('ALL');
  const [empEmploymentTypeFilter, setEmpEmploymentTypeFilter] = useState<string>('ALL');
  const [empViewMode, setEmpViewMode] = useState<'active' | 'archived'>('active');

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

  // Modal States - Employee Master
  const [isAddEmployeeModalOpen, setIsAddEmployeeModalOpen] = useState<boolean>(false);
  const [isEditEmployeeModalOpen, setIsEditEmployeeModalOpen] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [selectedEmployee, setSelectedEmployee] = useState<UserAccount | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<UserAccount | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<boolean>(false);

  // Modal States - Payroll & Payments
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

  // Active employees for selection (excludes archived)
  const activeEmployees = useMemo(() => {
    return employees.filter((e) => !e.isArchived && (e.status || 'Active') === 'Active');
  }, [employees]);

  const activeEmployeeCount = useMemo(() => {
    return employees.filter((e) => !e.isArchived).length;
  }, [employees]);

  const archivedEmployeeCount = useMemo(() => {
    return employees.filter((e) => Boolean(e.isArchived)).length;
  }, [employees]);

  // Departments list
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.department?.trim()) set.add(e.department.trim());
    });
    return Array.from(set);
  }, [employees]);

  // Structure map (employeeId -> SalaryStructure)
  const structureMap = useMemo(() => {
    const map = new Map<string, SalaryStructure>();
    structures.forEach((s) => map.set(s.employeeId, s));
    return map;
  }, [structures]);

  // Unconfigured salary count
  const unconfiguredCount = useMemo(() => {
    return employees.filter((e) => !e.isArchived && !structureMap.has(e.id)).length;
  }, [employees, structureMap]);

  // Filtered employees for Employee Master Tab
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // 1. Active vs Archived
      const isArchived = Boolean(emp.isArchived);
      if (empViewMode === 'active' && isArchived) return false;
      if (empViewMode === 'archived' && !isArchived) return false;

      // 2. Department filter
      if (empDepartmentFilter !== 'ALL') {
        if ((emp.department || '').toLowerCase() !== empDepartmentFilter.toLowerCase()) return false;
      }

      // 3. Status filter
      if (empStatusFilter !== 'ALL') {
        const status = emp.status || 'Active';
        if (status !== empStatusFilter) return false;
      }

      // 4. Employment Type filter
      if (empEmploymentTypeFilter !== 'ALL') {
        const type = emp.employmentType || 'Full Time';
        if (type !== empEmploymentTypeFilter) return false;
      }

      // 5. Search query
      if (empSearchQuery.trim()) {
        const q = empSearchQuery.toLowerCase();
        const matchName = (emp.name || '').toLowerCase().includes(q);
        const matchId = (emp.employeeId || '').toLowerCase().includes(q);
        const matchPhone = (emp.phone || '').toLowerCase().includes(q);
        const matchEmail = (emp.email || '').toLowerCase().includes(q);
        const matchDesignation = (emp.designation || '').toLowerCase().includes(q);
        const matchDept = (emp.department || '').toLowerCase().includes(q);
        if (!matchName && !matchId && !matchPhone && !matchEmail && !matchDesignation && !matchDept) {
          return false;
        }
      }

      return true;
    });
  }, [employees, empViewMode, empDepartmentFilter, empStatusFilter, empEmploymentTypeFilter, empSearchQuery]);

  // ---------------------------------------------------------------------------
  // EMPLOYEE MASTER ACTION HANDLERS
  // ---------------------------------------------------------------------------

  const handleOpenAddEmployee = () => {
    setIsAddEmployeeModalOpen(true);
  };

  const handleOpenEditEmployee = (emp: UserAccount) => {
    setSelectedEmployee(emp);
    setIsEditEmployeeModalOpen(true);
  };

  const handleOpenProfile = (emp: UserAccount) => {
    setSelectedEmployee(emp);
    setIsProfileModalOpen(true);
  };

  const handleArchiveToggle = async (emp: UserAccount) => {
    try {
      if (emp.isArchived) {
        const res = await supabaseAuthService.unarchiveEmployee(emp.id);
        if (res.success) {
          showToast(`${emp.name} restored to active employee directory`, 'success');
          await loadData();
        } else {
          showToast(res.error || 'Failed to restore employee', 'error');
        }
      } else {
        const res = await supabaseAuthService.archiveEmployee(emp.id);
        if (res.success) {
          showToast(`${emp.name} archived. Removed from active payroll cycles.`, 'info');
          await loadData();
        } else {
          showToast(res.error || 'Failed to archive employee', 'error');
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating employee status', 'error');
    }
  };

  const handleConfirmDelete = async () => {
    if (!employeeToDelete) return;
    setDeletingEmployee(true);
    try {
      const res = await supabaseAuthService.deleteEmployee(employeeToDelete.id);
      if (res.success) {
        showToast(`Employee ${employeeToDelete.name} deleted successfully`, 'success');
        setEmployeeToDelete(null);
        await loadData();
      } else {
        showToast(
          res.error || 'Cannot delete employee with recorded financial history. You can mark them Inactive or Archive them instead.',
          'error'
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete employee', 'error');
    } finally {
      setDeletingEmployee(false);
    }
  };

  const handleEmployeeCreated = async (
    newEmp: UserAccount,
    options?: { openSalaryConfig?: boolean; openProfile?: boolean }
  ) => {
    await loadData();
    if (options?.openSalaryConfig) {
      openStructureModal(newEmp);
    } else if (options?.openProfile) {
      handleOpenProfile(newEmp);
    }
    if (isRecordModalOpen) {
      setFormEmployeeId(newEmp.id);
    }
  };

  const handleExportEmployeeDirectory = () => {
    downloadEmployeeDirectoryExcel(employees, structureMap);
    showToast('Employee directory exported successfully', 'success');
  };

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

  const renderEmployeeStatusBadge = (status?: string) => {
    const s = status || 'Active';
    switch (s) {
      case 'Active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            Active
          </span>
        );
      case 'On Leave':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Clock className="w-3 h-3" />
            On Leave
          </span>
        );
      case 'Inactive':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Inactive
          </span>
        );
      case 'Resigned':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            Resigned
          </span>
        );
      case 'Terminated':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            Terminated
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {s}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* 1. PROFESSIONAL HEADER (MASTER PROMPT SPECIFICATION) */}
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
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-1 hidden group-hover:block z-30">
              <button
                onClick={handleExportPdf}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Export Payroll as PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Export Payroll as Excel
              </button>
              <button
                onClick={handleExportEmployeeDirectory}
                className="w-full text-left px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
              >
                Export Employee Directory (.xlsx)
              </button>
            </div>
          </div>

          {/* Prominent Add Employee Button */}
          <button
            onClick={handleOpenAddEmployee}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>+ Add Employee</span>
          </button>

          <button
            onClick={() => {
              setActiveSubTab('structures');
              openStructureModal();
            }}
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

      {/* UNCONFIGURED SALARY STRUCTURES BANNER */}
      {unconfiguredCount > 0 && activeEmployeeCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/60 rounded-xl text-amber-700 dark:text-amber-300 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold">
                {unconfiguredCount} employee{unconfiguredCount > 1 ? 's do' : ' does'} not have a salary structure configured
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">
                Configure base pay, allowances, and payment methods to automate monthly salary calculation.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              const unconfig = employees.find((e) => !e.isArchived && !structureMap.has(e.id));
              setActiveSubTab('structures');
              openStructureModal(unconfig);
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
          >
            Configure Structure →
          </button>
        </div>
      )}

      {/* 2. TOP PAYROLL KPI CARDS */}
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

      {/* 0 EMPLOYEES EMPTY STATE */}
      {!loading && employees.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center shadow-xs">
          <div className="max-w-xl mx-auto space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mx-auto flex items-center justify-center border border-blue-100 dark:border-blue-900/50">
              <Users className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                No Employees in Master Directory
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                Start by adding your employees to VISTAAR. You can add them individually with sequential <span className="font-mono font-bold text-blue-600 dark:text-blue-400">VST-EMP-XXX</span> IDs or bulk import your entire organization via Excel/CSV.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={handleOpenAddEmployee}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add First Employee</span>
              </button>

              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-slate-500" />
                <span>Import Staff (Excel/CSV)</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 border-t border-slate-100 dark:border-slate-800/80 text-left">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <span className="text-[11px] font-bold text-slate-900 dark:text-white block">Authoritative Master</span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Unified employee profile stored directly in your secure database.
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <span className="text-[11px] font-bold text-slate-900 dark:text-white block">Zero Ledger Clutter</span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Creating employees or salary structures generates zero unwanted journal entries.
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <span className="text-[11px] font-bold text-slate-900 dark:text-white block">Audited Disbursements</span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Disburse with 1-click; Daybook, Cashbook, and Expense postings auto-sync.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. SUB-NAVIGATION TABS (4 AUTHORITATIVE MODULES) */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 overflow-x-auto">
        <button
          onClick={() => setActiveSubTab('employees')}
          className={`pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'employees'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Employees ({activeEmployeeCount})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'history'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Payroll History & Transactions</span>
        </button>

        <button
          onClick={() => setActiveSubTab('structures')}
          className={`pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'structures'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Salary Structures & Revisions ({structures.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('calendar')}
          className={`pb-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeSubTab === 'calendar'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Monthly Register ({summary.monthLabel})</span>
        </button>
      </div>

      {/* 4. TAB 1: EMPLOYEE MASTER DIRECTORY */}
      {activeSubTab === 'employees' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search by name, ID (VST-EMP), phone, email, designation..."
                  value={empSearchQuery}
                  onChange={(e) => setEmpSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                {empSearchQuery && (
                  <button
                    onClick={() => setEmpSearchQuery('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Action Buttons: Add & Import */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 text-slate-500" />
                  <span>Import Excel</span>
                </button>

                <button
                  onClick={handleOpenAddEmployee}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Add Employee</span>
                </button>
              </div>
            </div>

            {/* Filter Pills / Dropdowns */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              {/* Department */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Department
                </label>
                <select
                  value={empDepartmentFilter}
                  onChange={(e) => setEmpDepartmentFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value="ALL">All Departments</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Status
                </label>
                <select
                  value={empStatusFilter}
                  onChange={(e) => setEmpStatusFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="On Leave">On Leave</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Resigned">Resigned</option>
                  <option value="Terminated">Terminated</option>
                </select>
              </div>

              {/* Employment Type */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Type
                </label>
                <select
                  value={empEmploymentTypeFilter}
                  onChange={(e) => setEmpEmploymentTypeFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 outline-none"
                >
                  <option value="ALL">All Types</option>
                  <option value="Full Time">Full Time</option>
                  <option value="Part Time">Part Time</option>
                  <option value="Contract">Contract</option>
                  <option value="Temporary">Temporary</option>
                  <option value="Intern">Intern</option>
                </select>
              </div>

              {/* Active vs Archived Toggle */}
              <div className="col-span-2 sm:col-span-1 lg:col-span-2 flex items-end">
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full">
                  <button
                    type="button"
                    onClick={() => setEmpViewMode('active')}
                    className={`flex-1 py-1 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      empViewMode === 'active'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Active Staff ({activeEmployeeCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmpViewMode('archived')}
                    className={`flex-1 py-1 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      empViewMode === 'archived'
                        ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Archived ({archivedEmployeeCount})
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Directory Content */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  {empViewMode === 'active' ? 'Active Employee Master' : 'Archived Employees'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Showing {filteredEmployees.length} of {empViewMode === 'active' ? activeEmployeeCount : archivedEmployeeCount} employees
                </p>
              </div>

              <button
                onClick={handleExportEmployeeDirectory}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export Directory (.xlsx)</span>
              </button>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Employee</th>
                    <th className="p-3.5">Emp ID</th>
                    <th className="p-3.5">Department</th>
                    <th className="p-3.5">Contact</th>
                    <th className="p-3.5">Joining Date</th>
                    <th className="p-3.5 text-right">Compensation (Monthly)</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        Loading employee master directory...
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Users className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                          <p className="font-medium">
                            {employees.length === 0
                              ? 'No employees found in directory.'
                              : 'No employees matched the selected search or filter.'}
                          </p>
                          {employees.length === 0 ? (
                            <button
                              onClick={handleOpenAddEmployee}
                              className="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                            >
                              + Add your first employee
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setEmpSearchQuery('');
                                setEmpDepartmentFilter('ALL');
                                setEmpStatusFilter('ALL');
                                setEmpEmploymentTypeFilter('ALL');
                              }}
                              className="mt-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                            >
                              Clear all filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const s = structureMap.get(emp.id);
                      const grossSalary = s ? s.baseSalary + (s.hraAllowance || 0) + (s.otherAllowances || 0) : 0;
                      return (
                        <tr
                          key={emp.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold flex items-center justify-center text-xs shrink-0">
                                {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-bold block">{emp.name}</span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {emp.designation && (
                                    <span className="text-[10px] text-slate-500 font-normal">
                                      {emp.designation}
                                    </span>
                                  )}
                                  {emp.employmentType && (
                                    <span className="text-[9px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                                      {emp.employmentType}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                            {emp.employeeId || 'VST-EMP'}
                          </td>
                          <td className="p-3.5 text-slate-600 dark:text-slate-300">
                            {emp.department || 'General'}
                          </td>
                          <td className="p-3.5 text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                            {emp.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{emp.phone}</span>
                              </div>
                            )}
                            {emp.email && (
                              <div className="flex items-center gap-1 text-slate-500">
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate max-w-[150px]">{emp.email}</span>
                              </div>
                            )}
                            {!emp.phone && !emp.email && <span className="text-slate-400">—</span>}
                          </td>
                          <td className="p-3.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {emp.joiningDate || '—'}
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            {s ? (
                              <div>
                                <span className="font-black text-slate-900 dark:text-white block">
                                  {formatInr(grossSalary)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  Base: {formatInr(s.baseSalary)}
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={() => openStructureModal(emp)}
                                className="text-[11px] font-semibold text-amber-600 hover:underline cursor-pointer"
                              >
                                Not configured
                              </button>
                            )}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            {renderEmployeeStatusBadge(emp.status)}
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleOpenProfile(emp)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
                                title="View Comprehensive Profile & Revisions"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleOpenEditEmployee(emp)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Edit Employee Details"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => openStructureModal(emp)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer"
                                title="Configure Salary Structure"
                              >
                                <Sliders className="w-3.5 h-3.5" />
                              </button>

                              {!emp.isArchived && (emp.status || 'Active') === 'Active' && (
                                <button
                                  onClick={() => openRecordModalForEmployee(emp)}
                                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors cursor-pointer"
                                  title="Record Salary Payment"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() => handleArchiveToggle(emp)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  emp.isArchived
                                    ? 'text-emerald-600 hover:bg-emerald-50'
                                    : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                }`}
                                title={emp.isArchived ? 'Restore to Active' : 'Archive Employee'}
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => setEmployeeToDelete(emp)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                                title="Delete Employee"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Cards View */}
            <div className="block lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <div className="p-6 text-center text-slate-400 text-xs">Loading employee directory...</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">No employees found.</div>
              ) : (
                filteredEmployees.map((emp) => {
                  const s = structureMap.get(emp.id);
                  const grossSalary = s ? s.baseSalary + (s.hraAllowance || 0) + (s.otherAllowances || 0) : 0;
                  return (
                    <div key={emp.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 font-bold flex items-center justify-center text-xs shrink-0">
                            {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white text-xs block">{emp.name}</span>
                            <span className="font-mono text-[10px] text-blue-600 font-semibold">{emp.employeeId || 'VST-EMP'}</span>
                          </div>
                        </div>
                        <div>{renderEmployeeStatusBadge(emp.status)}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl">
                        <div>
                          <span className="text-slate-400 text-[10px] block">Department / Role</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {emp.department || 'General'} {emp.designation ? `• ${emp.designation}` : ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block">Compensation</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {s ? formatInr(grossSalary) : 'Not configured'}
                          </span>
                        </div>
                        {emp.phone && (
                          <div>
                            <span className="text-slate-400 text-[10px] block">Phone</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{emp.phone}</span>
                          </div>
                        )}
                        {emp.joiningDate && (
                          <div>
                            <span className="text-slate-400 text-[10px] block">Joining Date</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{emp.joiningDate}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          onClick={() => handleOpenProfile(emp)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                        >
                          Profile
                        </button>
                        <button
                          onClick={() => handleOpenEditEmployee(emp)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openStructureModal(emp)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 cursor-pointer"
                        >
                          Salary
                        </button>
                        {!emp.isArchived && (emp.status || 'Active') === 'Active' && (
                          <button
                            onClick={() => openRecordModalForEmployee(emp)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-blue-600 cursor-pointer"
                          >
                            Pay
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. FILTER CONTROLS BAR (FOR HISTORY TAB) */}
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
                        <div className="flex items-center gap-1.5">
                          <span>{emp.name}</span>
                          {s?.version && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              v{s.version}
                            </span>
                          )}
                        </div>
                        {emp.designation && (
                          <span className="block text-[10px] font-normal text-slate-400">
                            {emp.designation} {emp.department ? `• ${emp.department}` : ''}
                          </span>
                        )}
                        {s?.effectiveFrom && (
                          <span className="block text-[9px] text-slate-400 font-normal">
                            Eff. from: {s.effectiveFrom}
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
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openStructureModal(emp)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleOpenProfile(emp)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
                            title="View Revisions History"
                          >
                            Revisions
                          </button>
                        </div>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Employee *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAddEmployeeModalOpen(true)}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ New Employee</span>
                  </button>
                </div>
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

      {/* ======================================================================= */}
      {/* MODAL 6: ADD EMPLOYEE MASTER MODAL */}
      {/* ======================================================================= */}
      <AddEmployeeModal
        isOpen={isAddEmployeeModalOpen}
        onClose={() => setIsAddEmployeeModalOpen(false)}
        onEmployeeCreated={handleEmployeeCreated}
        existingEmployees={employees}
      />

      {/* ======================================================================= */}
      {/* MODAL 7: EDIT EMPLOYEE MODAL */}
      {/* ======================================================================= */}
      <EditEmployeeModal
        isOpen={isEditEmployeeModalOpen}
        onClose={() => {
          setIsEditEmployeeModalOpen(false);
          setSelectedEmployee(null);
        }}
        employee={selectedEmployee}
        onEmployeeUpdated={async () => {
          await loadData();
        }}
        existingEmployees={employees}
      />

      {/* ======================================================================= */}
      {/* MODAL 8: COMPREHENSIVE EMPLOYEE PROFILE & REVISION HISTORY */}
      {/* ======================================================================= */}
      <EmployeeProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          setSelectedEmployee(null);
        }}
        employee={selectedEmployee}
        onEditEmployee={(emp) => {
          setIsProfileModalOpen(false);
          handleOpenEditEmployee(emp);
        }}
        onConfigureSalary={(emp) => {
          setIsProfileModalOpen(false);
          openStructureModal(emp);
        }}
        onViewPayslip={(payment) => {
          setIsProfileModalOpen(false);
          setSelectedPayslipPayment(payment);
        }}
        onRecordPaymentForEmp={(emp) => {
          setIsProfileModalOpen(false);
          openRecordModalForEmployee(emp);
        }}
      />

      {/* ======================================================================= */}
      {/* MODAL 9: BULK IMPORT EMPLOYEES (EXCEL / CSV) */}
      {/* ======================================================================= */}
      <BulkImportEmployeesModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingEmployees={employees}
        onImportComplete={async () => {
          await loadData();
          setActiveSubTab('employees');
        }}
      />

      {/* ======================================================================= */}
      {/* MODAL 10: DELETE EMPLOYEE CONFIRMATION WITH FINANCIAL SAFETY */}
      {/* ======================================================================= */}
      {employeeToDelete && (
        <Modal
          isOpen={Boolean(employeeToDelete)}
          onClose={() => setEmployeeToDelete(null)}
          title={`Delete Employee — ${employeeToDelete.name}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-bold">Financial History Audit Protection</p>
                <p className="mt-0.5">
                  Employees with any recorded salary payments, salary structures, or financial postings cannot be deleted. If this employee has financial records, the system will block deletion to protect your accounting integrity.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete <strong className="text-slate-900 dark:text-white">{employeeToDelete.name}</strong> ({employeeToDelete.employeeId || 'VST-EMP'})?
            </p>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  handleArchiveToggle(employeeToDelete);
                  setEmployeeToDelete(null);
                }}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Archive instead
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmployeeToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deletingEmployee}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {deletingEmployee ? 'Deleting...' : 'Delete Employee'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
