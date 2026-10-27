/**
 * VISTAAR Phase 5B — Regression Test Suite
 * Validates Authoritative Workspace Resolution, Safe Storage, Logout/Login Persistence,
 * Tenant Isolation, and Session Lifecycle.
 */

import { supabaseAuthService } from '../src/services/supabaseAuth';
import {
  safeGetTenantStorage,
  safeSaveTenantStorage,
  safeGetTenantItem,
  safeSaveTenantItem,
  buildTenantCacheKey,
  clearTenantStorage,
  getActiveCompanyId,
  registerActiveWorkspaceResolver,
} from '../src/services/supabase/safeStorage';
import { store, LOCAL_INVOICES_KEY, LOCAL_SALES_KEY } from '../src/services/store';
import { isValidUuid } from '../src/lib/supabaseError';

// Mock localStorage for headless Node environment
const mockLocalStorage: Record<string, string> = {};
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (k: string) => (k in mockLocalStorage ? mockLocalStorage[k] : null),
    setItem: (k: string, v: string) => {
      mockLocalStorage[k] = String(v);
    },
    removeItem: (k: string) => {
      delete mockLocalStorage[k];
    },
    clear: () => {
      Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]);
    },
    get length() {
      return Object.keys(mockLocalStorage).length;
    },
    key: (i: number) => Object.keys(mockLocalStorage)[i] || null,
  };
}

interface TestReport {
  scenario: number;
  title: string;
  passed: boolean;
  message: string;
}

const report: TestReport[] = [];

function assertTest(scenario: number, title: string, condition: boolean, message: string) {
  report.push({ scenario, title, passed: condition, message });
  const status = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} [Scenario ${scenario}] ${title}: ${message}`);
}

async function runPhase5bTestSuite() {
  console.log('========================================================================');
  console.log('  VISTAAR PHASE 5B: WORKSPACE RESOLUTION & PERSISTENCE TEST SUITE');
  console.log('========================================================================\n');

  const COMPANY_WORKSPACE_ID = '33333333-3333-4333-a333-333333333333';
  const OWNER_USER_ID = '11111111-1111-4111-a111-111111111111';
  const STAFF_USER_ID = '22222222-2222-4222-a222-222222222222';
  const OTHER_COMPANY_ID = '44444444-4444-4444-a444-444444444444';

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Owner login resolves the correct company workspace
  // ---------------------------------------------------------------------------
  console.log('--- SCENARIO 1: OWNER WORKSPACE RESOLUTION ---');
  supabaseAuthService.setAuthoritativeWorkspaceId(COMPANY_WORKSPACE_ID);
  const ownerWs = supabaseAuthService.getAuthoritativeWorkspaceIdSync();
  const ownerComp = supabaseAuthService.getCurrentCompanyId();
  assertTest(
    1,
    'Owner login resolves correct company workspace',
    ownerWs === COMPANY_WORKSPACE_ID && ownerComp === COMPANY_WORKSPACE_ID && isValidUuid(ownerWs),
    `Resolved authoritative workspace: ${ownerWs}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Staff login resolves the same company workspace as owner
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 2: STAFF WORKSPACE RESOLUTION ---');
  // Simulate staff profile associated with COMPANY_WORKSPACE_ID
  (supabaseAuthService as any).currentProfile = {
    id: STAFF_USER_ID,
    companyId: COMPANY_WORKSPACE_ID,
    employeeId: 'EMP-001',
    name: 'Priya Sharma',
    email: 'priya@vistaar.com',
    role: 'staff',
    businessName: 'VISTAAR Corp',
    status: 'Active',
  };
  (supabaseAuthService as any).authoritativeWorkspaceId = COMPANY_WORKSPACE_ID;
  const staffWs = supabaseAuthService.getCurrentCompanyId();
  assertTest(
    2,
    'Staff resolves same company workspace as owner',
    staffWs === COMPANY_WORKSPACE_ID && staffWs !== STAFF_USER_ID,
    `Staff user ${STAFF_USER_ID} resolves company workspace: ${staffWs}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Logout clears in-memory session without deleting persisted records
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 3: LOGOUT SESSION CLEARANCE & RECORD PERSISTENCE ---');
  // Pre-seed an invoice under COMPANY_WORKSPACE_ID
  const sampleInvoice = {
    id: 'inv-test-100',
    invoiceNumber: 'INV-100',
    customerName: 'Acme Supplies',
    grandTotal: 50000,
    paidAmount: 50000,
    status: 'Paid',
    date: '2026-10-27',
  };
  safeSaveTenantStorage(LOCAL_INVOICES_KEY, [sampleInvoice]);

  // Verify record was written to company-scoped tenant key
  const savedKey = buildTenantCacheKey(LOCAL_INVOICES_KEY);
  const rawSaved = localStorage.getItem(savedKey);
  const hadDataBeforeLogout = Boolean(rawSaved && rawSaved.includes('INV-100'));

  // Perform logout
  await supabaseAuthService.logout();

  // Verify in-memory session is cleared
  const unauthCompany = supabaseAuthService.getCurrentCompanyId();
  const unauthResolution = supabaseAuthService.getAuthResolutionState();
  const rawStillInStorage = localStorage.getItem(savedKey);
  const recordsPreserved = Boolean(rawStillInStorage && rawStillInStorage.includes('INV-100'));

  assertTest(
    3,
    'Logout clears session without deleting persisted records',
    unauthCompany === '' && unauthResolution === 'unauthenticated' && hadDataBeforeLogout && recordsPreserved,
    `Session state: ${unauthResolution}, records intact in storage key ${savedKey}: ${recordsPreserved}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Login after logout reloads records from the correct workspace
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 4: LOGIN AFTER LOGOUT RECORD RELOAD ---');
  // Re-authenticate back into COMPANY_WORKSPACE_ID
  (supabaseAuthService as any).currentProfile = {
    id: OWNER_USER_ID,
    companyId: COMPANY_WORKSPACE_ID,
    name: 'Owner Navdeep',
    email: 'admin@vistaar.com',
    role: 'owner',
    businessName: 'VISTAAR Corp',
    status: 'Active',
  };
  (supabaseAuthService as any).authoritativeWorkspaceId = COMPANY_WORKSPACE_ID;
  (supabaseAuthService as any).authResolutionState = 'ready';
  localStorage.setItem('vistaar_current_company_id', COMPANY_WORKSPACE_ID);

  // Trigger store reload
  store.reloadTenantState();
  const reloadedInvoices = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
  const invoiceFound = reloadedInvoices.some((inv) => inv.id === 'inv-test-100' || inv.invoiceNumber === 'INV-100');

  assertTest(
    4,
    'Login after logout reloads records from correct workspace',
    invoiceFound && reloadedInvoices.length > 0,
    `Reloaded ${reloadedInvoices.length} invoices. Found INV-100: ${invoiceFound}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Stale cached workspace cannot override newly resolved workspace
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 5: STALE CACHED WORKSPACE OVERRIDE PREVENTION ---');
  // Place stale workspace in localStorage
  localStorage.setItem('vistaar_current_company_id', OTHER_COMPANY_ID);
  localStorage.setItem('vistaar_workspace_id', OTHER_COMPANY_ID);

  // Set active in-memory authoritative workspace
  (supabaseAuthService as any).authoritativeWorkspaceId = COMPANY_WORKSPACE_ID;

  // safeStorage must prioritize active authoritative resolver over stale localStorage
  const activeCompanyId = getActiveCompanyId();
  assertTest(
    5,
    'Stale cached workspace cannot override authoritative workspace',
    activeCompanyId === COMPANY_WORKSPACE_ID && activeCompanyId !== OTHER_COMPANY_ID,
    `Active company resolved: ${activeCompanyId} (Stale localStorage was: ${OTHER_COMPANY_ID})`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Unresolved profile does not cause silent cross-tenant fallback
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 6: UNRESOLVED PROFILE / UNKNOWN IDENTITY HANDLING ---');
  await supabaseAuthService.logout();
  const unauthActiveId = getActiveCompanyId();
  const unauthStorageRead = safeGetTenantStorage('any_secret_key', [{ sentinel: 'fallback_safe' }]);

  assertTest(
    6,
    'Unresolved identity does not cause silent cross-tenant fallback',
    unauthActiveId === 'unauthenticated' && unauthStorageRead.length === 1 && unauthStorageRead[0].sentinel === 'fallback_safe',
    `Unauthenticated company ID: ${unauthActiveId}, fallback safely returned without cross-tenant leak`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Branch-specific storage keys remain isolated
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 7: BRANCH STORAGE KEY ISOLATION ---');
  (supabaseAuthService as any).authoritativeWorkspaceId = COMPANY_WORKSPACE_ID;
  const BRANCH_A = 'branch-main-001';
  const BRANCH_B = 'branch-sub-002';

  const keyBranchA = buildTenantCacheKey(LOCAL_SALES_KEY, BRANCH_A);
  const keyBranchB = buildTenantCacheKey(LOCAL_SALES_KEY, BRANCH_B);
  const keyAllBranches = buildTenantCacheKey(LOCAL_SALES_KEY, 'ALL');

  const keysAreDistinct =
    keyBranchA !== keyBranchB &&
    keyBranchA !== keyAllBranches &&
    keyBranchB !== keyAllBranches &&
    keyBranchA.includes(BRANCH_A) &&
    keyBranchB.includes(BRANCH_B);

  // Save sales into Branch A
  safeSaveTenantStorage(LOCAL_SALES_KEY, [{ id: 'sale-a1', branchId: BRANCH_A, total: 100 }], BRANCH_A);
  // Save sales into Branch B
  safeSaveTenantStorage(LOCAL_SALES_KEY, [{ id: 'sale-b1', branchId: BRANCH_B, total: 200 }], BRANCH_B);

  const readBranchA = safeGetTenantStorage<any>(LOCAL_SALES_KEY, [], BRANCH_A);
  const readBranchB = safeGetTenantStorage<any>(LOCAL_SALES_KEY, [], BRANCH_B);

  const branchDataIsolated =
    readBranchA.some((s) => s.id === 'sale-a1') &&
    !readBranchA.some((s) => s.id === 'sale-b1') &&
    readBranchB.some((s) => s.id === 'sale-b1') &&
    !readBranchB.some((s) => s.id === 'sale-a1');

  assertTest(
    7,
    'Branch-specific storage keys remain strictly isolated',
    keysAreDistinct && branchDataIsolated,
    `Branch A count: ${readBranchA.length}, Branch B count: ${readBranchB.length}. Cross-contamination: none`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Failed Supabase operation handling
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 8: DB VALIDATION & ERROR REJECTION ---');
  (supabaseAuthService as any).currentProfile = { id: OWNER_USER_ID, companyId: COMPANY_WORKSPACE_ID };
  let rejectedUserIdAsWs = false;
  try {
    supabaseAuthService.assertWorkspaceIdValid(OWNER_USER_ID, 'TEST_WRITE', 'invoices');
  } catch (err: any) {
    if (err?.message?.includes('WORKSPACE_ID_MISMATCH')) {
      rejectedUserIdAsWs = true;
    }
  }

  let rejectedEmptyWs = false;
  try {
    supabaseAuthService.assertWorkspaceIdValid('', 'TEST_WRITE', 'invoices');
  } catch (err: any) {
    if (err?.message?.includes('WORKSPACE_ID_MISMATCH')) {
      rejectedEmptyWs = true;
    }
  }

  assertTest(
    8,
    'Invalid or auth-user workspace IDs are rejected before DB mutation',
    rejectedUserIdAsWs && rejectedEmptyWs,
    `Rejected auth.uid as workspaceId: ${rejectedUserIdAsWs}, rejected empty workspaceId: ${rejectedEmptyWs}`
  );

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Authentication recovery & employee management API compatibility
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO 9: API COMPATIBILITY PRESERVATION ---');
  const requiredMethods = [
    'getAuthResolutionState',
    'getResolutionError',
    'getAuthoritativeWorkspaceId',
    'getAuthoritativeWorkspaceIdSync',
    'assertWorkspaceIdValid',
    'getCurrentCompanyId',
    'setAuthoritativeWorkspaceId',
    'setBusinessName',
    'isRecoverySession',
    'clearRecoverySession',
    'handleAuthRedirect',
    'initializeAuth',
    'loadEmployees',
    'getEmployees',
    'createEmployee',
    'updateEmployee',
    'deleteEmployee',
    'archiveEmployee',
    'unarchiveEmployee',
    'generateNextEmployeeId',
  ];

  const missingMethods: string[] = [];
  for (const method of requiredMethods) {
    if (typeof (supabaseAuthService as any)[method] !== 'function') {
      missingMethods.push(method);
    }
  }

  const storageHelpers = [
    typeof buildTenantCacheKey === 'function',
    typeof safeGetTenantStorage === 'function',
    typeof safeSaveTenantStorage === 'function',
    typeof safeGetTenantItem === 'function',
    typeof safeSaveTenantItem === 'function',
    typeof clearTenantStorage === 'function',
  ];

  assertTest(
    9,
    'Auth recovery & employee management API complete and preserved',
    missingMethods.length === 0 && storageHelpers.every(Boolean),
    missingMethods.length === 0 ? 'All 20 required methods and 6 storage helpers fully intact' : `Missing: ${missingMethods.join(', ')}`
  );

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  const allPassed = report.every((r) => r.passed);
  const passCount = report.filter((r) => r.passed).length;
  console.log(`  REGRESSION RESULTS: ${passCount}/${report.length} SCENARIOS PASSED`);
  console.log('========================================================================');

  if (allPassed) {
    console.log('✨ ALL 9 WORKSPACE RESOLUTION & PERSISTENCE SCENARIOS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME REGRESSION SCENARIOS FAILED!\n');
    process.exit(1);
  }
}

runPhase5bTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
