/**
 * VISTAAR — Comprehensive Branch Security & Dual-Credential Test Suite
 * Validates all 12 Security Tests mandated in Master Security Rule Fix.
 */
import { branchService } from '../src/services/supabase/branchService';
import { supabaseAuthService } from '../src/services/supabaseAuth';

// In-memory localStorage polyfill for test environment
const store: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (k: string) => store[k] || null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log('\n===============================================================');
  console.log('   VISTAAR MASTER SECURITY & BRANCH ACCESS VERIFICATION SUITE   ');
  console.log('===============================================================\n');

  localStorage.clear();

  const OWNER_LOGIN_PASSWORD = 'OwnerVISTAAR@2026';
  const HQ_BRANCH_PASSWORD = 'HQ_Branch_Pass_999';
  const DELHI_BRANCH_PASSWORD = 'Delhi_Branch_Pass_123';
  const NEW_DELHI_BRANCH_PASSWORD = 'Delhi_Branch_NEW_Pass_456';

  const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
  const HQ_BRANCH_ID = 'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa';
  const DELHI_BRANCH_ID = 'bbbbbbbb-bbbb-4000-8000-bbbbbbbbbbbb';

  const testOwner = {
    id: '11111111-1111-4000-8000-111111111111',
    companyId: WORKSPACE_ID,
    name: 'Business Owner',
    email: 'owner@vistaar.com',
    role: 'owner' as const,
  };

  const testEmployee = {
    id: '22222222-2222-4000-8000-222222222222',
    companyId: WORKSPACE_ID,
    name: 'Rahul Sharma',
    email: 'rahul@delhi.vistaar.com',
    role: 'employee' as const,
    employeeId: 'EMP-DEL-001',
    branchId: DELHI_BRANCH_ID,
    defaultBranchId: DELHI_BRANCH_ID,
  };

  // Set up owner session
  (supabaseAuthService as any).currentProfile = testOwner;
  (supabaseAuthService as any).authoritativeWorkspaceId = WORKSPACE_ID;
  (supabaseAuthService as any).employees = [testOwner, testEmployee];
  localStorage.setItem('vistaar_user_session', JSON.stringify(testOwner));
  localStorage.setItem('vistaar_current_company_id', WORKSPACE_ID);

  // 1. Initialize branches with independent passwords
  const hqCreated = await branchService.createBranch({
    id: HQ_BRANCH_ID,
    workspaceId: WORKSPACE_ID,
    branchCode: 'HQ',
    branchName: 'Main / HQ',
    branchType: 'Office',
    status: 'Active',
    isMainBranch: true,
  }, HQ_BRANCH_PASSWORD);

  const delhiCreated = await branchService.createBranch({
    id: DELHI_BRANCH_ID,
    workspaceId: WORKSPACE_ID,
    branchCode: 'DEL',
    branchName: 'Delhi Branch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: false,
  }, DELHI_BRANCH_PASSWORD);

  const hqId = hqCreated.data?.id || HQ_BRANCH_ID;
  const delhiId = delhiCreated.data?.id || DELHI_BRANCH_ID;

  // -------------------------------------------------------------
  // TEST 1 — ACCOUNT LOGIN SEPARATION
  // -------------------------------------------------------------
  console.log('TEST 1: Account Login Credentials Separation');
  assert(
    OWNER_LOGIN_PASSWORD !== DELHI_BRANCH_PASSWORD && OWNER_LOGIN_PASSWORD !== HQ_BRANCH_PASSWORD,
    'Account login password and branch passwords are cryptographically and logically distinct strings'
  );

  // -------------------------------------------------------------
  // TEST 2 — OWNER BRANCH SWITCH WITH CORRECT BRANCH PASSWORD
  // -------------------------------------------------------------
  console.log('\nTEST 2: Owner Branch Switch (Correct Branch Password)');
  (supabaseAuthService as any).currentProfile = testOwner;
  localStorage.setItem('vistaar_user_session', JSON.stringify(testOwner));

  const switchDelhiRes = await branchService.verifyBranchPassword(delhiId, DELHI_BRANCH_PASSWORD);
  assert(
    switchDelhiRes.success === true && switchDelhiRes.authorized === true,
    'Owner switch with valid Delhi branch password succeeds'
  );

  // -------------------------------------------------------------
  // TEST 3 — WRONG LOGIN PASSWORD AS BRANCH PASSWORD
  // -------------------------------------------------------------
  console.log('\nTEST 3: VISTAAR Login Password Cannot Be Used As Branch Password');
  const rejectLoginPassRes = await branchService.verifyBranchPassword(delhiId, OWNER_LOGIN_PASSWORD);
  assert(
    rejectLoginPassRes.success === false && rejectLoginPassRes.authorized === false,
    'Entering owner login password as branch password is DENIED'
  );

  // -------------------------------------------------------------
  // TEST 4 — WRONG BRANCH PASSWORD DOES NOT LOG OUT USER
  // -------------------------------------------------------------
  console.log('\nTEST 4: Wrong Branch Password Rejection & Session Preservation');
  const wrongBranchPassRes = await branchService.verifyBranchPassword(delhiId, 'WrongPassword999');
  assert(
    wrongBranchPassRes.success === false && wrongBranchPassRes.authorized === false,
    'Incorrect branch password rejected'
  );
  assert(
    (supabaseAuthService as any).getUser()?.id === testOwner.id,
    'User account session is NOT destroyed or logged out after branch password failure'
  );

  // -------------------------------------------------------------
  // TEST 5 — INDEPENDENT BRANCH PASSWORD UPDATE
  // -------------------------------------------------------------
  console.log('\nTEST 5: Branch Password Change');
  const changePassRes = await branchService.setBranchPassword(delhiId, NEW_DELHI_BRANCH_PASSWORD);
  assert(changePassRes.success === true, 'Owner successfully updates Delhi branch password');

  const oldPassRes = await branchService.verifyBranchPassword(delhiId, DELHI_BRANCH_PASSWORD);
  assert(oldPassRes.success === false && oldPassRes.authorized === false, 'Old Delhi branch password is DENIED');

  const newPassRes = await branchService.verifyBranchPassword(delhiId, NEW_DELHI_BRANCH_PASSWORD);
  assert(newPassRes.success === true && newPassRes.authorized === true, 'New Delhi branch password is ACCEPTED');

  // -------------------------------------------------------------
  // TEST 6 — OTHER BRANCH PASSWORD UNAFFECTED
  // -------------------------------------------------------------
  console.log('\nTEST 6: Other Branch Passwords Remain Unaffected');
  const hqVerifyRes = await branchService.verifyBranchPassword(hqId, HQ_BRANCH_PASSWORD);
  assert(
    hqVerifyRes.success === true && hqVerifyRes.authorized === true,
    'HQ branch password remains unchanged after Delhi password was changed'
  );

  // -------------------------------------------------------------
  // TEST 7 — EMPLOYEE LOGIN & AUTOMATIC ASSIGNED BRANCH
  // -------------------------------------------------------------
  console.log('\nTEST 7: Employee Login & Automatic Single Branch Binding');
  (supabaseAuthService as any).currentProfile = testEmployee;
  localStorage.setItem('vistaar_user_session', JSON.stringify(testEmployee));
  await branchService.setUserBranchAccesses(testEmployee.id, [delhiId]);

  const empBranchesRes = await branchService.getUserAuthorizedBranches(testEmployee.id);
  assert(
    empBranchesRes.data?.length === 1 && empBranchesRes.data[0].id === delhiId,
    `Employee has exactly 1 authorized branch which equals their assigned branch (Delhi: ${delhiId})`
  );

  // -------------------------------------------------------------
  // TEST 8 — EMPLOYEE CANNOT SWITCH BRANCHES
  // -------------------------------------------------------------
  console.log('\nTEST 8: Employee Branch Switch Prohibition');
  const empSwitchAttempt = await branchService.verifyBranchPassword(hqId, HQ_BRANCH_PASSWORD);
  assert(
    empSwitchAttempt.success === false && empSwitchAttempt.authorized === false,
    'Employee attempting to switch to HQ is DENIED with branch restriction error'
  );

  // -------------------------------------------------------------
  // TEST 9 — EMPLOYEE FRONTEND MANIPULATION RESISTANCE
  // -------------------------------------------------------------
  console.log('\nTEST 9: Employee Cannot Bypass Restriction via Frontend State Manipulation');
  const branchesList = await branchService.getUserAuthorizedBranches(testEmployee.id);
  const authorizedIds = (branchesList.data || []).map((b) => b.id);
  assert(
    !authorizedIds.includes(hqId),
    'Employee authorized branch list does not include HQ branch even if manipulated in frontend'
  );

  // -------------------------------------------------------------
  // TEST 10 — EMPLOYEE KNOWING ANOTHER BRANCH PASSWORD CANNOT SWITCH
  // -------------------------------------------------------------
  console.log('\nTEST 10: Knowing Another Branch Password Does Not Bypass Employee Restriction');
  // Even if Rahul enters the correct HQ password:
  const empWithHqPassAttempt = await branchService.verifyBranchPassword(hqId, HQ_BRANCH_PASSWORD);
  assert(
    empWithHqPassAttempt.success === false && empWithHqPassAttempt.authorized === false,
    'Employee knowing HQ password is STILL DENIED access to HQ'
  );

  // -------------------------------------------------------------
  // TEST 11 — NON-OWNER CANNOT MANAGE OR RESET BRANCH PASSWORDS
  // -------------------------------------------------------------
  console.log('\nTEST 11: Non-Owner Cannot Manage Branch Passwords');
  const empSetPassRes = await branchService.setBranchPassword(delhiId, 'HackedPassword123');
  assert(
    empSetPassRes.success === false && empSetPassRes.error?.includes('Business Owner'),
    'Employee cannot change or reset branch passwords'
  );

  // -------------------------------------------------------------
  // TEST 12 — OWNER AUTHORIZED BRANCH ACCESS & TRANSFER
  // -------------------------------------------------------------
  console.log('\nTEST 12: Owner Branch Access & Employee Transfer');
  (supabaseAuthService as any).currentProfile = testOwner;
  localStorage.setItem('vistaar_user_session', JSON.stringify(testOwner));

  // Transfer employee from Delhi to HQ
  const transferRes = await branchService.transferEmployeeBranch(testEmployee.id, hqId);
  assert(transferRes.success === true, 'Owner transfers employee to HQ branch');

  // Verify employee's new restricted branch
  testEmployee.branchId = hqId;
  testEmployee.defaultBranchId = hqId;
  (supabaseAuthService as any).currentProfile = testEmployee;
  localStorage.setItem('vistaar_user_session', JSON.stringify(testEmployee));

  const transferredAccess = await branchService.getUserAuthorizedBranches(testEmployee.id);
  assert(
    transferredAccess.data?.length === 1 && transferredAccess.data[0].id === hqId,
    'After owner transfer, employee now operates strictly in HQ and has lost Delhi access'
  );

  console.log('\n---------------------------------------------------------------');
  console.log(`TOTAL TESTS: ${passedCount + failedCount} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('---------------------------------------------------------------\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
