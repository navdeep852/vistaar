import { branchService } from '../src/services/supabase/branchService';
import { productService } from '../src/services/supabase/productService';
import { inventoryService } from '../src/services/supabase/inventoryService';
import { store } from '../src/services/store';
import { safeGetTenantStorage, safeSaveTenantStorage, safeSaveTenantItem } from '../src/services/supabase/safeStorage';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { Product, Branch } from '../src/types';

console.log('========================================================================');
console.log('⚡ VISTAAR BEARING 32208 CRITICAL REGRESSION SUITE');
console.log('========================================================================\n');

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
  }
}

async function runRegressionSuite() {
  const wsId = 'ws-bearing-regression-test';
  safeSaveTenantItem('active_company_id', wsId);
  (supabaseAuthService as any).getCurrentCompanyId = () => wsId;
  (supabaseAuthService as any).getAuthoritativeWorkspaceId = async () => wsId;
  (supabaseAuthService as any).getUser = () => ({ id: 'usr-owner-001', email: 'owner@vistaar.com', role: 'owner' } as any);
  (supabaseAuthService as any).isOwner = () => true;

  // Setup Branches: Main Branch and testbranch
  const mainBranch: Branch = {
    id: 'br-main-001',
    workspaceId: wsId,
    branchCode: 'MAIN',
    branchName: 'My Business (Main Branch)',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testBranch: Branch = {
    id: 'br-test-002',
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

  // Setup Product: Bearing 32208 with 80 pieces initial stock
  const bearingProduct: Product = {
    id: 'prod-bearing-32208',
    workspaceId: wsId,
    name: 'Bearing 32208',
    partNumber: '04000740080F',
    productCode: '04000740080F',
    category: 'Bearings',
    unit: 'Piece',
    currentStock: 80,
    openingStock: 80,
    minimumStock: 10,
    buyPrice: 450,
    sellingPrice: 650,
    currentBuyPrice: 450,
    currentSellPrice: 650,
    status: 'In Stock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Add product to local store
  safeSaveTenantStorage('vistaar_local_products_db', [bearingProduct]);
  (store as any).state.products = [bearingProduct];
  (store as any).state.branches = [mainBranch, testBranch];

  console.log('🔹 Phase 1: Verify Initial Stock & Transfer Modal Source Stock');
  // Initially branch_inventory might be empty before synchronization
  safeSaveTenantStorage('vistaar_local_branch_inventory_db', []);

  // Check getBranchInventory for Main Branch
  const mainBInvBefore = await branchService.getBranchInventory(mainBranch.id);
  const bearingMainRecord = mainBInvBefore.data?.find((bi) => (bi.productId || bi.product_id) === bearingProduct.id);
  
  assert(
    bearingMainRecord != null && Number(bearingMainRecord.currentStock ?? bearingMainRecord.current_stock) === 80,
    `Main Branch stock for "Bearing 32208" resolves to 80 (found: ${bearingMainRecord?.currentStock ?? bearingMainRecord?.current_stock})`
  );

  // Check available stock calculation as performed by StockTransferModal
  const stockMap = new Map<string, number>();
  (mainBInvBefore.data || []).forEach((item: any) => {
    const pId = item.productId || item.product_id;
    const qty = Number(item.currentStock ?? item.current_stock) || 0;
    if (pId) stockMap.set(pId, qty);
  });

  const availableAtSourceInModal = stockMap.get(bearingProduct.id) ?? 0;
  assert(
    availableAtSourceInModal === 80,
    `Inter-Branch Transfer form displays "Available at source: 80 units" (NOT 0)`
  );

  console.log('\n🔹 Phase 2: Execute Atomic Stock Transfer (Main -> testbranch, Qty = 1)');
  const transferPayload = {
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    notes: 'Transfer 1 Bearing 32208 to testbranch',
    items: [
      {
        productId: bearingProduct.id,
        quantity: 1,
        unitCost: 450,
        notes: 'Transfer sample',
      },
    ],
  };

  const transferResult = await branchService.executeStockTransfer(transferPayload);
  assert(transferResult.success === true, `Stock transfer execution succeeded: ${transferResult.data?.transferNumber}`);

  console.log('\n🔹 Phase 3: Verify Post-Transfer Stocks (Main = 79, testbranch = 1)');
  const mainBInvAfter = await branchService.getBranchInventory(mainBranch.id);
  const testBInvAfter = await branchService.getBranchInventory(testBranch.id);

  const mainBearingAfter = mainBInvAfter.data?.find((bi) => (bi.productId || bi.product_id) === bearingProduct.id);
  const testBearingAfter = testBInvAfter.data?.find((bi) => (bi.productId || bi.product_id) === bearingProduct.id);

  const mainQty = Number(mainBearingAfter?.currentStock ?? mainBearingAfter?.current_stock);
  const testQty = Number(testBearingAfter?.currentStock ?? testBearingAfter?.current_stock);

  assert(mainQty === 79, `Main Branch stock decreased: 80 -> 79 (actual: ${mainQty})`);
  assert(testQty === 1, `testbranch stock increased: 0 -> 1 (actual: ${testQty})`);

  console.log('\n🔹 Phase 4: Verify Persistence Across Page Reload / Fresh Query');
  // Simulate complete page reload by re-querying authoritative stock
  const mainReloaded = await branchService.getAuthoritativeStock(bearingProduct.id, mainBranch.id);
  const testReloaded = await branchService.getAuthoritativeStock(bearingProduct.id, testBranch.id);

  assert(mainReloaded === 79, `Page reload preserves Main Branch = 79 (found: ${mainReloaded})`);
  assert(testReloaded === 1, `Page reload preserves testbranch = 1 (found: ${testReloaded})`);

  console.log('\n🔹 Phase 5: Destination Branch Sale (testbranch sells 1 unit)');
  // testbranch sells 1 Bearing 32208
  store.adjustStock(bearingProduct.id, 'Sale', -1, 'testbranch Counter Sale #CS-001', 'CS-001', testBranch.id);

  const mainAfterSale = await branchService.getAuthoritativeStock(bearingProduct.id, mainBranch.id);
  const testAfterSale = await branchService.getAuthoritativeStock(bearingProduct.id, testBranch.id);

  assert(testAfterSale === 0, `testbranch stock reduced: 1 -> 0 after sale (actual: ${testAfterSale})`);
  assert(mainAfterSale === 79, `Main Branch stock STRICTLY UNCHANGED at 79 after testbranch sale (actual: ${mainAfterSale})`);

  console.log('\n🔹 Phase 6: Insufficient Stock Transfer Rejection (testbranch -> Main, Qty = 8)');
  const invalidTransferPayload = {
    sourceBranchId: testBranch.id,
    destinationBranchId: mainBranch.id,
    transferDate: new Date().toISOString().split('T')[0],
    items: [
      {
        productId: bearingProduct.id,
        quantity: 8,
        unitCost: 450,
      },
    ],
  };

  const invalidTransferResult = await branchService.executeStockTransfer(invalidTransferPayload);
  assert(
    invalidTransferResult.success === false,
    `Transfer of 8 units from testbranch (0 available) was REJECTED: "${invalidTransferResult.error}"`
  );

  const mainAfterInvalid = await branchService.getAuthoritativeStock(bearingProduct.id, mainBranch.id);
  const testAfterInvalid = await branchService.getAuthoritativeStock(bearingProduct.id, testBranch.id);

  assert(mainAfterInvalid === 79, `Main Branch stock unaffected after rejected transfer (79)`);
  assert(testAfterInvalid === 0, `testbranch stock unaffected after rejected transfer (0)`);

  console.log('\n🔹 Phase 7: Direct Destination Purchase (testbranch receives 20 units)');
  await inventoryService.createStockReceipt({
    productId: bearingProduct.id,
    branchId: testBranch.id,
    quantityReceived: 20,
    buyPrice: 450,
    receiptNumber: 'GRN-TEST-DIRECT-01',
    notes: 'Direct supplier delivery at testbranch',
  });

  const mainAfterDirectPurchase = await branchService.getAuthoritativeStock(bearingProduct.id, mainBranch.id);
  const testAfterDirectPurchase = await branchService.getAuthoritativeStock(bearingProduct.id, testBranch.id);

  assert(testAfterDirectPurchase === 20, `testbranch received 20 units directly -> 20 (actual: ${testAfterDirectPurchase})`);
  assert(mainAfterDirectPurchase === 79, `Main Branch stock STRICTLY UNCHANGED at 79 (actual: ${mainAfterDirectPurchase})`);

  console.log('\n🔹 Phase 8: Verify Single Product Master (No duplicate products created)');
  const allProducts = safeGetTenantStorage<any>('vistaar_local_products_db', []);
  const bearingMasters = allProducts.filter(
    (p: any) => p.name === 'Bearing 32208' || p.partNumber === '04000740080F'
  );

  assert(
    bearingMasters.length === 1,
    `Exactly ONE product master exists for "Bearing 32208" (Count: ${bearingMasters.length})`
  );

  console.log('\n========================================================================');
  console.log(`🏁 REGRESSION SUITE COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('========================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
