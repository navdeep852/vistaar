import { InvoiceStatus, UdhariStatus } from '../types';

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
 *   1. grandTotal = paidAmount + balanceAmount (for invoices)
 *   2. originalAmount = totalReceived + outstandingAmount (for udhari)
 *   3. totalAmount = amount (inflow) + remainingAmount (for daybook sales)
 */

/**
 * Calculates normalized invoice financial metrics with strict monetary bounds.
 * Caps paidAmount between 0 and grandTotal.
 * Guarantees balanceAmount = Math.max(0, grandTotal - paidAmount).
 */
export function calculateInvoiceFinancials(
  grandTotalInput?: number | null,
  paidAmountInput?: number | null,
  currentStatus?: InvoiceStatus
): InvoiceFinancials {
  const grandTotal = Math.max(0, Number((Number(grandTotalInput) || 0).toFixed(2)));
  const rawPaid = Math.max(0, Number((Number(paidAmountInput) || 0).toFixed(2)));
  const paidAmount = Math.min(grandTotal, rawPaid);
  const balanceAmount = Math.max(0, Number((grandTotal - paidAmount).toFixed(2)));

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
 * Calculates normalized Udhari ledger financials.
 * Enforces originalAmount = totalReceived + outstandingAmount.
 */
export function calculateUdhariFinancials(
  originalAmountInput?: number | null,
  totalReceivedInput?: number | null,
  dueDate?: string
): UdhariFinancials {
  const originalAmount = Math.max(0, Number((Number(originalAmountInput) || 0).toFixed(2)));
  const rawReceived = Math.max(0, Number((Number(totalReceivedInput) || 0).toFixed(2)));
  const totalReceived = Math.min(originalAmount, rawReceived);
  const outstandingAmount = Math.max(0, Number((originalAmount - totalReceived).toFixed(2)));

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
 * - remainingAmount = max(0, totalAmount - cumulativePaid)
 */
export function calculateDaybookFinancials(
  totalAmountInput?: number | null,
  inflowAmountInput?: number | null,
  cumulativePaidInput?: number | null
): DaybookFinancials {
  const totalAmount = Math.max(0, Number((Number(totalAmountInput) || 0).toFixed(2)));
  const rawInflow = Math.max(0, Number((Number(inflowAmountInput) || 0).toFixed(2)));
  const amount = Math.min(totalAmount, rawInflow);
  
  const effectiveCumulativePaid = cumulativePaidInput !== undefined && cumulativePaidInput !== null
    ? Math.max(0, Number((Number(cumulativePaidInput) || 0).toFixed(2)))
    : amount;

  const remainingAmount = Math.max(0, Number((totalAmount - effectiveCumulativePaid).toFixed(2)));

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
 * Authoritative Formula: Outstanding = Math.max(0, Invoice Total - Sum of Valid Payments)
 */
export function calculateAuthoritativeInvoiceOutstanding(
  grandTotalInput?: number | null,
  validPaymentsInput?: number | { amount: number | null | undefined }[] | null
): number {
  const grandTotal = Math.max(0, Number((Number(grandTotalInput) || 0).toFixed(2)));
  let sumPaid = 0;
  if (Array.isArray(validPaymentsInput)) {
    sumPaid = validPaymentsInput.reduce((acc, p) => acc + Math.max(0, Number(p?.amount) || 0), 0);
  } else if (typeof validPaymentsInput === 'number') {
    sumPaid = Math.max(0, validPaymentsInput);
  }
  sumPaid = Number(sumPaid.toFixed(2));
  return Math.max(0, Number((grandTotal - sumPaid).toFixed(2)));
}

/**
 * Calculates total customer outstanding across multiple invoices.
 * Customer Outstanding = Sum of outstanding balance of all unpaid / partially-paid invoices.
 */
export function calculateCustomerOutstanding(
  invoices: { balanceAmount?: number | null; grandTotal?: number | null; paidAmount?: number | null; status?: string }[]
): number {
  if (!Array.isArray(invoices)) return 0;
  const total = invoices.reduce((acc, inv) => {
    if (inv.status === 'Cancelled' || inv.status === 'Draft') return acc;
    const bal = inv.balanceAmount !== undefined && inv.balanceAmount !== null
      ? Number(inv.balanceAmount)
      : Math.max(0, (Number(inv.grandTotal) || 0) - (Number(inv.paidAmount) || 0));
    return acc + Math.max(0, bal);
  }, 0);
  return Number(total.toFixed(2));
}

/**
 * Validates whether an incoming payment amount would cause an overpayment.
 * Enforces decimal-safe monetary arithmetic and user-friendly error formatting.
 */
export function validatePaymentAmount(
  outstandingBalance: number,
  paymentAmount: number
): { valid: boolean; error?: string; outstanding?: number; amount?: number; excess?: number } {
  const amount = Number(Number(paymentAmount || 0).toFixed(2));
  const balance = Number(Number(outstandingBalance || 0).toFixed(2));

  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Payment amount must be greater than ₹0.', outstanding: balance, amount: 0, excess: 0 };
  }

  // Allow up to 0.05 margin for currency rounding
  if (amount > balance + 0.05) {
    const excess = Math.max(0, Number((amount - balance).toFixed(2)));
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

