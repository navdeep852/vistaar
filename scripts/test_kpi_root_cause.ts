if (typeof globalThis.localStorage === 'undefined') {
  const storeMap = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => storeMap.get(key) || null,
    setItem: (key: string, value: string) => { storeMap.set(key, String(value)); },
    removeItem: (key: string) => { storeMap.delete(key); },
    clear: () => { storeMap.clear(); },
    key: (index: number) => Array.from(storeMap.keys())[index] || null,
    get length() { return storeMap.size; },
  } as any;
}

import { resolveDateRange } from '../src/lib/dateRange';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { store } from '../src/services/store';
import { branchService } from '../src/services/supabase/branchService';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { registerCurrentUserResolver } from '../src/lib/permissions';
import { safeSaveTenantItem } from '../src/services/supabase/safeStorage';

async function testRootCause() {
  console.log('====================================================');
  console.log('INVESTIGATING DASHBOARD KPI ZERO VALUES ROOT CAUSE');
  console.log('====================================================');

  const wsId = 'a0000000-0000-4000-8000-000000000001';
  const ownerId = 'b0000000-0000-4000-8000-000000000001';

  registerCurrentUserResolver(() => ({
    id: ownerId,
    role: 'Owner',
    status: 'Active',
    workspaceId: wsId,
  } as any));

  (supabaseAuthService as any).currentProfile = {
    id: ownerId,
    companyId: wsId,
    role: 'owner',
    name: 'Owner',
    email: 'owner@vistaar.com',
    employeeId: 'VST-0001',
    status: 'Active',
  };
  localStorage.setItem('vistaar_user_session', JSON.stringify({
    id: ownerId,
    email: 'owner@vistaar.com',
    companyId: wsId,
    role: 'owner',
    businessName: 'VISTAAR Enterprises',
  }));
  localStorage.setItem('vistaar_current_company_id', wsId);
  (supabaseAuthService as any).authoritativeWorkspaceId = wsId;
  supabaseAuthService.isAuthenticated = () => true;
  supabaseAuthService.getUser = () => (supabaseAuthService as any).currentProfile;
  supabaseAuthService.getCurrentCompanyId = () => wsId;
  supabaseAuthService.getAuthoritativeWorkspaceId = async () => wsId;

  // Setup branch
  const brRes = await branchService.getBranches();
  const mainBranch = brRes.data[0];
  console.log('Main Branch ID:', mainBranch?.id, 'isMainBranch:', mainBranch?.isMainBranch);

  // 1. Create a Counter Sale within the period: 2026-08-15
  console.log('\n--- Adding sample Counter Sale on 2026-08-15 ---');
  store.addOrUpdateCounterSale({
    id: 'cs-test-001',
    workspaceId: wsId,
    branchId: mainBranch.id,
    saleNumber: 'POS-TEST-001',
    invoiceNumber: 'POS-TEST-001',
    customerName: 'Cash Customer',
    saleDate: '2026-08-15',
    subtotal: 5000,
    finalTotal: 5000,
    amountReceived: 5000,
    balanceAmount: 0,
    status: 'COMPLETED',
    paymentMethod: 'Cash',
    items: [],
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
  });

  // 2. Create an Invoice within the period: 2026-09-01
  console.log('--- Adding sample Invoice on 2026-09-01 ---');
  store.addInvoice({
    id: 'inv-test-001',
    workspaceId: wsId,
    branchId: mainBranch.id,
    invoiceNumber: 'INV-TEST-001',
    customerName: 'Test Customer',
    status: 'Issued',
    date: '2026-09-01',
    subtotal: 10000,
    grandTotal: 10000,
    paidAmount: 6000,
    balanceAmount: 4000,
    items: [],
  });

  console.log('Store Invoices count:', store.getInvoices().length);
  console.log('Store Counter Sales count:', (store as any).getCounterSales().length);

  // CASE 1: date range with YYYY-MM-DD
  console.log('\n--- CASE 1: Query with normalized YYYY-MM-DD (2026-07-10 to 2026-10-02) ---');
  const range1 = resolveDateRange('custom', '2026-07-10', '2026-10-02');
  console.log('Range 1:', { start: range1.startDateStr, end: range1.endDateStr });

  const kpis1 = await enterpriseAnalyticsService.getDashboardKpis(range1, true, mainBranch.id, wsId);
  console.log('KPIs 1 Result:', kpis1);

  // CASE 2: date range with DD-MM-YYYY (what happens if customStart is '10-07-2026')
  console.log('\n--- CASE 2: Query with unnormalized DD-MM-YYYY (10-07-2026 to 02-10-2026) ---');
  const range2 = resolveDateRange('custom', '10-07-2026', '02-10-2026');
  console.log('Range 2:', { start: range2.startDateStr, end: range2.endDateStr });

  const kpis2 = await enterpriseAnalyticsService.getDashboardKpis(range2, true, mainBranch.id, wsId);
  console.log('KPIs 2 Result:', kpis2);

  // CASE 3: What if safeGetTenantItem('main_branch_id') is NOT set?
  console.log('\n--- CASE 3: Main branch detection when safeGetTenantItem("main_branch_id") is missing ---');
  // Check sales metrics when branchId is mainBranch.id
  const salesMetrics = await salesAnalyticsService.getSalesMetrics(range1, true, wsId, mainBranch.id);
  console.log('Sales Metrics Result:', salesMetrics);

  process.exit(0);
}

testRootCause();
