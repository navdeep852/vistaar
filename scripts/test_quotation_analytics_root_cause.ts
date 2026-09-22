/**
 * VISTAAR Business OS — Quotation Analytics Root Cause Automated Verification Suite
 */

// 1. Setup Node.js browser mocks for headless execution
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

if (typeof globalThis.sessionStorage === 'undefined') {
  const memStore = new Map<string, string>();
  globalThis.sessionStorage = {
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
    sessionStorage: globalThis.sessionStorage,
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
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { store } from '../src/services/store';
import { quotationService } from '../src/services/supabase/quotationService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { resolveDateRange, getIstTodayString } from '../src/lib/dateRange';

async function runQuotationAnalyticsVerification() {
  console.log('================================================================================');
  console.log('VISTAAR Business OS — QUOTATION ANALYTICS ROOT CAUSE VERIFICATION SUITE');
  console.log('================================================================================\n');

  const testWorkspaceId = '4f42a205-792d-4bdb-a9e5-be88cbed331a';
  localStorage.setItem('vistaar_current_company_id', testWorkspaceId);
  supabaseAuthService.setAuthoritativeWorkspaceId(testWorkspaceId);

  const todayStr = getIstTodayString();
  const dateRangeToday = resolveDateRange('today');
  const dateRangeWeek = resolveDateRange('week');
  const dateRangeMonth = resolveDateRange('month');

  // Reset store for fresh test
  store.resetState();

  // -------------------------------------------------------------------------
  // INITIAL STATE
  // -------------------------------------------------------------------------
  console.log('[Test 0] Verify Initial Empty Analytics State');
  let analytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRangeToday);
  console.log('  Initial total quotations:', analytics.quotationFunnel.totalQuotations);
  console.log('  Initial converted count:', analytics.quotationFunnel.convertedCount);
  console.log('  Initial conversion rate %:', analytics.quotationFunnel.conversionRatePercent);
  if (analytics.quotationFunnel.totalQuotations !== 0 || analytics.quotationFunnel.convertedCount !== 0) {
    throw new Error('Initial state was not empty.');
  }
  console.log('  ✓ Initial empty state verified.\n');

  // -------------------------------------------------------------------------
  // TEST 1: Create Quotation A (₹10,000) & Convert to Invoice
  // -------------------------------------------------------------------------
  console.log('[Test 1] Create Quotation A (₹10,000) & Convert to Invoice');
  const qtA = store.addQuotation({
    customerName: 'Alpha Enterprises',
    customerPhone: '9876543210',
    status: 'Sent',
    date: todayStr,
    validUntil: todayStr,
    items: [
      {
        id: 'item-1',
        productName: 'Industrial Widget X',
        quantity: 1,
        sellingPrice: 10000,
        buyPrice: 6000,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 1800,
        total: 10000,
        unit: 'Pcs',
      },
    ],
    subtotal: 8200,
    discountTotal: 0,
    taxTotal: 1800,
    grandTotal: 10000,
    templateId: 'qt-modern-blue',
  });
  console.log(`  Created Quotation: ${qtA.quotationNumber} (Status: ${qtA.status}, Total: ₹${qtA.grandTotal})`);

  // Convert Quotation A to Invoice
  const invA = store.convertQuotationToInvoice(qtA.id, {
    paymentStatus: 'Fully Paid',
    paidAmount: 10000,
    invoiceDate: todayStr,
  });
  console.log(`  Converted to Invoice: ${invA?.invoiceNumber} (Status: ${qtA.status}, Converted Invoice: ${qtA.convertedInvoiceId})`);

  if (qtA.status !== 'Converted') {
    throw new Error(`Expected Quotation A status to be 'Converted', got ${qtA.status}`);
  }
  if (!qtA.convertedInvoiceId) {
    throw new Error('Expected Quotation A to have convertedInvoiceId');
  }

  // Evaluate Analytics
  analytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRangeToday);
  console.log('  Analytics Output:');
  console.log('    Total quotations:', analytics.quotationFunnel.totalQuotations);
  console.log('    Converted count:', analytics.quotationFunnel.convertedCount);
  console.log('    Conversion rate %:', analytics.quotationFunnel.conversionRatePercent);
  console.log('    Realized billed value ₹:', analytics.quotationFunnel.convertedValue);
  console.log('    Created stage value ₹:', analytics.quotationFunnel.stages.find(s => s.stage === 'Created')?.value);

  if (analytics.quotationFunnel.totalQuotations !== 1) {
    throw new Error(`Expected totalQuotations 1, got ${analytics.quotationFunnel.totalQuotations}`);
  }
  if (analytics.quotationFunnel.convertedCount !== 1) {
    throw new Error(`Expected convertedCount 1, got ${analytics.quotationFunnel.convertedCount}`);
  }
  if (analytics.quotationFunnel.conversionRatePercent !== 100) {
    throw new Error(`Expected conversionRatePercent 100%, got ${analytics.quotationFunnel.conversionRatePercent}%`);
  }
  if (analytics.quotationFunnel.convertedValue !== 10000) {
    throw new Error(`Expected convertedValue 10000, got ${analytics.quotationFunnel.convertedValue}`);
  }
  console.log('  ✓ Test 1 Passed: Converted Quotation A correctly reflected in Analytics.\n');

  // -------------------------------------------------------------------------
  // TEST 2: Create Quotation B (₹20,000) & Convert to Invoice
  // -------------------------------------------------------------------------
  console.log('[Test 2] Create Quotation B (₹20,000) & Convert to Invoice');
  const qtB = store.addQuotation({
    customerName: 'Beta Logistics',
    customerPhone: '9876543211',
    status: 'Sent',
    date: todayStr,
    validUntil: todayStr,
    items: [
      {
        id: 'item-2',
        productName: 'Commercial Inverter',
        quantity: 1,
        sellingPrice: 20000,
        buyPrice: 14000,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 3600,
        total: 20000,
        unit: 'Pcs',
      },
    ],
    subtotal: 16400,
    discountTotal: 0,
    taxTotal: 3600,
    grandTotal: 20000,
    templateId: 'qt-modern-blue',
  });
  console.log(`  Created Quotation: ${qtB.quotationNumber} (Total: ₹${qtB.grandTotal})`);

  store.convertQuotationToInvoice(qtB.id, {
    paymentStatus: 'Unpaid',
    invoiceDate: todayStr,
  });
  console.log(`  Converted Quotation B (Status: ${qtB.status})`);

  analytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRangeToday);
  console.log('  Analytics Output:');
  console.log('    Total quotations:', analytics.quotationFunnel.totalQuotations);
  console.log('    Converted count:', analytics.quotationFunnel.convertedCount);
  console.log('    Conversion rate %:', analytics.quotationFunnel.conversionRatePercent);
  console.log('    Realized billed value ₹:', analytics.quotationFunnel.convertedValue);

  if (analytics.quotationFunnel.totalQuotations !== 2) {
    throw new Error(`Expected totalQuotations 2, got ${analytics.quotationFunnel.totalQuotations}`);
  }
  if (analytics.quotationFunnel.convertedCount !== 2) {
    throw new Error(`Expected convertedCount 2, got ${analytics.quotationFunnel.convertedCount}`);
  }
  if (analytics.quotationFunnel.conversionRatePercent !== 100) {
    throw new Error(`Expected conversionRatePercent 100%, got ${analytics.quotationFunnel.conversionRatePercent}%`);
  }
  if (analytics.quotationFunnel.convertedValue !== 30000) {
    throw new Error(`Expected convertedValue 30000, got ${analytics.quotationFunnel.convertedValue}`);
  }
  console.log('  ✓ Test 2 Passed: Converted count = 2 accurately calculated.\n');

  // -------------------------------------------------------------------------
  // TEST 3: Create Quotation C (₹15,000) — Do NOT Convert (Remain Open/Pending)
  // -------------------------------------------------------------------------
  console.log('[Test 3] Create Quotation C (₹15,000) — Do NOT Convert (Remain Open)');
  const qtC = store.addQuotation({
    customerName: 'Gamma Wholesale',
    customerPhone: '9876543212',
    status: 'Sent',
    date: todayStr,
    validUntil: todayStr,
    items: [
      {
        id: 'item-3',
        productName: 'Thermal Barcode Printer',
        quantity: 1,
        sellingPrice: 15000,
        buyPrice: 10000,
        discountAmount: 0,
        taxPercent: 18,
        taxAmount: 2700,
        total: 15000,
        unit: 'Pcs',
      },
    ],
    subtotal: 12300,
    discountTotal: 0,
    taxTotal: 2700,
    grandTotal: 15000,
    templateId: 'qt-modern-blue',
  });
  console.log(`  Created Quotation: ${qtC.quotationNumber} (Status: ${qtC.status}, Total: ₹${qtC.grandTotal})`);

  analytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRangeToday);
  console.log('  Analytics Output:');
  console.log('    Total quotations:', analytics.quotationFunnel.totalQuotations);
  console.log('    Converted count:', analytics.quotationFunnel.convertedCount);
  console.log('    Conversion rate %:', analytics.quotationFunnel.conversionRatePercent);
  console.log('    Stages breakdown:');
  analytics.quotationFunnel.stages.forEach(st => {
    console.log(`      - ${st.stage}: count = ${st.count}, value = ₹${st.value}, % = ${st.percentage}%`);
  });

  if (analytics.quotationFunnel.totalQuotations !== 3) {
    throw new Error(`Expected totalQuotations 3, got ${analytics.quotationFunnel.totalQuotations}`);
  }
  if (analytics.quotationFunnel.convertedCount !== 2) {
    throw new Error(`Expected convertedCount 2, got ${analytics.quotationFunnel.convertedCount}`);
  }
  if (analytics.quotationFunnel.conversionRatePercent !== 66.7) {
    throw new Error(`Expected conversionRatePercent 66.7%, got ${analytics.quotationFunnel.conversionRatePercent}%`);
  }
  console.log('  ✓ Test 3 Passed: Total = 3, Converted = 2, Open = 1, Rate = 66.7%.\n');

  // -------------------------------------------------------------------------
  // TEST 4: Independent Invoices must NOT be counted as Quotation Conversions
  // -------------------------------------------------------------------------
  console.log('[Test 4] Independent Invoice created directly (not from quotation)');
  store.addInvoice({
    customerName: 'Direct Walk-in Customer',
    customerPhone: '9998887776',
    status: 'Paid',
    date: todayStr,
    dueDate: todayStr,
    items: [],
    subtotal: 5000,
    discountTotal: 0,
    taxTotal: 900,
    grandTotal: 5900,
    paidAmount: 5900,
    balanceAmount: 0,
    templateId: 'inv-modern-blue',
  });

  analytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRangeToday);
  console.log('  Post Independent Invoice Analytics:');
  console.log('    Total quotations:', analytics.quotationFunnel.totalQuotations);
  console.log('    Converted count:', analytics.quotationFunnel.convertedCount);
  if (analytics.quotationFunnel.totalQuotations !== 3 || analytics.quotationFunnel.convertedCount !== 2) {
    throw new Error('Independent invoice was falsely counted towards quotation analytics!');
  }
  console.log('  ✓ Test 4 Passed: Independent invoice not counted as quotation conversion.\n');

  // -------------------------------------------------------------------------
  // TEST 5: State Reconciliation / Page Reload Simulation
  // -------------------------------------------------------------------------
  console.log('[Test 5] Page Reload / State Reconciliation Simulation');
  store.reconcileStateLedgers(store.getState());
  analytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRangeToday);
  if (analytics.quotationFunnel.totalQuotations !== 3 || analytics.quotationFunnel.convertedCount !== 2) {
    throw new Error('Quotation analytics corrupted after ledger reconciliation!');
  }
  console.log('  ✓ Test 5 Passed: Data survives reconciliation / page reload.\n');

  // -------------------------------------------------------------------------
  // TEST 6: Date Filter Switches (Today, Week, Month)
  // -------------------------------------------------------------------------
  console.log('[Test 6] Date Filter Recalculation');
  const weekAnalytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRangeWeek);
  console.log(`  This Week: Total = ${weekAnalytics.quotationFunnel.totalQuotations}, Converted = ${weekAnalytics.quotationFunnel.convertedCount}`);
  if (weekAnalytics.quotationFunnel.totalQuotations !== 3 || weekAnalytics.quotationFunnel.convertedCount !== 2) {
    throw new Error('Week date filter failed to include today\'s quotations!');
  }

  const monthAnalytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRangeMonth);
  console.log(`  This Month: Total = ${monthAnalytics.quotationFunnel.totalQuotations}, Converted = ${monthAnalytics.quotationFunnel.convertedCount}`);
  if (monthAnalytics.quotationFunnel.totalQuotations !== 3 || monthAnalytics.quotationFunnel.convertedCount !== 2) {
    throw new Error('Month date filter failed to include today\'s quotations!');
  }
  console.log('  ✓ Test 6 Passed: Date filter switches recalculate correctly.\n');

  // -------------------------------------------------------------------------
  // TEST 7: Open Quotations Count vs Total vs Converted Isolation
  // -------------------------------------------------------------------------
  console.log('[Test 7] Verify getOpenQuotationsCountAsOf Isolation');
  const openRes = await quotationService.getOpenQuotationsCountAsOf(todayStr);
  console.log(`  Open quotations count: ${openRes.count} (Expected: 1)`);
  if (openRes.count !== 1) {
    throw new Error(`Expected 1 open quotation, got ${openRes.count}`);
  }
  console.log('  ✓ Test 7 Passed: Open quotations (1) cleanly distinguished from Converted (2) and Total (3).\n');

  console.log('================================================================================');
  console.log('ALL 7 REGRESSION & ROOT CAUSE ACCEPTANCE TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================================\n');
}

runQuotationAnalyticsVerification().catch((err) => {
  console.error('\nFAILED TEST RUN:', err);
  process.exit(1);
});
