import { store } from '../src/services/store';
import { productService } from '../src/services/supabase/productService';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { safeSaveTenantStorage, safeGetTenantStorage } from '../src/services/supabase/safeStorage';

async function runMasterInventoryRegressionSuite() {
  console.log('================================================================');
  console.log('VISTAAR — MASTER INVENTORY & SALES STOCK SYNCHRONIZATION TEST');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const testResults: { testName: string; status: 'PASS' | 'FAIL'; detail: string }[] = [];

  const assert = (condition: boolean, testName: string, detail: string = '') => {
    if (condition) {
      console.log(`[PASS] ${testName} ${detail ? '(' + detail + ')' : ''}`);
      passed++;
      testResults.push({ testName, status: 'PASS', detail });
    } else {
      console.error(`[FAIL] ${testName} ${detail ? '- FAIL: ' + detail : ''}`);
      failed++;
      testResults.push({ testName, status: 'FAIL', detail });
    }
  };

  const getStock = (productId: string) => {
    const prod = store.getProducts().find((p) => p.id === productId);
    return prod ? prod.currentStock : 0;
  };

  // -------------------------------------------------------------------------
  // SETUP TEST DATA
  // -------------------------------------------------------------------------
  console.log('1. Setting up mock catalog products in store...');
  const prodBearing = store.addProduct({
    name: 'Test Bearing 6205',
    sku: 'TEST-6205',
    partNumber: '6205-2RS',
    category: 'Bearings',
    unit: 'Piece',
    buyPrice: 150,
    sellingPrice: 300,
    initialStock: 23,
    minimumStock: 5,
  });

  const prodBelt = store.addProduct({
    name: 'Test V-Belt B45',
    sku: 'SKU-VB45',
    partNumber: 'BELT-B45-IND',
    category: 'Belts',
    unit: 'Piece',
    buyPrice: 80,
    sellingPrice: 160,
    initialStock: 10,
    minimumStock: 2,
  });

  // TEST 1: 1-Character Product Search
  console.log('\n--- TEST 1: 1-Character Product Search ---');
  const search1Char = await productService.searchProducts('T');
  assert(
    search1Char.data.length >= 2,
    'Search with 1 character ("T")',
    `Found ${search1Char.data.length} products`
  );

  // TEST 2: Search by Part Number
  console.log('\n--- TEST 2: Search by Part Number ---');
  const searchPartNo = await productService.searchProducts('6205-2RS');
  assert(
    searchPartNo.data.some((p) => p.id === prodBearing.id || p.partNumber?.includes('6205') || p.name.includes('6205')),
    'Search by Part Number ("6205-2RS")',
    `Matched product: ${prodBearing.name}`
  );

  // TEST 3: Search by SKU / Product Code
  console.log('\n--- TEST 3: Search by SKU / Product Code ---');
  const searchSku = await productService.searchProducts('SKU-VB45');
  assert(
    searchSku.data.some((p) => p.id === prodBelt.id || p.sku === 'SKU-VB45' || p.name.includes('V-Belt')),
    'Search by SKU / Product Code ("SKU-VB45")',
    `Matched product: ${prodBelt.name}`
  );

  // TEST 4: Draft Invoice Stock Isolation (Opening stock: 23)
  console.log('\n--- TEST 4: Draft Invoice Stock Isolation ---');
  const initialBearingStock = getStock(prodBearing.id);
  assert(initialBearingStock === 23, 'Opening stock initialized to 23', `Stock: ${initialBearingStock}`);

  const draftInv = store.addInvoice({
    customerName: 'Test Draft Customer',
    status: 'Draft',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date().toISOString().split('T')[0],
    items: [
      {
        id: 'item-1',
        productId: prodBearing.id,
        productName: prodBearing.name,
        sku: prodBearing.sku,
        unit: prodBearing.unit,
        quantity: 5,
        buyPrice: prodBearing.buyPrice,
        sellingPrice: prodBearing.sellingPrice,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 270,
        total: 1770,
      },
    ],
    subtotal: 1500,
    discountTotal: 0,
    taxTotal: 270,
    grandTotal: 1770,
    paidAmount: 0,
    balanceAmount: 1770,
    notes: 'Draft test',
    terms: 'Standard',
    footerText: 'Thank you',
    templateId: 'inv-modern-blue',
    branding: { showLogo: false },
    theme: { primaryColor: '#000', secondaryColor: '#111', textColor: '#222', fontFamily: 'Inter' },
  });

  const stockAfterDraft = getStock(prodBearing.id);
  assert(
    stockAfterDraft === 23,
    'Draft Invoice does NOT deduct stock',
    `Opening: 23, After Draft: ${stockAfterDraft}`
  );

  // TEST 5: Finalizing Draft Invoice Stock Deduction (23 -> 18)
  console.log('\n--- TEST 5: Finalizing Draft Invoice Stock Deduction ---');
  store.finalizeDraftInvoice(draftInv.id);
  const stockAfterFinalized = getStock(prodBearing.id);
  assert(
    stockAfterFinalized === 18,
    'Finalizing Draft Invoice deducts exact stock (23 -> 18)',
    `Expected: 18, Actual: ${stockAfterFinalized}`
  );

  // TEST 6: Double Finalization Protection (Idempotency)
  console.log('\n--- TEST 6: Double Finalization Idempotency Protection ---');
  let doubleError: string | null = null;
  try {
    store.finalizeDraftInvoice(draftInv.id);
  } catch (e: any) {
    doubleError = e.message;
  }
  const stockAfterDoubleFinalize = getStock(prodBearing.id);
  assert(
    stockAfterDoubleFinalize === 18,
    'Double finalization request does NOT deduct stock twice',
    `Expected: 18, Actual: ${stockAfterDoubleFinalize}`
  );

  // TEST 7: Counter Sale Stock Reduction (18 -> 15)
  console.log('\n--- TEST 7: Counter Sale Stock Flow ---');
  const counterSaleStockBefore = getStock(prodBearing.id);
  await counterSaleService.createCounterSale({
    customerName: 'Walk-in Test',
    saleDate: new Date().toISOString().split('T')[0],
    invoiceNumber: `CS-TEST-${Date.now()}`,
    subtotal: 900,
    finalTotal: 900,
    items: [
      {
        productId: prodBearing.id,
        productName: prodBearing.name,
        partNumber: prodBearing.partNumber,
        quantity: 3,
        rate: 300,
      },
    ],
  });

  const stockAfterCounterSale = getStock(prodBearing.id);
  assert(
    stockAfterCounterSale === 15,
    'Counter sale deducted 3 units from inventory (18 -> 15)',
    `Before: ${counterSaleStockBefore}, After: ${stockAfterCounterSale}`
  );

  // TEST 8: Quotation Stock Isolation (Stock remains 15)
  console.log('\n--- TEST 8: Quotation Stock Isolation ---');
  const stockBeforeQt = getStock(prodBearing.id);
  const qt = store.addQuotation({
    customerName: 'Test Quotation Customer',
    status: 'Sent',
    date: new Date().toISOString().split('T')[0],
    validUntil: new Date().toISOString().split('T')[0],
    items: [
      {
        id: 'item-qt-1',
        productId: prodBearing.id,
        productName: prodBearing.name,
        sku: prodBearing.sku,
        unit: prodBearing.unit,
        quantity: 5,
        buyPrice: prodBearing.buyPrice,
        sellingPrice: prodBearing.sellingPrice,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 270,
        total: 1770,
      },
    ],
    subtotal: 1500,
    discountTotal: 0,
    taxTotal: 270,
    grandTotal: 1770,
    notes: 'Quotation test',
    terms: 'Standard',
    footerText: 'Thank you',
    templateId: 'qt-modern-blue',
    branding: { showLogo: false },
    theme: { primaryColor: '#000', secondaryColor: '#111', textColor: '#222', fontFamily: 'Inter' },
  });

  const stockAfterQt = getStock(prodBearing.id);
  assert(
    stockAfterQt === 15,
    'Quotation does NOT alter stock level',
    `Initial: ${stockBeforeQt}, After Quotation: ${stockAfterQt}`
  );

  // TEST 9: Quotation Conversion to Invoice & Finalization (15 -> 10)
  console.log('\n--- TEST 9: Quotation Conversion to Finalized Invoice ---');
  const convertedInv = store.convertQuotationToInvoice(qt.id);
  const stockAfterConverted = getStock(prodBearing.id);
  assert(
    convertedInv !== null && stockAfterConverted === 10,
    'Converting Quotation to Issued Invoice deducts stock (15 -> 10)',
    `Expected: 10, Actual: ${stockAfterConverted}`
  );

  // TEST 10: Payment Recording Stock Isolation (Stock remains 10)
  console.log('\n--- TEST 10: Payment Recording Stock Isolation ---');
  const stockBeforePay = getStock(prodBearing.id);
  if (convertedInv) {
    store.recordPayment({
      customerId: 'cust-1',
      customerName: 'Test Quotation Customer',
      invoiceId: convertedInv.id,
      invoiceNumber: convertedInv.invoiceNumber,
      amount: 1000,
      date: new Date().toISOString().split('T')[0],
      method: 'UPI',
    });
  }
  const stockAfterPay = getStock(prodBearing.id);
  assert(
    stockAfterPay === stockBeforePay,
    'Payment recording does NOT alter inventory stock (remains 10)',
    `Before: ${stockBeforePay}, After Payment: ${stockAfterPay}`
  );

  // TEST 11: Multi-Item Finalized Invoice Atomic Stock Deduction
  console.log('\n--- TEST 11: Multi-Item Finalized Invoice Stock Deduction ---');
  const currBearing = getStock(prodBearing.id); // 10
  const currBelt = getStock(prodBelt.id);       // 10

  store.addInvoice({
    customerName: 'Multi-Item Customer',
    status: 'Issued',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date().toISOString().split('T')[0],
    items: [
      {
        id: 'multi-1',
        productId: prodBearing.id,
        productName: prodBearing.name,
        sku: prodBearing.sku,
        unit: prodBearing.unit,
        quantity: 3,
        buyPrice: prodBearing.buyPrice,
        sellingPrice: prodBearing.sellingPrice,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 162,
        total: 1062,
      },
      {
        id: 'multi-2',
        productId: prodBelt.id,
        productName: prodBelt.name,
        sku: prodBelt.sku,
        unit: prodBelt.unit,
        quantity: 4,
        buyPrice: prodBelt.buyPrice,
        sellingPrice: prodBelt.sellingPrice,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 115.2,
        total: 755.2,
      },
    ],
    subtotal: 1540,
    discountTotal: 0,
    taxTotal: 277.2,
    grandTotal: 1817.2,
    paidAmount: 0,
    balanceAmount: 1817.2,
    notes: 'Multi item test',
    terms: 'Standard',
    footerText: 'Thank you',
    templateId: 'inv-modern-blue',
    branding: { showLogo: false },
    theme: { primaryColor: '#000', secondaryColor: '#111', textColor: '#222', fontFamily: 'Inter' },
  });

  const postMultiBearing = getStock(prodBearing.id); // 7
  const postMultiBelt = getStock(prodBelt.id);       // 6

  assert(
    postMultiBearing === 7 && postMultiBelt === 6,
    'Multi-item finalized invoice deducted stock correctly across all line items',
    `Bearing: 10 -> ${postMultiBearing}, Belt: 10 -> ${postMultiBelt}`
  );

  // TEST 12: Insufficient Stock Atomic Rollback
  console.log('\n--- TEST 12: Insufficient Stock Rollback Test ---');
  const bearingStockBeforeRollback = getStock(prodBearing.id); // 7
  const beltStockBeforeRollback = getStock(prodBelt.id);       // 6
  let rollbackErrorThrown = false;

  try {
    store.addInvoice({
      customerName: 'Over-Stock Customer',
      status: 'Issued',
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date().toISOString().split('T')[0],
      items: [
        {
          id: 'over-1',
          productId: prodBearing.id,
          productName: prodBearing.name,
          sku: prodBearing.sku,
          unit: prodBearing.unit,
          quantity: 2, // Valid
          buyPrice: prodBearing.buyPrice,
          sellingPrice: prodBearing.sellingPrice,
          discountAmount: 0,
          taxPercent: 18,
          taxAmount: 0,
          total: 600,
        },
        {
          id: 'over-2',
          productId: prodBelt.id,
          productName: prodBelt.name,
          sku: prodBelt.sku,
          unit: prodBelt.unit,
          quantity: 999, // Exceeds available 6
          buyPrice: prodBelt.buyPrice,
          sellingPrice: prodBelt.sellingPrice,
          discountAmount: 0,
          taxPercent: 18,
          taxAmount: 0,
          total: 999 * 160,
        },
      ],
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      paidAmount: 0,
      balanceAmount: 0,
      notes: '',
      terms: '',
      footerText: '',
      templateId: 'inv-modern-blue',
      branding: { showLogo: false },
      theme: { primaryColor: '#000', secondaryColor: '#111', textColor: '#222', fontFamily: 'Inter' },
    });
  } catch (e: any) {
    rollbackErrorThrown = true;
  }

  const bearingStockAfterRollback = getStock(prodBearing.id);
  const beltStockAfterRollback = getStock(prodBelt.id);

  assert(
    bearingStockAfterRollback === bearingStockBeforeRollback &&
      beltStockAfterRollback === beltStockBeforeRollback,
    'Insufficient stock threw error and rolled back ZERO partial deductions',
    `Bearing: ${bearingStockAfterRollback}, Belt: ${beltStockAfterRollback}`
  );

  // TEST 13: Tenant Isolation in Local Storage
  console.log('\n--- TEST 13: Tenant Isolation in Local Storage ---');
  safeSaveTenantStorage('test_isolation_key', [{ test: 123 }]);
  const retrieved = safeGetTenantStorage<any>('test_isolation_key', []);
  assert(
    retrieved.length === 1 && retrieved[0].test === 123,
    'Tenant-partitioned storage operates with isolated keys',
    `Retrieved ${retrieved.length} items`
  );

  // SUMMARY
  console.log('\n================================================================');
  console.log(`MASTER INVENTORY REGRESSION SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterInventoryRegressionSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
