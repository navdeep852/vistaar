/**
 * MASTER PROMPT TEST MATRIX — VISTAAR UDHARI INVOICE ACTION CONSISTENCY & DECIMAL PAYMENT FIX
 *
 * Implements Section 13:
 * - Test A: Invoice action consistency (Unpaid, Partially Paid, Fully Paid, Legacy, Manual/Diagnostic)
 * - Test B: Decimal payment (₹1,000.00 total, ₹999.20 previously paid, ₹0.80 new payment -> ₹0.00, PAID)
 * - Test C: Ten-paise balance (₹1,000.00 total, ₹999.90 previously paid, ₹0.10 new payment -> ₹0.00, PAID)
 * - Test D: Genuine decimal outstanding (₹1,000.00 total, ₹899.50 previously paid -> ₹100.50, PARTIALLY PAID)
 * - Test E: Partial decimal payment (₹1,000.00 total, ₹999.20 previously paid, ₹0.40 new payment -> ₹0.40, PARTIALLY PAID)
 * - Test F: Duplicate payment prevention (₹0.80 payment submitted twice -> second rejected)
 * - Test G: Refresh persistence (store reload preserves ₹0.00 balance, PAID status, and payment history)
 * - Test H: Branch isolation (payment in Branch A does not alter Branch B ledger or dashboard)
 * - Test I: PDF and invoice history (after settlement, invoice downloads with full payment history and non-zero total)
 */

import { store } from '../src/services/store';
import {
  calculateInvoiceFinancials,
  calculateUdhariFinancials,
  calculateAuthoritativeInvoiceOutstanding,
  validatePaymentAmount,
  PAYMENT_TOLERANCE,
} from '../src/services/financialCalculationService';
import { normalizeInvoiceToDocument, documentDataToRendererProps } from '../src/services/document/documentData';
import { Invoice, UdhariRecord } from '../src/types';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

// Mirroring UdhariView's resolution logic for Test A verification
function resolveInvoiceForUdhari(u: Partial<UdhariRecord> & { [key: string]: any }): Invoice | undefined {
  const allInvoices = store.getInvoices();

  // 1. Direct invoiceId match
  if (u.invoiceId) {
    const byId = allInvoices.find((i) => i.id === u.invoiceId || i.invoiceNumber === u.invoiceId || (i as any).dbId === u.invoiceId);
    if (byId) return byId;
  }

  // 2. Direct invoice_id snake_case match
  const invIdSnake = (u as any).invoice_id;
  if (invIdSnake) {
    const bySnakeId = allInvoices.find((i) => i.id === invIdSnake || i.invoiceNumber === invIdSnake || (i as any).dbId === invIdSnake);
    if (bySnakeId) return bySnakeId;
  }

  // 3. Target code matching
  const targetCodes = [u.id, (u as any).udhariCode, (u as any).udhari_code].filter(Boolean);
  for (const code of targetCodes) {
    if (typeof code === 'string') {
      if (code.startsWith('UD-')) {
        const stripped = code.replace(/^UD-/i, '');
        const byStripped = allInvoices.find((i) => i.invoiceNumber.toLowerCase() === stripped.toLowerCase() || i.id.toLowerCase() === stripped.toLowerCase());
        if (byStripped) return byStripped;
      }
      const match = code.match(/INV-[\w-]+/i);
      if (match) {
        const byRegex = allInvoices.find((i) => i.invoiceNumber.toLowerCase() === match[0].toLowerCase() || i.id.toLowerCase() === match[0].toLowerCase());
        if (byRegex) return byRegex;
      }
    }
  }

  // 4. Notes containing invoice reference
  if (u.notes) {
    const match = u.notes.match(/INV-[\w-]+/i);
    if (match) {
      const byNum = allInvoices.find((i) => i.invoiceNumber.toLowerCase() === match[0].toLowerCase() || i.id.toLowerCase() === match[0].toLowerCase());
      if (byNum) return byNum;
    }
  }

  return undefined;
}

async function runMasterPromptMatrix() {
  console.log('================================================================================');
  console.log('MASTER PROMPT TEST MATRIX — VISTAAR UDHARI INVOICE & DECIMAL SETTLEMENT');
  console.log(`Configured Settlement Tolerance: ₹${PAYMENT_TOLERANCE.toFixed(2)}`);
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST A: Invoice Action Consistency
  // ---------------------------------------------------------------------------
  console.log('--- TEST A: Invoice Action Consistency Across Record States ---');
  {
    // A.1: Unpaid Invoice Record
    const invUnpaid = store.addInvoice({
      invoiceNumber: 'INV-TEST-A1-UNPAID',
      customerId: 'CUST-A1',
      customerName: 'Aditya Verma',
      status: 'Issued',
      date: '2026-10-01',
      dueDate: '2026-10-15',
      items: [{ id: 'i1', productName: 'Item 1', unit: 'pcs', quantity: 1, buyPrice: 100, sellingPrice: 500, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 500 }],
      subtotal: 500,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 500,
      paidAmount: 0,
      balanceAmount: 500,
    });
    const udhariUnpaid = store.getUdharis().find((u) => u.invoiceId === invUnpaid.id || u.id === `UD-${invUnpaid.invoiceNumber}`);
    assert(!!udhariUnpaid, 'Udhari record exists for unpaid invoice');
    const resolvedUnpaid = resolveInvoiceForUdhari(udhariUnpaid!);
    assert(!!resolvedUnpaid && resolvedUnpaid.id === invUnpaid.id, 'Unpaid Udhari record resolves linked invoice');

    // A.2: Partially Paid Invoice Record
    const invPartial = store.addInvoice({
      invoiceNumber: 'INV-TEST-A2-PARTIAL',
      customerId: 'CUST-A2',
      customerName: 'Vaishali Sharma',
      status: 'Issued',
      date: '2026-10-01',
      dueDate: '2026-10-15',
      items: [{ id: 'i2', productName: 'Item 2', unit: 'pcs', quantity: 1, buyPrice: 200, sellingPrice: 1000, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 1000 }],
      subtotal: 1000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1000,
      paidAmount: 400,
      balanceAmount: 600,
    });
    const udhariPartial = store.getUdharis().find((u) => u.invoiceId === invPartial.id || u.id === `UD-${invPartial.invoiceNumber}`);
    assert(!!udhariPartial, 'Udhari record exists for partially paid invoice');
    const resolvedPartial = resolveInvoiceForUdhari(udhariPartial!);
    assert(!!resolvedPartial && resolvedPartial.id === invPartial.id, 'Partially paid Udhari record resolves linked invoice');

    // A.3: Fully Paid Invoice Record
    const invPaid = store.addInvoice({
      invoiceNumber: 'INV-TEST-A3-PAID',
      customerId: 'CUST-A3',
      customerName: 'Hardik Patel',
      status: 'Issued',
      date: '2026-10-01',
      dueDate: '2026-10-15',
      items: [{ id: 'i3', productName: 'Item 3', unit: 'pcs', quantity: 1, buyPrice: 300, sellingPrice: 800, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 800 }],
      subtotal: 800,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 800,
      paidAmount: 0,
      balanceAmount: 800,
    });
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-A3',
      invoiceId: invPaid.id,
      invoiceNumber: invPaid.invoiceNumber,
      customerId: 'CUST-A3',
      customerName: 'Hardik Patel',
      amount: 800,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-02',
    });
    const udhariPaid = store.getUdharis().find((u) => u.invoiceId === invPaid.id || u.id === `UD-${invPaid.invoiceNumber}`);
    assert(!!udhariPaid, 'Udhari record exists for fully settled invoice');
    const resolvedPaid = resolveInvoiceForUdhari(udhariPaid!);
    assert(!!resolvedPaid && resolvedPaid.id === invPaid.id, 'Fully paid Udhari record resolves linked invoice (NOT hidden)');

    // A.4: Legacy Udhari Record with udhariCode or notes reference
    const legacyUdhari: any = {
      id: 'UD-UUID-999-LEGACY',
      udhariCode: 'UD-INV-TEST-A1-UNPAID',
      customerName: 'Aditya Verma',
      originalAmount: 500,
      totalReceived: 0,
      outstandingAmount: 500,
      status: 'PENDING',
      notes: 'Migrated ledger entry referencing INV-TEST-A1-UNPAID',
    };
    const resolvedLegacy = resolveInvoiceForUdhari(legacyUdhari);
    assert(!!resolvedLegacy && resolvedLegacy.invoiceNumber === 'INV-TEST-A1-UNPAID', 'Legacy Udhari record with valid code/notes resolves invoice');

    // A.5: Manual / Unlinked Record (Diagnostics path)
    const manualUdhari: any = {
      id: 'UD-MANUAL-ENTRY-888',
      customerName: 'Hulk Direct Credit',
      originalAmount: 2500,
      totalReceived: 0,
      outstandingAmount: 2500,
      status: 'PENDING',
      notes: 'Direct loan given in cash without invoice',
    };
    const resolvedManual = resolveInvoiceForUdhari(manualUdhari);
    assert(resolvedManual === undefined, 'Manual unlinked record does NOT invent a fake invoice');
  }

  // ---------------------------------------------------------------------------
  // TEST B: Decimal Payment (₹1,000 Total, ₹999.20 Paid, ₹0.80 New Payment)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST B: Decimal Payment (₹0.80 Settlement) ---');
  {
    const invB = store.addInvoice({
      invoiceNumber: 'INV-TEST-B-080',
      customerId: 'CUST-B',
      customerName: 'Vaishali Sharma',
      status: 'Issued',
      date: '2026-10-05',
      dueDate: '2026-10-20',
      items: [{ id: 'ib', productName: 'Fabrics', unit: 'mtr', quantity: 1, buyPrice: 500, sellingPrice: 1000, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 1000 }],
      subtotal: 1000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
    });

    // Initial payment: ₹999.20
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-B-1',
      invoiceId: invB.id,
      invoiceNumber: invB.invoiceNumber,
      customerId: 'CUST-B',
      customerName: 'Vaishali Sharma',
      amount: 999.20,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-05',
    });

    const midFin = store.getInvoice(invB.id)!;
    assert(midFin.paidAmount === 999.20, 'Initial paid amount is ₹999.20');
    assert(midFin.balanceAmount === 0.80, 'Midway balance is exact ₹0.80');
    assert(midFin.status === 'Partially Paid', 'Midway status is Partially Paid (NOT falsely settled)');

    // Validate ₹0.80 payment input
    const val = validatePaymentAmount(0.80, 0.80);
    assert(val.valid, 'Payment validation accepts ₹0.80');

    // Record the exact decimal payment: ₹0.80
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-B-2',
      invoiceId: invB.id,
      invoiceNumber: invB.invoiceNumber,
      customerId: 'CUST-B',
      customerName: 'Vaishali Sharma',
      amount: 0.80,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-06',
    });

    const settledB = store.getInvoice(invB.id)!;
    assert(settledB.paidAmount === 1000, 'Total Paid is ₹1,000.00');
    assert(settledB.balanceAmount === 0, 'Outstanding is ₹0.00');
    assert(settledB.status === 'Paid', 'Invoice status is PAID');

    const udhariB = store.getUdharis().find((u) => u.invoiceId === invB.id || u.id === `UD-${invB.invoiceNumber}`)!;
    assert(udhariB.outstandingAmount === 0, 'Udhari outstanding is ₹0.00');
    assert(udhariB.status === 'PAID', 'Udhari status is PAID');
    assert(udhariB.totalReceived === 1000, 'Udhari totalReceived is ₹1,000.00');
  }

  // ---------------------------------------------------------------------------
  // TEST C: Ten-paise balance (₹1,000 Total, ₹999.90 Paid, ₹0.10 New Payment)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST C: Ten-Paise Balance (₹0.10 Settlement) ---');
  {
    const invC = store.addInvoice({
      invoiceNumber: 'INV-TEST-C-010',
      customerId: 'CUST-C',
      customerName: 'Hardik Patel',
      status: 'Issued',
      date: '2026-10-06',
      dueDate: '2026-10-21',
      items: [{ id: 'ic', productName: 'Hardware Kit', unit: 'set', quantity: 1, buyPrice: 500, sellingPrice: 1000, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 1000 }],
      subtotal: 1000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
    });

    // Initial payment: ₹999.90
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-C-1',
      invoiceId: invC.id,
      invoiceNumber: invC.invoiceNumber,
      customerId: 'CUST-C',
      customerName: 'Hardik Patel',
      amount: 999.90,
      paymentMethod: 'Bank Transfer',
      paymentDate: '2026-10-06',
    });

    const midFin = store.getInvoice(invC.id)!;
    assert(midFin.balanceAmount === 0.10, 'Midway balance is exact ₹0.10');
    assert(midFin.status === 'Partially Paid', 'Midway status is Partially Paid');

    // Record ₹0.10 payment
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-C-2',
      invoiceId: invC.id,
      invoiceNumber: invC.invoiceNumber,
      customerId: 'CUST-C',
      customerName: 'Hardik Patel',
      amount: 0.10,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-07',
    });

    const settledC = store.getInvoice(invC.id)!;
    assert(settledC.paidAmount === 1000, 'Total Paid is ₹1,000.00');
    assert(settledC.balanceAmount === 0, 'Outstanding is ₹0.00');
    assert(settledC.status === 'Paid', 'Status is PAID');
  }

  // ---------------------------------------------------------------------------
  // TEST D: Genuine Decimal Outstanding (₹1,000 Total, ₹899.50 Paid)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST D: Genuine Decimal Outstanding (₹100.50 Balance) ---');
  {
    const fin = calculateInvoiceFinancials(1000, 899.50);
    assert(fin.paidAmount === 899.50, 'Paid amount is ₹899.50');
    assert(fin.balanceAmount === 100.50, 'Outstanding is exact ₹100.50');
    assert(fin.status === 'Partially Paid', 'Status is PARTIALLY PAID');

    const udFin = calculateUdhariFinancials(1000, 899.50);
    assert(udFin.outstandingAmount === 100.50, 'Udhari outstanding is ₹100.50');
    assert(udFin.status === 'PARTIALLY PAID', 'Udhari status is PARTIALLY PAID');
  }

  // ---------------------------------------------------------------------------
  // TEST E: Partial Decimal Payment (₹1,000 Total, ₹999.20 Paid, New Payment ₹0.40)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST E: Partial Decimal Payment (₹0.40 Paid -> ₹0.40 Remaining) ---');
  {
    const invE = store.addInvoice({
      invoiceNumber: 'INV-TEST-E-040',
      customerId: 'CUST-E',
      customerName: 'Aditya Part-Pay',
      status: 'Issued',
      date: '2026-10-07',
      dueDate: '2026-10-22',
      items: [{ id: 'ie', productName: 'Raw Material', unit: 'kg', quantity: 1, buyPrice: 500, sellingPrice: 1000, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 1000 }],
      subtotal: 1000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1000,
      paidAmount: 0,
      balanceAmount: 1000,
    });

    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-E-1',
      invoiceId: invE.id,
      invoiceNumber: invE.invoiceNumber,
      customerId: 'CUST-E',
      customerName: 'Aditya Part-Pay',
      amount: 999.20,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-07',
    });

    // Record partial ₹0.40 payment
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-E-2',
      invoiceId: invE.id,
      invoiceNumber: invE.invoiceNumber,
      customerId: 'CUST-E',
      customerName: 'Aditya Part-Pay',
      amount: 0.40,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-08',
    });

    const midE = store.getInvoice(invE.id)!;
    assert(midE.paidAmount === 999.60, 'Total Paid is ₹999.60');
    assert(midE.balanceAmount === 0.40, 'Outstanding remains exact ₹0.40');
    assert(midE.status === 'Partially Paid', 'Status is PARTIALLY PAID (No false PAID status)');

    const udhariE = store.getUdharis().find((u) => u.invoiceId === invE.id || u.id === `UD-${invE.invoiceNumber}`)!;
    assert(udhariE.outstandingAmount === 0.40, 'Udhari outstanding remains ₹0.40');
    assert(udhariE.status === 'PARTIALLY PAID', 'Udhari status remains PARTIALLY PAID');
  }

  // ---------------------------------------------------------------------------
  // TEST F: Duplicate Payment Prevention
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST F: Duplicate Payment Prevention ---');
  {
    const invF = store.addInvoice({
      invoiceNumber: 'INV-TEST-F-DUP',
      customerId: 'CUST-F',
      customerName: 'Secure Payer',
      status: 'Issued',
      date: '2026-10-08',
      dueDate: '2026-10-23',
      items: [{ id: 'if', productName: 'Item F', unit: 'pcs', quantity: 1, buyPrice: 500, sellingPrice: 1000, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 1000 }],
      subtotal: 1000,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 1000,
      paidAmount: 999.20,
      balanceAmount: 0.80,
    });

    // First ₹0.80 payment
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-F-1',
      invoiceId: invF.id,
      invoiceNumber: invF.invoiceNumber,
      customerId: 'CUST-F',
      customerName: 'Secure Payer',
      amount: 0.80,
      paymentMethod: 'UPI',
      paymentDate: '2026-10-08',
    });

    const afterFirst = store.getInvoice(invF.id)!;
    assert(afterFirst.balanceAmount === 0, 'First payment settles invoice to ₹0');

    // Attempt second submission of ₹0.80
    let rejected = false;
    try {
      store.recordUnifiedCustomerPayment({
        paymentId: 'PAY-F-2',
        invoiceId: invF.id,
        invoiceNumber: invF.invoiceNumber,
        customerId: 'CUST-F',
        customerName: 'Secure Payer',
        amount: 0.80,
        paymentMethod: 'UPI',
        paymentDate: '2026-10-08',
      });
    } catch (err: any) {
      rejected = true;
      assert(err.message.includes('already fully paid') || err.message.includes('exceeds'), 'Second payment rejected with informative error');
    }
    assert(rejected, 'Second payment submission successfully rejected');
    const paysF = store.getPaymentsForInvoice(invF.id);
    assert(!paysF.some((p) => p.id === 'PAY-F-2'), 'Duplicate payment PAY-F-2 is NOT present in ledger');
    assert(paysF.length === 2, 'Exactly 2 payments recorded in ledger (initial ₹999.20 + single ₹0.80; no duplicate)');
  }

  // ---------------------------------------------------------------------------
  // TEST G: Refresh Persistence
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST G: Refresh / State Reconciliation Persistence ---');
  {
    const invoicesBefore = store.getInvoices();
    const invB_before = invoicesBefore.find((i) => i.invoiceNumber === 'INV-TEST-B-080')!;
    assert(invB_before.balanceAmount === 0 && invB_before.status === 'Paid', 'Invoice B is paid before sync');

    // Reconcile state
    store.syncRemoteInvoices(invoicesBefore);

    const invoicesAfter = store.getInvoices();
    const invB_after = invoicesAfter.find((i) => i.invoiceNumber === 'INV-TEST-B-080')!;
    assert(invB_after.balanceAmount === 0, 'Invoice B remains ₹0.00 after reconciliation');
    assert(invB_after.status === 'Paid', 'Invoice B remains PAID after reconciliation');

    const udharisAfter = store.getUdharis();
    const udhariB_after = udharisAfter.find((u) => u.invoiceId === invB_after.id || u.id === `UD-${invB_after.invoiceNumber}`)!;
    assert(udhariB_after.outstandingAmount === 0, 'Udhari outstanding remains ₹0.00 after reconciliation');
    assert(udhariB_after.status === 'PAID', 'Udhari status remains PAID after reconciliation');
  }

  // ---------------------------------------------------------------------------
  // TEST H: Branch Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST H: Branch Isolation ---');
  {
    const branchA = 'BRANCH-ALPHA';
    const branchB = 'BRANCH-BETA';

    // Invoice in Branch A
    const invBranchA = store.addInvoice({
      invoiceNumber: 'INV-BRANCH-A',
      branchId: branchA,
      customerId: 'CUST-BR-A',
      customerName: 'Branch A Customer',
      status: 'Issued',
      date: '2026-10-09',
      dueDate: '2026-10-24',
      items: [{ id: 'ia', productName: 'Branch A Goods', unit: 'pcs', quantity: 1, buyPrice: 400, sellingPrice: 500, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 500 }],
      subtotal: 500,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 500,
      paidAmount: 499.20,
      balanceAmount: 0.80,
    });

    // Invoice in Branch B
    const invBranchB = store.addInvoice({
      invoiceNumber: 'INV-BRANCH-B',
      branchId: branchB,
      customerId: 'CUST-BR-B',
      customerName: 'Branch B Customer',
      status: 'Issued',
      date: '2026-10-09',
      dueDate: '2026-10-24',
      items: [{ id: 'ib', productName: 'Branch B Goods', unit: 'pcs', quantity: 1, buyPrice: 400, sellingPrice: 500, discountAmount: 0, taxPercent: 0, taxAmount: 0, total: 500 }],
      subtotal: 500,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal: 500,
      paidAmount: 499.20,
      balanceAmount: 0.80,
    });

    // Record payment only for Branch A
    store.recordUnifiedCustomerPayment({
      paymentId: 'PAY-BR-A',
      invoiceId: invBranchA.id,
      invoiceNumber: invBranchA.invoiceNumber,
      customerId: 'CUST-BR-A',
      customerName: 'Branch A Customer',
      amount: 0.80,
      paymentMethod: 'Cash',
      paymentDate: '2026-10-09',
    });

    const checkBranchA = store.getInvoice(invBranchA.id)!;
    const checkBranchB = store.getInvoice(invBranchB.id)!;

    assert(checkBranchA.balanceAmount === 0 && checkBranchA.status === 'Paid', 'Branch A invoice settled to ₹0');
    assert(checkBranchB.balanceAmount === 0.80 && checkBranchB.status === 'Partially Paid', 'Branch B invoice untouched with ₹0.80 balance');
  }

  // ---------------------------------------------------------------------------
  // TEST I: PDF and Invoice History
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST I: PDF Generation and Invoice History Preservation ---');
  {
    const settledInv = store.getInvoice('INV-TEST-B-080') || store.getInvoices().find((i) => i.invoiceNumber === 'INV-TEST-B-080')!;
    assert(!!settledInv, 'Settled invoice retrieved');

    const docData = normalizeInvoiceToDocument(settledInv, store.getSettings());
    const rendererProps = documentDataToRendererProps(docData);

    assert(rendererProps.grandTotal === 1000, 'Original invoice total preserved as ₹1,000.00 (NOT rewritten to zero)');
    assert(rendererProps.paidAmount === 1000, 'Document paid amount is ₹1,000.00');
    assert(rendererProps.balanceAmount === 0, 'Document balance amount is ₹0.00');
    assert(Array.isArray(rendererProps.paymentHistory) && rendererProps.paymentHistory.length === 2, 'Full payment history (2 payments) preserved');
    assert(rendererProps.paymentHistory![0].amount === 999.20, 'Payment 1 preserved: ₹999.20');
    assert(rendererProps.paymentHistory![1].amount === 0.80, 'Payment 2 preserved: ₹0.80');
  }

  console.log('\n================================================================================');
  console.log('✅ ALL TESTS A THROUGH I IN MASTER PROMPT TEST MATRIX PASSED SUCCESSFULLY!');
  console.log('================================================================================');
}

runMasterPromptMatrix().catch((err) => {
  console.error('Fatal error in Master Prompt Test Matrix:', err);
  process.exit(1);
});
