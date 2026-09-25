import React, { useState, useEffect } from 'react';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  AlertTriangle,
  Lock,
  Unlock,
  CheckCircle2,
} from 'lucide-react';
import { Modal } from '../Modal';
import { supabaseAuthService } from '../../services/supabaseAuth';
import { UserAccount, EmployeeStatus, EmploymentType } from '../../types';
import { showToast } from '../Toast';

interface EditEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: UserAccount | null;
  onEmployeeUpdated: () => void;
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

export const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({
  isOpen,
  onClose,
  employee,
  onEmployeeUpdated,
  existingEmployees,
}) => {
  const [name, setName] = useState<string>('');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [isIdUnlocked, setIsIdUnlocked] = useState<boolean>(false);
  const [phone, setPhone] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [department, setDepartment] = useState<string>('Sales');
  const [customDepartment, setCustomDepartment] = useState<string>('');
  const [designation, setDesignation] = useState<string>('');
  const [joiningDate, setJoiningDate] = useState<string>('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('Full Time');
  const [status, setStatus] = useState<EmployeeStatus>('Active');
  const [dob, setDob] = useState<string>('');
  const [gender, setGender] = useState<string>('');

  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (employee) {
      setName(employee.name || '');
      setEmployeeId(employee.employeeId || '');
      setIsIdUnlocked(false);
      setPhone(employee.phone ? employee.phone.replace('+91', '').trim() : '');
      setEmail(employee.email || '');
      setAddress(employee.address || '');

      const isPresetDept = DEPARTMENT_PRESETS.includes(employee.department || '');
      if (isPresetDept) {
        setDepartment(employee.department || 'Sales');
        setCustomDepartment('');
      } else if (employee.department) {
        setDepartment('Other');
        setCustomDepartment(employee.department);
      } else {
        setDepartment('Sales');
        setCustomDepartment('');
      }

      setDesignation(employee.designation || '');
      setJoiningDate(employee.joiningDate || (employee.createdAt ? employee.createdAt.split('T')[0] : ''));
      setEmploymentType(employee.employmentType || 'Full Time');
      setStatus(employee.status || 'Active');
      setDob(employee.dateOfBirth || '');
      setGender(employee.gender || '');
      setErrorMsg(null);
    }
  }, [employee, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Full Name is required.');
      return;
    }

    const cleanEmpId = employeeId.trim();
    if (!cleanEmpId) {
      setErrorMsg('Employee ID cannot be empty.');
      return;
    }

    // Check Employee ID uniqueness if changed
    if (cleanEmpId.toUpperCase() !== (employee.employeeId || '').toUpperCase()) {
      const isDup = existingEmployees.some(
        (e) => e.id !== employee.id && (e.employeeId || '').toUpperCase() === cleanEmpId.toUpperCase()
      );
      if (isDup) {
        setErrorMsg(`An employee with Employee ID "${cleanEmpId}" already exists.`);
        return;
      }
    }

    // Phone validation
    let cleanPhone = '';
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, '');
      const normalized = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
      if (normalized.length !== 10) {
        setErrorMsg('Phone number must contain exactly 10 digits.');
        return;
      }
      cleanPhone = normalized;
    }

    // Email validation
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        setErrorMsg('Please enter a valid email address.');
        return;
      }
      const isDupEmail = existingEmployees.some(
        (e) => e.id !== employee.id && (e.email || '').toLowerCase() === cleanEmail
      );
      if (isDupEmail) {
        setErrorMsg('Another employee already has this email address.');
        return;
      }
    }

    const resolvedDept = department === 'Other' ? customDepartment.trim() || 'Other' : department;

    setSaving(true);
    try {
      const res = await supabaseAuthService.updateEmployee(employee.id, {
        name: name.trim(),
        employeeId: cleanEmpId,
        phone: cleanPhone,
        email: cleanEmail,
        department: resolvedDept,
        designation: designation.trim() || 'Staff',
        joiningDate: joiningDate || undefined,
        employmentType,
        status,
        dateOfBirth: dob || undefined,
        gender: gender || undefined,
        address: address.trim() || undefined,
      });

      if (res.success) {
        showToast(`Employee ${cleanEmpId} updated successfully!`, 'success');
        onEmployeeUpdated();
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to update employee.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating employee details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Employee — ${employee?.name || ''}`}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Employee ID Locked / Protected Section */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isIdUnlocked ? (
                <Unlock className="w-4 h-4 text-amber-500" />
              ) : (
                <Lock className="w-4 h-4 text-slate-400" />
              )}
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Employee Identification
              </span>
            </div>
            {!isIdUnlocked ? (
              <button
                type="button"
                onClick={() => setIsIdUnlocked(true)}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Change ID
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsIdUnlocked(false);
                  if (employee) setEmployeeId(employee.employeeId);
                }}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Lock ID
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Employee ID
              </label>
              <input
                type="text"
                value={employeeId}
                disabled={!isIdUnlocked}
                onChange={(e) => setEmployeeId(e.target.value)}
                className={`w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border outline-none ${
                  isIdUnlocked
                    ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 focus:ring-2 focus:ring-amber-500'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-500 cursor-not-allowed'
                }`}
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                Full Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {isIdUnlocked && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 pt-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>Warning: Changing Employee ID should normally be avoided because it may affect past audit references. Ensure all records remain linked.</span>
            </p>
          )}
        </div>

        {/* Contact Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Phone Number
            </label>
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
              <span className="px-3 py-2 text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-700/60 border-r border-slate-200 dark:border-slate-800">
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

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="employee@company.com"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Residential / Work Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address line, city, state, pincode"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Employment & Role Information */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Department
            </label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
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
                placeholder="Enter custom department"
                className="w-full mt-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none"
                required
              />
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Designation
            </label>
            <input
              type="text"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Joining Date
            </label>
            <input
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Employment Type
            </label>
            <select
              value={employmentType}
              onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}
              className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Employment Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
              className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
            >
              {EMPLOYMENT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <span>{saving ? 'Saving Changes...' : 'Save Changes'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
