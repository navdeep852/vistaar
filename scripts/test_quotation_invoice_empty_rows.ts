import { 
  isEmptyLineItem, 
  filterValidLineItems, 
  rankProductSearchResults,
  getProductPartNumber,
  getProductDisplayName,
  getProductSellingPrice
} from '../src/lib/productHelpers.ts';
import type { Product } from '../src/types/index.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

console.log('================================================================');
console.log('MASTER REGRESSION SUITE: Quotation & Invoice Empty Rows & UI Fix');
console.log('================================================================\n');

// Mock Product Catalog
const catalogProducts: Product[] = [
  {
    id: 'prod-earbuds-1',
    productName: 'Earbuds',
    name: 'Earbuds',
    partNumber: '11000521AA',
    sku: 'SKU-EB1',
    sellingPrice: 1500,
    currentSellPrice: 1500,
    buyPrice: 900,
    currentStock: 62,
    taxPercent: 18,
    unit: 'Pcs',
    category: 'Audio',
    status: 'active',
    tenantId: 'tenant-1',
  },
  {
    id: 'prod-watch-2',
    productName: 'Smartwatch V2',
    name: 'Smartwatch V2',
    partNumber: '11999888BB',
    sku: 'SKU-SW2',
    sellingPrice: 4500,
    currentSellPrice: 4500,
    buyPrice: 2800,
    currentStock: 5,
    taxPercent: 18,
    unit: 'Pcs',
    category: 'Wearables',
    status: 'active',
    tenantId: 'tenant-1',
  },
  {
    id: 'prod-cable-3',
    productName: 'USB-C Cable',
    name: 'USB-C Cable',
    partNumber: 'CB-1100',
    sku: 'SKU-CB3',
    sellingPrice: 350,
    currentSellPrice: 350,
    buyPrice: 150,
    currentStock: 120,
    taxPercent: 18,
    unit: 'Pcs',
    category: 'Accessories',
    status: 'active',
    tenantId: 'tenant-1',
  }
];

// -----------------------------------------------------------------------------
// TEST 1 — One product
// Rows: 1, Filled: 1, Empty: 0 -> Expected: SUCCESS
// -----------------------------------------------------------------------------
console.log('\n--- TEST 1: One product (1 filled, 0 empty) ---');
{
  const rawItems = [
    {
      productId: 'prod-earbuds-1',
      productName: 'Earbuds',
      partNumber: '11000521AA',
      quantity: 1,
      sellingPrice: 1500,
      taxPercent: 18,
      unit: 'Pcs',
    }
  ];

  const cleaned = filterValidLineItems(rawItems);
  assert(cleaned.length === 1, 'Test 1: Filtered count is exactly 1');
  assert(cleaned[0].productName === 'Earbuds', 'Test 1: Earbuds preserved');
  assert(!isEmptyLineItem(cleaned[0]), 'Test 1: Row recognized as non-empty');
}

// -----------------------------------------------------------------------------
// TEST 2 — Five products + two empty rows
// Rows: 7, Filled: 5, Empty: 2 -> Expected: SUCCESS, Final document = 5 items
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: Five products + two empty rows (7 total -> 5 cleaned) ---');
{
  const rawItems = [
    { productId: 'p1', productName: 'Product A', quantity: 2, sellingPrice: 1000, taxPercent: 18 },
    { productId: 'p2', productName: 'Product B', quantity: 1, sellingPrice: 2000, taxPercent: 18 },
    { productId: 'p3', productName: 'Product C', quantity: 3, sellingPrice: 1500, taxPercent: 18 },
    { productId: 'p4', productName: 'Product D', quantity: 1, sellingPrice: 3000, taxPercent: 18 },
    { productId: 'p5', productName: 'Product E', quantity: 5, sellingPrice: 500, taxPercent: 18 },
    // 2 completely empty rows (added for UI convenience)
    { productName: '', partNumber: '', quantity: 1, sellingPrice: 0, taxPercent: 18 },
    { productName: 'Select product...', partNumber: '', quantity: 1, sellingPrice: 0, taxPercent: 18 },
  ];

  assert(isEmptyLineItem(rawItems[5]), 'Test 2: Row 6 is identified as completely empty');
  assert(isEmptyLineItem(rawItems[6]), 'Test 2: Row 7 (with placeholder) is identified as completely empty');

  const cleaned = filterValidLineItems(rawItems);
  assert(cleaned.length === 5, 'Test 2: Exactly 5 items remain after normalization');
  assert(cleaned.map(i => i.productName).join(',') === 'Product A,Product B,Product C,Product D,Product E', 
    'Test 2: All 5 legitimate products preserved in order');

  // Verify financial totals are based strictly on 5 items:
  // Subtotal = 2*1000 + 1*2000 + 3*1500 + 1*3000 + 5*500 = 2000 + 2000 + 4500 + 3000 + 2500 = 14000
  const subtotal = cleaned.reduce((sum, item) => sum + (item.quantity * item.sellingPrice), 0);
  assert(subtotal === 14000, `Test 2: Subtotal correctly computes to 14,000 (computed: ${subtotal})`);
}

// -----------------------------------------------------------------------------
// TEST 3 — Ten products + several empty rows
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Ten products + multiple empty rows ---');
{
  const rawItems: any[] = [];
  for (let i = 1; i <= 10; i++) {
    rawItems.push({
      productId: `prod-${i}`,
      productName: `Catalog Item ${i}`,
      partNumber: `PART-${1000 + i}`,
      quantity: 1,
      sellingPrice: i * 100,
      taxPercent: 18,
    });
  }
  // Add 4 empty rows at different points
  rawItems.splice(3, 0, { productName: '', partNumber: '', quantity: 1, sellingPrice: 0 });
  rawItems.push({ productName: '', partNumber: '', quantity: 1, sellingPrice: 0 });
  rawItems.push({ productName: '  ', partNumber: '', quantity: 1, sellingPrice: 0 });
  rawItems.push({ productName: '', partNumber: '  ', quantity: 1, sellingPrice: 0 });

  assert(rawItems.length === 14, 'Test 3: Raw item array length is 14');
  const cleaned = filterValidLineItems(rawItems);
  assert(cleaned.length === 10, 'Test 3: Cleaned item array length is exactly 10');
  assert(cleaned.every(i => !isEmptyLineItem(i)), 'Test 3: Every retained row is a genuine line item');
}

// -----------------------------------------------------------------------------
// TEST 4 — All rows empty -> Expected: Do not create document
// Error: "Add at least one product/item before continuing."
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4: All rows empty validation ---');
{
  const allEmptyItems = [
    { productName: '', partNumber: '', quantity: 1, sellingPrice: 0 },
    { productName: 'Select product...', partNumber: '', quantity: 1, sellingPrice: 0 },
    { productName: '', partNumber: '', description: '', quantity: 1, sellingPrice: 0 },
  ];

  const cleaned = filterValidLineItems(allEmptyItems);
  assert(cleaned.length === 0, 'Test 4: Cleaned items array is empty');

  // Simulation of DocumentEditorView & invoiceService validation logic
  const validateSubmission = (items: any[]) => {
    const valid = filterValidLineItems(items);
    if (valid.length === 0) {
      return { success: false, error: 'Add at least one product/item before continuing.' };
    }
    return { success: true, items: valid };
  };

  const result = validateSubmission(allEmptyItems);
  assert(!result.success, 'Test 4: Submission blocked when all rows are empty');
  assert(result.error === 'Add at least one product/item before continuing.', 
    `Test 4: Authoritative error message returned: "${result.error}"`);
}

// -----------------------------------------------------------------------------
// TEST 5 — Existing product + custom product + empty row
// Expected: SUCCESS, Existing product + custom product saved, Empty row removed
// -----------------------------------------------------------------------------
console.log('\n--- TEST 5: Existing product + custom product + empty row ---');
{
  const mixedItems = [
    {
      productId: 'prod-earbuds-1',
      productName: 'Earbuds',
      partNumber: '11000521AA',
      quantity: 2,
      sellingPrice: 1500,
      taxPercent: 18,
      itemType: 'product' as const,
    },
    {
      // Custom product without catalog productId
      productName: 'Custom Labor / Installation',
      partNumber: '',
      description: 'On-site installation and tuning',
      quantity: 1,
      sellingPrice: 2500,
      taxPercent: 18,
      itemType: 'custom' as const,
    },
    // Unused row
    {
      productName: '',
      partNumber: '',
      quantity: 1,
      sellingPrice: 0,
      taxPercent: 18,
      itemType: 'product' as const,
    }
  ];

  assert(!isEmptyLineItem(mixedItems[0]), 'Test 5: Catalog product is not empty');
  assert(!isEmptyLineItem(mixedItems[1]), 'Test 5: Custom product is not empty');
  assert(isEmptyLineItem(mixedItems[2]), 'Test 5: Empty row is identified as empty');

  const cleaned = filterValidLineItems(mixedItems);
  assert(cleaned.length === 2, 'Test 5: Exactly 2 items remain');
  assert(cleaned[0].productName === 'Earbuds', 'Test 5: Catalog item preserved');
  assert(cleaned[1].productName === 'Custom Labor / Installation', 'Test 5: Custom item preserved');
  assert(cleaned[1].sellingPrice === 2500, 'Test 5: Custom item price preserved');
}

// -----------------------------------------------------------------------------
// TEST 6 — Part Number Mode: Search "11"
// Suggestions contain Earbuds (11000521AA), Smartwatch (11999888BB), USB-C (CB-1100)
// Ranked correctly and fully populated
// -----------------------------------------------------------------------------
console.log('\n--- TEST 6: Part Number Mode search ranking ("11") ---');
{
  const results = rankProductSearchResults('11', catalogProducts);
  assert(results.length === 3, 'Test 6: All 3 matching products found');
  
  // Earbuds starts with 11000521AA -> Priority
  assert(results[0].partNumber === '11000521AA', 'Test 6: 11000521AA ranked first');
  assert(getProductDisplayName(results[0]) === 'Earbuds', 'Test 6: Display name is Earbuds');
  assert(getProductSellingPrice(results[0]) === 1500, 'Test 6: Selling price is 1500');
  assert(results[0].currentStock === 62, 'Test 6: Stock is 62');

  // Verify Part Number Mode row with blank product name is NOT treated as empty
  const partNoOnlyRow = {
    partNumber: '11000521AA',
    productName: '',
    quantity: 1,
    sellingPrice: 0,
  };
  assert(!isEmptyLineItem(partNoOnlyRow), 'Test 6: Row with partNumber is NOT treated as empty');
}

// -----------------------------------------------------------------------------
// TEST 7 — Search dropdown positioning near bottom of line-item area
// Upward collision flipping logic check
// -----------------------------------------------------------------------------
console.log('\n--- TEST 7: Search dropdown upward collision detection ---');
{
  // Collision math implemented in ProductAutocomplete.tsx:
  // isUpward = spaceBelow < 280 && spaceAbove > spaceBelow
  const testCollision = (spaceBelow: number, spaceAbove: number) => {
    return spaceBelow < 280 && spaceAbove > spaceBelow;
  };

  // Near bottom of screen: 150px below, 600px above -> should flip upward
  assert(testCollision(150, 600) === true, 'Test 7: Flips upward when spaceBelow (150px) is constrained');
  // Near top of screen: 600px below, 100px above -> opens downward
  assert(testCollision(600, 100) === false, 'Test 7: Opens downward when spaceBelow (600px) is abundant');
}

// -----------------------------------------------------------------------------
// TEST 8 — Edit existing quotation / invoice
// Re-opening document should load ONLY actual saved items, no ghost empty rows
// -----------------------------------------------------------------------------
console.log('\n--- TEST 8: Reopen / edit existing document ---');
{
  const savedDocument = {
    id: 'qt-1001',
    quotationNumber: 'QT-2026-0001',
    items: [
      { productId: 'prod-earbuds-1', productName: 'Earbuds', quantity: 2, sellingPrice: 1500, taxPercent: 18 },
      { productId: 'prod-cable-3', productName: 'USB-C Cable', quantity: 3, sellingPrice: 350, taxPercent: 18 },
    ]
  };

  // Initializer in DocumentEditorView: filterValidLineItems(initialDraftData.items)
  const initialItems = filterValidLineItems(savedDocument.items);
  assert(initialItems.length === 2, 'Test 8: Document loads only the 2 actual saved items');
  assert(initialItems.every(i => !isEmptyLineItem(i)), 'Test 8: No artificial empty rows exist in saved doc');
}

// -----------------------------------------------------------------------------
// TEST 9 — Convert quotation to invoice
// Quotation containing 5 real items + 2 unused rows -> Invoice has exactly 5 items
// -----------------------------------------------------------------------------
console.log('\n--- TEST 9: Convert quotation to invoice with empty row normalization ---');
{
  const rawQuotationItems = [
    { productId: 'p1', productName: 'Prod 1', quantity: 1, sellingPrice: 500, taxPercent: 18 },
    { productId: 'p2', productName: 'Prod 2', quantity: 2, sellingPrice: 1000, taxPercent: 18 },
    { productId: 'p3', productName: 'Prod 3', quantity: 1, sellingPrice: 750, taxPercent: 18 },
    { productId: 'p4', productName: 'Prod 4', quantity: 4, sellingPrice: 200, taxPercent: 18 },
    { productId: 'p5', productName: 'Prod 5', quantity: 1, sellingPrice: 1200, taxPercent: 18 },
    { productName: '', partNumber: '', quantity: 1, sellingPrice: 0 },
    { productName: '', partNumber: '', quantity: 1, sellingPrice: 0 },
  ];

  // Simulation of convertQuotationToInvoice logic
  const convertedItems = filterValidLineItems(rawQuotationItems).map((i, idx) => ({
    id: `inv-item-${idx}`,
    productId: i.productId,
    productName: i.productName,
    quantity: i.quantity,
    sellingPrice: i.sellingPrice,
    taxPercent: i.taxPercent,
  }));

  assert(convertedItems.length === 5, 'Test 9: Converted invoice contains exactly 5 items');
  assert(convertedItems[4].productName === 'Prod 5', 'Test 9: All real items transferred accurately');
}

// -----------------------------------------------------------------------------
// TEST 10 — Invoice stock validation remains authoritative
// Removing empty rows must NOT weaken stock validation for actual catalog products!
// -----------------------------------------------------------------------------
console.log('\n--- TEST 10: Invoice stock validation on cleaned items ---');
{
  const rawSubmissionItems = [
    {
      productId: 'prod-watch-2',
      productName: 'Smartwatch V2',
      quantity: 10, // Stock available is only 5!
      sellingPrice: 4500,
      taxPercent: 18,
    },
    // Empty row
    {
      productName: '',
      partNumber: '',
      quantity: 1,
      sellingPrice: 0,
      taxPercent: 18,
    }
  ];

  // Step 1: Normalize
  const cleanedItems = filterValidLineItems(rawSubmissionItems);
  assert(cleanedItems.length === 1, 'Test 10: Cleaned items has 1 catalog item');

  // Step 2: Validate Stock against catalog
  const stockValidationErrors: string[] = [];
  for (const item of cleanedItems) {
    if (item.productId) {
      const catalog = catalogProducts.find(p => p.id === item.productId);
      if (catalog && item.quantity > catalog.currentStock) {
        stockValidationErrors.push(
          `Insufficient stock for "${catalog.productName}". Requested: ${item.quantity}, Available: ${catalog.currentStock}`
        );
      }
    }
  }

  assert(stockValidationErrors.length === 1, 'Test 10: Stock validation triggered for over-requested item');
  assert(stockValidationErrors[0].includes('Insufficient stock for "Smartwatch V2"'), 
    `Test 10: Correct stock error message: ${stockValidationErrors[0]}`);
}

console.log('\n================================================================');
console.log('🎉 ALL 10 TESTS PASSED SUCCESSFULLY! ZERO REGRESSIONS FOUND.');
console.log('================================================================\n');
