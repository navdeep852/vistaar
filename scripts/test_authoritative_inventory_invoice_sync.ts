import { store } from '../src/services/store';
import { Product } from '../src/types';

function runAuthoritativeInventoryTestSuite() {
  console.log('================================================================');
  console.log('VISTAAR — AUTHORITATIVE INVENTORY & INVOICE SYNC TEST SUITE');
  console.log('================================================================\n');

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
    // ------------------------------------------------------------------
    // TEST 1 & PREPARATION: Exact Screenshot Scenario setup (Product 7077)
    // ------------------------------------------------------------------
    const prod7077 = store.addProduct({
      name: '7077',
      partNumber: '1000077',
      sku: '1000077',
      category: 'Bearing',
      unit: 'Piece',
      buyPrice: 300,
      sellingPrice: 430,
      minimumStock: 10,
      initialStock: 102,
      hsnSac: '8482',
      gstRate: 18,
    });

    assert(prod7077 !== undefined && prod7077.id !== undefined, 'Product 7077 created with canonical UUID');
    const initialStock = store.getProductAvailableStock(prod7077.id);
    assert(initialStock === 102, `Authoritative stock for Product 7077 is exactly 102 Piece (actual: ${initialStock})`);

    // ------------------------------------------------------------------
    // TEST 2: Finalize Invoice for 12 units of Product 7077 (102 >= 12)
    // ------------------------------------------------------------------
    const inv1 = store.addInvoice({
      customerName: 'Shree Krishna Auto',
      customerPhone: '9876543210',
      status: 'Issued',
      date: '2026-08-28',
      dueDate: '2026-09-15',
      items: [
        {
          id: 'item-7077-1',
          productId: prod7077.id,
          productName: '7077',
          partNumber: '1000077',
          sku: '1000077',
          unit: 'Piece',
          quantity: 12,
          buyPrice: 300,
          sellingPrice: 430,
          discountAmount: 0,
          taxPercent: 18,
          taxAmount: 928.8,
          total: 6088.8,
        },
      ],
      subtotal: 5160,
      discountTotal: 0,
      taxTotal: 928.8,
      grandTotal: 6088.8,
      paidAmount: 0,
      balanceAmount: 6088.8,
      templateId: 'inv-modern-blue',
    });

    assert(inv1 !== undefined && inv1.id !== undefined, 'Invoice for 12 units of 7077 created successfully');
    const stockAfterSale = store.getProductAvailableStock(prod7077.id);
    assert(
      stockAfterSale === 90,
      `Authoritative stock correctly reduced from 102 to 90 Piece after selling 12 units (actual: ${stockAfterSale})`
    );

    // Verify Stock Movement Audit Entry
    const receipts = store.getStockReceipts(prod7077.id);
    const totalRemainingReceiptStock = receipts.reduce((acc, r) => acc + r.quantityRemaining, 0);
    assert(
      totalRemainingReceiptStock === 90,
      `FIFO Stock Receipt remaining quantity is exactly 90 Piece (actual: ${totalRemainingReceiptStock})`
    );

    // ------------------------------------------------------------------
    // TEST 3: Overbooking Insufficient Stock Test (Stock: 90, Requested: 150)
    // ------------------------------------------------------------------
    let overbookErrorCaught = false;
    try {
      store.addInvoice({
        customerName: 'Excess Buyer',
        customerPhone: '9999999999',
        status: 'Issued',
        date: '2026-08-28',
        dueDate: '2026-09-15',
        items: [
          {
            id: 'item-7077-overbook',
            productId: prod7077.id,
            productName: '7077',
            partNumber: '1000077',
            sku: '1000077',
            unit: 'Piece',
            quantity: 150, // Exceeds available stock of 90
            buyPrice: 300,
            sellingPrice: 430,
            discountAmount: 0,
            taxPercent: 18,
            taxAmount: 11610,
            total: 76110,
          },
        ],
        subtotal: 64500,
        discountTotal: 0,
        taxTotal: 11610,
        grandTotal: 76110,
        paidAmount: 0,
        balanceAmount: 76110,
        templateId: 'inv-modern-blue',
      });
    } catch (e: any) {
      overbookErrorCaught = true;
      assert(
        e.message.includes('Insufficient stock'),
        `Caught insufficient stock exception: "${e.message}"`
      );
    }
    assert(overbookErrorCaught, 'Overbooking 150 units rejected as expected');
    assert(
      store.getProductAvailableStock(prod7077.id) === 90,
      'Stock remained unchanged at 90 Piece after rejected overbooking attempt'
    );

    // ------------------------------------------------------------------
    // TEST 4: Full Stock Depletion (Selling all remaining 90 units)
    // ------------------------------------------------------------------
    const invClear = store.addInvoice({
      customerName: 'Bulk Clearing Agent',
      customerPhone: '8888888888',
      status: 'Issued',
      date: '2026-08-28',
      dueDate: '2026-09-15',
      items: [
        {
          id: 'item-7077-clear',
          productId: prod7077.id,
          productName: '7077',
          partNumber: '1000077',
          sku: '1000077',
          unit: 'Piece',
          quantity: 90, // Exactly depletes available stock
          buyPrice: 300,
          sellingPrice: 430,
          discountAmount: 0,
          taxPercent: 18,
          taxAmount: 6966,
          total: 45666,
        },
      ],
      subtotal: 38700,
      discountTotal: 0,
      taxTotal: 6966,
      grandTotal: 45666,
      paidAmount: 45666,
      balanceAmount: 0,
      templateId: 'inv-modern-blue',
    });

    assert(invClear !== undefined && invClear.id !== undefined, 'Invoice clearing remaining 90 units created');
    const stockAfterDepletion = store.getProductAvailableStock(prod7077.id);
    assert(stockAfterDepletion === 0, `Authoritative stock after full depletion is 0 Piece (actual: ${stockAfterDepletion})`);

    // ------------------------------------------------------------------
    // TEST 5: Stock Receipt Top-Up & Subsequent Invoice Finalization
    // ------------------------------------------------------------------
    const newProd = store.addProduct({
      name: 'Ball Bearing 6205',
      partNumber: '6205-2RS',
      sku: '6205-2RS',
      unit: 'Piece',
      buyPrice: 150,
      sellingPrice: 250,
      minimumStock: 5,
      initialStock: 50,
    });

    assert(store.getProductAvailableStock(newProd.id) === 50, 'New product 6205 added with 50 units stock');

    // Add additional GRN receipt of 30 units
    store.addStockReceipt({
      productId: newProd.id,
      supplierId: 'supp-1',
      receiptNumber: 'GRN-TEST-02',
      quantityReceived: 30,
      quantityRemaining: 30,
      buyPrice: 150,
      receivedDate: '2026-08-28',
    });

    const stockAfterGRN = store.getProductAvailableStock(newProd.id);
    assert(stockAfterGRN === 80, `Authoritative stock updated to 80 units after adding GRN (50 + 30) (actual: ${stockAfterGRN})`);

    // Sell 25 units
    store.addInvoice({
      customerName: 'Workshop Client',
      status: 'Issued',
      items: [
        {
          id: 'item-6205-1',
          productId: newProd.id,
          productName: 'Ball Bearing 6205',
          quantity: 25,
          buyPrice: 150,
          sellingPrice: 250,
          total: 6250,
        },
      ],
      subtotal: 6250,
      grandTotal: 6250,
      paidAmount: 6250,
      balanceAmount: 0,
    });

    const stockAfterSale2 = store.getProductAvailableStock(newProd.id);
    assert(stockAfterSale2 === 55, `Stock reduced from 80 to 55 after selling 25 units (actual: ${stockAfterSale2})`);

    console.log('\n================================================================');
    console.log(`TEST SUITE COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('================================================================');

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

runAuthoritativeInventoryTestSuite();
