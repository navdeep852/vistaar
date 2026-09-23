/**
 * VISTAAR Business OS — Daybook Financial Calculation Root Cause Test Suite
 * 
 * Verifies all 8 required scenarios from the specification:
 * Test 1 — Full payment (17700 -> 17700 -> Remaining 0)
 * Test 2 — Partial payment (17700 -> 10700 -> Remaining 7000)
 * Test 3 — Remaining payment (Multiple payments: P1=10700/7000, P2=7000/0)
 * Test 4 — Unpaid (17700 -> 0 -> Remaining 17700)
 * Test 5 — Udhari synchronization (Invoice balance === Udhari outstanding === Daybook remaining)
 * Test 6 — Cashbook inflow (10700, NOT 17700)
 * Test 7 — Quotation conversion (17700 -> Invoice 17700/10700/7000 -> Daybook 17700/10700/7000)
 * Test 8 — Payment on later date with Date Filter ('today' finds payment dated today)
 * Test 9 — Non-hardcoded arbitrary numbers (125000 -> 75000/50000 -> 50000/0)
 */

// 1. Setup Node.js browser mocks for headless execution
if (typeof globalThis.localStorage === 'undefined') {
  const memStore = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => memStore.get(key) || null,
    setItem: (key: string, value: string) => { memStore.set(key, String(value)); },
    removeItem: (key: string) => { memStore.delete(key); },
    clear: () => { memStore.clear(); },
    key: (index: number) => Array.from(memStore.keys())[index] || null,
    get length() { return memStore.size; },
  } as any;
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: globalThis.localStorage,
  };
}

if (typeof (globalThis as any).CustomEvent === 'undefined') {
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, params?: any) {
      this.type = type;
      this.detail = params?.detail;
    }
  };
}

// 2. Imports
import { store } from '../src/services/store';
import { daybookService } from '../src/services/supabase/daybookService';
import { safeGetTenantStorage } from '../src/services/supabase/safeStorage';
import {
  calculateDaybookFinancials,
  calculateInvoiceFinancials,
  calculateUdhariFinancials,
} from '../src/services/financialCalculationService';

// Test runner helper
let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName}`, details ? details : '');
    failedCount++;
  }
}

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log(' VISTAAR DAYBOOK FINANCIAL ROOT CAUSE VERIFICATION SUITE');
  console.log('===============================================================\n');

  const todayStr = new Date().toISOString().split('T')[0];

  // --------------------------------------------------------------------------
  // TEST 1 — Full payment
  // Invoice Total = 17700, Payment = 17700
  // Expected: Daybook Total = 17700, Inflow = 17700, Remaining = 0
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Full Payment ---');
  {
    const invTotal = 17700;
    const paymentAmt = 17700;
    const dbFin = calculateDaybookFinancials(invTotal, paymentAmt, paymentAmt);

    assert(dbFin.totalAmount === 17700, 'Test 1 - Daybook Total matches Invoice Grand Total (17700)', { actual: dbFin.totalAmount });
    assert(dbFin.amount === 17700, 'Test 1 - Daybook Inflow matches payment transaction amount (17700)', { actual: dbFin.amount });
    assert(dbFin.remainingAmount === 0, 'Test 1 - Daybook Remaining Amount is 0 for full payment', { actual: dbFin.remainingAmount });
    assert(dbFin.paymentStatus === 'PAID', 'Test 1 - Payment Status is PAID', { actual: dbFin.paymentStatus });
  }

  // --------------------------------------------------------------------------
  // TEST 2 — Partial payment
  // Invoice Total = 17700, Payment = 10700
  // Expected: Daybook Total = 17700, Inflow = 10700, Remaining = 7000
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Partial Payment ---');
  {
    const invTotal = 17700;
    const paymentAmt = 10700;
    const dbFin = calculateDaybookFinancials(invTotal, paymentAmt, paymentAmt);

    assert(dbFin.totalAmount === 17700, 'Test 2 - Daybook Total is 17700 (NOT payment amount 10700)', { actual: dbFin.totalAmount });
    assert(dbFin.amount === 10700, 'Test 2 - Daybook Inflow is 10700', { actual: dbFin.amount });
    assert(dbFin.remainingAmount === 7000, 'Test 2 - Daybook Remaining Amount is 7000 (17700 - 10700)', { actual: dbFin.remainingAmount });
    assert(dbFin.paymentStatus === 'PARTIALLY PAID', 'Test 2 - Payment Status is PARTIALLY PAID', { actual: dbFin.paymentStatus });
  }

  // --------------------------------------------------------------------------
  // TEST 3 — Multiple Payments (P1 = 10700, P2 = 7000)
  // Expected:
  // Payment 1: Total = 17700, Inflow = 10700, Remaining = 7000
  // Payment 2: Total = 17700, Inflow = 7000, Remaining = 0
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Multiple Payments Scenario ---');
  {
    const invTotal = 17700;
    const p1Amt = 10700;
    const p2Amt = 7000;

    // Payment 1
    const p1Fin = calculateDaybookFinancials(invTotal, p1Amt, p1Amt);
    assert(p1Fin.totalAmount === 17700, 'Test 3 - Payment 1 Total is 17700', { actual: p1Fin.totalAmount });
    assert(p1Fin.amount === 10700, 'Test 3 - Payment 1 Inflow is 10700', { actual: p1Fin.amount });
    assert(p1Fin.remainingAmount === 7000, 'Test 3 - Payment 1 Remaining is 7000', { actual: p1Fin.remainingAmount });

    // Payment 2 (cumulative paid = 10700 + 7000 = 17700)
    const cumulativeAfterP2 = p1Amt + p2Amt;
    const p2Fin = calculateDaybookFinancials(invTotal, p2Amt, cumulativeAfterP2);
    assert(p2Fin.totalAmount === 17700, 'Test 3 - Payment 2 Total remains 17700 (NOT 7000)', { actual: p2Fin.totalAmount });
    assert(p2Fin.amount === 7000, 'Test 3 - Payment 2 Inflow is 7000', { actual: p2Fin.amount });
    assert(p2Fin.remainingAmount === 0, 'Test 3 - Payment 2 Remaining is 0', { actual: p2Fin.remainingAmount });
    assert(p2Fin.paymentStatus === 'PAID', 'Test 3 - Payment 2 Status is PAID', { actual: p2Fin.paymentStatus });
  }

  // --------------------------------------------------------------------------
  // TEST 4 — Unpaid Invoice
  // Invoice Total = 17700, Payment = 0
  // Expected: Total = 17700, Inflow = 0, Remaining = 17700
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Unpaid Invoice ---');
  {
    const invTotal = 17700;
    const dbFin = calculateDaybookFinancials(invTotal, 0, 0);

    assert(dbFin.totalAmount === 17700, 'Test 4 - Unpaid Invoice Total is 17700 (NOT 0)', { actual: dbFin.totalAmount });
    assert(dbFin.amount === 0, 'Test 4 - Unpaid Invoice Inflow is 0', { actual: dbFin.amount });
    assert(dbFin.remainingAmount === 17700, 'Test 4 - Unpaid Invoice Remaining is 17700', { actual: dbFin.remainingAmount });
    assert(dbFin.paymentStatus === 'UNPAID', 'Test 4 - Payment Status is UNPAID', { actual: dbFin.paymentStatus });
  }

  // --------------------------------------------------------------------------
  // TEST 5 — Cross-Module Agreement (Invoice === Udhari === Daybook)
  // For Grand Total = 17700, Paid = 10700:
  // Invoice balance === Udhari outstanding === Daybook remaining === 7000
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Cross-Module Udhari & Invoice Agreement ---');
  {
    const total = 17700;
    const paid = 10700;

    const invFin = calculateInvoiceFinancials(total, paid);
    const udFin = calculateUdhariFinancials(total, paid);
    const dbFin = calculateDaybookFinancials(total, paid, paid);

    assert(invFin.balanceAmount === 7000, 'Test 5 - Invoice balance is 7000', { actual: invFin.balanceAmount });
    assert(udFin.outstandingAmount === 7000, 'Test 5 - Udhari outstanding is 7000', { actual: udFin.outstandingAmount });
    assert(dbFin.remainingAmount === 7000, 'Test 5 - Daybook remaining is 7000', { actual: dbFin.remainingAmount });
    assert(
      invFin.balanceAmount === udFin.outstandingAmount && udFin.outstandingAmount === dbFin.remainingAmount,
      'Test 5 - Invariant: Invoice balance === Udhari outstanding === Daybook remaining',
      { invBal: invFin.balanceAmount, udBal: udFin.outstandingAmount, dbBal: dbFin.remainingAmount }
    );
  }

  // --------------------------------------------------------------------------
  // TEST 6 — Cashbook Inflow Integrity
  // For ₹10,700 payment on ₹17,700 invoice:
  // Cashbook inflow must be strictly ₹10,700, NOT ₹17,700
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Cashbook Inflow Integrity ---');
  {
    // Setup test invoice in store
    const testInvId = 'inv-cb-test-01';
    const testInvNum = 'INV-2026-TEST6';
    store.addInvoice({
      id: testInvId,
      invoiceNumber: testInvNum,
      customerId: 'cust-cb-01',
      customerName: 'Test Cashbook Customer',
      customerPhone: '9876543210',
      date: todayStr,
      dueDate: todayStr,
      items: [{ productName: 'Item 1', quantity: 1, sellingPrice: 17700, total: 17700 } as any],
      subtotal: 17700,
      grandTotal: 17700,
      paidAmount: 0,
      balanceAmount: 17700,
      status: 'Issued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Record customer payment through store
    store.recordUnifiedCustomerPayment({
      invoiceId: testInvId,
      invoiceNumber: testInvNum,
      amount: 10700,
      paymentMethod: 'Cash',
      paymentDate: todayStr,
    });

    const localCashbook = safeGetTenantStorage<any>('vistaar_local_cashbook_entries_db', []);
    const matchingCb = localCashbook.find((cb: any) => cb.referenceNumber === testInvNum || cb.description?.includes(testInvNum));

    assert(!!matchingCb, 'Test 6 - Cashbook entry created for payment');
    if (matchingCb) {
      assert(matchingCb.amount === 10700, 'Test 6 - Cashbook Inflow is ₹10,700 (NOT ₹17,700)', { actual: matchingCb.amount });
      assert(matchingCb.direction === 'IN', 'Test 6 - Cashbook direction is IN', { actual: matchingCb.direction });
    }
  }

  // --------------------------------------------------------------------------
  // TEST 7 — Quotation Conversion & Complete Data Flow
  // Quotation Total = 17700 -> Convert with Partial Payment = 10700
  // Expected:
  // Invoice Total = 17700, Paid = 10700, Balance = 7000
  // Daybook Total = 17700, Inflow = 10700, Remaining = 7000
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Quotation Conversion & Daybook Flow ---');
  {
    const qtTotal = 17700;
    const initialPayment = 10700;

    // Simulate Quotation Conversion
    const convertedInvId = 'inv-qt-conv-01';
    const convertedInvNum = 'INV-2026-QTCONV';
    const invFin = calculateInvoiceFinancials(qtTotal, initialPayment);

    store.addInvoice({
      id: convertedInvId,
      invoiceNumber: convertedInvNum,
      customerId: 'cust-qt-01',
      customerName: 'Quotation Customer',
      customerPhone: '9876543210',
      date: todayStr,
      dueDate: todayStr,
      items: [{ productName: 'Item A', quantity: 1, sellingPrice: 17700, total: 17700 } as any],
      subtotal: 17700,
      grandTotal: qtTotal,
      paidAmount: 0,
      balanceAmount: qtTotal,
      status: 'Issued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Record initial payment from quotation conversion
    store.recordUnifiedCustomerPayment({
      paymentId: 'pay-qt-conv-01',
      paymentCode: 'PAY-QTCONV-01',
      invoiceId: convertedInvId,
      invoiceNumber: convertedInvNum,
      amount: initialPayment,
      paymentMethod: 'UPI',
      paymentDate: todayStr,
    });

    const convertedInv = store.getInvoices().find((i) => i.id === convertedInvId);
    assert(!!convertedInv, 'Test 7 - Converted invoice exists in store');
    assert(convertedInv?.grandTotal === 17700, 'Test 7 - Converted Invoice Grand Total is 17700', { actual: convertedInv?.grandTotal });
    assert(convertedInv?.paidAmount === 10700, 'Test 7 - Converted Invoice Paid is 10700', { actual: convertedInv?.paidAmount });
    assert(convertedInv?.balanceAmount === 7000, 'Test 7 - Converted Invoice Balance is 7000', { actual: convertedInv?.balanceAmount });

    // Verify Daybook transactions retrieval
    const dbRes = await daybookService.getTransactions({ search: convertedInvNum });
    const payTx = dbRes.data.find((t) => t.referenceNumber === convertedInvNum && t.referenceType === 'PAYMENT');

    assert(!!payTx, 'Test 7 - Daybook payment transaction found for converted invoice');
    if (payTx) {
      assert(payTx.totalAmount === 17700, 'Test 7 - Daybook Total is 17700 (Gross Invoice Total)', { actual: payTx.totalAmount });
      assert(payTx.amount === 10700, 'Test 7 - Daybook Inflow is 10700 (Actual payment received)', { actual: payTx.amount });
      assert(payTx.remainingAmount === 7000, 'Test 7 - Daybook Remaining Amount is 7000', { actual: payTx.remainingAmount });
    }
  }

  // --------------------------------------------------------------------------
  // TEST 8 — Payment on Later Date & Date Filters
  // Invoice Date: 2026-09-01 (Earlier)
  // Payment Date: Today (2026-09-23)
  // Filter: 'today'
  // Expected: Payment appears in Daybook under today filter with Total 17700, Inflow 10700, Remaining 7000
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Payment on Later Date & Date Filters ---');
  {
    const laterInvId = 'inv-later-date-01';
    const laterInvNum = 'INV-2026-LATER';
    const earlierDate = '2026-09-01';

    store.addInvoice({
      id: laterInvId,
      invoiceNumber: laterInvNum,
      customerId: 'cust-later-01',
      customerName: 'Later Date Customer',
      customerPhone: '9876543210',
      date: earlierDate,
      dueDate: earlierDate,
      items: [{ productName: 'Item B', quantity: 1, sellingPrice: 17700, total: 17700 } as any],
      subtotal: 17700,
      grandTotal: 17700,
      paidAmount: 0,
      balanceAmount: 17700,
      status: 'Issued',
      createdAt: earlierDate,
      updatedAt: earlierDate,
    });

    // Record payment today
    store.recordUnifiedCustomerPayment({
      paymentId: 'pay-later-01',
      paymentCode: 'PAY-LATER-01',
      invoiceId: laterInvId,
      invoiceNumber: laterInvNum,
      amount: 10700,
      paymentMethod: 'Bank Transfer',
      paymentDate: todayStr,
    });

    // Query Daybook with dateRange: 'today'
    const todayRes = await daybookService.getTransactions({ dateRange: 'today', search: laterInvNum });
    const todayPayTx = todayRes.data.find((t) => t.referenceNumber === laterInvNum && t.referenceType === 'PAYMENT');

    assert(!!todayPayTx, 'Test 8 - Payment transaction appears in Daybook under "today" filter');
    if (todayPayTx) {
      assert(todayPayTx.transactionDate === todayStr, 'Test 8 - Transaction date is today', { actual: todayPayTx.transactionDate });
      assert(todayPayTx.totalAmount === 17700, 'Test 8 - Total shows original invoice total 17700', { actual: todayPayTx.totalAmount });
      assert(todayPayTx.amount === 10700, 'Test 8 - Inflow shows payment amount 10700', { actual: todayPayTx.amount });
      assert(todayPayTx.remainingAmount === 7000, 'Test 8 - Remaining amount shows 7000', { actual: todayPayTx.remainingAmount });
    }
  }

  // --------------------------------------------------------------------------
  // TEST 9 — Non-Hardcoded Arbitrary Numbers
  // Verify with large arbitrary values:
  // Invoice Total = ₹1,25,000, Payment 1 = ₹75,000, Payment 2 = ₹50,000
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Arbitrary Large Numbers Verification ---');
  {
    const arbTotal = 125000;
    const arbP1 = 75000;
    const arbP2 = 50000;

    const p1Fin = calculateDaybookFinancials(arbTotal, arbP1, arbP1);
    assert(p1Fin.totalAmount === 125000, 'Test 9 - Payment 1 Total is 125000', { actual: p1Fin.totalAmount });
    assert(p1Fin.amount === 75000, 'Test 9 - Payment 1 Inflow is 75000', { actual: p1Fin.amount });
    assert(p1Fin.remainingAmount === 50000, 'Test 9 - Payment 1 Remaining is 50000', { actual: p1Fin.remainingAmount });

    const p2Fin = calculateDaybookFinancials(arbTotal, arbP2, arbP1 + arbP2);
    assert(p2Fin.totalAmount === 125000, 'Test 9 - Payment 2 Total is 125000', { actual: p2Fin.totalAmount });
    assert(p2Fin.amount === 50000, 'Test 9 - Payment 2 Inflow is 50000', { actual: p2Fin.amount });
    assert(p2Fin.remainingAmount === 0, 'Test 9 - Payment 2 Remaining is 0', { actual: p2Fin.remainingAmount });
    assert(p2Fin.paymentStatus === 'PAID', 'Test 9 - Payment 2 Status is PAID', { actual: p2Fin.paymentStatus });
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(` RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log('===============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
