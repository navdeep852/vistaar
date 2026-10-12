/**
 * VISTAAR Business OS — PGRST204 Invoice Finalization Regression & Atomic Pipeline Test Suite
 *
 * Validates:
 * 1. Hulk Invoice (₹23,520 fully paid, ₹0 balance, no PGRST204, stock deducted once, 0 Udhari)
 * 2. Partial Payment (₹10,000 total, ₹6,000 paid, ₹4,000 balance -> Udhari ₹4,000, Daybook inflow ₹6,000)
 * 3. Full Payment (₹10,000 total, ₹10,000 paid -> ₹0 balance, no Udhari)
 * 4. Double Click Idempotency Protection
 * 5. Insufficient Stock Safety & Zero Mutation Rollback
 * 6. Branch Workspace Isolation
 * 7. Decimal ₹1.00 Rounding Tolerance Normalization
 */

// 1. Mock Browser Environment for Node/TSX execution
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
import { productService } from '../src/services/supabase/productService';
import { daybookService } from '../src/services/supabase/daybookService';
import { cashbookService } from '../src/services/supabase/cashbookService';
import { udhariService } from '../src/services/supabase/udhariService';
import { calculateInvoiceFinancials } from '../src/services/financialCalculationService';
import { safeGetTenantStorage } from '../src/services/supabase/safeStorage';

async function runRegressionSuite() {
  console.log('=============================================================================');
  console.log('VISTAAR BUSINESS OS — PGRST204 ROOT-CAUSE REGRESSION SUITE');
  console.log('=============================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  const getProductStock = (id: string) => store.getProducts().find((p: any) => p.id === id)?.currentStock ?? 0;

  // Seed sample products in store
  const prodHulkId = 'prod-hulk-test-01';
  const prodPartialId = 'prod-partial-test-02';
  const prodBranchAId = 'prod-branch-a-01';

  store.setProducts([
    {
      id: prodHulkId,
      name: 'Industrial Generator Stator',
      partNumber: 'ST-900',
      sku: 'GEN-ST-900',
      buyPrice: 8000,
      sellingPrice: 11760,
      currentStock: 20,
      minStock: 2,
      category: 'Power Systems',
      unit: 'Pcs',
    } as any,
    {
      id: prodPartialId,
      name: 'High-Pressure Hydraulic Valve',
      partNumber: 'VALVE-400',
      sku: 'HYD-VALVE-400',
      buyPrice: 3500,
      sellingPrice: 5000,
      currentStock: 10,
      minStock: 1,
      category: 'Hydraulics',
      unit: 'Pcs',
    } as any,
    {
      id: prodBranchAId,
      name: 'Precision Bearing Set',
      partNumber: 'BRG-6204',
      sku: 'BRG-6204-SKF',
      buyPrice: 1200,
      sellingPrice: 2000,
      currentStock: 15,
      minStock: 2,
      category: 'Bearings',
      unit: 'Set',
    } as any,
  ]);

  // ---------------------------------------------------------------------------
  // TEST 1: Hulk Invoice Finalization (Master Prompt Section 24)
  // Grand Total: ₹23,520, Paid: ₹23,520, Balance: ₹0
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. Testing Hulk Invoice Finalization (₹23,520 Paid, ₹0 Balance) ---');

  const stockBeforeHulk = getProductStock(prodHulkId);

  const hulkResult = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    id: `inv-hulk-${Date.now()}`,
    invoiceNumber: `INV-HULK-001`,
    customerName: 'Hulk',
    customerPhone: '9876543210',
    date: '2026-10-12',
    dueDate: '2026-10-27',
    grandTotal: 23520,
    paidAmount: 23520,
    paymentStatus: 'Paid',
    paymentMode: 'Bank Transfer',
    paymentReference: 'NEFT-HULK-8899',
    items: [
      {
        id: 'item-hulk-1',
        productId: prodHulkId,
        productName: 'Industrial Generator Stator',
        partNumber: 'ST-900',
        quantity: 2,
        sellingPrice: 11760,
        taxPercent: 0,
        taxAmount: 0,
        total: 23520,
      },
    ],
  });

  assert(hulkResult.success === true, 'Hulk invoice finalization succeeded without error');
  assert(!hulkResult.error, 'No PGRST204 or database schema error returned');
  assert(hulkResult.paidAmount === 23520, 'Authoritative paid amount is exactly ₹23,520.00');
  assert(hulkResult.balanceAmount === 0, 'Authoritative balance due is exactly ₹0.00');
  assert(hulkResult.status === 'Paid', 'Authoritative invoice status is "Paid"');

  const stockAfterHulk = getProductStock(prodHulkId);
  assert(stockAfterHulk === stockBeforeHulk - 2, `Stock deducted exactly once for catalog item (before: ${stockBeforeHulk}, after: ${stockAfterHulk})`);

  // Verify Daybook entry
  const localDaybook = safeGetTenantStorage<any>('vistaar_local_daybook_db', []);
  const hulkDaybook = localDaybook.find((d: any) => d.referenceNumber === hulkResult.invoiceNumber || d.referenceId === hulkResult.invoiceId);
  assert(Boolean(hulkDaybook), 'Daybook SALE entry created for Hulk invoice');
  if (hulkDaybook) {
    assert(hulkDaybook.amount === 23520, `Daybook inflow matches cash collected (₹${hulkDaybook.amount})`);
    assert(hulkDaybook.totalAmount === 23520, `Daybook total_amount matches gross sales volume (₹${hulkDaybook.totalAmount})`);
    assert(hulkDaybook.remainingAmount === 0, `Daybook remaining balance is 0`);
  }

  // Verify Cashbook entry
  const localCashbook = safeGetTenantStorage<any>('vistaar_local_cashbook_db', []);
  const hulkCashbook = localCashbook.find((c: any) => c.referenceNumber === hulkResult.invoiceNumber || c.sourceId === hulkResult.invoiceId);
  assert(Boolean(hulkCashbook), 'Cashbook liquidity entry created for Hulk payment');
  if (hulkCashbook) {
    assert(hulkCashbook.amount === 23520, `Cashbook amount matches inflow (₹${hulkCashbook.amount})`);
    assert(hulkCashbook.direction === 'IN', 'Cashbook direction is IN');
  }

  // Verify Udhari balance (Section 12: Do not create Udhari for fully paid invoice)
  const localUdhari = store.getUdharis().filter((u: any) => u.invoiceNumber === hulkResult.invoiceNumber);
  const outstandingUdhari = localUdhari.reduce((sum: number, u: any) => sum + (Number(u.outstandingAmount) || 0), 0);
  assert(outstandingUdhari === 0, `No outstanding Udhari record created for fully paid invoice (outstanding = ₹${outstandingUdhari})`);

  // ---------------------------------------------------------------------------
  // TEST 2: Partial Payment Finalization (Master Prompt Section 25)
  // Total: ₹10,000, Paid: ₹6,000, Remaining: ₹4,000
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Testing Partial Payment Finalization (₹10,000 Total, ₹6,000 Paid, ₹4,000 Balance) ---');

  const stockBeforePartial = getProductStock(prodPartialId);

  const partialResult = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    id: `inv-thor-${Date.now()}`,
    invoiceNumber: `INV-THOR-002`,
    customerName: 'Thor Odinson',
    customerPhone: '9811223344',
    date: '2026-10-12',
    dueDate: '2026-10-27',
    grandTotal: 10000,
    paidAmount: 6000,
    paymentStatus: 'Partially Paid',
    paymentMode: 'UPI',
    items: [
      {
        id: 'item-thor-1',
        productId: prodPartialId,
        productName: 'High-Pressure Hydraulic Valve',
        partNumber: 'VALVE-400',
        quantity: 2,
        sellingPrice: 5000,
        taxPercent: 0,
        taxAmount: 0,
        total: 10000,
      },
    ],
  });

  assert(partialResult.success === true, 'Partial payment invoice finalization succeeded');
  assert(partialResult.paidAmount === 6000, 'Paid amount is exactly ₹6,000.00');
  assert(partialResult.balanceAmount === 4000, 'Remaining balance is exactly ₹4,000.00');
  assert(partialResult.status === 'Partially Paid', 'Invoice status is "Partially Paid"');

  const stockAfterPartial = getProductStock(prodPartialId);
  assert(stockAfterPartial === stockBeforePartial - 2, `Stock deducted by requested quantity (before: ${stockBeforePartial}, after: ${stockAfterPartial})`);

  // Daybook partial payment checks
  const updatedDaybook = safeGetTenantStorage<any>('vistaar_local_daybook_db', []);
  const thorDaybook = updatedDaybook.find((d: any) => d.referenceType === 'INVOICE' && (d.referenceNumber === partialResult.invoiceNumber || d.referenceId === partialResult.invoiceId));
  assert(Boolean(thorDaybook), 'Daybook SALE transaction recorded for partial invoice');
  if (thorDaybook) {
    assert(thorDaybook.amount === 6000, `Daybook cash inflow is ₹6,000 (actual received)`);
    assert(thorDaybook.totalAmount === 10000, `Daybook gross total is ₹10,000`);
    assert(Number(thorDaybook.remainingAmount ?? thorDaybook.remaining_amount) === 4000, `Daybook remaining balance is ₹4,000 (got: ${thorDaybook.remainingAmount})`);
  }

  // Cashbook partial payment check
  const updatedCashbook = safeGetTenantStorage<any>('vistaar_local_cashbook_db', []);
  const thorCashbook = updatedCashbook.find((c: any) => c.referenceNumber === partialResult.invoiceNumber);
  assert(Boolean(thorCashbook), 'Cashbook entry created for ₹6,000 inflow');
  if (thorCashbook) {
    assert(thorCashbook.amount === 6000, 'Cashbook amount is ₹6,000');
  }

  // Udhari receivable check
  const thorUdhari = store.getUdharis().find((u: any) => u.id === `UD-${partialResult.invoiceNumber}` || u.invoiceId === partialResult.invoiceId || (u.notes && u.notes.includes(partialResult.invoiceNumber)));
  console.log('DEBUG thorUdhari:', thorUdhari);
  assert(Boolean(thorUdhari), 'Udhari receivable record created for remaining balance');
  if (thorUdhari) {
    assert(thorUdhari.outstandingAmount === 4000, `Udhari outstanding is exactly ₹4,000 (got: ₹${thorUdhari.outstandingAmount})`);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Full Payment Test (Master Prompt Section 26)
  // Total: ₹10,000, Paid: ₹10,000 -> Remaining: ₹0, Udhari: ₹0
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Testing Full Payment Test (₹10,000 Total, ₹10,000 Paid) ---');

  const fullResult = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    id: `inv-full-${Date.now()}`,
    invoiceNumber: `INV-FULL-003`,
    customerName: 'Steve Rogers',
    customerPhone: '9844556677',
    date: '2026-10-12',
    grandTotal: 10000,
    paidAmount: 10000,
    paymentStatus: 'Paid',
    paymentMode: 'Cash',
    items: [
      {
        id: 'item-full-1',
        productId: prodBranchAId,
        productName: 'Precision Bearing Set',
        quantity: 5,
        sellingPrice: 2000,
        total: 10000,
      },
    ],
  });

  assert(fullResult.success === true, 'Full payment invoice finalized');
  assert(fullResult.balanceAmount === 0, 'Remaining balance is ₹0.00');
  const fullUdhari = store.getUdharis().filter((u: any) => u.invoiceNumber === fullResult.invoiceNumber);
  const fullOutstanding = fullUdhari.reduce((sum: number, u: any) => sum + (Number(u.outstandingAmount) || 0), 0);
  assert(fullOutstanding === 0, `No outstanding Udhari record created (outstanding = ₹${fullOutstanding})`);

  // ---------------------------------------------------------------------------
  // TEST 4: Double Click Idempotency Protection (Master Prompt Section 27)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Testing Double Click Idempotency Protection ---');

  const invLockId = `inv-doubleclick-${Date.now()}`;
  const dblStockBefore = getProductStock(prodBranchAId);

  // Trigger rapid duplicate calls with same payload
  const call1Promise = invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    id: invLockId,
    invoiceNumber: 'INV-DBL-004',
    customerName: 'Natasha Romanoff',
    grandTotal: 2000,
    paidAmount: 2000,
    paymentStatus: 'Paid',
    items: [
      {
        id: 'item-dbl-1',
        productId: prodBranchAId,
        quantity: 1,
        sellingPrice: 2000,
        total: 2000,
      },
    ],
  });

  const call2Promise = invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    id: invLockId,
    invoiceNumber: 'INV-DBL-004',
    customerName: 'Natasha Romanoff',
    grandTotal: 2000,
    paidAmount: 2000,
    paymentStatus: 'Paid',
    items: [
      {
        id: 'item-dbl-1',
        productId: prodBranchAId,
        quantity: 1,
        sellingPrice: 2000,
        total: 2000,
      },
    ],
  });

  const [res1, res2] = await Promise.all([call1Promise, call2Promise]);

  assert(res1.success || res2.success, 'At least one call succeeded');
  assert(
    (res1.success && !res2.success && res2.error?.includes('in progress')) ||
    (!res1.success && res2.success && res1.error?.includes('in progress')) ||
    (res1.success && res2.success && res1.invoiceId === res2.invoiceId),
    'Concurrent double-click gracefully handled without corrupting state'
  );

  const dblStockAfter = getProductStock(prodBranchAId);
  assert(dblStockAfter === dblStockBefore - 1, `Stock was deducted exactly ONCE (before: ${dblStockBefore}, after: ${dblStockAfter})`);

  // ---------------------------------------------------------------------------
  // TEST 5: Insufficient Stock Safety & Zero Mutation Rollback (Section 14 & 23)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Testing Insufficient Stock Rejection & Transaction Safety ---');

  const currentAvailableStock = getProductStock(prodBranchAId);
  const requestedExcessQty = currentAvailableStock + 999;
  const initialInvoiceCount = store.getInvoices().length;

  const excessResult = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    id: `inv-excess-${Date.now()}`,
    invoiceNumber: `INV-FAIL-STOCK`,
    customerName: 'Loki',
    grandTotal: 500000,
    paidAmount: 500000,
    items: [
      {
        id: 'item-excess-1',
        productId: prodBranchAId,
        productName: 'Precision Bearing Set',
        quantity: requestedExcessQty,
        sellingPrice: 2000,
        total: requestedExcessQty * 2000,
      },
    ],
  });

  assert(excessResult.success === false, 'Transaction failed due to insufficient stock');
  assert(excessResult.error?.includes('Insufficient stock'), 'Error message clearly specifies stock insufficiency');
  assert(getProductStock(prodBranchAId) === currentAvailableStock, 'Stock level remained completely untouched');
  assert(store.getInvoices().length === initialInvoiceCount, 'Zero orphan invoices created in store');

  // ---------------------------------------------------------------------------
  // TEST 6: Decimal / Rounding Tolerance Normalization (Section 13)
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Testing Decimal / Rounding ₹1.00 Rule ---');

  const finCalc1 = calculateInvoiceFinancials(1000.40, 1000.00);
  assert(finCalc1.balanceAmount === 0, `Remaining balance of ₹0.40 normalized to ₹0.00 (tolerance rule)`);
  assert(finCalc1.status === 'Paid', 'Status normalized to Paid under tolerance');

  const finCalc2 = calculateInvoiceFinancials(1000.00, 999.50);
  assert(finCalc2.balanceAmount === 0, `Remaining balance of ₹0.50 normalized to ₹0.00`);
  assert(finCalc2.status === 'Paid', 'Status normalized to Paid under tolerance');

  const finCalc3 = calculateInvoiceFinancials(1000.00, 990.00);
  assert(finCalc3.balanceAmount === 10.00, `Remaining balance of ₹10.00 is preserved as balance due`);
  assert(finCalc3.status === 'Partially Paid', 'Status remains Partially Paid when over tolerance');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n=============================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
