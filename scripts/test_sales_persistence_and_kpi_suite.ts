import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { paymentService } from '../src/services/supabase/paymentService';
import { productService } from '../src/services/supabase/productService';
import { store } from '../src/services/store';
import { safeGetTenantStorage, safeSaveTenantStorage, safeSaveTenantItem } from '../src/services/supabase/safeStorage';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { resolveDateRange } from '../src/lib/dateRange';
import { Product, Branch } from '../src/types';

console.log('========================================================================');
console.log('⚡ VISTAAR SALES PERSISTENCE, STOCK ATOMICITY & DASHBOARD KPI REGRESSION SUITE');
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

async function runTestSuite() {
  const wsId = '11111111-2222-4333-8444-555555555555';
  safeSaveTenantItem('active_company_id', wsId);
  (supabaseAuthService as any).getCurrentCompanyId = () => wsId;
  (supabaseAuthService as any).getAuthoritativeWorkspaceId = async () => wsId;
  (supabaseAuthService as any).getUser = () => ({ id: '99999999-9999-4999-8999-999999999999', email: 'owner@vistaar.com', role: 'owner' } as any);
  (supabaseAuthService as any).isOwner = () => true;

  // Setup Branches: Main Branch and testbranch
  const mainBranch: Branch = {
    id: '11111111-0000-4000-8000-000000000001',
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
    id: '22222222-0000-4000-8000-000000000002',
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

  // Register Current User Permission Resolver for owner role
  const { registerCurrentUserResolver } = await import('../src/lib/permissions');
  registerCurrentUserResolver(() => ({
    id: 'usr-owner-001',
    name: 'Owner User',
    email: 'owner@vistaar.com',
    role: 'owner',
    status: 'Active',
    workspaceId: wsId,
    createdAt: new Date().toISOString(),
  } as any));

  // Setup Product: Bearing (Reference 100SS) with 50 units initial stock
  const bearingProduct: Product = {
    id: 'prod-bearing-100ss',
    workspaceId: wsId,
    name: 'Bearing',
    partNumber: '100SS',
    productCode: '100SS',
    sku: '100SS',
    category: 'Bearings',
    unit: 'Pcs',
    currentStock: 50,
    openingStock: 50,
    minimumStock: 5,
    buyPrice: 250,
    sellingPrice: 380, // 20 units * 380 = 7,600
    currentBuyPrice: 250,
    currentSellPrice: 380,
    status: 'In Stock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  safeSaveTenantStorage('vistaar_local_products_db', [bearingProduct]);
  (store as any).state.products = [bearingProduct];

  // Setup Branch Inventory for testbranch (50 units)
  safeSaveTenantStorage('vistaar_local_branch_inventory_db', [
    {
      id: 'bi-test-bearing',
      branchId: testBranch.id,
      branch_id: testBranch.id,
      productId: bearingProduct.id,
      product_id: bearingProduct.id,
      currentStock: 50,
      current_stock: 50,
      updatedAt: new Date().toISOString(),
    },
  ]);
  safeSaveTenantStorage('vistaar_local_counter_sales_db', []);
  safeSaveTenantStorage('vistaar_local_invoices_db', []);
  safeSaveTenantStorage('vistaar_local_payments_db', []);
  (store as any).state.counterSales = [];
  (store as any).state.invoices = [];
  (store as any).state.payments = [];
  salesAnalyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();

  const todayRange = resolveDateRange('today');

  // ===========================================================================
  // TEST A: Fully Paid Counter Sale (Incident Under Test: 100SS, 20 units Bearing, ₹7,600 in testbranch)
  // ===========================================================================
  console.log('🔹 TEST A: Fully Paid Counter Sale (₹7,600 Bearing in testbranch)');
  const initialStockA = await productService.getProductAvailableStock(bearingProduct.id, testBranch.id);
  assert(initialStockA === 50, `Initial stock of Bearing is 50 (found: ${initialStockA})`);

  const counterSalePayloadA = {
    saleNumber: 'CS-REG-001',
    invoiceNumber: 'CS-REG-001',
    branchId: testBranch.id,
    customerName: 'Customer 100SS',
    phoneNumber: '9876543210',
    saleDate: todayRange.startDateStr,
    subtotal: 7600,
    finalTotal: 7600,
    paymentMethod: 'UPI',
    amountReceived: 7600,
    balanceAmount: 0,
    items: [
      {
        productId: bearingProduct.id,
        productName: bearingProduct.name,
        partNumber: '100SS',
        quantity: 20,
        rate: 380,
        amount: 7600,
        buyPriceSnapshot: 250,
      },
    ],
  };

  const saleResA = await counterSaleService.createCounterSale(counterSalePayloadA);
  assert(saleResA.success === true, `Counter sale creation succeeded (id: ${saleResA.data?.id})`);

  // Verify stock deduction
  const remainingStockA = await productService.getProductAvailableStock(bearingProduct.id, testBranch.id);
  assert(remainingStockA === 30, `Stock decreased by exactly 20 units (50 -> 30, found: ${remainingStockA})`);

  // Verify discovery in Counter Sales History
  const csHistory = await counterSaleService.getCounterSales({ branchId: testBranch.id });
  const foundSaleA = csHistory.data.find((s) => s.saleNumber === 'CS-REG-001');
  assert(foundSaleA != null, `Counter Sales History displays the transaction for testbranch`);
  assert(foundSaleA?.finalTotal === 7600, `Found sale has correct final total ₹7,600`);

  // Verify search by item reference "100SS"
  const searchBy100SS = await counterSaleService.getCounterSales({ branchId: testBranch.id, search: '100SS' });
  assert(searchBy100SS.data.length > 0 && searchBy100SS.data[0].saleNumber === 'CS-REG-001', `Search by "100SS" retrieves the counter sale`);

  // Verify Dashboard KPIs for testbranch
  salesAnalyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();
  const testBranchKpisA = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, testBranch.id, wsId);
  assert(testBranchKpisA.totalSales === 7600, `Dashboard Total Sales for testbranch is ₹7,600 (found: ${testBranchKpisA.totalSales})`);
  assert(testBranchKpisA.collections === 7600, `Dashboard Collections for testbranch is ₹7,600 (found: ${testBranchKpisA.collections})`);
  assert(testBranchKpisA.outstandingUdhari === 0, `Dashboard Outstanding Udhari is ₹0`);

  // ===========================================================================
  // TEST B: Failed Transaction Rollback (Insufficient Stock)
  // ===========================================================================
  console.log('\n🔹 TEST B: Failed Transaction Rollback (Reject Over-Stock Sale)');
  const stockBeforeB = await productService.getProductAvailableStock(bearingProduct.id, testBranch.id);

  const overStockPayloadB = {
    saleNumber: 'CS-REG-FAIL',
    invoiceNumber: 'CS-REG-FAIL',
    branchId: testBranch.id,
    customerName: 'Failed Order Buyer',
    finalTotal: 38000,
    amountReceived: 38000,
    paymentMethod: 'Cash',
    items: [
      {
        productId: bearingProduct.id,
        productName: bearingProduct.name,
        quantity: 100, // Only 30 units available!
        rate: 380,
      },
    ],
  };

  const saleResB = await counterSaleService.createCounterSale(overStockPayloadB);
  assert(saleResB.success === false, `Transaction rejected due to insufficient stock: "${saleResB.error}"`);

  // Verify stock was NOT deducted
  const stockAfterB = await productService.getProductAvailableStock(bearingProduct.id, testBranch.id);
  assert(stockAfterB === stockBeforeB, `Stock was NOT mutated on failed sale (${stockBeforeB} -> ${stockAfterB})`);

  // Verify no partial sale was saved
  const failHistory = await counterSaleService.getCounterSales({ search: 'CS-REG-FAIL' });
  assert(failHistory.data.length === 0, `No partial or corrupted sale record exists in history`);

  // ===========================================================================
  // TEST C: Duplicate Submission (Idempotency)
  // ===========================================================================
  console.log('\n🔹 TEST C: Duplicate Submission (Idempotency Key Guard)');
  const stockBeforeC = await productService.getProductAvailableStock(bearingProduct.id, testBranch.id);
  
  // Submit identical counter sale request with same saleNumber and invoiceNumber
  const saleResC = await counterSaleService.createCounterSale(counterSalePayloadA);
  assert(saleResC.success === true, `Duplicate submission handled gracefully`);

  // Verify stock was not deducted again
  const stockAfterC = await productService.getProductAvailableStock(bearingProduct.id, testBranch.id);
  assert(stockAfterC === stockBeforeC, `Stock was NOT deducted twice on duplicate submission (remains: ${stockAfterC})`);

  // Verify KPIs did not double-count
  salesAnalyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();
  const testBranchKpisC = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, testBranch.id, wsId);
  assert(testBranchKpisC.totalSales === 7600, `Dashboard Total Sales remains ₹7,600 without double counting (found: ${testBranchKpisC.totalSales})`);
  assert(testBranchKpisC.collections === 7600, `Dashboard Collections remains ₹7,600 without double counting (found: ${testBranchKpisC.collections})`);

  // ===========================================================================
  // TEST D: Invoice Creation, Persistence & Finalization
  // ===========================================================================
  console.log('\n🔹 TEST D: Invoice Persistence, Deep Search (100SS), and Finalization');
  const invoicePayloadD = {
    branchId: testBranch.id,
    customerName: 'Industrial Client Alpha',
    customerPhone: '9123456789',
    invoiceNumber: 'INV-TEST-001',
    date: todayRange.startDateStr,
    dueDate: todayRange.endDateStr,
    items: [
      {
        productId: bearingProduct.id,
        productName: bearingProduct.name,
        partNumber: '100SS',
        quantity: 10,
        sellingPrice: 500,
        total: 5000,
      },
    ],
    subtotal: 5000,
    grandTotal: 5000,
    paidAmount: 5000,
    balanceAmount: 0,
    paymentMode: 'Bank Transfer' as any,
    paymentStatus: 'Paid' as any,
  };

  const invResD = await invoiceService.finalizeAuthoritativeInvoice(invoicePayloadD as any);
  assert(invResD.success === true, `Invoice finalized successfully (number: ${invResD.invoiceNumber})`);

  // Stock deduction check: 30 - 10 = 20
  const stockAfterD = await productService.getProductAvailableStock(bearingProduct.id, testBranch.id);
  assert(stockAfterD === 20, `Stock deducted by exactly 10 units for invoice (30 -> 20, found: ${stockAfterD})`);

  // Search by invoice number
  const invSearchNum = await invoiceService.getInvoices({ branchId: testBranch.id, search: 'INV-TEST-001' });
  assert(invSearchNum.data.length > 0, `Invoice found by invoice number search`);

  // Deep search by item reference "100SS"
  const invSearchItem = await invoiceService.getInvoices({ branchId: testBranch.id, search: '100SS' });
  assert(invSearchItem.data.length > 0, `Invoice found by child product reference "100SS" search`);

  // ===========================================================================
  // TEST E: Restart / Reload Persistence
  // ===========================================================================
  console.log('\n🔹 TEST E: Application Reload & Data Durability');
  // Clear in-memory caches and re-evaluate
  salesAnalyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();

  const reloadSales = await counterSaleService.getCounterSales({ branchId: testBranch.id });
  const reloadInvoices = await invoiceService.getInvoices({ branchId: testBranch.id });
  assert(reloadSales.data.some((s) => s.saleNumber === 'CS-REG-001'), `Counter sale persisted after cache clear`);
  assert(reloadInvoices.data.some((i) => i.invoiceNumber === 'INV-TEST-001'), `Invoice persisted after cache clear`);

  // ===========================================================================
  // TEST F: Branch Isolation (testbranch vs Main Branch vs All Branches)
  // ===========================================================================
  console.log('\n🔹 TEST F: Strict Branch Isolation (testbranch vs Main Branch vs ALL)');
  salesAnalyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();

  // 1. testbranch KPIs: Counter Sale (7,600) + Invoice (5,000) = 12,600
  const kpisTestBranch = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, testBranch.id, wsId);
  assert(kpisTestBranch.totalSales === 12600, `testbranch Total Sales is ₹12,600 (found: ${kpisTestBranch.totalSales})`);
  assert(kpisTestBranch.collections === 12600, `testbranch Collections is ₹12,600 (found: ${kpisTestBranch.collections})`);

  // 2. Main Branch KPIs: Must EXCLUDE testbranch transactions (should be ₹0)
  const kpisMainBranch = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, mainBranch.id, wsId);
  assert(kpisMainBranch.totalSales === 0, `Main Branch Total Sales excludes testbranch transactions (is ₹0, found: ${kpisMainBranch.totalSales})`);
  assert(kpisMainBranch.collections === 0, `Main Branch Collections excludes testbranch transactions (is ₹0, found: ${kpisMainBranch.collections})`);

  // 3. All Branches KPIs: Aggregates both branches (12,600 + 0 = 12,600)
  const kpisAllBranches = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, 'ALL', wsId);
  assert(kpisAllBranches.totalSales === 12600, `All Branches Total Sales includes authorized transactions exactly once (₹12,600, found: ${kpisAllBranches.totalSales})`);
  assert(kpisAllBranches.collections === 12600, `All Branches Collections is ₹12,600 (found: ${kpisAllBranches.collections})`);

  // ===========================================================================
  // TEST G: Partial Payment and Later Settlement
  // ===========================================================================
  console.log('\n🔹 TEST G: Partial Payment and Later Settlement (No Double Counting)');
  const partialInvPayload = {
    branchId: testBranch.id,
    customerName: 'Partial Buyer Beta',
    invoiceNumber: 'INV-PARTIAL-001',
    date: todayRange.startDateStr,
    dueDate: todayRange.endDateStr,
    items: [
      {
        productName: 'Custom Assembly Service',
        quantity: 1,
        sellingPrice: 7600,
        total: 7600,
      },
    ],
    subtotal: 7600,
    grandTotal: 7600,
    paidAmount: 2000, // Initial upfront payment ₹2,000
    balanceAmount: 5600, // Remaining ₹5,600
    paymentMode: 'Cash' as any,
    paymentStatus: 'Partially Paid' as any,
  };

  const partRes = await invoiceService.finalizeAuthoritativeInvoice(partialInvPayload as any);
  assert(partRes.success === true, `Partially paid invoice created (Remaining: ₹5,600)`);

  // Check KPIs after partial payment
  salesAnalyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();
  const kpisAfterPartial = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, testBranch.id, wsId);
  // Total Sales should increase by 7,600: 12,600 + 7,600 = 20,200
  assert(kpisAfterPartial.totalSales === 20200, `Total Sales increased by full invoice amount ₹7,600 to ₹20,200 (found: ${kpisAfterPartial.totalSales})`);
  // Collections should increase by actual money received: 12,600 + 2,000 = 14,600
  assert(kpisAfterPartial.collections === 14600, `Collections increased by received ₹2,000 to ₹14,600 (found: ${kpisAfterPartial.collections})`);
  assert(kpisAfterPartial.outstandingUdhari === 5600, `Outstanding Udhari reflects remaining ₹5,600 (found: ${kpisAfterPartial.outstandingUdhari})`);

  // Now record remaining settlement payment of ₹5,600
  const settlePayRes = await paymentService.createPayment({
    branchId: testBranch.id,
    invoiceId: partRes.invoiceId,
    invoiceNumber: 'INV-PARTIAL-001',
    amount: 5600,
    method: 'UPI',
    customerName: 'Partial Buyer Beta',
    notes: 'Settlement of remaining balance',
    date: todayRange.startDateStr,
  });
  assert(settlePayRes.success === true, `Settlement payment of ₹5,600 recorded`);

  // Update invoice balance in store
  const updatedInv = store.getInvoices().find((i) => i.invoiceNumber === 'INV-PARTIAL-001');
  if (updatedInv) {
    updatedInv.paidAmount = 7600;
    updatedInv.balanceAmount = 0;
    updatedInv.status = 'Paid';
    store.updateInvoice(updatedInv.id, updatedInv);
  }

  // Recheck KPIs: Total Sales remains ₹20,200 (not increased again), Collections becomes ₹20,200 (14,600 + 5,600)
  salesAnalyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();
  const kpisAfterSettle = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, testBranch.id, wsId);
  assert(kpisAfterSettle.totalSales === 20200, `Total Sales did NOT increase on later settlement (remains ₹20,200, found: ${kpisAfterSettle.totalSales})`);
  assert(kpisAfterSettle.collections === 20200, `Collections reflects full settlement of ₹20,200 (found: ${kpisAfterSettle.collections})`);
  assert(kpisAfterSettle.outstandingUdhari === 0, `Outstanding Udhari is ₹0 after full settlement (found: ${kpisAfterSettle.outstandingUdhari})`);

  console.log('\n========================================================================');
  console.log(`📊 FINAL TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('========================================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
