import { store } from '../src/services/store';
import { Product, Invoice } from '../src/types';

function runTestSuite() {
  console.log('====================================================');
  console.log('VISTAAR — INVOICE FINALIZATION & PAYMENT TEST SUITE');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  }

  try {
    // ----------------------------------------------------
    // PREPARATION: Setup Test Catalog Product
    // ----------------------------------------------------
    const testProd = store.addProduct({
      name: 'Industrial Valve Assembly',
      sku: 'SKU-VALVE-01',
      categoryId: 'cat-1',
      unit: 'Pcs',
      buyPrice: 1000,
      sellingPrice: 2000,
      minimumStock: 5,
      initialStock: 23,
      hsnSac: '8481',
      gstRate: 18,
    });
    const testProdId = testProd.id;

    assert(store.getProductAvailableStock(testProdId) === 23, 'Product added with initial stock of 23 units');

    // ----------------------------------------------------
    // TEST 1: Unpaid Invoice Financial Calculations
    // ----------------------------------------------------
    const inv1 = store.addInvoice({
      customerName: 'Acme Corporation',
      customerPhone: '9876543210',
      status: 'Issued',
      date: '2026-08-28',
      dueDate: '2026-09-15',
      items: [
        {
          id: 'item-1',
          productId: testProdId,
          productName: 'Industrial Valve Assembly',
          sku: 'SKU-VALVE-01',
          unit: 'Pcs',
          quantity: 2,
          buyPrice: 1000,
          sellingPrice: 2000,
          discountAmount: 0,
          taxPercent: 18,
          taxAmount: 720,
          total: 4720,
        },
      ],
      subtotal: 4000,
      discountTotal: 0,
      taxTotal: 720,
      grandTotal: 4720,
      paidAmount: 0,
      balanceAmount: 4720,
      templateId: 'inv-modern-blue',
    });

    assert(inv1.paidAmount === 0, 'Unpaid invoice paidAmount is ₹0');
    assert(inv1.balanceAmount === 4720, 'Unpaid invoice balanceAmount equals Grand Total (₹4,720)');
    assert(inv1.status === 'Issued', 'Unpaid invoice status is Issued');

    // ----------------------------------------------------
    // TEST 2: Stock Deduction on Invoice Finalization
    // ----------------------------------------------------
    const stockAfterInv1 = store.getProductAvailableStock(testProdId);
    assert(stockAfterInv1 === 21, `Stock reduced from 23 to 21 (deducted 2 units), actual: ${stockAfterInv1}`);

    // ----------------------------------------------------
    // TEST 3: Partial Payment Calculation & Ledger Record
    // ----------------------------------------------------
    const pay1 = store.recordPayment({
      customerId: 'cust-1',
      customerName: 'Acme Corporation',
      invoiceId: inv1.id,
      invoiceNumber: inv1.invoiceNumber,
      amount: 2000,
      date: '2026-08-28',
      method: 'UPI',
      referenceNo: 'UPI987654321',
      notes: 'Advance partial payment',
    });

    const refreshedInv1 = store.getInvoices().find((i) => i.id === inv1.id)!;
    assert(refreshedInv1.paidAmount === 2000, `Paid amount updated to ₹2,000, actual: ${refreshedInv1.paidAmount}`);
    assert(refreshedInv1.balanceAmount === 2720, `Balance due updated to ₹2,720 (4720 - 2000), actual: ${refreshedInv1.balanceAmount}`);
    assert(refreshedInv1.status === 'Partially Paid', 'Invoice status updated to Partially Paid');

    // ----------------------------------------------------
    // TEST 4: Full Payment Completion via Subsequent Payment
    // ----------------------------------------------------
    store.recordPayment({
      customerId: 'cust-1',
      customerName: 'Acme Corporation',
      invoiceId: inv1.id,
      invoiceNumber: inv1.invoiceNumber,
      amount: 2720,
      date: '2026-08-28',
      method: 'Bank Transfer',
      referenceNo: 'NEFT00112233',
      notes: 'Final settlement payment',
    });

    const paidInv1 = store.getInvoices().find((i) => i.id === inv1.id)!;
    assert(paidInv1.paidAmount === 4720, `Total paid amount updated to ₹4,720, actual: ${paidInv1.paidAmount}`);
    assert(paidInv1.balanceAmount === 0, `Balance due reduced to ₹0, actual: ${paidInv1.balanceAmount}`);
    assert(paidInv1.status === 'Paid', 'Invoice status updated to Paid');

    // ----------------------------------------------------
    // TEST 5: Insufficient Stock Finalization Prevention
    // ----------------------------------------------------
    let stockErrorThrown = false;
    try {
      store.addInvoice({
        customerName: 'High Volume Buyer',
        customerPhone: '9999999999',
        status: 'Issued',
        date: '2026-08-28',
        dueDate: '2026-09-15',
        items: [
          {
            id: 'item-2',
            productId: testProdId,
            productName: 'Industrial Valve Assembly',
            unit: 'Pcs',
            quantity: 100, // Exceeds stock (available 21)
            buyPrice: 1000,
            sellingPrice: 2000,
            discountAmount: 0,
            taxPercent: 18,
            taxAmount: 36000,
            total: 236000,
          },
        ],
        subtotal: 200000,
        discountTotal: 0,
        taxTotal: 36000,
        grandTotal: 236000,
        paidAmount: 0,
        balanceAmount: 236000,
        templateId: 'inv-modern-blue',
      });
    } catch (e: any) {
      stockErrorThrown = true;
      assert(e.message.includes('Insufficient stock'), 'Caught insufficient stock exception on overbooking attempt');
    }
    assert(stockErrorThrown, 'Overbooking attempt threw error as expected');
    assert(store.getProductAvailableStock(testProdId) === 21, 'Stock remained unchanged at 21 after rejected finalization');

    // ----------------------------------------------------
    // TEST 6: Invoice Edit & Update Integrity
    // ----------------------------------------------------
    const inv2 = store.addInvoice({
      customerName: 'Test Client',
      customerPhone: '8888888888',
      status: 'Draft',
      date: '2026-08-28',
      dueDate: '2026-09-15',
      items: [
        {
          id: 'item-3',
          productId: testProdId,
          productName: 'Industrial Valve Assembly',
          unit: 'Pcs',
          quantity: 1,
          buyPrice: 1000,
          sellingPrice: 2000,
          discountAmount: 0,
          taxPercent: 18,
          taxAmount: 360,
          total: 2360,
        },
      ],
      subtotal: 2000,
      discountTotal: 0,
      taxTotal: 360,
      grandTotal: 2360,
      paidAmount: 0,
      balanceAmount: 2360,
      templateId: 'inv-modern-blue',
    });

    const stockBeforeFinalizeDraft = store.getProductAvailableStock(testProdId);
    store.updateInvoice(inv2.id, {
      status: 'Partially Paid',
      paidAmount: 1000,
      grandTotal: 2360,
    });

    const updatedInv2 = store.getInvoices().find((i) => i.id === inv2.id)!;
    assert(updatedInv2.paidAmount === 1000, 'Updated invoice paidAmount is ₹1,000');
    assert(updatedInv2.balanceAmount === 1360, 'Updated invoice balanceAmount is ₹1,360');
    assert(updatedInv2.status === 'Partially Paid', 'Updated invoice status is Partially Paid');
    assert(store.getProductAvailableStock(testProdId) === stockBeforeFinalizeDraft - 1, 'Stock deducted by 1 upon transitioning from Draft to Partially Paid');

    console.log('\n====================================================');
    console.log(`TEST SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('====================================================');

    if (passedTests === totalTests) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (e: any) {
    console.error('CRITICAL UNHANDLED TEST EXCEPTION:', e);
    process.exit(1);
  }
}

runTestSuite();
