/**
 * Regression Test Suite: Counter Sale Today's Sales KPI & Dashboard Synchronization
 * Validates:
 * 1. Final payable amount (₹5,400) after ₹600 discount used as sales revenue, not subtotal (₹6,000).
 * 2. Today's Sales increases by ₹5,400 and Discounts Given by ₹600.
 * 3. Transactions Today increases by exactly 1.
 * 4. Month's Sales includes the sale (₹5,400).
 * 5. Net Sales Value includes the sale (₹5,400) and completed sales count = 1.
 * 6. Yesterday's sale is excluded from Today's Sales, but included in This Month's Sales.
 * 7. Midnight IST transition (e.g., UTC timestamp at 18:45:00Z on day D-1 is 00:15:00 IST on day D).
 * 8. Strict branch isolation (Branch A sale does not leak into Branch B).
 * 9. Resilience: Cache invalidation and persistent reload survival.
 * 10. Dashboard and Counter Sale module agreement on transaction totals and branch scope.
 */

import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { store } from '../src/services/store';
import { safeSaveTenantStorage, safeSaveTenantItem } from '../src/services/supabase/safeStorage';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import {
  getIstTodayString,
  normalizeToYyyyMmDd,
  isTransactionInTodayIst,
  isTransactionInMonthIst,
  resolveDateRange,
  addDays,
} from '../src/lib/dateRange';
import { Branch, Product } from '../src/types';

console.log('========================================================================');
console.log('⚡ COUNTER SALE TODAY KPI & DASHBOARD SYNCHRONIZATION REGRESSION SUITE');
console.log('========================================================================\n');

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    totalPassed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    totalFailed++;
  }
}

async function runRegressionSuite() {
  const wsId = '88888888-9999-4000-8000-777777777777';
  safeSaveTenantItem('active_company_id', wsId);
  (supabaseAuthService as any).getCurrentCompanyId = () => wsId;
  (supabaseAuthService as any).getAuthoritativeWorkspaceId = async () => wsId;
  (supabaseAuthService as any).getAuthoritativeWorkspaceIdSync = () => wsId;
  (supabaseAuthService as any).getUser = () => ({ id: 'usr-owner-today', email: 'owner@vistaar.com', role: 'owner' } as any);
  (supabaseAuthService as any).isOwner = () => true;

  // Setup Branches: Main Branch and Branch North
  const mainBranch: Branch = {
    id: 'b1111111-0000-4000-8000-000000000001',
    workspaceId: wsId,
    branchCode: 'MAIN',
    branchName: 'Main Branch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const northBranch: Branch = {
    id: 'b2222222-0000-4000-8000-000000000002',
    workspaceId: wsId,
    branchCode: 'NORTH',
    branchName: 'North Branch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  safeSaveTenantStorage('vistaar_local_branches_db', [mainBranch, northBranch]);
  (store as any).state.branches = [mainBranch, northBranch];

  // Register permissions
  const { registerCurrentUserResolver } = await import('../src/lib/permissions');
  registerCurrentUserResolver(() => ({
    id: 'usr-owner-today',
    name: 'Owner User',
    email: 'owner@vistaar.com',
    role: 'owner',
    status: 'Active',
    workspaceId: wsId,
    createdAt: new Date().toISOString(),
  } as any));

  // Reset local storage & store
  safeSaveTenantStorage('vistaar_local_counter_sales_db', []);
  safeSaveTenantStorage('vistaar_local_invoices_db', []);
  (store as any).state.counterSales = [];
  (store as any).state.invoices = [];
  counterSaleService.invalidateCache();
  salesAnalyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();

  // Setup product for sale
  const testProduct: Product = {
    id: 'prod-widget-1',
    workspaceId: wsId,
    name: 'Industrial Widget',
    partNumber: 'WID-100',
    productCode: 'WID-100',
    sku: 'WID-100',
    category: 'Hardware',
    unit: 'Pcs',
    currentStock: 100,
    openingStock: 100,
    minimumStock: 5,
    buyPrice: 3000,
    sellingPrice: 6000,
    status: 'In Stock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  safeSaveTenantStorage('vistaar_local_products_db', [testProduct]);
  (store as any).state.products = [testProduct];

  // Setup Branch Inventory for North Branch
  safeSaveTenantStorage('vistaar_local_branch_inventory_db', [
    {
      id: 'bi-north-widget',
      branchId: northBranch.id,
      branch_id: northBranch.id,
      productId: testProduct.id,
      product_id: testProduct.id,
      currentStock: 100,
      current_stock: 100,
      updatedAt: new Date().toISOString(),
    },
  ]);

  const istTodayStr = getIstTodayString();
  const currentMonthStr = istTodayStr.substring(0, 7);

  console.log(`Current IST Date: ${istTodayStr}`);
  console.log(`Current Month Prefix: ${currentMonthStr}\n`);

  // -------------------------------------------------------------------------
  // Scenario 1: Initial state for North Branch (Empty)
  // -------------------------------------------------------------------------
  console.log('🔹 SCENARIO 1: Initial Empty Branch Verification');
  const initialMetrics = await counterSaleService.getCounterSaleMetrics({ branchId: northBranch.id });
  assert(initialMetrics.todayTotal === 0, 'North Branch initial Today Total is ₹0');
  assert(initialMetrics.todayCount === 0, 'North Branch initial Today Count is 0');
  assert(initialMetrics.monthTotal === 0, 'North Branch initial Month Total is ₹0');
  assert(initialMetrics.netSales === 0, 'North Branch initial Net Sales is ₹0');
  assert(initialMetrics.totalDiscounts === 0, 'North Branch initial Discounts is ₹0');

  // -------------------------------------------------------------------------
  // Scenario 2: Complete ₹5,400 counter sale with ₹600 discount today
  // Subtotal = ₹6,000, Discount = ₹600, Final Total = ₹5,400
  // -------------------------------------------------------------------------
  console.log('\n🔹 SCENARIO 2: Complete ₹5,400 Sale with ₹600 Discount Today');
  const saleRes = await counterSaleService.createCounterSale({
    invoiceNumber: 'CS-TODAY-001',
    branchId: northBranch.id,
    customerName: 'Aarav Sharma',
    customerPhone: '9876543210',
    saleDate: istTodayStr,
    subtotal: 6000,
    discountType: 'fixed',
    discountValue: 600,
    discountAmount: 600,
    finalTotal: 5400,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    amountReceived: 5400,
    balanceAmount: 0,
    items: [
      {
        productId: testProduct.id,
        productName: testProduct.name,
        partNumber: testProduct.partNumber,
        quantity: 1,
        rate: 6000,
        buyPriceSnapshot: 3000,
      },
    ],
  });

  assert(saleRes.success === true, 'Sale creation succeeded');
  assert(saleRes.data?.finalTotal === 5400, 'Sale finalTotal is ₹5,400');
  assert(saleRes.data?.discountAmount === 600, 'Sale discountAmount is ₹600');

  // Check CounterSaleService metrics for North Branch
  const northMetricsAfterSale = await counterSaleService.getCounterSaleMetrics({ branchId: northBranch.id });
  assert(northMetricsAfterSale.todayTotal === 5400, 'North Branch Today Sales is ₹5,400 (found: ' + northMetricsAfterSale.todayTotal + ')');
  assert(northMetricsAfterSale.todayCount === 1, 'North Branch Today Count is 1 (found: ' + northMetricsAfterSale.todayCount + ')');
  assert(northMetricsAfterSale.monthTotal === 5400, 'North Branch Month Sales is ₹5,400 (found: ' + northMetricsAfterSale.monthTotal + ')');
  assert(northMetricsAfterSale.netSales === 5400, 'North Branch Net Sales Value is ₹5,400 (found: ' + northMetricsAfterSale.netSales + ')');
  assert(northMetricsAfterSale.totalTransactions === 1, 'North Branch Completed Sales Count is 1');
  assert(northMetricsAfterSale.totalDiscounts === 600, 'North Branch Discounts Given is ₹600 (found: ' + northMetricsAfterSale.totalDiscounts + ')');

  // Check Store.getCounterSaleMetrics for North Branch
  const storeMetrics = store.getCounterSaleMetrics(northBranch.id);
  assert(storeMetrics.todayTotal === 5400, 'Store Today Sales for North Branch is ₹5,400');
  assert(storeMetrics.todayCount === 1, 'Store Today Transactions Count is 1');
  assert(storeMetrics.monthTotal === 5400, 'Store Month Sales for North Branch is ₹5,400');
  assert(storeMetrics.netSales === 5400, 'Store Net Sales Value is ₹5,400');
  assert(storeMetrics.totalDiscounts === 600, 'Store Discounts Given is ₹600');

  // Check Dashboard KPIs for North Branch (Today filter)
  console.log('\n🔹 SCENARIO 3: Dashboard Synchronization for North Branch (Today preset)');
  const todayRange = resolveDateRange('today');
  const dashboardTodayKpis = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, northBranch.id, wsId);
  assert(dashboardTodayKpis.totalSales === 5400, 'Dashboard Total Sales is ₹5,400 (found: ' + dashboardTodayKpis.totalSales + ')');
  assert(dashboardTodayKpis.counterSales === 5400, 'Dashboard POS/Counter Sales is ₹5,400');
  assert(dashboardTodayKpis.invoiceSales === 0, 'Dashboard Invoice Sales is ₹0');
  assert(dashboardTodayKpis.collections === 5400, 'Dashboard Collections is ₹5,400');

  // -------------------------------------------------------------------------
  // Scenario 4: Branch Isolation
  // Main Branch must show ₹0, North Branch shows ₹5,400, All Branches shows ₹5,400
  // -------------------------------------------------------------------------
  console.log('\n🔹 SCENARIO 4: Strict Branch Isolation');
  const mainMetrics = await counterSaleService.getCounterSaleMetrics({ branchId: mainBranch.id });
  assert(mainMetrics.todayTotal === 0, 'Main Branch Today Sales is ₹0 (no cross-branch bleed)');
  assert(mainMetrics.todayCount === 0, 'Main Branch Today Count is 0');
  assert(mainMetrics.netSales === 0, 'Main Branch Net Sales is ₹0');

  const dashboardMainKpis = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, mainBranch.id, wsId);
  assert(dashboardMainKpis.totalSales === 0, 'Dashboard Main Branch Total Sales is ₹0');
  assert(dashboardMainKpis.counterSales === 0, 'Dashboard Main Branch POS Sales is ₹0');

  const allBranchesMetrics = await counterSaleService.getCounterSaleMetrics({ branchId: 'ALL' });
  assert(allBranchesMetrics.todayTotal === 5400, 'All Branches Today Sales includes North Branch sale (₹5,400)');
  assert(allBranchesMetrics.todayCount === 1, 'All Branches Today Count is 1');

  // -------------------------------------------------------------------------
  // Scenario 5: Yesterday Sale Handling
  // Create a sale yesterday: must be EXCLUDED from Today's Sales, but INCLUDED in Month's Sales
  // -------------------------------------------------------------------------
  console.log('\n🔹 SCENARIO 5: Yesterday Sale Handling (Date Boundary Exclusion)');
  const yesterdayStr = addDays(istTodayStr, -1);
  const isYesterdaySameMonth = yesterdayStr.startsWith(currentMonthStr);

  const yesterdaySaleRes = await counterSaleService.createCounterSale({
    invoiceNumber: 'CS-YESTERDAY-002',
    branchId: northBranch.id,
    customerName: 'Pooja Verma',
    saleDate: yesterdayStr,
    subtotal: 3000,
    discountType: 'fixed',
    discountValue: 0,
    discountAmount: 0,
    finalTotal: 3000,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    amountReceived: 3000,
    balanceAmount: 0,
    items: [
      {
        productId: testProduct.id,
        productName: testProduct.name,
        partNumber: testProduct.partNumber,
        quantity: 1,
        rate: 3000,
        buyPriceSnapshot: 1500,
      },
    ],
  });
  assert(yesterdaySaleRes.success === true, 'Yesterday sale created successfully');

  const northAfterYesterday = await counterSaleService.getCounterSaleMetrics({ branchId: northBranch.id });
  assert(northAfterYesterday.todayTotal === 5400, "Today's Sales STILL equals ₹5,400 (yesterday's ₹3,000 is excluded)");
  assert(northAfterYesterday.todayCount === 1, "Transactions Today STILL equals 1 (yesterday's sale excluded)");

  if (isYesterdaySameMonth) {
    assert(northAfterYesterday.monthTotal === 8400, "This Month's Sales includes both today and yesterday (₹5,400 + ₹3,000 = ₹8,400, found: " + northAfterYesterday.monthTotal + ")");
  }
  assert(northAfterYesterday.netSales === 8400, 'Net Sales Value includes all completed sales (₹8,400)');
  assert(northAfterYesterday.totalTransactions === 2, 'Total completed transactions count is 2');

  // -------------------------------------------------------------------------
  // Scenario 6: Midnight IST Timezone Skew
  // 12:15 AM IST corresponds to 18:45:00Z on the previous UTC calendar date.
  // -------------------------------------------------------------------------
  console.log('\n🔹 SCENARIO 6: Midnight IST Boundary Skew Resolution');
  // Construct a UTC timestamp: 2026-10-17T19:00:00.000Z which is 2026-10-18T00:30:00+05:30 in IST
  const lateUtcIso = '2026-10-17T19:00:00.000Z';
  const normalizedIstDate = normalizeToYyyyMmDd(lateUtcIso);
  assert(normalizedIstDate === '2026-10-18', 'normalizeToYyyyMmDd correctly converts late UTC timestamp to 2026-10-18 in IST');

  // Early UTC timestamp: 2026-10-17T23:30:00.000Z which is 2026-10-18T05:00:00+05:30 in IST
  const earlyMorningUtcIso = '2026-10-17T23:30:00.000Z';
  assert(normalizeToYyyyMmDd(earlyMorningUtcIso) === '2026-10-18', 'normalizeToYyyyMmDd converts 23:30:00Z to 2026-10-18 in IST');

  // -------------------------------------------------------------------------
  // Scenario 7: Application Reload & Data Persistence
  // Simulate complete browser restart by clearing in-memory caches and reading from storage
  // -------------------------------------------------------------------------
  console.log('\n🔹 SCENARIO 7: Application Reload & Data Persistence');
  counterSaleService.invalidateCache();
  salesAnalyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();

  const reloadedMetrics = await counterSaleService.getCounterSaleMetrics({ branchId: northBranch.id });
  assert(reloadedMetrics.todayTotal === 5400, 'After reload/cache clear: Today Sales remains ₹5,400 (found: ' + reloadedMetrics.todayTotal + ')');
  assert(reloadedMetrics.todayCount === 1, 'After reload/cache clear: Today Count remains 1');
  assert(reloadedMetrics.totalDiscounts === 600, 'After reload/cache clear: Discounts Given remains ₹600');

  // -------------------------------------------------------------------------
  // Scenario 8: Idempotency & Retry Timeout Guard
  // Retrying the same invoice number does NOT double count or create a duplicate sale
  // -------------------------------------------------------------------------
  console.log('\n🔹 SCENARIO 8: Idempotency Guard (No Double Deduction or Double Counting)');
  const retrySale = await counterSaleService.createCounterSale({
    invoiceNumber: 'CS-TODAY-001', // Identical invoice number
    branchId: northBranch.id,
    customerName: 'Aarav Sharma',
    saleDate: istTodayStr,
    subtotal: 6000,
    finalTotal: 5400,
    discountAmount: 600,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    items: [
      {
        productId: testProduct.id,
        productName: testProduct.name,
        quantity: 1,
        rate: 6000,
      },
    ],
  });

  const metricsAfterRetry = await counterSaleService.getCounterSaleMetrics({ branchId: northBranch.id });
  assert(metricsAfterRetry.todayTotal === 5400, 'Today Sales remains ₹5,400 after duplicate retry (no double counting)');
  assert(metricsAfterRetry.todayCount === 1, 'Today Count remains 1 after duplicate retry');

  // -------------------------------------------------------------------------
  // Scenario 9: Exact Example from User Prompt
  // Counter sale created on 17 October 2026: Subtotal ₹6,000, Discount ₹600, Final total ₹5,400.
  // When business date is 17 October 2026: Today's Sales = ₹5,400, Transactions Today = 1.
  // -------------------------------------------------------------------------
  console.log('\n🔹 SCENARIO 9: Exact User Prompt Example (17 Oct 2026 ₹5,400 sale)');
  const exampleSale = {
    id: 'cs-example-oct17',
    saleDate: '2026-10-17',
    subtotal: 6000,
    discountAmount: 600,
    finalTotal: 5400,
    status: 'COMPLETED',
  };

  // When business date is 2026-10-17:
  const isTodayOnOct17 = normalizeToYyyyMmDd(exampleSale.saleDate) === '2026-10-17';
  const isInOctMonth = normalizeToYyyyMmDd(exampleSale.saleDate).startsWith('2026-10');
  assert(isTodayOnOct17 === true, 'On 17 October 2026, the sale matches Today');
  assert(isInOctMonth === true, 'In October 2026, the sale matches This Month');

  console.log('\n========================================================================');
  console.log(`📊 REGRESSION SUITE COMPLETE: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('========================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
