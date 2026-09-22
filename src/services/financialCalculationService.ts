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
 * Calculates normalized Daybook sale financials from authoritative invoice numbers.
 */
export function calculateDaybookFinancials(
  totalAmountInput?: number | null,
  inflowAmountInput?: number | null
): DaybookFinancials {
  const totalAmount = Math.max(0, Number((Number(totalAmountInput) || 0).toFixed(2)));
  const rawInflow = Math.max(0, Number((Number(inflowAmountInput) || 0).toFixed(2)));
  const amount = Math.min(totalAmount, rawInflow);
  const remainingAmount = Math.max(0, Number((totalAmount - amount).toFixed(2)));

  let paymentStatus: 'PAID' | 'PARTIALLY PAID' | 'UNPAID' = 'UNPAID';
  if (remainingAmount <= 0.01 && totalAmount > 0) {
    paymentStatus = 'PAID';
  } else if (amount > 0) {
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
 * Validates whether an incoming payment amount would cause an overpayment.
 */
export function validatePaymentAmount(
  outstandingBalance: number,
  paymentAmount: number
): { valid: boolean; error?: string } {
  const amount = Number(paymentAmount) || 0;
  const balance = Number(outstandingBalance) || 0;

  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Payment amount must be greater than ₹0.' };
  }

  // Allow up to 0.05 margin for currency rounding
  if (amount > balance + 0.05) {
    return {
      valid: false,
      error: `Payment amount (₹${amount.toLocaleString('en-IN')}) exceeds outstanding balance (₹${balance.toLocaleString('en-IN')}). Overpayment rejected.`,
    };
  }

  return { valid: true };
}
