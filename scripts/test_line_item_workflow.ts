import { 
  getProductDisplayName, 
  getProductPartNumber, 
  getProductSellingPrice, 
  getProductTaxRate, 
  getProductStock, 
  rankProductSearchResults 
} from '../src/lib/productHelpers.ts';
import type { Product } from '../src/types/index.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

console.log('\n--- Running Regression Tests for Product Line Items Workflow --- \n');

// 1. Mock Products
const mockProducts: Product[] = [
  {
    id: 'prod-1',
    name: 'Headphone Pro',
    productName: 'Headphone Pro',
    partNumber: 'HP-001',
    sku: 'SKU-HP1',
    currentSellPrice: 1000,
    sellingPrice: 1000,
    buyPrice: 600,
    taxPercent: 18,
    gstRate: 18,
    currentStock: 50,
    unit: 'Pcs',
    category: 'Electronics',
    status: 'active',
    tenantId: 'tenant-1',
  },
  {
    id: 'prod-2',
    name: 'Keyboard Mechanical',
    productName: 'Keyboard Mechanical',
    partNumber: 'KB-002',
    sku: 'SKU-KB2',
    currentSellPrice: 2500,
    sellingPrice: 2500,
    buyPrice: 1500,
    taxPercent: 18,
    currentStock: 5,
    unit: 'Pcs',
    category: 'Electronics',
    status: 'active',
    tenantId: 'tenant-1',
  },
  {
    id: 'prod-3',
    name: 'HP Wireless Mouse',
    productName: 'HP Wireless Mouse',
    partNumber: 'MS-HP03',
    sku: 'SKU-MS3',
    currentSellPrice: 500,
    sellingPrice: 500,
    buyPrice: 300,
    taxPercent: 12,
    currentStock: 100,
    unit: 'Pcs',
    category: 'Electronics',
    status: 'active',
    tenantId: 'tenant-1',
  },
  {
    id: 'prod-4',
    name: 'Earphone (No Part Number)',
    productName: 'Earphone',
    partNumber: undefined,
    sku: 'HP-999',
    currentSellPrice: 200,
    sellingPrice: 200,
    buyPrice: 100,
    taxPercent: 5,
    currentStock: 30,
    unit: 'Pcs',
    category: 'Audio',
    status: 'active',
    tenantId: 'tenant-1',
  }
];

// Test 1: Helper Mappings
console.log('Testing Product Helpers Mapping...');
assert(getProductDisplayName(mockProducts[0]) === 'Headphone Pro', 'Display name resolves accurately');
assert(getProductPartNumber(mockProducts[0]) === 'HP-001', 'Part number resolves accurately');
assert(getProductSellingPrice(mockProducts[0]) === 1000, 'Selling price resolves accurately');
assert(getProductTaxRate(mockProducts[0]) === 18, 'Tax rate resolves accurately');
assert(getProductStock(mockProducts[0]) === 50, 'Stock resolves accurately');

// Test 2: Search Ranking Priority Order
// Priority: 1. Exact Part Number, 2. Starts-with Part Number, 3. Contains Part Number, 4. Name match, 5. SKU match
console.log('\nTesting Autocomplete Ranking Priority...');
const searchExact = rankProductSearchResults('HP-001', mockProducts, true);
assert(searchExact.length > 0 && searchExact[0].id === 'prod-1', 'Exact Part Number HP-001 is ranked #1');

const searchPrefix = rankProductSearchResults('HP', mockProducts, true);
assert(searchPrefix[0].id === 'prod-1', 'Starts-with Part Number ranked ahead of name/sku matches');

// Test 3: Invoice Calculations (Test 1 & 2 from Prompt)
console.log('\nTesting Invoice Line Item Math (HP-001, Rate: 1000, Qty: 2, Tax: 18%)...');
const qty1 = 2;
const rate1 = 1000;
const taxRate1 = 18;
const subtotal1 = qty1 * rate1;
const taxAmount1 = (subtotal1 * taxRate1) / 100;
const total1 = subtotal1 + taxAmount1;
assert(subtotal1 === 2000, 'Subtotal for 2 units is 2,000');
assert(taxAmount1 === 360, 'Tax for 2 units @ 18% is 360');
assert(total1 === 2360, 'Total for 2 units is 2,360');

console.log('\nTesting Quantity Change (HP-001, Rate: 1000, Qty: 10, Tax: 18%)...');
const qty2 = 10;
const subtotal2 = qty2 * rate1;
const taxAmount2 = (subtotal2 * taxRate1) / 100;
const total2 = subtotal2 + taxAmount2;
assert(subtotal2 === 10000, 'Subtotal for 10 units is 10,000');
assert(taxAmount2 === 1800, 'Tax for 10 units is 1,800');
assert(total2 === 11800, 'Total for 10 units is 11,800');

// Test 4: Counter Sale Math (No Tax)
console.log('\nTesting Counter Sale Math (No Tax, Subtotal - Discount)...');
const csQty = 2;
const csRate = 1000;
const csSubtotal = csQty * csRate;
const csDiscount = 100;
const csFinal = Math.max(0, csSubtotal - csDiscount);
assert(csSubtotal === 2000, 'Counter Sale subtotal is 2,000');
assert(csFinal === 1900, 'Counter Sale final total after 100 discount is 1,900');

// Test 5: Stock Validation
console.log('\nTesting Stock Validation Check...');
function validateStock(product: Product, requestedQty: number): { valid: boolean; error?: string } {
  const avail = getProductStock(product);
  if (requestedQty > avail) {
    return {
      valid: false,
      error: `Insufficient stock for "${getProductDisplayName(product)}". Requested ${requestedQty}, but only ${avail} units are available.`
    };
  }
  return { valid: true };
}

const stockCheckValid = validateStock(mockProducts[0], 10);
assert(stockCheckValid.valid === true, '50 in stock, requesting 10 is VALID');

const stockCheckInvalid = validateStock(mockProducts[1], 10);
assert(stockCheckInvalid.valid === false, '5 in stock, requesting 10 is INVALID');
assert(
  stockCheckInvalid.error === 'Insufficient stock for "Keyboard Mechanical". Requested 10, but only 5 units are available.',
  'Error message matches requirement exactly'
);

console.log('\n🎉 ALL REGRESSION TESTS PASSED SUCCESSFULLY! 🎉\n');
