import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { store } from '../src/services/store';
import { safeSaveTenantStorage, safeSaveTenantItem, clearTenantStorage } from '../src/services/supabase/safeStorage';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { resolveDateRange } from '../src/lib/dateRange';
import { Branch, Product } from '../src/types';
import { isRecordInBranch } from '../src/lib/branchUtils';

import { registerCurrentUserResolver } from '../src/lib/permissions';

async function main() {
  console.log('=== TESTING REPRODUCTION OF MISSING 5400 COUNTER SALE IN SUB-BRANCH ===');

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

  // Add catalog product and branch inventory
  const testProduct: Product = {
    id: 'prod-5400',
    workspaceId: wsId,
    name: 'Industrial Valve 5400',
    sku: 'VALVE-5400',
    unit: 'Pcs',
    buyPrice: 3000,
    sellingPrice: 5400,
    currentStock: 50,
    minStock: 5,
    taxPercent: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  safeSaveTenantStorage('vistaar_local_products_db', [testProduct]);
  store.setProducts([testProduct]);

  // Branch inventory for sub-branch
  const bInv = [
    {
      id: 'bi-sub-prod-5400',
      branchId: subBranchId,
      productId: testProduct.id,
      currentStock: 50,
      openingStock: 50,
      minStock: 5,
      status: 'Active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  safeSaveTenantStorage('vistaar_local_branch_inventory_db', bInv);

  // Create a counter sale worth 5400 in subBranch
  console.log('\n--- 1. CREATING COUNTER SALE OF 5400 IN SUB-BRANCH ---');
  const createRes = await counterSaleService.createCounterSale({
    branchId: subBranchId,
    customerName: 'Sub-branch Customer',
    saleDate: new Date().toISOString().split('T')[0],
    invoiceNumber: 'INV-SUB-5400',
    subtotal: 5400,
    discountAmount: 0,
    finalTotal: 5400,
    paymentMethod: 'Cash',
    amountReceived: 5400,
    balanceAmount: 0,
    items: [
      {
        productId: testProduct.id,
        quantity: 1,
        rate: 5400,
      },
    ],
  });

  console.log('Create result success:', createRes.success, 'saleId:', createRes.data?.id, 'branchId:', createRes.data?.branchId, 'error:', createRes.error);

  // Check 1: Dashboard KPI
  console.log('\n--- 2. CHECKING DASHBOARD KPIS FOR SUB-BRANCH ---');
  const dateRange = resolveDateRange('today');
  const kpis = await enterpriseAnalyticsService.getDashboardKpis(dateRange, true, subBranchId, wsId);
  console.log('Dashboard KPIs for subBranch:');
  console.log('  Total Sales:', kpis.totalSales);
  console.log('  Counter Sales:', kpis.counterSales);
  console.log('  Collections:', kpis.collections);

  // Check 2: CounterSaleService.getCounterSales
  console.log('\n--- 3. CHECKING COUNTER SALE SERVICE QUERY FOR SUB-BRANCH ---');
  const csRes = await counterSaleService.getCounterSales({ branchId: subBranchId });
  console.log('CounterSaleService returned count:', csRes.data.length);
  if (csRes.data.length > 0) {
    console.log('First sale:', csRes.data[0].saleNumber, csRes.data[0].finalTotal, csRes.data[0].branchId);
  } else {
    console.log('FAILED TO RETURN SALE!');
  }

  // Check 3: Check what happens if user switches or reloads
  console.log('\n--- 4. SIMULATING RELOAD / BRANCH SWITCH / CACHE RELOAD ---');
  store.reloadTenantState();

  const csResAfterReload = await counterSaleService.getCounterSales({ branchId: subBranchId });
  console.log('After reload, CounterSaleService returned count:', csResAfterReload.data.length);

  const kpisAfterReload = await enterpriseAnalyticsService.getDashboardKpis(dateRange, true, subBranchId, wsId);
  console.log('After reload, Dashboard counterSales:', kpisAfterReload.counterSales);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
