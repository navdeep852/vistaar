// VISTAAR Business OS — Employee Salary & Payroll Types

export type SalaryFrequency = 'Monthly' | 'Weekly' | 'Daily' | 'Other';

export type SalaryStatus = 'DRAFT' | 'PENDING' | 'PAID' | 'CANCELLED';

export type SalaryTransactionType = 'REGULAR' | 'ADVANCE' | 'BONUS' | 'ADJUSTMENT' | 'ARREARS';

export type SalaryItemType = 'EARNING' | 'DEDUCTION';

export interface SalaryStructure {
  id: string;
  workspaceId: string;
  employeeId: string;
  salaryFrequency: SalaryFrequency;
  baseSalary: number;
  hraAllowance: number;
  otherAllowances: number;
  standardDeductions: number;
  paymentMode: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  upiId?: string;
  notes?: string;
  effectiveFrom?: string; // YYYY-MM-DD
  effectiveTo?: string;   // YYYY-MM-DD
  isCurrent?: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SalaryPaymentItem {
  id?: string;
  salaryPaymentId?: string;
  itemType: SalaryItemType;
  itemName: string;
  amount: number;
  notes?: string;
  createdAt?: string;
}

export interface SalaryPayment {
  id: string;
  workspaceId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  department?: string;
  designation?: string;
  salaryPeriodStart: string; // YYYY-MM-DD
  salaryPeriodEnd: string;   // YYYY-MM-DD
  salaryPeriodLabel: string; // e.g. "September 2026"
  paymentDate: string;       // YYYY-MM-DD
  grossAmount: number;
  deductionAmount: number;
  additionAmount: number;
  netAmount: number;
  paymentMode: string;
  referenceNo: string;
  status: SalaryStatus;
  transactionType: SalaryTransactionType;
  notes?: string;
  expenseId?: string;
  createdBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  items?: SalaryPaymentItem[];
}

export interface PayrollSummaryMetrics {
  totalPayrollThisMonth: number;
  salaryPaid: number;
  salaryPending: number;
  employeesPaidCount: number;
  totalEmployees: number;
  activeEmployees: number;
  totalGross: number;
  totalDeductions: number;
  monthLabel: string;
}

export interface SalaryFilterOptions {
  month?: string; // '01'..'12' or 'ALL'
  year?: string;  // '2026' or 'ALL'
  employeeId?: string;
  department?: string;
  status?: string;
  paymentMode?: string;
  search?: string;
}

export interface SalaryConsistencyAuditResult {
  paymentId: string;
  referenceNo: string;
  employeeName: string;
  periodLabel: string;
  paymentDate: string;
  netAmount: number;
  status: SalaryStatus;
  expenseFound: boolean;
  expenseAmountMatch: boolean;
  daybookFound: boolean;
  daybookAmountMatch: boolean;
  cashbookFound: boolean;
  cashbookAmountMatch: boolean;
  isFullyReconciled: boolean;
  issues: string[];
}

export interface PayrollAuditSummary {
  timestamp: string;
  totalPaymentsChecked: number;
  reconciledCount: number;
  mismatchesFound: number;
  results: SalaryConsistencyAuditResult[];
  overallStatus: 'PASS' | 'WARNING' | 'FAIL';
  summaryText: string;
}
