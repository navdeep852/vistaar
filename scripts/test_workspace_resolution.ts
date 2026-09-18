/**
 * Comprehensive Test Suite for Authoritative Workspace Resolution & Dashboard KPI Pipeline
 * Validates root cause resolution, multi-tenant isolation, error states, deduplication, and date filters.
 */

import { supabaseAuthService } from '../src/services/supabaseAuth';
import { productService, salesAnalyticsService, udhariService, quotationService } from '../src/services/supabase';
import { resolveDateRange } from '../src/lib/dateRange';
import { isValidUuid } from '../src/lib/supabaseError';

async function runWorkspaceResolutionTests() {
  console.log('========================================================================');
  console.log('  VISTAAR — AUTHORITATIVE WORKSPACE RESOLUTION & KPI REGRESSION SUITE');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    }
  }

  // TEST 1: Initial State & Logged-out User
  console.log('--- TEST 1: LOGGED-OUT USER & INITIAL STATE ---');
  await supabaseAuthService.logout();
  assert(
    supabaseAuthService.getAuthResolutionState() === 'unauthenticated',
    'State is unauthenticated after logout',
    `Got: ${supabaseAuthService.getAuthResolutionState()}`
  );
  assert(
    !supabaseAuthService.isAuthenticated(),
    'isAuthenticated() returns false when logged out'
  );
  assert(
    supabaseAuthService.getCurrentCompanyId() === '',
    'getCurrentCompanyId() returns empty string when logged out'
  );

  let unauthErrorCaught = false;
  try {
    await supabaseAuthService.getAuthoritativeWorkspaceId(true);
  } catch (e: any) {
    unauthErrorCaught = true;
    assert(
      e?.message?.includes('AUTH_NOT_AUTHENTICATED') || e?.message?.includes('WORKSPACE RESOLUTION FAILED'),
      'Unauthenticated resolution throws controlled error',
      `Error: ${e?.message}`
    );
  }
  assert(unauthErrorCaught, 'Calling getAuthoritativeWorkspaceId() while logged out throws');

  // TEST 2: In-memory Fallback Validation with Corrupted Workspace ID
  console.log('\n--- TEST 2: CORRUPTED WORKSPACE ID (MATCHING USER_ID) DETECTION ---');
  const corruptProfile = {
    id: 'a0000000-0000-0000-0000-000000000001',
    companyId: 'a0000000-0000-0000-0000-000000000001', // Corrupted matching userId
    name: 'Corrupt User',
    email: 'corrupt@vistaar.com',
    role: 'owner' as any,
  };
  (supabaseAuthService as any).currentProfile = corruptProfile;
  const cleanedCid = supabaseAuthService.getCurrentCompanyId();
  assert(
    cleanedCid === '',
    'getCurrentCompanyId() rejects workspace ID matching userId',
    `Expected empty string, got: ${cleanedCid}`
  );

  // Clean up
  (supabaseAuthService as any).currentProfile = null;

  // TEST 3: Authenticated Business Owner Session Resolution
  console.log('\n--- TEST 3: AUTHENTICATED OWNER WORKSPACE RESOLUTION ---');
  const validOwnerWsId = '11111111-2222-4333-8444-555555555555';
  const ownerUserId = '99999999-8888-4777-8666-555555555555';
  (supabaseAuthService as any).authoritativeWorkspaceId = validOwnerWsId;
  (supabaseAuthService as any).authResolutionState = 'ready';
  (supabaseAuthService as any).currentProfile = {
    id: ownerUserId,
    companyId: validOwnerWsId,
    name: 'Owner Admin',
    email: 'admin@vistaar.com',
    role: 'owner',
    businessName: 'VISTAAR Industrial Bearing Co.',
  };

  assert(
    supabaseAuthService.isAuthenticated(),
    'Owner profile recognized as authenticated'
  );
  assert(
    supabaseAuthService.getCurrentCompanyId() === validOwnerWsId,
    'Authoritative workspace ID matches expected owner workspace UUID'
  );
  assert(
    isValidUuid(supabaseAuthService.getCurrentCompanyId()),
    'Authoritative workspace ID is valid UUID'
  );

  // TEST 4: Deduplication of Concurrent In-Flight Calls
  console.log('\n--- TEST 4: IN-FLIGHT RESOLUTION DEDUPLICATION ---');
  let simulatedQueries = 0;
  const originalInternalResolver = (supabaseAuthService as any).resolveAuthoritativeWorkspaceInternal;
  (supabaseAuthService as any).resolveAuthoritativeWorkspaceInternal = async function () {
    simulatedQueries++;
    await new Promise((r) => setTimeout(r, 50));
    return validOwnerWsId;
  };

  const [p1, p2, p3, p4] = await Promise.all([
    supabaseAuthService.getAuthoritativeWorkspaceId(true),
    supabaseAuthService.getAuthoritativeWorkspaceId(true),
    supabaseAuthService.getAuthoritativeWorkspaceId(true),
    supabaseAuthService.getAuthoritativeWorkspaceId(true),
  ]);

  assert(
    p1 === validOwnerWsId && p2 === validOwnerWsId && p3 === validOwnerWsId && p4 === validOwnerWsId,
    'All 4 parallel promises resolve to authoritative workspace ID'
  );
  assert(
    simulatedQueries === 1,
    '4 concurrent requests deduplicated into exactly 1 database lookup',
    `Expected 1 query, got ${simulatedQueries}`
  );

  // Restore internal resolver
  (supabaseAuthService as any).resolveAuthoritativeWorkspaceInternal = originalInternalResolver;

  // TEST 5: Authenticated Staff User Isolation
  console.log('\n--- TEST 5: AUTHENTICATED STAFF USER WORKSPACE ISOLATION ---');
  const staffUserId = '88888888-7777-4666-8555-444444444444';
  const staffWsId = '22222222-3333-4444-8555-666666666666';
  (supabaseAuthService as any).authoritativeWorkspaceId = staffWsId;
  (supabaseAuthService as any).authResolutionState = 'ready';
  (supabaseAuthService as any).currentProfile = {
    id: staffUserId,
    companyId: staffWsId,
    name: 'Staff Member',
    email: 'staff@otherbusiness.com',
    role: 'employee',
    businessName: 'Other Business Ltd.',
  };

  assert(
    supabaseAuthService.getCurrentCompanyId() === staffWsId,
    'Staff workspace ID resolved cleanly'
  );
  assert(
    supabaseAuthService.getCurrentCompanyId() !== validOwnerWsId,
    'Staff workspace ID isolated from Owner workspace'
  );

  // TEST 6: Missing Profile / User with Invalid Membership
  console.log('\n--- TEST 6: USER WITH MISSING PROFILE / INVALID MEMBERSHIP ---');
  (supabaseAuthService as any).authoritativeWorkspaceId = null;
  (supabaseAuthService as any).authResolutionState = 'error';
  (supabaseAuthService as any).resolutionError = '[AUTH_PROFILE_NOT_FOUND] User profile not found.';
  (supabaseAuthService as any).currentProfile = null;

  assert(
    !supabaseAuthService.isAuthenticated(),
    'User with missing profile not authenticated'
  );
  assert(
    supabaseAuthService.getAuthResolutionState() === 'error',
    'State indicates error when profile is missing'
  );
  assert(
    supabaseAuthService.getResolutionError()?.includes('AUTH_PROFILE_NOT_FOUND') === true,
    'Correct diagnostic error captured for missing profile'
  );

  // TEST 7: Dashboard KPI Loading Flow Simulation Across All Date Presets
  console.log('\n--- TEST 7: DASHBOARD KPI LOADING PIPELINE ACROSS DATE PRESETS ---');
  // Re-establish valid owner tenant context
  (supabaseAuthService as any).authoritativeWorkspaceId = validOwnerWsId;
  (supabaseAuthService as any).authResolutionState = 'ready';
  (supabaseAuthService as any).currentProfile = {
    id: ownerUserId,
    companyId: validOwnerWsId,
    name: 'Owner Admin',
    email: 'admin@vistaar.com',
    role: 'owner',
  };

  const presets = ['today', 'yesterday', 'this_week', 'this_month'] as const;
  for (const preset of presets) {
    const range = resolveDateRange(preset);
    const resolvedWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();

    const [salesRes, udhariRes, quotRes, lowStockRes] = await Promise.all([
      salesAnalyticsService.getSalesMetrics(range, true, resolvedWsId),
      udhariService.getAuthoritativeUdhariMetricsAsOf(range.endDateStr, resolvedWsId),
      quotationService.getOpenQuotationsCountAsOf(range.endDateStr, resolvedWsId),
      productService.getLowStockProductsAsOf(range.endDateStr, resolvedWsId),
    ]);

    assert(
      typeof salesRes.totalSales === 'number' &&
      typeof udhariRes.outstanding === 'number' &&
      typeof quotRes.count === 'number' &&
      typeof lowStockRes.lowStockCount === 'number',
      `Dashboard KPI pipeline resolved cleanly for preset: ${preset}`
    );
  }

  // TEST 8: Rejection on Undefined/Empty Workspace Query
  console.log('\n--- TEST 8: SERVICES REJECT EMPTY / MALFORMED WORKSPACE IDS ---');
  (supabaseAuthService as any).authoritativeWorkspaceId = null;
  (supabaseAuthService as any).currentProfile = null;
  (supabaseAuthService as any).authResolutionState = 'unauthenticated';

  let caughtEmptyWsError = false;
  try {
    await productService.getOrFetchWorkspaceId();
  } catch (e: any) {
    caughtEmptyWsError = true;
    assert(
      e?.message?.includes('WORKSPACE RESOLUTION FAILED') || e?.message?.includes('AUTH_NOT_AUTHENTICATED'),
      'productService rejects empty workspace ID with controlled error',
      `Error: ${e?.message}`
    );
  }
  assert(caughtEmptyWsError, 'productService.getOrFetchWorkspaceId() threw expected error when unauthenticated');

  console.log('\n========================================================================');
  console.log(`  REGRESSION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================');

  if (passedTests === totalTests) {
    console.log('✨ ALL WORKSPACE RESOLUTION & KPI TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED.\n');
    process.exit(1);
  }
}

runWorkspaceResolutionTests().catch((err) => {
  console.error('Fatal regression suite exception:', err);
  process.exit(1);
});
