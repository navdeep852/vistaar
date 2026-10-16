import { InvoiceStatus, UdhariStatus } from '../types';

export const PAYMENT_TOLERANCE = 0.00;
export const FINANCIAL_EPSILON = 0.005;

export function roundTo2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export interface InvoiceFinancials {
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  status: InvoiceStatus;
}

export interface UdhariFinancials {
  originalAmount: number;
  totalReceived: number;
  outstandingAmount: number;
  status: UdhariStatus;
}

export interface DaybookFinancials {
  totalAmount: number;
  amount: number; // Inflow amount
  remainingAmount: number;
  paymentStatus: 'PAID' | 'PARTIALLY PAID' | 'UNPAID' | 'CANCELLED';
}

/**
 * Single Authoritative Financial Calculation Engine for VISTAAR Business OS.
 * Enforces fundamental accounting invariants (Master Prompt Settlement Policy):
 *   1. Outstanding = ₹0.00: Fully settled (Paid / PAID)
 *   2. Outstanding <= ₹0.00 due to rounding residual: Normalized to ₹0.00 (Paid / PAID)
 *   3. Outstanding between ₹0.01 and ₹0.99: Strictly outstanding & actively payable (Partially Paid)
 *   4. Outstanding >= ₹1.00: Strictly outstanding & actively payable
 *   5. Never allows negative outstanding balances to be stored or displayed
 *   6. Retains actual historical payment inflows without fabricating artificial write-off transactions
 */

/**
 * Calculates normalized invoice financial metrics with exact settlement policy.
 * Caps paidAmount between 0 and grandTotal.
 * If remaining <= 0.005 (₹0.00), remaining is normalized to 0.00 and status is Paid.
 * If remaining > 0.005 (e.g. ₹0.01, ₹0.10, ₹0.80), remaining is preserved and status is Partially Paid / Issued.
 */
export function calculateInvoiceFinancials(
  grandTotalInput?: number | null,
  paidAmountInput?: number | null,
  currentStatus?: InvoiceStatus
): InvoiceFinancials {
  const grandTotal = Math.max(0, roundTo2(Number(grandTotalInput) || 0));
  const rawPaid = Math.max(0, roundTo2(Number(paidAmountInput) || 0));
  const paidAmount = Math.min(grandTotal, rawPaid);
  const rawBalance = roundTo2(grandTotal - paidAmount);

  let balanceAmount = 0;
  if (rawBalance > FINANCIAL_EPSILON) {
    balanceAmount = rawBalance;
  } else {
    // 0.00 or negative calculation residual: normalize to 0.00
    balanceAmount = 0;
  }

  let status: InvoiceStatus = currentStatus || 'Issued';
  if (status !== 'Cancelled' && status !== 'Draft') {
    if (balanceAmount <= FINANCIAL_EPSILON && grandTotal > 0) {
      status = 'Paid';
    } else if (paidAmount > 0) {
      status = 'Partially Paid';
    } else {
      status = 'Issued';
    }
  }

  return {
    grandTotal,
    paidAmount,
    balanceAmount,
    status,
  };
}

/**
 * Calculates normalized Udhari ledger financials with exact settlement policy.
 * Enforces originalAmount = totalReceived + outstandingAmount.
 * Balances from ₹0.01 upwards remain strictly outstanding and payable.
 */
export function calculateUdhariFinancials(
  originalAmountInput?: number | null,
  totalReceivedInput?: number | null,
  dueDate?: string
): UdhariFinancials {
  const originalAmount = Math.max(0, roundTo2(Number(originalAmountInput) || 0));
  const rawReceived = Math.max(0, roundTo2(Number(totalReceivedInput) || 0));
  const totalReceived = Math.min(originalAmount, rawReceived);
  const rawOutstanding = roundTo2(originalAmount - totalReceived);

  let outstandingAmount = 0;
  if (rawOutstanding > FINANCIAL_EPSILON) {
    outstandingAmount = rawOutstanding;
  } else {
    // 0.00 or overpayment
    outstandingAmount = 0;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  let status: UdhariStatus = 'UNPAID';

  if (outstandingAmount <= FINANCIAL_EPSILON) {
    status = 'PAID';
  } else if (totalReceived > 0) {
    status = 'PARTIALLY PAID';
  } else if (dueDate && dueDate < todayStr) {
    status = 'OVERDUE';
  } else {
    status = 'UNPAID';
  }

  return {
    originalAmount,
    totalReceived,
    outstandingAmount,
    status,
  };
}

/**
 * Calculates normalized Daybook sale/payment financials from authoritative numbers.
 * 
 * Rules:
 * - totalAmount = invoice.grand_total (never payment.amount)
 * - amount = current transaction inflow (payment.amount)
 * - remainingAmount = max(0, totalAmount - cumulativePaid) with PAYMENT_TOLERANCE applied
 */
export function calculateDaybookFinancials(
  totalAmountInput?: number | null,
  inflowAmountInput?: number | null,
  cumulativePaidInput?: number | null
): DaybookFinancials {
  const totalAmount = Math.max(0, roundTo2(Number(totalAmountInput) || 0));
  const rawInflow = Math.max(0, roundTo2(Number(inflowAmountInput) || 0));
  const amount = Math.min(totalAmount, rawInflow);
  
  const effectiveCumulativePaid = cumulativePaidInput !== undefined && cumulativePaidInput !== null
    ? Math.max(0, roundTo2(Number(cumulativePaidInput) || 0))
    : amount;

  const rawRemaining = roundTo2(totalAmount - effectiveCumulativePaid);
  let remainingAmount = 0;
  if (rawRemaining > FINANCIAL_EPSILON) {
    remainingAmount = rawRemaining;
  } else {
    remainingAmount = 0;
  }

  let paymentStatus: 'PAID' | 'PARTIALLY PAID' | 'UNPAID' = 'UNPAID';
  if (remainingAmount <= FINANCIAL_EPSILON && totalAmount > 0) {
    paymentStatus = 'PAID';
  } else if (effectiveCumulativePaid > 0) {
    paymentStatus = 'PARTIALLY PAID';
  } else {
    paymentStatus = 'UNPAID';
  }

  return {
    totalAmount,
    amount,
    remainingAmount,
    paymentStatus,
  };
}

/**
 * Calculates authoritative invoice outstanding balance from total and valid posted payments.
 * Authoritative Formula:
 *   raw = grandTotal - sumPaid
 *   if raw <= 0.005 => 0.00 (PAID / fully settled)
 *   if raw > 0.005 => raw (strictly outstanding and payable)
 */
export function calculateAuthoritativeInvoiceOutstanding(
  grandTotalInput?: number | null,
  validPaymentsInput?: number | { amount: number | null | undefined }[] | null
): number {
  const grandTotal = Math.max(0, roundTo2(Number(grandTotalInput) || 0));
  let sumPaid = 0;
  if (Array.isArray(validPaymentsInput)) {
    sumPaid = validPaymentsInput.reduce((acc, p) => acc + Math.max(0, Number(p?.amount) || 0), 0);
  } else if (typeof validPaymentsInput === 'number') {
    sumPaid = Math.max(0, validPaymentsInput);
  }
  sumPaid = roundTo2(sumPaid);

  const rawRemaining = roundTo2(grandTotal - sumPaid);
  if (rawRemaining > FINANCIAL_EPSILON) {
    return rawRemaining;
  }
  return 0;
}

/**
 * Calculates total customer outstanding across multiple invoices.
 * Preserves exact decimal balances (>= ₹0.01).
 */
export function calculateCustomerOutstanding(
  invoices: { balanceAmount?: number | null; grandTotal?: number | null; paidAmount?: number | null; status?: string }[]
): number {
  if (!Array.isArray(invoices)) return 0;
  const total = invoices.reduce((acc, inv) => {
    if (inv.status === 'Cancelled' || inv.status === 'Draft') return acc;
    let bal: number;
    if (inv.balanceAmount !== undefined && inv.balanceAmount !== null) {
      bal = Number(inv.balanceAmount);
    } else {
      const g = Number(inv.grandTotal) || 0;
      const p = Number(inv.paidAmount) || 0;
      bal = g - p;
    }
    bal = roundTo2(bal);
    if (bal > FINANCIAL_EPSILON) {
      return acc + bal;
    }
    return acc;
  }, 0);
  return roundTo2(total);
}

/**
 * Validates whether an incoming payment amount would cause an overpayment.
 * Enforces decimal-safe monetary arithmetic, supports decimal balances (e.g. ₹0.80, ₹0.10),
 * and provides user-friendly error formatting with exact 2 decimal places.
 */
export function validatePaymentAmount(
  outstandingBalance: number,
  paymentAmount: number
): { valid: boolean; error?: string; outstanding?: number; amount?: number; excess?: number } {
  const amount = roundTo2(Number(paymentAmount || 0));
  const balance = roundTo2(Number(outstandingBalance || 0));

  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Payment amount must be greater than ₹0.', outstanding: balance, amount: 0, excess: 0 };
  }

  // If already paid or zero balance, reject payment
  if (balance <= FINANCIAL_EPSILON) {
    return {
      valid: false,
      error: `Invoice is already fully paid. No outstanding balance remains.\nInvoice Outstanding: ₹0.00\nAmount Entered: ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      outstanding: 0,
      amount,
      excess: amount,
    };
  }

  // Reject if amount exceeds balance (with 0.001 epsilon for decimal safety)
  if (amount > balance + 0.001) {
    const excess = Math.max(0, roundTo2(amount - balance));
    return {
      valid: false,
      error: `Payment exceeds this invoice's outstanding balance.\nInvoice Outstanding: ₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nAmount Entered: ₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nExcess: ₹${excess.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      outstanding: balance,
      amount,
      excess,
    };
  }

  return { valid: true, outstanding: balance, amount, excess: 0 };
}

export interface AuthoritativeUdhariMetrics {
  totalUdhari: number;      // Total Udhari Issued
  totalReceived: number;    // Total Recovered
  received: number;         // Total Recovered (backwards-compatible alias)
  outstanding: number;      // Net Outstanding
  overdue: number;          // Overdue Credit
  activeCount: number;      // Number of open credit records
  settledCount: number;     // Number of settled credit records
}

/**
 * Authoritative Centralized Calculation of Udhari / Credit Metrics (Section 4 & 5).
 * 
 * Guarantees:
 * 1. Scope consistency: Filters strictly by branchId when specified, excluding other branches.
 * 2. Arithmetic integrity: Net Outstanding = Sum of individual authoritative remaining balances.
 * 3. Overdue invariant: 0 <= Overdue Credit <= Net Outstanding.
 * 4. Settlement consistency: Fully settled records (bal <= 0.005) have outstanding = 0 and are excluded from overdue.
 * 5. Decimal precision: All metrics rounded strictly to 2 decimal places (paise).
 */
export function calculateAuthoritativeUdhariMetrics(
  records: Array<{
    id?: string;
    originalAmount?: number | null;
    original_amount?: number | null;
    totalReceived?: number | null;
    total_received?: number | null;
    outstandingAmount?: number | null;
    outstanding_amount?: number | null;
    dueDate?: string | null;
    due_date?: string | null;
    status?: string | null;
    branchId?: string | null;
    branch_id?: string | null;
    createdAt?: string | null;
    created_at?: string | null;
    payments?: any[];
  }>,
  options?: {
    branchId?: string | null;
    isMainBranch?: boolean;
    asOfDate?: string | null;
  }
): AuthoritativeUdhariMetrics {
  const todayStr = new Date().toISOString().split('T')[0];
  const targetDate = options?.asOfDate || todayStr;
  const isHistorical = targetDate < todayStr;
  const targetBranch = options?.branchId;
  const isMain = options?.isMainBranch ?? true;

  let totalUdhari = 0;
  let totalReceived = 0;
  let outstanding = 0;
  let overdue = 0;
  let activeCount = 0;
  let settledCount = 0;

  for (const r of records || []) {
    // 1. Branch filtering (strict isolation)
    if (targetBranch && targetBranch !== 'ALL') {
      const b = r.branchId || r.branch_id;
      const matchesBranch = b ? b === targetBranch : isMain;
      if (!matchesBranch) continue;
    }

    // 2. Historical cutoff (if applicable)
    const created = (r.createdAt || r.created_at || '').split('T')[0];
    if (created && created > targetDate) continue;

    const orig = Math.max(0, roundTo2(Number(r.originalAmount ?? r.original_amount ?? 0)));
    const curRec = Math.max(0, roundTo2(Number(r.totalReceived ?? r.total_received ?? 0)));
    const curBal = Math.max(0, roundTo2(Number(r.outstandingAmount ?? r.outstanding_amount ?? Math.max(0, orig - curRec))));

    let balAsOf = curBal;
    let recAsOf = curRec;

    if (isHistorical) {
      const payments = Array.isArray(r.payments) ? r.payments : [];
      let paymentsAfter = 0;
      for (const p of payments) {
        const pDate = (p.payment_date || p.paymentDate || p.date || p.created_at || p.createdAt || '').split('T')[0];
        if (pDate && pDate > targetDate) {
          paymentsAfter += Number(p.amount || 0);
        }
      }
      balAsOf = Math.min(orig, roundTo2(curBal + paymentsAfter));
      recAsOf = Math.max(0, roundTo2(curRec - paymentsAfter));
    }

    // Normalize with settlement threshold
    if (balAsOf <= FINANCIAL_EPSILON) {
      balAsOf = 0;
      recAsOf = orig;
      settledCount += 1;
    } else {
      activeCount += 1;
    }

    totalUdhari += orig;
    totalReceived += recAsOf;
    outstanding += balAsOf;

    // Overdue Credit calculation: only open balances whose dueDate < targetDate
    if (balAsOf > FINANCIAL_EPSILON) {
      const due = r.dueDate || r.due_date;
      if (due && due < targetDate) {
        overdue += balAsOf;
      }
    }
  }

  // Ensure invariants:
  // 1. All amounts rounded to 2 decimals
  // 2. 0 <= Overdue Credit <= Net Outstanding
  // 3. Outstanding >= 0
  const normalizedOutstanding = roundTo2(Math.max(0, outstanding));
  const normalizedOverdue = roundTo2(Math.min(normalizedOutstanding, Math.max(0, overdue)));

  return {
    totalUdhari: roundTo2(totalUdhari),
    totalReceived: roundTo2(totalReceived),
    received: roundTo2(totalReceived),
    outstanding: normalizedOutstanding,
    overdue: normalizedOverdue,
    activeCount,
    settledCount,
  };
}

