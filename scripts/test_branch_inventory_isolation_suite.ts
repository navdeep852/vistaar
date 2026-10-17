/**
 * MASTER VERIFICATION TEST SUITE: Branch-Wise Inventory Isolation & Stock Transfer Synchronization
 * 
 * Verifies Tests A through I from the Master Prompt:
 * Test A: Independent branch stock (Main: 200, testbranch: 48, All Branches Analysis: 248)
 * Test B: Transfer accuracy (Transfer 100 Main -> testbranch => Main: 100, testbranch: 148, History: 100)
 * Test C: Repeated transfer submission / Idempotency (same key submitted twice)
 * Test D: Insufficient source stock rejection (0 mutation)
 * Test E: Concurrent transfer race condition safety (stock never negative)
 * Test F: Product identity (SKU/part-number matching, no cross-product bleed)
 * Test G: Inventory-consuming operations (sale from testbranch leaves Main unchanged)
 * Test H: Persistence after restart (cold cache reload preserves all balances)
 * Test I: Tenant and branch security (unauthorized cross-tenant rejection)
 */

import { branchService } from '../src/services/supabase/branchService';
import { productService } from '../src/services/supabase/productService';
import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { store } from '../src/services/store';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { safeGetTenantStorage, safeSaveTenantStorage, safeSaveTenantItem, safeGetTenantItem } from '../src/services/supabase/safeStorage';
import { Branch, Product, StockTransfer, StockMovement } from '../src/types';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}${detail ? ` — ${detail}` : ''}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
    process.exitCode = 1;
  }
}

async function runMasterSuite() {
  console.log('========================================================================');
  console.log('🚀 MASTER PROMPT VERIFICATION: BRANCH INVENTORY ISOLATION & TRANSFERS');
  console.log('========================================================================\n');

  const wsId = 'a0000000-0000-4000-8000-000000000001';
  const ownerId = 'b0000000-0000-4000-8000-000000000001';
  safeSaveTenantItem('active_company_id', wsId);
  (supabaseAuthService as any).currentProfile = {
    id: ownerId,
    companyId: wsId,
    role: 'owner',
    name: 'Navdeep Owner',
    email: 'owner@vistaar.com',
    employeeId: 'VST-0001',
    status: 'Active',
  };
  (supabaseAuthService as any).authoritativeWorkspaceId = wsId;
  supabaseAuthService.isAuthenticated = () => true;
  supabaseAuthService.getUser = () => (supabaseAuthService as any).currentProfile;
  supabaseAuthService.getCurrentCompanyId = () => wsId;
  supabaseAuthService.getAuthoritativeWorkspaceId = async () => wsId;
  supabaseAuthService.isOwner = () => true;

  // 1. SETUP BRANCHES
  const mainBranch: Branch = {
    id: 'br-main-master',
    workspaceId: wsId,
    branchCode: 'MAIN',
    branchName: 'Main Branch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testBranch: Branch = {
    id: 'br-test-master',
    workspaceId: wsId,
    branchCode: 'TEST',
    branchName: 'testbranch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  safeSaveTenantStorage('vistaar_local_branches_db', [mainBranch, testBranch]);
  (store as any).state.branches = [mainBranch, testBranch];

  // 2. SETUP PRODUCTS
  // Product A: 248 units total catalog stock (Main: 200, testbranch: 48)
  const productA: Product = {
    id: 'prod-bearing-a-32208',
    workspaceId: wsId,
    name: 'Bearing 32208',
    partNumber: 'BRG-32208-A',
    productCode: 'BRG-32208-A',
    sku: 'SKU-32208-A',
    category: 'Bearings',
    unit: 'Pieces',
    currentStock: 248, // Catalog master stock
    openingStock: 248,
    minimumStock: 10,
    buyPrice: 500,
    sellingPrice: 750,
    currentBuyPrice: 500,
    currentSellPrice: 750,
    status: 'In Stock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Product B: Distinct product with similar name to test Product Identity (Test F)
  const productB: Product = {
    id: 'prod-bearing-b-32208-hd',
    workspaceId: wsId,
    name: 'Bearing 32208 Heavy Duty',
    partNumber: 'BRG-32208-HD',
    productCode: 'BRG-32208-HD',
    sku: 'SKU-32208-HD',
    category: 'Bearings',
    unit: 'Pieces',
    currentStock: 50,
    openingStock: 50,
    minimumStock: 5,
    buyPrice: 600,
    sellingPrice: 900,
    currentBuyPrice: 600,
    currentSellPrice: 900,
    status: 'In Stock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  safeSaveTenantStorage('vistaar_local_products_db', [productA, productB]);
  (store as any).state.products = [productA, productB];

  // Initialize initial branch inventories:
  // Main Branch = 200, testbranch = 48
  const initialBranchInv = [
    {
      id: 'bi-main-a',
      workspaceId: wsId,
      branchId: mainBranch.id,
      productId: productA.id,
      currentStock: 200,
      openingStock: 200,
      status: 'Active',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'bi-test-a',
      workspaceId: wsId,
      branchId: testBranch.id,
      productId: productA.id,
      currentStock: 48,
      openingStock: 48,
      status: 'Active',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'bi-main-b',
      workspaceId: wsId,
      branchId: mainBranch.id,
      productId: productB.id,
      currentStock: 50,
      openingStock: 50,
      status: 'Active',
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'bi-test-b',
      workspaceId: wsId,
      branchId: testBranch.id,
      productId: productB.id,
      currentStock: 0,
      openingStock: 0,
      status: 'Active',
      updatedAt: new Date().toISOString(),
    },
  ];
  safeSaveTenantStorage('vistaar_local_branch_inventory_db', initialBranchInv);
  safeSaveTenantStorage('vistaar_local_stock_transfers_db', []);
  safeSaveTenantStorage('vistaar_local_stock_movements_db', []);

  // --------------------------------------------------------------------------
  // TEST A: Independent branch stock
  // --------------------------------------------------------------------------
  console.log('--- TEST A: Independent Branch Stock Isolation ---');
  productService.invalidateCache();
  const mainProds = await productService.getProducts({ branchId: mainBranch.id });
  const testProds = await productService.getProducts({ branchId: testBranch.id });
  const allProds = await productService.getProducts({ branchId: 'ALL' });

  const mainProdA = mainProds.data?.find((p) => p.id === productA.id);
  const testProdA = testProds.data?.find((p) => p.id === productA.id);
  const allProdA = allProds.data?.find((p) => p.id === productA.id);

  assert(
    mainProdA?.currentStock === 200,
    'Test A1: Main Branch inventory displays exactly 200 units (NOT aggregate 248)',
    `Actual: ${mainProdA?.currentStock}`
  );
  assert(
    testProdA?.currentStock === 48,
    'Test A2: testbranch inventory displays exactly 48 units',
    `Actual: ${testProdA?.currentStock}`
  );
  assert(
    allProdA?.currentStock === 248,
    'Test A3: All Branches Analysis displays exactly 248 units (200 + 48)',
    `Actual: ${allProdA?.currentStock}`
  );

  // Test Autocomplete / Search honors branchId
  const mainSearch = await productService.searchProducts('32208', 10, mainBranch.id);
  const testSearch = await productService.searchProducts('32208', 10, testBranch.id);
  const mainSearchA = mainSearch.data?.find((p) => p.id === productA.id);
  const testSearchA = testSearch.data?.find((p) => p.id === productA.id);

  assert(
    mainSearchA?.currentStock === 200,
    'Test A4: Autocomplete in Main Branch returns 200 available stock',
    `Actual: ${mainSearchA?.currentStock}`
  );
  assert(
    testSearchA?.currentStock === 48,
    'Test A5: Autocomplete in testbranch returns 48 available stock',
    `Actual: ${testSearchA?.currentStock}`
  );

  // --------------------------------------------------------------------------
  // TEST B: Transfer accuracy (Transfer 100 from Main -> testbranch)
  // Expected: Main = 100, testbranch = 148, Transfer history = 100, Total = 248
  // --------------------------------------------------------------------------
  console.log('\n--- TEST B: Transfer Accuracy & Atomicity ---');
  const transfer1Idemp = `idemp-test-b-${Date.now()}`;
  const transfer1Res = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    notes: 'Transfer 100 units of Product A to testbranch',
    idempotencyKey: transfer1Idemp,
    items: [
      {
        productId: productA.id,
        quantity: 100,
        unitCost: 500,
      },
    ],
  });

  assert(transfer1Res.success === true, 'Test B1: Transfer 100 units execution succeeded');

  productService.invalidateCache();
  const mainProdsAfter = await productService.getProducts({ branchId: mainBranch.id });
  const testProdsAfter = await productService.getProducts({ branchId: testBranch.id });
  const allProdsAfter = await productService.getProducts({ branchId: 'ALL' });

  const mainProdAfter = mainProdsAfter.data?.find((p) => p.id === productA.id);
  const testProdAfter = testProdsAfter.data?.find((p) => p.id === productA.id);
  const allProdAfter = allProdsAfter.data?.find((p) => p.id === productA.id);

  assert(
    mainProdAfter?.currentStock === 100,
    'Test B2: Main Branch deducted correctly: 200 - 100 = 100',
    `Actual: ${mainProdAfter?.currentStock}`
  );
  assert(
    testProdAfter?.currentStock === 148,
    'Test B3: testbranch credited correctly: 48 + 100 = 148 (preserved existing 48 units)',
    `Actual: ${testProdAfter?.currentStock}`
  );
  assert(
    allProdAfter?.currentStock === 248,
    'Test B4: Organization-wide total conserved at 248 units (100 + 148)',
    `Actual: ${allProdAfter?.currentStock}`
  );

  const transferList = await branchService.getStockTransfers();
  const recordedTrf = transferList.data?.find((t) => t.id === transfer1Res.transferId || t.transferNumber === transfer1Res.transferNumber);
  const transferredItem = recordedTrf?.items?.find((i) => i.productId === productA.id);

  assert(
    transferredItem?.quantity === 100,
    'Test B5: Transfer history record accurately registers 100 units transferred',
    `Actual: ${transferredItem?.quantity}`
  );

  // --------------------------------------------------------------------------
  // TEST C: Repeated transfer submission (Idempotency)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST C: Idempotency & Duplicate Prevention ---');
  const duplicateSubmissionRes = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    notes: 'Repeated click simulation',
    idempotencyKey: transfer1Idemp, // Same idempotency key!
    items: [
      {
        productId: productA.id,
        quantity: 100,
        unitCost: 500,
      },
    ],
  });

  assert(
    duplicateSubmissionRes.success === true,
    'Test C1: Repeated transfer submission returns success without re-executing'
  );

  const mainProdsAfterDup = await productService.getProducts({ branchId: mainBranch.id });
  const testProdsAfterDup = await productService.getProducts({ branchId: testBranch.id });
  const mainAfterDup = mainProdsAfterDup.data?.find((p) => p.id === productA.id);
  const testAfterDup = testProdsAfterDup.data?.find((p) => p.id === productA.id);

  assert(
    mainAfterDup?.currentStock === 100,
    'Test C2: Main Branch stock NOT double-deducted (remains 100, not 0)',
    `Actual: ${mainAfterDup?.currentStock}`
  );
  assert(
    testAfterDup?.currentStock === 148,
    'Test C3: testbranch stock NOT double-credited (remains 148, not 248)',
    `Actual: ${testAfterDup?.currentStock}`
  );

  // --------------------------------------------------------------------------
  // TEST D: Insufficient source stock
  // --------------------------------------------------------------------------
  console.log('\n--- TEST D: Insufficient Source Stock Rejection ---');
  // Attempt to transfer 150 units from Main (which only has 100)
  const excessiveTransferRes = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    notes: 'Excessive transfer attempt',
    items: [
      {
        productId: productA.id,
        quantity: 150,
      },
    ],
  });

  assert(
    excessiveTransferRes.success === false,
    'Test D1: Transfer exceeding available source stock is REJECTED',
    `Error: "${excessiveTransferRes.error}"`
  );

  const mainAfterExcess = (await productService.getProducts({ branchId: mainBranch.id })).data?.find((p) => p.id === productA.id);
  const testAfterExcess = (await productService.getProducts({ branchId: testBranch.id })).data?.find((p) => p.id === productA.id);

  assert(
    mainAfterExcess?.currentStock === 100 && testAfterExcess?.currentStock === 148,
    'Test D2: Zero stock mutation occurs on rejected transfer (Main=100, testbranch=148)'
  );

  // --------------------------------------------------------------------------
  // TEST E: Concurrent transfers & Race Conditions
  // --------------------------------------------------------------------------
  console.log('\n--- TEST E: Concurrent Transfers & Race Condition Safety ---');
  // Attempt 3 simultaneous transfers of 40 units each against Main Branch (available: 100)
  // Transfers 1 & 2 should succeed (40 + 40 = 80 <= 100), Transfer 3 should fail or safe check
  const p1 = branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    items: [{ productId: productA.id, quantity: 40 }],
  });
  const p2 = branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    items: [{ productId: productA.id, quantity: 40 }],
  });
  const p3 = branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    items: [{ productId: productA.id, quantity: 40 }],
  });

  const concurrentResults = await Promise.all([p1, p2, p3]);
  const successfulCount = concurrentResults.filter((r) => r.success).length;

  productService.invalidateCache();
  const mainAfterConcurrentProd = (await productService.getProducts({ branchId: mainBranch.id })).data?.find((p) => p.id === productA.id);
  const mainAfterConcurrentStock = Number(mainAfterConcurrentProd?.currentStock ?? 0);

  assert(
    mainAfterConcurrentStock >= 0,
    'Test E1: Source branch stock NEVER becomes negative under concurrent transfers',
    `Final stock: ${mainAfterConcurrentStock}`
  );
  assert(
    successfulCount <= 2,
    `Test E2: At most 2 of the 40-unit transfers succeeded (successful: ${successfulCount})`
  );

  // --------------------------------------------------------------------------
  // TEST F: Product identity (SKU/part-number matching)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST F: Product Identity Isolation ---');
  // Transfer 10 units of Product B (Heavy Duty) from Main (50 avail) to testbranch (0 avail)
  const transferProductBRes = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    items: [{ productId: productB.id, quantity: 10 }],
  });

  assert(transferProductBRes.success === true, 'Test F1: Transferred Product B successfully');

  productService.invalidateCache();
  const mainBProd = (await productService.getProducts({ branchId: mainBranch.id })).data?.find((p) => p.id === productB.id);
  const testBProd = (await productService.getProducts({ branchId: testBranch.id })).data?.find((p) => p.id === productB.id);
  const mainAAfterB = (await productService.getProducts({ branchId: mainBranch.id })).data?.find((p) => p.id === productA.id);

  assert(
    mainBProd?.currentStock === 40 && testBProd?.currentStock === 10,
    'Test F2: Product B balances updated accurately (Main: 40, testbranch: 10)'
  );
  assert(
    mainAAfterB?.currentStock === mainAfterConcurrentStock,
    'Test F3: Product A stock completely untouched by Product B transfer (strict product ID isolation)',
    `Expected: ${mainAfterConcurrentStock}, Actual: ${mainAAfterB?.currentStock}`
  );

  // --------------------------------------------------------------------------
  // TEST G: Inventory-consuming operations (Selling from testbranch)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST G: Inventory-Consuming Operations (Sales Isolation) ---');
  const mainStockBeforeSale = (await productService.getProducts({ branchId: mainBranch.id })).data?.find((p) => p.id === productB.id)?.currentStock || 0;
  const testStockBeforeSale = (await productService.getProducts({ branchId: testBranch.id })).data?.find((p) => p.id === productB.id)?.currentStock || 0;

  // Execute counter sale of 3 units from testbranch
  const saleRes = await counterSaleService.createCounterSale({
    invoiceNumber: `CS-TEST-${Date.now()}`,
    customerName: 'Test Branch Retail Customer',
    saleDate: new Date().toISOString().split('T')[0],
    branchId: testBranch.id,
    items: [
      {
        productId: productB.id,
        productName: productB.name,
        quantity: 3,
        unitPrice: 900,
        taxRate: 18,
      },
    ],
    paymentMethod: 'Cash',
    amountPaid: 2700,
  });

  assert(saleRes.success === true, 'Test G1: Counter sale created in testbranch');

  productService.invalidateCache();
  const mainStockAfterSale = (await productService.getProducts({ branchId: mainBranch.id })).data?.find((p) => p.id === productB.id)?.currentStock || 0;
  const testStockAfterSale = (await productService.getProducts({ branchId: testBranch.id })).data?.find((p) => p.id === productB.id)?.currentStock || 0;

  assert(
    testStockAfterSale === testStockBeforeSale - 3,
    `Test G2: Selling branch (testbranch) stock decreased: ${testStockBeforeSale} -> ${testStockAfterSale}`
  );
  assert(
    mainStockAfterSale === mainStockBeforeSale,
    `Test G3: Main Branch stock STRICTLY UNCHANGED: ${mainStockAfterSale} == ${mainStockBeforeSale}`
  );

  // --------------------------------------------------------------------------
  // TEST H: Persistence after restart (Cold Reload Simulation)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST H: Persistence After Cold Reload ---');
  // Invalidate in-memory caches and re-instantiate or re-query
  productService.invalidateCache();
  
  const reloadedMainB = (await productService.getProducts({ branchId: mainBranch.id })).data?.find((p) => p.id === productB.id);
  const reloadedTestB = (await productService.getProducts({ branchId: testBranch.id })).data?.find((p) => p.id === productB.id);

  assert(
    reloadedMainB?.currentStock === mainStockAfterSale,
    `Test H1: Main Branch stock persisted across cold reload: ${reloadedMainB?.currentStock}`
  );
  assert(
    reloadedTestB?.currentStock === testStockAfterSale,
    `Test H2: testbranch stock persisted across cold reload: ${reloadedTestB?.currentStock}`
  );

  // --------------------------------------------------------------------------
  // TEST I: Tenant and Branch Security
  // --------------------------------------------------------------------------
  console.log('\n--- TEST I: Tenant & Cross-Branch Security Guard ---');
  // Attempt to execute transfer with destination branch from a completely foreign workspace
  const foreignWorkspaceId = 'b2222222-3333-4444-5555-666666666666';
  const foreignBranch: Branch = {
    id: 'br-foreign-victim',
    workspaceId: foreignWorkspaceId,
    branchCode: 'EVIL',
    branchName: 'Foreign Unauthorized Branch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const maliciousTransfer = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: foreignBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    items: [{ productId: productA.id, quantity: 5 }],
  });

  assert(
    maliciousTransfer.success === false,
    'Test I1: Transfer across foreign unauthenticated workspace rejected by branch validation',
    `Error: "${maliciousTransfer.error}"`
  );

  console.log('\n========================================================================');
  console.log(`🏁 MASTER TEST SUITE COMPLETE: ${passedTests} PASSED, ${totalTests - passedTests} FAILED out of ${totalTests}`);
  console.log('========================================================================\n');
}

runMasterSuite().catch((e) => {
  console.error('Master Suite Uncaught Error:', e);
  process.exit(1);
});
