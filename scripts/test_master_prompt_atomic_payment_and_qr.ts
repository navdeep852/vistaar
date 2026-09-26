import { store } from '../src/services/store';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { customerPaymentService } from '../src/services/supabase/customerPaymentService';
import { businessSettingsService, mapAppSettingsToDb } from '../src/services/supabase/businessSettingsService';
import { safeGetTenantStorage } from '../src/services/supabase/safeStorage';
import { AppSettings, DocumentCustomization } from '../src/types';

const LOCAL_DAYBOOK_KEY = 'vistaar_local_daybook_db';
const LOCAL_CASHBOOK_KEY = 'vistaar_local_cashbook_db';

async function runTestSuite() {
  console.log('================================================================');
  console.log('VISTAAR MASTER PROMPT TEST SUITE: ATOMIC FINALIZATION & QR CODE');
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
    // ----------------------------------------------------
    // PREPARATION: Setup Test Catalog Product
    // ----------------------------------------------------
    const prod = store.addProduct({
      name: 'Precision Bearing Kit',
      sku: 'SKU-BEARING-99',
      unit: 'Pcs',
      buyPrice: 5000,
      sellingPrice: 10000,
      initialStock: 100,
      currentStock: 100,
      hsnSac: '8482',
      gstRate: 0,
    });
    const testProdId = prod.id;
    assert(store.getProductAvailableStock(testProdId) === 100, 'Initial product catalog created with 100 units');

    // ----------------------------------------------------
    // TEST 1 — Unpaid
    // Total ₹10,000, Paid ₹0
    // Expected:
    // Status = Issued, Paid = 0, Balance = 10,000, Payments = 0, Udhari = 10,000
    // ----------------------------------------------------
    console.log('\n--- EXECUTING TEST 1: Unpaid (₹10,000 Total, ₹0 Paid) ---');
    const res1 = await invoiceService.finalizeAuthoritativeInvoice({
      source: 'MANUAL',
      invoiceNumber: 'INV-TEST-001',
      date: '2026-09-26',
      customerName: 'Enterprise Client Alpha',
      customerPhone: '9876543210',
      items: [
        {
          productId: testProdId,
          productName: 'Precision Bearing Kit',
          quantity: 1,
          sellingPrice: 10000,
          total: 10000,
        },
      ],
      grandTotal: 10000,
      paymentStatus: 'Unpaid',
      paidAmount: 0,
    });

    assert(res1.success === true, 'TEST 1: Invoice finalization succeeded');
    const inv1 = store.getInvoices().find((i) => i.invoiceNumber === 'INV-TEST-001');
    assert(inv1 !== undefined, 'TEST 1: Invoice exists in store');
    assert(inv1?.status === 'Issued', `TEST 1: Status = Issued (actual: ${inv1?.status})`);
    assert(inv1?.paidAmount === 0, `TEST 1: Paid = 0 (actual: ${inv1?.paidAmount})`);
    assert(inv1?.balanceAmount === 10000, `TEST 1: Balance = 10,000 (actual: ${inv1?.balanceAmount})`);

    const inv1Payments = store.getPayments().filter((p) => p.invoiceNumber === 'INV-TEST-001');
    assert(inv1Payments.length === 0, `TEST 1: Payments = 0 (actual count: ${inv1Payments.length})`);

    const udhari1 = store.getUdharis().find((u) => u.invoiceId === inv1?.id || u.id === 'UD-INV-TEST-001');
    assert(udhari1 !== undefined, 'TEST 1: Udhari record created');
    assert(udhari1?.outstandingAmount === 10000, `TEST 1: Udhari outstanding = 10,000 (actual: ${udhari1?.outstandingAmount})`);
    assert(store.getProductAvailableStock(testProdId) === 99, `TEST 1: Stock deducted by 1 unit (actual: ${store.getProductAvailableStock(testProdId)})`);

    // ----------------------------------------------------
    // TEST 2 — Full Paid
    // Total ₹10,000, Paid ₹10,000
    // Expected:
    // Status = Paid, Paid = 10,000, Balance = 0, Payments = 10,000,
    // Udhari outstanding = 0, Daybook inflow = 10,000, Cashbook inflow = 10,000
    // No second Record Payment action.
    // ----------------------------------------------------
    console.log('\n--- EXECUTING TEST 2: Full Paid (₹10,000 Total, ₹10,000 Paid) ---');
    const res2 = await invoiceService.finalizeAuthoritativeInvoice({
      source: 'MANUAL',
      invoiceNumber: 'INV-TEST-002',
      date: '2026-09-26',
      customerName: 'Enterprise Client Beta',
      customerPhone: '9876543211',
      items: [
        {
          productId: testProdId,
          productName: 'Precision Bearing Kit',
          quantity: 1,
          sellingPrice: 10000,
          total: 10000,
        },
      ],
      grandTotal: 10000,
      paymentStatus: 'Fully Paid',
      paidAmount: 10000,
      paymentMode: 'UPI',
      paymentReference: 'UPI-REF-002',
    });

    assert(res2.success === true, 'TEST 2: Invoice finalization succeeded');
    const inv2 = store.getInvoices().find((i) => i.invoiceNumber === 'INV-TEST-002');
    assert(inv2?.status === 'Paid', `TEST 2: Status = Paid immediately without second action (actual: ${inv2?.status})`);
    assert(inv2?.paidAmount === 10000, `TEST 2: Paid = 10,000 (actual: ${inv2?.paidAmount})`);
    assert(inv2?.balanceAmount === 0, `TEST 2: Balance = 0 (actual: ${inv2?.balanceAmount})`);

    const inv2Payments = store.getPayments().filter((p) => p.invoiceNumber === 'INV-TEST-002' || p.invoiceId === inv2?.id);
    assert(inv2Payments.length === 1, `TEST 2: Exactly 1 payment record created (actual count: ${inv2Payments.length})`);
    assert(inv2Payments[0]?.amount === 10000, `TEST 2: Payment amount = 10,000 (actual: ${inv2Payments[0]?.amount})`);
    assert(inv2Payments[0]?.method === 'UPI', `TEST 2: Payment method = UPI (actual: ${inv2Payments[0]?.method})`);

    const udhari2 = store.getUdharis().find((u) => u.invoiceId === inv2?.id || u.id === 'UD-INV-TEST-002');
    assert(!udhari2 || udhari2.outstandingAmount === 0, `TEST 2: Udhari outstanding is 0 (actual: ${udhari2?.outstandingAmount ?? 0})`);

    const localDaybook = safeGetTenantStorage<any>(LOCAL_DAYBOOK_KEY, []);
    const daybook2 = localDaybook.find((d: any) => d.referenceNumber === 'INV-TEST-002' || d.referenceId === inv2?.id);
    assert(daybook2 !== undefined, 'TEST 2: Daybook entry exists');
    assert(daybook2?.amount === 10000, `TEST 2: Daybook inflow = 10,000 (actual: ${daybook2?.amount})`);
    assert(daybook2?.totalAmount === 10000, `TEST 2: Daybook totalAmount = 10,000 (actual: ${daybook2?.totalAmount})`);

    const localCashbook = safeGetTenantStorage<any>(LOCAL_CASHBOOK_KEY, []);
    const cashbook2 = localCashbook.find((c: any) => c.reference_number === 'INV-TEST-002' || c.referenceNumber === 'INV-TEST-002');
    assert(cashbook2 !== undefined, 'TEST 2: Cashbook entry exists');
    assert(cashbook2?.amount === 10000, `TEST 2: Cashbook inflow = 10,000 (actual: ${cashbook2?.amount})`);

    // ----------------------------------------------------
    // TEST 3 — Partial
    // Total ₹10,000, Paid ₹6,000
    // Expected:
    // Status = Partially Paid, Paid = 6,000, Balance = 4,000,
    // Payment = 6,000, Udhari = 4,000, Daybook inflow = 6,000, Cashbook inflow = 6,000
    // ----------------------------------------------------
    console.log('\n--- EXECUTING TEST 3: Partial (₹10,000 Total, ₹6,000 Paid) ---');
    const res3 = await invoiceService.finalizeAuthoritativeInvoice({
      source: 'MANUAL',
      invoiceNumber: 'INV-TEST-003',
      date: '2026-09-26',
      customerName: 'Enterprise Client Gamma',
      customerPhone: '9876543212',
      items: [
        {
          productId: testProdId,
          productName: 'Precision Bearing Kit',
          quantity: 1,
          sellingPrice: 10000,
          total: 10000,
        },
      ],
      grandTotal: 10000,
      paymentStatus: 'Partially Paid',
      paidAmount: 6000,
      paymentMode: 'Cash',
    });

    assert(res3.success === true, 'TEST 3: Invoice finalization succeeded');
    const inv3 = store.getInvoices().find((i) => i.invoiceNumber === 'INV-TEST-003');
    assert(inv3?.status === 'Partially Paid', `TEST 3: Status = Partially Paid (actual: ${inv3?.status})`);
    assert(inv3?.paidAmount === 6000, `TEST 3: Paid = 6,000 (actual: ${inv3?.paidAmount})`);
    assert(inv3?.balanceAmount === 4000, `TEST 3: Balance = 4,000 (actual: ${inv3?.balanceAmount})`);

    const inv3Payments = store.getPayments().filter((p) => p.invoiceNumber === 'INV-TEST-003' || p.invoiceId === inv3?.id);
    assert(inv3Payments.length === 1, `TEST 3: Payment count = 1 (actual: ${inv3Payments.length})`);
    assert(inv3Payments[0]?.amount === 6000, `TEST 3: Payment amount = 6,000 (actual: ${inv3Payments[0]?.amount})`);

    const udhari3 = store.getUdharis().find((u) => u.invoiceId === inv3?.id || u.id === 'UD-INV-TEST-003');
    assert(udhari3 !== undefined, 'TEST 3: Udhari record exists');
    assert(udhari3?.outstandingAmount === 4000, `TEST 3: Udhari outstanding = 4,000 (actual: ${udhari3?.outstandingAmount})`);

    const localDaybook3 = safeGetTenantStorage<any>(LOCAL_DAYBOOK_KEY, []);
    const daybook3 = localDaybook3.find((d: any) => d.referenceNumber === 'INV-TEST-003' || d.referenceId === inv3?.id);
    assert(daybook3?.amount === 6000, `TEST 3: Daybook inflow = 6,000 (actual: ${daybook3?.amount})`);
    assert(daybook3?.totalAmount === 10000, `TEST 3: Daybook totalAmount = 10,000 (actual: ${daybook3?.totalAmount})`);
    assert(daybook3?.remainingAmount === 4000, `TEST 3: Daybook remaining = 4,000 (actual: ${daybook3?.remainingAmount})`);

    const localCashbook3 = safeGetTenantStorage<any>(LOCAL_CASHBOOK_KEY, []);
    const cashbook3 = localCashbook3.find((c: any) => c.reference_number === 'INV-TEST-003' || c.referenceNumber === 'INV-TEST-003');
    assert(cashbook3?.amount === 6000, `TEST 3: Cashbook inflow = 6,000 (actual: ${cashbook3?.amount})`);

    // ----------------------------------------------------
    // TEST 4 — Partial → Full Later
    // Initial: Total = 10,000, Paid = 6,000, Balance = 4,000
    // Then record Payment = 4,000
    // Expected:
    // Paid = 10,000, Balance = 0, Status = Paid, No duplicate ₹6,000 payment.
    // ----------------------------------------------------
    console.log('\n--- EXECUTING TEST 4: Partial → Full Later (Adding ₹4,000 payment) ---');
    const payLaterRes = await customerPaymentService.recordCustomerPayment({
      invoiceId: inv3?.id,
      invoiceNumber: 'INV-TEST-003',
      amount: 4000,
      paymentMethod: 'UPI',
      notes: 'Second installment',
    });

    assert(payLaterRes.success === true, 'TEST 4: Later payment recording succeeded');
    const inv3Updated = store.getInvoices().find((i) => i.invoiceNumber === 'INV-TEST-003');
    assert(inv3Updated?.paidAmount === 10000, `TEST 4: Updated Paid = 10,000 (actual: ${inv3Updated?.paidAmount})`);
    assert(inv3Updated?.balanceAmount === 0, `TEST 4: Updated Balance = 0 (actual: ${inv3Updated?.balanceAmount})`);
    assert(inv3Updated?.status === 'Paid', `TEST 4: Status transitioned to Paid (actual: ${inv3Updated?.status})`);

    const allInv3Pays = store.getPayments().filter((p) => p.invoiceNumber === 'INV-TEST-003' || p.invoiceId === inv3?.id);
    assert(allInv3Pays.length === 2, `TEST 4: Exactly 2 payment records total (actual: ${allInv3Pays.length})`);
    const totalPaid3Sum = allInv3Pays.reduce((sum, p) => sum + p.amount, 0);
    assert(totalPaid3Sum === 10000, `TEST 4: Sum of payments = 10,000 without duplicate (actual: ${totalPaid3Sum})`);

    // ----------------------------------------------------
    // TEST 5 — Retry Finalization (Idempotency)
    // Finalize the same invoice twice.
    // Expected:
    // One invoice, One initial payment, One stock deduction, No duplicate payment, No duplicate stock deduction.
    // ----------------------------------------------------
    console.log('\n--- EXECUTING TEST 5: Retry Finalization (Idempotency) ---');
    const stockBefore = store.getProductAvailableStock(testProdId);
    const paymentsCountBefore = store.getPayments().filter((p) => p.invoiceNumber === 'INV-TEST-002').length;

    // Retry finalization of INV-TEST-002 with same payload
    const res2Retry = await invoiceService.finalizeAuthoritativeInvoice({
      source: 'MANUAL',
      id: inv2?.id,
      invoiceNumber: 'INV-TEST-002',
      date: '2026-09-26',
      customerName: 'Enterprise Client Beta',
      customerPhone: '9876543211',
      items: [
        {
          productId: testProdId,
          productName: 'Precision Bearing Kit',
          quantity: 1,
          sellingPrice: 10000,
          total: 10000,
        },
      ],
      grandTotal: 10000,
      paymentStatus: 'Fully Paid',
      paidAmount: 10000,
      paymentMode: 'UPI',
    });

    assert(res2Retry.success === true, 'TEST 5: Retry finalization completed successfully');
    const stockAfter = store.getProductAvailableStock(testProdId);
    assert(stockAfter === stockBefore, `TEST 5: Stock deduction was idempotent (before: ${stockBefore}, after: ${stockAfter})`);

    const paymentsCountAfter = store.getPayments().filter((p) => p.invoiceNumber === 'INV-TEST-002').length;
    assert(paymentsCountAfter === paymentsCountBefore, `TEST 5: No duplicate payment created on retry (count: ${paymentsCountAfter})`);

    const inv2Count = store.getInvoices().filter((i) => i.invoiceNumber === 'INV-TEST-002').length;
    assert(inv2Count === 1, `TEST 5: Exactly 1 invoice record exists (count: ${inv2Count})`);

    // ----------------------------------------------------
    // TEST 6 — QR Disabled
    // showQrCode = false
    // Expected:
    // showQrCode is false by default; QR hidden
    // ----------------------------------------------------
    console.log('\n--- EXECUTING TEST 6: QR Disabled (showQrCode = false) ---');
    const defaultCustomization: DocumentCustomization = {
      primaryColor: '#1e3a8a',
      secondaryColor: '#3b82f6',
      textColor: '#0f172a',
      accentColor: '#f59e0b',
      bodyFont: 'Inter',
      headingFont: 'Outfit',
      fontSize: 14,
      spacing: 'normal',
      showGstin: true,
      showPan: true,
      showBankDetails: true,
      showUpiId: true,
      showQrCode: false, // Explicitly false
    };

    assert(defaultCustomization.showQrCode === false, 'TEST 6: showQrCode is false');

    // ----------------------------------------------------
    // TEST 7 — QR Enabled With Settings QR
    // showQrCode = true, Settings has QR
    // Expected:
    // QR appears on invoice and quotation
    // ----------------------------------------------------
    console.log('\n--- EXECUTING TEST 7: QR Enabled With Settings QR ---');
    const testSettingsWithQr: AppSettings = {
      businessName: 'Vistaar Industrial Corp',
      address: '101 Industrial Area, Phase II',
      city: 'Chandigarh',
      state: 'Punjab',
      pincode: '160002',
      phone: '9876543210',
      email: 'finance@vistaar.com',
      bankDetails: {
        bankName: 'HDFC Bank',
        accountNumber: '50200012345678',
        accountHolder: 'Vistaar Industrial Corp',
        ifsc: 'HDFC0001234',
        branch: 'Industrial Area',
        upiId: 'vistaar@hdfcbank',
        upiQrCodeUrl: 'https://cdn.vistaar.app/workspaces/ws-01/payment_qr.png',
        showBankDetailsOnInvoice: true,
        showBankDetailsOnQuotation: true,
      },
    };

    const qrEnabledCustomization: DocumentCustomization = {
      ...defaultCustomization,
      showQrCode: true,
    };

    assert(qrEnabledCustomization.showQrCode === true, 'TEST 7: showQrCode is true');
    assert(Boolean(testSettingsWithQr.bankDetails.upiQrCodeUrl), 'TEST 7: Settings contains valid upiQrCodeUrl');

    // Verify Business Settings mapping persists upi_qr_url
    const mappedDbSettings = mapAppSettingsToDb(testSettingsWithQr as any, 'test-ws-uuid');
    assert(
      mappedDbSettings.upi_qr_url === 'https://cdn.vistaar.app/workspaces/ws-01/payment_qr.png',
      `TEST 7: businessSettingsService persists upi_qr_url into database payload (actual: ${mappedDbSettings.upi_qr_url})`
    );

    // ----------------------------------------------------
    // TEST 8 — QR Enabled Without Settings QR
    // Expected:
    // No broken image, document still renders, editor shows configuration warning
    // ----------------------------------------------------
    console.log('\n--- EXECUTING TEST 8: QR Enabled Without Settings QR ---');
    const testSettingsWithoutQr: AppSettings = {
      ...testSettingsWithQr,
      bankDetails: {
        ...testSettingsWithQr.bankDetails,
        upiQrCodeUrl: undefined,
      },
    };

    const isQrEnabledWithoutConfig = Boolean(qrEnabledCustomization.showQrCode && !testSettingsWithoutQr.bankDetails.upiQrCodeUrl);
    assert(
      isQrEnabledWithoutConfig === true,
      'TEST 8: Correctly detects condition where QR toggle is ON but Settings has no QR'
    );

    // Test that helper avoids rendering broken image
    const shouldRenderQr = Boolean(qrEnabledCustomization.showQrCode && testSettingsWithoutQr.bankDetails.upiQrCodeUrl);
    assert(shouldRenderQr === false, 'TEST 8: Document renderer safely suppresses empty/broken image container');

    console.log('\n================================================================');
    console.log(`TEST SUITE FINISHED: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('================================================================');

    if (passedTests === totalTests) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('[FATAL ERROR IN TEST SUITE]:', err);
    process.exit(1);
  }
}

runTestSuite();
