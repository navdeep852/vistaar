/**
 * Regression Test Suite: Vistaar Authentication & Multi-Tenant Lifecycle
 * Verifies all 12 mandatory acceptance criteria.
 */

import { supabaseAuthService } from '../src/services/supabaseAuth';
import { safeGetTenantStorage, safeSaveTenantStorage } from '../src/services/supabase/safeStorage';
import { isSupabaseConfigured } from '../src/lib/supabase';

async function runAuthRegressionSuite() {
  console.log('====================================================');
  console.log('    VISTAAR AUTHENTICATION REGRESSION TEST SUITE   ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail = '') {
    if (condition) {
      console.log(`[PASS] ${testName} ${detail ? '(' + detail + ')' : ''}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - FAILURE ${detail ? ': ' + detail : ''}`);
      failed++;
    }
  }

  // TEST 12: Configuration check
  const configValid = isSupabaseConfigured();
  assert(configValid, 'TEST 12: Supabase Configuration Validation', 'isSupabaseConfigured() is true for environment credentials');

  // TEST 1 & 2: Registration -> Login -> Logout -> Login Again
  const testEmail = `new_owner_${Date.now()}@vistaar.com`;
  const testPassword = 'Password@2026Secure';
  const companyName = 'Apex Global Ltd';

  const regRes = await supabaseAuthService.signUpCompany(companyName, 'Owner Name', testEmail, '9876543210', testPassword);
  assert(regRes.success, 'TEST 1: Registration Step', `Registered new user ${testEmail}`);

  const user1 = supabaseAuthService.getUser();
  assert(user1 !== null && user1.email === testEmail, 'TEST 1: Registration Login Context', `Current profile set to ${user1?.email}`);

  // Logout
  await supabaseAuthService.logout();
  const userAfterLogout = supabaseAuthService.getUser();
  assert(userAfterLogout === null, 'TEST 1: Logout Step', 'User session cleared on logout');

  // Login again
  const loginRes = await supabaseAuthService.login(testEmail, testPassword);
  assert(loginRes.success, 'TEST 1 & 2: Returning User Login', `Login again succeeded for ${testEmail}`);

  // TEST 3: Session check
  const restoredUser = supabaseAuthService.getUser();
  assert(restoredUser !== null && restoredUser.email === testEmail, 'TEST 3: Session Restoration', 'Session profile loaded properly');

  // Logout again
  await supabaseAuthService.logout();

  // TEST 4: Wrong password
  const wrongPassRes = await supabaseAuthService.login(testEmail, 'WrongPassword123!');
  assert(!wrongPassRes.success && wrongPassRes.error === 'Invalid email or password.', 'TEST 4: Wrong Password Rejection', `Error: "${wrongPassRes.error}"`);

  // TEST 5: Unknown email
  const unknownEmailRes = await supabaseAuthService.login(`unknown_${Date.now()}@vistaar.com`, 'SomePassword!');
  assert(!unknownEmailRes.success && unknownEmailRes.error === 'Invalid email or password.', 'TEST 5: Unknown Email Rejection', `Error: "${unknownEmailRes.error}"`);

  // TEST 6: Duplicate Registration
  const dupRegRes = await supabaseAuthService.signUpCompany(companyName, 'Owner Name', testEmail, '9876543210', testPassword);
  assert(!dupRegRes.success && Boolean(dupRegRes.error?.includes('already exists')), 'TEST 6: Duplicate Registration Blocked', `Error: "${dupRegRes.error}"`);

  // TEST 7, 8, 9: Multi-User Switch (User A -> User B -> User A) & Tenant Isolation
  const userAEmail = `usera_${Date.now()}@vistaar.com`;
  const userBEmail = `userb_${Date.now()}@vistaar.com`;

  await supabaseAuthService.signUpCompany('Company A', 'User A', userAEmail, '9000000001', 'PassA@2026Secure');
  const userAProfile = supabaseAuthService.getUser();
  const companyAId = userAProfile?.companyId || '';

  // Add dummy tenant data for User A
  safeSaveTenantStorage('vistaar_local_udharis_db', [{ id: 'ud-a-1', amount: 500 }]);
  await supabaseAuthService.logout();

  // User B Registers
  await supabaseAuthService.signUpCompany('Company B', 'User B', userBEmail, '9000000002', 'PassB@2026Secure');
  const userBProfile = supabaseAuthService.getUser();
  const companyBId = userBProfile?.companyId || '';

  // Add dummy tenant data for User B
  safeSaveTenantStorage('vistaar_local_udharis_db', [{ id: 'ud-b-1', amount: 1000 }]);

  // Verify User B cannot see User A's data
  const userBData = safeGetTenantStorage('vistaar_local_udharis_db', []);
  assert(userBData.length === 1 && userBData[0].id === 'ud-b-1', 'TEST 9: User B Tenant Data Isolation', 'User B sees only User B data');

  await supabaseAuthService.logout();

  // Login back as User A
  await supabaseAuthService.login(userAEmail, 'PassA@2026Secure');
  const userAReloaded = supabaseAuthService.getUser();
  assert(userAReloaded?.companyId === companyAId, 'TEST 7: User A Multi-Session Switching', 'User A restored');

  const userAData = safeGetTenantStorage('vistaar_local_udharis_db', []);
  assert(userAData.length === 1 && userAData[0].id === 'ud-a-1', 'TEST 8: User A Tenant Data Isolation', 'User A sees only User A data');

  // TEST 10 & 11: Security Inspections
  assert(companyAId !== companyBId, 'TEST 10 & 11: Workspace ID Uniqueness', `WS A: ${companyAId} != WS B: ${companyBId}`);

  console.log('\n====================================================');
  console.log(`    RESULTS: ${passed} PASSED, ${failed} FAILED    `);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthRegressionSuite().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
