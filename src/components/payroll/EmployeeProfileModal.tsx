import React, { useState, useEffect } from 'react';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Calendar,
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sliders,
  History,
  TrendingUp,
  Tag,
  Shield,
} from 'lucide-react';
import { Modal } from '../Modal';
import { UserAccount } from '../../types';
import { SalaryPayment, SalaryStructure } from '../../types/payroll';
import { payrollService } from '../../services/supabase/payrollService';
import { formatInr } from '../../services/payrollExportService';

interface EmployeeProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: UserAccount | null;
  onEditEmployee: (emp: UserAccount) => void;
  onConfigureSalary: (emp: UserAccount) => void;
  onViewPayslip: (payment: SalaryPayment) => void;
  onRecordPaymentForEmp?: (emp: UserAccount) => void;
}

export const EmployeeProfileModal: React.FC<EmployeeProfileModalProps> = ({
  isOpen,
  onClose,
  employee,
  onEditEmployee,
  onConfigureSalary,
  onViewPayslip,
  onRecordPaymentForEmp,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'salary' | 'payments'>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    if (employee && isOpen) {
      setLoading(true);
      payrollService
        .getEmployeePayrollSummary(employee.id)
        .then((data) => {
          setSummary(data);
        })
        .catch((err) => {
          console.warn('Error loading employee payroll summary:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [employee, isOpen]);

  if (!employee) return null;

  const currentSalary = summary?.currentSalary || 0;
  const payments: SalaryPayment[] = summary?.payments || [];
  const structureHistory: SalaryStructure[] = summary?.structureHistory || [];

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'Active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            Active
          </span>
        );
      case 'On Leave':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3" />
            On Leave
          </span>
        );
      case 'Inactive':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Inactive
          </span>
        );
      case 'Resigned':
      case 'Terminated':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            {st}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {st}
          </span>
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Employee Profile"
      maxWidth="3xl"
    >
      <div className="space-y-5">
        {/* 1. EMPLOYEE HEADER BANNER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/30 text-blue-300 border border-blue-500/30 flex items-center justify-center font-black text-xl select-none shrink-0 shadow-inner">
              {employee.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">{employee.name}</h2>
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-white font-mono text-[11px] border border-white/10 font-bold">
                  {employee.employeeId}
                </span>
                {getStatusBadge(employee.status)}
              </div>
              <p className="text-xs text-slate-300 mt-1 font-medium">
                {employee.designation || 'Staff'} • {employee.department || 'General Department'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                onClose();
                onEditEmployee(employee);
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-colors cursor-pointer"
            >
              Edit Employee
            </button>
            <button
              onClick={() => {
                onClose();
                onConfigureSalary(employee);
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors cursor-pointer"
            >
              Configure Salary
            </button>
          </div>
        </div>

        {/* 2. TOP METRIC HIGHLIGHTS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Current Monthly Salary
            </span>
            <span className="text-base font-black text-slate-900 dark:text-white mt-1 block">
              {currentSalary > 0 ? formatInr(currentSalary) : <span className="text-amber-500 text-xs italic font-normal">Not configured</span>}
            </span>
            <span className="text-[10px] text-slate-500">
              {summary?.effectiveFrom && summary.effectiveFrom !== '—' ? `From ${summary.effectiveFrom}` : 'Active'}
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Current Month Status
            </span>
            <span className="mt-1 block">
              {summary?.currentMonthStatus === 'PAID' ? (
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> PAID
                </span>
              ) : summary?.currentMonthStatus === 'DUE' ? (
                <span className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> PENDING / DUE
                </span>
              ) : (
                <span className="text-xs font-medium text-slate-400 italic">No structure</span>
              )}
            </span>
            <span className="text-[10px] text-slate-500">Current calendar cycle</span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Total Paid (This Year)
            </span>
            <span className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
              {formatInr(summary?.totalPaidThisYear || 0)}
            </span>
            <span className="text-[10px] text-slate-500">
              {payments.filter((p) => p.status === 'PAID').length} payment(s) recorded
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Last Disbursement
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white mt-1 block">
              {summary?.lastSalary > 0 ? formatInr(summary.lastSalary) : '—'}
            </span>
            <span className="text-[10px] text-slate-500">{summary?.lastPaymentDate || 'No past payments'}</span>
          </div>
        </div>

        {/* 3. SUB-TABS */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 transition-all cursor-pointer border-b-2 ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Personal & Employment Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('salary')}
            className={`pb-2.5 transition-all cursor-pointer border-b-2 ${
              activeTab === 'salary'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Compensation & Structure History ({structureHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`pb-2.5 transition-all cursor-pointer border-b-2 ${
              activeTab === 'payments'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Payment & Payslip History ({payments.length})
          </button>
        </div>

        {/* TAB CONTENT: 1. OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Personal Information */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-200 dark:border-slate-700/60">
                <User className="w-4 h-4 text-blue-600" />
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Personal Information
                </h4>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Full Name</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{employee.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Employee ID</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{employee.employeeId}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Phone</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {employee.phone ? `+91 ${employee.phone.replace('+91', '').trim()}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Email</span>
                  <span className="font-medium text-slate-900 dark:text-white">{employee.email || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Date of Birth</span>
                  <span className="font-medium text-slate-900 dark:text-white">{employee.dateOfBirth || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Gender</span>
                  <span className="font-medium text-slate-900 dark:text-white">{employee.gender || '—'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Address</span>
                  <span className="font-medium text-slate-900 dark:text-white text-right max-w-xs">{employee.address || '—'}</span>
                </div>
              </div>
            </div>

            {/* Employment Information */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-slate-200 dark:border-slate-700/60">
                <Briefcase className="w-4 h-4 text-blue-600" />
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Employment Details
                </h4>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Department</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{employee.department || 'General'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Designation / Role</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{employee.designation || 'Staff'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Joining Date</span>
                  <span className="font-medium text-slate-900 dark:text-white">{employee.joiningDate || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Employment Type</span>
                  <span className="font-medium text-slate-900 dark:text-white">{employee.employmentType || 'Full Time'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Current Status</span>
                  <span>{getStatusBadge(employee.status)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Profile Created</span>
                  <span className="font-medium text-slate-500">
                    {employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: 2. SALARY STRUCTURES & REVISIONS */}
        {activeTab === 'salary' && (
          <div className="space-y-4">
            {structureHistory.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <DollarSign className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  No Salary Structure Configured
                </p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Configure base salary, HRA, allowances, and bank accounts for this employee to enable automated payroll processing.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    onConfigureSalary(employee);
                  }}
                  className="mt-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm cursor-pointer"
                >
                  Configure Salary Now
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Salary Structures & Revision Versions
                  </span>
                  <button
                    onClick={() => {
                      onClose();
                      onConfigureSalary(employee);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer shadow-xs"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Revise Salary</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {structureHistory.map((s, idx) => {
                    const gross = s.baseSalary + s.hraAllowance + s.otherAllowances;
                    const net = Math.max(0, gross - s.standardDeductions);
                    const isActive = s.isCurrent !== false;

                    return (
                      <div
                        key={s.id || idx}
                        className={`p-4 rounded-2xl border transition-all ${
                          isActive
                            ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/60 shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-80'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5 mb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                              Version {s.version || structureHistory.length - idx}
                            </span>
                            {isActive ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                ACTIVE STRUCTURE
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                HISTORICAL ARCHIVE
                              </span>
                            )}
                          </div>

                          <div className="text-right text-[11px] text-slate-500 font-medium">
                            Effective: <strong className="text-slate-800 dark:text-slate-200">{s.effectiveFrom || '—'}</strong>
                            {s.effectiveTo && <span> to <strong className="text-slate-800 dark:text-slate-200">{s.effectiveTo}</strong></span>}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Base Salary</span>
                            <span className="font-bold text-slate-900 dark:text-white">{formatInr(s.baseSalary)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Allowances</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {formatInr(s.hraAllowance + s.otherAllowances)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Deductions</span>
                            <span className="font-medium text-rose-600">
                              {s.standardDeductions > 0 ? `-${formatInr(s.standardDeductions)}` : '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Net Disbursable</span>
                            <span className="font-black text-emerald-600 dark:text-emerald-400">
                              {formatInr(net)} / {s.salaryFrequency || 'Monthly'}
                            </span>
                          </div>
                        </div>

                        {(s.bankAccountNo || s.upiId) && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                            <span>Payment Method: <strong>{s.paymentMode}</strong></span>
                            <span>
                              {s.upiId ? (
                                <span className="font-mono text-blue-600">{s.upiId}</span>
                              ) : (
                                <span>{s.bankName || 'Bank'}: ••••{s.bankAccountNo?.slice(-4)}</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: 3. PAYMENTS & PAYSLIP HISTORY */}
        {activeTab === 'payments' && (
          <div className="space-y-3">
            {payments.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  No Past Salary Payments Recorded
                </p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Disbursed salary payments for this employee will appear here with full payslips and financial posting links.
                </p>
                {onRecordPaymentForEmp && (
                  <button
                    onClick={() => {
                      onClose();
                      onRecordPaymentForEmp(employee);
                    }}
                    className="mt-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm cursor-pointer"
                  >
                    + Record Salary Payment
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Period</th>
                      <th className="p-3 text-right">Gross</th>
                      <th className="p-3 text-right">Deductions</th>
                      <th className="p-3 text-right">Net Paid</th>
                      <th className="p-3">Payment Date</th>
                      <th className="p-3">Mode</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Ref No</th>
                      <th className="p-3 text-center">Payslip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-3 font-semibold text-slate-900 dark:text-white">
                          {p.salaryPeriodLabel}
                        </td>
                        <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-300">
                          {formatInr(p.grossAmount)}
                        </td>
                        <td className="p-3 text-right font-medium text-rose-600">
                          {p.deductionAmount > 0 ? `-${formatInr(p.deductionAmount)}` : '—'}
                        </td>
                        <td className="p-3 text-right font-black text-slate-900 dark:text-white">
                          {formatInr(p.netAmount)}
                        </td>
                        <td className="p-3 text-slate-500">{p.paymentDate}</td>
                        <td className="p-3 text-slate-600">{p.paymentMode}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-[10px] text-slate-500">{p.referenceNo}</td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => onViewPayslip(p)}
                            className="p-1 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
                            title="View / Download Payslip PDF"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* FOOTER */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close Profile
          </button>
        </div>
      </div>
    </Modal>
  );
};
