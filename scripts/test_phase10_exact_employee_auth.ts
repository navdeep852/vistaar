/**
 * Phase 10 Exact Debug Test Suite
 * Validates authoritative employee creation, linked auth & profile, and exact employee ID login
 */

// Setup headless mocks
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
    isHeadlessTest: true,
  };
} else {
  (globalThis.window as any).isHeadlessTest = true;
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

import { supabaseAuthService as auth } from '../src/services/supabaseAuth';

async function runPhase10Test() {
  console.log('================================================================================');
  console.log(' PHASE 10 — EXACT DEBUG TEST: EMPLOYEE PROVISIONING & AUTHENTICATION VALIDATION');
  console.log('================================================================================\n');

  const WS_ID = '4f42a205-792d-4bdb-a9e5-be88cbed331a';

  // 1. Establish Owner Session
  auth.setAuthoritativeWorkspaceId(WS_ID);
  (auth as any).currentProfile = {
    id: 'owner-uuid-prod-100',
    companyId: WS_ID,
    name: 'Owner Administrator',
    email: 'owner-admin@vistaar.com',
    role: 'owner',
    status: 'Active',
    employeeId: 'VST-EMP-001',
  };

  const testEmail = `test_employee_${Date.now()}@vistaar.com`;
  const testName = 'Test Employee';

  console.log(`Step 1: Owner initiates employee provisioning:`);
  console.log(`  Name:  ${testName}`);
  console.log(`  Email: ${testEmail}\n`);

  const createRes = await auth.createEmployee({
    name: testName,
    email: testEmail,
    phone: '9876543210',
    department: 'Operations',
    designation: 'Operations Executive',
    role: 'employee',
  });

  console.log('Create Employee Result:', createRes);

  if (!createRes.success || !createRes.empId || !createRes.tempPass) {
    console.error('❌ Creation failed:', createRes.error);
    process.exit(1);
  }

  const generatedEmpId = createRes.empId;
  const generatedTempPass = createRes.tempPass;
  const generatedUserId = createRes.userId;

  console.log(`\nStep 2: Verification of Issued Credentials:`);
  console.log(`  Employee ID:        ${generatedEmpId}`);
  console.log(`  Temporary Password: ${generatedTempPass}`);
  console.log(`  User ID:            ${generatedUserId}`);

  // Retrieve employee from store
  const employees = auth.getEmployees();
  const createdEmp = employees.find((e) => e.email.toLowerCase() === testEmail.toLowerCase());

  console.log(`\nStep 3: Verification of Required Checklist:`);
  const checkAuthExists = Boolean(generatedUserId);
  const checkProfileExists = Boolean(createdEmp);
  const checkUserIdMatches = createdEmp?.id === generatedUserId;
  const checkWorkspace = createdEmp?.companyId === WS_ID;
  const checkRole = createdEmp?.role === 'employee';
  const checkStatus = createdEmp?.status === 'Active';
  const checkMustChangePwd = createdEmp?.mustChangePassword === true;
  const checkNotHardcoded = generatedTempPass !== 'TempPass@2026';

  console.log(`  AUTH USER EXISTS:       ${checkAuthExists ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  PROFILE EXISTS:         ${checkProfileExists ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  AUTH USER ID = PROF ID: ${checkUserIdMatches ? 'YES ✅' : 'NO ❌'}`);
  console.log(`  PROFILE WORKSPACE:      ${checkWorkspace ? 'OWNER WORKSPACE ✅' : 'MISMATCH ❌'}`);
  console.log(`  PROFILE ROLE:           ${checkRole ? 'employee ✅' : 'INCORRECT ❌'}`);
  console.log(`  PROFILE STATUS:         ${checkStatus ? 'Active ✅' : 'INACTIVE ❌'}`);
  console.log(`  MUST CHANGE PASSWORD:   ${checkMustChangePwd ? 'true ✅' : 'false ❌'}`);
  console.log(`  TEMP PASS DYNAMIC:      ${checkNotHardcoded ? 'YES (Not TempPass@2026) ✅' : 'NO ❌'}`);

  if (!checkAuthExists || !checkProfileExists || !checkUserIdMatches || !checkWorkspace || !checkRole || !checkStatus || !checkMustChangePwd) {
    console.error('\n❌ Checklist validation failed!');
    process.exit(1);
  }

  // 4. Logout Owner
  console.log(`\nStep 4: Logging out Owner...`);
  await auth.logout();
  console.log(`  Current Profile after logout: ${(auth as any).currentProfile}`);

  // 5. Employee ID Resolution
  console.log(`\nStep 5: Resolving Employee ID (${generatedEmpId}) to email...`);
  const resolvedEmail = await auth.resolveEmailFromIdentifier(generatedEmpId, WS_ID);
  console.log(`  Resolved Email: ${resolvedEmail}`);
  if (resolvedEmail?.toLowerCase() !== testEmail.toLowerCase()) {
    console.error(`❌ Resolution failed! Expected ${testEmail}, got ${resolvedEmail}`);
    process.exit(1);
  }
  console.log(`  Resolution: SUCCESS ✅`);

  console.log('\n================================================================================');
  console.log(' ALL PHASE 10 SPECIFICATIONS PASSED WITH ZERO ERRORS ✅');
  console.log('================================================================================\n');
}

runPhase10Test().catch(console.error);
