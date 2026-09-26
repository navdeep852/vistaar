import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { INVOICE_TEMPLATES, getInvoiceTemplateById } from '../src/templates/invoices/registry';
import { INVOICE_TEMPLATES as GALLERY_INVOICE_TEMPLATES } from '../src/templates/invoiceTemplates';
import { InvoiceTemplateEngineRenderer } from '../src/templates/invoices/InvoiceTemplateEngineRenderer';
import { InvoiceData, BusinessData, CustomerData } from '../src/templates/invoices/types';
import { DocumentCustomization, BrandingConfig } from '../src/types/template';

function runTemplateTestSuite() {
  console.log('================================================================');
  console.log('VISTAAR TEST SUITE: TEMPLATES 31 & 32 AUTOMATED VERIFICATION');
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

  // ----------------------------------------------------
  // TEST 1: Template Count Verification (30 Existing + 2 New = 32 Total)
  // ----------------------------------------------------
  console.log('--- TEST GROUP 1: REGISTRY & GALLERY TEMPLATE COUNT ---');
  assert(
    INVOICE_TEMPLATES.length === 32,
    `Registry contains exactly 32 invoice templates (actual: ${INVOICE_TEMPLATES.length})`
  );

  assert(
    GALLERY_INVOICE_TEMPLATES.length === 32,
    `Gallery template list contains exactly 32 invoice templates (actual: ${GALLERY_INVOICE_TEMPLATES.length})`
  );

  const t31 = getInvoiceTemplateById('inv-einvoice-reference');
  assert(t31.id === 'inv-einvoice-reference', 'Template 31 (inv-einvoice-reference) resolved in registry');
  assert(t31.name === 'eInvoice Professional', `Template 31 name is "eInvoice Professional" (actual: ${t31.name})`);
  assert(t31.category === 'corporate', `Template 31 category is corporate (actual: ${t31.category})`);

  const t32 = getInvoiceTemplateById('inv-black-white-business');
  assert(t32.id === 'inv-black-white-business', 'Template 32 (inv-black-white-business) resolved in registry');
  assert(t32.name === 'Black & White Business', `Template 32 name is "Black & White Business" (actual: ${t32.name})`);
  assert(t32.category === 'corporate', `Template 32 category is corporate (actual: ${t32.category})`);

  // Verify gallery mapping
  const gallery31 = GALLERY_INVOICE_TEMPLATES.find((t) => t.id === 'inv-einvoice-reference');
  assert(gallery31 !== undefined, 'Template 31 exists in Gallery');
  assert(gallery31?.previewColor === '#1e3a8a', `Template 31 has navy preview color (actual: ${gallery31?.previewColor})`);
  assert(gallery31?.badgeText === 'eInvoice', `Template 31 has eInvoice badge (actual: ${gallery31?.badgeText})`);

  const gallery32 = GALLERY_INVOICE_TEMPLATES.find((t) => t.id === 'inv-black-white-business');
  assert(gallery32 !== undefined, 'Template 32 exists in Gallery');
  assert(gallery32?.previewColor === '#09090b', `Template 32 has monochrome preview color (actual: ${gallery32?.previewColor})`);
  assert(gallery32?.badgeText === 'Monochrome', `Template 32 has Monochrome badge (actual: ${gallery32?.badgeText})`);

  // ----------------------------------------------------
  // BASE TEST DATA FIXTURES
  // ----------------------------------------------------
  const baseBusiness: BusinessData = {
    businessName: 'Vistaar Heavy Engineering Ltd',
    legalName: 'Vistaar Heavy Engineering Private Limited',
    address: 'Plot 45-B, Phase 1, Industrial Area',
    city: 'Mohali',
    state: 'Punjab',
    pincode: '160055',
    phone: '+91 98765 43210',
    email: 'billing@vistaar.com',
    website: 'www.vistaar.com',
    gstin: '03AAACV1234F1Z5',
    pan: 'AAACV1234F',
    bankDetails: {
      bankName: 'HDFC Bank',
      accountHolder: 'Vistaar Heavy Engineering Ltd',
      accountNo: '50200098765432',
      ifscCode: 'HDFC0000123',
      branch: 'Industrial Area Branch',
      upiId: 'vistaar@hdfcbank',
      upiQrCodeUrl: 'https://cdn.vistaar.app/workspaces/ws-01/payment_qr.png',
    },
    upiQrCodeUrl: 'https://cdn.vistaar.app/workspaces/ws-01/payment_qr.png',
  };

  const baseCustomer: CustomerData = {
    name: 'Precision Dynamics International',
    address: 'Suite 300, Cyber Gateway, Hitech City',
    city: 'Hyderabad',
    state: 'Telangana',
    pincode: '500081',
    phone: '+91 91234 56789',
    email: 'accounts@precisiondynamics.in',
    gstin: '36AAACP9876E1Z2',
  };

  const baseBranding: BrandingConfig = {
    logoUrl: 'https://cdn.vistaar.app/branding/logo.png',
    signatureUrl: 'https://cdn.vistaar.app/branding/sign.png',
    stampUrl: 'https://cdn.vistaar.app/branding/stamp.png',
    logoAlignment: 'left',
    logoScale: 1,
    signatureScale: 1,
    stampScale: 1,
  };

  const baseCustomization: DocumentCustomization = {
    showGstin: true,
    showPan: true,
    showBankDetails: true,
    showUpi: true,
    showQrCode: true,
    showSignature: true,
    showStamp: true,
    showTerms: true,
    showNotes: true,
    showDueDate: true,
    primaryColor: '#1e3a8a',
    textColor: '#0f172a',
    bodyFont: 'Inter',
  };

  // ----------------------------------------------------
  // TEST GROUP 2: REAL VISTAAR FINANCIAL DATA SCENARIOS (Requirement 32)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 2: FINANCIAL DATA SCENARIOS (Requirement 32) ---');

  // SCENARIO A: Full Paid Invoice (Total: ₹15,750, Paid: ₹15,750, Balance: ₹0, Status: PAID)
  const fullPaidInvoice: InvoiceData = {
    invoiceNumber: 'INV-2026-0001',
    date: '2026-09-26',
    dueDate: '2026-10-10',
    items: [
      {
        productName: 'Hydraulic Cylinder Assembly',
        sku: 'SKU-HYD-01',
        quantity: 1,
        sellingPrice: 15750,
        taxPercent: 18,
        total: 15750,
      },
    ],
    subtotal: 13347.46,
    discountTotal: 0,
    taxTotal: 2402.54,
    grandTotal: 15750,
    paidAmount: 15750,
    balanceAmount: 0,
    paymentStatus: 'PAID',
    terms: 'Payment received in full. Thank you for your business.',
    notes: 'Warranty coverage valid for 12 months from invoice date.',
  };

  // SCENARIO B: Partial Payment (Total: ₹15,750, Paid: ₹4,000, Balance: ₹11,750, Status: PARTIALLY PAID)
  const partialPaidInvoice: InvoiceData = {
    ...fullPaidInvoice,
    invoiceNumber: 'INV-2026-0002',
    paidAmount: 4000,
    balanceAmount: 11750,
    paymentStatus: 'PARTIALLY_PAID',
  };

  // SCENARIO C: Unpaid Invoice (Total: ₹15,750, Paid: ₹0, Balance: ₹15,750, Status: UNPAID)
  const unpaidInvoice: InvoiceData = {
    ...fullPaidInvoice,
    invoiceNumber: 'INV-2026-0003',
    paidAmount: 0,
    balanceAmount: 15750,
    paymentStatus: 'UNPAID',
  };

  // Test Template 31 with Full Paid
  const html31Full = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={fullPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={baseCustomization}
    />
  );
  assert(html31Full.includes('TAX INVOICE'), 'T31 Full Paid: Contains TAX INVOICE heading');
  assert(html31Full.includes('INV-2026-0001'), 'T31 Full Paid: Contains Invoice Number');
  assert(html31Full.includes('15,750.00'), 'T31 Full Paid: Renders Grand Total ₹15,750.00');
  assert(html31Full.includes('PAID IN FULL'), 'T31 Full Paid: Displays PAID IN FULL status badge');
  assert(html31Full.includes('Hydraulic Cylinder Assembly'), 'T31 Full Paid: Contains line item description');
  assert(html31Full.includes('SCAN TO PAY'), 'T31 Full Paid: Contains SCAN TO PAY QR header');

  // Test Template 31 with Partial Paid
  const html31Partial = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={partialPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={baseCustomization}
    />
  );
  assert(html31Partial.includes('PARTIALLY PAID'), 'T31 Partial: Displays PARTIALLY PAID status badge');
  assert(html31Partial.includes('4,000.00'), 'T31 Partial: Displays Paid Amount ₹4,000.00');
  assert(html31Partial.includes('11,750.00'), 'T31 Partial: Displays Balance Due ₹11,750.00');

  // Test Template 31 with Unpaid
  const html31Unpaid = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={unpaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={baseCustomization}
    />
  );
  assert(html31Unpaid.includes('UNPAID'), 'T31 Unpaid: Displays UNPAID status badge');
  assert(html31Unpaid.includes('15,750.00'), 'T31 Unpaid: Displays Balance Due ₹15,750.00');

  // Test Template 32 with Full Paid
  const html32Full = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-black-white-business"
      invoice={fullPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={{ ...baseCustomization, primaryColor: '#000000' }}
    />
  );
  assert(html32Full.includes('INVOICE'), 'T32 Full Paid: Contains INVOICE heading');
  assert(html32Full.includes('INV-2026-0001'), 'T32 Full Paid: Contains Invoice Number');
  assert(html32Full.includes('15,750.00'), 'T32 Full Paid: Renders Grand Total ₹15,750.00');
  assert(html32Full.includes('PAID IN FULL'), 'T32 Full Paid: Displays PAID IN FULL status text');
  assert(html32Full.includes('BILL TO'), 'T32 Full Paid: Contains BILL TO header');

  // Test Template 32 with Partial Paid
  const html32Partial = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-black-white-business"
      invoice={partialPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={{ ...baseCustomization, primaryColor: '#000000' }}
    />
  );
  assert(html32Partial.includes('PARTIALLY PAID'), 'T32 Partial: Displays PARTIALLY PAID status text');
  assert(html32Partial.includes('4,000.00'), 'T32 Partial: Displays Amount Paid ₹4,000.00');
  assert(html32Partial.includes('11,750.00'), 'T32 Partial: Displays Balance Due ₹11,750.00');

  // Test Template 32 with Unpaid
  const html32Unpaid = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-black-white-business"
      invoice={unpaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={{ ...baseCustomization, primaryColor: '#000000' }}
    />
  );
  assert(html32Unpaid.includes('UNPAID'), 'T32 Unpaid: Displays UNPAID status text');
  assert(html32Unpaid.includes('15,750.00'), 'T32 Unpaid: Displays Balance Due ₹15,750.00');

  // ----------------------------------------------------
  // TEST GROUP 3: QR CODE & PAYMENT PREFERENCES COMBINATIONS (Requirement 33)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 3: QR CODE COMBINATIONS (Requirement 33) ---');

  // Case 1: Bank ON, UPI ON, QR ON
  const htmlCase1 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={fullPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={{ ...baseCustomization, showBankDetails: true, showUpi: true, showQrCode: true }}
    />
  );
  assert(htmlCase1.includes('HDFC Bank'), 'Case 1 (Bank ON, UPI ON, QR ON): Bank details present');
  assert(htmlCase1.includes('vistaar@hdfcbank'), 'Case 1: UPI ID present');
  assert(htmlCase1.includes('SCAN TO PAY'), 'Case 1: QR code present');

  // Case 2: Bank ON, UPI ON, QR OFF
  const htmlCase2 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={fullPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={{ ...baseCustomization, showBankDetails: true, showUpi: true, showQrCode: false }}
    />
  );
  assert(htmlCase2.includes('HDFC Bank'), 'Case 2 (Bank ON, UPI ON, QR OFF): Bank details present');
  assert(htmlCase2.includes('vistaar@hdfcbank'), 'Case 2: UPI ID present');
  assert(!htmlCase2.includes('SCAN TO PAY'), 'Case 2: QR code hidden when showQrCode is false');

  // Case 3: Bank OFF, UPI ON, QR ON
  const htmlCase3 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={fullPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={{ ...baseCustomization, showBankDetails: false, showUpi: true, showQrCode: true }}
    />
  );
  assert(!htmlCase3.includes('Account No:'), 'Case 3 (Bank OFF, UPI ON, QR ON): Bank Account details hidden');
  // EnginePaymentQrSlot renders QR when bank details section is suppressed
  assert(htmlCase3.includes('SCAN TO PAY'), 'Case 3: QR code rendered cleanly in dedicated QR slot');

  // Case 4: Bank OFF, UPI OFF, QR ON
  const htmlCase4 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={fullPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={{ ...baseCustomization, showBankDetails: false, showUpi: false, showQrCode: true }}
    />
  );
  assert(!htmlCase4.includes('Account No:'), 'Case 4 (Bank OFF, UPI OFF, QR ON): Bank details hidden');
  assert(!htmlCase4.includes('UPI: vistaar@hdfcbank'), 'Case 4: UPI ID line hidden');
  assert(htmlCase4.includes('SCAN TO PAY'), 'Case 4: QR only rendered');

  // Case 5: Bank OFF, UPI OFF, QR OFF
  const htmlCase5 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={fullPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={{ ...baseCustomization, showBankDetails: false, showUpi: false, showQrCode: false }}
    />
  );
  assert(!htmlCase5.includes('Account No:'), 'Case 5 (Neither): Bank details hidden');
  assert(!htmlCase5.includes('SCAN TO PAY'), 'Case 5: QR code completely hidden');

  // ----------------------------------------------------
  // TEST GROUP 4: DOCUMENT TOGGLES DYNAMIC REFLOW (Requirement 22 & 34)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 4: DOCUMENT TOGGLE REFLOW (Requirement 22 & 34) ---');

  // Test with all toggles OFF
  const allTogglesOff: DocumentCustomization = {
    showGstin: false,
    showPan: false,
    showBankDetails: false,
    showUpi: false,
    showQrCode: false,
    showSignature: false,
    showStamp: false,
    showTerms: false,
    showNotes: false,
    showDueDate: false,
  };

  const htmlTogglesOff31 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={fullPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={allTogglesOff}
    />
  );

  assert(!htmlTogglesOff31.includes('GSTIN:'), 'T31: GSTIN completely omitted when showGstin is false');
  assert(!htmlTogglesOff31.includes('PAN:'), 'T31: PAN completely omitted when showPan is false');
  assert(!htmlTogglesOff31.includes('PAYMENT PREFERENCES &amp; REMITTANCE'), 'T31: Bank details box omitted when showBankDetails is false');
  assert(!htmlTogglesOff31.includes('Authorized Signatory'), 'T31: Signature block omitted when showSignature is false');
  assert(!htmlTogglesOff31.includes('Official Seal'), 'T31: Stamp omitted when showStamp is false');
  assert(!htmlTogglesOff31.includes('TERMS &amp; CONDITIONS:'), 'T31: Terms omitted when showTerms is false');
  assert(!htmlTogglesOff31.includes('SPECIAL INVOICE NOTES:'), 'T31: Notes omitted when showNotes is false');
  assert(!htmlTogglesOff31.includes('Due Date:'), 'T31: Due date omitted when showDueDate is false');

  const htmlTogglesOff32 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-black-white-business"
      invoice={fullPaidInvoice}
      business={baseBusiness}
      customer={baseCustomer}
      branding={baseBranding}
      customization={allTogglesOff}
    />
  );

  assert(!htmlTogglesOff32.includes('GSTIN:'), 'T32: GSTIN omitted when showGstin is false');
  assert(!htmlTogglesOff32.includes('PAN:'), 'T32: PAN omitted when showPan is false');
  assert(!htmlTogglesOff32.includes('PAYMENT INFORMATION'), 'T32: Bank details box omitted when showBankDetails is false');
  assert(!htmlTogglesOff32.includes('AUTHORIZED SIGNATURE'), 'T32: Signature line omitted when showSignature is false');
  assert(!htmlTogglesOff32.includes('OFFICIAL STAMP'), 'T32: Stamp omitted when showStamp is false');
  assert(!htmlTogglesOff32.includes('TERMS &amp; CONDITIONS'), 'T32: Terms omitted when showTerms is false');
  assert(!htmlTogglesOff32.includes('NOTES:'), 'T32: Notes omitted when showNotes is false');
  assert(!htmlTogglesOff32.includes('DUE DATE:'), 'T32: Due date omitted when showDueDate is false');

  // ----------------------------------------------------
  // TEST GROUP 5: STRESS TESTING (20+ ITEMS, LONG NAMES, EMPTY DATA)
  // ----------------------------------------------------
  console.log('\n--- TEST GROUP 5: STRESS TESTING (25 ITEMS, EXTREME DATA) ---');

  // 25 Line items for multi-page stress test
  const twentyFiveItems = Array.from({ length: 25 }, (_, i) => ({
    id: `item-${i + 1}`,
    productName: `Industrial Precision Machined Gear Shaft Model ${i + 1} with Extra Long Technical Specification`,
    sku: `SKU-GEAR-${String(i + 1).padStart(3, '0')}`,
    unit: 'Units',
    quantity: i + 1,
    sellingPrice: 1250.5,
    taxPercent: 18,
    total: (i + 1) * 1250.5 * 1.18,
  }));

  const stressInvoice: InvoiceData = {
    invoiceNumber: 'INV-STRESS-2026',
    date: '2026-09-26',
    dueDate: '2026-10-15',
    items: twentyFiveItems,
    subtotal: 406412.5,
    discountTotal: 5000,
    taxTotal: 73154.25,
    grandTotal: 474566.75,
    paidAmount: 200000,
    balanceAmount: 274566.75,
    paymentStatus: 'PARTIALLY_PAID',
    notes: 'Extreme data load test with 25 line items, multi-page print breakdown, and long product names.',
  };

  const htmlStress31 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={stressInvoice}
      business={baseBusiness}
      customer={{
        name: 'Supercalifragilistic Enterprises Global Infrastructure Solutions Private Limited Corporation',
        address: '400 Long Address Street, Very Extended Industrial Estate, Sector 999, Dist. Cyberabad',
      }}
      branding={baseBranding}
      customization={baseCustomization}
    />
  );
  assert(htmlStress31.includes('Industrial Precision Machined Gear Shaft Model 25'), 'T31 Stress: Item 25 renders successfully');
  assert(htmlStress31.includes('4,74,566.75'), 'T31 Stress: Grand Total renders accurately');
  assert(htmlStress31.includes('Supercalifragilistic Enterprises Global Infrastructure'), 'T31 Stress: Long customer name renders without truncation');

  const htmlStress32 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-black-white-business"
      invoice={stressInvoice}
      business={baseBusiness}
      customer={{
        name: 'Supercalifragilistic Enterprises Global Infrastructure Solutions Private Limited Corporation',
        address: '400 Long Address Street, Very Extended Industrial Estate, Sector 999, Dist. Cyberabad',
      }}
      branding={baseBranding}
      customization={{ ...baseCustomization, primaryColor: '#000000' }}
    />
  );
  assert(htmlStress32.includes('Industrial Precision Machined Gear Shaft Model 25'), 'T32 Stress: Item 25 renders successfully');
  assert(htmlStress32.includes('4,74,566.75'), 'T32 Stress: Grand Total renders accurately');
  assert(htmlStress32.includes('Supercalifragilistic Enterprises Global Infrastructure'), 'T32 Stress: Long customer name renders without truncation');

  // Empty data safety: missing optional customer, bank details, notes, etc.
  const emptyInvoice: InvoiceData = {
    invoiceNumber: 'INV-MINIMAL',
    date: '2026-09-26',
    dueDate: '2026-09-26',
    items: [
      {
        productName: 'Service Fee',
        quantity: 1,
        sellingPrice: 500,
        total: 500,
      },
    ],
    subtotal: 500,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 500,
    paidAmount: 0,
    balanceAmount: 500,
    paymentStatus: 'UNPAID',
  };

  const htmlEmpty31 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-einvoice-reference"
      invoice={emptyInvoice}
      business={{ businessName: 'Solo Proprietor' }}
      customer={undefined}
      branding={{ logoAlignment: 'left', logoScale: 1, signatureScale: 1, stampScale: 1 }}
      customization={baseCustomization}
    />
  );
  assert(htmlEmpty31.includes('Solo Proprietor'), 'T31 Empty: Renders cleanly without customer or bank details');
  assert(!htmlEmpty31.includes('undefined'), 'T31 Empty: Contains no "undefined" text artifacts');

  const htmlEmpty32 = renderToStaticMarkup(
    <InvoiceTemplateEngineRenderer
      templateId="inv-black-white-business"
      invoice={emptyInvoice}
      business={{ businessName: 'Solo Proprietor' }}
      customer={undefined}
      branding={{ logoAlignment: 'left', logoScale: 1, signatureScale: 1, stampScale: 1 }}
      customization={{ ...baseCustomization, primaryColor: '#000000' }}
    />
  );
  assert(htmlEmpty32.includes('Solo Proprietor'), 'T32 Empty: Renders cleanly without customer or bank details');
  assert(!htmlEmpty32.includes('undefined'), 'T32 Empty: Contains no "undefined" text artifacts');

  console.log('\n================================================================');
  console.log(`TEST SUITE FINISHED: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTemplateTestSuite();
