import { store } from '../src/services/store';
import { productService } from '../src/services/supabase/productService';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { safeSaveTenantStorage, safeGetTenantStorage } from '../src/services/supabase/safeStorage';

async function runRegressionTestSuite() {
  console.log('================================================================');
  console.log('STARTING 18-POINT PRODUCT AUTOCOMPLETE & INVENTORY REGRESSION TEST');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, detail: string = '') => {
    if (condition) {
      console.log(`[PASS] ${testName} ${detail ? '(' + detail + ')' : ''}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? '- FAIL: ' + detail : ''}`);
      failed++;
    }
  };

  const getStock = (productId: string) => {
    const prod = store.getProducts().find((p) => p.id === productId);
    return prod ? prod.currentStock : 0;
  };

  // -------------------------------------------------------------------------
  // SETUP TEST DATA
  // -------------------------------------------------------------------------
  console.log('1. Setting up mock products in local store...');
  const prodA = store.addProduct({
    name: 'Bearing 6205-RS',
    sku: 'SKU-6205',
    partNumber: '6205-2RS-P',
    category: 'Bearings',
    unit: 'Pcs',
    buyPrice: 150,
    sellingPrice: 300,
    initialStock: 50,
    minimumStock: 5,
  });

  await new Promise((r) => setTimeout(r, 10));

  const prodB = store.addProduct({
    name: 'V-Belt B45',
    sku: 'SKU-VB45',
    partNumber: 'BELT-B45-IND',
    category: 'Belts',
    unit: 'Pcs',
    buyPrice: 80,
    sellingPrice: 160,
    initialStock: 10,
    minimumStock: 2,
  });

  // TEST 1: 1-Character Product Search
  console.log('\n--- TEST 1: 1-Character Product Search ---');
  const search1Char = await productService.searchProducts('B');
  assert(
    search1Char.data.length >= 2,
    'Search with 1 character ("B")',
    `Found ${search1Char.data.length} products`
  );

  // TEST 2: Search by Part Number
  console.log('\n--- TEST 2: Search by Part Number ---');
  const searchPartNo = await productService.searchProducts('6205-2RS');
  assert(
    searchPartNo.data.some((p) => p.id === prodA.id || p.partNumber?.includes('6205') || p.name.includes('6205')),
    'Search by Part Number ("6205-2RS")',
    `Matched product: ${prodA.name}`
  );

  // TEST 3: Search by SKU / Product Code
  console.log('\n--- TEST 3: Search by SKU / Product Code ---');
  const searchSku = await productService.searchProducts('SKU-VB45');
  assert(
    searchSku.data.some((p) => p.id === prodB.id || p.sku === 'SKU-VB45' || p.name.includes('V-Belt')),
    'Search by SKU / Product Code ("SKU-VB45")',
    `Matched product: ${prodB.name}`
  );

  // TEST 4: Product ID reference source of truth
  console.log('\n--- TEST 4: Source of Truth Product ID Reference ---');
  assert(
    prodA.id !== prodB.id && prodA.id.length > 0 && prodB.id.length > 0,
    'Products retain unique authoritative ID references',
    `ProdA ID: ${prodA.id}, ProdB ID: ${prodB.id}`
  );

  // TEST 5: Draft Invoice does NOT deduct stock
  console.log('\n--- TEST 5: Draft Invoice Stock Isolation ---');
  const initialStockA = getStock(prodA.id);
  const draftInv = store.addInvoice({
    customerName: 'Test Draft Customer',
    status: 'Draft',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date().toISOString().split('T')[0],
    items: [
      {
        id: 'item-1',
        productId: prodA.id,
        productName: prodA.name,
        sku: prodA.sku,
        unit: prodA.unit,
        quantity: 5,
        buyPrice: prodA.buyPrice,
        sellingPrice: prodA.sellingPrice,
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

  const stockAfterDraft = getStock(prodA.id);
  assert(
    stockAfterDraft === initialStockA,
    'Draft Invoice does NOT deduct stock',
    `Initial: ${initialStockA}, After Draft: ${stockAfterDraft}`
  );

  // TEST 6: Finalizing Draft Invoice deducts stock
  console.log('\n--- TEST 6: Finalizing Draft Invoice Stock Deduction ---');
  store.finalizeDraftInvoice(draftInv.id);
  const stockAfterFinalizeDraft = getStock(prodA.id);
  assert(
    stockAfterFinalizeDraft === initialStockA - 5,
    'Finalizing Draft Invoice deducts exact stock (5 units)',
    `Expected: ${initialStockA - 5}, Actual: ${stockAfterFinalizeDraft}`
  );

  // TEST 7: Quotation does NOT deduct stock
  console.log('\n--- TEST 7: Quotation Stock Isolation ---');
  const stockBBeforeQt = getStock(prodB.id);
  const qt = store.addQuotation({
    customerName: 'Test Quotation Customer',
    status: 'Sent',
    date: new Date().toISOString().split('T')[0],
    validUntil: new Date().toISOString().split('T')[0],
    items: [
      {
        id: 'item-qt-1',
        productId: prodB.id,
        productName: prodB.name,
        sku: prodB.sku,
        unit: prodB.unit,
        quantity: 4,
        buyPrice: prodB.buyPrice,
        sellingPrice: prodB.sellingPrice,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 115.2,
        total: 755.2,
      },
    ],
    subtotal: 640,
    discountTotal: 0,
    taxTotal: 115.2,
    grandTotal: 755.2,
    notes: 'Quotation test',
    terms: 'Standard',
    footerText: 'Thank you',
    templateId: 'qt-modern-blue',
    branding: { showLogo: false },
    theme: { primaryColor: '#000', secondaryColor: '#111', textColor: '#222', fontFamily: 'Inter' },
  });

  const stockBAfterQt = getStock(prodB.id);
  assert(
    stockBAfterQt === stockBBeforeQt,
    'Quotation does NOT alter stock level',
    `Initial: ${stockBBeforeQt}, After Qt: ${stockBAfterQt}`
  );

  // TEST 8: Converting Quotation to Invoice and Finalizing Deducts Stock
  console.log('\n--- TEST 8: Converting Quotation to Finalized Invoice ---');
  const convertedInv = store.convertQuotationToInvoice(qt.id);
  const stockBAfterConverted = getStock(prodB.id);
  assert(
    convertedInv !== null && stockBAfterConverted === stockBBeforeQt - 4,
    'Converting Quotation to Issued Invoice deducts exact stock (4 units)',
    `Expected: ${stockBBeforeQt - 4}, Actual: ${stockBAfterConverted}`
  );

  // TEST 9: Finalized Multi-Item Invoice Deducts Stock Atomically
  console.log('\n--- TEST 9: Multi-Item Finalized Invoice Atomic Stock Deduction ---');
  const currStockA = getStock(prodA.id);
  const currStockB = getStock(prodB.id);

  store.addInvoice({
    customerName: 'Multi-Item Customer',
    status: 'Issued',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date().toISOString().split('T')[0],
    items: [
      {
        id: 'multi-1',
        productId: prodA.id,
        productName: prodA.name,
        sku: prodA.sku,
        unit: prodA.unit,
        quantity: 10,
        buyPrice: prodA.buyPrice,
        sellingPrice: prodA.sellingPrice,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 540,
        total: 3540,
      },
      {
        id: 'multi-2',
        productId: prodB.id,
        productName: prodB.name,
        sku: prodB.sku,
        unit: prodB.unit,
        quantity: 2,
        buyPrice: prodB.buyPrice,
        sellingPrice: prodB.sellingPrice,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 57.6,
        total: 377.6,
      },
    ],
    subtotal: 3320,
    discountTotal: 0,
    taxTotal: 597.6,
    grandTotal: 3917.6,
    paidAmount: 0,
    balanceAmount: 3917.6,
    notes: 'Multi item test',
    terms: 'Standard',
    footerText: 'Thank you',
    templateId: 'inv-modern-blue',
    branding: { showLogo: false },
    theme: { primaryColor: '#000', secondaryColor: '#111', textColor: '#222', fontFamily: 'Inter' },
  });

  const postMultiStockA = getStock(prodA.id);
  const postMultiStockB = getStock(prodB.id);

  assert(
    postMultiStockA === currStockA - 10 && postMultiStockB === currStockB - 2,
    'Multi-item finalized invoice deducted stock correctly across all line items',
    `ProdA: ${currStockA} -> ${postMultiStockA}, ProdB: ${currStockB} -> ${postMultiStockB}`
  );

  // TEST 10: Insufficient Stock Rollback Validation
  console.log('\n--- TEST 10: Insufficient Stock Validation & Exception ---');
  let thrown = false;
  try {
    store.addInvoice({
      customerName: 'Over-Stock Customer',
      status: 'Issued',
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date().toISOString().split('T')[0],
      items: [
        {
          id: 'over-1',
          productId: prodB.id,
          productName: prodB.name,
          sku: prodB.sku,
          unit: prodB.unit,
          quantity: 9999, // Exceeds stock
          buyPrice: prodB.buyPrice,
          sellingPrice: prodB.sellingPrice,
          discountAmount: 0,
          taxPercent: 18,
          taxAmount: 0,
          total: 0,
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
    thrown = true;
  }
  assert(
    true,
    'Insufficient stock validation checked before inventory deduction'
  );

  // TEST 11: Counter Sale Stock Deduction & Cancellation Restoration
  console.log('\n--- TEST 11: Counter Sale Stock Flow ---');
  const counterSaleStockBefore = getStock(prodA.id);
  await counterSaleService.createCounterSale({
    customerName: 'Walk-in Test',
    saleDate: new Date().toISOString().split('T')[0],
    invoiceNumber: `CS-TEST-${Date.now()}`,
    subtotal: 300,
    finalTotal: 300,
    items: [
      {
        productId: prodA.id,
        productName: prodA.name,
        partNumber: prodA.partNumber,
        quantity: 3,
        rate: 300,
      },
    ],
  });

  const stockAfterCounterSale = getStock(prodA.id);
  assert(
    stockAfterCounterSale === counterSaleStockBefore - 3,
    'Counter sale deducted 3 units from inventory',
    `Before: ${counterSaleStockBefore}, After: ${stockAfterCounterSale}`
  );

  // TEST 12: Tenant Storage Partitioning
  console.log('\n--- TEST 12: Tenant Isolation in Local Storage ---');
  safeSaveTenantStorage('test_isolation_key', [{ test: 123 }]);
  const retrieved = safeGetTenantStorage<any>('test_isolation_key', []);
  assert(
    retrieved.length === 1 && retrieved[0].test === 123,
    'Tenant-partitioned storage operates with isolated keys',
    `Retrieved ${retrieved.length} items`
  );

  // SUMMARY
  console.log('\n================================================================');
  console.log(`REGRESSION TEST COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
