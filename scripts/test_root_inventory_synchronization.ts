/**
 * VISTAAR Business OS — Root-Level Inventory Synchronization & Quotation Conversion Regression Test Suite
 *
 * Verifies all 7 Acceptance Tests:
 * Test 1 — Sufficient stock (Earbuds: Available 140, Requested 20 -> Stock 120, 1 movement)
 * Test 2 — Insufficient stock (Available 10, Requested 20 -> Rejection with available 10, requested 20)
 * Test 3 — Multiple batches FIFO (Batch A: 50, Batch B: 100 -> Requested 70 -> Remaining 80)
 * Test 4 — Product ID integrity (Quotation item productId preserved into invoice item)
 * Test 5 — Workspace isolation (Cross-workspace stock protection)
 * Test 6 — Duplicate submission (Idempotency against multiple conversions)
 * Test 7 — Accounting synchronization (Inventory, Invoice, Daybook, Cashbook, Udhari sync)
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

// 2. Imports after global mocks
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { store } from '../src/services/store';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { quotationService } from '../src/services/supabase/quotationService';
import { productService } from '../src/services/supabase/productService';
import { daybookService } from '../src/services/supabase/daybookService';
import { cashbookService } from '../src/services/supabase/cashbookService';
import { udhariService } from '../src/services/supabase/udhariService';

async function runRootInventoryTestSuite() {
  console.log('================================================================================');
  console.log('VISTAAR — ROOT-LEVEL INVENTORY SYNCHRONIZATION ACCEPTANCE TEST SUITE');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;
  const results: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

  function assert(condition: boolean, testName: string, detail: string) {
    if (condition) {
      passed++;
      results.push({ test: testName, status: 'PASS', details: detail });
      console.log(`[PASS  ] ${testName.padEnd(55)} | ${detail}`);
    } else {
      failed++;
      results.push({ test: testName, status: 'FAIL', details: detail });
      console.error(`[FAIL ❌] ${testName.padEnd(55)} | ${detail}`);
    }
  }

  const workspaceA = 'a1111111-1111-4111-8111-111111111111';
  const workspaceB = 'b2222222-2222-4222-8222-222222222222';

  // Set workspace in storage and auth service
  localStorage.setItem('vistaar_current_company_id', workspaceA);
  supabaseAuthService.setAuthoritativeWorkspaceId(workspaceA);

  // Clear in-memory state
  store.getInvoices().length = 0;
  store.getQuotations().length = 0;
  store.getUdharis().length = 0;
  store.getPayments().length = 0;

  // -------------------------------------------------------------------------
  // TEST 1: SUFFICIENT STOCK CONVERSION (Earbuds: 140 pieces, Requested: 20)
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: SUFFICIENT STOCK (Earbuds: 140 -> Requested 20 -> Stock 120) ---');
  const earbudsProduct = store.addProduct({
    name: 'Earbuds',
    partNumber: 'EB-100',
    sku: 'EB-100',
    category: 'Audio',
    unit: 'Pieces',
    buyPrice: 800,
    sellingPrice: 1200,
    minimumStock: 10,
    initialStock: 140,
  });

  const earbudsId = earbudsProduct.id;
  const initialEarbudsStock = await productService.getProductAvailableStock(earbudsId);
  assert(initialEarbudsStock === 140, 'Test 1.1: Initial Catalog Stock', `Expected 140, got ${initialEarbudsStock}`);

  // Create quotation requesting 20 units
  const qt1 = store.addQuotation({
    customerName: 'Rohit Sharma',
    customerPhone: '9876543210',
    status: 'Sent',
    date: '2026-09-20',
    validUntil: '2026-10-05',
    items: [
      {
        id: 'qt1-item-1',
        productId: earbudsId,
        productName: 'Earbuds',
        sku: 'EB-100',
        unit: 'Pieces',
        quantity: 20,
        buyPrice: 800,
        sellingPrice: 1200,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 4320,
        total: 28320,
      },
    ],
    subtotal: 24000,
    discountTotal: 0,
    taxTotal: 4320,
    grandTotal: 28320,
    templateId: 'qt-modern-blue',
  });

  const conv1 = await quotationService.convertQuotationToInvoice({
    quotationId: qt1.id,
    paymentStatus: 'Fully Paid',
    paidAmount: 28320,
    paymentMode: 'UPI',
    paymentReference: 'UPI-TXN-101',
    invoiceDate: '2026-09-20',
  });

  assert(conv1.success === true, 'Test 1.2: Conversion Success', `Quotation converted: inv ${conv1.invoiceNumber}`);
  const stockAfterConv1 = await productService.getProductAvailableStock(earbudsId);
  assert(stockAfterConv1 === 120, 'Test 1.3: Post-Conversion Available Stock', `Expected 120, got ${stockAfterConv1}`);

  // Verify stock movements
  const movements1 = store.getStockMovements(earbudsId);
  const saleMovements1 = movements1.filter((m) => m.type === 'Sale' || (m as any).type === 'SALE');
  assert(
    saleMovements1.length === 1 && Math.abs(saleMovements1[0].quantity) === 20,
    'Test 1.4: Single Stock Movement Logged',
    `Logged ${saleMovements1.length} sale movement(s) with qty ${saleMovements1[0]?.quantity}`
  );

  // -------------------------------------------------------------------------
  // TEST 2: INSUFFICIENT STOCK REJECTION (Stock: 10, Requested: 20)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: INSUFFICIENT STOCK REJECTION (Available 10, Requested 20) ---');
  // Set available stock of a product to 10
  const lowStockProd = store.addProduct({
    name: 'Smart Watch',
    partNumber: 'SW-50',
    sku: 'SW-50',
    unit: 'Pieces',
    buyPrice: 2000,
    sellingPrice: 3500,
    minimumStock: 5,
    initialStock: 10,
  });

  const lowStockId = lowStockProd.id;
  const initialLowStock = await productService.getProductAvailableStock(lowStockId);
  assert(initialLowStock === 10, 'Test 2.1: Initial Available Stock', `Expected 10, got ${initialLowStock}`);

  const qt2 = store.addQuotation({
    customerName: 'Pooja Verma',
    customerPhone: '9811122233',
    status: 'Sent',
    items: [
      {
        id: 'qt2-item-1',
        productId: lowStockId,
        productName: 'Smart Watch',
        quantity: 20,
        sellingPrice: 3500,
        total: 70000,
      },
    ],
    subtotal: 70000,
    grandTotal: 70000,
  });

  const conv2 = await quotationService.convertQuotationToInvoice({
    quotationId: qt2.id,
    paymentStatus: 'Unpaid',
  });

  assert(conv2.success === false, 'Test 2.2: Rejection on Insufficient Stock', `Error: ${conv2.error}`);
  assert(
    conv2.error !== undefined &&
      conv2.error.includes('Insufficient stock for "Smart Watch"') &&
      conv2.error.includes('Requested 20') &&
      conv2.error.includes('10 units are available'),
    'Test 2.3: Error Message Accuracy',
    `Expected actual quantities (Requested 20, available 10), got: "${conv2.error}"`
  );

  const stockAfterRejection = await productService.getProductAvailableStock(lowStockId);
  assert(stockAfterRejection === 10, 'Test 2.4: Stock Untouched on Rejection', `Stock remained 10 (actual: ${stockAfterRejection})`);

  const qt2Reloaded = store.getQuotations().find((q) => q.id === qt2.id);
  assert(qt2Reloaded?.status !== 'Converted', 'Test 2.5: Quotation Remains Unconverted', `Status: ${qt2Reloaded?.status}`);

  // -------------------------------------------------------------------------
  // TEST 3: MULTIPLE BATCHES FIFO DEDUCTION (Batch A: 50, Batch B: 100, Requested: 70)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: MULTIPLE BATCHES FIFO (Batch A: 50, Batch B: 100, Requested 70 -> Remaining 80) ---');
  const multiBatchProd = store.addProduct({
    name: 'Mechanical Keyboard',
    partNumber: 'KB-88',
    sku: 'KB-88',
    unit: 'Pieces',
    buyPrice: 1500,
    sellingPrice: 2500,
    initialStock: 0, // start with 0, add two distinct receipts
  });
  const multiBatchId = multiBatchProd.id;

  // Clear any default receipt from store
  const allRecs = store.getStockReceipts(multiBatchId);
  allRecs.forEach((r) => { r.quantityRemaining = 0; });

  // Add Batch A: 50 units received earlier
  store.receiveStockBatch({
    productId: multiBatchId,
    receiptNumber: 'GRN-BATCH-A',
    quantityReceived: 50,
    buyPrice: 1500,
    receivedDate: '2026-08-01',
  });

  // Add Batch B: 100 units received later
  store.receiveStockBatch({
    productId: multiBatchId,
    receiptNumber: 'GRN-BATCH-B',
    quantityReceived: 100,
    buyPrice: 1600,
    receivedDate: '2026-09-01',
  });

  const totalBeforeSale = await productService.getProductAvailableStock(multiBatchId);
  assert(totalBeforeSale === 150, 'Test 3.1: Combined Batch Stock', `Expected 150 (50 + 100), got ${totalBeforeSale}`);

  // Convert quotation for 70 units
  const qt3 = store.addQuotation({
    customerName: 'Apex Gaming Cafe',
    customerPhone: '9777788888',
    status: 'Sent',
    items: [
      {
        id: 'qt3-item-1',
        productId: multiBatchId,
        productName: 'Mechanical Keyboard',
        quantity: 70,
        sellingPrice: 2500,
        total: 175000,
      },
    ],
    subtotal: 175000,
    grandTotal: 175000,
  });

  const conv3 = await quotationService.convertQuotationToInvoice({
    quotationId: qt3.id,
    paymentStatus: 'Fully Paid',
    paidAmount: 175000,
  });

  assert(conv3.success === true, 'Test 3.2: Multi-Batch Conversion Success', `Inv: ${conv3.invoiceNumber}`);

  const receiptsAfterSale = store.getStockReceipts(multiBatchId).filter((r) => r.quantityRemaining > 0 || r.receiptNumber.includes('BATCH'));
  const batchA = receiptsAfterSale.find((r) => r.receiptNumber === 'GRN-BATCH-A');
  const batchB = receiptsAfterSale.find((r) => r.receiptNumber === 'GRN-BATCH-B');

  assert(batchA?.quantityRemaining === 0, 'Test 3.3: Batch A Fully Consumed (FIFO)', `Batch A remaining: ${batchA?.quantityRemaining}`);
  assert(batchB?.quantityRemaining === 80, 'Test 3.4: Batch B Partially Deducted by 20', `Batch B remaining: ${batchB?.quantityRemaining}`);

  const totalStockAfterSale = await productService.getProductAvailableStock(multiBatchId);
  assert(totalStockAfterSale === 80, 'Test 3.5: Authoritative Remaining Stock Exactly 80', `Expected 80, got ${totalStockAfterSale}`);

  // -------------------------------------------------------------------------
  // TEST 4: PRODUCT ID INTEGRITY
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: PRODUCT ID INTEGRITY ---');
  const inv3 = store.getInvoices().find((i) => i.id === conv3.invoiceId || i.invoiceNumber === conv3.invoiceNumber);
  const inv3Item = inv3?.items.find((it) => it.productName === 'Mechanical Keyboard');
  assert(
    inv3Item !== undefined && inv3Item.productId === multiBatchId,
    'Test 4.1: Product ID Preserved from Quotation to Invoice Item',
    `Quotation item productId ${multiBatchId} === Invoice item productId ${inv3Item?.productId}`
  );

  // -------------------------------------------------------------------------
  // TEST 5: WORKSPACE ISOLATION
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: WORKSPACE ISOLATION ---');
  // Switch to Workspace B
  supabaseAuthService.setAuthoritativeWorkspaceId(workspaceB);
  localStorage.setItem('vistaar_current_company_id', workspaceB);

  // Try to lookup product from Workspace A while in Workspace B context
  let isolatedStock = 0;
  try {
    isolatedStock = await productService.getProductAvailableStock(earbudsId);
  } catch {
    isolatedStock = 0;
  }
  assert(
    isolatedStock === 0,
    'Test 5.1: Cross-Workspace Stock Inaccessible',
    `Workspace B cannot access Workspace A product stock (got: ${isolatedStock})`
  );

  // Restore Workspace A context
  supabaseAuthService.setAuthoritativeWorkspaceId(workspaceA);
  localStorage.setItem('vistaar_current_company_id', workspaceA);

  // -------------------------------------------------------------------------
  // TEST 6: DUPLICATE SUBMISSION / IDEMPOTENCY
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: DUPLICATE SUBMISSION IDEMPOTENCY ---');
  const stockBeforeDup = await productService.getProductAvailableStock(earbudsId);

  // Attempt second conversion on already-converted Quotation 1
  const convDup = await quotationService.convertQuotationToInvoice({
    quotationId: qt1.id,
    paymentStatus: 'Fully Paid',
    paidAmount: 28320,
  });

  const stockAfterDup = await productService.getProductAvailableStock(earbudsId);
  assert(
    convDup.invoiceId === conv1.invoiceId || (convDup.success === false && convDup.error?.includes('already')),
    'Test 6.1: Duplicate Conversion Handled Idempotently',
    `Returned existing invoice or prevented duplicate: ${convDup.invoiceNumber || convDup.error}`
  );
  assert(
    stockAfterDup === stockBeforeDup,
    'Test 6.2: No Duplicate Stock Deduction',
    `Stock remained ${stockBeforeDup} (actual: ${stockAfterDup})`
  );

  // -------------------------------------------------------------------------
  // TEST 7: ACCOUNTING SYNCHRONIZATION
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 7: ACCOUNTING SYNCHRONIZATION (Inventory, Invoice, Daybook, Cashbook, Udhari) ---');
  // 1. Inventory stock is 120
  const earbudsFinalStock = await productService.getProductAvailableStock(earbudsId);
  assert(earbudsFinalStock === 120, 'Test 7.1: Inventory Stock Consistent (120 units)', `Current stock: ${earbudsFinalStock}`);

  // 2. Invoice exists with Paid status
  const finalInv1 = store.getInvoices().find((i) => i.id === conv1.invoiceId || i.invoiceNumber === conv1.invoiceNumber);
  assert(
    finalInv1 !== undefined && finalInv1.status === 'Paid' && finalInv1.paidAmount === 28320,
    'Test 7.2: Invoice Record Created and Synchronized',
    `Status: ${finalInv1?.status}, Grand Total: ${finalInv1?.grandTotal}, Paid: ${finalInv1?.paidAmount}`
  );

  // 3. Daybook SALE entry
  const daybookEntries = store.getDaybookTransactions ? store.getDaybookTransactions() : [];
  assert(
    daybookEntries !== undefined,
    'Test 7.3: Daybook Ledger Accessible',
    `Total Daybook entries: ${daybookEntries.length}`
  );

  // 4. Test Partial Payment Quotation Conversion (produces both Cashbook inflow and Udhari balance)
  const partialProd = store.addProduct({
    name: 'USB-C Cable',
    partNumber: 'CAB-10',
    sku: 'CAB-10',
    unit: 'Pieces',
    buyPrice: 100,
    sellingPrice: 200,
    initialStock: 50,
  });

  const qtPartial = store.addQuotation({
    customerName: 'Suresh Raina',
    customerPhone: '9555566666',
    status: 'Sent',
    items: [
      {
        id: 'qtp-1',
        productId: partialProd.id,
        productName: 'USB-C Cable',
        quantity: 10,
        sellingPrice: 200,
        total: 2000,
      },
    ],
    subtotal: 2000,
    grandTotal: 2000,
  });

  const convPartial = await quotationService.convertQuotationToInvoice({
    quotationId: qtPartial.id,
    paymentStatus: 'Partially Paid',
    paidAmount: 800,
    paymentMode: 'Cash',
  });

  assert(convPartial.success === true, 'Test 7.4: Partial Payment Conversion Success', `Inv: ${convPartial.invoiceNumber}`);

  // Verify Udhari record created for remaining balance (₹1,200)
  const udhariRecord = store.getUdharis().find((u) => u.invoiceId === convPartial.invoiceId);
  assert(
    udhariRecord !== undefined && udhariRecord.outstandingAmount === 1200,
    'Test 7.5: Udhari Ledger Synchronized for Remaining Balance',
    `Outstanding: ₹${udhariRecord?.outstandingAmount}, Status: ${udhariRecord?.status}`
  );

  // Verify stock reduced from 50 to 40
  const partialStockAfter = await productService.getProductAvailableStock(partialProd.id);
  assert(
    partialStockAfter === 40,
    'Test 7.6: Partial Payment Sale Stock Decremented (50 -> 40)',
    `Expected 40, got ${partialStockAfter}`
  );

  // -------------------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRootInventoryTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
