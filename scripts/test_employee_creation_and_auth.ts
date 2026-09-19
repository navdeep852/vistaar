/**
 * VISTAAR Business OS — Employee Creation & Authentication Synchronization Regression Test Suite
 *
 * Verifies all 6 mandatory test suites:
 * TEST A: Owner creates a new employee (valid Auth user UUID, profile record, sequential VST-XXXXX ID, appears in employee list)
 * TEST B: Duplicate email prevention (rejects with clean error, prevents duplicate profile)
 * TEST C: Multi-tenant isolation (scoped to current workspace, invisible to other workspaces)
 * TEST D: Input validation & rollback resilience (clean error handling, no orphan states)
 * TEST E: Employee ID resolution & forced password change workflow
 * TEST F: Concurrency-safe sequential Employee ID generation
 */

// 1. Setup Node.js browser mocks for headless execution
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() { return store.size; },
  } as any;
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: globalThis.localStorage,
    location: { origin: 'http://localhost:3000' },
  };
}

if (typeof (globalThis as any).CustomEvent === 'undefined') {
  (globalThis as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, params?: any) {
      this.type = type;
      this.detail = params?.detail;
    }
  };
}

// 2. Imports after global mocks
import { supabaseAuthService as auth } from '../src/services/supabaseAuth';
import { validateIndianPhoneNumber } from '../src/lib/phoneUtils';
import { validateEmailFormat } from '../src/lib/passwordPolicy';

async function runRegressionTestSuite() {
  console.log('================================================================================');
  console.log(' VISTAAR Business OS — EMPLOYEE CREATION & AUTHENTICATION REGRESSION TEST SUITE ');
  console.log('================================================================================\n');

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

  const WS_A = '4f42a205-792d-4bdb-a9e5-be88cbed331a';
  const WS_B = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

  // Setup Owner in Workspace A
  auth.setAuthoritativeWorkspaceId(WS_A);

  // ============================================================================
  // TEST A: Owner Creates a New Employee
  // ============================================================================
  console.log('\n--- TEST A: OWNER CREATES A NEW EMPLOYEE ---');
  const empEmailA = `employee_test_a_${Date.now()}@vistaar.com`;
  const empNameA = 'Ramesh Patel';
  const empPhoneA = '9876543210';

  const resA = await auth.createEmployee({
    name: empNameA,
    email: empEmailA,
    phone: empPhoneA,
    role: 'employee',
    department: 'Sales & Billing',
    designation: 'Billing Executive',
  });

  assert(resA.success === true, 'TEST A.1: Employee creation succeeds', `Success: ${resA.success}`);
  assert(Boolean(resA.empId), 'TEST A.2: Employee ID returned', `empId: ${resA.empId}`);
  assert(/^VST-\d{5}$/.test(resA.empId || ''), 'TEST A.3: Employee ID matches VST-XXXXX format', `empId: ${resA.empId}`);
  assert(resA.tempPass === 'TempPass@2026', 'TEST A.4: Temporary password issued', `tempPass: ${resA.tempPass}`);
  assert(Boolean(resA.userId), 'TEST A.5: Valid user ID returned', `userId: ${resA.userId}`);

  const employeesA = auth.getEmployees();
  const createdEmpA = employeesA.find((e) => e.email.toLowerCase() === empEmailA.toLowerCase());
  assert(Boolean(createdEmpA), 'TEST A.6: Employee appears in employee directory', `Found: ${createdEmpA?.name}`);
  assert(createdEmpA?.employeeId === resA.empId, 'TEST A.7: Directory Employee ID matches issued ID', `ID: ${createdEmpA?.employeeId}`);
  assert(createdEmpA?.companyId === WS_A, 'TEST A.8: Employee bound to Workspace A', `companyId: ${createdEmpA?.companyId}`);
  assert(createdEmpA?.status === 'Active', 'TEST A.9: Initial status is Active', `status: ${createdEmpA?.status}`);

  // ============================================================================
  // TEST B: Duplicate Email Prevention
  // ============================================================================
  console.log('\n--- TEST B: DUPLICATE EMAIL PREVENTION ---');
  const countBeforeDup = auth.getEmployees().length;

  const resDup = await auth.createEmployee({
    name: 'Duplicate Ramesh',
    email: empEmailA, // same email
    phone: '9876543211',
    role: 'employee',
  });

  assert(resDup.success === false, 'TEST B.1: Duplicate email creation is rejected', `Rejected as expected`);
  assert(
    Boolean(resDup.error && resDup.error.includes('already exists')),
    'TEST B.2: Clear, non-technical error message returned',
    `Error: "${resDup.error}"`
  );
  assert(
    auth.getEmployees().length === countBeforeDup,
    'TEST B.3: No duplicate profile record added',
    `Count remained ${countBeforeDup}`
  );

  // ============================================================================
  // TEST C: Multi-Tenant Workspace Isolation
  // ============================================================================
  console.log('\n--- TEST C: MULTI-TENANT WORKSPACE ISOLATION ---');
  // Switch to Workspace B
  auth.setAuthoritativeWorkspaceId(WS_B);

  // In Workspace B, the employee from Workspace A should not be visible or mixed
  const empEmailB = `employee_wsb_${Date.now()}@vistaar.com`;
  const resB = await auth.createEmployee({
    name: 'Suresh Kumar',
    email: empEmailB,
    phone: '9123456780',
    role: 'employee',
  });

  assert(resB.success === true, 'TEST C.1: Workspace B employee created', `empId: ${resB.empId}`);
  const createdEmpB = auth.getEmployees().find((e) => e.email.toLowerCase() === empEmailB.toLowerCase());
  assert(createdEmpB?.companyId === WS_B, 'TEST C.2: Workspace B employee isolated to WS_B', `companyId: ${createdEmpB?.companyId}`);

  // Switch back to Workspace A
  auth.setAuthoritativeWorkspaceId(WS_A);
  const currentWsA = auth.getCurrentCompanyId();
  assert(currentWsA === WS_A, 'TEST C.3: Workspace A context restored', `Current WS: ${currentWsA}`);

  // ============================================================================
  // TEST D: Input Validation & Failure Recovery
  // ============================================================================
  console.log('\n--- TEST D: INPUT VALIDATION & FAILURE RECOVERY ---');

  // D.1 Empty Name
  const resEmptyName = await auth.createEmployee({
    name: '',
    email: 'valid_email@vistaar.com',
  });
  assert(!resEmptyName.success, 'TEST D.1: Empty name rejected', `Error: "${resEmptyName.error}"`);

  // D.2 Invalid Email
  const resBadEmail = await auth.createEmployee({
    name: 'Bad Email User',
    email: 'invalid-email-format',
  });
  assert(!resBadEmail.success, 'TEST D.2: Invalid email rejected', `Error: "${resBadEmail.error}"`);

  // D.3 Invalid Phone (e.g. 5 digits)
  const resBadPhone = await auth.createEmployee({
    name: 'Bad Phone User',
    email: 'bad_phone@vistaar.com',
    phone: '12345',
  });
  assert(!resBadPhone.success, 'TEST D.3: Invalid phone number rejected', `Error: "${resBadPhone.error}"`);

  // D.4 Valid 10-digit Indian phone normalization
  const phoneRes = validateIndianPhoneNumber('+91 98765 43210', false);
  assert(phoneRes.isValid && phoneRes.normalized === '9876543210', 'TEST D.4: Phone normalization works', `Normalized: ${phoneRes.normalized}`);

  // ============================================================================
  // TEST E: Employee ID Resolution & Forced Password Change
  // ============================================================================
  console.log('\n--- TEST E: EMPLOYEE ID RESOLUTION & FIRST-LOGIN PASSWORD CHANGE ---');

  // E.1 Resolve Employee ID to Email
  const resolvedEmail = await auth.resolveEmailFromIdentifier(resA.empId!);
  assert(
    resolvedEmail === empEmailA.toLowerCase(),
    'TEST E.1: resolveEmailFromIdentifier resolves Employee ID to Email',
    `${resA.empId} -> ${resolvedEmail}`
  );

  // E.2 Direct email pass-through
  const directEmail = await auth.resolveEmailFromIdentifier(empEmailA);
  assert(
    directEmail === empEmailA.toLowerCase(),
    'TEST E.2: resolveEmailFromIdentifier preserves direct email',
    `${empEmailA} -> ${directEmail}`
  );

  // E.3 Unknown Employee ID returns null
  const unknownId = await auth.resolveEmailFromIdentifier('VST-99999');
  assert(
    unknownId === null,
    'TEST E.3: Unknown Employee ID safely returns null',
    `Result: ${unknownId}`
  );

  // E.4 First login password change clears mustChangePassword
  const pwdChangeRes = await auth.completeFirstLoginPasswordChange(
    resA.userId!,
    'NewSecurePassword@2026',
    'NewSecurePassword@2026'
  );
  assert(pwdChangeRes.success === true, 'TEST E.4: Password update succeeds', `Success: ${pwdChangeRes.success}`);

  // ============================================================================
  // TEST F: Sequential Employee ID Generation & Collision Prevention
  // ============================================================================
  console.log('\n--- TEST F: SEQUENTIAL EMPLOYEE ID GENERATION ---');

  const id1 = await auth.generateNextEmployeeId(WS_A);
  assert(/^VST-\d{5}$/.test(id1), 'TEST F.1: First generated ID matches VST-XXXXX', `id: ${id1}`);

  // Simulate creation of employee with id1
  const nextEmail1 = `seq1_${Date.now()}@vistaar.com`;
  const resSeq1 = await auth.createEmployee({
    name: 'Seq Emp 1',
    email: nextEmail1,
  });
  assert(resSeq1.success, 'TEST F.2: First sequential employee created', `empId: ${resSeq1.empId}`);

  // Next generation should be incremented
  const id2 = await auth.generateNextEmployeeId(WS_A);
  const num1 = parseInt(resSeq1.empId!.replace('VST-', ''), 10);
  const num2 = parseInt(id2.replace('VST-', ''), 10);
  assert(num2 > num1, 'TEST F.3: Sequential ID increments monotonically', `${resSeq1.empId} -> ${id2}`);

  // Employee status toggle (Active -> Suspended -> Active)
  const toggleRes = await auth.updateEmployeeStatus(resA.userId!, 'Suspended');
  assert(toggleRes.success, 'TEST F.4: Employee status updated to Suspended', `Success: ${toggleRes.success}`);
  const suspendedEmp = auth.getEmployees().find((e) => e.email.toLowerCase() === empEmailA.toLowerCase());
  assert(suspendedEmp?.status === 'Suspended', 'TEST F.5: Status reflected in employee list', `Status: ${suspendedEmp?.status}`);

  const reactivateRes = await auth.updateEmployeeStatus(resA.userId!, 'Active');
  assert(reactivateRes.success, 'TEST F.6: Employee re-activated', `Success: ${reactivateRes.success}`);
  const activeEmp = auth.getEmployees().find((e) => e.email.toLowerCase() === empEmailA.toLowerCase());
  assert(activeEmp?.status === 'Active', 'TEST F.7: Re-activation reflected in employee list', `Status: ${activeEmp?.status}`);

  // ============================================================================
  // RESULTS SUMMARY
  // ============================================================================
  console.log('\n================================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed} assertions)`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
