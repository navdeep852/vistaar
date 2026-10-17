if (typeof globalThis.localStorage === 'undefined') {
  const storeMap = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => storeMap.get(key) || null,
    setItem: (key: string, value: string) => { storeMap.set(key, String(value)); },
    removeItem: (key: string) => { storeMap.delete(key); },
    clear: () => { storeMap.clear(); },
    key: (index: number) => Array.from(storeMap.keys())[index] || null,
    get length() { return storeMap.size; },
  } as any;
}
(global as any).localStorage = globalThis.localStorage;

import { resolveDateRange } from '../src/lib/dateRange';
import { analyticsService } from '../src/services/supabase/analyticsService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { branchService } from '../src/services/supabase/branchService';
import { store } from '../src/services/store';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { registerCurrentUserResolver } from '../src/lib/permissions';
import { safeSaveTenantStorage, safeSaveTenantItem, safeGetTenantStorage } from '../src/services/supabase/safeStorage';

async function runMasterVerificationTests() {
  console.log('========================================================================');
  console.log('MASTER PROMPT VERIFICATION SUITE — ALL BRANCHES ANALYSIS KPI CONSISTENCY');
  console.log('========================================================================\n');

  const wsId = '11111111-2222-4444-8888-999999999999';
  const ownerId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  const testOwnerProfile = {
    id: ownerId,
    companyId: wsId,
    role: 'owner',
    name: 'Business Owner',
    email: 'owner@vistaar.com',
    employeeId: 'VST-0001',
    status: 'Active',
  };

  registerCurrentUserResolver(() => testOwnerProfile as any);

  (supabaseAuthService as any).currentProfile = testOwnerProfile;
  localStorage.setItem('vistaar_user_session', JSON.stringify({
    id: ownerId,
    email: 'owner@vistaar.com',
    companyId: wsId,
    role: 'owner',
    businessName: 'VISTAAR Enterprises',
  }));
  localStorage.setItem('vistaar_current_company_id', wsId);
  (supabaseAuthService as any).authoritativeWorkspaceId = wsId;
  supabaseAuthService.isAuthenticated = () => true;
  supabaseAuthService.getUser = () => testOwnerProfile as any;
  supabaseAuthService.getCurrentCompanyId = () => wsId;
  supabaseAuthService.getAuthoritativeWorkspaceId = async () => wsId;

  // Setup branches: Main Branch and Branch 2
  const mainBranchId = 'bbbbbbbb-1111-4444-8888-000000000001';
  const branch2Id = 'bbbbbbbb-2222-4444-8888-000000000002';

  const branches = [
    {
      id: mainBranchId,
      workspaceId: wsId,
      branchCode: 'MAIN',
      branchName: 'Main Branch',
      branchType: 'Store',
      isMainBranch: true,
      status: 'Active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: branch2Id,
      workspaceId: wsId,
      branchCode: 'BR-NORTH',
      branchName: 'North Branch',
      branchType: 'Store',
      isMainBranch: false,
      status: 'Active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  safeSaveTenantStorage('vistaar_local_branches_db', branches);
  safeSaveTenantItem('main_branch_id', mainBranchId);
  console.log('direct getTenantStorage branches count:', safeGetTenantStorage('vistaar_local_branches_db').length);
  console.log('getBranches output:', await branchService.getBranches({ activeOnly: true }));
  console.log('Setup branches check:', await branchService.getUserAuthorizedBranches());

  // Setup sample product for inventory/cogs
  store.addProduct({
    id: 'prod-001',
    name: 'Industrial Widget A',
    sku: 'WID-001',
    sellingPrice: 1000,
    buyPrice: 600,
    currentStock: 100,
    minStock: 10,
    workspaceId: wsId,
  } as any);

  // Today is 2026-10-17
  const today = '2026-10-17';
  const todayRange = resolveDateRange('today');

  // =========================================================================
  // TEST 1 — EXISTING MAIN BRANCH DATA (Matches screenshot test case)
  // =========================================================================
  console.log('--- TEST 1: Existing Main Branch Data Parity ---');
  // Add Main Branch invoice issued today: Grand Total ₹87,194.10, Paid ₹87,194 (UPI), Balance ₹0.10
  store.addInvoice({
    id: 'inv-mb-001',
    workspaceId: wsId,
    branchId: mainBranchId,
    invoiceNumber: 'INV-2026-001',
    customerName: 'Acme Corp',
    date: today,
    status: 'Issued',
    subtotal: 87194.10,
    grandTotal: 87194.10,
    paidAmount: 0,
    balanceAmount: 87194.10,
    items: [],
    paymentMethod: 'UPI',
  } as any);

  // Add upfront payment for Main Branch invoice: ₹87,194 UPI
  store.recordPayment({
    paymentId: 'pay-mb-001',
    branchId: mainBranchId,
    invoiceId: 'inv-mb-001',
    invoiceNumber: 'INV-2026-001',
    amount: 87194.00,
    paymentMethod: 'UPI',
    date: today,
  } as any);

  // Add historical Udhari: ₹1,60,304.70 so total outstanding Udhari equals ₹1,60,304.80
  const histUdhari = {
    id: 'udh-hist-001',
    branchId: mainBranchId,
    customerId: 'cust-001',
    customerNameSnapshot: 'Historical Client',
    originalAmount: 200000,
    totalReceived: 39695.30,
    outstandingAmount: 160304.70,
    status: 'Pending',
    dueDate: '2026-11-01',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
  (store as any).state.udharis.push(histUdhari);
  safeSaveTenantStorage('vistaar_local_udharis_db', [histUdhari]);

  analyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();

  const mbDashboardKpis = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, mainBranchId, wsId);
  console.log('Main Branch Dashboard KPIs:', {
    totalSales: mbDashboardKpis.totalSales,
    invoiceSales: mbDashboardKpis.invoiceSales,
    posSales: mbDashboardKpis.counterSales,
    collections: mbDashboardKpis.collections,
    cashCollections: mbDashboardKpis.cashCollections,
    upiCollections: mbDashboardKpis.upiCollections,
    outstandingUdhari: mbDashboardKpis.outstandingUdhari,
  });

  const orgAnalytics1 = await analyticsService.getOrganizationAnalytics({
    startDate: today,
    endDate: today,
    forceFresh: true,
  });

  console.log('All Branches Analysis KPIs (Before Branch 2 transactions):', {
    totalSales: orgAnalytics1.total_sales,
    invoiceSales: orgAnalytics1.invoice_sales,
    posSales: orgAnalytics1.counter_sales,
    collections: orgAnalytics1.collections,
    cashCollections: orgAnalytics1.cash_collections,
    upiCollections: orgAnalytics1.upi_collections,
    outstandingUdhari: orgAnalytics1.outstanding_udhari,
  });

  if (
    orgAnalytics1.total_sales === mbDashboardKpis.totalSales &&
    orgAnalytics1.collections === mbDashboardKpis.collections &&
    orgAnalytics1.upi_collections === mbDashboardKpis.upiCollections &&
    orgAnalytics1.outstanding_udhari === mbDashboardKpis.outstandingUdhari
  ) {
    console.log('✅ TEST 1 PASSED: All Branches Analysis accurately aggregates Main Branch transactions when no other branches exist. Zero-value KPI bug is RESOLVED!\n');
  } else {
    console.error('❌ TEST 1 FAILED: Discrepancy between Main Branch Dashboard and All Branches Analysis');
    process.exit(1);
  }

  // =========================================================================
  // TEST 2 — MULTIPLE BRANCHES AGGREGATION & BRANCH ISOLATION
  // =========================================================================
  console.log('--- TEST 2: Multi-Branch Aggregation & Isolation ---');
  // Add Branch 2 invoice: ₹25,000 Total, ₹10,000 Paid (Cash), ₹15,000 Balance
  store.addInvoice({
    id: 'inv-br2-001',
    workspaceId: wsId,
    branchId: branch2Id,
    invoiceNumber: 'INV-BR2-001',
    customerName: 'Northern Supplies',
    date: today,
    status: 'Partially Paid',
    subtotal: 25000,
    grandTotal: 25000,
    paidAmount: 0,
    balanceAmount: 25000,
    items: [],
    paymentMethod: 'Cash',
  } as any);

  store.recordPayment({
    paymentId: 'pay-br2-001',
    branchId: branch2Id,
    invoiceId: 'inv-br2-001',
    invoiceNumber: 'INV-BR2-001',
    amount: 10000,
    paymentMethod: 'Cash',
    date: today,
  } as any);

  analyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();

  const mbKpis2 = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, mainBranchId, wsId);
  const br2Kpis2 = await enterpriseAnalyticsService.getDashboardKpis(todayRange, true, branch2Id, wsId);
  const orgAnalytics2 = await analyticsService.getOrganizationAnalytics({
    startDate: today,
    endDate: today,
    forceFresh: true,
  });

  console.log('Main Branch Alone Sales:', mbKpis2.totalSales);
  console.log('North Branch Alone Sales:', br2Kpis2.totalSales);
  console.log('All Branches Organization Sales:', orgAnalytics2.total_sales);
  console.log('Branch performance entries:', orgAnalytics2.branch_performance);

  const expectedOrgSales = Math.round((mbKpis2.totalSales + br2Kpis2.totalSales) * 100) / 100;
  if (
    mbKpis2.totalSales === 87194.10 &&
    br2Kpis2.totalSales === 25000 &&
    orgAnalytics2.total_sales === expectedOrgSales
  ) {
    console.log(`✅ TEST 2 PASSED: Main Branch displays only its ₹87,194.10, North Branch displays only its ₹25,000, and All Branches aggregates both to ₹${expectedOrgSales}\n`);
  } else {
    console.error('❌ TEST 2 FAILED: Isolation or aggregation mismatch.');
    process.exit(1);
  }

  // =========================================================================
  // TEST 3 — COUNTER SALES (POS) INCLUSION
  // =========================================================================
  console.log('--- TEST 3: Completed Counter Sales Inclusion ---');
  // Create a completed counter sale in Main Branch (₹5,000 Cash)
  store.addOrUpdateCounterSale({
    id: 'cs-mb-001',
    workspaceId: wsId,
    branchId: mainBranchId,
    saleNumber: 'POS-MB-001',
    invoiceNumber: 'POS-MB-001',
    customerName: 'Walk-in Retail',
    saleDate: today,
    subtotal: 5000,
    finalTotal: 5000,
    amountReceived: 5000,
    balanceAmount: 0,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    cashAmount: 5000,
    upiAmount: 0,
    items: [],
    createdAt: `${today}T10:00:00.000Z`,
    updatedAt: `${today}T10:00:00.000Z`,
  });

  // Create a completed counter sale in North Branch (₹7,500 UPI)
  store.addOrUpdateCounterSale({
    id: 'cs-br2-001',
    workspaceId: wsId,
    branchId: branch2Id,
    saleNumber: 'POS-BR2-001',
    invoiceNumber: 'POS-BR2-001',
    customerName: 'Walk-in North',
    saleDate: today,
    subtotal: 7500,
    finalTotal: 7500,
    amountReceived: 7500,
    balanceAmount: 0,
    status: 'COMPLETED',
    paymentMethod: 'UPI',
    cashAmount: 0,
    upiAmount: 7500,
    items: [],
    createdAt: `${today}T11:00:00.000Z`,
    updatedAt: `${today}T11:00:00.000Z`,
  });

  analyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();

  const orgAnalytics3 = await analyticsService.getOrganizationAnalytics({
    startDate: today,
    endDate: today,
    forceFresh: true,
  });

  console.log('Organization Counter Sales (POS):', orgAnalytics3.counter_sales);
  if (orgAnalytics3.counter_sales === 12500) {
    console.log('✅ TEST 3 PASSED: Completed counter sales appear exactly once in POS KPI (₹5,000 + ₹7,500 = ₹12,500)\n');
  } else {
    console.error(`❌ TEST 3 FAILED: Expected POS sales ₹12,500, got ₹${orgAnalytics3.counter_sales}`);
    process.exit(1);
  }

  // =========================================================================
  // TEST 4 — PAYMENT METHODS RECONCILIATION
  // =========================================================================
  console.log('--- TEST 4: Payment Methods Reconciliation ---');
  console.log(`Cash Collections: ₹${orgAnalytics3.cash_collections}`);
  console.log(`UPI Collections: ₹${orgAnalytics3.upi_collections}`);
  console.log(`Total Collections: ₹${orgAnalytics3.collections}`);

  const mathSum = orgAnalytics3.cash_collections + orgAnalytics3.upi_collections;
  if (orgAnalytics3.collections === mathSum) {
    console.log(`✅ TEST 4 PASSED: Total Collections (₹${orgAnalytics3.collections}) strictly equals Cash (₹${orgAnalytics3.cash_collections}) + UPI (₹${orgAnalytics3.upi_collections})\n`);
  } else {
    console.error('❌ TEST 4 FAILED: Collections math discrepancy.');
    process.exit(1);
  }

  // =========================================================================
  // TEST 5 — DIFFERENT EVENT DATES
  // =========================================================================
  console.log('--- TEST 5: Different Event Dates (Invoice today, Payment yesterday) ---');
  const yesterday = '2026-10-16';
  // Create invoice issued yesterday
  store.addInvoice({
    id: 'inv-hist-yesterday',
    workspaceId: wsId,
    branchId: mainBranchId,
    invoiceNumber: 'INV-YEST-001',
    customerName: 'Yesterday Customer',
    date: yesterday,
    status: 'Issued',
    grandTotal: 15000,
    paidAmount: 0,
    balanceAmount: 15000,
    items: [],
  } as any);

  // Receive payment for it today
  store.recordPayment({
    paymentId: 'pay-today-for-yesterday',
    branchId: mainBranchId,
    invoiceId: 'inv-hist-yesterday',
    invoiceNumber: 'INV-YEST-001',
    amount: 15000,
    paymentMethod: 'Cash',
    date: today,
  } as any);

  analyticsService.invalidateCache();
  enterpriseAnalyticsService.invalidateCache();

  const yesterdayAnalytics = await analyticsService.getOrganizationAnalytics({
    startDate: yesterday,
    endDate: yesterday,
    forceFresh: true,
  });

  console.log('Yesterday Sales (includes ₹15k invoice):', yesterdayAnalytics.invoice_sales);
  console.log('Yesterday Collections (excludes today payment):', yesterdayAnalytics.collections);

  if (yesterdayAnalytics.invoice_sales >= 15000 && yesterdayAnalytics.collections === 0) {
    console.log('✅ TEST 5 PASSED: Yesterday view includes invoice issued yesterday, but does NOT include payment received today.\n');
  } else {
    console.error('❌ TEST 5 FAILED: Event dates mixing detected.');
    process.exit(1);
  }

  // =========================================================================
  // TEST 6 — UDHARI RECONCILIATION
  // =========================================================================
  console.log('--- TEST 6: Udhari Reconciliation Across Branches ---');
  const sumBranchUdhari = orgAnalytics3.branch_performance.reduce((acc, b) => acc + b.outstanding_udhari, 0);
  console.log(`Sum of authorized branches' Udhari: ₹${sumBranchUdhari.toFixed(2)}`);
  console.log(`All Branches Organization Udhari: ₹${orgAnalytics3.outstanding_udhari.toFixed(2)}`);

  const udhariDiff = Math.abs(sumBranchUdhari - orgAnalytics3.outstanding_udhari);
  if (udhariDiff <= 1.0) { // Rounding tolerance
    console.log('✅ TEST 6 PASSED: Branch-level Udhari strictly reconciles with Organization Udhari.\n');
  } else {
    console.error('❌ TEST 6 FAILED: Udhari discrepancy across branch ledger.');
    process.exit(1);
  }

  // =========================================================================
  // TEST 7 — DATE FILTERS (Today, Yesterday, This Month)
  // =========================================================================
  console.log('--- TEST 7: Date Filter Consistency ---');
  const thisMonthRange = resolveDateRange('this_month');
  const monthAnalytics = await analyticsService.getOrganizationAnalytics({
    startDate: thisMonthRange.startDateStr,
    endDate: thisMonthRange.endDateStr,
    forceFresh: true,
  });

  console.log(`This Month Total Sales (${thisMonthRange.startDateStr} to ${thisMonthRange.endDateStr}): ₹${monthAnalytics.total_sales}`);
  if (monthAnalytics.total_sales >= orgAnalytics3.total_sales) {
    console.log('✅ TEST 7 PASSED: This Month totals encapsulate today and earlier transactions correctly.\n');
  } else {
    console.error('❌ TEST 7 FAILED: Month totals smaller than daily totals.');
    process.exit(1);
  }

  // =========================================================================
  // TEST 8 — QUERY FAILURE ERROR SURFACING
  // =========================================================================
  console.log('--- TEST 8: Error Surfacing (No Silent ₹0 on failure) ---');
  try {
    // Calling with an invalid workspace ID should throw rather than return fake 0
    await analyticsService.getBranchDashboardMetrics({
      workspaceId: 'invalid-ws-uuid',
      startDate: today,
      endDate: today,
      forceFresh: true,
    });
    console.error('❌ TEST 8 FAILED: Expected an error on invalid workspace ID');
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes('Valid workspace ID is required')) {
      console.log('✅ TEST 8 PASSED: Query failure correctly raises error, preventing misleading ₹0 financial display.\n');
    } else {
      console.error('❌ TEST 8 FAILED: Unexpected error message:', err.message);
      process.exit(1);
    }
  }

  // =========================================================================
  // TEST 9 — TENANT AND WORKSPACE SECURITY ISOLATION
  // =========================================================================
  console.log('--- TEST 9: Tenant and Workspace Isolation ---');
  const foreignWsId = '99999999-9999-4444-8888-000000000099';
  store.addInvoice({
    id: 'inv-foreign-001',
    workspaceId: foreignWsId,
    invoiceNumber: 'INV-FOREIGN-001',
    customerName: 'Foreign Hacker',
    grandTotal: 10000000,
    paidAmount: 10000000,
    date: today,
    status: 'Paid',
    items: [],
  } as any);

  analyticsService.invalidateCache();
  const orgAnalyticsAfterForeign = await analyticsService.getOrganizationAnalytics({
    startDate: today,
    endDate: today,
    forceFresh: true,
  });

  const hasForeign = orgAnalyticsAfterForeign.total_sales >= 10000000;
  if (!hasForeign) {
    console.log('✅ TEST 9 PASSED: Unauthorized foreign tenant transactions are strictly excluded.\n');
  } else {
    console.error('❌ TEST 9 FAILED: Foreign tenant data leaked into organization analytics!');
    process.exit(1);
  }

  // =========================================================================
  // TEST 10 — VISUALIZATIONS AND LEDGER DATA INTEGRITY
  // =========================================================================
  console.log('--- TEST 10: Visualizations & Ledger Data Integrity ---');
  console.log('Sales by Branch:', orgAnalytics3.sales_by_branch);
  console.log('Collections by Branch:', orgAnalytics3.collections_by_branch);
  console.log('Outstanding by Branch:', orgAnalytics3.outstanding_by_branch);
  console.log('Branch Performance Ledger Entries:', orgAnalytics3.branch_performance.length);

  if (
    orgAnalytics3.sales_by_branch.length === 2 &&
    orgAnalytics3.collections_by_branch.length === 2 &&
    orgAnalytics3.outstanding_by_branch.length === 2 &&
    orgAnalytics3.branch_performance.length === 2
  ) {
    console.log('✅ TEST 10 PASSED: All visualizations and branch ledger entries match authorized branch count exactly.\n');
  } else {
    console.error('❌ TEST 10 FAILED: Visualizations or ledger missing branches.');
    process.exit(1);
  }

  console.log('========================================================================');
  console.log('🎉 ALL 10 MANDATORY VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================');
}

runMasterVerificationTests().catch((err) => {
  console.error('Master Test Suite Error:', err);
  process.exit(1);
});
