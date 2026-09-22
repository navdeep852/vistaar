/**
 * VISTAAR Business OS — Master Accounting Synchronization Test Suite
 * 
 * Verifies the complete financial synchronization chain:
 * Quotation -> Invoice -> Partial Payment -> Udhari -> Daybook -> Cashbook
 * 
 * Tests the complete test matrix required by the specification:
 * TEST 1: Full Payment (₹50,000 -> ₹50,000)
 * TEST 2: Partial Payment (₹50,000 -> ₹20,000 -> ₹30,000)
 * TEST 3: Multiple Partial Payments (₹50,000 -> ₹20,000 -> ₹10,000 -> ₹20,000)
 * TEST 4: Zero Payment (Quotation ₹50,000 converted to Invoice ₹50,000, Paid ₹0, Bal ₹50,000)
 * TEST 5: Overpayment Rejection (Invoice balance ₹30,000, attempt ₹60,000)
 * TEST 6: Refresh / Persistence consistency
 * TEST 7: Quotation Conversion & Complete Chain
 * INVARIANTS: Verified across all steps
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

// 2. Imports
import { store } from '../src/services/store';
import { customerPaymentService } from '../src/services/supabase/customerPaymentService';
import { safeGetTenantStorage } from '../src/services/supabase/safeStorage';
import {
  calculateInvoiceFinancials,
  calculateUdhariFinancials,
  calculateDaybookFinancials,
  validatePaymentAmount,
} from '../src/services/financialCalculationService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(message);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function runTests() {
  console.log('================================================================================');
  console.log('VISTAAR Business OS — MASTER ACCOUNTING SYNCHRONIZATION TEST SUITE');
  console.log('================================================================================\n');

  let passedTests = 0;

  // ---------------------------------------------------------------------------
  // TEST 1 — Full Payment (₹50,000 -> ₹50,000)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Full Payment (₹50,000 -> ₹50,000) ---');
  {
    const invId = `inv-test1-${Date.now()}`;
    const invNum = `INV-T1-${Date.now()}`;
    const customerName = 'Rupesh FullPay';
    const grandTotal = 50000;

    // Create Invoice with ₹50,000
    const inv = store.addInvoice({
      id: invId,
      invoiceNumber: invNum,
      customerName,
      customerPhone: '9876543210',
      status: 'Issued',
      date: '2026-03-22',
      dueDate: '2026-04-05',
      items: [{ id: '1', productName: 'T1 Item', sellingPrice: 50000, quantity: 1, total: 50000, buyPrice: 40000, taxPercent: 0, taxAmount: 0, discountAmount: 0, unit: 'pcs' }],
      subtotal: 50000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal,
      paidAmount: 0,
      balanceAmount: grandTotal,
      templateId: 'modern',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Pay full ₹50,000
    const payRes = await customerPaymentService.recordCustomerPayment({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName,
      customerPhone: '9876543210',
      amount: 50000,
      paymentMethod: 'UPI',
    });

    assert(payRes.success, 'Payment recorded successfully');

    // Verify Invoice
    const updatedInv = store.getInvoices().find((i) => i.id === inv.id)!;
    assert(updatedInv.grandTotal === 50000, `Invoice grandTotal is ₹50,000 (actual: ${updatedInv.grandTotal})`);
    assert(updatedInv.paidAmount === 50000, `Invoice paidAmount is ₹50,000 (actual: ${updatedInv.paidAmount})`);
    assert(updatedInv.balanceAmount === 0, `Invoice balanceAmount is ₹0 (actual: ${updatedInv.balanceAmount})`);
    assert(updatedInv.status === 'Paid', `Invoice status is 'Paid' (actual: ${updatedInv.status})`);
    assert(updatedInv.grandTotal === updatedInv.paidAmount + updatedInv.balanceAmount, 'Invoice invariant: grandTotal = paidAmount + balanceAmount');

    // Verify Udhari
    const udhari = store.getUdharis().find((u) => u.invoiceId === inv.id || u.id === `UD-${inv.invoiceNumber}`)!;
    assert(!!udhari, 'Linked Udhari record exists');
    assert(udhari.originalAmount === 50000, `Udhari originalAmount is ₹50,000 (actual: ${udhari.originalAmount})`);
    assert(udhari.totalReceived === 50000, `Udhari totalReceived is ₹50,000 (actual: ${udhari.totalReceived})`);
    assert(udhari.outstandingAmount === 0, `Udhari outstandingAmount is ₹0 (actual: ${udhari.outstandingAmount})`);
    assert(udhari.status === 'PAID', `Udhari status is 'PAID' (actual: ${udhari.status})`);
    assert(udhari.originalAmount === udhari.totalReceived + udhari.outstandingAmount, 'Udhari invariant: originalAmount = totalReceived + outstandingAmount');

    // Verify Daybook SALE entry
    const localDaybook = safeGetTenantStorage<any[]>('vistaar_local_daybook_db', []);
    const daybookSale = localDaybook.find((t) => t.referenceType === 'INVOICE' && (t.referenceId === inv.id || t.referenceNumber === inv.invoiceNumber));
    assert(!!daybookSale, 'Daybook SALE entry exists');
    assert(daybookSale.totalAmount === 50000, `Daybook totalAmount is ₹50,000 (actual: ${daybookSale.totalAmount})`);
    assert(daybookSale.amount === 50000, `Daybook Inflow is ₹50,000 (actual: ${daybookSale.amount})`);
    assert(daybookSale.remainingAmount === 0, `Daybook remainingAmount is ₹0 (actual: ${daybookSale.remainingAmount})`);
    assert(daybookSale.paymentStatus === 'PAID', `Daybook paymentStatus is 'PAID' (actual: ${daybookSale.paymentStatus})`);
    assert(daybookSale.totalAmount === daybookSale.amount + daybookSale.remainingAmount, 'Daybook invariant: totalAmount = Inflow + remainingAmount');

    passedTests++;
    console.log('TEST 1 PASSED!\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 2 — Partial Payment (₹50,000 -> ₹20,000 -> ₹30,000)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Partial Payment (₹50,000 -> ₹20,000 -> ₹30,000) ---');
  {
    const invId = `inv-test2-${Date.now()}`;
    const invNum = `INV-T2-${Date.now()}`;
    const customerName = 'Rupesh PartialPay';
    const grandTotal = 50000;

    // Create Invoice with ₹50,000
    const inv = store.addInvoice({
      id: invId,
      invoiceNumber: invNum,
      customerName,
      customerPhone: '9876543210',
      status: 'Issued',
      date: '2026-03-22',
      dueDate: '2026-04-05',
      items: [{ id: '1', productName: 'T2 Item', sellingPrice: 50000, quantity: 1, total: 50000, buyPrice: 40000, taxPercent: 0, taxAmount: 0, discountAmount: 0, unit: 'pcs' }],
      subtotal: 50000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal,
      paidAmount: 0,
      balanceAmount: grandTotal,
      templateId: 'modern',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Record Partial Payment of ₹20,000
    const payRes = await customerPaymentService.recordCustomerPayment({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName,
      customerPhone: '9876543210',
      amount: 20000,
      paymentMethod: 'Cash',
    });

    assert(payRes.success, 'Partial payment of ₹20,000 recorded');

    // Verify Invoice
    const updatedInv = store.getInvoices().find((i) => i.id === inv.id)!;
    assert(updatedInv.grandTotal === 50000, `Invoice grandTotal is ₹50,000 (actual: ${updatedInv.grandTotal})`);
    assert(updatedInv.paidAmount === 20000, `Invoice paidAmount is ₹20,000 (actual: ${updatedInv.paidAmount})`);
    assert(updatedInv.balanceAmount === 30000, `Invoice balanceAmount is ₹30,000 (actual: ${updatedInv.balanceAmount})`);
    assert(updatedInv.status === 'Partially Paid', `Invoice status is 'Partially Paid' (actual: ${updatedInv.status})`);
    assert(updatedInv.grandTotal === updatedInv.paidAmount + updatedInv.balanceAmount, 'Invoice invariant: grandTotal = paidAmount + balanceAmount');

    // Verify Udhari auto-creation / auto-sync
    const udhari = store.getUdharis().find((u) => u.invoiceId === inv.id || u.id === `UD-${inv.invoiceNumber}`)!;
    assert(!!udhari, 'Linked Udhari record was automatically created');
    assert(udhari.originalAmount === 50000, `Udhari originalAmount is ₹50,000 (actual: ${udhari.originalAmount})`);
    assert(udhari.totalReceived === 20000, `Udhari totalReceived is ₹20,000 (actual: ${udhari.totalReceived})`);
    assert(udhari.outstandingAmount === 30000, `Udhari outstandingAmount is ₹30,000 (actual: ${udhari.outstandingAmount})`);
    assert(udhari.status === 'PARTIALLY PAID', `Udhari status is 'PARTIALLY PAID' (actual: ${udhari.status})`);
    assert(udhari.originalAmount === udhari.totalReceived + udhari.outstandingAmount, 'Udhari invariant: originalAmount = totalReceived + outstandingAmount');
    assert(updatedInv.balanceAmount === udhari.outstandingAmount, 'Cross-module invariant: invoice.balanceAmount === udhari.outstandingAmount');

    // Verify Daybook
    const localDaybook = safeGetTenantStorage<any[]>('vistaar_local_daybook_db', []);
    const daybookSale = localDaybook.find((t) => t.referenceType === 'INVOICE' && (t.referenceId === inv.id || t.referenceNumber === inv.invoiceNumber));
    assert(!!daybookSale, 'Daybook SALE entry exists');
    assert(daybookSale.totalAmount === 50000, `Daybook totalAmount is ₹50,000 (actual: ${daybookSale.totalAmount})`);
    assert(daybookSale.amount === 20000, `Daybook Inflow is ₹20,000 (actual: ${daybookSale.amount})`);
    assert(daybookSale.remainingAmount === 30000, `Daybook remainingAmount is ₹30,000 (actual: ${daybookSale.remainingAmount})`);
    assert(daybookSale.paymentStatus === 'PARTIALLY PAID', `Daybook paymentStatus is 'PARTIALLY PAID' (actual: ${daybookSale.paymentStatus})`);
    assert(daybookSale.totalAmount === daybookSale.amount + daybookSale.remainingAmount, 'Daybook invariant: totalAmount = Inflow + remainingAmount');

    passedTests++;
    console.log('TEST 2 PASSED!\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 3 — Multiple Partial Payments (₹50,000 -> ₹20k -> ₹10k -> ₹20k)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Multiple Partial Payments (₹50k -> ₹20k -> ₹10k -> ₹20k) ---');
  {
    const invId = `inv-test3-${Date.now()}`;
    const invNum = `INV-T3-${Date.now()}`;
    const customerName = 'Rupesh MultiPay';
    const grandTotal = 50000;

    const inv = store.addInvoice({
      id: invId,
      invoiceNumber: invNum,
      customerName,
      customerPhone: '9876543210',
      status: 'Issued',
      date: '2026-03-22',
      dueDate: '2026-04-05',
      items: [{ id: '1', productName: 'T3 Item', sellingPrice: 50000, quantity: 1, total: 50000, buyPrice: 40000, taxPercent: 0, taxAmount: 0, discountAmount: 0, unit: 'pcs' }],
      subtotal: 50000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal,
      paidAmount: 0,
      balanceAmount: grandTotal,
      templateId: 'modern',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Payment 1: ₹20,000
    await customerPaymentService.recordCustomerPayment({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName,
      amount: 20000,
      paymentMethod: 'UPI',
    });
    let curInv = store.getInvoices().find((i) => i.id === inv.id)!;
    let curUdhari = store.getUdharis().find((u) => u.invoiceId === inv.id || u.id === `UD-${inv.invoiceNumber}`)!;
    assert(curInv.paidAmount === 20000 && curInv.balanceAmount === 30000, 'After Pay 1: Inv Paid ₹20k, Bal ₹30k');
    assert(curUdhari.outstandingAmount === 30000, 'After Pay 1: Udhari Outstanding ₹30k');

    // Payment 2: ₹10,000
    await customerPaymentService.recordCustomerPayment({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName,
      amount: 10000,
      paymentMethod: 'Cash',
    });
    curInv = store.getInvoices().find((i) => i.id === inv.id)!;
    curUdhari = store.getUdharis().find((u) => u.invoiceId === inv.id || u.id === `UD-${inv.invoiceNumber}`)!;
    assert(curInv.paidAmount === 30000 && curInv.balanceAmount === 20000, 'After Pay 2: Inv Paid ₹30k, Bal ₹20k');
    assert(curUdhari.outstandingAmount === 20000, 'After Pay 2: Udhari Outstanding ₹20k');

    // Payment 3: ₹20,000
    const pay3Res = await customerPaymentService.recordCustomerPayment({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName,
      amount: 20000,
      paymentMethod: 'Bank Transfer',
    });
    assert(pay3Res.success, 'Payment 3 recorded successfully');
    curInv = store.getInvoices().find((i) => i.id === inv.id)!;
    curUdhari = store.getUdharis().find((u) => u.invoiceId === inv.id || u.id === `UD-${inv.invoiceNumber}`)!;
    assert(curInv.paidAmount === 50000 && curInv.balanceAmount === 0, `After Pay 3: Inv Paid ₹50k, Bal ₹0 (actual: paid ${curInv.paidAmount}, bal ${curInv.balanceAmount})`);
    assert(curInv.status === 'Paid', "After Pay 3: Inv Status 'Paid'");
    assert(curUdhari.outstandingAmount === 0, 'After Pay 3: Udhari Outstanding ₹0');
    assert(curUdhari.status === 'PAID', "After Pay 3: Udhari Status 'PAID'");

    // Check Daybook after Payment 3
    const localDaybook = safeGetTenantStorage<any[]>('vistaar_local_daybook_db', []);
    const daybookSale = localDaybook.find((t) => t.referenceType === 'INVOICE' && (t.referenceId === inv.id || t.referenceNumber === inv.invoiceNumber));
    assert(daybookSale.totalAmount === 50000, 'Daybook totalAmount is ₹50,000');
    assert(daybookSale.amount === 50000, 'Daybook cumulative Inflow is ₹50,000');
    assert(daybookSale.remainingAmount === 0, 'Daybook remainingAmount is ₹0');
    assert(daybookSale.paymentStatus === 'PAID', "Daybook paymentStatus is 'PAID'");

    passedTests++;
    console.log('TEST 3 PASSED!\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 4 — Zero Payment / Quotation Conversion without Payment
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Zero Payment / Quotation Conversion ---');
  {
    const qtId = `qt-test4-${Date.now()}`;
    const qtNum = `QT-T4-${Date.now()}`;

    // Add Quotation with ₹50,000
    const qt = store.addQuotation({
      id: qtId,
      quotationNumber: qtNum,
      customerName: 'Rupesh ZeroPay',
      customerPhone: '9876543210',
      status: 'Sent',
      date: '2026-03-22',
      validUntil: '2026-04-22',
      items: [{ id: '1', productName: 'T4 Item', sellingPrice: 50000, quantity: 1, total: 50000, buyPrice: 40000, taxPercent: 0, taxAmount: 0, discountAmount: 0, unit: 'pcs' }],
      subtotal: 50000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 50000,
      templateId: 'modern',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Convert Quotation to Invoice
    const convertedInv = store.convertQuotationToInvoice(qt.id);
    assert(!!convertedInv, 'Quotation converted to Invoice');
    assert(convertedInv.grandTotal === 50000, `Converted Invoice grandTotal is ₹50,000 (actual: ${convertedInv.grandTotal})`);
    assert(convertedInv.paidAmount === 0, `Converted Invoice paidAmount is ₹0 (actual: ${convertedInv.paidAmount})`);
    assert(convertedInv.balanceAmount === 50000, `Converted Invoice balanceAmount is ₹50,000 (actual: ${convertedInv.balanceAmount})`);
    assert(convertedInv.status === 'Issued', `Converted Invoice status is 'Issued' (actual: ${convertedInv.status})`);

    // Verify linked Udhari receivable was created for the unpaid balance
    const udhari = store.getUdharis().find((u) => u.invoiceId === convertedInv.id || u.id === `UD-${convertedInv.invoiceNumber}`)!;
    assert(!!udhari, 'Udhari record exists for converted invoice');
    assert(udhari.originalAmount === 50000, `Udhari originalAmount is ₹50,000 (actual: ${udhari.originalAmount})`);
    assert(udhari.totalReceived === 0, `Udhari totalReceived is ₹0 (actual: ${udhari.totalReceived})`);
    assert(udhari.outstandingAmount === 50000, `Udhari outstandingAmount is ₹50,000 (actual: ${udhari.outstandingAmount})`);
    assert(udhari.status === 'UNPAID', `Udhari status is 'UNPAID' (actual: ${udhari.status})`);

    passedTests++;
    console.log('TEST 4 PASSED!\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 5 — Overpayment Rejection
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Overpayment Rejection ---');
  {
    const invId = `inv-test5-${Date.now()}`;
    const invNum = `INV-T5-${Date.now()}`;

    store.addInvoice({
      id: invId,
      invoiceNumber: invNum,
      customerName: 'Rupesh Overpay',
      customerPhone: '9876543210',
      status: 'Issued',
      date: '2026-03-22',
      dueDate: '2026-04-05',
      items: [{ id: '1', productName: 'T5 Item', sellingPrice: 50000, quantity: 1, total: 50000, buyPrice: 40000, taxPercent: 0, taxAmount: 0, discountAmount: 0, unit: 'pcs' }],
      subtotal: 50000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 50000,
      paidAmount: 20000,
      balanceAmount: 30000,
      templateId: 'modern',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Attempt to pay ₹60,000 on ₹30,000 balance
    const overpayRes = await customerPaymentService.recordCustomerPayment({
      invoiceId: invId,
      invoiceNumber: invNum,
      customerName: 'Rupesh Overpay',
      amount: 60000,
      paymentMethod: 'Cash',
    });

    assert(!overpayRes.success, 'Overpayment was rejected');
    assert(overpayRes.error?.includes('exceeds') || overpayRes.error?.includes('rejected'), 'Rejection error message returned');

    // Ensure invoice balances were NOT corrupted
    const inv = store.getInvoices().find((i) => i.id === invId)!;
    assert(inv.paidAmount === 20000, 'Invoice paidAmount remains ₹20,000');
    assert(inv.balanceAmount === 30000, 'Invoice balanceAmount remains ₹30,000');

    passedTests++;
    console.log('TEST 5 PASSED!\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 6 — Refresh / Reload Persistence
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Refresh / Reload Persistence ---');
  {
    const invId = `inv-test6-${Date.now()}`;
    const invNum = `INV-T6-${Date.now()}`;
    const customerName = 'Rupesh RefreshTest';

    store.addInvoice({
      id: invId,
      invoiceNumber: invNum,
      customerName,
      customerPhone: '9876543210',
      status: 'Issued',
      date: '2026-03-22',
      dueDate: '2026-04-05',
      items: [{ id: '1', productName: 'T6 Item', sellingPrice: 50000, quantity: 1, total: 50000, buyPrice: 40000, taxPercent: 0, taxAmount: 0, discountAmount: 0, unit: 'pcs' }],
      subtotal: 50000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 50000,
      paidAmount: 0,
      balanceAmount: 50000,
      templateId: 'modern',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Record ₹20,000 payment
    await customerPaymentService.recordCustomerPayment({
      invoiceId: invId,
      invoiceNumber: invNum,
      customerName,
      amount: 20000,
      paymentMethod: 'UPI',
    });

    // Simulate "Page Refresh": Reload from tenant storage
    const invoicesBeforeRefresh = store.getInvoices();
    const storedInvoices = safeGetTenantStorage<any[]>('vistaar_local_invoices_db', []);
    const storedUdharis = safeGetTenantStorage<any[]>('vistaar_local_udharis_db', []);
    const storedDaybook = safeGetTenantStorage<any[]>('vistaar_local_daybook_db', []);

    const persistedInv = storedInvoices.find((i) => i.id === invId || i.invoiceNumber === invNum);
    const persistedUdhari = storedUdharis.find((u) => u.invoiceId === invId || u.id === `UD-${invNum}`);
    const persistedDaybook = storedDaybook.find((t) => t.referenceType === 'INVOICE' && (t.referenceId === invId || t.referenceNumber === invNum));

    assert(!!persistedInv, 'Invoice persisted to tenant storage');
    assert(persistedInv.grandTotal === 50000, `Persisted Invoice Grand Total is ₹50,000 (actual: ${persistedInv.grandTotal})`);
    assert(persistedInv.paidAmount === 20000, `Persisted Invoice Paid Amount is ₹20,000 (actual: ${persistedInv.paidAmount})`);
    assert(persistedInv.balanceAmount === 30000, `Persisted Invoice Balance is ₹30,000 (actual: ${persistedInv.balanceAmount})`);

    assert(!!persistedUdhari, 'Udhari persisted to tenant storage');
    assert(persistedUdhari.outstandingAmount === 30000, `Persisted Udhari Outstanding is ₹30,000 (actual: ${persistedUdhari.outstandingAmount})`);

    assert(!!persistedDaybook, 'Daybook persisted to tenant storage');
    assert(persistedDaybook.totalAmount === 50000, `Persisted Daybook Total is ₹50,000 (actual: ${persistedDaybook.totalAmount})`);
    assert(persistedDaybook.amount === 20000, `Persisted Daybook Inflow is ₹20,000 (actual: ${persistedDaybook.amount})`);
    assert(persistedDaybook.remainingAmount === 30000, `Persisted Daybook Remaining is ₹30,000 (actual: ${persistedDaybook.remainingAmount})`);

    passedTests++;
    console.log('TEST 6 PASSED!\n');
  }

  // ---------------------------------------------------------------------------
  // TEST 7 — Quotation Conversion & Complete Synchronization Chain
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Quotation Conversion & Complete Chain ---');
  {
    const qtId = `qt-test7-${Date.now()}`;
    const qtNum = `QT-T7-${Date.now()}`;
    const customerName = 'Rupesh CompleteChain';

    // Step 1: Create Quotation for ₹50,000
    const qt = store.addQuotation({
      id: qtId,
      quotationNumber: qtNum,
      customerName,
      customerPhone: '9876543210',
      status: 'Sent',
      date: '2026-03-22',
      validUntil: '2026-04-22',
      items: [{ id: '1', productName: 'T7 Item', sellingPrice: 50000, quantity: 1, total: 50000, buyPrice: 40000, taxPercent: 0, taxAmount: 0, discountAmount: 0, unit: 'pcs' }],
      subtotal: 50000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 50000,
      templateId: 'modern',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert(qt.grandTotal === 50000, 'Quotation Grand Total is ₹50,000');

    // Step 2: Convert to Invoice
    const inv = store.convertQuotationToInvoice(qt.id);
    assert(inv.grandTotal === 50000, 'Converted Invoice Grand Total = ₹50,000');
    assert(inv.paidAmount === 0, 'Converted Invoice Paid Amount = ₹0');
    assert(inv.balanceAmount === 50000, 'Converted Invoice Balance Amount = ₹50,000');

    // Step 3: Customer makes partial payment of ₹20,000
    const pay1 = await customerPaymentService.recordCustomerPayment({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName,
      amount: 20000,
      paymentMethod: 'UPI',
    });
    assert(pay1.success, 'Payment 1 of ₹20,000 recorded');

    // Verify after Payment 1
    let curInv = store.getInvoices().find((i) => i.id === inv.id)!;
    let curUdhari = store.getUdharis().find((u) => u.invoiceId === inv.id || u.id === `UD-${inv.invoiceNumber}`)!;
    let localDaybook = safeGetTenantStorage<any[]>('vistaar_local_daybook_db', []);
    let daybookSale = localDaybook.find((t) => t.referenceType === 'INVOICE' && (t.referenceId === inv.id || t.referenceNumber === inv.invoiceNumber))!;

    assert(curInv.grandTotal === 50000 && curInv.paidAmount === 20000 && curInv.balanceAmount === 30000, 'Invoice: ₹50,000 / ₹20,000 / ₹30,000');
    assert(curInv.status === 'Partially Paid', "Invoice status: 'Partially Paid'");
    assert(curUdhari.originalAmount === 50000 && curUdhari.totalReceived === 20000 && curUdhari.outstandingAmount === 30000, 'Udhari: ₹50,000 / ₹20,000 / ₹30,000');
    assert(curUdhari.status === 'PARTIALLY PAID', "Udhari status: 'PARTIALLY PAID'");
    assert(daybookSale.totalAmount === 50000 && daybookSale.amount === 20000 && daybookSale.remainingAmount === 30000, 'Daybook: Total ₹50,000 / Inflow ₹20,000 / Remaining ₹30,000');

    // Step 4: Customer pays remaining ₹30,000
    const pay2 = await customerPaymentService.recordCustomerPayment({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName,
      amount: 30000,
      paymentMethod: 'Bank Transfer',
    });
    assert(pay2.success, 'Payment 2 of ₹30,000 recorded');

    // Verify after Payment 2
    curInv = store.getInvoices().find((i) => i.id === inv.id)!;
    curUdhari = store.getUdharis().find((u) => u.invoiceId === inv.id || u.id === `UD-${inv.invoiceNumber}`)!;
    localDaybook = safeGetTenantStorage<any[]>('vistaar_local_daybook_db', []);
    daybookSale = localDaybook.find((t) => t.referenceType === 'INVOICE' && (t.referenceId === inv.id || t.referenceNumber === inv.invoiceNumber))!;

    assert(curInv.grandTotal === 50000 && curInv.paidAmount === 50000 && curInv.balanceAmount === 0, 'Invoice: ₹50,000 / ₹50,000 / ₹0');
    assert(curInv.status === 'Paid', "Invoice status: 'Paid'");
    assert(curUdhari.originalAmount === 50000 && curUdhari.totalReceived === 50000 && curUdhari.outstandingAmount === 0, 'Udhari: ₹50,000 / ₹50,000 / ₹0');
    assert(curUdhari.status === 'PAID', "Udhari status: 'PAID'");
    assert(daybookSale.totalAmount === 50000 && daybookSale.amount === 50000 && daybookSale.remainingAmount === 0, 'Daybook: Total ₹50,000 / Inflow ₹50,000 / Remaining ₹0');
    assert(daybookSale.paymentStatus === 'PAID', "Daybook paymentStatus: 'PAID'");

    passedTests++;
    console.log('TEST 7 PASSED!\n');
  }

  // ---------------------------------------------------------------------------
  // MATHEMATICAL INVARIANTS VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('--- MATHEMATICAL INVARIANTS VERIFICATION ---');
  {
    const invRes = calculateInvoiceFinancials(50000, 20000);
    assert(invRes.grandTotal === 50000, 'calculateInvoiceFinancials grandTotal = 50000');
    assert(invRes.paidAmount === 20000, 'calculateInvoiceFinancials paidAmount = 20000');
    assert(invRes.balanceAmount === 30000, 'calculateInvoiceFinancials balanceAmount = 30000');
    assert(invRes.grandTotal === invRes.paidAmount + invRes.balanceAmount, 'Invariant: grandTotal = paidAmount + balanceAmount');

    const udhariRes = calculateUdhariFinancials(50000, 20000);
    assert(udhariRes.originalAmount === 50000, 'calculateUdhariFinancials originalAmount = 50000');
    assert(udhariRes.totalReceived === 20000, 'calculateUdhariFinancials totalReceived = 20000');
    assert(udhariRes.outstandingAmount === 30000, 'calculateUdhariFinancials outstandingAmount = 30000');
    assert(udhariRes.originalAmount === udhariRes.totalReceived + udhariRes.outstandingAmount, 'Invariant: originalAmount = totalReceived + outstandingAmount');

    const daybookRes = calculateDaybookFinancials(50000, 20000);
    assert(daybookRes.totalAmount === 50000, 'calculateDaybookFinancials totalAmount = 50000');
    assert(daybookRes.amount === 20000, 'calculateDaybookFinancials amount = 20000');
    assert(daybookRes.remainingAmount === 30000, 'calculateDaybookFinancials remainingAmount = 30000');
    assert(daybookRes.totalAmount === daybookRes.amount + daybookRes.remainingAmount, 'Invariant: totalAmount = amount + remainingAmount');

    const overpayCheck = validatePaymentAmount(30000, 60000);
    assert(!overpayCheck.valid, 'validatePaymentAmount rejects 60000 against 30000');

    passedTests++;
    console.log('INVARIANTS PASSED!\n');
  }

  console.log('================================================================================');
  console.log(`ALL ${passedTests} TEST SUITES PASSED PERFECTLY!`);
  console.log('================================================================================');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
