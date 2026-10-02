/**
 * TEST: Dashboard KPI Authorization & RBAC Separation
 *
 * Validates:
 * 1. Employee with 'dashboard.view' can load Dashboard KPIs for Today, Yesterday, This Week, This Month, Custom.
 * 2. Employee is strictly DENIED from 'analytics.view' (getAnalyticsOverview, getExecutiveKpis).
 * 3. Employee is strictly DENIED from 'financial_statements.view'.
 * 4. Business Owner has full access to Dashboard KPIs, Analytics, and Financial Statements.
 * 5. Dashboard KPI path does not depend on 'analytics.view'.
 */

// 1. Setup headless Node.js browser environment mocks
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

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: globalThis.localStorage,
    location: { origin: 'http://localhost:3000' },
    isHeadlessTest: true,
  };
} else {
  (globalThis.window as any).isHeadlessTest = true;
}

import { supabaseAuthService } from '../src/services/supabaseAuth';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { financialStatementService } from '../src/services/financialStatementService';
import { hasCurrentUserPermission, AuthorizationError } from '../src/lib/permissions';
import { resolveDateRange, getIstTodayString } from '../src/lib/dateRange';
import { UserProfile } from '../src/types';

async function runTests() {
  console.log('================================================================');
  console.log('VERIFYING DASHBOARD KPI AUTHORIZATION & RBAC BOUNDARY');
  console.log('================================================================\n');

  // Await background auth initialization and onAuthStateChange to settle
  try {
    await (supabaseAuthService as any).initPromise;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testId: string, desc: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testId}: ${desc}${detail ? ` -> ${detail}` : ''}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testId}: ${desc}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  const workspaceId = 'a0000000-0000-4000-8000-000000000001';

  const ownerProfile: UserProfile = {
    id: 'b0000000-0000-4000-8000-000000000001',
    companyId: workspaceId,
    name: 'Vikram Singh',
    email: 'owner@vistaar.com',
    role: 'owner',
    employeeId: 'VST-00001',
    status: 'Active',
  };

  const employeeProfile: UserProfile = {
    id: 'b0000000-0000-4000-8000-000000000002',
    companyId: workspaceId,
    name: 'Priya Sharma',
    email: 'priya@vistaar.com',
    role: 'employee',
    employeeId: 'VST-00002',
    status: 'Active',
  };

  // Date ranges to test
  const todayRange = resolveDateRange('today');
  const yesterdayRange = resolveDateRange('yesterday');
  const thisWeekRange = resolveDateRange('week');
  const thisMonthRange = resolveDateRange('month');
  const customRange = resolveDateRange('custom', '2026-09-01', getIstTodayString());

  // ==========================================
  // SECTION 1: BUSINESS OWNER TESTS
  // ==========================================
  console.log('--- TEST SUITE A: BUSINESS OWNER ACCESS ---');
  (supabaseAuthService as any).currentProfile = ownerProfile;
  (supabaseAuthService as any).authoritativeWorkspaceId = workspaceId;

  assert(hasCurrentUserPermission('dashboard.view'), 'A.1', 'Owner has dashboard.view permission');
  assert(hasCurrentUserPermission('analytics.view'), 'A.2', 'Owner has analytics.view permission');
  assert(hasCurrentUserPermission('financial_statements.view'), 'A.3', 'Owner has financial_statements.view permission');

  // Test Dashboard KPIs across all required presets
  try {
    const todayKpis = await enterpriseAnalyticsService.getDashboardKpis(todayRange);
    assert(
      typeof todayKpis.totalSales === 'number' &&
      typeof todayKpis.collections === 'number' &&
      typeof todayKpis.grossProfit === 'number' &&
      typeof todayKpis.outstandingUdhari === 'number',
      'A.4',
      'Owner loads Today Dashboard KPIs successfully'
    );

    const yesterdayKpis = await enterpriseAnalyticsService.getDashboardKpis(yesterdayRange);
    assert(typeof yesterdayKpis.totalSales === 'number', 'A.5', 'Owner loads Yesterday Dashboard KPIs');

    const weekKpis = await enterpriseAnalyticsService.getDashboardKpis(thisWeekRange);
    assert(typeof weekKpis.totalSales === 'number', 'A.6', 'Owner loads This Week Dashboard KPIs');

    const monthKpis = await enterpriseAnalyticsService.getDashboardKpis(thisMonthRange);
    assert(typeof monthKpis.totalSales === 'number', 'A.7', 'Owner loads This Month Dashboard KPIs');

    const customKpis = await enterpriseAnalyticsService.getDashboardKpis(customRange);
    assert(typeof customKpis.totalSales === 'number', 'A.8', 'Owner loads Custom date range Dashboard KPIs');
  } catch (err: any) {
    assert(false, 'A.4-A.8', 'Owner Dashboard KPI loading failed', err.message);
  }

  // Owner Executive Analytics
  try {
    const analytics = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange);
    assert(analytics && analytics.kpis && analytics.salesTrend, 'A.9', 'Owner opens Analytics successfully');
  } catch (err: any) {
    assert(false, 'A.9', 'Owner Analytics access failed', err.message);
  }

  // Owner Financial Statements
  try {
    const financials = await financialStatementService.getComprehensiveFinancials(todayRange);
    assert(financials && financials.current, 'A.10', 'Owner opens Financial Statements successfully');
  } catch (err: any) {
    assert(false, 'A.10', 'Owner Financial Statements access failed', err.message);
  }

  // ==========================================
  // SECTION 2: EMPLOYEE TESTS
  // ==========================================
  console.log('\n--- TEST SUITE B: EMPLOYEE ACCESS & SECURITY BOUNDARY ---');
  (supabaseAuthService as any).currentProfile = employeeProfile;
  (supabaseAuthService as any).authoritativeWorkspaceId = workspaceId;

  assert(hasCurrentUserPermission('dashboard.view'), 'B.1', 'Employee has dashboard.view permission');
  assert(!hasCurrentUserPermission('analytics.view'), 'B.2', 'Employee strictly lacks analytics.view permission');
  assert(!hasCurrentUserPermission('financial_statements.view'), 'B.3', 'Employee strictly lacks financial_statements.view permission');

  // Test Employee loading Dashboard KPIs across all required presets
  let employeeKpisSuccess = true;
  let employeeErrorMsg = '';

  try {
    const empTodayKpis = await enterpriseAnalyticsService.getDashboardKpis(todayRange);
    assert(
      typeof empTodayKpis.totalSales === 'number' &&
      typeof empTodayKpis.invoiceSales === 'number' &&
      typeof empTodayKpis.counterSales === 'number' &&
      typeof empTodayKpis.collections === 'number' &&
      typeof empTodayKpis.cashCollections === 'number' &&
      typeof empTodayKpis.upiCollections === 'number' &&
      typeof empTodayKpis.grossProfit === 'number' &&
      typeof empTodayKpis.profitMarginPercent === 'number' &&
      typeof empTodayKpis.outstandingUdhari === 'number' &&
      typeof empTodayKpis.overdueUdhari === 'number',
      'B.4',
      'Employee loads Today Dashboard KPIs with all metrics'
    );

    const empYestKpis = await enterpriseAnalyticsService.getDashboardKpis(yesterdayRange);
    assert(typeof empYestKpis.totalSales === 'number', 'B.5', 'Employee loads Yesterday Dashboard KPIs');

    const empWeekKpis = await enterpriseAnalyticsService.getDashboardKpis(thisWeekRange);
    assert(typeof empWeekKpis.totalSales === 'number', 'B.6', 'Employee loads This Week Dashboard KPIs');

    const empMonthKpis = await enterpriseAnalyticsService.getDashboardKpis(thisMonthRange);
    assert(typeof empMonthKpis.totalSales === 'number', 'B.7', 'Employee loads This Month Dashboard KPIs');

    const empCustomKpis = await enterpriseAnalyticsService.getDashboardKpis(customRange);
    assert(typeof empCustomKpis.totalSales === 'number', 'B.8', 'Employee loads Custom range Dashboard KPIs');
  } catch (err: any) {
    employeeKpisSuccess = false;
    employeeErrorMsg = err?.message || String(err);
    assert(false, 'B.4-B.8', 'Employee Dashboard KPI loading threw unexpected error', employeeErrorMsg);
  }

  // Specifically confirm the Employee console no longer produces:
  // "Permission Denied: Analytics is strictly restricted to Business Owners."
  assert(
    employeeKpisSuccess && !employeeErrorMsg.includes('Analytics is strictly restricted'),
    'B.9',
    'Dashboard KPI loading succeeds WITHOUT Analytics permission error'
  );

  // Verify Analytics is strictly DENIED for Employee
  let analyticsDenied = false;
  try {
    await enterpriseAnalyticsService.getAnalyticsOverview(todayRange);
  } catch (err: any) {
    analyticsDenied = err instanceof AuthorizationError && err.permission === 'analytics.view';
  }
  assert(analyticsDenied, 'B.10', 'Employee calling getAnalyticsOverview is strictly DENIED with AuthorizationError');

  let executiveKpisDenied = false;
  try {
    await enterpriseAnalyticsService.getExecutiveKpis(todayRange);
  } catch (err: any) {
    executiveKpisDenied = err instanceof AuthorizationError && err.permission === 'analytics.view';
  }
  assert(executiveKpisDenied, 'B.11', 'Employee calling getExecutiveKpis is strictly DENIED with AuthorizationError');

  // Verify Financial Statements is strictly DENIED for Employee
  let financialsDenied = false;
  try {
    await financialStatementService.getComprehensiveFinancials(todayRange);
  } catch (err: any) {
    financialsDenied = err instanceof AuthorizationError && err.permission === 'financial_statements.view';
  }
  assert(financialsDenied, 'B.12', 'Employee calling Financial Statements is strictly DENIED with AuthorizationError');

  // ==========================================
  // SECTION 3: UNAUTHORIZED ROLE TEST
  // ==========================================
  console.log('\n--- TEST SUITE C: UNAUTHORIZED CONTEXT ---');
  (supabaseAuthService as any).currentProfile = {
    ...employeeProfile,
    role: 'unknown_role',
  };

  let unauthDashboardDenied = false;
  try {
    await enterpriseAnalyticsService.getDashboardKpis(todayRange);
  } catch (err: any) {
    unauthDashboardDenied = err instanceof AuthorizationError && err.permission === 'dashboard.view';
  }
  assert(unauthDashboardDenied, 'C.1', 'Role without dashboard.view is strictly DENIED getDashboardKpis');

  // Reset profile
  (supabaseAuthService as any).currentProfile = null;

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
