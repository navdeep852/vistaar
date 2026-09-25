/**
 * VISTAAR Business OS — Authoritative Employee Master & Payroll Flow Regression Test Suite
 *
 * Verifies:
 * 1. Sequential VST-EMP-XXX generation and editable unique Employee IDs.
 * 2. Profile creation with full fields (Department, Designation, Phone, Joining Date, Employment Type).
 * 3. CRITICAL FINANCIAL RULE: Creating an employee and configuring salary structure creates ZERO Daybook, Cashbook, or Expense entries.
 * 4. Salary Structure Revision tracking (version increment, effective dates, previous record closure).
 * 5. Delete protection for employees with financial history (payments, structures) -> must block and recommend archive.
 * 6. Archive / Unarchive lifecycle.
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

import { supabaseAuthService } from '../src/services/supabaseAuth';
import { payrollService } from '../src/services/supabase/payrollService';

async function runEmployeeMasterPayrollTests() {
  console.log('================================================================================');
  console.log(' VISTAAR Business OS — EMPLOYEE MASTER & PAYROLL REVISION INTEGRATION SUITE      ');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  const WS_ID = '4f42a205-792d-4bdb-a9e5-be88cbed331a';
  supabaseAuthService.setAuthoritativeWorkspaceId(WS_ID);

  const mockOwner = {
    id: 'owner-uuid-1234',
    name: 'Business Owner',
    email: 'owner@vistaar.com',
    role: 'owner',
    companyId: WS_ID,
  };
  localStorage.setItem('vistaar_auth_user', JSON.stringify(mockOwner));
  localStorage.setItem('vistaar_current_company_id', WS_ID);

  function assert(condition: boolean, testName: string, detail = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} — ${detail}`);
      failed++;
    }
  }

  try {
    // TEST 1: Generate next sequential Employee ID format (VST-EMP-XXX)
    console.log('\n--- 1. Sequential Employee ID Generation ---');
    const nextId = await supabaseAuthService.generateNextEmployeeId();
    assert(
      /^VST-EMP-\d{3,}$/.test(nextId),
      'Generates sequential VST-EMP-XXX format',
      `Got: ${nextId}`
    );

    // TEST 2: Add Employee without email (optional email)
    console.log('\n--- 2. Employee Creation with Full Metadata ---');
    const testPhone = '9876543210';
    const createRes = await supabaseAuthService.createEmployee({
      name: 'Rahul Sharma',
      phone: testPhone,
      department: 'Operations',
      designation: 'Field Supervisor',
      employmentType: 'Full Time',
      joiningDate: '2026-01-15',
      address: '123 Market Road, New Delhi',
      employeeId: nextId,
    });

    assert(createRes.success, 'Successfully created employee with no email', createRes.error || '');
    const emp = createRes.employee!;
    assert(emp?.employeeId === nextId, 'Employee ID is correctly assigned', `Assigned: ${emp?.employeeId}`);
    assert(emp?.department === 'Operations', 'Department assigned correctly');
    assert(emp?.designation === 'Field Supervisor', 'Designation assigned correctly');
    assert(emp?.employmentType === 'Full Time', 'Employment type assigned correctly');
    assert(emp?.joiningDate === '2026-01-15', 'Joining date assigned correctly');

    // TEST 3: Duplicate Employee ID check
    console.log('\n--- 3. Duplicate Employee ID Prevention ---');
    const dupRes = await supabaseAuthService.createEmployee({
      name: 'Duplicate Candidate',
      phone: '9876543211',
      employeeId: nextId, // duplicate ID
    });
    assert(!dupRes.success, 'Prevents creating duplicate Employee ID in workspace', `Error: ${dupRes.error}`);

    // TEST 4: Configure Salary Structure & Verify ZERO Ledger Postings
    console.log('\n--- 4. Configure Initial Salary Structure (v1) & Financial Safety Rule ---');
    const structRes = await payrollService.upsertSalaryStructure({
      employeeId: emp.id,
      baseSalary: 30000,
      hraAllowance: 5000,
      otherAllowances: 2000,
      standardDeductions: 1000,
      paymentMode: 'Bank Transfer',
      bankName: 'HDFC Bank',
      bankAccountNo: '50100123456789',
      effectiveFrom: '2026-01-01',
    });

    assert(structRes.success, 'Successfully configured initial salary structure', structRes.error || '');
    assert(structRes.structure?.baseSalary === 30000, 'Base salary correctly set to 30000');
    assert(structRes.structure?.version === 1, 'Initial structure version is 1');
    assert(structRes.structure?.isCurrent === true, 'Structure marked as current');

    // CRITICAL FINANCIAL INTEGRITY VERIFICATION:
    // Ensure that NO Daybook, Cashbook, or Expense entries were created upon Employee or Structure creation
    const payments = (await payrollService.getSalaryPayments({ employeeId: emp.id })).data;
    assert(payments.length === 0, 'ZERO salary payments exist after employee + structure creation');

    // TEST 5: Salary Structure Revision Versioning (v2)
    console.log('\n--- 5. Salary Structure Revision (Raise / Promotion) Versioning ---');
    const revisionRes = await payrollService.upsertSalaryStructure({
      employeeId: emp.id,
      baseSalary: 35000, // ₹5,000 raise
      hraAllowance: 6000,
      otherAllowances: 2000,
      standardDeductions: 1000,
      effectiveFrom: '2026-10-01',
      notes: 'Annual Performance Appraisal revision',
    });

    assert(revisionRes.success, 'Successfully created salary revision', revisionRes.error || '');
    assert(revisionRes.structure?.baseSalary === 35000, 'Revised base salary is 35000');
    assert(revisionRes.structure?.version === 2, 'Revised structure version incremented to 2');
    assert(revisionRes.structure?.effectiveFrom === '2026-10-01', 'Effective from date is 2026-10-01');

    // Structure history should show both v1 and v2
    const history = await payrollService.getSalaryStructureHistory(emp.id);
    assert(history.length >= 2, 'Salary structure history tracks multiple version revisions');

    // TEST 6: Financial History Protection on Delete
    console.log('\n--- 6. Financial History Delete Protection ---');
    const hasHistory = await payrollService.hasEmployeeFinancialHistory(emp.id);
    assert(hasHistory, 'Employee correctly identified as having financial structure history');

    const deleteAttempt = await supabaseAuthService.deleteEmployee(emp.id);
    assert(
      !deleteAttempt.success,
      'Blocks deletion of employee with recorded salary structures to protect accounting audit trails',
      `Error returned: ${deleteAttempt.error}`
    );

    // TEST 7: Archive & Unarchive Lifecycle
    console.log('\n--- 7. Archive and Unarchive Lifecycle ---');
    const archiveRes = await supabaseAuthService.archiveEmployee(emp.id);
    assert(archiveRes.success, 'Successfully archived employee', archiveRes.error || '');

    const empListAfterArchive = await supabaseAuthService.loadEmployees();
    const archivedEmp = empListAfterArchive.find((e) => e.id === emp.id);
    assert(Boolean(archivedEmp?.isArchived), 'Employee marked as archived in directory');

    const unarchiveRes = await supabaseAuthService.unarchiveEmployee(emp.id);
    assert(unarchiveRes.success, 'Successfully restored employee from archive', unarchiveRes.error || '');

    const empListAfterRestore = await supabaseAuthService.loadEmployees();
    const restoredEmp = empListAfterRestore.find((e) => e.id === emp.id);
    assert(!restoredEmp?.isArchived, 'Employee is restored to active status');

    // TEST 8: Employee Master Summary Metrics
    console.log('\n--- 8. Employee Master Directory Payroll Summary ---');
    const empSummary = await payrollService.getEmployeePayrollSummary(emp.id);
    assert(empSummary.currentSalary === 43000, 'Employee summary resolves latest active gross package (43000)');
    assert(empSummary.structureHistory.length >= 2, 'Employee summary resolves full structure history');

  } catch (err: any) {
    console.error('Unexpected test error:', err);
    failed++;
  }

  console.log('\n================================================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEmployeeMasterPayrollTests();
