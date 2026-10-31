/**
 * VISTAAR Business OS — Daybook Deduplication & Financial Atomicity Verification
 * 
 * Verifies the 5 Core Business Scenarios:
 *   Scenario A: Fully Paid Invoice (Total ₹10,000, Paid ₹10,000 upfront)
 *   Scenario B: Partially Paid Invoice (Total ₹10,000, Paid ₹6,000 upfront, Balance ₹4,000)
 *   Scenario C: Subsequent Customer / Udhari Payment (Later pays ₹4,000 balance)
 *   Scenario D: Counter Sale (Total ₹3,000, Received ₹3,000)
 *   Scenario E: Retry / Idempotency (Duplicate submission creates 0 extra records)
 */

// Node.js browser environment mocks
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

import { store } from '../src/services/store';
import { daybookService } from '../src/services/supabase/daybookService';
import { customerPaymentService } from '../src/services/supabase/customerPaymentService';
import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { safeGetTenantStorage, safeSaveTenantStorage, safeSaveTenantItem, registerActiveWorkspaceResolver } from '../src/services/supabase/safeStorage';
import { supabaseAuthService } from '../src/services/supabaseAuth';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('================================================================================');
  console.log('⚡ VISTAAR DAYBOOK DEDUPLICATION & FINANCIAL INTEGRITY VERIFICATION SUITE');
  console.log('================================================================================\n');

  const testWsId = '99999999-8888-4777-a666-555555555555';
  safeSaveTenantItem('active_company_id', testWsId);
  registerActiveWorkspaceResolver(() => testWsId);
  (supabaseAuthService as any).getCurrentCompanyId = () => testWsId;
  (supabaseAuthService as any).resolveAuthoritativeWorkspace = async () => testWsId;

  // Clear local daybook
  safeSaveTenantStorage('vistaar_local_daybook_db', []);

  // ---------------------------------------------------------------------------
  // SCENARIO A: Fully Paid Invoice (Total ₹10,000, Paid ₹10,000)
  // ---------------------------------------------------------------------------
  console.log('--- SCENARIO A: Fully Paid Invoice (Total ₹10,000, Paid ₹10,000) ---');
  const invAId = `inv-scen-a-${Date.now()}`;
  const invANum = `INV-2026-A${Math.floor(Math.random() * 9000 + 1000)}`;

  store.addInvoice({
    id: invAId,
    invoiceNumber: invANum,
    customerName: 'Customer Scenario A',
    customerPhone: '9876500001',
    status: 'Paid',
    date: '2026-03-01',
    dueDate: '2026-03-15',
    grandTotal: 10000,
    paidAmount: 10000,
    balanceAmount: 0,
    items: [],
  });

  // Record upfront payment (simulating backend payment synchronization)
  await customerPaymentService.recordCustomerPayment({
    invoiceId: invAId,
    invoiceNumber: invANum,
    customerName: 'Customer Scenario A',
    amount: 10000,
    paymentMethod: 'UPI',
    paymentDate: '2026-03-01',
    isUpfrontInvoicePayment: true,
  });

  const txsA = await daybookService.getTransactions({ search: invANum });
  console.log(`  Found ${txsA.data.length} transactions for Invoice ${invANum}`);
  assert(txsA.data.length === 1, `Exactly ONE Daybook entry exists for Fully Paid Invoice (Actual: ${txsA.data.length})`);

  const entryA = txsA.data[0];
  assert(entryA.referenceNumber === invANum, `Reference number is invoice number ${invANum}`);
  assert(entryA.totalAmount === 10000, `Total amount is ₹10,000 (Actual: ₹${entryA.totalAmount})`);
  assert(entryA.amount === 10000, `Inflow amount is ₹10,000 (Actual: ₹${entryA.amount})`);
  assert(entryA.remainingAmount === 0, `Remaining amount is ₹0 (Actual: ₹${entryA.remainingAmount})`);
  assert(entryA.paymentStatus === 'PAID', `Payment status is 'PAID' (Actual: ${entryA.paymentStatus})`);
  assert(entryA.referenceType === 'INVOICE', `Reference type is 'INVOICE' (Actual: ${entryA.referenceType})`);

  // ---------------------------------------------------------------------------
  // SCENARIO B: Partially Paid Invoice (Total ₹10,000, Paid ₹6,000, Balance ₹4,000)
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO B: Partially Paid Invoice (Total ₹10,000, Paid ₹6,000, Balance ₹4,000) ---');
  const invBId = `inv-scen-b-${Date.now()}`;
  const invBNum = `INV-2026-B${Math.floor(Math.random() * 9000 + 1000)}`;

  store.addInvoice({
    id: invBId,
    invoiceNumber: invBNum,
    customerName: 'Customer Scenario B',
    customerPhone: '9876500002',
    status: 'Partially Paid',
    date: '2026-03-02',
    dueDate: '2026-03-16',
    grandTotal: 10000,
    paidAmount: 6000,
    balanceAmount: 4000,
    items: [],
  });

  await customerPaymentService.recordCustomerPayment({
    invoiceId: invBId,
    invoiceNumber: invBNum,
    customerName: 'Customer Scenario B',
    amount: 6000,
    paymentMethod: 'Cash',
    paymentDate: '2026-03-02',
    isUpfrontInvoicePayment: true,
  });

  const txsB = await daybookService.getTransactions({ search: invBNum });
  console.log(`  Found ${txsB.data.length} transactions for Invoice ${invBNum}`);
  assert(txsB.data.length === 1, `Exactly ONE Daybook entry exists for Partially Paid Invoice (Actual: ${txsB.data.length})`);

  const entryB = txsB.data[0];
  assert(entryB.referenceNumber === invBNum, `Reference number is invoice number ${invBNum}`);
  assert(entryB.totalAmount === 10000, `Total amount is ₹10,000 (Actual: ₹${entryB.totalAmount})`);
  assert(entryB.amount === 6000, `Initial inflow is ₹6,000 (Actual: ₹${entryB.amount})`);
  assert(entryB.remainingAmount === 4000, `Remaining amount is ₹4,000 (Actual: ₹${entryB.remainingAmount})`);
  assert(entryB.paymentStatus === 'PARTIALLY PAID', `Payment status is 'PARTIALLY PAID' (Actual: ${entryB.paymentStatus})`);
  assert(entryB.referenceType === 'INVOICE', `Reference type is 'INVOICE' (Actual: ${entryB.referenceType})`);

  // ---------------------------------------------------------------------------
  // SCENARIO C: Subsequent Customer / Udhari Payment (Pay remaining ₹4,000 later)
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO C: Subsequent Customer / Udhari Payment (Pay remaining ₹4,000 later) ---');
  // Customer comes back on 2026-03-05 and pays the remaining ₹4,000
  const subsequentPayRes = await customerPaymentService.recordCustomerPayment({
    invoiceId: invBId,
    invoiceNumber: invBNum,
    customerName: 'Customer Scenario B',
    amount: 4000,
    paymentMethod: 'UPI',
    paymentDate: '2026-03-05',
    reference: 'UPI-REF-998877',
    notes: 'Cleared remaining balance',
    // isUpfrontInvoicePayment is FALSE (subsequent payment)
  });

  assert(subsequentPayRes.success, 'Subsequent payment recorded successfully');

  const txsC = await daybookService.getTransactions({ search: invBNum });
  console.log(`  Found ${txsC.data.length} transactions for Invoice ${invBNum} after subsequent payment`);
  assert(txsC.data.length === 2, `Exactly TWO Daybook entries exist: one for initial invoice, one for subsequent payment (Actual: ${txsC.data.length})`);

  const initialSaleEntry = txsC.data.find((t) => t.referenceType === 'INVOICE');
  const subsequentPayEntry = txsC.data.find((t) => t.referenceType === 'PAYMENT' || t.transactionType === 'CUSTOMER_PAYMENT');

  assert(!!initialSaleEntry, 'Initial INVOICE sale entry is present');
  assert(!!subsequentPayEntry, 'Subsequent CUSTOMER_PAYMENT entry is present');

  // Verify Initial Entry
  assert(initialSaleEntry!.totalAmount === 10000, `Initial entry totalAmount remains ₹10,000 (Actual: ₹${initialSaleEntry!.totalAmount})`);
  assert(initialSaleEntry!.amount === 6000, `Initial entry inflow REMAINS ₹6,000 (Actual: ₹${initialSaleEntry!.amount})`);
  assert(initialSaleEntry!.remainingAmount === 0, `Initial entry remainingAmount is updated to ₹0 (Actual: ₹${initialSaleEntry!.remainingAmount})`);
  assert(initialSaleEntry!.paymentStatus === 'PAID', `Initial entry status is updated to 'PAID' (Actual: ${initialSaleEntry!.paymentStatus})`);

  // Verify Subsequent Payment Entry
  assert(subsequentPayEntry!.amount === 4000, `Subsequent payment inflow is ₹4,000 (Actual: ₹${subsequentPayEntry!.amount})`);
  assert(subsequentPayEntry!.totalAmount === 10000, `Subsequent payment totalAmount is ₹10,000 (Actual: ₹${subsequentPayEntry!.totalAmount})`);
  assert(subsequentPayEntry!.remainingAmount === 0, `Subsequent payment remainingAmount is ₹0 (Actual: ₹${subsequentPayEntry!.remainingAmount})`);
  assert(subsequentPayEntry!.paymentStatus === 'PAID', `Subsequent payment status is 'PAID' (Actual: ${subsequentPayEntry!.paymentStatus})`);

  const totalInflowsC = initialSaleEntry!.amount + subsequentPayEntry!.amount;
  assert(totalInflowsC === 10000, `Total collected across both entries is exactly ₹10,000 (₹6,000 + ₹4,000 = ₹${totalInflowsC})`);

  // ---------------------------------------------------------------------------
  // SCENARIO D: Counter Sale (Total ₹3,000, Received ₹3,000)
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO D: Counter Sale (Total ₹3,000, Received ₹3,000) ---');
  const csNum = `CS-2026-D${Math.floor(Math.random() * 9000 + 1000)}`;

  const prod = store.addProduct({
    name: 'Hardware Test Part',
    partNumber: `HW-${Date.now()}`,
    sku: `HW-${Date.now()}`,
    buyPrice: 2000,
    sellingPrice: 3000,
    initialStock: 50,
  });

  const cs = store.createCounterSale({
    saleNumber: csNum,
    invoiceNumber: csNum,
    customerName: 'Walk-in Customer D',
    saleDate: '2026-03-03',
    amountReceived: 3000,
    balanceAmount: 0,
    paymentMethod: 'Cash',
    items: [
      {
        productId: prod.id,
        quantity: 1,
        rate: 3000,
      },
    ],
  });

  assert(!!cs, 'Counter sale created successfully');

  const txsD = await daybookService.getTransactions({ search: csNum });
  console.log(`  Found ${txsD.data.length} transactions for Counter Sale ${csNum}`);
  assert(txsD.data.length === 1, `Exactly ONE Daybook entry exists for Counter Sale (Actual: ${txsD.data.length})`);

  const entryD = txsD.data[0];
  assert(entryD.referenceNumber === csNum, `Reference number is counter sale number ${csNum}`);
  assert(entryD.totalAmount === 3000, `Total amount is ₹3,000 (Actual: ₹${entryD.totalAmount})`);
  assert(entryD.amount === 3000, `Inflow amount is ₹3,000 (Actual: ₹${entryD.amount})`);
  assert(entryD.remainingAmount === 0, `Remaining amount is ₹0 (Actual: ₹${entryD.remainingAmount})`);
  assert(entryD.paymentStatus === 'PAID', `Payment status is 'PAID' (Actual: ${entryD.paymentStatus})`);
  assert(entryD.referenceType === 'COUNTER_SALE', `Reference type is 'COUNTER_SALE' (Actual: ${entryD.referenceType})`);

  // ---------------------------------------------------------------------------
  // SCENARIO E: Retry / Idempotency
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO E: Retry / Idempotency ---');
  // Re-submitting the exact same transaction (simulating double-click or network retry)
  await daybookService.recordFinancialTransaction({
    referenceType: 'COUNTER_SALE',
    referenceId: cs.id,
    referenceNumber: csNum,
    transactionType: 'SALE',
    direction: 'IN',
    amount: 3000,
    totalAmount: 3000,
    remainingAmount: 0,
    paymentStatus: 'PAID',
    paymentMode: 'Cash',
    partyName: 'Walk-in Customer D',
    transactionDate: '2026-03-03',
  });

  const txsE = await daybookService.getTransactions({ search: csNum });
  assert(txsE.data.length === 1, `Idempotent retry did NOT create an additional Daybook entry (Actual: ${txsE.data.length})`);

  // ---------------------------------------------------------------------------
  // DATABASE & LOCAL CLEANUP VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- DATABASE & LOCAL CLEANUP VERIFICATION ---');
  // Inject an artificial duplicate record into local daybook to test cleanup utility
  const localDaybook = safeGetTenantStorage<any[]>('vistaar_local_daybook_db', []);
  localDaybook.push({
    id: `db-pay-dup-test`,
    referenceType: 'PAYMENT',
    transactionType: 'CUSTOMER_PAYMENT',
    referenceNumber: csNum,
    referenceId: cs.id,
    amount: 3000,
    totalAmount: 3000,
    remainingAmount: 0,
    paymentStatus: 'PAID',
    transactionDate: '2026-03-03',
  });
  safeSaveTenantStorage('vistaar_local_daybook_db', localDaybook);

  const cleanupRes = await daybookService.cleanDaybookDuplicates();
  console.log(`  Cleaned duplicates count: ${cleanupRes.cleanedCount}`);
  assert(cleanupRes.cleanedCount >= 1, `Cleanup detected and cleaned duplicate entries (Cleaned: ${cleanupRes.cleanedCount})`);

  const txsAfterCleanup = await daybookService.getTransactions({ search: csNum });
  assert(txsAfterCleanup.data.length === 1, `After cleanup, exactly ONE Daybook entry exists for Counter Sale (Actual: ${txsAfterCleanup.data.length})`);

  console.log('\n================================================================================');
  console.log(`🏁 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Test suite execution failed:', err);
  process.exit(1);
});
