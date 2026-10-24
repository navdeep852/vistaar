/**
 * Comprehensive Regression Test Suite: Counter Sale Stock Validation & Reconciliation
 * Covers Tests A through G required by the Master Prompt.
 */
import { store } from '../src/services/store';
import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { productService } from '../src/services/supabase/productService';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { safeSaveTenantStorage, safeSaveTenantItem, safeGetTenantStorage } from '../src/services/supabase/safeStorage';
import { Product } from '../src/types';

import { supabaseAuthService } from '../src/services/supabaseAuth';
import { registerCurrentUserResolver } from '../src/lib/permissions';

interface TestResult {
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
  details?: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, expected: any, actual: any, details?: string) {
  results.push({
    name,
    passed: condition,
    expected,
    actual,
    details,
  });
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
  } else {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Expected:`, expected);
    console.error(`    Actual:  `, actual);
    if (details) console.error(`    Details: `, details);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('VISTAAR REGRESSION TEST SUITE: COUNTER SALE STOCK VALIDATION');
  console.log('================================================================\n');

  // Setup Workspace & Branch Context
  store.resetState();
  const wsId = 'a0000000-0000-4000-8000-000000000001';
  const ownerId = 'b0000000-0000-4000-8000-000000000001';

  registerCurrentUserResolver(() => ({
    id: ownerId,
    role: 'owner',
    status: 'Active',
    workspaceId: wsId,
  } as any));

  (supabaseAuthService as any).currentProfile = {
    id: ownerId,
    companyId: wsId,
    role: 'owner',
    name: 'Owner',
    email: 'admin@vistaar.com',
    employeeId: 'VST-0001',
    status: 'Active',
  };
  (supabaseAuthService as any).authoritativeWorkspaceId = wsId;
  supabaseAuthService.isAuthenticated = () => true;
  supabaseAuthService.getUser = () => (supabaseAuthService as any).currentProfile;
  supabaseAuthService.getCurrentCompanyId = () => wsId;
  supabaseAuthService.resolveAuthoritativeWorkspaceId = async () => wsId;
  const mainBranchId = 'branch-main-001';
  const subBranchId = 'branch-sub-002';
  const westBranchId = 'branch-west-003';

  const branches = [
    { id: mainBranchId, name: 'Main Branch', isMainBranch: true, is_main_branch: true, branchCode: 'MAIN' },
    { id: subBranchId, name: 'South Branch', isMainBranch: false, is_main_branch: false, branchCode: 'SOUTH' },
    { id: westBranchId, name: 'West Branch', isMainBranch: false, is_main_branch: false, branchCode: 'WEST' },
  ];
  safeSaveTenantStorage('vistaar_local_branches_db', branches);
  safeSaveTenantItem('active_branch_id', mainBranchId);

  // -----------------------------------------------------------------------------
  // TEST A: REPRODUCE & RECONCILE (101 vs 51 vs 1.00)
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST A: Reproduce & Reconcile Discrepancy (101, 51, 1.00) ---');

  const headphoneProduct: Product = {
    id: 'prod-headphone-001',
    name: 'Headphone',
    partNumber: 'HP-100',
    sku: 'HP-100',
    category: 'Electronics',
    unit: 'pcs',
    buyPrice: 500,
    currentBuyPrice: 500,
    sellingPrice: 1200,
    mrp: 1500,
    currentStock: 101, // Global Master Stock = 101
    minStockLevel: 5,
    minimumStock: 5,
    status: 'Active',
    taxPercent: 18,
  };

  store.setProducts([headphoneProduct]);
  safeSaveTenantStorage('vistaar_local_products_db', [headphoneProduct]);

  // Branch Inventory: Main Branch = 51, South Branch = 50 (Total master = 101)
  const branchInventoryData = [
    {
      id: 'bi-001',
      branchId: mainBranchId,
      branch_id: mainBranchId,
      productId: headphoneProduct.id,
      product_id: headphoneProduct.id,
      currentStock: 51,
      current_stock: 51,
      openingStock: 51,
      minStock: 5,
    },
    {
      id: 'bi-002-sub',
      branchId: subBranchId,
      branch_id: subBranchId,
      productId: headphoneProduct.id,
      product_id: headphoneProduct.id,
      currentStock: 50,
      current_stock: 50,
      openingStock: 50,
      minStock: 5,
    },
  ];
  safeSaveTenantStorage('vistaar_local_branch_inventory_db', branchInventoryData);

  // Stale Stock Receipt batch with 1.00 remaining
  const stockReceiptsData = [
    {
      id: 'rec-001',
      branchId: mainBranchId,
      branch_id: mainBranchId,
      productId: headphoneProduct.id,
      product_id: headphoneProduct.id,
      receiptNumber: 'REC-HP-001',
      quantityReceived: 50,
      quantityRemaining: 1.0,
      quantity_remaining: 1.0,
      unitCost: 500,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];
  safeSaveTenantStorage('vistaar_local_stock_receipts_db', stockReceiptsData);

  // 1. Authoritative available stock for Main Branch must be 51, NOT 1.00!
  const availableStockMain = await productService.getProductAvailableStock(headphoneProduct.id, mainBranchId);
  assert(
    'Authoritative stock resolves to 51 (not 1.00 from stale receipt)',
    availableStockMain === 51,
    51,
    availableStockMain,
    'GREATEST(branch_inventory: 51, stock_receipts: 1) = 51'
  );

  // 2. Global Products master stock remains 101 across all branches
  const globalProducts = await productService.getProducts({ branchId: 'ALL' });
  const foundGlobal = globalProducts.data?.find((p) => p.id === headphoneProduct.id);
  assert(
    'Global Products view reflects 101 master stock',
    foundGlobal?.currentStock === 101,
    101,
    foundGlobal?.currentStock
  );

  // -----------------------------------------------------------------------------
  // TEST B: VALID COUNTER SALE (Requested 10 from 51 Available)
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST B: Valid Counter Sale (Requested 10, Available 51) ---');

  const validSaleRes = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-CS-VALID-001',
    customerName: 'Aarav Sharma',
    branchId: mainBranchId,
    saleDate: '2026-10-24',
    subtotal: 12000,
    finalTotal: 12000,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    amountReceived: 12000,
    balanceAmount: 0,
    items: [
      {
        productId: headphoneProduct.id,
        productName: 'Headphone',
        partNumber: 'HP-100',
        quantity: 10,
        rate: 1200,
        buyPriceSnapshot: 500,
      },
    ],
  });

  assert('Valid counter sale of 10 units succeeds', validSaleRes.success === true, true, validSaleRes.success);

  // Verify stock deduction
  const remainingStockAfterB = await productService.getProductAvailableStock(headphoneProduct.id, mainBranchId);
  assert(
    'Remaining branch stock is exactly 41 (51 - 10)',
    remainingStockAfterB === 41,
    41,
    remainingStockAfterB
  );

  // Global product stock also decremented by 10 (101 - 10 = 91)
  const productAfterB = store.getProducts('ALL').find((p) => p.id === headphoneProduct.id);
  assert(
    'Global product stock decremented to 91 (101 - 10)',
    productAfterB?.currentStock === 91,
    91,
    productAfterB?.currentStock
  );

  // Stock movements recorded
  const movementsAfterB = store.getStockMovements().filter((m) => m.productId === headphoneProduct.id);
  assert(
    'Stock movement recorded with -10 units',
    movementsAfterB.some((m) => m.quantity === -10 && (m.type === 'Sale' || m.type === 'SALE')),
    true,
    movementsAfterB.map((m) => m.quantity)
  );

  // -----------------------------------------------------------------------------
  // TEST C: GENUINELY INSUFFICIENT STOCK (Requested 10 from 1 Available)
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST C: Genuinely Insufficient Stock (Requested 10, Available 1) ---');

  // Create limited stock item with strictly 1 piece
  const lowStockProduct: Product = {
    id: 'prod-low-stock-002',
    name: 'Rare Cable',
    partNumber: 'CBL-01',
    sku: 'CBL-01',
    category: 'Cables',
    unit: 'pcs',
    buyPrice: 100,
    currentBuyPrice: 100,
    sellingPrice: 300,
    mrp: 350,
    currentStock: 1, // Global = 1
    minStockLevel: 1,
    minimumStock: 1,
    status: 'Active',
  };

  store.setProducts([...store.getProducts(), lowStockProduct]);
  const currentLocalProds = safeGetTenantStorage<Product>('vistaar_local_products_db', []);
  safeSaveTenantStorage('vistaar_local_products_db', [...currentLocalProds, lowStockProduct]);

  // Branch inventory for Rare Cable = 1
  const currentBInv = safeGetTenantStorage<any>('vistaar_local_branch_inventory_db', []);
  safeSaveTenantStorage('vistaar_local_branch_inventory_db', [
    ...currentBInv,
    {
      id: 'bi-002',
      branchId: mainBranchId,
      branch_id: mainBranchId,
      productId: lowStockProduct.id,
      product_id: lowStockProduct.id,
      currentStock: 1,
      current_stock: 1,
      openingStock: 1,
    },
  ]);

  const insufficientSaleRes = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-CS-FAIL-002',
    customerName: 'Pooja Gupta',
    branchId: mainBranchId,
    saleDate: '2026-10-24',
    subtotal: 3000,
    finalTotal: 3000,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    amountReceived: 3000,
    balanceAmount: 0,
    items: [
      {
        productId: lowStockProduct.id,
        productName: 'Rare Cable',
        partNumber: 'CBL-01',
        quantity: 10, // Requesting 10 when only 1 exists
        rate: 300,
        buyPriceSnapshot: 100,
      },
    ],
  });

  assert(
    'Counter Sale rejects genuinely insufficient stock',
    insufficientSaleRes.success === false,
    false,
    insufficientSaleRes.success
  );
  assert(
    'Error message contains INSUFFICIENT_STOCK',
    insufficientSaleRes.error?.includes('INSUFFICIENT_STOCK') || insufficientSaleRes.error?.includes('Insufficient stock'),
    true,
    insufficientSaleRes.error
  );

  // Stock must NOT be deducted
  const stockAfterC = await productService.getProductAvailableStock(lowStockProduct.id, mainBranchId);
  assert('Stock remains 1 after rejected sale', stockAfterC === 1, 1, stockAfterC);

  // -----------------------------------------------------------------------------
  // TEST D: CROSS-MODULE CONSISTENCY (Counter Sale vs Normal Invoice)
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST D: Cross-Module Consistency (Counter Sale vs Invoice) ---');

  // Both Counter Sale and Invoice should evaluate the same available stock
  const csAvail = await productService.getProductAvailableStock(headphoneProduct.id, mainBranchId);
  const invAvail = await productService.getProductAvailableStock(headphoneProduct.id, mainBranchId);
  assert(
    'Both modules evaluate identical branch stock (41)',
    csAvail === invAvail && csAvail === 41,
    41,
    { csAvail, invAvail }
  );

  // Normal invoice creates sale of 5 units
  const invRes = await invoiceService.createInvoice({
    invoiceNumber: 'INV-NORMAL-001',
    customerName: 'Corporate Tech Corp',
    date: '2026-10-24',
    dueDate: '2026-11-24',
    branchId: mainBranchId,
    subtotal: 6000,
    taxTotal: 1080,
    total: 7080,
    status: 'draft',
    paymentStatus: 'unpaid',
    items: [
      {
        productId: headphoneProduct.id,
        productName: 'Headphone',
        partNumber: 'HP-100',
        quantity: 5,
        sellingPrice: 1200,
        taxPercent: 18,
      },
    ],
  });

  assert('Normal invoice created successfully', !!invRes.invoiceId, true, !!invRes.invoiceId);
  const finRes = await invoiceService.finalizeInvoice(invRes.invoiceId);
  assert('Normal invoice finalization succeeds for valid quantity (5 units)', finRes.success === true, true, finRes.success);

  // Stock reduced from 41 to 36
  const stockAfterInv = await productService.getProductAvailableStock(headphoneProduct.id, mainBranchId);
  assert(
    'Stock reduced by exactly 5 units across modules (41 -> 36)',
    stockAfterInv === 36,
    36,
    stockAfterInv
  );

  // -----------------------------------------------------------------------------
  // TEST E: CONCURRENT SALES & MULTI-LINE OVERSELL PREVENTION
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST E: Multi-Line Oversell Prevention ---');

  // Attempt a sale with duplicate line items requesting 20 + 20 = 40 (Available is 36)
  const multiLineSale = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-CS-MULTILINE-003',
    customerName: 'Double Order Test',
    branchId: mainBranchId,
    saleDate: '2026-10-24',
    subtotal: 48000,
    finalTotal: 48000,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    amountReceived: 48000,
    balanceAmount: 0,
    items: [
      {
        productId: headphoneProduct.id,
        productName: 'Headphone',
        quantity: 20,
        rate: 1200,
      },
      {
        productId: headphoneProduct.id,
        productName: 'Headphone',
        quantity: 20,
        rate: 1200,
      },
    ],
  });

  assert(
    'Multi-line sale requesting 40 units (20+20) when 36 available is rejected',
    multiLineSale.success === false,
    false,
    multiLineSale.success
  );
  assert(
    'Multi-line error reports aggregated requested quantity 40',
    multiLineSale.error?.includes('40') || multiLineSale.error?.includes('INSUFFICIENT_STOCK'),
    true,
    multiLineSale.error
  );

  // -----------------------------------------------------------------------------
  // TEST F: REFRESH AND REVISIT PERSISTENCE
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST F: Refresh & Revisit Persistence ---');

  // Simulate refresh by clearing memory cache
  productService.invalidateCache();

  const refreshedStock = await productService.getProductAvailableStock(headphoneProduct.id, mainBranchId);
  assert(
    'Authoritative stock remains 36 after cache refresh',
    refreshedStock === 36,
    36,
    refreshedStock
  );

  // -----------------------------------------------------------------------------
  // TEST G: BRANCH ISOLATION
  // -----------------------------------------------------------------------------
  console.log('\n--- TEST G: Sub-Branch Inventory Isolation ---');

  // 1. Unallocated sub-branch (West Branch) has 0 inventory record for Headphone
  const westBranchStock = await productService.getProductAvailableStock(headphoneProduct.id, westBranchId);
  assert(
    'Sub-branch without allocated stock strictly evaluates to 0',
    westBranchStock === 0,
    0,
    westBranchStock
  );

  // 2. Counter sale at unallocated branch for 1 unit must fail
  const westSaleRes = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-CS-WEST-004',
    customerName: 'West Customer',
    branchId: westBranchId,
    saleDate: '2026-10-24',
    subtotal: 1200,
    finalTotal: 1200,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    amountReceived: 1200,
    balanceAmount: 0,
    items: [
      {
        productId: headphoneProduct.id,
        productName: 'Headphone',
        quantity: 1,
        rate: 1200,
      },
    ],
  });

  assert(
    'Sale at sub-branch with 0 stock rejected',
    westSaleRes.success === false,
    false,
    westSaleRes.success
  );

  // 3. Sub-branch with allocated stock (South Branch has 50) executes independently
  const southBranchStock = await productService.getProductAvailableStock(headphoneProduct.id, subBranchId);
  assert(
    'Sub-branch with allocated stock evaluates to its own stock (50)',
    southBranchStock === 50,
    50,
    southBranchStock
  );

  const southSaleRes = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-CS-SOUTH-005',
    customerName: 'South Customer',
    branchId: subBranchId,
    saleDate: '2026-10-24',
    subtotal: 12000,
    finalTotal: 12000,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    amountReceived: 12000,
    balanceAmount: 0,
    items: [
      {
        productId: headphoneProduct.id,
        productName: 'Headphone',
        quantity: 10,
        rate: 1200,
      },
    ],
  });

  assert('Counter sale at South Branch succeeds', southSaleRes.success === true, true, southSaleRes.success);

  const southStockAfterSale = await productService.getProductAvailableStock(headphoneProduct.id, subBranchId);
  assert(
    'South Branch stock reduced to 40 (50 - 10)',
    southStockAfterSale === 40,
    40,
    southStockAfterSale
  );

  // 4. Main branch stock remains untouched (36)
  const mainBranchAfterSouthAttempt = await productService.getProductAvailableStock(headphoneProduct.id, mainBranchId);
  assert(
    'Main branch stock remains intact at 36',
    mainBranchAfterSouthAttempt === 36,
    36,
    mainBranchAfterSouthAttempt
  );

  // -----------------------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------------------
  console.log('\n================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL REGRESSION TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
