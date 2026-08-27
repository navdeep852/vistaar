import { supabaseAuthService, normalizeAuthError } from '../src/services/supabaseAuth.js';

async function runAuthVerification() {
  console.log('=============================================================================');
  console.log('VISTAAR — AUTHENTICATION FIX VERIFICATION TEST SUITE');
  console.log('=============================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, detail) {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS ✅] ${testName}: ${detail}`);
    } else {
      console.error(`[FAIL ❌] ${testName}: ${detail}`);
    }
  }

  // Test 1: Error Normalization for 'Failed to fetch'
  const norm1 = normalizeAuthError(new Error('Failed to fetch'));
  assert(
    norm1.includes('Unable to reach Supabase Auth server'),
    'Error Normalization (Failed to fetch)',
    `Result: "${norm1}"`
  );

  // Test 2: Error Normalization for Invalid Credentials
  const norm2 = normalizeAuthError(new Error('Invalid login credentials'));
  assert(
    norm2 === 'Invalid email or password.',
    'Error Normalization (Invalid credentials)',
    `Result: "${norm2}"`
  );

  // Test 3: Sign In with Owner Demo Credentials
  const ownerRes = await supabaseAuthService.login('admin@vistaar.com', 'Vistaar@2026Secure');
  assert(
    ownerRes.success && ownerRes.userProfile?.email === 'admin@vistaar.com',
    'Sign In (Owner Demo)',
    `Success: ${ownerRes.success}, User: ${ownerRes.userProfile?.email}`
  );

  // Test 4: Session State after Sign In
  assert(
    supabaseAuthService.isAuthenticated() && supabaseAuthService.getUser()?.role === 'owner',
    'Session Persistence in Memory',
    `Authenticated: ${supabaseAuthService.isAuthenticated()}, Role: ${supabaseAuthService.getUser()?.role}`
  );

  // Test 5: Sign In with Employee ID
  const empRes = await supabaseAuthService.login('VST-00002', 'Staff@2026Secure');
  assert(
    empRes.success && empRes.userProfile?.employeeId === 'VST-00002',
    'Sign In (Employee ID VST-00002)',
    `Success: ${empRes.success}, Employee ID: ${empRes.userProfile?.employeeId}`
  );

  // Test 6: Sign In with Invalid Password
  const wrongPassRes = await supabaseAuthService.login('admin@vistaar.com', 'WrongPassword123!');
  assert(
    !wrongPassRes.success && wrongPassRes.error && !wrongPassRes.error.includes('Failed to fetch'),
    'Sign In (Invalid Password Rejection)',
    `Error surfaced: "${wrongPassRes.error}"`
  );

  // Test 7: Sign Up New Company Account
  const testEmail = `testowner_${Date.now()}@vistaar.com`;
  const signUpRes = await supabaseAuthService.signUpCompany({
    companyName: 'Test Enterprises Pvt Ltd',
    ownerName: 'Test Owner',
    email: testEmail,
    phone: '+91 98765 00000',
    password: 'TestPassword@2026',
    confirmPassword: 'TestPassword@2026',
  });
  assert(
    signUpRes.success && supabaseAuthService.getUser()?.email === testEmail,
    'Sign Up (New Company Workspace)',
    `Success: ${signUpRes.success}, Registered User: ${testEmail}`
  );

  // Test 8: Duplicate Registration Rejection
  const dupRes = await supabaseAuthService.signUpCompany({
    companyName: 'Duplicate Inc',
    ownerName: 'Test Owner',
    email: testEmail,
    phone: '+91 98765 00000',
    password: 'TestPassword@2026',
    confirmPassword: 'TestPassword@2026',
  });
  assert(
    !dupRes.success && dupRes.error?.includes('already exists'),
    'Sign Up (Duplicate Email Rejection)',
    `Error surfaced: "${dupRes.error}"`
  );

  // Test 9: Logout & Session Termination
  await supabaseAuthService.logout();
  assert(
    !supabaseAuthService.isAuthenticated() && supabaseAuthService.getUser() === null,
    'Logout & Session Termination',
    `Authenticated after logout: ${supabaseAuthService.isAuthenticated()}`
  );

  console.log(`\n=============================================================================`);
  console.log(`VERIFICATION SUMMARY: ${passed}/${total} TESTS PASSED.`);
  console.log(`=============================================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runAuthVerification();
