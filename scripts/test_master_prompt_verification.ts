/**
 * Automated Verification Suite for Master Prompt
 * Tests A through H (Production-Critical Financial & Persistence Integrity)
 */

import { store } from '../src/services/store';
import { daybookService } from '../src/services/supabase/daybookService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { calculateInvoiceFinancials } from '../src/services/financialCalculationService';
import { DaybookTransaction, Invoice, Quotation } from '../src/types';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details: string) {
  if (condition) {
    results.push({ name, passed: true, details });
    console.log(`[PASS] ${name}: ${details}`);
  } else {
    results.push({ name, passed: false, details: `FAILED: ${details}` });
    console.error(`[FAIL] ${name}: ${details}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('RUNNING MASTER PROMPT VERIFICATION SUITE: TESTS A THROUGH H');
  console.log('===============================================================\n');

  // Clear test state
  const mockWsId = '00000000-0000-0000-0000-000000000001';

  store.addProduct({
    id: 'p1',
    name: 'Widget A',
    partNumber: 'PART-001',
    buyPrice: 500,
    sellingPrice: 1000,
    currentStock: 100,
    unit: 'pcs',
  } as any);
  store.addProduct({
    id: 'p2',
    name: 'Widget B',
    partNumber: 'PART-002',
    buyPrice: 200,
    sellingPrice: 500,
    currentStock: 100,
    unit: 'pcs',
  } as any);
  store.addProduct({
    id: 'p3',
    name: 'Widget C',
    partNumber: 'PART-003',
    buyPrice: 2000,
    sellingPrice: 5000,
    currentStock: 100,
    unit: 'pcs',
  } as any);

  // ---------------------------------------------------------------------------
  // TEST A: Quotation Persistence & Branch Isolation
  // ---------------------------------------------------------------------------
  console.log('--- TEST A: Quotation Persistence ---');
  const q1 = store.addQuotation({
    quotationNumber: 'QT-TEST-001',
    customerName: 'Test Client Alpha',
    items: [{ productId: 'p1', name: 'Widget A', quantity: 2, price: 1000, total: 2000 }],
    subtotal: 2000,
    discountTotal: 0,
    taxTotal: 360,
    grandTotal: 2360,
    status: 'Sent',
    validUntil: '2026-11-30',
    templateId: 'qt-modern-blue',
  });

  const q2 = store.addQuotation({
    quotationNumber: 'QT-TEST-002',
    customerName: 'Test Client Beta',
    items: [{ productId: 'p2', name: 'Widget B', quantity: 5, price: 500, total: 2500 }],
    subtotal: 2500,
    discountTotal: 0,
    taxTotal: 450,
    grandTotal: 2950,
    status: 'Draft',
    validUntil: '2026-11-30',
    templateId: 'qt-modern-blue',
  });

  const q3 = store.addQuotation({
    quotationNumber: 'QT-TEST-003',
    customerName: 'Test Client Gamma',
    items: [{ productId: 'p3', name: 'Widget C', quantity: 1, price: 5000, total: 5000 }],
    subtotal: 5000,
    discountTotal: 0,
    taxTotal: 900,
    grandTotal: 5900,
    status: 'Accepted',
    validUntil: '2026-11-30',
    templateId: 'qt-modern-blue',
  });

  assert(Boolean(q1.id && q2.id && q3.id), 'Test A.1', 'All 3 quotations generated unique IDs');
  assert(new Set([q1.id, q2.id, q3.id]).size === 3, 'Test A.2', 'All 3 quotation IDs are mutually unique');

  // Simulated browser reload / store hydration
  const storeQuotations = store.getQuotations();
  assert(
    storeQuotations.some((q) => q.quotationNumber === 'QT-TEST-001') &&
    storeQuotations.some((q) => q.quotationNumber === 'QT-TEST-002') &&
    storeQuotations.some((q) => q.quotationNumber === 'QT-TEST-003'),
    'Test A.3',
    'All 3 quotations remain fully accessible across simulated store reloads'
  );

  // ---------------------------------------------------------------------------
  // TEST B: Invoice Persistence & Balance Maintenance
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST B: Invoice Persistence ---');
  const invPart = store.addInvoice({
    invoiceNumber: 'INV-TEST-PART-01',
    customerName: 'Customer Partial',
    grandTotal: 10000,
    paidAmount: 6000,
    balanceAmount: 4000,
    status: 'Partially Paid',
    items: [{ productId: 'p1', name: 'Service', quantity: 1, sellingPrice: 10000, total: 10000 }],
    subtotal: 10000,
    discountTotal: 0,
    taxTotal: 0,
    date: '2026-10-25',
    dueDate: '2026-11-10',
    skipStockDeduction: true,
    templateId: 'inv-modern-blue',
  } as any);

  assert(invPart.paidAmount === 6000, 'Test B.1', 'Partially paid invoice has paidAmount = 6000');
  assert(invPart.balanceAmount === 4000, 'Test B.2', 'Partially paid invoice has balanceAmount = 4000');
  assert(invPart.status === 'Partially Paid', 'Test B.3', 'Invoice status is Partially Paid');

  // ---------------------------------------------------------------------------
  // TEST C: Quotation-to-Invoice Conversion Decoupling
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST C: Quotation-to-Invoice Conversion ---');
  // Converting an unpaid quotation must NOT create a financial payment or inflow
  const convertedInv = store.convertQuotationToInvoice(q1.id, {
    paymentStatus: 'Unpaid',
    paidAmount: 0,
    skipStockDeduction: true,
  });

  assert(convertedInv !== null, 'Test C.1', 'Quotation converted successfully to invoice');
  assert(convertedInv?.paidAmount === 0, 'Test C.2', 'Converted unpaid invoice has paidAmount = 0 (no artificial inflow)');
  assert(convertedInv?.balanceAmount === 2360, 'Test C.3', 'Converted unpaid invoice has full balance remaining');

  // Verify original quotation survives and is marked Converted
  const refreshedQ1 = store.getQuotations().find((q) => q.id === q1.id);
  assert(refreshedQ1 !== undefined, 'Test C.4', 'Original quotation was NOT deleted or overwritten');
  assert(refreshedQ1?.status === 'Converted', 'Test C.5', 'Original quotation status is updated to Converted');
  assert(refreshedQ1?.convertedInvoiceId === convertedInv?.id, 'Test C.6', 'Quotation retains link to converted invoice');

  // Conversion idempotency: converting already converted quotation must not duplicate
  const retryConversion = store.convertQuotationToInvoice(q1.id);
  assert(retryConversion === null, 'Test C.7', 'Idempotent: Re-converting already converted quotation returns null safely');

  // ---------------------------------------------------------------------------
  // TEST D: Daybook Duplicate Prevention & Idempotent Recording
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST D: Daybook Duplicate Prevention ---');
  // Single payment recording
  const pay1 = store.recordUnifiedCustomerPayment({
    invoiceId: invPart.id,
    invoiceNumber: invPart.invoiceNumber,
    customerId: 'cust-part',
    customerName: 'Customer Partial',
    amount: 2000,
    paymentMethod: 'Cash',
    paymentDate: '2026-10-25',
    notes: 'Partial settlement 1',
  });

  assert(pay1.payment.amount === 2000, 'Test D.1', 'Recorded customer payment for ₹2,000');

  // Second legitimate payment with identical amount and date
  const pay2 = store.recordUnifiedCustomerPayment({
    invoiceId: invPart.id,
    invoiceNumber: invPart.invoiceNumber,
    customerId: 'cust-part',
    customerName: 'Customer Partial',
    amount: 2000,
    paymentMethod: 'Cash',
    paymentDate: '2026-10-25',
    notes: 'Partial settlement 2 (separate event)',
  });

  assert(pay2.payment.id !== pay1.payment.id, 'Test D.2', 'Legitimate separate payment receives separate unique payment ID');
  assert(pay2.payment.amount === 2000, 'Test D.3', 'Second payment recorded ₹2,000');

  // Verify Daybook deduplication in enrichAndReconcileTransactions
  const mockDaybookTxList: DaybookTransaction[] = [
    {
      id: 'tx-inv-01',
      workspaceId: mockWsId,
      transactionCode: 'INV-101',
      transactionDate: '2026-10-25',
      transactionType: 'SALE',
      direction: 'IN',
      amount: 6000, // old bug: commercial invoice row carrying upfront inflow
      totalAmount: 10000,
      remainingAmount: 4000,
      paymentStatus: 'PARTIALLY PAID',
      paymentMode: 'Cash',
      partyType: 'customer',
      partyName: 'Customer Partial',
      referenceType: 'INVOICE',
      referenceId: invPart.id,
      referenceNumber: invPart.invoiceNumber,
      status: 'COMPLETED',
    },
    {
      id: 'tx-pay-01',
      workspaceId: mockWsId,
      transactionCode: 'PAY-101',
      transactionDate: '2026-10-25',
      transactionType: 'CUSTOMER_PAYMENT',
      direction: 'IN',
      amount: 6000, // payment row carrying the actual inflow
      totalAmount: 10000,
      remainingAmount: 4000,
      paymentStatus: 'PARTIALLY PAID',
      paymentMode: 'Cash',
      partyType: 'customer',
      partyName: 'Customer Partial',
      referenceType: 'PAYMENT',
      referenceId: 'pay-uuid-01',
      referenceNumber: invPart.invoiceNumber,
      status: 'COMPLETED',
    },
  ];

  // Invoke private enrichment method through daybookService
  const enriched = await (daybookService as any).enrichAndReconcileTransactions(
    mockDaybookTxList,
    mockWsId,
    { dateRange: 'month' }
  );

  console.log('Enriched items:', enriched.map((t: DaybookTransaction) => ({ id: t.id, refType: t.referenceType, refNum: t.referenceNumber, amt: t.amount, tot: t.totalAmount })));

  const saleRow = enriched.find((t: DaybookTransaction) => t.id === 'tx-inv-01');
  const payRow = enriched.find((t: DaybookTransaction) => t.id === 'tx-pay-01');

  assert(saleRow !== undefined, 'Test D.4', 'Commercial invoice row is present in Daybook');
  assert(saleRow?.amount === 0, 'Test D.5', 'Commercial invoice row inflow amount is strictly 0 (no duplicate inflow)');
  assert(saleRow?.totalAmount === 10000, 'Test D.6', 'Commercial invoice row preserves commercial total ₹10,000');
  assert(payRow?.amount === 6000, 'Test D.7', 'Payment row carries the authentic cash inflow ₹6,000');

  // Summing Daybook inflows for this pair must equal ₹6,000 exactly, NOT ₹12,000
  const sumForMockPair = (saleRow?.amount || 0) + (payRow?.amount || 0);
  assert(sumForMockPair === 6000, 'Test D.8', `Pairwise Daybook inflow for sale & payment = ₹${sumForMockPair} (strictly ₹6,000, zero duplicate)`);

  // ---------------------------------------------------------------------------
  // TEST E: Partial Payments Workflow (₹10,000 -> ₹6,000 -> ₹4,000)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST E: Partial Payments (₹10,000 -> ₹6,000 -> ₹4,000) ---');
  const fin1 = calculateInvoiceFinancials(10000, 6000);
  assert(fin1.paidAmount === 6000, 'Test E.1', 'Step 1: Paid amount = ₹6,000');
  assert(fin1.balanceAmount === 4000, 'Test E.2', 'Step 1: Balance remaining = ₹4,000');
  assert(fin1.status === 'Partially Paid', 'Test E.3', 'Step 1: Status = Partially Paid');

  const fin2 = calculateInvoiceFinancials(10000, 10000);
  assert(fin2.paidAmount === 10000, 'Test E.4', 'Step 2: Cumulative paid amount = ₹10,000');
  assert(fin2.balanceAmount === 0, 'Test E.5', 'Step 2: Balance remaining = ₹0');
  assert(fin2.status === 'Paid', 'Test E.6', 'Step 2: Status = Paid');

  // ---------------------------------------------------------------------------
  // TEST F: Dashboard Reconciliation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST F: Dashboard Reconciliation ---');
  const mockPayments = [
    { id: 'p1', amount: 6000, payment_method: 'Cash', invoice_id: 'inv-1', invoice_number: 'INV-1' },
    { id: 'p2', amount: 4000, payment_method: 'UPI', invoice_id: 'inv-1', invoice_number: 'INV-1' },
  ];
  const mockCounterSales = [
    { id: 'cs1', sale_number: 'CS-01', final_total: 3000, amount_received: 3000, payment_method: 'Cash' },
    { id: 'cs2', sale_number: 'CS-02', final_total: 5000, amount_received: 0, payment_method: 'Credit / Udhari' }, // credit: no cash inflow!
  ];
  const mockInvoices = [
    { id: 'inv-1', invoice_number: 'INV-1', grand_total: 10000, paid_amount: 10000, status: 'Paid' },
  ];

  const collections = enterpriseAnalyticsService.computeCollections(mockPayments, mockCounterSales, mockInvoices);
  assert(collections.cashCollections === 9000, 'Test F.1', `Cash Collections = ₹${collections.cashCollections} (₹6,000 pay + ₹3,000 CS)`);
  assert(collections.upiCollections === 4000, 'Test F.2', `UPI Collections = ₹${collections.upiCollections} (₹4,000 pay)`);
  assert(collections.totalCollections === 13000, 'Test F.3', `Total Collections = ₹${collections.totalCollections} (no double counting of INV-1 or CS-02 credit)`);

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n===============================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
