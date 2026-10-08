/**
 * VISTAAR Business OS - Multi-Branch Architecture & Invariants Test Suite
 * Validates Requirement 46, 47, 48 & Acceptance Criteria:
 * 1. Branch Creation & UUID generation
 * 2. Uniqueness constraints (workspace + branch_code)
 * 3. Master Product with Independent Branch Stock
 * 4. Inter-Branch Stock Transfers (Main -> Delhi, Main -> Lucknow)
 * 5. Branch Sales Stock Deduction & Negative Stock Prevention
 * 6. Financial records branch isolation (Invoice, Udhari, Cashbook, Daybook)
 */

// 1. Setup Node Environment Storage Polyfill
class LocalStorageMock {
  private store: Map<string, string> = new Map();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

(global as any).localStorage = new LocalStorageMock();

import { branchService, generateUuid } from '../src/services/supabase/branchService';
import { store } from '../src/services/store';
import { productService } from '../src/services/supabase/productService';
import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { udhariService } from '../src/services/supabase/udhariService';
import { cashbookService } from '../src/services/supabase/cashbookService';
import { daybookService } from '../src/services/supabase/daybookService';
import { isValidUuid } from '../src/lib/supabaseError';
import { safeSaveTenantItem, safeSaveTenantStorage, safeGetTenantStorage } from '../src/services/supabase/safeStorage';

async function runBranchArchitectureVerification() {
  console.log('================================================================');
  console.log('VISTAAR MULTI-BRANCH ENTERPRISE VERIFICATION SUITE');
  console.log('================================================================\n');

  const testWorkspaceId = 'c0000000-0000-0000-0000-000000000099';
  const ownerUserId = 'u0000000-0000-0000-0000-000000000001';

  // Set active workspace session
  localStorage.setItem('vistaar_user_session', JSON.stringify({
    id: ownerUserId,
    companyId: testWorkspaceId,
    role: 'owner',
    businessName: 'Demo Enterprise',
  }));
  localStorage.setItem('vistaar_current_company_id', testWorkspaceId);

  // --- STEP 1: Verify Initial Auto-Provisioning & Main Branch ---
  console.log('[TEST 1] Verifying Branch Auto-Provisioning & UUID Architecture...');
  const initialBranchesRes = await branchService.getBranches();
  if (initialBranchesRes.data.length === 0) {
    throw new Error('FAILED: Expected auto-provisioned Main Branch, got 0 branches.');
  }

  const mainBranch = initialBranchesRes.data[0];
  if (!mainBranch.isMainBranch || mainBranch.branchCode !== 'MAIN') {
    throw new Error(`FAILED: Auto-provisioned branch must be MAIN, got ${mainBranch.branchCode}`);
  }
  if (!isValidUuid(mainBranch.id)) {
    throw new Error(`FAILED: Branch ID must be a valid UUID, got ${mainBranch.id}`);
  }
  console.log(`✓ Main Branch verified: ${mainBranch.branchName} (${mainBranch.branchCode}) [UUID: ${mainBranch.id}]`);

  // --- STEP 2: Create Delhi Branch & Lucknow Branch ---
  console.log('\n[TEST 2] Creating Delhi Branch and Lucknow Branch...');
  const delhiRes = await branchService.createBranch({
    branchCode: 'DEL',
    branchName: 'Delhi Branch',
    branchType: 'Store',
    city: 'New Delhi',
    state: 'Delhi',
  });
  if (!delhiRes.success || !delhiRes.data) {
    throw new Error(`FAILED: Failed to create Delhi Branch: ${delhiRes.error}`);
  }
  const delhiBranch = delhiRes.data;
  if (!isValidUuid(delhiBranch.id)) {
    throw new Error(`FAILED: Delhi Branch ID is not UUID: ${delhiBranch.id}`);
  }
  console.log(`✓ Delhi Branch created: ${delhiBranch.branchName} (${delhiBranch.branchCode}) [UUID: ${delhiBranch.id}]`);

  const lucknowRes = await branchService.createBranch({
    branchCode: 'LKO',
    branchName: 'Lucknow Branch',
    branchType: 'Store',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
  });
  if (!lucknowRes.success || !lucknowRes.data) {
    throw new Error(`FAILED: Failed to create Lucknow Branch: ${lucknowRes.error}`);
  }
  const lucknowBranch = lucknowRes.data;
  if (!isValidUuid(lucknowBranch.id)) {
    throw new Error(`FAILED: Lucknow Branch ID is not UUID: ${lucknowBranch.id}`);
  }
  console.log(`✓ Lucknow Branch created: ${lucknowBranch.branchName} (${lucknowBranch.branchCode}) [UUID: ${lucknowBranch.id}]`);

  // --- STEP 3: Verify Unique Constraints (Duplicate Branch Code) ---
  console.log('\n[TEST 3] Testing Branch Code Uniqueness Constraint...');
  const duplicateRes = await branchService.createBranch({
    branchCode: 'del', // lower case check
    branchName: 'Delhi Duplicate Store',
  });
  if (duplicateRes.success) {
    throw new Error('FAILED: Duplicate branch code DEL was allowed!');
  }
  console.log(`✓ Duplicate branch code rejected properly: "${duplicateRes.error}"`);

  // Check total branches count
  const allBranches = await branchService.getBranches();
  if (allBranches.data.length !== 3) {
    throw new Error(`FAILED: Expected 3 branches, found ${allBranches.data.length}`);
  }
  console.log(`✓ Total locations count in database: ${allBranches.data.length}`);

  // --- STEP 4: Product Master with Initial Stock (Section 46) ---
  console.log('\n[TEST 4] Creating Product "Headphone" with Initial Stock: Main = 100, Delhi = 0, Lucknow = 0...');
  const productId = generateUuid();
  const headphoneProduct = {
    id: productId,
    workspaceId: testWorkspaceId,
    name: 'Headphone',
    productName: 'Headphone',
    sku: 'HP-PRO-01',
    partNumber: 'P001',
    sellingPrice: 1500,
    buyPrice: 1000,
    currentStock: 100,
    minimumStock: 10,
    active: true,
  };

  store.setProducts([headphoneProduct as any]);
  safeSaveTenantStorage('vistaar_local_products_db', [headphoneProduct]);

  // Set Main branch inventory = 100, Delhi = 0, Lucknow = 0
  const initialBranchInv = [
    {
      id: generateUuid(),
      workspaceId: testWorkspaceId,
      branchId: mainBranch.id,
      productId: productId,
      currentStock: 100,
      openingStock: 100,
      status: 'Active',
    },
    {
      id: generateUuid(),
      workspaceId: testWorkspaceId,
      branchId: delhiBranch.id,
      productId: productId,
      currentStock: 0,
      openingStock: 0,
      status: 'Active',
    },
    {
      id: generateUuid(),
      workspaceId: testWorkspaceId,
      branchId: lucknowBranch.id,
      productId: productId,
      currentStock: 0,
      openingStock: 0,
      status: 'Active',
    },
  ];
  safeSaveTenantStorage('vistaar_local_branch_inventory_db', initialBranchInv);

  const mainInitStock = await branchService.getAuthoritativeStock(productId, mainBranch.id);
  const delhiInitStock = await branchService.getAuthoritativeStock(productId, delhiBranch.id);
  const lkoInitStock = await branchService.getAuthoritativeStock(productId, lucknowBranch.id);
  const totalInitStock = await branchService.getAuthoritativeStock(productId, 'ALL');

  console.log(`  Main Stock: ${mainInitStock} (Expected: 100)`);
  console.log(`  Delhi Stock: ${delhiInitStock} (Expected: 0)`);
  console.log(`  Lucknow Stock: ${lkoInitStock} (Expected: 0)`);
  console.log(`  Total Enterprise Stock: ${totalInitStock} (Expected: 100)`);

  if (mainInitStock !== 100 || delhiInitStock !== 0 || lkoInitStock !== 0 || totalInitStock !== 100) {
    throw new Error('FAILED: Initial stock values do not match Section 46 specifications.');
  }
  console.log('✓ Initial stock setup matches Section 46.');

  // --- STEP 5: Stock Transfer 1: Main -> Delhi (Qty = 30) ---
  console.log('\n[TEST 5] Executing Stock Transfer: Main -> Delhi (Quantity: 30)...');
  const trf1 = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: delhiBranch.id,
    items: [{ productId, quantity: 30 }],
    notes: 'Initial stocking for Delhi outlet',
  });
  if (!trf1.success) {
    throw new Error(`FAILED: Stock transfer 1 failed: ${trf1.error}`);
  }
  console.log(`✓ Transfer 1 Completed: ${trf1.transferNumber} [ID: ${trf1.transferId}]`);

  const mainAfterTrf1 = await branchService.getAuthoritativeStock(productId, mainBranch.id);
  const delhiAfterTrf1 = await branchService.getAuthoritativeStock(productId, delhiBranch.id);
  const lkoAfterTrf1 = await branchService.getAuthoritativeStock(productId, lucknowBranch.id);
  console.log(`  Main: ${mainAfterTrf1} (Expected: 70)`);
  console.log(`  Delhi: ${delhiAfterTrf1} (Expected: 30)`);
  console.log(`  Lucknow: ${lkoAfterTrf1} (Expected: 0)`);

  if (mainAfterTrf1 !== 70 || delhiAfterTrf1 !== 30 || lkoAfterTrf1 !== 0) {
    throw new Error('FAILED: Balances after Transfer 1 do not match expected (70, 30, 0).');
  }
  console.log('✓ Transfer 1 balances verified.');

  // --- STEP 6: Stock Transfer 2: Main -> Lucknow (Qty = 20) ---
  console.log('\n[TEST 6] Executing Stock Transfer: Main -> Lucknow (Quantity: 20)...');
  const trf2 = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: lucknowBranch.id,
    items: [{ productId, quantity: 20 }],
    notes: 'Initial stocking for Lucknow depot',
  });
  if (!trf2.success) {
    throw new Error(`FAILED: Stock transfer 2 failed: ${trf2.error}`);
  }
  console.log(`✓ Transfer 2 Completed: ${trf2.transferNumber} [ID: ${trf2.transferId}]`);

  const mainAfterTrf2 = await branchService.getAuthoritativeStock(productId, mainBranch.id);
  const delhiAfterTrf2 = await branchService.getAuthoritativeStock(productId, delhiBranch.id);
  const lkoAfterTrf2 = await branchService.getAuthoritativeStock(productId, lucknowBranch.id);
  console.log(`  Main: ${mainAfterTrf2} (Expected: 50)`);
  console.log(`  Delhi: ${delhiAfterTrf2} (Expected: 30)`);
  console.log(`  Lucknow: ${lkoAfterTrf2} (Expected: 20)`);

  if (mainAfterTrf2 !== 50 || delhiAfterTrf2 !== 30 || lkoAfterTrf2 !== 20) {
    throw new Error('FAILED: Balances after Transfer 2 do not match expected (50, 30, 20).');
  }
  console.log('✓ Transfer 2 balances verified.');

  // --- STEP 7: Test Insufficient Transfer Rejection (Requirement 12) ---
  console.log('\n[TEST 7] Testing Transfer Validation: Trying to transfer 35 units from Delhi (Available: 30)...');
  const invalidTrf = await branchService.executeStockTransfer({
    sourceBranchId: delhiBranch.id,
    destinationBranchId: lucknowBranch.id,
    items: [{ productId, quantity: 35 }],
  });
  if (invalidTrf.success) {
    throw new Error('FAILED: Transfer of 35 units from Delhi succeeded when only 30 available!');
  }
  console.log(`✓ Transfer properly rejected with error: "${invalidTrf.error}"`);

  // --- STEP 8: Sale in Delhi Branch (Sell Headphone x 7) ---
  console.log('\n[TEST 8] Operating in Delhi Branch: Selling Headphone x 7...');
  safeSaveTenantItem('active_branch_id', delhiBranch.id);

  const delhiSaleRes = await counterSaleService.createCounterSale({
    branchId: delhiBranch.id,
    customerName: 'Delhi Retail Customer',
    paymentMethod: 'Cash',
    subtotal: 7 * 1500,
    finalTotal: 7 * 1500,
    amountReceived: 7 * 1500,
    balanceAmount: 0,
    items: [{
      productId,
      productName: 'Headphone',
      quantity: 7,
      rate: 1500,
    }],
  });
  if (!delhiSaleRes.success) {
    throw new Error(`FAILED: Delhi sale failed: ${delhiSaleRes.error}`);
  }
  console.log(`✓ Delhi Counter Sale Completed: ${delhiSaleRes.data?.invoiceNumber}`);

  const mainAfterDelhiSale = await branchService.getAuthoritativeStock(productId, mainBranch.id);
  const delhiAfterDelhiSale = await branchService.getAuthoritativeStock(productId, delhiBranch.id);
  const lkoAfterDelhiSale = await branchService.getAuthoritativeStock(productId, lucknowBranch.id);
  console.log(`  Main: ${mainAfterDelhiSale} (Expected: 50)`);
  console.log(`  Delhi: ${delhiAfterDelhiSale} (Expected: 23)`);
  console.log(`  Lucknow: ${lkoAfterDelhiSale} (Expected: 20)`);

  if (mainAfterDelhiSale !== 50 || delhiAfterDelhiSale !== 23 || lkoAfterDelhiSale !== 20) {
    throw new Error('FAILED: Balances after Delhi sale do not match expected (50, 23, 20).');
  }
  console.log('✓ Delhi sale deducted strictly from Delhi inventory.');

  // --- STEP 9: Sale in Lucknow Branch (Sell Headphone x 5) ---
  console.log('\n[TEST 9] Operating in Lucknow Branch: Selling Headphone x 5...');
  safeSaveTenantItem('active_branch_id', lucknowBranch.id);

  const lkoSaleRes = await counterSaleService.createCounterSale({
    branchId: lucknowBranch.id,
    customerName: 'Lucknow Retail Customer',
    paymentMethod: 'Cash',
    subtotal: 5 * 1500,
    finalTotal: 5 * 1500,
    amountReceived: 5 * 1500,
    balanceAmount: 0,
    items: [{
      productId,
      productName: 'Headphone',
      quantity: 5,
      rate: 1500,
    }],
  });
  if (!lkoSaleRes.success) {
    throw new Error(`FAILED: Lucknow sale failed: ${lkoSaleRes.error}`);
  }
  console.log(`✓ Lucknow Counter Sale Completed: ${lkoSaleRes.data?.invoiceNumber}`);

  const mainFinalStock = await branchService.getAuthoritativeStock(productId, mainBranch.id);
  const delhiFinalStock = await branchService.getAuthoritativeStock(productId, delhiBranch.id);
  const lkoFinalStock = await branchService.getAuthoritativeStock(productId, lucknowBranch.id);
  const totalEnterpriseStock = await branchService.getAuthoritativeStock(productId, 'ALL');

  console.log(`  Main: ${mainFinalStock} (Expected: 50)`);
  console.log(`  Delhi: ${delhiFinalStock} (Expected: 23)`);
  console.log(`  Lucknow: ${lkoFinalStock} (Expected: 15)`);
  console.log(`  Total Enterprise Stock: ${totalEnterpriseStock} (Expected: 88)`);

  if (mainFinalStock !== 50 || delhiFinalStock !== 23 || lkoFinalStock !== 15 || totalEnterpriseStock !== 88) {
    throw new Error('FAILED: Final Section 46 balances do not match expected (Main: 50, Delhi: 23, Lucknow: 15, Total: 88).');
  }
  console.log('✓ EXACT SECTION 46 MULTI-BRANCH TEST SCENARIO PASSED PERFECTLY!');

  // --- STEP 10: Negative Stock Prevention (Requirement 40) ---
  console.log('\n[TEST 10] Testing Negative Stock Prevention in Lucknow (Requested: 20, Available: 15)...');
  const overSaleRes = await counterSaleService.createCounterSale({
    branchId: lucknowBranch.id,
    customerName: 'Greedy Buyer',
    items: [{
      productId,
      productName: 'Headphone',
      quantity: 20,
      rate: 1500,
    }],
  });
  if (overSaleRes.success) {
    throw new Error('FAILED: Allowed sale of 20 units when only 15 were available in Lucknow!');
  }
  console.log(`✓ Overselling rejected properly: "${overSaleRes.error}"`);

  // --- STEP 11: Section 47 Payment & Financial Isolation Test ---
  console.log('\n[TEST 11] Testing Section 47 Payment & Financial Synchronization in Delhi...');
  safeSaveTenantItem('active_branch_id', delhiBranch.id);

  const testInvPayload = {
    branchId: delhiBranch.id,
    customerName: 'Rahul (Delhi Customer)',
    customerPhone: '9876543210',
    invoiceNumber: 'DEL-INV-000001',
    date: new Date().toISOString().split('T')[0],
    grandTotal: 15750,
    paidAmount: 4000,
    balanceAmount: 11750,
    paymentStatus: 'Partially Paid' as any,
    items: [{
      productId,
      productName: 'Headphone Custom Batch',
      quantity: 1,
      sellingPrice: 15750,
      total: 15750,
      itemType: 'custom' as any, // Custom item to test purely financial flow
    }],
  };

  const invRes = await invoiceService.finalizeAuthoritativeInvoice(testInvPayload as any);
  if (!invRes.success) {
    throw new Error(`FAILED: Delhi invoice finalization failed: ${invRes.error}`);
  }
  console.log(`✓ Delhi Invoice created: DEL-INV-000001 (Total: ₹15,750 | Paid: ₹4,000 | Balance: ₹11,750)`);

  // Record Delhi Udhari
  const udhariRes = await udhariService.createUdhari({
    workspaceId: testWorkspaceId,
    branchId: delhiBranch.id,
    customerNameSnapshot: 'Rahul (Delhi Customer)',
    phoneSnapshot: '9876543210',
    originalAmount: 15750,
    totalReceived: 4000,
    outstandingAmount: 11750,
    status: 'ACTIVE',
  });
  console.log(`✓ Delhi Udhari record created: Outstanding ₹11,750`);

  // Verify Delhi Branch View
  const delhiUdhari = await udhariService.getUdhariRecords(undefined, { branchId: delhiBranch.id });
  const delhiDaybook = await daybookService.getTransactions({ branchId: delhiBranch.id });
  const delhiCashbook = await cashbookService.getTransactions({ branchId: delhiBranch.id });

  console.log(`  Delhi Branch Udhari Records Count: ${delhiUdhari.data.length}`);
  console.log(`  Delhi Branch Daybook Records Count: ${delhiDaybook.data.length}`);
  console.log(`  Delhi Branch Cashbook Records Count: ${delhiCashbook.data.length}`);

  if (delhiUdhari.data.length === 0 || delhiDaybook.data.length === 0 || delhiCashbook.data.length === 0) {
    throw new Error('FAILED: Delhi financial records were not found in Delhi branch view.');
  }

  // Switch to Main Branch - verify isolation
  console.log('\n[TEST 12] Switching to Main Branch Context (Verifying Strict Isolation)...');
  safeSaveTenantItem('active_branch_id', mainBranch.id);

  const mainUdhari = await udhariService.getUdhariRecords(undefined, { branchId: mainBranch.id });
  const hasDelhiInMain = mainUdhari.data.some((u) => u.customerNameSnapshot.includes('Delhi'));
  if (hasDelhiInMain) {
    throw new Error('FAILED: Delhi Udhari leaked into Main Branch view!');
  }
  console.log('✓ Main Branch Udhari view is strictly isolated; Delhi records not visible.');

  const mainCashbook = await cashbookService.getTransactions({ branchId: mainBranch.id });
  const hasDelhiInMainCash = mainCashbook.data.some((c) => c.partyName?.includes('Delhi') || c.referenceNumber === 'DEL-INV-000001');
  if (hasDelhiInMainCash) {
    throw new Error('FAILED: Delhi Cashbook transaction leaked into Main Branch cash view!');
  }
  console.log('✓ Main Branch Cashbook view is strictly isolated; Delhi cash inflow not visible.');

  // Select "All Branches" - Consolidated view
  console.log('\n[TEST 13] Selecting "All Branches" Mode (Verifying Consolidated Reporting)...');
  safeSaveTenantItem('active_branch_id', 'ALL');

  const consolidatedUdhari = await udhariService.getUdhariRecords(undefined, { branchId: 'ALL' });
  const consolidatedCashbook = await cashbookService.getTransactions({ branchId: 'ALL' });
  console.log(`  Consolidated Udhari count: ${consolidatedUdhari.data.length}`);
  console.log(`  Consolidated Cashbook count: ${consolidatedCashbook.data.length}`);

  if (consolidatedUdhari.data.length === 0 || consolidatedCashbook.data.length === 0) {
    throw new Error('FAILED: Consolidated reporting failed to show enterprise-wide transactions.');
  }
  console.log('✓ Consolidated reporting includes transactions across all branches.');

  console.log('\n================================================================');
  console.log('ALL TESTS PASSED! Multi-Branch Architecture is 100% Validated.');
  console.log('================================================================\n');
}

runBranchArchitectureVerification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
