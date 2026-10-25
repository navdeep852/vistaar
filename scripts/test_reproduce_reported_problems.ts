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

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
    localStorage: globalThis.localStorage,
  };
}

import { store } from '../src/services/store';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { quotationService } from '../src/services/supabase/quotationService';
import { daybookService } from '../src/services/supabase/daybookService';
import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { resolveDateRange } from '../src/lib/dateRange';
import { registerCurrentUserResolver } from '../src/lib/permissions';
import { safeSaveTenantItem, safeSaveTenantStorage } from '../src/services/supabase/safeStorage';
import { Branch, Product } from '../src/types';

async function testReproduce() {
  console.log('====================================================');
  console.log('REPRODUCING REPORTED PROBLEMS A, B, AND C');
  console.log('====================================================\n');

  const wsId = 'a1111111-2222-4333-8444-555555555555';
  safeSaveTenantItem('active_company_id', wsId);
  localStorage.setItem('vistaar_current_company_id', wsId);

  const mockUser = { id: 'usr-1', email: 'owner@vistaar.com', role: 'owner', workspaceId: wsId };
  (supabaseAuthService as any).getCurrentCompanyId = () => wsId;
  (supabaseAuthService as any).getAuthoritativeWorkspaceId = async () => wsId;
  (supabaseAuthService as any).getUser = () => mockUser;
  (supabaseAuthService as any).isAuthenticated = () => true;

  registerCurrentUserResolver(() => ({
    id: 'usr-1',
    name: 'Owner',
    email: 'owner@vistaar.com',
    role: 'owner',
    status: 'Active',
    workspaceId: wsId,
    createdAt: new Date().toISOString(),
  } as any));

  const mainBranch: Branch = {
    id: 'b1111111-0000-4000-8000-000000000001',
    workspaceId: wsId,
    branchCode: 'MAIN',
    branchName: 'Main Branch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  safeSaveTenantStorage('vistaar_local_branches_db', [mainBranch]);
  (store as any).state.branches = [mainBranch];
  safeSaveTenantItem('main_branch_id', mainBranch.id);
  safeSaveTenantItem('active_branch_id', mainBranch.id);

  const sampleProduct: Product = {
    id: 'prod-1',
    workspaceId: wsId,
    name: 'Item 1',
    partNumber: 'ITM1',
    productCode: 'ITM1',
    sku: 'ITM1',
    category: 'General',
    unit: 'Pcs',
    currentStock: 100,
    openingStock: 100,
    minimumStock: 5,
    buyPrice: 10000,
    sellingPrice: 17700,
    currentBuyPrice: 10000,
    currentSellPrice: 17700,
    status: 'In Stock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  safeSaveTenantStorage('vistaar_local_products_db', [sampleProduct]);
  (store as any).state.products = [sampleProduct];

  const todayStr = new Date().toISOString().split('T')[0];

  // ---------------------------------------------------------------
  // PROBLEM A — REPRODUCTION 1: Invoice with Upfront Payment
  // ---------------------------------------------------------------
  console.log('--- TEST A1: Invoice Created with Upfront Payment ---');
  store.resetState();
  (store as any).state.branches = [mainBranch];
  (store as any).state.products = [sampleProduct];

  const invRes = await invoiceService.finalizeAuthoritativeInvoice({
    customerId: 'cust-1',
    customerName: 'Customer A1',
    customerPhone: '9876543210',
    date: todayStr,
    dueDate: todayStr,
    items: [{
      productId: 'prod-1',
      productName: 'Item 1',
      quantity: 1,
      sellingPrice: 17700,
      total: 17700,
      itemType: 'product'
    }],
    subtotal: 17700,
    grandTotal: 17700,
    paidAmount: 10700,
    paymentStatus: 'Partially Paid',
    paymentMode: 'Cash',
    paymentDate: todayStr,
    branchId: mainBranch.id,
  });

  console.log('Invoice created success:', invRes.success, 'Number:', invRes.invoiceNumber, 'Id:', invRes.invoiceId);

  // Check Daybook transactions
  const dbTxsA1 = await daybookService.getTransactions();
  console.log(`Daybook transactions returned: ${dbTxsA1.data.length}`);
  dbTxsA1.data.forEach((t) => {
    console.log(`  -> [${t.transactionType}] ref: ${t.referenceType} #${t.referenceNumber} | Inflow: ₹${t.amount} | Total: ₹${t.totalAmount} | Remaining: ₹${t.remainingAmount} | Status: ${t.paymentStatus}`);
  });

  const metricsA1 = await daybookService.getSummaryMetrics();
  console.log(`Daybook metrics: Inflow = ₹${metricsA1.totalInflow}, Outflow = ₹${metricsA1.totalOutflow}, Count = ${metricsA1.totalCount}`);
  if (metricsA1.totalInflow !== 10700) {
    console.error(`❌ BUG DETECTED: Daybook Inflow is ₹${metricsA1.totalInflow} instead of ₹10,700! Double counted!`);
  } else {
    console.log(`✅ Daybook Inflow is correctly ₹${metricsA1.totalInflow}`);
  }

  // ---------------------------------------------------------------
  // PROBLEM A — REPRODUCTION 2: Counter Sale
  // ---------------------------------------------------------------
  console.log('\n--- TEST A2: Counter Sale Recorded ---');
  const csRes = await counterSaleService.createCounterSale({
    customerId: 'cust-cs1',
    customerName: 'Walk-in Customer CS',
    saleDate: todayStr,
    branchId: mainBranch.id,
    items: [{
      productId: 'prod-1',
      productName: 'Item 1',
      quantity: 1,
      rate: 5000,
      amount: 5000,
    }],
    subtotal: 5000,
    finalTotal: 5000,
    amountReceived: 5000,
    balanceAmount: 0,
    status: 'COMPLETED',
    paymentMethod: 'UPI',
  });

  console.log('Counter sale created success:', csRes.success, 'Id:', csRes.saleId);
  const dbTxsA2 = await daybookService.getTransactions();
  console.log(`Total Daybook transactions now: ${dbTxsA2.data.length}`);
  dbTxsA2.data.forEach((t) => {
    console.log(`  -> [${t.transactionType}] ref: ${t.referenceType} #${t.referenceNumber} | Inflow: ₹${t.amount} | Total: ₹${t.totalAmount} | Remaining: ₹${t.remainingAmount}`);
  });

  const metricsA2 = await daybookService.getSummaryMetrics();
  console.log(`Daybook metrics after Counter Sale: Inflow = ₹${metricsA2.totalInflow}`);
  // Expected total inflow: 10700 (invoice) + 5000 (counter sale) = 15700
  if (metricsA2.totalInflow !== 15700) {
    console.error(`❌ BUG DETECTED: Daybook Inflow is ₹${metricsA2.totalInflow} instead of ₹15,700! Extra ₹${metricsA2.totalInflow - 15700}!`);
  }

  // ---------------------------------------------------------------
  // PROBLEM B — Quotation Conversion & Persistence
  // ---------------------------------------------------------------
  console.log('\n--- TEST B: Quotation Creation & Conversion ---');
  const qtRes = await quotationService.createQuotation({
    customerName: 'Quotation Customer B',
    customerPhone: '9876543210',
    date: todayStr,
    grandTotal: 25000,
    subtotal: 25000,
    branchId: mainBranch.id,
  }, [{
    id: 'item-b1',
    productName: 'Quotation Product',
    quantity: 1,
    sellingPrice: 25000,
    total: 25000,
    unit: 'Pcs',
    itemType: 'custom',
  }]);

  const targetQtId = qtRes.quotationId || store.getQuotations()[0]?.id;
  console.log('Quotation created:', qtRes.quotation?.quotationNumber || store.getQuotations()[0]?.quotationNumber, 'id:', targetQtId, 'error:', qtRes.error);
  console.log('Quotations in store after creation:', store.getQuotations().length);

  // Convert quotation to invoice
  const convRes = await quotationService.convertQuotationToInvoice({
    quotationId: targetQtId!,
    paymentStatus: 'Partially Paid',
    paidAmount: 15000,
    paymentMode: 'Bank Transfer',
    invoiceDate: todayStr,
  });

  console.log('Quotation converted success:', convRes.success, 'Invoice:', convRes.invoiceNumber, 'error:', convRes.error);

  const postConvQuotations = store.getQuotations();
  console.log('Quotations in store after conversion:', postConvQuotations.length);
  const convQt = postConvQuotations.find((q) => q.id === targetQtId);
  console.log('Converted quotation status in store:', convQt?.status, 'convertedInvoiceId:', convQt?.convertedInvoiceId);

  // Simulate QuotationsView mounting and calling reconcileConversions
  console.log('Simulating QuotationsView reconcileConversions...');
  await quotationService.reconcileConversions();

  const dbTxsAfterReconcile = await daybookService.getTransactions();
  console.log(`Daybook transactions after reconcileConversions: ${dbTxsAfterReconcile.data.length}`);
  dbTxsAfterReconcile.data.forEach((t) => {
    console.log(`  -> [${t.transactionType}] ref: ${t.referenceType} #${t.referenceNumber} | Inflow: ₹${t.amount} | Total: ₹${t.totalAmount} | Status: ${t.paymentStatus}`);
  });

  const metricsAfterReconcile = await daybookService.getSummaryMetrics();
  // Expected: 10700 (inv1) + 5000 (cs1) + 15000 (inv2 from qt) = 30700
  console.log(`Daybook metrics: Inflow = ₹${metricsAfterReconcile.totalInflow} (Expected: ₹30,700)`);
  if (metricsAfterReconcile.totalInflow !== 30700) {
    console.error(`❌ BUG DETECTED: Daybook Inflow is ₹${metricsAfterReconcile.totalInflow} instead of ₹30,700! Variance: +₹${metricsAfterReconcile.totalInflow - 30700}!`);
  }

  // ---------------------------------------------------------------
  // PROBLEM C — Dashboard KPIs Reconciliation
  // ---------------------------------------------------------------
  console.log('\n--- TEST C: Dashboard KPI Calculations ---');
  const dRange = resolveDateRange('today');
  const kpis = await enterpriseAnalyticsService.getDashboardKpis(dRange, true);
  console.log('Dashboard KPIs:', {
    totalSales: kpis.totalSales,
    invoiceSales: kpis.invoiceSales,
    counterSales: kpis.counterSales,
    collections: kpis.collections,
    outstandingUdhari: kpis.outstandingUdhari,
  });
  console.log('Expected: totalSales=47700, invoiceSales=42700, counterSales=5000, collections=30700, outstanding=17000');
  console.log(`Variance totalSales: ${kpis.totalSales - 47700}`);
  console.log(`Variance collections: ${kpis.collections - 30700}`);
  console.log(`Variance outstanding: ${kpis.outstandingUdhari - 17000}`);
}

testReproduce().catch(console.error);
