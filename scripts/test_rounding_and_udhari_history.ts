/**
 * VISTAAR Business OS — Regression Test Suite for Payment Rounding & Udhari Payment History
 * Covers all 12 scenarios specified in Section 19 of the Master Prompt.
 */

import { store } from '../src/services/store';
import {
  calculateInvoiceFinancials,
  calculateUdhariFinancials,
  calculateDaybookFinancials,
  calculateAuthoritativeInvoiceOutstanding,
  calculateCustomerOutstanding,
  validatePaymentAmount,
  PAYMENT_TOLERANCE,
} from '../src/services/financialCalculationService';
import { normalizeInvoiceToDocument, documentDataToRendererProps } from '../src/services/document/documentData';
import { Invoice, PaymentMethod } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function runTestSuite() {
  console.log('================================================================================');
  console.log('RUNNING REGRESSION TEST SUITE: PAYMENT ROUNDING + UDHARI PAYMENT HISTORY');
  console.log(`CONFIGURED PAYMENT_TOLERANCE: ₹${PAYMENT_TOLERANCE.toFixed(2)}`);
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Invoice ₹1,000, Payment ₹1,000
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Invoice ₹1,000, Payment ₹1,000 ---');
  {
    const fin = calculateInvoiceFinancials(1000, 1000);
    assert(fin.paidAmount === 1000, 'Paid amount is ₹1,000');
    assert(fin.balanceAmount === 0, 'Outstanding is ₹0');
    assert(fin.status === 'Paid', 'Status is PAID');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Invoice ₹1,000, Payment ₹600
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Invoice ₹1,000, Payment ₹600 ---');
  {
    const fin = calculateInvoiceFinancials(1000, 600);
    assert(fin.paidAmount === 600, 'Paid amount is ₹600');
    assert(fin.balanceAmount === 400, 'Outstanding is ₹400');
    assert(fin.status === 'Partially Paid', 'Status is PARTIALLY PAID');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Invoice ₹1,000, Payment ₹600, Later payment ₹400
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Invoice ₹1,000, Payment ₹600, Later payment ₹400 ---');
  {
    const invId = `TEST-INV-003`;
    const custId = `CUST-003`;
    const testInv = store.addInvoice({
      invoiceNumber: 'INV-TEST-003',
      customerId: custId,
      customerName: 'Test Customer 3',
      customerPhone: '9876543210',
      status: 'Issued',
      date: '2026-10-10',
      dueDate: '2026-10-25',
      items: [{
        id: 'item-1',
        productName: 'Widget A',
        unit: 'pcs',
        quantity: 1,
        buyPrice: 500,
        sellingPrice: 1000,
        discountAmount: 0,
        taxPercent: 0,
        taxAmount: 0,
        total: 1000,
      }],
      subtotal: 1000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      templateId: 'modern-split',
    });

    // Record Payment 1: ₹600 on 2026-10-10
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-T3-1',
      invoiceId: testInv.id,
      invoiceNumber: testInv.invoiceNumber,
      customerId: custId,
      customerName: 'Test Customer 3',
      amount: 600,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-10',
      reference: 'TXN-CASH-1',
    });

    const midOut = store.getAuthoritativeInvoiceOutstanding(testInv.id);
    assert(midOut === 400, 'Midway balance is ₹400');

    // Record Payment 2: ₹400 on 2026-10-11
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-T3-2',
      invoiceId: testInv.id,
      invoiceNumber: testInv.invoiceNumber,
      customerId: custId,
      customerName: 'Test Customer 3',
      amount: 400,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-11',
      reference: 'TXN-UPI-2',
    });

    const finalInv = store.getInvoice(testInv.id)!;
    assert(finalInv.paidAmount === 1000, 'Total Paid is ₹1,000');
    assert(finalInv.balanceAmount === 0, 'Final Outstanding is ₹0');
    assert(finalInv.status === 'Paid', 'Final Status is Paid');

    const pays = store.getPaymentsForInvoice(testInv.id);
    assert(pays.length === 2, 'Exactly 2 payments preserved in payment history');
    assert(pays[0].amount === 600 && pays[0].date === '2026-10-10' && pays[0].method === 'Cash', 'Payment 1 preserved: ₹600, 2026-10-10, Cash');
    assert(pays[1].amount === 400 && pays[1].date === '2026-10-11' && pays[1].method === 'UPI', 'Payment 2 preserved: ₹400, 2026-10-11, UPI');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Invoice ₹1,000, Payment ₹999.60 (Remaining ₹0.40 < ₹1.00 tolerance)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Invoice ₹1,000, Payment ₹999.60 (Tolerance ₹0.40) ---');
  {
    const fin = calculateInvoiceFinancials(1000, 999.60);
    assert(fin.paidAmount === 999.60, 'Actual recorded payment remains ₹999.60 (NOT altered)');
    assert(fin.balanceAmount === 0, 'Outstanding normalized to ₹0.00');
    assert(fin.status === 'Paid', 'Status is Paid');

    const udFin = calculateUdhariFinancials(1000, 999.60);
    assert(udFin.totalReceived === 999.60, 'Udhari totalReceived is ₹999.60');
    assert(udFin.outstandingAmount === 0, 'Udhari outstanding is ₹0.00');
    assert(udFin.status === 'PAID', 'Udhari status is PAID');

    const authOut = calculateAuthoritativeInvoiceOutstanding(1000, 999.60);
    assert(authOut === 0, 'Authoritative outstanding is ₹0.00');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Invoice ₹1,000, Payment ₹999.00 (Remaining ₹1.00 >= tolerance)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Invoice ₹1,000, Payment ₹999.00 (Legitimate ₹1.00 balance) ---');
  {
    const fin = calculateInvoiceFinancials(1000, 999.00);
    assert(fin.paidAmount === 999.00, 'Paid amount is ₹999.00');
    assert(fin.balanceAmount === 1.00, 'Outstanding remains ₹1.00 (NOT treated as paid)');
    assert(fin.status === 'Partially Paid', 'Status is Partially Paid');

    const udFin = calculateUdhariFinancials(1000, 999.00);
    assert(udFin.outstandingAmount === 1.00, 'Udhari outstanding remains ₹1.00');
    assert(udFin.status === 'PARTIALLY PAID', 'Udhari status is PARTIALLY PAID');
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Invoice ₹1,000, Payment ₹998.99 (Remaining ₹1.01 >= tolerance)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Invoice ₹1,000, Payment ₹998.99 (Remaining ₹1.01) ---');
  {
    const fin = calculateInvoiceFinancials(1000, 998.99);
    assert(fin.paidAmount === 998.99, 'Paid amount is ₹998.99');
    assert(fin.balanceAmount === 1.01, 'Outstanding is ₹1.01');
    assert(fin.status === 'Partially Paid', 'Status is Partially Paid');
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Invoice ₹1,000, Payment ₹1,001 (Overpayment rejection)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Invoice ₹1,000, Payment ₹1,001 (Reject Overpayment) ---');
  {
    const check = validatePaymentAmount(1000, 1001);
    assert(!check.valid, 'Overpayment rejected');
    assert(check.excess === 1, 'Excess detected accurately as ₹1.00');

    // Never display negative balance
    const fin = calculateInvoiceFinancials(1000, 1001);
    assert(fin.balanceAmount === 0, 'Balance never negative: normalized to ₹0');
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Invoice ₹1,000, Payment ₹600 + ₹400 -> Download Invoice Document
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: Download Invoice with 2 Payments (₹600 + ₹400) ---');
  {
    const custId = `CUST-T8`;
    const inv = store.addInvoice({
      invoiceNumber: 'INV-TEST-008',
      customerId: custId,
      customerName: 'Sunil Kumar',
      customerPhone: '9812345678',
      status: 'Issued',
      date: '2026-10-01',
      dueDate: '2026-10-15',
      items: [{
        id: 'item-8',
        productName: 'Industrial Filter',
        unit: 'pcs',
        quantity: 2,
        buyPrice: 400,
        sellingPrice: 500,
        discountAmount: 0,
        taxPercent: 0,
        taxAmount: 0,
        total: 1000,
      }],
      subtotal: 1000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      templateId: 'modern-split',
    });

    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-T8-1',
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: custId,
      customerName: 'Sunil Kumar',
      amount: 600,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-01',
      reference: 'TXN-01',
    });

    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-T8-2',
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: custId,
      customerName: 'Sunil Kumar',
      amount: 400,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-05',
      reference: 'UPI-TXN-9988',
    });

    const fullInv = store.getInvoice(inv.id)!;
    const docData = normalizeInvoiceToDocument(fullInv, store.getSettings());
    const rendererProps = documentDataToRendererProps(docData);

    assert(rendererProps.grandTotal === 1000, 'Document grand total is ₹1,000');
    assert(rendererProps.paidAmount === 1000, 'Document paid amount is ₹1,000');
    assert(rendererProps.balanceAmount === 0, 'Document balance amount is ₹0');
    assert(Array.isArray(rendererProps.paymentHistory) && rendererProps.paymentHistory.length === 2, 'Payment history has exactly 2 payments');
    assert(rendererProps.paymentHistory![0].amount === 600 && rendererProps.paymentHistory![0].date === '2026-10-01' && rendererProps.paymentHistory![0].method === 'Cash', 'Document contains Payment 1 details');
    assert(rendererProps.paymentHistory![1].amount === 400 && rendererProps.paymentHistory![1].date === '2026-10-05' && rendererProps.paymentHistory![1].method === 'UPI', 'Document contains Payment 2 details');
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Invoice ₹1,000, Payments ₹600 + ₹200 -> Download Invoice (Partially Paid)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 9: Download Invoice with Partial Payments (₹600 + ₹200, Bal ₹200) ---');
  {
    const custId = `CUST-T9`;
    const inv = store.addInvoice({
      invoiceNumber: 'INV-TEST-009',
      customerId: custId,
      customerName: 'Ramesh Verma',
      customerPhone: '9812345679',
      status: 'Issued',
      date: '2026-10-02',
      dueDate: '2026-10-20',
      items: [{
        id: 'item-9',
        productName: 'Raw Materials',
        unit: 'kg',
        quantity: 10,
        buyPrice: 80,
        sellingPrice: 100,
        discountAmount: 0,
        taxPercent: 0,
        taxAmount: 0,
        total: 1000,
      }],
      subtotal: 1000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
      templateId: 'modern-split',
    });

    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-T9-1',
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: custId,
      customerName: 'Ramesh Verma',
      amount: 600,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-02',
    });

    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-T9-2',
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: custId,
      customerName: 'Ramesh Verma',
      amount: 200,
      paymentMethod: 'Bank Transfer',
      paymentDate: '2026-10-07',
      reference: 'NEFT-54321',
    });

    const fullInv = store.getInvoice(inv.id)!;
    const docData = normalizeInvoiceToDocument(fullInv, store.getSettings());
    const rendererProps = documentDataToRendererProps(docData);

    assert(rendererProps.paidAmount === 800, 'Total Paid is ₹800');
    assert(rendererProps.balanceAmount === 200, 'Outstanding is ₹200');
    assert(docData.financials.paymentStatus === 'PARTIALLY_PAID', 'Status is PARTIALLY PAID');
    assert(rendererProps.paymentHistory!.length === 2, 'Both payment records are visible');
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Two invoices for same customer (Isolation between Invoice A & B)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 10: Two Invoices for Same Customer (A: ₹1,000, B: ₹2,000) ---');
  {
    const custId = `CUST-T10`;
    const invA = store.addInvoice({
      invoiceNumber: 'INV-TEST-010-A',
      customerId: custId,
      customerName: 'Deepak Patel',
      customerPhone: '9711223344',
      status: 'Issued',
      date: '2026-10-01',
      dueDate: '2026-10-15',
      items: [{ id: 'i1', productName: 'Item A', unit: 'pcs', quantity: 1, buyPrice: 500, sellingPrice: 1000, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 1000 }],
      subtotal: 1000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1000,
      paidAmount: 600,
      balanceAmount: 400,
      templateId: 'modern-split',
    });

    const invB = store.addInvoice({
      invoiceNumber: 'INV-TEST-010-B',
      customerId: custId,
      customerName: 'Deepak Patel',
      customerPhone: '9711223344',
      status: 'Issued',
      date: '2026-10-03',
      dueDate: '2026-10-18',
      items: [{ id: 'i2', productName: 'Item B', unit: 'pcs', quantity: 1, buyPrice: 1000, sellingPrice: 2000, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 2000 }],
      subtotal: 2000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 2000,
      paidAmount: 1000,
      balanceAmount: 1000,
      templateId: 'modern-split',
    });

    // Pay ₹400 specifically against Invoice A
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-T10-A',
      invoiceId: invA.id,
      invoiceNumber: invA.invoiceNumber,
      customerId: custId,
      customerName: 'Deepak Patel',
      amount: 400,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-10',
    });

    const updatedA = store.getInvoice(invA.id)!;
    const updatedB = store.getInvoice(invB.id)!;

    assert(updatedA.balanceAmount === 0 && updatedA.status === 'Paid', 'Invoice A became Paid with ₹0 balance');
    assert(updatedB.balanceAmount === 1000 && updatedB.status === 'Partially Paid', 'Invoice B remained completely unchanged with ₹1,000 balance');
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Rapid Duplicate Payment Submission Prevention
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 11: Rapid Duplicate Payment Submission Prevention ---');
  {
    const custId = `CUST-T11`;
    const inv = store.addInvoice({
      invoiceNumber: 'INV-TEST-011',
      customerId: custId,
      customerName: 'Arjun Singhania',
      customerPhone: '9988776655',
      status: 'Issued',
      date: '2026-10-04',
      dueDate: '2026-10-20',
      items: [{ id: 'i11', productName: 'Service Pack', unit: 'hrs', quantity: 4, buyPrice: 100, sellingPrice: 100, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 400 }],
      subtotal: 400,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 400,
      paidAmount: 0,
      balanceAmount: 400,
      templateId: 'modern-split',
    });

    // 1st submission of ₹400
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-T11-FIRST',
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: custId,
      customerName: 'Arjun Singhania',
      amount: 400,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-04',
    });

    const settledInv = store.getInvoice(inv.id)!;
    assert(settledInv.balanceAmount === 0, 'First payment settled invoice to ₹0');

    // 2nd rapid submission of ₹400 must be rejected
    let secondPaymentRejected = false;
    try {
      store.recordUnifiedCustomerPayment({
        paymentId: 'PAY-T11-SECOND',
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: custId,
        customerName: 'Arjun Singhania',
        amount: 400,
        paymentMethod: 'UPI',
        paymentDate: '2026-10-04',
      });
    } catch (err: any) {
      secondPaymentRejected = true;
      assert(err.message.includes('already fully paid') || err.message.includes('exceeds'), 'Second payment threw rejection error: ' + err.message);
    }

    assert(secondPaymentRejected, 'Second payment rejected because invoice is already paid');
    const pays = store.getPaymentsForInvoice(inv.id);
    assert(pays.length === 1, 'Only ONE payment recorded in ledger; no duplicate');
  }

  // ---------------------------------------------------------------------------
  // TEST 12: Refresh / Re-login State Persistence
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 12: Refresh / Re-login Financial State Integrity ---');
  {
    // Reconcile and simulate reload
    const invoicesBefore = store.getInvoices();
    const paymentsBefore = store.getPayments();

    // Trigger state reconciliation
    store.syncRemoteInvoices(invoicesBefore);

    const invoicesAfter = store.getInvoices();
    const paymentsAfter = store.getPayments();

    assert(invoicesBefore.length === invoicesAfter.length, 'Invoice count identical after sync');
    assert(paymentsBefore.length === paymentsAfter.length, 'Payment count identical after sync');

    for (const inv of invoicesAfter) {
      if (inv.status === 'Paid') {
        assert(inv.balanceAmount === 0, `Invoice ${inv.invoiceNumber} paid status preserved with ₹0 balance`);
      }
    }
  }

  console.log('\n================================================================================');
  console.log('✅ ALL 12 REGRESSION TESTS COMPLETED AND VERIFIED SUCCESSFULLY!');
  console.log('================================================================================');
}

runTestSuite().catch((e) => {
  console.error('Test Suite encountered fatal error:', e);
  process.exit(1);
});
