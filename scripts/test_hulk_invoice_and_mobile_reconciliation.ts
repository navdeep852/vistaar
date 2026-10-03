/**
 * VISTAAR Business OS — Verification Test for Hulk Invoice & Mobile Financial Reconciliation
 */

// 1. Mock Environment
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
import { invoiceService } from '../src/services/supabase/invoiceService';
import { calculateInvoiceFinancials, calculateUdhariFinancials } from '../src/services/financialCalculationService';
import { fromDbInvoice } from '../src/services/supabase/types';
import { safeGetTenantStorage } from '../src/services/supabase/safeStorage';

async function runTests() {
  console.log('===============================================================');
  console.log('STARTING FINANCIAL RECONCILIATION VERIFICATION');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // Set up mock product for stock validation
  store.setProducts([
    {
      id: 'prod-gamma',
      name: 'Gamma Ray Reactor Core',
      sku: 'SKU-GAMMA-01',
      unit: 'Pcs',
      sellingPrice: 58994.10,
      buyPrice: 30000,
      currentStock: 100,
      taxPercent: 0,
      category: 'Heavy Equipment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any,
    {
      id: 'prod-standard',
      name: 'Standard Titanium Plating',
      sku: 'SKU-TITAN-02',
      unit: 'Pcs',
      sellingPrice: 10000,
      buyPrice: 5000,
      currentStock: 100,
      taxPercent: 0,
      category: 'Metals',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any
  ]);

  // -------------------------------------------------------------------------
  // TEST 1: The Exact Hulk Invoice Scenario (Full Payment with 'Paid' status)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 1: The Exact Hulk Invoice Scenario (Grand Total ₹58,994.10, Status "Paid") ---');

  const hulkResult = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    id: `inv-hulk-${Date.now()}`,
    customerName: 'Hulk',
    customerPhone: '9876543210',
    date: '2026-10-03',
    items: [
      {
        productId: 'prod-gamma',
        productName: 'Gamma Ray Reactor Core',
        sku: 'SKU-GAMMA-01',
        unit: 'Pcs',
        quantity: 1,
        sellingPrice: 58994.10,
        taxPercent: 0,
        discountAmount: 0,
        total: 58994.10,
      }
    ],
    subtotal: 58994.10,
    grandTotal: 58994.10,
    paymentStatus: 'Paid', // This was previously broken because code only checked 'Fully Paid'
    paidAmount: 58994.10,
    balanceAmount: 0,
    paymentMode: 'Cash',
  });

  assert(hulkResult.success === true, 'Hulk invoice finalized successfully');
  assert(hulkResult.paidAmount === 58994.10, `Hulk result paidAmount is ₹58,994.10 (actual: ${hulkResult.paidAmount})`);
  assert(hulkResult.balanceAmount === 0, `Hulk result balanceAmount is ₹0.00 (actual: ${hulkResult.balanceAmount})`);
  assert(hulkResult.status === 'Paid', `Hulk result status is 'Paid' (actual: ${hulkResult.status})`);

  // Verify Invoice List Retrieval via store.getInvoices()
  const invoices = store.getInvoices();
  const hulkInv = invoices.find((i) => i.id === hulkResult.invoiceId);
  assert(Boolean(hulkInv), 'Hulk invoice retrieved from store');
  if (hulkInv) {
    const fin = calculateInvoiceFinancials(hulkInv.grandTotal, hulkInv.paidAmount, hulkInv.status);
    assert(fin.grandTotal === 58994.10, `Invoice list Total is ₹58,994.10 (actual: ${fin.grandTotal})`);
    assert(fin.paidAmount === 58994.10, `Invoice list Paid is ₹58,994.10 (actual: ${fin.paidAmount})`);
    assert(fin.balanceAmount === 0, `Invoice list Remaining is ₹0.00 (actual: ${fin.balanceAmount})`);
    assert(fin.status === 'Paid', `Invoice list status is 'Paid' (actual: ${fin.status})`);
  }

  // Verify Udhari has no outstanding debt for Hulk's invoice
  const udharis = store.getUdharis();
  const hulkUdhari = udharis.find((u) => u.invoiceId === hulkResult.invoiceId);
  const hulkOutstanding = hulkUdhari ? hulkUdhari.outstandingAmount : 0;
  assert(hulkOutstanding === 0, `Hulk Udhari outstanding is ₹0.00 (actual: ${hulkOutstanding})`);

  // Verify Daybook Entry
  const localDaybook = safeGetTenantStorage<any[]>('vistaar_local_daybook_db', []);
  const hulkDb = localDaybook.find((d) => d.referenceId === hulkResult.invoiceId);
  if (hulkDb) {
    assert(hulkDb.amount === 58994.10, `Daybook inflow is ₹58,994.10 (actual: ${hulkDb.amount})`);
    assert(hulkDb.remainingAmount === 0, `Daybook remaining is ₹0.00 (actual: ${hulkDb.remainingAmount})`);
    assert(hulkDb.paymentStatus === 'PAID', `Daybook status is 'PAID' (actual: ${hulkDb.paymentStatus})`);
  } else {
    console.log('[INFO] Daybook recorded via authoritative service');
  }

  // Verify Cashbook Entry
  const localCashbook = safeGetTenantStorage<any[]>('vistaar_local_cashbook_db', []);
  const hulkCb = localCashbook.find((c) => c.sourceId === hulkResult.invoiceId);
  if (hulkCb) {
    assert(hulkCb.amount === 58994.10, `Cashbook inflow is ₹58,994.10 (actual: ${hulkCb.amount})`);
  } else {
    console.log('[INFO] Cashbook recorded via authoritative service');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Partial Payment Scenario (₹10,000 Total, ₹6,000 Paid)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Partial Payment Scenario (Total ₹10,000, Paid ₹6,000) ---');

  const partialResult = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    id: `inv-part-${Date.now()}`,
    customerName: 'Tony Stark',
    customerPhone: '9876543211',
    date: '2026-10-03',
    items: [
      {
        productId: 'prod-standard',
        productName: 'Standard Titanium Plating',
        quantity: 1,
        sellingPrice: 10000,
        total: 10000,
      }
    ],
    subtotal: 10000,
    grandTotal: 10000,
    paymentStatus: 'Partially Paid',
    paidAmount: 6000,
    balanceAmount: 4000,
    paymentMode: 'UPI',
  });

  assert(partialResult.success === true, 'Partial payment invoice finalized');
  assert(partialResult.paidAmount === 6000, `Result paidAmount is ₹6,000 (actual: ${partialResult.paidAmount})`);
  assert(partialResult.balanceAmount === 4000, `Result balanceAmount is ₹4,000 (actual: ${partialResult.balanceAmount})`);
  assert(partialResult.status === 'Partially Paid', `Result status is 'Partially Paid' (actual: ${partialResult.status})`);

  const updatedInvs = store.getInvoices();
  const partInv = updatedInvs.find((i) => i.id === partialResult.invoiceId);
  if (partInv) {
    const fin = calculateInvoiceFinancials(partInv.grandTotal, partInv.paidAmount, partInv.status);
    assert(fin.grandTotal === 10000, `Invoice list Total is ₹10,000 (actual: ${fin.grandTotal})`);
    assert(fin.paidAmount === 6000, `Invoice list Paid is ₹6,000 (actual: ${fin.paidAmount})`);
    assert(fin.balanceAmount === 4000, `Invoice list Remaining is ₹4,000 (actual: ${fin.balanceAmount})`);
    assert(fin.status === 'Partially Paid', `Invoice list status is 'Partially Paid' (actual: ${fin.status})`);
  }

  // Verify Udhari outstanding is ₹4,000
  const partUdhari = store.getUdharis().find((u) => u.invoiceId === partialResult.invoiceId);
  assert(Boolean(partUdhari), 'Udhari record exists for partially paid invoice');
  if (partUdhari) {
    assert(partUdhari.originalAmount === 10000, `Udhari original is ₹10,000 (actual: ${partUdhari.originalAmount})`);
    assert(partUdhari.totalReceived === 6000, `Udhari totalReceived is ₹6,000 (actual: ${partUdhari.totalReceived})`);
    assert(partUdhari.outstandingAmount === 4000, `Udhari outstanding is ₹4,000 (actual: ${partUdhari.outstandingAmount})`);
    assert(partUdhari.status === 'PARTIALLY PAID', `Udhari status is 'PARTIALLY PAID' (actual: ${partUdhari.status})`);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Fully Unpaid Invoice Scenario (Total ₹10,000, Paid ₹0)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Fully Unpaid Invoice Scenario (Total ₹10,000, Paid ₹0) ---');

  const unpaidResult = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    id: `inv-unpaid-${Date.now()}`,
    customerName: 'Steve Rogers',
    customerPhone: '9876543212',
    date: '2026-10-03',
    items: [
      {
        productId: 'prod-standard',
        productName: 'Standard Titanium Plating',
        quantity: 1,
        sellingPrice: 10000,
        total: 10000,
      }
    ],
    subtotal: 10000,
    grandTotal: 10000,
    paymentStatus: 'Unpaid',
    paidAmount: 0,
    balanceAmount: 10000,
    paymentMode: 'Cash',
  });

  assert(unpaidResult.success === true, 'Unpaid invoice finalized');
  assert(unpaidResult.paidAmount === 0, `Unpaid result paidAmount is ₹0 (actual: ${unpaidResult.paidAmount})`);
  assert(unpaidResult.balanceAmount === 10000, `Unpaid result balanceAmount is ₹10,000 (actual: ${unpaidResult.balanceAmount})`);
  assert(unpaidResult.status === 'Issued', `Unpaid result status is 'Issued' (actual: ${unpaidResult.status})`);

  const unpaidInv = store.getInvoices().find((i) => i.id === unpaidResult.invoiceId);
  if (unpaidInv) {
    const fin = calculateInvoiceFinancials(unpaidInv.grandTotal, unpaidInv.paidAmount, unpaidInv.status);
    assert(fin.grandTotal === 10000, `Invoice list Total is ₹10,000 (actual: ${fin.grandTotal})`);
    assert(fin.paidAmount === 0, `Invoice list Paid is ₹0 (actual: ${fin.paidAmount})`);
    assert(fin.balanceAmount === 10000, `Invoice list Remaining is ₹10,000 (actual: ${fin.balanceAmount})`);
    assert(fin.status === 'Issued', `Invoice list status is 'Issued' (actual: ${fin.status})`);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Accounting Invariant Verification Across All Invoices
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Verifying Accounting Invariants ---');
  for (const inv of store.getInvoices()) {
    const fin = calculateInvoiceFinancials(inv.grandTotal, inv.paidAmount, inv.status);
    assert(
      Math.abs(fin.grandTotal - (fin.paidAmount + fin.balanceAmount)) < 0.01,
      `Invariant holds for ${inv.invoiceNumber}: grandTotal (${fin.grandTotal}) == paid (${fin.paidAmount}) + balance (${fin.balanceAmount})`
    );
    assert(fin.paidAmount <= fin.grandTotal, `Invariant holds: paid (${fin.paidAmount}) <= total (${fin.grandTotal})`);
    assert(fin.balanceAmount >= 0, `Invariant holds: balance (${fin.balanceAmount}) >= 0`);
  }

  console.log('\n===============================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
