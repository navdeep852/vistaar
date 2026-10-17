/**
 * Acceptance Test Suite: Missing Invoices Recovery, Historical Record Visibility, and Branch Isolation
 */

// 1. Mock Environment
if (typeof globalThis.localStorage === 'undefined') {
  const memStore = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => memStore.get(key) || null,
    setItem: (key: string, value: string) => { memStore.set(key, String(value)); },
    removeItem: (key: string) => { memStore.delete(key); },
    clear: () => { memStore.clear(); },
    key: (index: number) => Array.from(memStore.keys())[index] || null,
    get length() { return memStore.size; },
  } as any;
}

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: globalThis.localStorage,
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

import { store } from '../src/services/store';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { fromDbInvoice } from '../src/services/supabase/types';
import { safeGetTenantStorage, safeSaveTenantStorage, buildTenantCacheKey } from '../src/services/supabase/safeStorage';

async function runAcceptanceTests() {
  console.log('===============================================================');
  console.log('ACCEPTANCE TESTS: INVOICE PERSISTENCE, VISIBILITY & RECOVERY');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST A: fromDbInvoice preserves branchId, branchName, and IST dates
  // -------------------------------------------------------------------------
  console.log('--- TEST A: fromDbInvoice Branch and IST Date Preservation ---');

  const testDbRow = {
    id: 'test-inv-001',
    invoice_number: 'INV-2026-TEST1',
    branch_id: 'branch-sec-02',
    branch_name: 'Secondary Branch',
    date: '2026-10-16',
    created_at: '2026-10-15T19:30:00Z', // 1:00 AM IST on 16 Oct
    grand_total: 10700,
    paid_amount: 10700,
    balance_amount: 0,
    status: 'Paid',
    customer_name: 'Navdeep Raghuvanshi',
    items: [],
  };

  const parsedInv = fromDbInvoice(testDbRow);
  assert(parsedInv.branchId === 'branch-sec-02', `branchId preserved: ${parsedInv.branchId}`);
  assert(parsedInv.branchName === 'Secondary Branch', `branchName preserved: ${parsedInv.branchName}`);
  assert(parsedInv.date === '2026-10-16', `Date normalized to IST YYYY-MM-DD: ${parsedInv.date}`);
  assert(parsedInv.paidAmount === 10700, `Paid amount preserved: ${parsedInv.paidAmount}`);
  assert(parsedInv.balanceAmount === 0, `Balance amount is 0: ${parsedInv.balanceAmount}`);
  assert(parsedInv.status === 'Paid', `Status is Paid: ${parsedInv.status}`);

  // Test row with branch_id inside snapshot
  const snapshotRow = {
    id: 'test-inv-002',
    invoice_number: 'INV-2026-TEST2',
    snapshot: {
      branch_id: 'branch-snap-99',
      branch_name: 'Snapshot Branch',
    },
    created_at: '2026-10-16T08:00:00Z',
    grand_total: 10000,
    paid_amount: 10000,
    balance_amount: 0,
    status: 'Paid',
    customer_name: 'Aditya',
    items: [],
  };

  const parsedSnapInv = fromDbInvoice(snapshotRow);
  assert(parsedSnapInv.branchId === 'branch-snap-99', `branchId from snapshot preserved: ${parsedSnapInv.branchId}`);
  assert(parsedSnapInv.branchName === 'Snapshot Branch', `branchName from snapshot preserved: ${parsedSnapInv.branchName}`);

  // -------------------------------------------------------------------------
  // TEST B: store.syncRemoteInvoices preserves branchId and protects local Paid status
  // -------------------------------------------------------------------------
  console.log('\n--- TEST B: store.syncRemoteInvoices Branch & Status Integrity ---');

  // Add initial confirmed paid invoice to store
  const confirmedLocal = store.addInvoice({
    invoiceNumber: 'INV-2026-LOCAL1',
    branchId: 'branch-sec-02',
    customerName: 'Navdeep Raghuvanshi',
    customerPhone: '9999999999',
    date: '2026-10-16',
    dueDate: '2026-10-31',
    grandTotal: 10700,
    paidAmount: 10700,
    balanceAmount: 0,
    status: 'Paid',
    items: [],
    subtotal: 10700,
    discountTotal: 0,
    taxTotal: 0,
    templateId: 'inv-modern-blue',
  });

  assert(confirmedLocal.paidAmount === 10700, 'Initial confirmed invoice is Paid');

  // Simulate remote returning a Draft with 0 paid due to interrupted finalization update
  store.syncRemoteInvoices([
    {
      id: confirmedLocal.id,
      invoiceNumber: 'INV-2026-LOCAL1',
      branch_id: 'branch-sec-02',
      grandTotal: 10700,
      paidAmount: 0, // Unfinalized remote status
      status: 'Draft',
    }
  ]);

  const afterSync = store.getInvoice(confirmedLocal.id);
  assert(afterSync?.paidAmount === 10700, `Confirmed paidAmount NOT overwritten by remote Draft (actual: ${afterSync?.paidAmount})`);
  assert(afterSync?.status === 'Paid', `Confirmed status NOT downgraded to Draft (actual: ${afterSync?.status})`);
  assert(afterSync?.branchId === 'branch-sec-02', `branchId retained in store: ${afterSync?.branchId}`);

  // -------------------------------------------------------------------------
  // TEST C: Branch Isolation in Invoice List
  // -------------------------------------------------------------------------
  console.log('\n--- TEST C: Branch Isolation in Invoice Filtering ---');

  const mainBranchId = '6b4e7d9e-d4e6-4c1d-be62-de79db262d4e';
  const secBranchId = '9998fe2e-c3ac-400f-a100-f1b207e86c71';

  store.addInvoice({
    invoiceNumber: 'INV-BRANCH-MAIN',
    branchId: mainBranchId,
    customerName: 'Main Customer',
    customerPhone: '1111111111',
    date: '2026-10-16',
    dueDate: '2026-10-31',
    grandTotal: 5000,
    paidAmount: 5000,
    balanceAmount: 0,
    status: 'Paid',
    items: [],
    subtotal: 5000,
    discountTotal: 0,
    taxTotal: 0,
    templateId: 'inv-modern-blue',
  });

  store.addInvoice({
    invoiceNumber: 'INV-BRANCH-SEC',
    branchId: secBranchId,
    customerName: 'Secondary Customer',
    customerPhone: '2222222222',
    date: '2026-10-16',
    dueDate: '2026-10-31',
    grandTotal: 7000,
    paidAmount: 7000,
    balanceAmount: 0,
    status: 'Paid',
    items: [],
    subtotal: 7000,
    discountTotal: 0,
    taxTotal: 0,
    templateId: 'inv-modern-blue',
  });

  const allInvs = store.getInvoices();
  const mainFilter = allInvs.filter((i) => i.branchId === mainBranchId || (!i.branchId && true));
  const secFilter = allInvs.filter((i) => i.branchId === secBranchId);

  assert(mainFilter.some((i) => i.invoiceNumber === 'INV-BRANCH-MAIN'), 'Main branch filter includes main invoice');
  assert(!mainFilter.some((i) => i.invoiceNumber === 'INV-BRANCH-SEC'), 'Main branch filter excludes secondary branch invoice');
  assert(secFilter.some((i) => i.invoiceNumber === 'INV-BRANCH-SEC'), 'Secondary branch filter includes secondary invoice');
  assert(!secFilter.some((i) => i.invoiceNumber === 'INV-BRANCH-MAIN'), 'Secondary branch filter excludes main branch invoice');

  // -------------------------------------------------------------------------
  // TEST D: Merging Fallback Invoices on Startup (loadFromStorage)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST D: Fallback Storage Merge on Startup ---');

  // Place an invoice in LOCAL_INVOICES_KEY only
  const localDbInvoices = [
    {
      id: 'inv-offline-999',
      invoice_number: 'INV-2026-OFFLINE',
      branch_id: mainBranchId,
      customer_name: 'Offline Buyer',
      date: '2026-10-16',
      grand_total: 9999,
      paid_amount: 9999,
      balance_amount: 0,
      status: 'Paid',
      items: [],
    }
  ];
  safeSaveTenantStorage('vistaar_local_invoices_db', localDbInvoices);

  // Trigger reloadTenantState to test startup load
  store.reloadTenantState();
  const reloadedInvoices = store.getInvoices();
  const foundOffline = reloadedInvoices.find((i) => i.invoiceNumber === 'INV-2026-OFFLINE');
  assert(Boolean(foundOffline), 'Invoice from local invoices DB successfully merged on startup');
  assert(foundOffline?.grandTotal === 9999, `Offline invoice grand total is ₹9,999: ${foundOffline?.grandTotal}`);
  assert(foundOffline?.branchId === mainBranchId, `Offline invoice branchId preserved: ${foundOffline?.branchId}`);

  console.log('\n===============================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTests();
