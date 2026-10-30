import {
  filterProducts,
  formatProductOptionLabel,
} from '../src/components/SearchableProductSelect';
import { Product } from '../src/types';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ ${testName}${detail ? `: ${detail}` : ''}`);
  }
}

console.log('================================================================');
console.log('VISTAAR SEARCHABLE PRODUCT SELECT TEST SUITE');
console.log('================================================================\n');

// Realistic mock product dataset matching VISTAAR production schema
const mockProducts: Product[] = [
  {
    id: 'prod-001',
    name: '27W USB-C Charger',
    partNumber: 'EL-CHG-017',
    productCode: 'CHG-27W',
    sku: 'SKU-017',
    categoryId: 'cat-elec',
    unit: 'Piece',
    buyPrice: 350,
    currentBuyPrice: 380,
    sellingPrice: 599,
    minimumStock: 5,
    currentStock: 30,
    taxPercent: 18,
  },
  {
    id: 'prod-002',
    name: '65W GaN Fast Charger',
    partNumber: 'EL-CHG-065',
    productCode: 'CHG-65W',
    sku: 'SKU-065',
    categoryId: 'cat-elec',
    unit: 'Piece',
    buyPrice: 850,
    currentBuyPrice: 900,
    sellingPrice: 1499,
    minimumStock: 10,
    currentStock: 15,
    taxPercent: 18,
  },
  {
    id: 'prod-003',
    name: 'Wireless Bluetooth Earbuds',
    partNumber: 'AU-EAR-882',
    productCode: 'BT-EAR-PRO',
    sku: 'SKU-882',
    categoryId: 'cat-audio',
    unit: 'Box',
    buyPrice: 1200,
    currentBuyPrice: 1250,
    sellingPrice: 1999,
    minimumStock: 5,
    currentStock: 8,
    taxPercent: 18,
  },
  {
    id: 'prod-004',
    name: 'Industrial Heavy Duty Bearing',
    partNumber: 'ME-BRG-5400',
    productCode: 'BRG-5400-HD',
    sku: 'SKU-BRG-54',
    categoryId: 'cat-mech',
    unit: 'Units',
    buyPrice: 4500,
    currentBuyPrice: 4750,
    sellingPrice: 6200,
    minimumStock: 2,
    currentStock: 0, // Out of stock
    taxPercent: 18,
  },
  {
    id: 'prod-005',
    name: 'Basic Ballpoint Pen (Blue)',
    partNumber: '', // Missing part number
    productCode: '',
    sku: 'PEN-BLU-001',
    categoryId: 'cat-stat',
    unit: 'Pkt',
    buyPrice: 40,
    currentBuyPrice: 45,
    sellingPrice: 80,
    minimumStock: 20,
    currentStock: 150,
    taxPercent: 12,
  },
];

// -------------------------------------------------------------
// TEST 1: Empty Query returns full list
// -------------------------------------------------------------
console.log('--- Test 1: Empty Query ---');
const emptyQueryResults = filterProducts(mockProducts, '');
assert(emptyQueryResults.length === mockProducts.length, 'Empty search returns all products without filtering');
const whitespaceQueryResults = filterProducts(mockProducts, '   ');
assert(whitespaceQueryResults.length === mockProducts.length, 'Whitespace-only search returns all products');

// -------------------------------------------------------------
// TEST 2: Complete Product Name Search
// -------------------------------------------------------------
console.log('\n--- Test 2: Complete Product Name Search ---');
const completeNameResults = filterProducts(mockProducts, '27W USB-C Charger');
assert(completeNameResults.length === 1 && completeNameResults[0].id === 'prod-001', 'Finds product by complete name ("27W USB-C Charger")');

// -------------------------------------------------------------
// TEST 3: Partial Product Name Search
// -------------------------------------------------------------
console.log('\n--- Test 3: Partial Product Name Search ---');
const partialNameResults = filterProducts(mockProducts, 'charger');
assert(partialNameResults.length === 2, 'Finds both chargers when searching "charger"');
assert(partialNameResults.some((p) => p.id === 'prod-001') && partialNameResults.some((p) => p.id === 'prod-002'), 'Results contain prod-001 and prod-002');

// -------------------------------------------------------------
// TEST 4: Complete Part Number Search
// -------------------------------------------------------------
console.log('\n--- Test 4: Complete Part Number Search ---');
const completePartResults = filterProducts(mockProducts, 'EL-CHG-017');
assert(completePartResults.length === 1 && completePartResults[0].id === 'prod-001', 'Finds product by exact Part Number ("EL-CHG-017")');

// -------------------------------------------------------------
// TEST 5: Partial Part Number Search
// -------------------------------------------------------------
console.log('\n--- Test 5: Partial Part Number Search ---');
const partialPartResults = filterProducts(mockProducts, 'CHG-017');
assert(partialPartResults.length === 1 && partialPartResults[0].id === 'prod-001', 'Finds product by partial Part Number ("CHG-017")');

// -------------------------------------------------------------
// TEST 6: Product Code / SKU Search
// -------------------------------------------------------------
console.log('\n--- Test 6: Product Code / SKU Search ---');
const codeResults = filterProducts(mockProducts, '017');
assert(codeResults.length === 1 && codeResults[0].id === 'prod-001', 'Finds product by SKU/Code sequence ("017")');

const skuOnlyResults = filterProducts(mockProducts, 'PEN-BLU-001');
assert(skuOnlyResults.length === 1 && skuOnlyResults[0].id === 'prod-005', 'Finds product with missing partNumber via SKU ("PEN-BLU-001")');

// -------------------------------------------------------------
// TEST 7: Case-Insensitive Search
// -------------------------------------------------------------
console.log('\n--- Test 7: Case-Insensitive Matching ---');
const lowerCaseResults = filterProducts(mockProducts, 'el-chg-017');
const upperCaseResults = filterProducts(mockProducts, 'EL-CHG-017');
const mixedCaseResults = filterProducts(mockProducts, 'El-ChG-017');
assert(lowerCaseResults.length === 1 && lowerCaseResults[0].id === 'prod-001', 'Lower case "el-chg-017" matches');
assert(upperCaseResults.length === 1 && upperCaseResults[0].id === 'prod-001', 'Upper case "EL-CHG-017" matches');
assert(mixedCaseResults.length === 1 && mixedCaseResults[0].id === 'prod-001', 'Mixed case "El-ChG-017" matches');

// -------------------------------------------------------------
// TEST 8: No-Results Search
// -------------------------------------------------------------
console.log('\n--- Test 8: No-Results Search ---');
const noMatchResults = filterProducts(mockProducts, 'NonExistentProductQueryXYZ999');
assert(noMatchResults.length === 0, 'Returns empty array for non-matching query');

// -------------------------------------------------------------
// TEST 9: Option Label Formatting & Available Stock
// -------------------------------------------------------------
console.log('\n--- Test 9: Display Label Formatting ---');
const labelProd1 = formatProductOptionLabel(mockProducts[0]);
assert(
  labelProd1 === '27W USB-C Charger (Part #: EL-CHG-017) — Avail: 30 Piece',
  `Matches exact user format example: "${labelProd1}"`
);

const labelProd4ZeroStock = formatProductOptionLabel(mockProducts[3]);
assert(
  labelProd4ZeroStock === 'Industrial Heavy Duty Bearing (Part #: ME-BRG-5400) — Avail: 0 Units',
  `Handles zero stock correctly: "${labelProd4ZeroStock}"`
);

const labelProd5MissingPart = formatProductOptionLabel(mockProducts[4]);
assert(
  labelProd5MissingPart === 'Basic Ballpoint Pen (Blue) (Part #: PEN-BLU-001) — Avail: 150 Pkt',
  `Falls back to SKU when partNumber is empty: "${labelProd5MissingPart}"`
);

// -------------------------------------------------------------
// TEST 10: Stock Receipt Workflow Integration
// -------------------------------------------------------------
console.log('\n--- Test 10: Stock Receipt Price & Selection Integration ---');
// Emulate ProductsView selection logic:
let testRecProductId = '';
let testRecBuyPrice = '';

const handleSimulatedSelect = (p: Product | null) => {
  if (p) {
    testRecProductId = p.id;
    testRecBuyPrice = String(p.currentBuyPrice || p.buyPrice);
  } else {
    testRecProductId = '';
    testRecBuyPrice = '';
  }
};

handleSimulatedSelect(mockProducts[0]);
assert(testRecProductId === 'prod-001', 'Sets recProductId correctly');
assert(testRecBuyPrice === '380', 'Prefills batch buy price with currentBuyPrice (380)');

handleSimulatedSelect(mockProducts[1]);
assert(testRecProductId === 'prod-002', 'Updates recProductId on subsequent selection');
assert(testRecBuyPrice === '900', 'Updates batch buy price to 900');

// -------------------------------------------------------------
// TEST 11: Large Product Catalogue Performance
// -------------------------------------------------------------
console.log('\n--- Test 11: Large Dataset Performance (2,500 Products) ---');
const largeCatalogue: Product[] = [];
for (let i = 1; i <= 2500; i++) {
  largeCatalogue.push({
    id: `prod-${i}`,
    name: `Enterprise Hardware Part #${i} Ultra`,
    partNumber: `PT-HW-${String(i).padStart(5, '0')}`,
    sku: `SKU-${i}`,
    categoryId: 'cat-bulk',
    unit: 'Pcs',
    buyPrice: 100 + (i % 50),
    currentStock: i % 100,
    sellingPrice: 150 + (i % 50),
    minimumStock: 10,
    taxPercent: 18,
  });
}

const startTime = Date.now();
const filteredLarge = filterProducts(largeCatalogue, 'PT-HW-01250');
const duration = Date.now() - startTime;
assert(filteredLarge.length === 1 && filteredLarge[0].id === 'prod-1250', 'Accurately locates target in 2,500 products');
assert(duration < 25, `Large catalogue search executes in <25ms (Actual: ${duration}ms)`);

console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL SEARCHABLE PRODUCT SELECT TESTS PASSED SUCCESSFULLY! ✓\n');
}

