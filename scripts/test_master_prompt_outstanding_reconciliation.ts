/**
 * Master Verification Test: Authoritative Outstanding Balance & Overpayment Fix
 * Tests all 8 User-Mandated Scenarios from Section 17 of the Master Prompt:
 *
 * TEST 1 — Unpaid invoice (₹49,000 total, ₹0 paid -> pay ₹49,000 -> PAID, balance ₹0)
 * TEST 2 — Partial payment (₹49,000 total, ₹20,000 paid -> pay ₹29,000 -> PAID, balance ₹0)
 * TEST 3 — Partial payment continuation (₹49,000 total, ₹20,000 paid -> pay ₹10,000 -> balance ₹19,000, PARTIALLY PAID)
 * TEST 4 — Overpayment rejection (₹49,000 total, ₹20,000 paid, balance ₹29,000 -> pay ₹30,000 -> REJECT, balance unchanged)
 * TEST 5 — Exact payment followed by ₹1 attempt (Outstanding ₹0 -> pay ₹1 -> REJECT)
 * TEST 6 — Customer has multiple invoices (Inv A: ₹49,000, Inv B: ₹20,400 -> Customer total ₹69,400 -> pay Inv A ₹49,000 -> Inv A ₹0, Inv B ₹20,400, Customer total ₹20,400)
 * TEST 7 — Refresh consistency across reload
 * TEST 8 — Rapid duplicate submission protection
 */

// Mock localStorage for Node.js test environment
const mockStorage: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => mockStorage[k] || null,
  setItem: (k: string, v: string) => { mockStorage[k] = v; },
  removeItem: (k: string) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); },
};

import { store } from '../src/services/store.ts';
import {
  calculateAuthoritativeInvoiceOutstanding,
  calculateCustomerOutstanding,
  validatePaymentAmount,
  calculateInvoiceFinancials,
  calculateUdhariFinancials,
} from '../src/services/financialCalculationService.ts';
import { safeGetTenantStorage } from '../src/services/supabase/safeStorage.ts';

let passed = 0;
let total = 0;

function assert(condition: boolean, name: string, details?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } else {
    console.error(`❌ [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
    process.exitCode = 1;
  }
}

async function runMasterTestSuite() {
  console.log('================================================================');
  console.log('STARTING VISTAAR OUTSTANDING RECONCILIATION & OVERPAYMENT SUITE');
  console.log('================================================================\n');

  // Clear state for clean testing
  const appState = store.getState();
  appState.invoices = [];
  appState.payments = [];
  appState.udharis = [];
  appState.customers = [];

  // ---------------------------------------------------------------------------
  // TEST 1 — Unpaid Invoice
  // Invoice = ₹49,000, Paid = ₹0, Outstanding = ₹49,000
  // Payment ₹49,000 -> SUCCESS -> Outstanding ₹0 -> PAID
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Unpaid Invoice ---');
  const inv1 = store.addInvoice({
    invoiceNumber: 'INV-TEST-001',
    customerId: 'cust-1',
    customerName: 'Vaishali Sharma',
    customerPhone: '9876543210',
    date: '2026-10-11',
    dueDate: '2026-10-26',
    items: [{ id: 'item-1', description: 'Product A', quantity: 1, rate: 49000, amount: 49000 }],
    subtotal: 49000,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 49000,
    paidAmount: 0,
    balanceAmount: 49000,
    status: 'Issued',
  });

  const out1Before = store.getAuthoritativeInvoiceOutstanding('INV-TEST-001');
  assert(out1Before === 49000, 'Test 1: Initial authoritative outstanding is ₹49,000', `Got ${out1Before}`);

  const payRes1 = store.recordUnifiedCustomerPayment({
    invoiceId: inv1.id,
    invoiceNumber: inv1.invoiceNumber,
    customerId: 'cust-1',
    customerName: 'Vaishali Sharma',
    amount: 49000,
    paymentMethod: 'UPI',
    paymentDate: '2026-10-11',
  });

  const out1After = store.getAuthoritativeInvoiceOutstanding('INV-TEST-001');
  const inv1Updated = store.getInvoices().find((i) => i.id === inv1.id);
  const udhari1Updated = store.getUdharis().find((u) => u.invoiceId === inv1.id || u.id === `UD-${inv1.invoiceNumber}`);

  assert(out1After === 0, 'Test 1: Outstanding is ₹0 after full payment', `Got ${out1After}`);
  assert(inv1Updated?.status === 'Paid', 'Test 1: Invoice status is Paid', `Got ${inv1Updated?.status}`);
  assert(inv1Updated?.paidAmount === 49000, 'Test 1: Invoice paidAmount is ₹49,000', `Got ${inv1Updated?.paidAmount}`);
  assert(!udhari1Updated || udhari1Updated.status === 'PAID', 'Test 1: Linked Udhari status is PAID');

  // ---------------------------------------------------------------------------
  // TEST 2 — Partial Payment
  // Invoice = ₹49,000, Paid = ₹20,000, Outstanding = ₹29,000
  // Payment ₹29,000 -> SUCCESS -> Outstanding ₹0 -> PAID
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Partial Payment Settlement ---');
  const inv2 = store.addInvoice({
    invoiceNumber: 'INV-TEST-002',
    customerId: 'cust-2',
    customerName: 'Vaishali Sharma',
    customerPhone: '9876543210',
    date: '2026-10-11',
    dueDate: '2026-10-26',
    items: [{ id: 'item-2', description: 'Product B', quantity: 1, rate: 49000, amount: 49000 }],
    subtotal: 49000,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 49000,
    paidAmount: 20000,
    balanceAmount: 29000,
    status: 'Partially Paid',
  });

  const out2Before = store.getAuthoritativeInvoiceOutstanding('INV-TEST-002');
  assert(out2Before === 29000, 'Test 2: Authoritative outstanding is ₹29,000', `Got ${out2Before}`);

  // Pay remaining ₹29,000
  store.recordUnifiedCustomerPayment({
    invoiceId: inv2.id,
    invoiceNumber: inv2.invoiceNumber,
    customerId: 'cust-2',
    customerName: 'Vaishali Sharma',
    amount: 29000,
    paymentMethod: 'UPI',
    paymentDate: '2026-10-11',
  });

  const out2After = store.getAuthoritativeInvoiceOutstanding('INV-TEST-002');
  const inv2Updated = store.getInvoices().find((i) => i.id === inv2.id);
  assert(out2After === 0, 'Test 2: Outstanding is ₹0 after settlement', `Got ${out2After}`);
  assert(inv2Updated?.status === 'Paid', 'Test 2: Invoice status is Paid', `Got ${inv2Updated?.status}`);
  assert(inv2Updated?.paidAmount === 49000, 'Test 2: Invoice paidAmount is ₹49,000', `Got ${inv2Updated?.paidAmount}`);

  // ---------------------------------------------------------------------------
  // TEST 3 — Partial Payment Continuation
  // Invoice = ₹49,000, Paid = ₹20,000, Outstanding = ₹29,000
  // Payment ₹10,000 -> SUCCESS -> Outstanding ₹19,000 -> PARTIALLY PAID
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Partial Payment Continuation ---');
  const inv3 = store.addInvoice({
    invoiceNumber: 'INV-TEST-003',
    customerId: 'cust-3',
    customerName: 'Vaishali Sharma',
    customerPhone: '9876543210',
    date: '2026-10-11',
    dueDate: '2026-10-26',
    items: [{ id: 'item-3', description: 'Product C', quantity: 1, rate: 49000, amount: 49000 }],
    subtotal: 49000,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 49000,
    paidAmount: 20000,
    balanceAmount: 29000,
    status: 'Partially Paid',
  });

  const out3Before = store.getAuthoritativeInvoiceOutstanding('INV-TEST-003');
  assert(out3Before === 29000, 'Test 3: Authoritative outstanding before payment is ₹29,000', `Got ${out3Before}`);

  store.recordUnifiedCustomerPayment({
    invoiceId: inv3.id,
    invoiceNumber: inv3.invoiceNumber,
    customerId: 'cust-3',
    customerName: 'Vaishali Sharma',
    amount: 10000,
    paymentMethod: 'UPI',
    paymentDate: '2026-10-11',
  });

  const out3After = store.getAuthoritativeInvoiceOutstanding('INV-TEST-003');
  const inv3Updated = store.getInvoices().find((i) => i.id === inv3.id);
  assert(out3After === 19000, 'Test 3: Outstanding is ₹19,000', `Got ${out3After}`);
  assert(inv3Updated?.paidAmount === 30000, 'Test 3: Total paid is ₹30,000', `Got ${inv3Updated?.paidAmount}`);
  assert(inv3Updated?.status === 'Partially Paid', 'Test 3: Invoice status is Partially Paid', `Got ${inv3Updated?.status}`);

  // ---------------------------------------------------------------------------
  // TEST 4 — Overpayment Rejection
  // Invoice = ₹49,000, Paid = ₹20,000, Outstanding = ₹29,000
  // Payment ₹30,000 -> REJECT -> Outstanding remains ₹29,000
  // No Daybook entry, No Cashbook entry, No Udhari mutation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Overpayment Rejection ---');
  const inv4 = store.addInvoice({
    invoiceNumber: 'INV-TEST-004',
    customerId: 'cust-4',
    customerName: 'Vaishali Sharma',
    customerPhone: '9876543210',
    date: '2026-10-11',
    dueDate: '2026-10-26',
    items: [{ id: 'item-4', description: 'Product D', quantity: 1, rate: 49000, amount: 49000 }],
    subtotal: 49000,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 49000,
    paidAmount: 20000,
    balanceAmount: 29000,
    status: 'Partially Paid',
  });

  const out4Before = store.getAuthoritativeInvoiceOutstanding('INV-TEST-004');
  assert(out4Before === 29000, 'Test 4: Authoritative outstanding before payment is ₹29,000', `Got ${out4Before}`);

  const daybookBeforeCount = safeGetTenantStorage('vistaar_local_daybook_db', []).length;
  const cashbookBeforeCount = safeGetTenantStorage('vistaar_local_cashbook_entries_db', []).length;
  const udhariBefore = store.getUdharis().find((u) => u.invoiceId === inv4.id);
  const udhariBeforeOut = udhariBefore ? udhariBefore.outstandingAmount : 29000;

  // Validation function check
  const valCheck = validatePaymentAmount(29000, 30000);
  assert(!valCheck.valid, 'Test 4: validatePaymentAmount rejects ₹30,000 against ₹29,000 balance');
  assert(!valCheck.error?.includes('database outstanding balance'), 'Test 4: Error does NOT expose internal "database outstanding balance"');
  assert(valCheck.error?.includes("Payment exceeds this invoice's outstanding balance"), 'Test 4: Error matches Requirement 18 standard text');
  assert(valCheck.error?.includes('Excess: ₹1,000'), 'Test 4: Error displays correct excess amount ₹1,000');

  // Attempt overpayment in store
  let overpayError: string | null = null;
  try {
    store.recordUnifiedCustomerPayment({
      invoiceId: inv4.id,
      invoiceNumber: inv4.invoiceNumber,
      customerId: 'cust-4',
      customerName: 'Vaishali Sharma',
      amount: 30000,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-11',
    });
  } catch (e: any) {
    overpayError = e.message;
  }

  assert(overpayError !== null, 'Test 4: store.recordUnifiedCustomerPayment throws overpayment error');

  // Verify no mutation occurred
  const out4After = store.getAuthoritativeInvoiceOutstanding('INV-TEST-004');
  const daybookAfterCount = safeGetTenantStorage('vistaar_local_daybook_db', []).length;
  const cashbookAfterCount = safeGetTenantStorage('vistaar_local_cashbook_entries_db', []).length;
  const udhariAfter = store.getUdharis().find((u) => u.invoiceId === inv4.id);

  assert(out4After === 29000, 'Test 4: Outstanding balance unchanged at ₹29,000', `Got ${out4After}`);
  assert(daybookAfterCount === daybookBeforeCount, 'Test 4: No Daybook entry added on rejected overpayment');
  assert(cashbookAfterCount === cashbookBeforeCount, 'Test 4: No Cashbook entry added on rejected overpayment');
  assert(!udhariAfter || udhariAfter.outstandingAmount === udhariBeforeOut, 'Test 4: No Udhari mutation on rejected overpayment');

  // ---------------------------------------------------------------------------
  // TEST 5 — Exact Payment Followed by ₹1 Attempt
  // Invoice = ₹49,000, Paid = ₹49,000, Outstanding = ₹0
  // Attempt another ₹1 -> REJECT
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Exact Payment & Zero-Balance Guard ---');
  const inv5 = store.addInvoice({
    invoiceNumber: 'INV-TEST-005',
    customerId: 'cust-5',
    customerName: 'Vaishali Sharma',
    customerPhone: '9876543210',
    date: '2026-10-11',
    dueDate: '2026-10-26',
    items: [{ id: 'item-5', description: 'Product E', quantity: 1, rate: 49000, amount: 49000 }],
    subtotal: 49000,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 49000,
    paidAmount: 0,
    balanceAmount: 49000,
    status: 'Issued',
  });

  store.recordUnifiedCustomerPayment({
    invoiceId: inv5.id,
    invoiceNumber: inv5.invoiceNumber,
    customerId: 'cust-5',
    customerName: 'Vaishali Sharma',
    amount: 49000,
    paymentMethod: 'UPI',
    paymentDate: '2026-10-11',
  });

  const out5 = store.getAuthoritativeInvoiceOutstanding('INV-TEST-005');
  assert(out5 === 0, 'Test 5: Invoice is fully paid (outstanding ₹0)');

  let extraPayError: string | null = null;
  try {
    store.recordUnifiedCustomerPayment({
      invoiceId: inv5.id,
      invoiceNumber: inv5.invoiceNumber,
      customerId: 'cust-5',
      customerName: 'Vaishali Sharma',
      amount: 1,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-11',
    });
  } catch (e: any) {
    extraPayError = e.message;
  }

  assert(extraPayError !== null, 'Test 5: Attempting ₹1 against fully paid invoice is REJECTED');

  // ---------------------------------------------------------------------------
  // TEST 6 — Customer Has Multiple Invoices
  // Invoice A outstanding = ₹49,000
  // Invoice B outstanding = ₹20,400
  // Customer total outstanding = ₹69,400
  // Payment against Invoice A = ₹49,000 -> SUCCESS
  // Invoice A = ₹0, Invoice B = ₹20,400, Customer total = ₹20,400
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Multiple Invoices for Single Customer ---');
  const custId6 = 'cust-vaishali-multi';
  const invA = store.addInvoice({
    invoiceNumber: 'INV-VAISHALI-A',
    customerId: custId6,
    customerName: 'Vaishali Sharma',
    customerPhone: '9876543210',
    date: '2026-10-11',
    dueDate: '2026-10-26',
    items: [{ id: 'item-6a', description: 'Batch A', quantity: 1, rate: 49000, amount: 49000 }],
    subtotal: 49000,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 49000,
    paidAmount: 0,
    balanceAmount: 49000,
    status: 'Issued',
  });

  const invB = store.addInvoice({
    invoiceNumber: 'INV-VAISHALI-B',
    customerId: custId6,
    customerName: 'Vaishali Sharma',
    customerPhone: '9876543210',
    date: '2026-10-11',
    dueDate: '2026-10-26',
    items: [{ id: 'item-6b', description: 'Batch B', quantity: 1, rate: 20400, amount: 20400 }],
    subtotal: 20400,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 20400,
    paidAmount: 0,
    balanceAmount: 20400,
    status: 'Issued',
  });

  const custInvsBefore = store.getInvoices().filter((i) => i.customerId === custId6);
  const totalCustOutBefore = calculateCustomerOutstanding(custInvsBefore);
  assert(totalCustOutBefore === 69400, 'Test 6: Total customer outstanding across invoices is ₹69,400 (49000 + 20400)', `Got ${totalCustOutBefore}`);

  // Pay Invoice A in full (₹49,000)
  store.recordUnifiedCustomerPayment({
    invoiceId: invA.id,
    invoiceNumber: invA.invoiceNumber,
    customerId: custId6,
    customerName: 'Vaishali Sharma',
    amount: 49000,
    paymentMethod: 'UPI',
    paymentDate: '2026-10-11',
  });

  const outA = store.getAuthoritativeInvoiceOutstanding('INV-VAISHALI-A');
  const outB = store.getAuthoritativeInvoiceOutstanding('INV-VAISHALI-B');
  const custInvsAfterA = store.getInvoices().filter((i) => i.customerId === custId6);
  const totalCustOutAfterA = calculateCustomerOutstanding(custInvsAfterA);

  assert(outA === 0, 'Test 6: Invoice A outstanding is ₹0 after payment', `Got ${outA}`);
  assert(outB === 20400, 'Test 6: Invoice B outstanding remains ₹20,400', `Got ${outB}`);
  assert(totalCustOutAfterA === 20400, 'Test 6: Customer total outstanding updated to ₹20,400', `Got ${totalCustOutAfterA}`);

  // Attempt overpayment against Invoice B with customer total (₹69,400) -> must be rejected
  let crossPayError: string | null = null;
  try {
    store.recordUnifiedCustomerPayment({
      invoiceId: invB.id,
      invoiceNumber: invB.invoiceNumber,
      customerId: custId6,
      customerName: 'Vaishali Sharma',
      amount: 69400,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-11',
    });
  } catch (e: any) {
    crossPayError = e.message;
  }
  assert(crossPayError !== null, 'Test 6: Paying customer total (₹69,400) against single invoice (₹20,400) is REJECTED');

  // Pay Invoice B exactly (₹20,400)
  store.recordUnifiedCustomerPayment({
    invoiceId: invB.id,
    invoiceNumber: invB.invoiceNumber,
    customerId: custId6,
    customerName: 'Vaishali Sharma',
    amount: 20400,
    paymentMethod: 'Bank Transfer',
    paymentDate: '2026-10-11',
  });

  const outBFinal = store.getAuthoritativeInvoiceOutstanding('INV-VAISHALI-B');
  const custInvsFinal = store.getInvoices().filter((i) => i.customerId === custId6);
  const totalCustOutFinal = calculateCustomerOutstanding(custInvsFinal);

  assert(outBFinal === 0, 'Test 6: Invoice B outstanding is ₹0', `Got ${outBFinal}`);
  assert(totalCustOutFinal === 0, 'Test 6: Customer total outstanding is ₹0', `Got ${totalCustOutFinal}`);

  // ---------------------------------------------------------------------------
  // TEST 7 — Refresh Consistency Across Reload
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Refresh & Session Consistency ---');
  // Trigger state save
  store.saveAndNotify();
  // Simulate page reload by re-loading tenant state from storage
  store.reloadTenantState();

  const reloadedInvA = store.getInvoices().find((i) => i.id === invA.id);
  const reloadedInvB = store.getInvoices().find((i) => i.id === invB.id);
  const reloadedUdhariA = store.getUdharis().find((u) => u.invoiceId === invA.id || u.id === `UD-${invA.invoiceNumber}`);
  const reloadedUdhariB = store.getUdharis().find((u) => u.invoiceId === invB.id || u.id === `UD-${invB.invoiceNumber}`);

  assert(reloadedInvA?.balanceAmount === 0 && reloadedInvA?.status === 'Paid', 'Test 7: Reloaded Invoice A preserves ₹0 balance & Paid status');
  assert(reloadedInvB?.balanceAmount === 0 && reloadedInvB?.status === 'Paid', 'Test 7: Reloaded Invoice B preserves ₹0 balance & Paid status');
  assert(!reloadedUdhariA || reloadedUdhariA.outstandingAmount === 0, 'Test 7: Reloaded Udhari A preserves ₹0 outstanding');
  assert(!reloadedUdhariB || reloadedUdhariB.outstandingAmount === 0, 'Test 7: Reloaded Udhari B preserves ₹0 outstanding');

  // ---------------------------------------------------------------------------
  // TEST 8 — Duplicate Submission Protection
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: Rapid Double Submission Guard ---');
  const inv8 = store.addInvoice({
    invoiceNumber: 'INV-TEST-008',
    customerId: 'cust-8',
    customerName: 'Test Customer',
    customerPhone: '9876543210',
    date: '2026-10-11',
    dueDate: '2026-10-26',
    items: [{ id: 'item-8', description: 'Product H', quantity: 1, rate: 10000, amount: 10000 }],
    subtotal: 10000,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 10000,
    paidAmount: 0,
    balanceAmount: 10000,
    status: 'Issued',
  });

  const payCode8 = 'PAY-2026-DUPLICATE-GUARD-01';

  // First submission
  const sub1 = store.recordUnifiedCustomerPayment({
    paymentCode: payCode8,
    invoiceId: inv8.id,
    invoiceNumber: inv8.invoiceNumber,
    customerId: 'cust-8',
    customerName: 'Test Customer',
    amount: 10000,
    paymentMethod: 'UPI',
    paymentDate: '2026-10-11',
  });

  assert(sub1.invoice?.balanceAmount === 0, 'Test 8: First submission succeeds and clears balance');

  // Second rapid submission with same paymentCode or against now-settled balance
  let dupError: string | null = null;
  try {
    store.recordUnifiedCustomerPayment({
      paymentCode: payCode8,
      invoiceId: inv8.id,
      invoiceNumber: inv8.invoiceNumber,
      customerId: 'cust-8',
      customerName: 'Test Customer',
      amount: 10000,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-11',
    });
  } catch (e: any) {
    dupError = e.message;
  }

  const paymentsForInv8 = store.getState().payments.filter((p) => p.invoiceId === inv8.id || p.paymentNumber === payCode8);
  assert(paymentsForInv8.length === 1, 'Test 8: No duplicate payment record created', `Found ${paymentsForInv8.length} records`);

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed}/${total} PASSED`);
  console.log('================================================================\n');

  if (passed === total) {
    console.log('🎉 ALL 8 ACCEPTANCE TESTS PASSED WITH 100% SUCCESS!');
  } else {
    console.error(`💥 ${total - passed} TESTS FAILED!`);
    process.exitCode = 1;
  }
}

runMasterTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
