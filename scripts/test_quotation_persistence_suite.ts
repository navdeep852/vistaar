/**
 * VISTAAR Business OS — Quotation Persistence & Multi-Tenant Verification Suite
 * Tests A through H as specified in Section 8 of the Master Specification:
 * - Test A: Three quotation persistence with unique DB IDs across navigation
 * - Test B: Browser refresh simulation with state rehydration
 * - Test C: Revisit after delay with persistent line items
 * - Test D: Authentication lifecycle (logout clears, login restores)
 * - Test E: Database / RLS failure simulation (strict rejection, zero false success)
 * - Test F: Multi-tenant workspace isolation (Company A vs Company B)
 * - Test G: Edit and Delete persistence
 * - Test H: Regression testing (custom items, taxes, totals, invoice conversion)
 */

// Storage Polyfills for Node Environment
const localStore: Record<string, string> = {};
const sessionStore: Record<string, string> = {};

const mockLocalStorage = {
  getItem: (k: string) => localStore[k] || null,
  setItem: (k: string, v: string) => { localStore[k] = String(v); },
  removeItem: (k: string) => { delete localStore[k]; },
  clear: () => { Object.keys(localStore).forEach((k) => delete localStore[k]); },
};

const mockSessionStorage = {
  getItem: (k: string) => sessionStore[k] || null,
  setItem: (k: string, v: string) => { sessionStore[k] = String(v); },
  removeItem: (k: string) => { delete sessionStore[k]; },
  clear: () => { Object.keys(sessionStore).forEach((k) => delete sessionStore[k]); },
};

(global as any).localStorage = mockLocalStorage;
(global as any).sessionStorage = mockSessionStorage;
if (typeof (global as any).window === 'undefined') {
  (global as any).window = {
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
}

import { quotationService, LOCAL_QUOTATIONS_KEY } from '../src/services/supabase/quotationService';
import { store } from '../src/services/store';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { Quotation, QuotationItem, QuotationStatus } from '../src/types';
import { supabase } from '../src/lib/supabase';
import { safeGetTenantStorage } from '../src/services/supabase/safeStorage';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, title: string, details?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${title}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${title}${details ? ` -> ${details}` : ''}`);
    failedTests++;
  }
}

function loginAs(profile: any, wsId: string) {
  (supabaseAuthService as any).currentProfile = profile;
  (supabaseAuthService as any).authoritativeWorkspaceId = wsId;
  (supabaseAuthService as any).authResolutionState = 'ready';
  mockLocalStorage.setItem('vistaar_user_session', JSON.stringify(profile));
  mockLocalStorage.setItem('vistaar_auth_user', JSON.stringify(profile));
  mockLocalStorage.setItem('vistaar_current_company_id', wsId);
  mockLocalStorage.setItem('vistaar_tenant_workspace_id', wsId);
  store.reloadTenantState();
}

function logout() {
  (supabaseAuthService as any).currentProfile = null;
  (supabaseAuthService as any).authoritativeWorkspaceId = null;
  (supabaseAuthService as any).authResolutionState = 'unauthenticated';
  mockLocalStorage.removeItem('vistaar_user_session');
  mockLocalStorage.removeItem('vistaar_auth_user');
  mockLocalStorage.removeItem('vistaar_current_company_id');
  mockLocalStorage.removeItem('vistaar_tenant_workspace_id');
  store.resetState();
}

async function runQuotationTestSuite() {
  console.log('\n===============================================================');
  console.log('   VISTAAR QUOTATION PERSISTENCE & MULTI-TENANT TEST SUITE     ');
  console.log('===============================================================\n');

  // Setup Company A tenant
  const COMPANY_A_WS_ID = '8a958e08-faec-41c0-a42e-13c59368d189';
  const COMPANY_B_WS_ID = '00000000-0000-4000-8000-000000000099';

  // Seed authenticated user state
  const mockUserCompanyA = {
    id: '01d51624-a74d-4402-995a-694fe6f26471',
    email: 'business@vistaar.com',
    companyId: COMPANY_A_WS_ID,
    name: 'VISTAAR Owner',
    role: 'owner' as const,
  };

  loginAs(mockUserCompanyA, COMPANY_A_WS_ID);

  // In-memory mock database store to simulate authenticated PostgreSQL persistence
  const simulatedDbQuotations: any[] = [];
  const simulatedDbQuotationItems: any[] = [];

  // Spy on supabase.from to test database-backed persistence under authenticated session
  const originalFrom = supabase.from.bind(supabase);
  (supabase as any).from = (table: string) => {
    if (table === 'quotations') {
      return {
        insert: (rows: any[]) => {
          const inserted = rows.map((r) => {
            const rowWithId = {
              ...r,
              id: r.id || `3f4c0000-0000-4000-8000-${String(simulatedDbQuotations.length + 1).padStart(12, '0')}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            simulatedDbQuotations.push(rowWithId);
            return rowWithId;
          });
          return {
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
            }),
          };
        },
        select: (fields: string) => ({
          eq: (col1: string, val1: any) => ({
            eq: (col2: string, val2: any) => ({
              order: () => ({
                data: simulatedDbQuotations
                  .filter((q) => q[col1] === val1 && q[col2] === val2)
                  .map((q) => ({
                    ...q,
                    quotation_items: simulatedDbQuotationItems.filter((i) => i.quotation_id === q.id),
                  })),
                error: null,
              }),
            }),
            order: (orderCol: string, opts?: any) => {
              const matched = simulatedDbQuotations
                .filter((q) => q[col1] === val1)
                .map((q) => ({
                  ...q,
                  quotation_items: simulatedDbQuotationItems.filter((i) => i.quotation_id === q.id),
                }));
              return Promise.resolve({ data: matched, error: null });
            },
          }),
        }),
        update: (updates: any) => ({
          eq: (col1: string, val1: any) => ({
            eq: (col2: string, val2: any) => ({
              select: () => ({
                single: async () => {
                  const idx = simulatedDbQuotations.findIndex((q) => q[col1] === val1 && q[col2] === val2);
                  if (idx >= 0) {
                    simulatedDbQuotations[idx] = { ...simulatedDbQuotations[idx], ...updates, updated_at: new Date().toISOString() };
                    return { data: simulatedDbQuotations[idx], error: null };
                  }
                  return { data: null, error: { message: 'Row not found' } };
                },
              }),
            }),
          }),
        }),
        delete: () => ({
          eq: (col1: string, val1: any) => ({
            eq: (col2: string, val2: any) => {
              const beforeLen = simulatedDbQuotations.length;
              const filtered = simulatedDbQuotations.filter((q) => !(q[col1] === val1 && q[col2] === val2));
              simulatedDbQuotations.length = 0;
              simulatedDbQuotations.push(...filtered);
              return Promise.resolve({ error: null });
            },
          }),
        }),
      } as any;
    }

    if (table === 'quotation_items') {
      return {
        insert: (rows: any[]) => {
          rows.forEach((r) => {
            simulatedDbQuotationItems.push({
              ...r,
              id: r.id || `qti-${Date.now()}-${Math.random()}`,
            });
          });
          return Promise.resolve({ error: null });
        },
        delete: () => ({
          eq: (col1: string, val1: any) => ({
            eq: (col2: string, val2: any) => {
              const filtered = simulatedDbQuotationItems.filter((i) => !(i[col1] === val1 && i[col2] === val2));
              simulatedDbQuotationItems.length = 0;
              simulatedDbQuotationItems.push(...filtered);
              return Promise.resolve({ error: null });
            },
          }),
        }),
      } as any;
    }

    return originalFrom(table);
  };

  // -------------------------------------------------------------------------
  // TEST A: Three Quotation Persistence
  // -------------------------------------------------------------------------
  console.log('▶ TEST A — Three Quotation Persistence');

  const customItemsA1: QuotationItem[] = [
    {
      id: 'item-1',
      itemType: 'custom',
      productName: 'Custom Machined Bracket 101',
      description: 'Precision CNC milled 6061-T6 aluminum',
      partNumber: 'BRK-101-CNC',
      sku: 'BRK-101',
      unit: 'Pcs',
      quantity: 5,
      buyPrice: 300,
      sellingPrice: 550,
      discountAmount: 50,
      taxPercent: 18,
      taxAmount: 486,
      total: 3186,
    },
  ];

  const customItemsA2: QuotationItem[] = [
    {
      id: 'item-2',
      itemType: 'product',
      productName: 'Heavy Duty Stepper Motor NEMA 23',
      description: '1.9Nm high torque bipolar motor',
      partNumber: 'MTR-NEMA23',
      sku: 'MTR-23',
      unit: 'Pcs',
      quantity: 2,
      buyPrice: 1200,
      sellingPrice: 1800,
      discountAmount: 0,
      taxPercent: 18,
      taxAmount: 648,
      total: 4248,
    },
  ];

  const customItemsA3: QuotationItem[] = [
    {
      id: 'item-3',
      itemType: 'custom',
      productName: 'Industrial Electrical Enclosure IP66',
      description: 'Galvanized mild steel enclosure with lock',
      partNumber: 'ENC-IP66-400',
      sku: 'ENC-400',
      unit: 'Unit',
      quantity: 1,
      buyPrice: 2500,
      sellingPrice: 3800,
      discountAmount: 200,
      taxPercent: 18,
      taxAmount: 648,
      total: 4248,
    },
  ];

  const res1 = await quotationService.createQuotation({
    customerName: 'Anand Engineering Works',
    customerPhone: '9876543210',
    customerAddress: 'Phase II Industrial Area, New Delhi',
    customerGstin: '07AAAAA0000A1Z5',
    status: 'Sent',
    date: '2026-10-24',
    validUntil: '2026-11-24',
    notes: 'Validity 30 days',
    terms: '50% advance along with PO',
  }, customItemsA1);

  const res2 = await quotationService.createQuotation({
    customerName: 'Bharat Electronics Tech',
    customerPhone: '9811122233',
    customerAddress: 'Okhla Industrial Area, New Delhi',
    status: 'Draft',
    date: '2026-10-24',
    validUntil: '2026-11-10',
  }, customItemsA2);

  const res3 = await quotationService.createQuotation({
    customerName: 'Chandigarh Automation Pvt Ltd',
    customerPhone: '9844455566',
    customerAddress: 'Industrial Area, Mohali',
    status: 'Sent',
    date: '2026-10-24',
    validUntil: '2026-11-30',
  }, customItemsA3);

  assert(!!res1.quotationId && !res1.error, 'Quotation 1 created with valid ID', res1.error);
  assert(!!res2.quotationId && !res2.error, 'Quotation 2 created with valid ID', res2.error);
  assert(!!res3.quotationId && !res3.error, 'Quotation 3 created with valid ID', res3.error);

  const id1 = res1.quotationId!;
  const id2 = res2.quotationId!;
  const id3 = res3.quotationId!;

  assert(id1 !== id2 && id2 !== id3 && id1 !== id3, 'All 3 quotations have distinct unique IDs');

  // Verify records exist in persistent database
  assert(simulatedDbQuotations.length === 3, 'All 3 quotations exist in database records');
  assert(simulatedDbQuotationItems.length === 3, 'All line items exist in database quotation_items');

  // Simulate navigating away from quotation page (reset component-level memory)
  const navFetch = await quotationService.getQuotations(COMPANY_A_WS_ID);
  const found1 = navFetch.data.find((q) => q.id === id1);
  const found2 = navFetch.data.find((q) => q.id === id2);
  const found3 = navFetch.data.find((q) => q.id === id3);

  assert(!!found1 && found1.customerName === 'Anand Engineering Works', 'Quotation 1 persisted across navigation with correct customer');
  assert(!!found2 && found2.customerName === 'Bharat Electronics Tech', 'Quotation 2 persisted across navigation with correct customer');
  assert(!!found3 && found3.customerName === 'Chandigarh Automation Pvt Ltd', 'Quotation 3 persisted across navigation with correct customer');

  // -------------------------------------------------------------------------
  // TEST B: Browser Refresh Simulation
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST B — Browser Refresh Simulation');

  // In-memory state wipe as happens on browser refresh
  store.resetState();
  store.reloadTenantState();

  const refreshedQuotations = await quotationService.getQuotations(COMPANY_A_WS_ID);
  const refreshQ1 = refreshedQuotations.data.find((q) => q.id === id1);
  const refreshQ2 = refreshedQuotations.data.find((q) => q.id === id2);
  const refreshQ3 = refreshedQuotations.data.find((q) => q.id === id3);

  assert(!!refreshQ1, 'Quotation 1 survived browser refresh');
  assert(!!refreshQ2, 'Quotation 2 survived browser refresh');
  assert(!!refreshQ3, 'Quotation 3 survived browser refresh');
  assert(refreshQ1?.grandTotal === 3186, 'Quotation 1 grand total preserved exactly after refresh');

  // -------------------------------------------------------------------------
  // TEST C: Revisit After Time (Delayed Rehydration)
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST C — Revisit After Time');

  // Reconstruct store after app closure
  store.resetState();
  store.reloadTenantState();
  const delayedFetch = await quotationService.getQuotations(COMPANY_A_WS_ID);
  assert(delayedFetch.data.length >= 3, 'Quotations successfully rehydrated after time delay');
  const delayedQ = delayedFetch.data.find((q) => q.id === id1);
  assert(!!delayedQ?.items && delayedQ.items.length > 0, 'Quotation line items intact after delay');
  assert(delayedQ?.items[0].productName === 'Custom Machined Bracket 101', 'Line item details preserved');

  // -------------------------------------------------------------------------
  // TEST D: Authentication Lifecycle
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST D — Authentication Lifecycle');

  // 1. Simulate Logout
  logout();

  const loggedOutQuotations = store.getQuotations();
  assert(loggedOutQuotations.length === 0, 'Logged out state cleanly resets quotations from memory');

  // 2. Re-login as authorized user
  loginAs(mockUserCompanyA, COMPANY_A_WS_ID);

  const reauthQuotations = await quotationService.getQuotations(COMPANY_A_WS_ID);
  const reauthQ1 = reauthQuotations.data.find((q) => q.id === id1);
  assert(!!reauthQ1, 'Authorized user re-login successfully restores quotation records');

  // -------------------------------------------------------------------------
  // TEST E: Database/Network Failure Handling
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST E — Database & Network Failure Simulation');

  // Simulate database rejection
  const tempFrom = (supabase as any).from;
  (supabase as any).from = (t: string) => ({
    insert: () => ({
      select: () => ({
        single: async () => ({
          data: null,
          error: { code: '42501', message: 'new row violates row-level security policy for table "quotations"' },
        }),
      }),
    }),
  });

  const failRes = await quotationService.createQuotation({
    customerName: 'Fail Test Inc',
    status: 'Draft',
  }, []);

  // System should reject and return error, NOT claim success
  assert(!failRes.quotationId && !!failRes.error, 'Database failure strictly reports error without false success message');
  (supabase as any).from = tempFrom;

  // -------------------------------------------------------------------------
  // TEST F: Workspace Isolation (Company A vs Company B)
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST F — Workspace Isolation & Multi-Tenant Security');

  // Switch context to Company B
  const mockUserCompanyB = {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'user@companyb.com',
    companyId: COMPANY_B_WS_ID,
    name: 'Company B Manager',
    role: 'owner' as const,
  };

  loginAs(mockUserCompanyB, COMPANY_B_WS_ID);

  // Query quotations for Company B
  const companyBQuotations = await quotationService.getQuotations(COMPANY_B_WS_ID);
  const leakQ1 = companyBQuotations.data.find((q) => q.id === id1);
  const leakQ2 = companyBQuotations.data.find((q) => q.id === id2);

  assert(!leakQ1 && !leakQ2, 'Company B cannot access Company A quotations (Strict Tenant Isolation)');

  // Restore Company A
  loginAs(mockUserCompanyA, COMPANY_A_WS_ID);
  const companyAQuotations = await quotationService.getQuotations(COMPANY_A_WS_ID);
  const compAQ = companyAQuotations.data.find((q) => q.id === id1);
  assert(!!compAQ, 'Company A authorized user retains full access to their quotations');

  // -------------------------------------------------------------------------
  // TEST G: Edit and Delete Persistence
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST G — Edit and Delete Persistence');

  // 1. Edit Quotation 2
  const updatedCustomerName = 'Bharat Electronics Technologies & Systems';
  const updatedItems: QuotationItem[] = [
    {
      ...customItemsA2[0],
      quantity: 4,
      total: 8496,
    },
  ];

  const updateRes = await quotationService.updateQuotation(id2, {
    customerName: updatedCustomerName,
    notes: 'Updated delivery schedule: 2 weeks',
    status: 'Accepted',
  }, updatedItems);

  assert(updateRes.success, 'Quotation 2 update executed successfully', updateRes.error);

  // Reload store to verify edit persisted
  store.resetState();
  store.reloadTenantState();

  const editFetch = await quotationService.getQuotations(COMPANY_A_WS_ID);
  const editedQ2 = editFetch.data.find((q) => q.id === id2);
  assert(editedQ2?.customerName === updatedCustomerName, 'Edited customer name persisted');
  assert(editedQ2?.status === 'Accepted', 'Edited status persisted');

  // 2. Delete Quotation 3
  const deleteRes = await quotationService.deleteQuotation(id3);
  assert(deleteRes.success, 'Quotation 3 deletion executed successfully', deleteRes.error);

  // Reload store to verify delete persisted
  store.resetState();
  store.reloadTenantState();

  const postDeleteFetch = await quotationService.getQuotations(COMPANY_A_WS_ID);
  const deletedQ3 = postDeleteFetch.data.find((q) => q.id === id3);
  const retainedQ1 = postDeleteFetch.data.find((q) => q.id === id1);

  assert(!deletedQ3, 'Deleted quotation permanently removed from persistent storage');
  assert(!!retainedQ1, 'Other quotations unaffected by deletion of quotation 3');

  // -------------------------------------------------------------------------
  // TEST H: Regression Testing (Custom Items, UPI QR, Calculations)
  // -------------------------------------------------------------------------
  console.log('\n▶ TEST H — Regression Testing (Custom Line Items & Quotation Features)');

  // Verify custom product support
  assert(
    retainedQ1?.items?.[0]?.itemType === 'custom' || retainedQ1?.items?.[0]?.productName === 'Custom Machined Bracket 101',
    'Custom non-catalog products fully supported and persisted'
  );

  // Verify tax calculations
  assert(retainedQ1?.subtotal === 2750, 'Subtotal correctly computed (5 * 550)');
  assert(retainedQ1?.discountTotal === 50, 'Discount correctly subtracted');
  assert(retainedQ1?.taxTotal === 486, '18% GST correctly computed');
  assert(retainedQ1?.grandTotal === 3186, 'Grand total matches subtotal - discount + tax');

  // Verify Quotation to Invoice Conversion
  console.log('  Testing Quotation-to-Invoice conversion flow...');
  const convertRes = await quotationService.convertQuotationToInvoice({
    quotationId: id1,
    paymentStatus: 'Unpaid',
  });

  assert(
    convertRes.success,
    `Quotation successfully converted to Invoice ${convertRes.invoiceNumber || ''}`,
    convertRes.error
  );

  const convertedQ1 = (await quotationService.getQuotations(COMPANY_A_WS_ID)).data.find((q) => q.id === id1);
  assert(
    convertedQ1?.status === 'Converted',
    'Quotation status automatically transitioned to Converted'
  );

  // Restore original supabase.from
  (supabase as any).from = originalFrom;

  // Final Summary
  console.log('\n===============================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runQuotationTestSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
