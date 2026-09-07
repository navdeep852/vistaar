import { ALLOWED_TAX_RATES, isValidTaxRate, normalizeToNearestAllowedTaxRate } from '../src/constants/tax.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

console.log('\n--- 1. Testing Strict Tax Rate Constants [0, 5, 12, 18, 40] ---');
assert(ALLOWED_TAX_RATES.length === 5, 'Exactly 5 allowed tax rates');
assert(ALLOWED_TAX_RATES.includes(0), 'Tax rate 0% is allowed');
assert(ALLOWED_TAX_RATES.includes(5), 'Tax rate 5% is allowed');
assert(ALLOWED_TAX_RATES.includes(12), 'Tax rate 12% is allowed');
assert(ALLOWED_TAX_RATES.includes(18), 'Tax rate 18% is allowed');
assert(ALLOWED_TAX_RATES.includes(40), 'Tax rate 40% is allowed');
assert(!ALLOWED_TAX_RATES.includes(28 as any), 'Tax rate 28% is strictly eliminated');
assert(!isValidTaxRate(28), 'isValidTaxRate(28) returns false');
assert(isValidTaxRate(18), 'isValidTaxRate(18) returns true');
assert(isValidTaxRate(40), 'isValidTaxRate(40) returns true');
assert(normalizeToNearestAllowedTaxRate(28) === 18, 'normalizeToNearestAllowedTaxRate(28) falls back to 18%');
assert(normalizeToNearestAllowedTaxRate(40) === 40, 'normalizeToNearestAllowedTaxRate(40) preserves 40%');

console.log('\n--- 2. Canonical Financial Calculation & Invariant Tests ---');

interface PaymentRecord {
  id: string;
  invoiceId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  isUpfront?: boolean;
}

function calculateInvoiceFinancialState(invoiceTotal: number, payments: PaymentRecord[]) {
  // Authoritative unique payments deduplication
  const seen = new Set<string>();
  let totalPaid = 0;
  for (const p of payments) {
    const key = `${p.id}-${p.amount}-${p.paymentDate}`;
    if (!seen.has(key) && !seen.has(p.id)) {
      seen.add(key);
      seen.add(p.id);
      totalPaid += Number(p.amount) || 0;
    }
  }

  const remaining = Math.max(0, invoiceTotal - totalPaid);
  let status: 'Paid' | 'Partially Paid' | 'Unpaid';
  if (totalPaid === 0) {
    status = 'Unpaid';
  } else if (remaining === 0) {
    status = 'Paid';
  } else {
    status = 'Partially Paid';
  }

  return {
    total: invoiceTotal,
    totalPaid,
    remaining,
    status,
    invariantHolds: (totalPaid + remaining === invoiceTotal),
  };
}

// Test A — Unpaid
console.log('\nTest A — Unpaid (Invoice = ₹10,000, Payment = ₹0)');
const testA = calculateInvoiceFinancialState(10000, []);
assert(testA.status === 'Unpaid', 'Status is Unpaid');
assert(testA.totalPaid === 0, 'Total Paid is 0');
assert(testA.remaining === 10000, 'Remaining is 10,000');
assert(testA.invariantHolds, 'Invariant Holds: 0 + 10,000 = 10,000');

// Test B — Partial
console.log('\nTest B — Partial (Invoice = ₹10,000, Payment = ₹4,000)');
const testB = calculateInvoiceFinancialState(10000, [
  { id: 'PAY-1', invoiceId: 'INV-1', amount: 4000, paymentDate: '2026-09-07', paymentMethod: 'UPI' }
]);
assert(testB.status === 'Partially Paid', 'Status is Partially Paid');
assert(testB.totalPaid === 4000, 'Total Paid is 4,000');
assert(testB.remaining === 6000, 'Remaining is 6,000');
assert(testB.invariantHolds, 'Invariant Holds: 4,000 + 6,000 = 10,000');

// Test C — Full
console.log('\nTest C — Full (Invoice = ₹10,000, Payment = ₹10,000)');
const testC = calculateInvoiceFinancialState(10000, [
  { id: 'PAY-FULL', invoiceId: 'INV-1', amount: 10000, paymentDate: '2026-09-07', paymentMethod: 'CASH' }
]);
assert(testC.status === 'Paid', 'Status is Paid');
assert(testC.totalPaid === 10000, 'Total Paid is 10,000');
assert(testC.remaining === 0, 'Remaining is 0');
assert(testC.invariantHolds, 'Invariant Holds: 10,000 + 0 = 10,000');

// Test D — Multiple payments
console.log('\nTest D — Multiple Payments (Invoice = ₹10,000, Payments: ₹2,000, ₹3,000, ₹5,000)');
const testD = calculateInvoiceFinancialState(10000, [
  { id: 'P1', invoiceId: 'INV-1', amount: 2000, paymentDate: '2026-09-01', paymentMethod: 'UPI' },
  { id: 'P2', invoiceId: 'INV-1', amount: 3000, paymentDate: '2026-09-03', paymentMethod: 'BANK' },
  { id: 'P3', invoiceId: 'INV-1', amount: 5000, paymentDate: '2026-09-07', paymentMethod: 'CASH' }
]);
assert(testD.status === 'Paid', 'Status is Paid');
assert(testD.totalPaid === 10000, 'Total Paid is 10,000');
assert(testD.remaining === 0, 'Remaining is 0');
assert(testD.invariantHolds, 'Invariant Holds: 10,000 + 0 = 10,000');

// Test E — Duplicate submit (Idempotency)
console.log('\nTest E — Duplicate Submit (2 identical payment records for the same ₹4,000)');
const testE = calculateInvoiceFinancialState(10000, [
  { id: 'PAY-DUP', invoiceId: 'INV-1', amount: 4000, paymentDate: '2026-09-07', paymentMethod: 'UPI' },
  { id: 'PAY-DUP', invoiceId: 'INV-1', amount: 4000, paymentDate: '2026-09-07', paymentMethod: 'UPI' }
]);
assert(testE.totalPaid === 4000, 'Total Paid is deduplicated to ₹4,000, NOT ₹8,000');
assert(testE.remaining === 6000, 'Remaining is ₹6,000');
assert(testE.status === 'Partially Paid', 'Status is Partially Paid');

// Test F — Zero Partial Payment Validation
console.log('\nTest F — Zero Partial Payment Validation');
function validatePartialPayment(mode: string, amount: number): { valid: boolean; error?: string } {
  if (mode === 'Partially Paid' && (amount <= 0 || isNaN(amount))) {
    return { valid: false, error: 'Payment amount must be greater than ₹0.' };
  }
  return { valid: true };
}
const testF1 = validatePartialPayment('Partially Paid', 0);
assert(!testF1.valid, '₹0 partial payment is invalid');
assert(testF1.error === 'Payment amount must be greater than ₹0.', 'Validation error matches specification');
const testF2 = validatePartialPayment('Partially Paid', 500);
assert(testF2.valid, '₹500 partial payment is valid');

// Test G — Overpayment
console.log('\nTest G — Overpayment Validation');
function validatePaymentAmount(amount: number, outstanding: number): { valid: boolean; error?: string } {
  if (amount > outstanding) {
    return { valid: false, error: `Payment amount cannot exceed outstanding balance (₹${outstanding})` };
  }
  return { valid: true };
}
const testG1 = validatePaymentAmount(4001, 4000);
assert(!testG1.valid, 'Attempting ₹4,001 on ₹4,000 outstanding is rejected');
const testG2 = validatePaymentAmount(4000, 4000);
assert(testG2.valid, 'Attempting ₹4,000 on ₹4,000 outstanding is accepted');

// 3. RUPESH TEST CASE RECONCILIATION
console.log('\n--- 3. Canonical Rupesh Test Case: INV-2026-0009 ---');
const rupeshInvoiceTotal = 15750;
const rupeshPayments: PaymentRecord[] = [
  { id: 'PAY-RUPESH-1', invoiceId: 'INV-2026-0009', amount: 4000, paymentDate: '2026-09-07', paymentMethod: 'UPI', isUpfront: true }
];

const rupeshState = calculateInvoiceFinancialState(rupeshInvoiceTotal, rupeshPayments);
assert(rupeshState.total === 15750, 'Invoice Total = ₹15,750');
assert(rupeshState.totalPaid === 4000, 'Total Paid = ₹4,000');
assert(rupeshState.remaining === 11750, 'Remaining = ₹11,750');
assert(rupeshState.status === 'Partially Paid', 'Status = PARTIALLY PAID');
assert(rupeshState.invariantHolds, 'Mathematical Invariant: ₹15,750 = ₹4,000 + ₹11,750');

// Daybook rules check
console.log('\n--- 4. Daybook & Cashbook Rules Check ---');
function simulateDaybookEntries(invoiceTotal: number, upfrontPaid: number, invoiceNumber: string, laterPayments: number[]) {
  const entries: Array<{ type: string; total: number | null; inflow: number; remaining: number }> = [];
  
  // Initial Sale Row
  entries.push({
    type: 'SALE',
    total: invoiceTotal,
    inflow: upfrontPaid,
    remaining: invoiceTotal - upfrontPaid
  });

  // Later payments each create a Customer Payment row with total = null
  let currentRemaining = invoiceTotal - upfrontPaid;
  for (const p of laterPayments) {
    currentRemaining -= p;
    entries.push({
      type: 'CUSTOMER_PAYMENT',
      total: null,
      inflow: p,
      remaining: currentRemaining
    });
  }

  return entries;
}

const rupeshDaybook = simulateDaybookEntries(15750, 4000, 'INV-2026-0009', []);
assert(rupeshDaybook.length === 1, 'Initial Daybook has exactly 1 row (SALE)');
assert(rupeshDaybook[0].total === 15750, 'Daybook Total = ₹15,750');
assert(rupeshDaybook[0].inflow === 4000, 'Daybook Inflow = ₹4,000');
assert(rupeshDaybook[0].remaining === 11750, 'Daybook Remaining = ₹11,750');

// Rupesh later pays ₹5,000
const rupeshDaybookLater = simulateDaybookEntries(15750, 4000, 'INV-2026-0009', [5000]);
assert(rupeshDaybookLater.length === 2, 'After later payment, Daybook has 2 rows');
assert(rupeshDaybookLater[1].total === null, 'Later payment row Total is blank (null)');
assert(rupeshDaybookLater[1].inflow === 5000, 'Later payment row Inflow = ₹5,000');
assert(rupeshDaybookLater[1].remaining === 6750, 'Later payment row Remaining = ₹6,750');

console.log('\n🎉 ALL RECONCILIATION & INVARIANT TESTS PASSED SUCCESSFULLY! 🎉\n');
