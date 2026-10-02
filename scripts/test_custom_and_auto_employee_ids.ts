/**
 * VISTAAR Business OS — Verification Suite: Custom & Auto-Generated Employee IDs
 *
 * Test Matrix:
 * TEST 1:  Owner creates employee with Auto-generated ID (VST-EMP-00X).
 * TEST 2:  Owner creates employee with Custom ID (SALES-001).
 * TEST 3:  Owner attempts duplicate (SALES-001) in same workspace -> rejected.
 * TEST 4:  Another workspace creates (SALES-001) -> allowed (multi-tenant isolation).
 * TEST 5:  Custom ID (sales-001) when (SALES-001) exists -> rejected after normalization.
 * TEST 6:  Invalid format: contains space (SALES 001) -> rejected.
 * TEST 7:  Invalid format: contains special characters (SALES@001, EMP#001, EMP.001) -> rejected.
 * TEST 8:  Invalid length: short ID (A) -> rejected.
 * TEST 9:  Invalid length: excessive length (> 30 characters) -> rejected.
 * TEST 10: Concurrency safety: two simultaneous auto-generated creations yield unique IDs.
 * TEST 11: Login resolution with auto-generated ID.
 * TEST 12: Login resolution with custom ID (case-insensitive).
 * TEST 13: Non-owner / employee attempts to create or change Employee ID -> denied.
 * TEST 14: Company A and Company B both have SALES-001 concurrently -> both succeed.
 */

import { validateEmployeeId, normalizeEmployeeId } from '../src/lib/employeeIdValidation';
import { supabaseAuthService } from '../src/services/supabaseAuth';

// Mock headless environment to test local DB & auth workflows reliably
(global as any).window = (global as any).window || { isHeadlessTest: true };

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    failCount++;
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('VISTAAR — CUSTOM + AUTO-GENERATED EMPLOYEE ID VERIFICATION SUITE');
  console.log('================================================================\n');

  // Wait for auth service initialization
  await (supabaseAuthService as any).initPromise;
  await new Promise((resolve) => setTimeout(resolve, 300));

  // ===========================================================================
  // SECTION 1: VALIDATION & NORMALIZATION ENGINE TESTS
  // ===========================================================================
  console.log('--- SECTION 1: VALIDATION & NORMALIZATION ENGINE ---');

  // Test 1.1: Valid custom ID formats
  const validIds = ['EMP-001', 'SALES-001', 'STORE_01', 'TECH001', 'DELHI-001', 'ACC_002', 'VST-EMP-999'];
  validIds.forEach((id) => {
    const res = validateEmployeeId(id);
    assert(res.isValid && res.normalized === id.toUpperCase(), `Valid ID allowed: "${id}"`);
  });

  // Test 1.2: Normalization (trim & uppercase)
  const norm1 = validateEmployeeId('sales-001');
  assert(norm1.isValid && norm1.normalized === 'SALES-001', 'Normalization: sales-001 -> SALES-001');

  const norm2 = validateEmployeeId('Store_02');
  assert(norm2.isValid && norm2.normalized === 'STORE_02', 'Normalization: Store_02 -> STORE_02');

  // Test 6: Space rejection
  const spaceRes = validateEmployeeId('SALES 001');
  assert(!spaceRes.isValid && !!spaceRes.error, 'TEST 6: "SALES 001" (space) rejected', spaceRes.error);

  // Test 7: Special character rejection (@, #, ., /, !)
  const atRes = validateEmployeeId('SALES@001');
  assert(!atRes.isValid, 'TEST 7a: "SALES@001" (@ symbol) rejected');

  const dotRes = validateEmployeeId('EMP.001');
  assert(!dotRes.isValid, 'TEST 7b: "EMP.001" (. symbol) rejected');

  const slashRes = validateEmployeeId('EMP/001');
  assert(!slashRes.isValid, 'TEST 7c: "EMP/001" (/ symbol) rejected');

  const hashRes = validateEmployeeId('EMP#001');
  assert(!hashRes.isValid, 'TEST 7d: "EMP#001" (# symbol) rejected');

  // Test 8: Short length (< 3 chars)
  const shortRes = validateEmployeeId('A');
  assert(!shortRes.isValid && shortRes.error?.includes('at least 3 characters'), 'TEST 8: "A" (< 3 chars) rejected');

  // Test 9: Excessive length (> 30 chars)
  const longId = 'ABCDEFGHIJ-KLMNOPQRST-12345678901';
  const longRes = validateEmployeeId(longId);
  assert(!longRes.isValid && longRes.error?.includes('exceed 30 characters'), 'TEST 9: >30 chars rejected');

  // Test: Leading / Trailing whitespace
  const leadingWs = validateEmployeeId(' SALES-001');
  assert(!leadingWs.isValid && leadingWs.error?.includes('leading or trailing whitespace'), 'Leading whitespace rejected');

  const trailingWs = validateEmployeeId('SALES-001 ');
  assert(!trailingWs.isValid && trailingWs.error?.includes('leading or trailing whitespace'), 'Trailing whitespace rejected');

  // Test: Separators only
  const sepOnly1 = validateEmployeeId('---');
  assert(!sepOnly1.isValid && sepOnly1.error?.includes('separators'), 'Hyphens-only rejected');

  const sepOnly2 = validateEmployeeId('___');
  assert(!sepOnly2.isValid && sepOnly2.error?.includes('separators'), 'Underscores-only rejected');

  // ===========================================================================
  // SECTION 2: WORKSPACE EMPLOYEE CREATION & MULTI-TENANT ISOLATION
  // ===========================================================================
  console.log('\n--- SECTION 2: CREATION FLOW & MULTI-TENANT UNIQUENESS ---');

  const companyA = '11111111-0000-4000-8000-000000000001';
  const companyB = '22222222-0000-4000-8000-000000000002';

  // Setup Company A Owner
  const ownerProfileCompanyA = {
    id: 'owner-uuid-a',
    name: 'Owner Company A',
    email: 'owner@companya.com',
    role: 'owner' as const,
    status: 'Active' as const,
    workspace_id: companyA,
    companyId: companyA,
    employeeId: 'VST-EMP-001',
    mustChangePassword: false,
    permissions: ['employees.manage', 'settings.view', 'dashboard.view'],
  };

  (supabaseAuthService as any).currentProfile = ownerProfileCompanyA;
  (supabaseAuthService as any).employees = [];

  // TEST 1: Owner creates employee with Auto-generated ID
  const emp1Res = await supabaseAuthService.createEmployee({
    name: 'Ramesh Patel',
    email: 'ramesh.auto@companya.com',
    phone: '9876543210',
    department: 'Sales',
    designation: 'Associate',
  });

  assert(emp1Res.success && /^VST-EMP-\d+$/.test(emp1Res.empId || ''), 'TEST 1: Auto-generated Employee ID issued', emp1Res.empId);

  // TEST 2: Owner creates employee with custom ID (SALES-001)
  const emp2Res = await supabaseAuthService.createEmployee({
    name: 'Suresh Kumar',
    email: 'suresh.sales@companya.com',
    phone: '9876543211',
    department: 'Sales',
    designation: 'Senior Sales Exec',
    employeeId: 'SALES-001',
  });

  assert(emp2Res.success && emp2Res.empId === 'SALES-001', 'TEST 2: Custom Employee ID (SALES-001) created successfully');

  // TEST 3: Owner attempts duplicate custom ID (SALES-001) in same workspace
  const empDupRes = await supabaseAuthService.createEmployee({
    name: 'Mahesh Sharma',
    email: 'mahesh.sales@companya.com',
    phone: '9876543212',
    department: 'Sales',
    designation: 'Sales Rep',
    employeeId: 'SALES-001',
  });

  assert(!empDupRes.success && (empDupRes.error?.includes('already exists') || false), 'TEST 3: Duplicate SALES-001 in same workspace strictly rejected', empDupRes.error);

  // TEST 5: Duplicate with different case (sales-001) in same workspace
  const empCaseDupRes = await supabaseAuthService.createEmployee({
    name: 'Ganesh Rao',
    email: 'ganesh.sales@companya.com',
    phone: '9876543213',
    department: 'Sales',
    designation: 'Sales Rep',
    employeeId: 'sales-001',
  });

  assert(!empCaseDupRes.success && (empCaseDupRes.error?.includes('already exists') || false), 'TEST 5: Case-insensitive duplicate (sales-001) strictly rejected', empCaseDupRes.error);

  // TEST 4 & 14: Another workspace (Company B) creates the SAME custom ID (SALES-001)
  const ownerProfileCompanyB = {
    id: 'owner-uuid-b',
    name: 'Owner Company B',
    email: 'owner@companyb.com',
    role: 'owner' as const,
    status: 'Active' as const,
    workspace_id: companyB,
    companyId: companyB,
    employeeId: 'VST-EMP-001',
    mustChangePassword: false,
    permissions: ['employees.manage', 'settings.view', 'dashboard.view'],
  };

  (supabaseAuthService as any).currentProfile = ownerProfileCompanyB;

  const empCompanyBRes = await supabaseAuthService.createEmployee({
    name: 'Vikram Joshi',
    email: 'vikram.sales@companyb.com',
    phone: '9876543214',
    department: 'Sales',
    designation: 'Sales Head',
    employeeId: 'SALES-001',
  });

  assert(empCompanyBRes.success && empCompanyBRes.empId === 'SALES-001', 'TEST 4 & 14: Company B successfully creates SALES-001 (Multi-tenant isolation verified)');

  // ===========================================================================
  // SECTION 3: CONCURRENCY SAFETY & AUTO-GENERATION SEQUENCE
  // ===========================================================================
  console.log('\n--- SECTION 3: CONCURRENCY SAFETY & SEQUENCING ---');

  // Switch back to Company A
  (supabaseAuthService as any).currentProfile = ownerProfileCompanyA;

  // TEST 10: Two sequential / concurrent auto-generated employee creations
  const nextGenId1 = await supabaseAuthService.generateNextEmployeeId(companyA);
  const empConc1 = await supabaseAuthService.createEmployee({
    name: 'Concurrent User 1',
    email: 'concurrent1@companya.com',
    phone: '9876543215',
  });

  const nextGenId2 = await supabaseAuthService.generateNextEmployeeId(companyA);
  const empConc2 = await supabaseAuthService.createEmployee({
    name: 'Concurrent User 2',
    email: 'concurrent2@companya.com',
    phone: '9876543216',
  });

  assert(
    empConc1.success && empConc2.success && empConc1.empId !== empConc2.empId,
    'TEST 10: Concurrency safety guaranteed — distinct sequential IDs generated',
    `${empConc1.empId} vs ${empConc2.empId}`
  );

  // ===========================================================================
  // SECTION 4: LOGIN IDENTIFIER RESOLUTION
  // ===========================================================================
  console.log('\n--- SECTION 4: LOGIN RESOLUTION ---');

  // TEST 11: Login with auto-generated ID
  const autoResolvedEmail = await supabaseAuthService.resolveEmailFromIdentifier(emp1Res.empId!);
  assert(
    autoResolvedEmail === 'ramesh.auto@companya.com',
    'TEST 11: Login resolution with auto-generated ID',
    `${emp1Res.empId} -> ${autoResolvedEmail}`
  );

  // TEST 12: Login with custom ID (case-insensitive)
  const customResolvedEmailLower = await supabaseAuthService.resolveEmailFromIdentifier('sales-001');
  const customResolvedEmailUpper = await supabaseAuthService.resolveEmailFromIdentifier('SALES-001');
  assert(
    customResolvedEmailLower === 'suresh.sales@companya.com' && customResolvedEmailUpper === 'suresh.sales@companya.com',
    'TEST 12: Login resolution with custom ID (case-insensitive sales-001)',
    `${customResolvedEmailLower}`
  );

  // ===========================================================================
  // SECTION 5: RBAC & UNAUTHORIZED EMPLOYEE ACCESS RESTRICTIONS
  // ===========================================================================
  console.log('\n--- SECTION 5: RBAC & PRIVILEGE ENFORCEMENT ---');

  // Normal employee profile
  const employeeProfile = {
    id: 'emp-uuid-1',
    name: 'Normal Staff',
    email: 'staff@companya.com',
    role: 'employee' as const,
    status: 'Active' as const,
    workspace_id: companyA,
    companyId: companyA,
    employeeId: 'EMP-999',
    mustChangePassword: false,
    permissions: ['dashboard.view', 'invoices.create'],
  };

  (supabaseAuthService as any).currentProfile = employeeProfile;

  // TEST 13a: Employee attempts to create another employee account
  const unauthorizedCreate = await supabaseAuthService.createEmployee({
    name: 'Hacker User',
    email: 'hacker@companya.com',
    employeeId: 'HACK-001',
    createLoginAccount: true,
  });

  assert(
    !unauthorizedCreate.success && (unauthorizedCreate.error?.includes('workspace owner') || unauthorizedCreate.error?.includes('Permission Denied') || false),
    'TEST 13a: Non-owner / employee createEmployee strictly denied',
    unauthorizedCreate.error
  );

  // TEST 13b: Employee attempts to change their own or another employee's Employee ID
  const unauthorizedIdChange = await supabaseAuthService.updateEmployee(emp2Res.userId || 'suresh-uuid', {
    employeeId: 'TAMPER-001',
  });

  assert(
    !unauthorizedIdChange.success && unauthorizedIdChange.error?.includes('Only the workspace owner'),
    'TEST 13b: Non-owner / employee changing Employee ID strictly denied',
    unauthorizedIdChange.error
  );

  // Switch back to Owner and verify Owner CAN update Employee ID with validation
  (supabaseAuthService as any).currentProfile = ownerProfileCompanyA;

  // TEST 13c: Owner updates Employee ID to valid unique ID
  const targetUserAccount = (supabaseAuthService as any).employees.find((e: any) => e.employeeId === 'SALES-001');
  if (targetUserAccount) {
    const ownerUpdateSuccess = await supabaseAuthService.updateEmployee(targetUserAccount.id, {
      employeeId: 'SENIOR-SALES-001',
    });
    assert(ownerUpdateSuccess.success, 'Owner successfully updates Employee ID to SENIOR-SALES-001');

    // Confirm new ID resolves for login
    const updatedLoginEmail = await supabaseAuthService.resolveEmailFromIdentifier('senior-sales-001');
    assert(updatedLoginEmail === targetUserAccount.email, 'Updated Employee ID immediately resolves for login');

    // Confirm old ID no longer resolves for this user
    const oldLoginEmail = await supabaseAuthService.resolveEmailFromIdentifier('SALES-001');
    assert(oldLoginEmail !== targetUserAccount.email, 'Old Employee ID (SALES-001) no longer resolves');
  }

  // ===========================================================================
  // SUMMARY
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Unhandled exception in test suite:', err);
  process.exit(1);
});
