import assert from 'assert';
import { resolveDateRange } from '../src/lib/dateRange';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { store } from '../src/services/store';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { safeSaveTenantStorage } from '../src/services/supabase/safeStorage';

// Mock authoritative workspace resolution for Node testing environment
(enterpriseAnalyticsService as any).getWorkspaceId = async () => '11111111-1111-1111-1111-111111111111';
(salesAnalyticsService as any).getWorkspaceId = async () => '11111111-1111-1111-1111-111111111111';
(supabaseAuthService as any).authoritativeWorkspaceId = '11111111-1111-1111-1111-111111111111';
(supabaseAuthService as any).currentProfile = {
  id: '22222222-2222-2222-2222-222222222222',
  companyId: '11111111-1111-1111-1111-111111111111',
  name: 'Test Owner',
  email: 'test@example.com',
  role: 'Owner',
};
supabaseAuthService.getAuthoritativeWorkspaceId = async () => '11111111-1111-1111-1111-111111111111';
supabaseAuthService.getCurrentCompanyId = () => '11111111-1111-1111-1111-111111111111';

console.log('--- STARTING COLLECTIONS KPI CASH & UPI TRACTION VERIFICATION ---');

function resetStore() {
  safeSaveTenantStorage('vistaar_local_invoices_db', []);
  safeSaveTenantStorage('vistaar_local_sales_db', []);
  safeSaveTenantStorage('vistaar_local_payments_db', []);
  safeSaveTenantStorage('vistaar_local_daybook_db', []);
  safeSaveTenantStorage('vistaar_local_udhari_db', []);
  safeSaveTenantStorage('vistaar_local_udhari_payments_db', []);
  (store as any).state = {
    settings: {
      businessName: 'Test Corp',
      logoUrl: '',
      logoAlignment: 'left',
      logoScale: 1,
      signatureUrl: '',
      signatureAlignment: 'right',
      signatureScale: 1,
      stampUrl: '',
      stampAlignment: 'left',
      stampScale: 1,
      brandColor: '#2563eb',
      bankDetails: {
        bankName: '',
        accountHolder: '',
        accountNo: '',
        ifscCode: '',
        branch: '',
        upiId: '',
      },
    },
    customers: [],
    products: [
      { id: 'P1', name: 'Item', currentStock: 1000, minStock: 5, price: 10000, category: 'General' },
      { id: 'P2', name: 'Item 2', currentStock: 1000, minStock: 5, price: 10000, category: 'General' },
      { id: 'P3', name: 'Item 3', currentStock: 1000, minStock: 5, price: 5000, category: 'General' },
      { id: 'P4', name: 'Item 4', currentStock: 1000, minStock: 5, price: 8000, category: 'General' },
      { id: 'P5', name: 'Item 5', currentStock: 1000, minStock: 5, price: 2000, category: 'General' },
      { id: 'P6', name: 'Item 6', currentStock: 1000, minStock: 5, price: 4000, category: 'General' },
    ],
    categories: [],
    suppliers: [],
    inventoryTransactions: [],
    quotations: [],
    invoices: [],
    payments: [],
    expenses: [],
    followUps: [],
    feedbacks: [],
    offers: [],
    notifications: [],
    businessSettings: {
      companyName: 'Test Corp',
      address: '',
      phone: '',
      email: '',
      gstin: '',
      bankDetails: {
        bankName: '',
        accountNumber: '',
        ifscCode: '',
        branch: '',
        upiId: '',
      },
      defaultPaymentTerms: 'Net 15',
      termsAndConditions: '',
      defaultInvoiceTerms: '',
      brandingConfig: { logoUrl: '', signatureUrl: '', primaryColor: '#2563eb' },
    },
    stockReceipts: [],
    stockMovements: [],
    inventorySettings: {
      enableLowStockAlerts: true,
      lowStockThreshold: 5,
      allowNegativeStock: true,
    },
    counterSales: [],
    udharis: [],
    udhariPayments: [],
  };
  (store as any).saveToStorage();
}

async function runTests() {
  const todayRange = resolveDateRange('today');
  const yesterdayRange = resolveDateRange('yesterday');
  const todayStr = todayRange.startDateStr;
  const yesterdayStr = yesterdayRange.startDateStr;

  // =========================================================================
  // TEST 1: Cash-only payment
  // =========================================================================
  resetStore();
  (store as any).state.payments.push({
    id: 'pay-001',
    paymentNumber: 'PAY-001',
    amount: 1500,
    method: 'Cash',
    date: todayStr,
    customerName: 'Customer A',
    createdAt: new Date().toISOString(),
  });
  (store as any).saveToStorage();

  let data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 1 (Cash-only):', data.kpis);
  assert.strictEqual(data.kpis.cashCollections, 1500, 'Test 1: Cash should be 1500');
  assert.strictEqual(data.kpis.upiCollections, 0, 'Test 1: UPI should be 0');
  assert.strictEqual(data.kpis.collections, 1500, 'Test 1: Total should be 1500');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 1: Cash + UPI === Collections');

  // =========================================================================
  // TEST 2: UPI-only payment
  // =========================================================================
  resetStore();
  (store as any).state.payments.push({
    id: 'pay-002',
    paymentNumber: 'PAY-002',
    amount: 2500,
    method: 'UPI',
    date: todayStr,
    customerName: 'Customer B',
    createdAt: new Date().toISOString(),
  });

  data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 2 (UPI-only):', data.kpis);
  assert.strictEqual(data.kpis.cashCollections, 0, 'Test 2: Cash should be 0');
  assert.strictEqual(data.kpis.upiCollections, 2500, 'Test 2: UPI should be 2500');
  assert.strictEqual(data.kpis.collections, 2500, 'Test 2: Total should be 2500');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 2: Cash + UPI === Collections');

  // =========================================================================
  // TEST 3: Multiple Cash payments
  // =========================================================================
  resetStore();
  (store as any).state.payments.push({
    id: 'pay-003',
    paymentNumber: 'PAY-003',
    amount: 1200,
    method: 'Cash',
    date: todayStr,
    customerName: 'Customer 1',
    createdAt: new Date().toISOString(),
  });
  (store as any).state.payments.push({
    id: 'pay-004',
    paymentNumber: 'PAY-004',
    amount: 1800,
    method: 'Cash',
    date: todayStr,
    customerName: 'Customer 2',
    createdAt: new Date().toISOString(),
  });

  data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 3 (Multiple Cash):', data.kpis);
  assert.strictEqual(data.kpis.cashCollections, 3000, 'Test 3: Cash should be 3000');
  assert.strictEqual(data.kpis.upiCollections, 0, 'Test 3: UPI should be 0');
  assert.strictEqual(data.kpis.collections, 3000, 'Test 3: Total should be 3000');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 3: Cash + UPI === Collections');

  // =========================================================================
  // TEST 4: Multiple UPI payments
  // =========================================================================
  resetStore();
  (store as any).state.payments.push({
    id: 'pay-005',
    paymentNumber: 'PAY-005',
    amount: 3400,
    method: 'UPI',
    date: todayStr,
    customerName: 'Customer 3',
    createdAt: new Date().toISOString(),
  });
  (store as any).state.payments.push({
    id: 'pay-006',
    paymentNumber: 'PAY-006',
    amount: 1600,
    method: 'Bank Transfer',
    date: todayStr,
    customerName: 'Customer 4',
    createdAt: new Date().toISOString(),
  });

  data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 4 (Multiple UPI/Bank):', data.kpis);
  assert.strictEqual(data.kpis.cashCollections, 0, 'Test 4: Cash should be 0');
  assert.strictEqual(data.kpis.upiCollections, 5000, 'Test 4: UPI should be 5000');
  assert.strictEqual(data.kpis.collections, 5000, 'Test 4: Total should be 5000');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 4: Cash + UPI === Collections');

  // =========================================================================
  // TEST 5: Partial Cash payment on invoice
  // =========================================================================
  resetStore();
  store.addInvoice({
    customerName: 'Partial Cash Cust',
    customerId: 'CUST-001',
    customerPhone: '9876543210',
    date: todayStr,
    dueDate: todayStr,
    items: [{ productId: 'P1', productName: 'Item', quantity: 1, sellingPrice: 10000, amount: 10000, taxRate: 0, taxAmount: 0 }],
    status: 'Partially Paid',
    paymentStatus: 'Partially Paid',
    paidAmount: 3000,
    paymentMethod: 'Cash',
  } as any);

  data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 5 (Partial Cash):', data.kpis);
  assert.strictEqual(data.kpis.cashCollections, 3000, 'Test 5: Cash should be 3000');
  assert.strictEqual(data.kpis.upiCollections, 0, 'Test 5: UPI should be 0');
  assert.strictEqual(data.kpis.collections, 3000, 'Test 5: Total should be 3000');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 5: Cash + UPI === Collections');

  // =========================================================================
  // TEST 6: Partial UPI payment on invoice
  // =========================================================================
  resetStore();
  store.addInvoice({
    customerName: 'Partial UPI Cust',
    customerId: 'CUST-002',
    customerPhone: '9876543210',
    date: todayStr,
    dueDate: todayStr,
    items: [{ productId: 'P2', productName: 'Item 2', quantity: 1, sellingPrice: 10000, amount: 10000, taxRate: 0, taxAmount: 0 }],
    status: 'Partially Paid',
    paymentStatus: 'Partially Paid',
    paidAmount: 4500,
    paymentMethod: 'UPI',
  } as any);

  data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 6 (Partial UPI):', data.kpis);
  assert.strictEqual(data.kpis.cashCollections, 0, 'Test 6: Cash should be 0');
  assert.strictEqual(data.kpis.upiCollections, 4500, 'Test 6: UPI should be 4500');
  assert.strictEqual(data.kpis.collections, 4500, 'Test 6: Total should be 4500');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 6: Cash + UPI === Collections');

  // =========================================================================
  // TEST 7: Split payment between Cash and UPI
  // =========================================================================
  resetStore();
  (store as any).state.payments.push({
    id: 'pay-split',
    paymentNumber: 'PAY-SPLIT',
    amount: 10000,
    method: 'Cash',
    cash_amount: 4000,
    upi_amount: 6000,
    date: todayStr,
    customerName: 'Split Cust',
    createdAt: new Date().toISOString(),
  });

  data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 7 (Split payment):', data.kpis);
  assert.strictEqual(data.kpis.cashCollections, 4000, 'Test 7: Cash should be 4000');
  assert.strictEqual(data.kpis.upiCollections, 6000, 'Test 7: UPI should be 6000');
  assert.strictEqual(data.kpis.collections, 10000, 'Test 7: Total should be 10000');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 7: Cash + UPI === Collections');

  // =========================================================================
  // TEST 8: Unpaid invoice (Must NOT be included in Collections)
  // =========================================================================
  resetStore();
  store.addInvoice({
    customerName: 'Unpaid Customer',
    customerId: 'CUST-003',
    customerPhone: '9876543210',
    date: todayStr,
    dueDate: todayStr,
    items: [{ productId: 'P3', productName: 'Item 3', quantity: 1, sellingPrice: 5000, amount: 5000, taxRate: 0, taxAmount: 0 }],
    status: 'Issued',
    paymentStatus: 'Unpaid',
    paidAmount: 0,
    paymentMethod: 'Cash',
  } as any);

  data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 8 (Unpaid Invoice):', data.kpis);
  assert.strictEqual(data.kpis.totalSales, 5000, 'Test 8: Sales should be 5000');
  assert.strictEqual(data.kpis.cashCollections, 0, 'Test 8: Cash should be 0');
  assert.strictEqual(data.kpis.upiCollections, 0, 'Test 8: UPI should be 0');
  assert.strictEqual(data.kpis.collections, 0, 'Test 8: Collections should be 0');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 8: Cash + UPI === Collections');

  // =========================================================================
  // TEST 9: Later Udhari / payment collection
  // Invoice was created yesterday unpaid, cleared today via UPI
  // =========================================================================
  resetStore();
  const yesterdayInv = store.addInvoice({
    customerName: 'Old Udhari Cust',
    customerId: 'CUST-004',
    customerPhone: '9876543210',
    date: yesterdayStr,
    dueDate: yesterdayStr,
    items: [{ productId: 'P4', productName: 'Item 4', quantity: 1, sellingPrice: 8000, amount: 8000, taxRate: 0, taxAmount: 0 }],
    status: 'Issued',
    paymentStatus: 'Unpaid',
    paidAmount: 0,
  } as any);

  // Today, customer pays ₹5,000 via UPI towards this invoice
  store.recordUnifiedCustomerPayment({
    invoiceId: yesterdayInv.id,
    invoiceNumber: yesterdayInv.invoiceNumber,
    customerId: 'CUST-004',
    customerName: 'Old Udhari Cust',
    amount: 5000,
    paymentMethod: 'UPI',
    paymentDate: todayStr,
  });

  // Query Today: Collections should be 5,000 UPI, Sales should be 0
  const todayData = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 9 (Later Udhari - Today):', todayData.kpis);
  assert.strictEqual(todayData.kpis.totalSales, 0, 'Test 9: Today sales should be 0');
  assert.strictEqual(todayData.kpis.cashCollections, 0, 'Test 9: Today cash should be 0');
  assert.strictEqual(todayData.kpis.upiCollections, 5000, 'Test 9: Today UPI should be 5000');
  assert.strictEqual(todayData.kpis.collections, 5000, 'Test 9: Today Collections should be 5000');

  // Query Yesterday: Sales was 8,000, Collections should be 0
  const yesterdayData = await enterpriseAnalyticsService.getAnalyticsOverview(yesterdayRange, true);
  console.log('Test 9 (Later Udhari - Yesterday):', yesterdayData.kpis);
  assert.strictEqual(yesterdayData.kpis.totalSales, 8000, 'Test 9: Yesterday sales should be 8000');
  assert.strictEqual(yesterdayData.kpis.collections, 0, 'Test 9: Yesterday collections should be 0');

  // =========================================================================
  // TEST 10: Counter Sale with Cash
  // =========================================================================
  resetStore();
  (store as any).state.counterSales.push({
    id: 'cs-001',
    saleNumber: 'CS-001',
    customerName: 'Walk-in',
    saleDate: todayStr,
    finalTotal: 1250,
    amountReceived: 1250,
    balanceAmount: 0,
    paymentMethod: 'Cash',
    status: 'COMPLETED',
  });

  data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 10 (Counter Sale Cash):', data.kpis);
  assert.strictEqual(data.kpis.cashCollections, 1250, 'Test 10: Cash should be 1250');
  assert.strictEqual(data.kpis.upiCollections, 0, 'Test 10: UPI should be 0');
  assert.strictEqual(data.kpis.collections, 1250, 'Test 10: Total should be 1250');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 10: Cash + UPI === Collections');

  // =========================================================================
  // TEST 11: Counter Sale with UPI
  // =========================================================================
  resetStore();
  (store as any).state.counterSales.push({
    id: 'cs-002',
    saleNumber: 'CS-002',
    customerName: 'Walk-in UPI',
    saleDate: todayStr,
    finalTotal: 2750,
    amountReceived: 2750,
    balanceAmount: 0,
    paymentMethod: 'UPI',
    status: 'COMPLETED',
  });

  data = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 11 (Counter Sale UPI):', data.kpis);
  assert.strictEqual(data.kpis.cashCollections, 0, 'Test 11: Cash should be 0');
  assert.strictEqual(data.kpis.upiCollections, 2750, 'Test 11: UPI should be 2750');
  assert.strictEqual(data.kpis.collections, 2750, 'Test 11: Total should be 2750');
  assert.strictEqual(data.kpis.cashCollections + data.kpis.upiCollections, data.kpis.collections, 'Test 11: Cash + UPI === Collections');

  // =========================================================================
  // TEST 12: Date-filtered combined collections (Cash + UPI + Counter Sales)
  // =========================================================================
  resetStore();
  // Today items:
  // 1. Invoice with ₹2,000 cash payment
  store.addInvoice({
    customerName: 'Today Cust 1',
    date: todayStr,
    items: [{ productId: 'P5', productName: 'Item 5', quantity: 1, sellingPrice: 2000, amount: 2000, taxRate: 0, taxAmount: 0 }],
    status: 'Paid',
    paidAmount: 2000,
    paymentMethod: 'Cash',
  } as any);

  // 2. Counter sale with ₹3,500 UPI payment
  (store as any).state.counterSales.push({
    id: 'cs-today',
    saleNumber: 'CS-TODAY',
    customerName: 'Walk-in Today',
    saleDate: todayStr,
    finalTotal: 3500,
    amountReceived: 3500,
    balanceAmount: 0,
    paymentMethod: 'UPI',
    status: 'COMPLETED',
  });

  // Yesterday items (should NOT appear in Today filter):
  // 3. Yesterday invoice with ₹4,000 Cash
  store.addInvoice({
    customerName: 'Yest Cust',
    date: yesterdayStr,
    items: [{ productId: 'P6', productName: 'Item 6', quantity: 1, sellingPrice: 4000, amount: 4000, taxRate: 0, taxAmount: 0 }],
    status: 'Paid',
    paidAmount: 4000,
    paymentMethod: 'Cash',
  } as any);

  // Query Today:
  const tData = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange, true);
  console.log('Test 12 (Today Combined):', tData.kpis);
  assert.strictEqual(tData.kpis.cashCollections, 2000, 'Test 12 Today: Cash should be 2000');
  assert.strictEqual(tData.kpis.upiCollections, 3500, 'Test 12 Today: UPI should be 3500');
  assert.strictEqual(tData.kpis.collections, 5500, 'Test 12 Today: Collections should be 5500');
  assert.strictEqual(tData.kpis.cashCollections + tData.kpis.upiCollections, tData.kpis.collections, 'Test 12 Today: Cash + UPI === Collections');

  // Query Yesterday:
  const yData = await enterpriseAnalyticsService.getAnalyticsOverview(yesterdayRange, true);
  console.log('Test 12 (Yesterday Combined):', yData.kpis);
  assert.strictEqual(yData.kpis.cashCollections, 4000, 'Test 12 Yesterday: Cash should be 4000');
  assert.strictEqual(yData.kpis.upiCollections, 0, 'Test 12 Yesterday: UPI should be 0');
  assert.strictEqual(yData.kpis.collections, 4000, 'Test 12 Yesterday: Collections should be 4000');
  assert.strictEqual(yData.kpis.cashCollections + yData.kpis.upiCollections, yData.kpis.collections, 'Test 12 Yesterday: Cash + UPI === Collections');

  // Query This Month:
  const monthRange = resolveDateRange('month');
  const mData = await enterpriseAnalyticsService.getAnalyticsOverview(monthRange, true);
  console.log('Test 12 (Month Combined):', mData.kpis);
  assert.strictEqual(mData.kpis.cashCollections, 6000, 'Test 12 Month: Cash should be 6000 (2000 today + 4000 yesterday)');
  assert.strictEqual(mData.kpis.upiCollections, 3500, 'Test 12 Month: UPI should be 3500');
  assert.strictEqual(mData.kpis.collections, 9500, 'Test 12 Month: Collections should be 9500');
  assert.strictEqual(mData.kpis.cashCollections + mData.kpis.upiCollections, mData.kpis.collections, 'Test 12 Month: Cash + UPI === Collections');

  console.log('==================================================================');
  console.log('ALL 12 TESTS PASSED! CASH + UPI === TOTAL COLLECTIONS IN ALL CASES');
  console.log('==================================================================');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
