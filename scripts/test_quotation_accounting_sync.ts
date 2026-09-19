/**
 * VISTAAR Business OS — Quotation-to-Invoice Accounting Synchronization Regression Test Suite
 * 
 * Verifies all 7 required regression scenarios:
 * TEST A: Manual fully paid invoice (₹15,750)
 * TEST B: Quotation converted to fully paid invoice (₹15,750)
 * TEST C: Quotation converted to partially paid invoice (₹10,000 total, ₹6,000 paid, ₹4,000 remaining)
 * TEST D: Quotation converted to unpaid invoice (₹10,000 total, ₹0 paid, ₹10,000 remaining)
 * TEST E: Duplicate conversion retry idempotency
 * TEST F: Existing customer and new/walk-in customer data preservation
 * TEST G: Workspace isolation
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
import { invoiceService } from '../src/services/supabase/invoiceService';
import { quotationService } from '../src/services/supabase/quotationService';
import { daybookService } from '../src/services/supabase/daybookService';
import { cashbookService } from '../src/services/supabase/cashbookService';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { resolveDateRange } from '../src/lib/dateRange';

async function runRegressionTestSuite() {
  console.log('================================================================================');
  console.log('VISTAAR Business OS — QUOTATION-TO-INVOICE ACCOUNTING SYNCHRONIZATION TEST SUITE');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;
  const results: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

  function assert(condition: boolean, testName: string, detail: string) {
    if (condition) {
      passed++;
      results.push({ test: testName, status: 'PASS', details: detail });
      console.log(`[PASS  ] ${testName.padEnd(60)} | ${detail}`);
    } else {
      failed++;
      results.push({ test: testName, status: 'FAIL', details: detail });
      console.error(`[FAIL ❌] ${testName.padEnd(60)} | ${detail}`);
    }
  }

  const testWorkspaceId = '4f42a205-792d-4bdb-a9e5-be88cbed331a';
  const otherWorkspaceId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
  const today = new Date().toISOString().split('T')[0];

  // Set workspace in storage and auth service
  localStorage.setItem('vistaar_current_company_id', testWorkspaceId);
  supabaseAuthService.setAuthoritativeWorkspaceId(testWorkspaceId);

  // Clean in-memory store for predictable assertions
  store.getInvoices().length = 0;
  store.getQuotations().length = 0;
  store.getUdharis().length = 0;
  store.getPayments().length = 0;

  console.log('--- TEST A: MANUAL FULLY PAID INVOICE (₹15,750) ---');
  {
    const invRes = await invoiceService.finalizeAuthoritativeInvoice({
      source: 'MANUAL',
      customerName: 'Aarav Sharma',
      customerPhone: '9876543210',
      items: [{
        productName: 'Heavy Duty Drill',
        quantity: 1,
        sellingPrice: 15750,
        total: 15750,
        taxPercent: 0,
        taxAmount: 0,
        discountAmount: 0,
      }],
      grandTotal: 15750,
      paymentStatus: 'Fully Paid',
      paidAmount: 15750,
      paymentMode: 'UPI',
      date: today,
    });

    assert(invRes.success === true, 'TEST A.1 — Manual Invoice Created', `Invoice #${invRes.invoiceNumber} created`);
    assert(invRes.paidAmount === 15750, 'TEST A.2 — Paid Amount Authoritative', `Paid: ₹${invRes.paidAmount}`);
    assert(invRes.balanceAmount === 0, 'TEST A.3 — Remaining Amount Zero', `Balance: ₹${invRes.balanceAmount}`);

    // Verify Daybook SALE entry
    const daybookRes = await daybookService.getTransactions({ dateRange: 'all' });
    const daybookSale = daybookRes.data.find((t) => t.referenceId === invRes.invoiceId || t.referenceNumber === invRes.invoiceNumber);
    assert(daybookSale !== undefined, 'TEST A.4 — Daybook Sale Entry Present', `Daybook Tx: ${daybookSale?.transactionCode}`);
    assert(daybookSale?.totalAmount === 15750, 'TEST A.5 — Daybook Gross Sales Total', `Total: ₹${daybookSale?.totalAmount}`);
    assert(daybookSale?.amount === 15750, 'TEST A.6 — Daybook Inflow (Cash/UPI)', `Inflow: ₹${daybookSale?.amount}`);
    assert(daybookSale?.remainingAmount === 0, 'TEST A.7 — Daybook Remaining Zero', `Remaining: ₹${daybookSale?.remainingAmount}`);
    assert(daybookSale?.paymentStatus === 'PAID', 'TEST A.8 — Daybook Status PAID', `Status: ${daybookSale?.paymentStatus}`);

    // Verify Cashbook entry
    const cashbookRes = await cashbookService.getTransactions({ dateRange: 'today' });
    const cashbookEntry = cashbookRes.data.find((t) => t.referenceNumber === invRes.invoiceNumber || t.referenceId === invRes.invoiceId);
    assert(cashbookEntry !== undefined, 'TEST A.9 — Cashbook Inflow Present', `Cashbook Tx: ${cashbookEntry?.transactionCode}`);
    assert(cashbookEntry?.amount === 15750, 'TEST A.10 — Cashbook Inflow Matches Paid', `Inflow: ₹${cashbookEntry?.amount}`);
    assert(cashbookEntry?.direction === 'IN', 'TEST A.11 — Cashbook Direction IN', `Direction: ${cashbookEntry?.direction}`);

    // Verify Dashboard Total Sales
    salesAnalyticsService.invalidateCache();
    const metrics = await salesAnalyticsService.getSalesMetrics(resolveDateRange('today'), true, testWorkspaceId);
    assert(metrics.totalSales >= 15750, 'TEST A.12 — Dashboard Includes Manual Sale', `Dashboard Total Sales: ₹${metrics.totalSales}`);
    assert(metrics.paidSales >= 15750, 'TEST A.13 — Dashboard Paid Sales Accurate', `Dashboard Paid Sales: ₹${metrics.paidSales}`);
  }

  console.log('\n--- TEST B: QUOTATION CONVERTED TO FULLY PAID INVOICE (₹15,750) ---');
  {
    // 1. Create source quotation
    const qt = store.addQuotation({
      customerName: 'Priya Patel',
      customerPhone: '9820012345',
      customerAddress: 'Ahmedabad, Gujarat',
      customerGstin: '24AAACP1234A1Z5',
      status: 'Sent',
      date: today,
      validUntil: today,
      items: [{
        id: 'item-qt-1',
        productName: 'Commercial Inverter 5kVA',
        quantity: 1,
        sellingPrice: 15750,
        total: 15750,
        taxPercent: 0,
        taxAmount: 0,
        discountAmount: 0,
      }],
      subtotal: 15750,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 15750,
    } as any);

    assert(qt.id !== undefined, 'TEST B.1 — Source Quotation Created', `Quotation #${qt.quotationNumber}`);

    // Verify quotation is NOT counted as a sale before conversion
    salesAnalyticsService.invalidateCache();
    const metricsBefore = await salesAnalyticsService.getSalesMetrics(resolveDateRange('today'), true, testWorkspaceId);
    const salesBefore = metricsBefore.totalSales;

    // 2. Convert to Fully Paid Invoice
    const convRes = await quotationService.convertQuotationToInvoice({
      quotationId: qt.id,
      paymentStatus: 'Fully Paid',
      paymentMode: 'Cash',
      paymentNotes: 'Received in counter cash drawer',
      invoiceDate: today,
    });

    assert(convRes.success === true, 'TEST B.2 — Quotation Conversion Succeeded', `Invoice #${convRes.invoiceNumber}`);
    assert(convRes.paidAmount === 15750, 'TEST B.3 — Converted Paid Amount ₹15,750', `Paid: ₹${convRes.paidAmount}`);
    assert(convRes.balanceAmount === 0, 'TEST B.4 — Converted Balance Amount ₹0', `Balance: ₹${convRes.balanceAmount}`);

    // Verify Quotation lifecycle state
    const updatedQt = store.getQuotations().find((q) => q.id === qt.id);
    assert(updatedQt?.status === 'Converted', 'TEST B.5 — Quotation Status is Converted', `Status: ${updatedQt?.status}`);
    assert(updatedQt?.convertedInvoiceId === convRes.invoiceId, 'TEST B.6 — Converted Invoice ID Linked', `Linked ID: ${updatedQt?.convertedInvoiceId}`);

    // Verify Daybook SALE entry
    const daybookRes = await daybookService.getTransactions({ dateRange: 'all' });
    const daybookSale = daybookRes.data.find((t) => t.referenceId === convRes.invoiceId || t.referenceNumber === convRes.invoiceNumber);
    assert(daybookSale !== undefined, 'TEST B.7 — Daybook Sale Entry Present for Converted Invoice', `Tx: ${daybookSale?.transactionCode}`);
    assert(daybookSale?.totalAmount === 15750, 'TEST B.8 — Daybook Gross Total Matches Quotation Total', `Total: ₹${daybookSale?.totalAmount}`);
    assert(daybookSale?.amount === 15750, 'TEST B.9 — Daybook Inflow Matches Paid Amount', `Inflow: ₹${daybookSale?.amount}`);
    assert(daybookSale?.remainingAmount === 0, 'TEST B.10 — Daybook Remaining Amount is Zero', `Remaining: ₹${daybookSale?.remainingAmount}`);
    assert(daybookSale?.paymentStatus === 'PAID', 'TEST B.11 — Daybook Status is PAID', `Status: ${daybookSale?.paymentStatus}`);

    // Verify Cashbook entry
    const cashbookRes = await cashbookService.getTransactions({ dateRange: 'today' });
    const cashbookEntry = cashbookRes.data.find((t) => t.referenceNumber === convRes.invoiceNumber || t.referenceId === convRes.invoiceId);
    assert(cashbookEntry !== undefined, 'TEST B.12 — Cashbook Inflow Present for Converted Invoice', `Cashbook Tx: ${cashbookEntry?.transactionCode}`);
    assert(cashbookEntry?.amount === 15750, 'TEST B.13 — Cashbook Received Money ₹15,750', `Inflow: ₹${cashbookEntry?.amount}`);
    assert(cashbookEntry?.paymentMode === 'Cash', 'TEST B.14 — Cashbook Mode Preserved', `Mode: ${cashbookEntry?.paymentMode}`);

    // Verify Dashboard Total Sales updated accurately without double counting
    salesAnalyticsService.invalidateCache();
    const metricsAfter = await salesAnalyticsService.getSalesMetrics(resolveDateRange('today'), true, testWorkspaceId);
    const salesDiff = metricsAfter.totalSales - salesBefore;
    assert(salesDiff === 15750, 'TEST B.15 — Dashboard Total Sales Increased by Exactly ₹15,750', `Diff: ₹${salesDiff}`);
  }

  console.log('\n--- TEST C: QUOTATION CONVERTED TO PARTIALLY PAID INVOICE (₹10,000 total, ₹6,000 paid) ---');
  {
    const qt = store.addQuotation({
      customerName: 'Rajesh Gupta',
      customerPhone: '9833011223',
      status: 'Sent',
      date: today,
      validUntil: today,
      items: [{
        id: 'item-qt-2',
        productName: 'Solar Battery 150Ah',
        quantity: 1,
        sellingPrice: 10000,
        total: 10000,
        taxPercent: 0,
        taxAmount: 0,
        discountAmount: 0,
      }],
      subtotal: 10000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 10000,
    } as any);

    const convRes = await quotationService.convertQuotationToInvoice({
      quotationId: qt.id,
      paymentStatus: 'Partially Paid',
      paidAmount: 6000,
      paymentMode: 'Bank Transfer',
      invoiceDate: today,
    });

    assert(convRes.success === true, 'TEST C.1 — Partial Conversion Succeeded', `Invoice #${convRes.invoiceNumber}`);
    assert(convRes.paidAmount === 6000, 'TEST C.2 — Partial Paid Amount ₹6,000', `Paid: ₹${convRes.paidAmount}`);
    assert(convRes.balanceAmount === 4000, 'TEST C.3 — Remaining Balance ₹4,000', `Balance: ₹${convRes.balanceAmount}`);

    // Verify Daybook
    const daybookRes = await daybookService.getTransactions({ dateRange: 'all' });
    const daybookSale = daybookRes.data.find((t) => t.referenceId === convRes.invoiceId || t.referenceNumber === convRes.invoiceNumber);
    assert(daybookSale?.totalAmount === 10000, 'TEST C.4 — Daybook Total ₹10,000', `Total: ₹${daybookSale?.totalAmount}`);
    assert(daybookSale?.amount === 6000, 'TEST C.5 — Daybook Inflow Received ₹6,000', `Inflow: ₹${daybookSale?.amount}`);
    assert(daybookSale?.remainingAmount === 4000, 'TEST C.6 — Daybook Remaining ₹4,000', `Remaining: ₹${daybookSale?.remainingAmount}`);
    assert(daybookSale?.paymentStatus === 'PARTIALLY PAID', 'TEST C.7 — Daybook Status PARTIALLY PAID', `Status: ${daybookSale?.paymentStatus}`);

    // Verify Cashbook records ONLY the ₹6,000 actual cash received
    const cashbookRes = await cashbookService.getTransactions({ dateRange: 'today' });
    const cashbookEntry = cashbookRes.data.find((t) => t.referenceNumber === convRes.invoiceNumber || t.referenceId === convRes.invoiceId);
    assert(cashbookEntry?.amount === 6000, 'TEST C.8 — Cashbook Inflow Strictly ₹6,000 (Not ₹10,000)', `Cashbook: ₹${cashbookEntry?.amount}`);

    // Verify Udhari has the ₹4,000 outstanding receivable
    const udhariList = store.getUdharis();
    const udhariEntry = udhariList.find((u) => u.invoiceId === convRes.invoiceId || u.id === `UD-${convRes.invoiceNumber}`);
    assert(udhariEntry !== undefined, 'TEST C.9 — Udhari Record Created', `Udhari ID: ${udhariEntry?.id}`);
    assert(udhariEntry?.outstandingAmount === 4000, 'TEST C.10 — Udhari Outstanding Amount ₹4,000', `Outstanding: ₹${udhariEntry?.outstandingAmount}`);
    assert(udhariEntry?.totalReceived === 6000, 'TEST C.11 — Udhari Received Amount ₹6,000', `Received: ₹${udhariEntry?.totalReceived}`);
  }

  console.log('\n--- TEST D: QUOTATION CONVERTED TO UNPAID INVOICE (₹10,000 total, ₹0 paid) ---');
  {
    const qt = store.addQuotation({
      customerName: 'Vikram Singh',
      customerPhone: '9845012345',
      status: 'Sent',
      date: today,
      validUntil: today,
      items: [{
        id: 'item-qt-3',
        productName: 'Solar Panel Monocrystalline 540W',
        quantity: 1,
        sellingPrice: 10000,
        total: 10000,
        taxPercent: 0,
        taxAmount: 0,
        discountAmount: 0,
      }],
      subtotal: 10000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 10000,
    } as any);

    const convRes = await quotationService.convertQuotationToInvoice({
      quotationId: qt.id,
      paymentStatus: 'Unpaid',
      paidAmount: 0,
      invoiceDate: today,
    });

    assert(convRes.success === true, 'TEST D.1 — Unpaid Conversion Succeeded', `Invoice #${convRes.invoiceNumber}`);
    assert(convRes.paidAmount === 0, 'TEST D.2 — Paid Amount ₹0', `Paid: ₹${convRes.paidAmount}`);
    assert(convRes.balanceAmount === 10000, 'TEST D.3 — Remaining Balance ₹10,000', `Balance: ₹${convRes.balanceAmount}`);

    // Verify Daybook
    const daybookRes = await daybookService.getTransactions({ dateRange: 'all' });
    const daybookSale = daybookRes.data.find((t) => t.referenceId === convRes.invoiceId || t.referenceNumber === convRes.invoiceNumber);
    assert(daybookSale?.totalAmount === 10000, 'TEST D.4 — Daybook Total ₹10,000', `Total: ₹${daybookSale?.totalAmount}`);
    assert(daybookSale?.amount === 0, 'TEST D.5 — Daybook Inflow ₹0', `Inflow: ₹${daybookSale?.amount}`);
    assert(daybookSale?.remainingAmount === 10000, 'TEST D.6 — Daybook Remaining ₹10,000', `Remaining: ₹${daybookSale?.remainingAmount}`);
    assert(daybookSale?.paymentStatus === 'UNPAID', 'TEST D.7 — Daybook Status UNPAID', `Status: ${daybookSale?.paymentStatus}`);

    // Verify Cashbook has NO received-money inflow
    const cashbookRes = await cashbookService.getTransactions({ dateRange: 'today' });
    const cashbookEntry = cashbookRes.data.find((t) => t.referenceNumber === convRes.invoiceNumber || t.referenceId === convRes.invoiceId);
    assert(cashbookEntry === undefined, 'TEST D.8 — Cashbook Has Zero Inflow for Unpaid Invoice', 'No cashbook entry created (Correct)');

    // Verify Udhari has the full ₹10,000 receivable
    const udhariList = store.getUdharis();
    const udhariEntry = udhariList.find((u) => u.invoiceId === convRes.invoiceId || u.id === `UD-${convRes.invoiceNumber}`);
    assert(udhariEntry !== undefined, 'TEST D.9 — Udhari Record Created for Full Credit', `Udhari ID: ${udhariEntry?.id}`);
    assert(udhariEntry?.outstandingAmount === 10000, 'TEST D.10 — Udhari Outstanding Amount ₹10,000', `Outstanding: ₹${udhariEntry?.outstandingAmount}`);
    assert(udhariEntry?.status === 'UNPAID', 'TEST D.11 — Udhari Status UNPAID', `Status: ${udhariEntry?.status}`);
  }

  console.log('\n--- TEST E: DUPLICATE CONVERSION / RETRY IDEMPOTENCY ---');
  {
    // Find the quotation from TEST B which was already converted
    const convertedQt = store.getQuotations().find((q) => q.customerName === 'Priya Patel');
    assert(convertedQt !== undefined && convertedQt.status === 'Converted', 'TEST E.1 — Precondition: Quotation is Already Converted', `Qt Status: ${convertedQt?.status}`);

    const invoiceCountBefore = store.getInvoices().length;
    const daybookCountBefore = (await daybookService.getTransactions({ dateRange: 'all' })).data.length;

    // Attempt second conversion
    const retryRes = await quotationService.convertQuotationToInvoice({
      quotationId: convertedQt!.id,
      paymentStatus: 'Fully Paid',
    });

    assert(retryRes.success === true, 'TEST E.2 — Retry Handled Safely', `Returned existing invoice: #${retryRes.invoiceNumber}`);
    assert(retryRes.invoiceId === convertedQt?.convertedInvoiceId, 'TEST E.3 — Returns Original Invoice ID', `Invoice ID: ${retryRes.invoiceId}`);

    const invoiceCountAfter = store.getInvoices().length;
    const daybookCountAfter = (await daybookService.getTransactions({ dateRange: 'all' })).data.length;

    assert(invoiceCountAfter === invoiceCountBefore, 'TEST E.4 — No Duplicate Invoice Created', `Invoice Count: ${invoiceCountAfter}`);
    assert(daybookCountAfter === daybookCountBefore, 'TEST E.5 — No Duplicate Daybook Entry Created', `Daybook Count: ${daybookCountAfter}`);
  }

  console.log('\n--- TEST F: CUSTOMER DETAILS PRESERVATION (EXISTING VS WALK-IN) ---');
  {
    // 1. Existing customer with GSTIN and address
    const existingCustQt = store.addQuotation({
      customerId: 'cust-uuid-12345',
      customerName: 'Apex Industrial Solutions Pvt Ltd',
      customerPhone: '9988776655',
      customerGstin: '27AABCA1234F1Z5',
      customerAddress: 'Plot 42, MIDC Industrial Area, Pune, Maharashtra',
      customerEmail: 'accounts@apexsolutions.com',
      status: 'Sent',
      date: today,
      validUntil: today,
      items: [{
        id: 'item-qt-4',
        productName: 'Industrial Transformer 100kVA',
        quantity: 1,
        sellingPrice: 85000,
        total: 85000,
        taxPercent: 0,
        taxAmount: 0,
        discountAmount: 0,
      }],
      subtotal: 85000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 85000,
    } as any);

    const convExisting = await quotationService.convertQuotationToInvoice({
      quotationId: existingCustQt.id,
      paymentStatus: 'Partially Paid',
      paidAmount: 50000,
      invoiceDate: today,
    });

    const createdInv = store.getInvoices().find((i) => i.id === convExisting.invoiceId);
    assert(createdInv?.customerGstin === '27AABCA1234F1Z5', 'TEST F.1 — Customer GSTIN Preserved', `GSTIN: ${createdInv?.customerGstin}`);
    assert(createdInv?.customerAddress === 'Plot 42, MIDC Industrial Area, Pune, Maharashtra', 'TEST F.2 — Customer Address Preserved', `Address: ${createdInv?.customerAddress}`);
    assert(createdInv?.customerId === 'cust-uuid-12345', 'TEST F.3 — Customer ID Linkage Preserved', `Customer ID: ${createdInv?.customerId}`);

    // 2. Walk-in customer without profile
    const walkinQt = store.addQuotation({
      customerName: 'Walk-in Retail Buyer',
      customerPhone: '9111122222',
      status: 'Sent',
      date: today,
      validUntil: today,
      items: [{
        id: 'item-qt-5',
        productName: 'Brass Pipe Fittings 1/2 inch',
        quantity: 2,
        sellingPrice: 750,
        total: 1500,
        taxPercent: 0,
        taxAmount: 0,
        discountAmount: 0,
      }],
      subtotal: 1500,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1500,
    } as any);

    const convWalkin = await quotationService.convertQuotationToInvoice({
      quotationId: walkinQt.id,
      paymentStatus: 'Fully Paid',
      invoiceDate: today,
    });

    const walkinInv = store.getInvoices().find((i) => i.id === convWalkin.invoiceId);
    assert(walkinInv?.customerName === 'Walk-in Retail Buyer', 'TEST F.4 — Walk-in Customer Name Preserved', `Name: ${walkinInv?.customerName}`);
    assert(walkinInv?.customerPhone === '9111122222', 'TEST F.5 — Walk-in Customer Phone Preserved', `Phone: ${walkinInv?.customerPhone}`);
  }

  console.log('\n--- TEST G: MULTI-TENANT WORKSPACE ISOLATION ---');
  {
    // Query metrics for Workspace A
    salesAnalyticsService.invalidateCache();
    const metricsWsA = await salesAnalyticsService.getSalesMetrics(resolveDateRange('today'), true, testWorkspaceId);
    assert(metricsWsA.totalSales > 0, 'TEST G.1 — Workspace A Has Accumulated Sales', `Workspace A Sales: ₹${metricsWsA.totalSales}`);

    // Query metrics for Workspace B (isolated empty tenant)
    salesAnalyticsService.invalidateCache();
    const metricsWsB = await salesAnalyticsService.getSalesMetrics(resolveDateRange('today'), true, otherWorkspaceId);
    assert(metricsWsB.totalSales === 0, 'TEST G.2 — Workspace B Isolated (Zero Sales Leaked)', `Workspace B Sales: ₹${metricsWsB.totalSales}`);
  }

  console.log('\n================================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRegressionTestSuite().catch((err) => {
  console.error('Fatal Test Execution Error:', err);
  process.exit(1);
});
