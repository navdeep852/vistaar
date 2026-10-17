import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { safeSaveTenantStorage, safeSaveTenantItem } from '../src/services/supabase/safeStorage';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { resolveDateRange } from '../src/lib/dateRange';
import { Branch } from '../src/types';
import { registerCurrentUserResolver } from '../src/lib/permissions';
import { isRecordInBranch } from '../src/lib/branchUtils';

async function main() {
  console.log('=== VERIFYING EXACT ROOT CAUSE: SUPABASE MERGE DEDUPLICATION DROP ===');

  const wsId = '55555555-5555-4555-8555-555555555555';
  safeSaveTenantItem('active_company_id', wsId);
  const mockUser: any = { id: '99999999-9999-4999-8999-999999999999', email: 'owner@vistaar.com', role: 'owner', status: 'Active' };
  registerCurrentUserResolver(() => mockUser);
  (supabaseAuthService as any).getCurrentCompanyId = () => wsId;
  (supabaseAuthService as any).getAuthoritativeWorkspaceId = async () => wsId;
  (supabaseAuthService as any).getAuthoritativeWorkspaceIdSync = () => wsId;
  (supabaseAuthService as any).getUser = () => mockUser;
  (supabaseAuthService as any).isOwner = () => true;

  const subBranchId = '22222222-0000-4000-8000-000000000002';
  const mainBranchId = '11111111-0000-4000-8000-000000000001';

  const branches: Branch[] = [
    {
      id: mainBranchId,
      workspaceId: wsId,
      branchCode: 'MAIN',
      branchName: 'Main Branch',
      branchType: 'Store',
      status: 'Active',
      isMainBranch: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: subBranchId,
      workspaceId: wsId,
      branchCode: 'SUB1',
      branchName: 'Sub Branch 1',
      branchType: 'Store',
      status: 'Active',
      isMainBranch: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  safeSaveTenantStorage('vistaar_local_branches_db', branches);
  safeSaveTenantItem('main_branch_id', mainBranchId);

  const saleId = 'cs-5400-test';
  const invoiceNum = 'INV-2026-05400';
  const saleNum = 'CS-2026-05400';
  const today = new Date().toISOString().split('T')[0];

  // 1. In Local Storage, the record has the SUB-BRANCH ID
  const localSale = {
    id: saleId,
    workspace_id: wsId,
    branch_id: subBranchId,
    branchId: subBranchId,
    sale_number: saleNum,
    invoice_number: invoiceNum,
    sale_date: today,
    final_total: 5400,
    subtotal: 5400,
    status: 'COMPLETED',
    payment_method: 'Cash',
    amount_received: 5400,
    balance_amount: 0,
    items: [],
  };
  safeSaveTenantStorage('vistaar_local_counter_sales_db', [localSale]);

  // 2. Mock Supabase returning the remote row WITHOUT branch_id (simulating missing column in Supabase schema cache)
  const remoteStub = {
    id: saleId,
    workspace_id: wsId,
    sale_number: saleNum,
    invoice_number: invoiceNum,
    sale_date: today,
    final_total: 5400,
    subtotal: 5400,
    status: 'COMPLETED',
    payment_method: 'Cash',
    amount_received: 5400,
    balance_amount: 0,
    // branch_id is UNDEFINED because column doesn't exist on remote table
    notes: '',
    counter_sale_items: [],
  };

  // We spy on Supabase query in getCounterSales
  const originalGetCounterSales = counterSaleService.getCounterSales.bind(counterSaleService);

  // Let's run salesAnalyticsService (Dashboard)
  const dateRange = resolveDateRange('today');
  const salesMetrics = await salesAnalyticsService.getSalesMetrics(dateRange, true, wsId, subBranchId);
  console.log('Dashboard (salesAnalyticsService) Counter Sales for subBranch:', salesMetrics.counterSales);

  // Now simulate counterSaleService where supabaseSales returns remoteStub
  // We temporarily mock supabase select
  const { supabase } = await import('../src/lib/supabase');
  const origFrom = supabase.from;
  (supabase as any).from = (table: string) => {
    if (table === 'counter_sales') {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [remoteStub], error: null }),
          }),
        }),
      };
    }
    return origFrom.call(supabase, table);
  };

  const csHistoryRes = await counterSaleService.getCounterSales({ branchId: subBranchId });
  console.log('Counter Sale Module (counterSaleService.getCounterSales) for subBranch count BEFORE fix:', csHistoryRes.data.length);

  // Test the fix logic directly
  const candidatePool = [remoteStub, localSale];
  const recordMap = new Map<string, any>();
  for (const item of candidatePool) {
    if (!item) continue;
    const idKey = item.id ? String(item.id).toLowerCase() : '';
    const invNum = (item.invoiceNumber || item.invoice_number) ? String(item.invoiceNumber || item.invoice_number).trim().toLowerCase() : '';
    const saleNum = (item.saleNumber || item.sale_number) ? String(item.saleNumber || item.sale_number).trim().toLowerCase() : '';

    let existingKey = '';
    if (idKey && recordMap.has(`id:${idKey}`)) existingKey = `id:${idKey}`;
    else if (invNum && recordMap.has(`inv:${invNum}`)) existingKey = `inv:${invNum}`;
    else if (saleNum && recordMap.has(`sale:${saleNum}`)) existingKey = `sale:${saleNum}`;

    if (existingKey) {
      const existing = recordMap.get(existingKey)!;
      const b = existing.branch_id || existing.branchId;
      const newB = item.branch_id || item.branchId;
      if (!b && newB) {
        existing.branch_id = newB;
        existing.branchId = newB;
      }
      if (!existing.notes && item.notes) {
        existing.notes = item.notes;
      } else if (item.notes && !existing.notes?.includes('[branch:') && item.notes.includes('[branch:')) {
        existing.notes = `${existing.notes || ''} ${item.notes}`.trim();
      }
      continue;
    }

    if (idKey) recordMap.set(`id:${idKey}`, item);
    if (invNum) recordMap.set(`inv:${invNum}`, item);
    if (saleNum) recordMap.set(`sale:${saleNum}`, item);
  }

  const uniqueRecords = Array.from(new Set(recordMap.values()));
  const filteredWithFix = uniqueRecords.filter((s: any) => {
    const bId = s.branchId || s.branch_id;
    const notes = s.notes || '';
    return isRecordInBranch(subBranchId, bId, notes);
  });
  console.log('Counter Sale Module with Enriched Deduplication count AFTER fix:', filteredWithFix.length);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
