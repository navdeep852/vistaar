import { InvoiceStatus, UdhariStatus } from '../types';

export const PAYMENT_TOLERANCE = 1.00;

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
 * Enforces fundamental accounting invariants:
 *   1. Near-zero remaining balance (< PAYMENT_TOLERANCE = ₹1.00) normalized to ₹0.00 & PAID
 *   2. Never allows negative outstanding balances to be stored or displayed
 *   3. Retains actual historical payment inflows without fabricating artificial write-off transactions
 */

/**
 * Calculates normalized invoice financial metrics with monetary tolerance.
 * Caps paidAmount between 0 and grandTotal.
 * If 0 <= remaining < PAYMENT_TOLERANCE (₹1.00), remaining is normalized to 0.00 and status is Paid.
 * If remaining >= PAYMENT_TOLERANCE, remaining is preserved and status is Partially Paid / Issued.
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
  if (rawBalance >= 0 && rawBalance < PAYMENT_TOLERANCE) {
    balanceAmount = 0;
  } else if (rawBalance >= PAYMENT_TOLERANCE) {
    balanceAmount = rawBalance;
  } else {
    // Negative balance indicates overpayment; never store/display negative balance
    balanceAmount = 0;
  }

  let status: InvoiceStatus = currentStatus || 'Issued';
  if (status !== 'Cancelled' && status !== 'Draft') {
    if (balanceAmount <= 0.01 && grandTotal > 0) {
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
 * Calculates normalized Udhari ledger financials with monetary tolerance.
 * Enforces originalAmount = totalReceived + outstandingAmount (with near-zero tolerance).
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
  if (rawOutstanding >= 0 && rawOutstanding < PAYMENT_TOLERANCE) {
    outstandingAmount = 0;
  } else if (rawOutstanding >= PAYMENT_TOLERANCE) {
    outstandingAmount = rawOutstanding;
  } else {
    // Overpayment
    outstandingAmount = 0;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  let status: UdhariStatus = 'UNPAID';

  if (outstandingAmount <= 0.01) {
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
  if (rawRemaining >= 0 && rawRemaining < PAYMENT_TOLERANCE) {
    remainingAmount = 0;
  } else if (rawRemaining >= PAYMENT_TOLERANCE) {
    remainingAmount = rawRemaining;
  } else {
    remainingAmount = 0;
  }

  let paymentStatus: 'PAID' | 'PARTIALLY PAID' | 'UNPAID' = 'UNPAID';
  if (remainingAmount <= 0.01 && totalAmount > 0) {
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
 *   if 0 <= raw < PAYMENT_TOLERANCE (₹1.00) => 0.00 (PAID)
 *   if raw >= PAYMENT_TOLERANCE => raw
 *   if raw < 0 => 0.00 (overpayment, never negative)
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
  if (rawRemaining >= 0 && rawRemaining < PAYMENT_TOLERANCE) {
    return 0;
  }
  if (rawRemaining < 0) {
    return 0;
  }
  return rawRemaining;
}

/**
 * Calculates total customer outstanding across multiple invoices.
 * Applies PAYMENT_TOLERANCE to each invoice's remaining balance.
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
    if (bal >= 0 && bal < PAYMENT_TOLERANCE) {
      bal = 0;
    } else if (bal < 0) {
      bal = 0;
    }
    return acc + bal;
  }, 0);
  return roundTo2(total);
}

/**
 * Validates whether an incoming payment amount would cause an overpayment.
 * Enforces decimal-safe monetary arithmetic and user-friendly error formatting.
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

  // If already paid or within tolerance (balance = 0), reject payment
  if (balance <= 0) {
    return {
      valid: false,
      error: `Invoice is already fully paid. No outstanding balance remains.\nInvoice Outstanding: ₹0.00\nAmount Entered: ₹${amount.toLocaleString('en-IN')}`,
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
      error: `Payment exceeds this invoice's outstanding balance.\nInvoice Outstanding: ₹${balance.toLocaleString('en-IN')}\nAmount Entered: ₹${amount.toLocaleString('en-IN')}\nExcess: ₹${excess.toLocaleString('en-IN')}`,
      outstanding: balance,
      amount,
      excess,
    };
  }

  return { valid: true, outstanding: balance, amount, excess: 0 };
}

