import React, { useState, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal } from '../Modal';
import { UserAccount, EmploymentType, EmployeeStatus } from '../../types';
import { supabaseAuthService } from '../../services/supabaseAuth';
import { showToast } from '../Toast';
import {
  downloadEmployeeImportTemplate,
  downloadEmployeeErrorReport,
  formatInr,
} from '../../services/payrollExportService';

interface BulkImportEmployeesModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingEmployees: UserAccount[];
  onImportComplete: () => void;
}

interface ParsedEmployeeRow {
  rowNum: number;
  employeeId: string;
  name: string;
  phone: string;
  email: string;
  department: string;
  designation: string;
  joiningDate: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  baseSalary?: number;
  statusType: 'valid' | 'warning' | 'error';
  issues: string[];
}

export const BulkImportEmployeesModal: React.FC<BulkImportEmployeesModalProps> = ({
  isOpen,
  onClose,
  existingEmployees,
  onImportComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedEmployeeRow[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'error'>('all');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  const resetState = () => {
    setStep('upload');
    setFileName('');
    setParsedRows([]);
    setFilterTab('all');
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Normalizes header keys from Excel
  const getVal = (row: any, ...keys: string[]): string => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null) {
        return String(row[k]).trim();
      }
      // Case insensitive match
      const foundKey = Object.keys(row).find(
        (rk) => rk.toLowerCase().replace(/[^a-z0-9]/g, '') === k.toLowerCase().replace(/[^a-z0-9]/g, '')
      );
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
        return String(row[foundKey]).trim();
      }
    }
    return '';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (rawJson.length === 0) {
        showToast('The uploaded sheet is empty or contains no records.', 'error');
        return;
      }

      // Existing lookup sets
      const existingEmpIdSet = new Set(
        existingEmployees.map((emp) => (emp.employeeId || '').toUpperCase())
      );
      const existingEmailSet = new Set(
        existingEmployees.map((emp) => (emp.email || '').toLowerCase()).filter(Boolean)
      );

      // Track duplicate IDs within the file itself
      const fileEmpIdCount = new Map<string, number>();
      rawJson.forEach((row) => {
        const id = getVal(row, 'Employee ID', 'Emp ID', 'ID', 'employee_id').toUpperCase();
        if (id) fileEmpIdCount.set(id, (fileEmpIdCount.get(id) || 0) + 1);
      });

      const evaluated: ParsedEmployeeRow[] = [];

      for (let i = 0; i < rawJson.length; i++) {
        const r = rawJson[i];
        const rowNum = i + 2; // Accounting for Excel 1-indexed + header row
        const name = getVal(r, 'Full Name', 'Name', 'Employee Name', 'employee_name');
        let empId = getVal(r, 'Employee ID', 'Emp ID', 'ID', 'employee_id');
        const phone = getVal(r, 'Phone', 'Mobile', 'Contact', 'phone');
        const email = getVal(r, 'Email', 'Email Address', 'email');
        const department = getVal(r, 'Department', 'Dept', 'department') || 'General';
        const designation = getVal(r, 'Designation', 'Role', 'Title', 'designation') || 'Staff';
        const joiningDate = getVal(r, 'Joining Date', 'Join Date', 'joining_date') || new Date().toISOString().split('T')[0];
        const typeRaw = getVal(r, 'Employment Type', 'Type', 'employment_type');
        const statusRaw = getVal(r, 'Employment Status', 'Status', 'status');
        const salaryRaw = getVal(r, 'Base Salary', 'Salary', 'Monthly Salary', 'base_salary');

        const issues: string[] = [];
        let statusType: 'valid' | 'warning' | 'error' = 'valid';

        // 1. Name Check
        if (!name) {
          issues.push('Missing required Full Name');
          statusType = 'error';
        }

        // 2. Employee ID Check
        if (!empId) {
          issues.push('Missing Employee ID (auto-generated ID will be assigned if left blank)');
          if (statusType !== 'error') statusType = 'warning';
        } else {
          const upperId = empId.toUpperCase();
          if (existingEmpIdSet.has(upperId)) {
            issues.push(`Employee ID "${empId}" already exists in workspace.`);
            statusType = 'error';
          } else if ((fileEmpIdCount.get(upperId) || 0) > 1) {
            issues.push(`Employee ID "${empId}" is duplicated multiple times in this file.`);
            statusType = 'error';
          }
        }

        // 3. Email Check
        if (email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            issues.push(`Invalid email format "${email}".`);
            statusType = 'error';
          } else if (existingEmailSet.has(email.toLowerCase())) {
            issues.push(`Email "${email}" is already registered to another employee.`);
            statusType = 'error';
          }
        }

        // 4. Phone Check (Indian 10-digit)
        let cleanPhone = '';
        if (phone) {
          const digits = phone.replace(/\D/g, '');
          const norm = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
          if (norm.length !== 10) {
            issues.push(`Phone number "${phone}" must be 10 digits.`);
            if (statusType !== 'error') statusType = 'warning';
          } else {
            cleanPhone = norm;
          }
        }

        // Normalize Employment Type
        let employmentType: EmploymentType = 'Full Time';
        if (typeRaw) {
          const matchType = (['Full Time', 'Part Time', 'Contract', 'Temporary', 'Intern', 'Other'] as EmploymentType[]).find(
            (t) => t.toLowerCase() === typeRaw.toLowerCase()
          );
          if (matchType) employmentType = matchType;
        }

        // Normalize Employment Status
        let status: EmployeeStatus = 'Active';
        if (statusRaw) {
          const matchSt = (['Active', 'On Leave', 'Inactive', 'Resigned', 'Terminated'] as EmployeeStatus[]).find(
            (st) => st.toLowerCase() === statusRaw.toLowerCase()
          );
          if (matchSt) status = matchSt;
        }

        const baseSalary = salaryRaw ? Math.max(0, parseFloat(salaryRaw) || 0) : undefined;

        evaluated.push({
          rowNum,
          employeeId: empId,
          name,
          phone: cleanPhone || phone,
          email,
          department,
          designation,
          joiningDate,
          employmentType,
          status,
          baseSalary,
          statusType,
          issues,
        });
      }

      setParsedRows(evaluated);
      setStep('preview');
    } catch (err: any) {
      console.error('Error parsing spreadsheet:', err);
      showToast('Failed to parse file. Please verify it is a valid Excel or CSV document.', 'error');
    }
  };

  const validRows = parsedRows.filter((r) => r.statusType !== 'error');
  const errorRows = parsedRows.filter((r) => r.statusType === 'error');
  const warningRows = parsedRows.filter((r) => r.statusType === 'warning');

  const filteredDisplayRows = parsedRows.filter((r) => {
    if (filterTab === 'valid') return r.statusType !== 'error';
    if (filterTab === 'error') return r.statusType === 'error';
    return true;
  });

  const handleDownloadErrorReport = () => {
    const errorItems = errorRows.map((r) => ({
      row: r.rowNum,
      employeeId: r.employeeId,
      name: r.name,
      error: r.issues.join(' | '),
      data: {
        phone: r.phone,
        email: r.email,
        department: r.department,
        designation: r.designation,
      },
    }));
    downloadEmployeeErrorReport(errorItems);
  };

  const handleCommitImport = async () => {
    if (validRows.length === 0) {
      showToast('No valid employee rows to import.', 'error');
      return;
    }

    setIsImporting(true);
    let importedCount = 0;

    try {
      for (const row of validRows) {
        const res = await supabaseAuthService.createEmployee({
          name: row.name,
          employeeId: row.employeeId || undefined,
          phone: row.phone,
          email: row.email,
          department: row.department,
          designation: row.designation,
          joiningDate: row.joiningDate,
          employmentType: row.employmentType,
          status: row.status,
          salarySetup: row.baseSalary && row.baseSalary > 0 ? {
            salaryFrequency: 'Monthly',
            baseSalary: row.baseSalary,
            effectiveFrom: row.joiningDate,
          } : undefined,
        });

        if (res.success) {
          importedCount++;
        }
      }

      showToast(`Successfully imported ${importedCount} employees into Master!`, 'success');
      onImportComplete();
      handleClose();
    } catch (err: any) {
      showToast(err.message || 'Error occurred while saving imported employees.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 'upload' ? 'Bulk Import Employees' : 'Import Preview & Verification'}
      maxWidth="3xl"
    >
      {step === 'upload' ? (
        /* STEP 1: UPLOAD & TEMPLATE */
        <div className="space-y-6 py-2">
          {/* Action to Download Template */}
          <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-900/60 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Need a pre-formatted Excel template?
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Download our ready-to-use template with correct columns and example records.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadEmployeeImportTemplate}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Template</span>
            </button>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-3xl p-8 sm:p-12 text-center cursor-pointer transition-all bg-slate-50/50 dark:bg-slate-800/30 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-14 h-14 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-4">
              Select or Drop Excel / CSV file
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Supports .xlsx, .xls, or .csv formats. Your rows will be verified and previewed before any changes are committed.
            </p>
            <span className="inline-block mt-4 px-3 py-1 rounded-full text-[10px] font-bold text-slate-500 bg-slate-200/60 dark:bg-slate-700">
              Columns: Employee ID • Full Name • Phone • Email • Department • Designation • Status
            </span>
          </div>
        </div>
      ) : (
        /* STEP 2: PREVIEW & VERIFICATION */
        <div className="space-y-4">
          {/* Summary Metric Ribbon */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Found in File</span>
              <span className="text-lg font-black text-slate-900 dark:text-white block mt-0.5">
                {parsedRows.length}
              </span>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Valid Rows</span>
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 block mt-0.5">
                {validRows.length}
              </span>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60">
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Warnings</span>
              <span className="text-lg font-black text-amber-600 dark:text-amber-400 block mt-0.5">
                {warningRows.length}
              </span>
            </div>
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60">
              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">Errors</span>
              <span className="text-lg font-black text-rose-600 dark:text-rose-400 block mt-0.5">
                {errorRows.length}
              </span>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                    : 'text-slate-500'
                }`}
              >
                All ({parsedRows.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('valid')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterTab === 'valid'
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                Valid ({validRows.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('error')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  filterTab === 'error'
                    ? 'bg-rose-600 text-white shadow-xs font-bold'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                Errors ({errorRows.length})
              </button>
            </div>

            <div className="flex items-center gap-2">
              {errorRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadErrorReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Error Report</span>
                </button>
              )}
              <button
                type="button"
                onClick={resetState}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Upload Another</span>
              </button>
            </div>
          </div>

          {/* PREVIEW TABLE */}
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2.5">Row</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5">Emp ID</th>
                  <th className="p-2.5">Full Name</th>
                  <th className="p-2.5">Department</th>
                  <th className="p-2.5">Designation</th>
                  <th className="p-2.5">Salary</th>
                  <th className="p-2.5">Validation Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDisplayRows.map((r) => (
                  <tr
                    key={r.rowNum}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 ${
                      r.statusType === 'error' ? 'bg-rose-50/30 dark:bg-rose-950/20' : ''
                    }`}
                  >
                    <td className="p-2.5 font-mono text-[11px] text-slate-400">{r.rowNum}</td>
                    <td className="p-2.5 whitespace-nowrap">
                      {r.statusType === 'valid' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Valid
                        </span>
                      )}
                      {r.statusType === 'warning' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> Warning
                        </span>
                      )}
                      {r.statusType === 'error' && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" /> Error
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {r.employeeId || <span className="text-slate-400 italic">Auto</span>}
                    </td>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-white">{r.name}</td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-300">{r.department}</td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-300">{r.designation}</td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-200">
                      {r.baseSalary ? formatInr(r.baseSalary) : '—'}
                    </td>
                    <td className="p-2.5 text-[11px]">
                      {r.issues.length > 0 ? (
                        <span className={r.statusType === 'error' ? 'text-rose-600 font-medium' : 'text-amber-600'}>
                          {r.issues.join('; ')}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Ready to import</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500">
              File: <strong className="text-slate-800 dark:text-slate-200">{fileName}</strong>
            </span>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={isImporting || validRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{isImporting ? 'Importing...' : `Import ${validRows.length} Valid Employees`}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
