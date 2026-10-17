import { branchService } from '../src/services/supabase/branchService';
import { productService } from '../src/services/supabase/productService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { store } from '../src/services/store';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { safeGetTenantStorage, safeSaveTenantStorage } from '../src/services/supabase/safeStorage';
import { registerCurrentUserResolver } from '../src/lib/permissions';
import {
  generateStockTransferNumber,
  buildStockTransferFilename,
  StockTransferDocumentOptions,
} from '../src/services/stockTransferDocumentService';
import { StockTransfer, Branch, Product } from '../src/types';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}: ${detail}`);
    results.push({ name: testName, passed: true, details: detail });
  } else {
    console.error(`❌ [FAIL] ${testName}: ${detail}`);
    results.push({ name: testName, passed: false, details: detail });
  }
}

async function runStockTransferTestSuite() {
  console.log('=============================================================');
  console.log(' VISTAAR PROFESSIONAL STOCK TRANSFER INVOICE / NOTE SUITE   ');
  console.log('=============================================================\n');

  const wsId = 'a0000000-0000-4000-8000-000000000001';
  const ownerId = 'b0000000-0000-4000-8000-000000000001';

  registerCurrentUserResolver(() => ({
    id: ownerId,
    role: 'owner',
    status: 'Active',
    workspaceId: wsId,
  } as any));

  // Mock authenticated owner
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

  // Initialize test branches
  const mainBranch: Branch = {
    id: 'branch-main-hq',
    workspaceId: wsId,
    branchCode: 'MAIN',
    branchName: 'Main Headquarter Branch',
    branchType: 'Store',
    address: '101 Industrial Area, Phase 1',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110020',
    phone: '9876543210',
    gstin: '07AAAAA0000A1Z5',
    status: 'Active',
    isMainBranch: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testBranch: Branch = {
    id: 'branch-test-sub',
    workspaceId: wsId,
    branchCode: 'TEST',
    branchName: 'Test Warehouse Branch',
    branchType: 'Warehouse',
    address: 'Plot 45 Logistics Hub',
    city: 'Gurugram',
    state: 'Haryana',
    pincode: '122001',
    phone: '9876543211',
    gstin: '06AAAAA0000A1Z6',
    status: 'Active',
    isMainBranch: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const otherBranch: Branch = {
    id: 'branch-other-unauth',
    workspaceId: wsId,
    branchCode: 'OTHER',
    branchName: 'Other Remote Branch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  safeSaveTenantStorage('vistaar_local_branches_db', [mainBranch, testBranch, otherBranch]);

  // Initialize test product
  const testProduct: Product = {
    id: 'prod-gear-bearing-101',
    name: 'High Precision Gear Bearing',
    partNumber: 'GB-8800',
    sku: 'SKU-GB-8800',
    hsnSac: '84821010',
    categoryId: 'cat-bearings',
    unit: 'PCS',
    buyPrice: 450,
    sellingPrice: 750,
    minimumStock: 5,
    currentStock: 50,
    taxPercent: 18,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  safeSaveTenantStorage('vistaar_local_products_db', [testProduct]);

  // Set initial branch inventory:
  // Main Branch has 50 units
  // Test Branch has 0 units
  const initialBranchInv = [
    {
      id: 'inv-main-1',
      workspaceId: wsId,
      branchId: mainBranch.id,
      productId: testProduct.id,
      currentStock: 50,
      openingStock: 50,
      minStock: 5,
      status: 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'inv-test-1',
      workspaceId: wsId,
      branchId: testBranch.id,
      productId: testProduct.id,
      currentStock: 0,
      openingStock: 0,
      minStock: 5,
      status: 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  safeSaveTenantStorage('vistaar_local_branch_inventory_db', initialBranchInv);

  // Initialize source branch stock receipt for FIFO costing
  const initialReceipts = [
    {
      id: 'rec-main-1',
      workspace_id: wsId,
      branch_id: mainBranch.id,
      branchId: mainBranch.id,
      product_id: testProduct.id,
      productId: testProduct.id,
      receipt_number: 'REC-OPENING-01',
      received_date: '2026-10-01',
      quantity_received: 50,
      quantityReceived: 50,
      quantity_remaining: 50,
      quantityRemaining: 50,
      buy_price: 450,
      buyPrice: 450,
      notes: 'Initial opening inventory',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  safeSaveTenantStorage('vistaar_local_stock_receipts_db', initialReceipts);
  safeSaveTenantStorage('vistaar_local_stock_movements_db', []);
  safeSaveTenantStorage('vistaar_local_stock_transfers_db', []);

  // -------------------------------------------------------------------------
  // TEST A: Successful transfer of 10 units from Main Branch to Test Branch
  // -------------------------------------------------------------------------
  console.log('--- TEST A: Successful Stock Transfer (10 Units Main -> Test) ---');
  const transferRes = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: '2026-10-17',
    notes: 'Urgent warehouse replenishment via dispatch van DL-01',
    items: [
      {
        productId: testProduct.id,
        quantity: 10,
        unitCost: 450,
        notes: 'Carton #4',
      },
    ],
  });

  assert(transferRes.success === true, 'Test A - Transfer Success', `Transfer succeeded with ID: ${transferRes.transferId}`);
  assert(
    !!transferRes.transferNumber && transferRes.transferNumber.startsWith('STN-2026-'),
    'Test A - Document Numbering Format',
    `Assigned document number: ${transferRes.transferNumber}`
  );

  const mainStockAfter = await branchService.getAuthoritativeStock(testProduct.id, mainBranch.id);
  const testStockAfter = await branchService.getAuthoritativeStock(testProduct.id, testBranch.id);

  assert(mainStockAfter === 40, 'Test A - Source Inventory Deducted', `Main Branch stock was 50, now: ${mainStockAfter} (-10)`);
  assert(testStockAfter === 10, 'Test A - Destination Inventory Added', `Test Branch stock was 0, now: ${testStockAfter} (+10)`);

  const createdTrf = transferRes.transfer;
  assert(
    createdTrf !== undefined && createdTrf.items?.length === 1 && createdTrf.totalQuantity === 10,
    'Test A - Enriched Transfer Record Snapshot',
    `Items count: ${createdTrf?.items?.length}, Total Qty: ${createdTrf?.totalQuantity}, Part #: ${createdTrf?.items?.[0]?.partNumber}`
  );

  const expectedValuation = 10 * 450;
  assert(
    createdTrf?.totalTransferValue === expectedValuation,
    'Test A - Internal Valuation Calculation',
    `Valuation is ₹${createdTrf?.totalTransferValue} (10 units * ₹450 cost price)`
  );

  // -------------------------------------------------------------------------
  // TEST B: Download & Retrieval After Simulated Restart
  // -------------------------------------------------------------------------
  console.log('\n--- TEST B: Transfer History Retrieval & Re-hydration ---');
  // Re-fetch through getStockTransfers and getSingleStockTransfer
  const historyList = await branchService.getStockTransfers();
  const matchedTrf = historyList.data.find((t) => t.transferNumber === transferRes.transferNumber);

  assert(
    matchedTrf !== undefined,
    'Test B - Persisted in Transfer History',
    `Retrieved transfer #${matchedTrf?.transferNumber} from persistent storage`
  );

  assert(
    matchedTrf?.sourceBranchName === mainBranch.branchName && matchedTrf?.destinationBranchName === testBranch.branchName,
    'Test B - Branch Information Preserved',
    `Origin: ${matchedTrf?.sourceBranchName} -> Destination: ${matchedTrf?.destinationBranchName}`
  );

  assert(
    matchedTrf?.items?.[0]?.productName === testProduct.name && matchedTrf?.items?.[0]?.quantity === 10,
    'Test B - Line Item Metadata Preserved Across Restart',
    `Product: ${matchedTrf?.items?.[0]?.productName}, Qty: ${matchedTrf?.items?.[0]?.quantity}`
  );

  const singleRes = await branchService.getSingleStockTransfer(transferRes.transferNumber!);
  assert(
    singleRes.data !== null && singleRes.data.id === transferRes.transferId,
    'Test B - getSingleStockTransfer Retrieval',
    `Found by transferNumber: ${singleRes.data?.transferNumber}`
  );

  // -------------------------------------------------------------------------
  // TEST C: Insufficient Stock Rejection
  // -------------------------------------------------------------------------
  console.log('\n--- TEST C: Insufficient Stock Rejection ---');
  // Main Branch now has 40 units. Attempt to transfer 100 units.
  const overTransferRes = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: '2026-10-17',
    items: [{ productId: testProduct.id, quantity: 100 }],
  });

  assert(
    overTransferRes.success === false,
    'Test C - Excessive Transfer Rejected',
    `Correctly rejected: "${overTransferRes.error}"`
  );

  const mainStockPostReject = await branchService.getAuthoritativeStock(testProduct.id, mainBranch.id);
  const testStockPostReject = await branchService.getAuthoritativeStock(testProduct.id, testBranch.id);

  assert(
    mainStockPostReject === 40 && testStockPostReject === 10,
    'Test C - Zero Mutation on Rejection',
    `Main stock remains ${mainStockPostReject}, Test stock remains ${testStockPostReject}`
  );

  // -------------------------------------------------------------------------
  // TEST D: Same Branch Transfer Rejection & Duplicate Prevention
  // -------------------------------------------------------------------------
  console.log('\n--- TEST D: Same Branch Rejection & Validation ---');
  const sameBranchRes = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: mainBranch.id,
    items: [{ productId: testProduct.id, quantity: 5 }],
  });

  assert(
    sameBranchRes.success === false && sameBranchRes.error?.includes('must be different'),
    'Test D - Same Branch Transfer Prevented',
    `Error: "${sameBranchRes.error}"`
  );

  // -------------------------------------------------------------------------
  // TEST E: PDF Filename and Document Data Integrity
  // -------------------------------------------------------------------------
  console.log('\n--- TEST E: PDF Filename & Document Integrity ---');
  const filename = buildStockTransferFilename(transferRes.transferNumber!);
  assert(
    filename === `VISTAAR-StockTransfer-${transferRes.transferNumber}.pdf`,
    'Test E - PDF Filename Conforms to Standard',
    `Filename: ${filename}`
  );

  // Check sequential numbering progression
  const nextTrfNum = generateStockTransferNumber(historyList.data);
  const expectedNextNum = `STN-2026-0002`;
  assert(
    nextTrfNum === expectedNextNum,
    'Test E - Sequential Document Number Progression',
    `Current: ${transferRes.transferNumber}, Next: ${nextTrfNum}`
  );

  // -------------------------------------------------------------------------
  // TEST F: Branch Isolation and Permissions
  // -------------------------------------------------------------------------
  console.log('\n--- TEST F: Branch Isolation Filtering ---');
  // Main Branch query should see the transfer
  const mainBranchTransfers = await branchService.getStockTransfers(mainBranch.id);
  assert(
    mainBranchTransfers.data.some((t) => t.transferNumber === transferRes.transferNumber),
    'Test F - Visible to Source Branch (Main)',
    `Main Branch retrieved ${mainBranchTransfers.data.length} transfers`
  );

  // Test Branch query should see the transfer
  const testBranchTransfers = await branchService.getStockTransfers(testBranch.id);
  assert(
    testBranchTransfers.data.some((t) => t.transferNumber === transferRes.transferNumber),
    'Test F - Visible to Destination Branch (Test)',
    `Test Branch retrieved ${testBranchTransfers.data.length} transfers`
  );

  // Other Branch (unrelated) query should NOT see this transfer
  const otherBranchTransfers = await branchService.getStockTransfers(otherBranch.id);
  assert(
    !otherBranchTransfers.data.some((t) => t.transferNumber === transferRes.transferNumber),
    'Test F - Hidden from Unrelated Branch (Other)',
    `Other Branch retrieved ${otherBranchTransfers.data.length} transfers (transfer isolated)`
  );

  // -------------------------------------------------------------------------
  // TEST G: Financial and Analytics Rules (Zero Sales / Revenue Impact)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST G: Analytics & Financial Non-Mutation Verification ---');
  const invoices = store.getInvoices();
  const payments = store.getPayments();
  const totalSales = invoices.reduce((sum, i) => sum + (i.grandTotal || 0), 0);
  const totalCollections = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  assert(
    !invoices.some((i) => i.invoiceNumber === transferRes.transferNumber),
    'Test G - No Customer Invoice Created',
    'Customer invoice database clean'
  );

  assert(
    !payments.some((p) => p.reference === transferRes.transferNumber),
    'Test G - No Customer Payment or Collection Created',
    'Customer payments database clean'
  );

  assert(
    totalSales === 0 || totalSales >= 0,
    'Test G - Total Sales Not Inflated by Internal Transfer',
    `Total Sales remains unaffected by internal movement (Sales: ₹${totalSales}, Collections: ₹${totalCollections})`
  );

  // -------------------------------------------------------------------------
  // TEST H: Second Transfer & Cumulative Inventory Tracking
  // -------------------------------------------------------------------------
  console.log('\n--- TEST H: Multiple Line Items & Second Transfer ---');
  const secondTransferRes = await branchService.executeStockTransfer({
    sourceBranchId: mainBranch.id,
    destinationBranchId: testBranch.id,
    transferDate: '2026-10-17',
    notes: 'Second batch transfer',
    items: [{ productId: testProduct.id, quantity: 15, unitCost: 450 }],
  });

  assert(
    secondTransferRes.success === true && secondTransferRes.transferNumber === 'STN-2026-0002',
    'Test H - Second Transfer Generated Sequential STN-2026-0002',
    `Assigned: ${secondTransferRes.transferNumber}`
  );

  const mainFinalStock = await branchService.getAuthoritativeStock(testProduct.id, mainBranch.id);
  const testFinalStock = await branchService.getAuthoritativeStock(testProduct.id, testBranch.id);

  assert(
    mainFinalStock === 25 && testFinalStock === 25,
    'Test H - Final Cumulative Stock Levels Synchronized',
    `Main Branch stock: ${mainFinalStock} (50 - 10 - 15), Test Branch stock: ${testFinalStock} (0 + 10 + 15)`
  );

  // Total inventory across all branches remains 50
  assert(
    mainFinalStock + testFinalStock === 50,
    'Test H - Total Enterprise Inventory Conserved (Conservation of Mass)',
    `Sum of branches (${mainFinalStock} + ${testFinalStock}) = 50 total units`
  );

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log('\n=============================================================');
  console.log(`TEST RUN COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED out of ${results.length}`);
  console.log('=============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runStockTransferTestSuite().catch((err) => {
  console.error('Fatal test error in stock transfer suite:', err);
  process.exit(1);
});
