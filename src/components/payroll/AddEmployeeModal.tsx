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
  Plus,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Building,
} from 'lucide-react';
import { Modal } from '../Modal';
import { supabaseAuthService } from '../../services/supabaseAuth';
import { UserAccount, EmployeeStatus, EmploymentType } from '../../types';
import { showToast } from '../Toast';
import { formatInr } from '../../services/payrollExportService';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmployeeCreated: (emp: UserAccount, options?: { openSalaryConfig?: boolean; openProfile?: boolean }) => void;
  existingEmployees: UserAccount[];
}

const DEPARTMENT_PRESETS = [
  'Sales',
  'Accounts',
  'Operations',
  'HR',
  'Management',
  'IT',
  'Marketing',
  'Production',
  'Customer Support',
  'Logistics',
];

const EMPLOYMENT_TYPES: EmploymentType[] = [
  'Full Time',
  'Part Time',
  'Contract',
  'Temporary',
  'Intern',
  'Other',
];

const EMPLOYMENT_STATUSES: EmployeeStatus[] = [
  'Active',
  'On Leave',
  'Inactive',
  'Resigned',
  'Terminated',
];

export const AddEmployeeModal: React.FC<AddEmployeeModalProps> = ({
  isOpen,
  onClose,
  onEmployeeCreated,
  existingEmployees,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // Form Fields - Personal & Identification
  const [name, setName] = useState<string>('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [isCustomId, setIsCustomId] = useState<boolean>(false);
  const [dob, setDob] = useState<string>('');
  const [gender, setGender] = useState<string>('');

  // Contact Info
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');

  // Employment Info
  const [department, setDepartment] = useState<string>('Sales');
  const [customDepartment, setCustomDepartment] = useState<string>('');
  const [designation, setDesignation] = useState<string>('');
  const [joiningDate, setJoiningDate] = useState<string>(todayStr);
  const [employmentType, setEmploymentType] = useState<EmploymentType>('Full Time');
  const [status, setStatus] = useState<EmployeeStatus>('Active');

  // Optional Salary Setup
  const [configureSalaryNow, setConfigureSalaryNow] = useState<boolean>(false);
  const [salaryFrequency, setSalaryFrequency] = useState<'Monthly' | 'Weekly' | 'Daily'>('Monthly');
  const [baseSalary, setBaseSalary] = useState<string>('');
  const [hraAllowance, setHraAllowance] = useState<string>('0');
  const [otherAllowances, setOtherAllowances] = useState<string>('0');
  const [standardDeductions, setStandardDeductions] = useState<string>('0');
  const [paymentMode, setPaymentMode] = useState<string>('Bank Transfer');
  const [bankName, setBankName] = useState<string>('');
  const [bankAccountNo, setBankAccountNo] = useState<string>('');
  const [bankIfsc, setBankIfsc] = useState<string>('');
  const [upiId, setUpiId] = useState<string>('');
  const [salaryEffectiveDate, setSalaryEffectiveDate] = useState<string>(todayStr);

  // Flow & State
  const [saving, setSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [createdEmpData, setCreatedEmpData] = useState<{ emp: UserAccount; salaryConfigured: boolean } | null>(null);

  // Initialize sequential Employee ID when opening
  useEffect(() => {
    if (isOpen && !createdEmpData) {
      setValidationError(null);
      supabaseAuthService.generateNextEmployeeId().then((generatedId) => {
        if (!isCustomId) {
          setEmployeeId(generatedId);
        }
      });
    }
  }, [isOpen, createdEmpData, isCustomId]);

  // Reset form
  const resetForm = async () => {
    setName('');
    setDob('');
    setGender('');
    setPhone('');
    setEmail('');
    setAddress('');
    setDepartment('Sales');
    setCustomDepartment('');
    setDesignation('');
    setJoiningDate(todayStr);
    setEmploymentType('Full Time');
    setStatus('Active');
    setConfigureSalaryNow(false);
    setBaseSalary('');
    setHraAllowance('0');
    setOtherAllowances('0');
    setStandardDeductions('0');
    setPaymentMode('Bank Transfer');
    setBankName('');
    setBankAccountNo('');
    setBankIfsc('');
    setUpiId('');
    setSalaryEffectiveDate(todayStr);
    setValidationError(null);
    setCreatedEmpData(null);
    setIsCustomId(false);

    const nextId = await supabaseAuthService.generateNextEmployeeId();
    setEmployeeId(nextId);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Indian Phone Validation Helper
  const validatePhone = (val: string): { isValid: boolean; normalized: string; error?: string } => {
    if (!val || !val.trim()) return { isValid: true, normalized: '' };
    const cleaned = val.replace(/\D/g, '');
    let normalized = cleaned;
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      normalized = cleaned.slice(2);
    } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
      normalized = cleaned.slice(1);
    }
    if (normalized.length !== 10) {
      return {
        isValid: false,
        normalized,
        error: 'Phone number must contain exactly 10 digits after +91.',
      };
    }
    return { isValid: true, normalized };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // 1. Name Check
    if (!name.trim()) {
      setValidationError('Employee Full Name is required.');
      return;
    }

    // 2. Employee ID Check
    const cleanId = employeeId.trim();
    if (!cleanId) {
      setValidationError('Employee ID is required.');
      return;
    }
    const dupId = existingEmployees.some(
      (emp) => (emp.employeeId || '').toUpperCase() === cleanId.toUpperCase()
    );
    if (dupId) {
      setValidationError(`An employee with Employee ID "${cleanId}" already exists.`);
      return;
    }

    // 3. Phone Validation
    let cleanPhone = '';
    if (phone.trim()) {
      const pRes = validatePhone(phone);
      if (!pRes.isValid) {
        setValidationError(pRes.error || 'Please enter a valid 10-digit phone number.');
        return;
      }
      cleanPhone = pRes.normalized;
    }

    // 4. Email Validation if provided
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        setValidationError('Please enter a valid email address.');
        return;
      }
      const dupEmail = existingEmployees.some(
        (emp) => (emp.email || '').toLowerCase() === cleanEmail
      );
      if (dupEmail) {
        setValidationError('An employee account with this email address already exists.');
        return;
      }
    }

    // 5. Final Department Resolution
    const resolvedDept = department === 'Other' ? customDepartment.trim() || 'Other' : department;

    // 6. Optional Salary Validation
    let salarySetupPayload: any = undefined;
    if (configureSalaryNow) {
      const baseNum = Number(baseSalary) || 0;
      if (baseNum <= 0) {
        setValidationError('Please enter a base salary amount greater than zero.');
        return;
      }
      salarySetupPayload = {
        salaryFrequency,
        baseSalary: baseNum,
        hraAllowance: Number(hraAllowance) || 0,
        otherAllowances: Number(otherAllowances) || 0,
        standardDeductions: Number(standardDeductions) || 0,
        paymentMode,
        bankName: bankName.trim() || undefined,
        bankAccountNo: bankAccountNo.trim() || undefined,
        bankIfsc: bankIfsc.trim().toUpperCase() || undefined,
        upiId: upiId.trim() || undefined,
        effectiveFrom: salaryEffectiveDate || joiningDate,
      };
    }

    setSaving(true);
    try {
      const res = await supabaseAuthService.createEmployee({
        name: name.trim(),
        employeeId: cleanId,
        phone: cleanPhone,
        email: cleanEmail,
        department: resolvedDept,
        designation: designation.trim() || 'Staff',
        joiningDate,
        employmentType,
        status,
        dateOfBirth: dob || undefined,
        gender: gender || undefined,
        address: address.trim() || undefined,
        salarySetup: salarySetupPayload,
      });

      if (res.success && res.empId) {
        const newEmpObj: UserAccount = {
          id: res.userId || cleanId,
          companyId: supabaseAuthService.getCurrentCompanyId() || 'default_ws',
          employeeId: res.empId,
          name: name.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          department: resolvedDept,
          designation: designation.trim() || 'Staff',
          role: 'employee',
          status,
          joiningDate,
          employmentType,
          dateOfBirth: dob || undefined,
          gender: gender || undefined,
          address: address.trim() || undefined,
          isArchived: false,
          passwordHash: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setCreatedEmpData({
          emp: newEmpObj,
          salaryConfigured: Boolean(configureSalaryNow),
        });
        showToast(`Employee ${res.empId} (${name.trim()}) added successfully!`, 'success');
      } else {
        setValidationError(res.error || 'Failed to create employee record.');
      }
    } catch (err: any) {
      setValidationError(err.message || 'An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  // Net Pay calculation for inline preview
  const calculatedNet = Math.max(
    0,
    (Number(baseSalary) || 0) + (Number(hraAllowance) || 0) + (Number(otherAllowances) || 0) - (Number(standardDeductions) || 0)
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={createdEmpData ? 'Employee Created' : 'Add Employee to Master'}
      maxWidth="2xl"
    >
      {/* SUCCESS SCREEN */}
      {createdEmpData ? (
        <div className="py-4 space-y-6 text-center">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Employee Created Successfully!
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              <strong>{createdEmpData.emp.name}</strong> ({createdEmpData.emp.employeeId}) has been added to Employee Master as{' '}
              <span className="font-semibold text-emerald-600">{createdEmpData.emp.status}</span>.
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md mx-auto text-left space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Employee ID:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{createdEmpData.emp.employeeId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Department & Role:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {createdEmpData.emp.department || 'General'} • {createdEmpData.emp.designation || 'Staff'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Salary Status:</span>
              <span className="font-bold">
                {createdEmpData.salaryConfigured ? (
                  <span className="text-emerald-600">Configured ({formatInr(calculatedNet)} / {salaryFrequency})</span>
                ) : (
                  <span className="text-amber-500">Not configured yet</span>
                )}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700 italic">
              Notice: Creating an employee or salary structure creates no financial postings. Postings occur only upon salary disbursement.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {!createdEmpData.salaryConfigured && (
              <button
                type="button"
                onClick={() => {
                  const emp = createdEmpData.emp;
                  handleClose();
                  onEmployeeCreated(emp, { openSalaryConfig: true });
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors cursor-pointer"
              >
                Configure Salary
              </button>
            )}

            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              + Add Another Employee
            </button>

            <button
              type="button"
              onClick={() => {
                const emp = createdEmpData.emp;
                handleClose();
                onEmployeeCreated(emp, { openProfile: true });
              }}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
            >
              View Employee Profile
            </button>
          </div>
        </div>
      ) : (
        /* MAIN EMPLOYEE FORM */
        <form onSubmit={handleSubmit} className="space-y-5">
          {validationError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {/* SECTION 1: EMPLOYEE INFORMATION */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1.5">
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Employee Information
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Full Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Employee ID */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Employee ID *
                  </label>
                  <span className="text-[10px] text-slate-400">Workspace unique</span>
                </div>
                <input
                  type="text"
                  value={employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    setIsCustomId(true);
                  }}
                  placeholder="VST-EMP-001"
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: CONTACT INFORMATION */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1.5">
              <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Contact Information
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Phone (India +91) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Phone (India 10-digit)
                </label>
                <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700/60 border-r border-slate-200 dark:border-slate-800 select-none">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9820011223"
                    className="w-full px-3 py-2 text-xs font-medium bg-transparent text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Email Address <span className="text-[10px] text-slate-400 normal-case">(optional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rahul@company.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Address */}
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Address <span className="text-[10px] text-slate-400 normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Flat/House No., Street, City, State, Pincode"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: EMPLOYMENT INFORMATION */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1.5">
              <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Employment Information
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {/* Department */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {DEPARTMENT_PRESETS.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                  <option value="Other">Custom Department...</option>
                </select>
                {department === 'Other' && (
                  <input
                    type="text"
                    value={customDepartment}
                    onChange={(e) => setCustomDepartment(e.target.value)}
                    placeholder="Enter department name"
                    className="w-full mt-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                    required
                  />
                )}
              </div>

              {/* Designation */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Designation / Role
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. Sales Executive"
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Joining Date */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Joining Date
                </label>
                <input
                  type="date"
                  value={joiningDate}
                  onChange={(e) => setJoiningDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Employment Type */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Employment Type
                </label>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EMPLOYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Employment Status */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Employment Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EMPLOYMENT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date of Birth & Gender (Optional) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
                  Date of Birth <span className="text-[10px] text-slate-400 normal-case">(optional)</span>
                </label>
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: OPTIONAL SALARY SETUP */}
          <div className="pt-2">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Salary Setup
                  </span>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={configureSalaryNow}
                    onChange={(e) => setConfigureSalaryNow(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    Configure Salary Now
                  </span>
                </label>
              </div>

              {configureSalaryNow ? (
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700/60 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Salary Frequency */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Frequency
                      </label>
                      <select
                        value={salaryFrequency}
                        onChange={(e) => setSalaryFrequency(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                      >
                        <option value="Monthly">Monthly</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Daily">Daily</option>
                      </select>
                    </div>

                    {/* Base Salary */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Base Salary (₹) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={baseSalary}
                        onChange={(e) => setBaseSalary(e.target.value)}
                        placeholder="30000"
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                        required={configureSalaryNow}
                      />
                    </div>

                    {/* Effective Date */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Effective From
                      </label>
                      <input
                        type="date"
                        value={salaryEffectiveDate}
                        onChange={(e) => setSalaryEffectiveDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                      />
                    </div>

                    {/* HRA Allowance */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        HRA Allowance (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={hraAllowance}
                        onChange={(e) => setHraAllowance(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                      />
                    </div>

                    {/* Other Allowances */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Other Allowances (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={otherAllowances}
                        onChange={(e) => setOtherAllowances(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                      />
                    </div>

                    {/* Standard Deductions */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        Standard Deductions (-₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={standardDeductions}
                        onChange={(e) => setStandardDeductions(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-rose-600 outline-none"
                      />
                    </div>

                    {/* Payment Mode */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Disbursement Mode
                      </label>
                      <select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                      >
                        <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                        <option value="UPI">UPI</option>
                        <option value="Cash">Cash</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </div>

                    {/* Bank / UPI Identifier */}
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        {paymentMode === 'UPI' ? 'UPI ID' : 'Bank Account / IFSC'}
                      </label>
                      {paymentMode === 'UPI' ? (
                        <input
                          type="text"
                          value={upiId}
                          onChange={(e) => setUpiId(e.target.value)}
                          placeholder="employee@okhdfcbank"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                        />
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={bankAccountNo}
                            onChange={(e) => setBankAccountNo(e.target.value)}
                            placeholder="Account Number"
                            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                          />
                          <input
                            type="text"
                            value={bankIfsc}
                            onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                            placeholder="IFSC Code"
                            className="w-full px-3 py-2 text-xs font-mono uppercase rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Calculated Net Preview */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-600 dark:text-slate-400">Net Estimated Monthly Compensation:</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                      {formatInr(calculatedNet)}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-400 italic">
                    Note: Saving this salary structure does NOT record an expense or Daybook/Cashbook outflow. Postings occur strictly when you Record Salary Payment.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  You can configure compensation structures right now or later at any time from Salary Structures.
                </p>
              )}
            </div>
          </div>

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{saving ? 'Creating Employee...' : 'Create Employee'}</span>
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};
