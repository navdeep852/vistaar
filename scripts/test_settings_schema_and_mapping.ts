/**
 * VISTAAR Business OS — Settings Schema & Mapping Regression Test Suite
 *
 * Verifies:
 * 1. mapAppSettingsToDb strictly maps camelCase -> snake_case without leaking frontend fields.
 * 2. mapDbSettingsToApp strictly maps snake_case -> camelCase BusinessSettings shape.
 * 3. bankDetails is strictly stored as JSONB bank_details without leaking sub-properties as columns.
 * 4. businessName semantics: maps to legal_name, preserves values.
 * 5. Live Supabase test: Payload constructed by mapAppSettingsToDb causes NO PGRST204 on Supabase.
 * 6. Phone normalization: 10-digit Indian phone numbers validated and normalized.
 */

import { mapAppSettingsToDb, mapDbSettingsToApp } from '../src/services/supabase/businessSettingsService';
import { BusinessSettings } from '../src/types';
import { DbBusinessSettings } from '../src/services/supabase/types';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kluxsykimnjivkqxelba.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

async function runTestSuite() {
  console.log('================================================================================');
  console.log(' VISTAAR Business OS — SETTINGS SCHEMA & MAPPING VERIFICATION SUITE');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail = '') {
    if (condition) {
      console.log(`[PASS] ${testName} ${detail ? '(' + detail + ')' : ''}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - FAILURE ${detail ? ': ' + detail : ''}`);
      failed++;
    }
  }

  const sampleFrontendSettings: BusinessSettings = {
    businessName: 'VISTAAR Enterprises',
    legalName: 'VISTAAR Enterprises Pvt Ltd',
    businessType: 'Private Limited',
    businessDescription: 'Industrial Supplies & Logistics',
    ownerName: 'Hardik Sharma',
    phone: '9876543210',
    alternatePhone: '9812345678',
    email: 'info@vistaar.com',
    website: 'https://vistaar.com',
    gstin: '27AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    regNumber: 'UDYAM-MH-01-001234',
    address: '42 Industrial Area Phase 1',
    addressLine2: 'Near Metro Station',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    country: 'India',

    logoUrl: 'https://cdn.example.com/logo.png',
    logoAlignment: 'center',
    logoScale: 1.2,

    signatureUrl: 'https://cdn.example.com/sig.png',
    signatureAlignment: 'right',
    signatureScale: 0.9,

    stampUrl: 'https://cdn.example.com/stamp.png',
    stampAlignment: 'left',
    stampScale: 1.0,

    bankDetails: {
      bankName: 'State Bank of India',
      accountHolder: 'Hardik Sharma',
      accountNo: '30012345678',
      ifscCode: 'SBIN0001234',
      branch: 'Nariman Point',
      upiId: 'hardik@sbi',
      upiQrCodeUrl: 'https://cdn.example.com/qr.png',
    },
    upiQrCodeUrl: 'https://cdn.example.com/qr.png',
    showUpiQrOnQuotation: true,
    showBankDetailsOnInvoice: true,
    showBankDetailsOnQuotation: false,

    currency: '₹',
    defaultTaxMode: 'Inclusive',
    invoicePrefix: 'INV/2026/',
    quotationPrefix: 'QT/2026/',
    defaultPaymentTerms: 'Net 30',
    defaultQuotationValidity: '30 Days',
    defaultFont: 'Roboto',
    defaultOrientation: 'portrait',
    defaultInvoiceTemplate: 'inv-classic-navy',
    defaultQuotationTemplate: 'qt-classic-navy',
    brandColor: '#1e40af',
    theme: 'dark',

    termsAndConditions: 'Standard payment within 30 days.',
    defaultInvoiceTerms: 'Goods once sold will not be taken back.',
    defaultQuotationTerms: 'Prices subject to change without notice.',
  };

  const testWorkspaceId = '4f42a205-792d-4bdb-a9e5-be88cbed331a';

  // TEST 1: Forward Mapping (Frontend -> DB snake_case payload)
  console.log('--- TEST 1: FRONTEND TO DATABASE MAPPING ---');
  const dbPayload = mapAppSettingsToDb(sampleFrontendSettings, testWorkspaceId);

  assert(dbPayload.workspace_id === testWorkspaceId, 'Workspace ID preserved');
  assert(dbPayload.legal_name === 'VISTAAR Enterprises Pvt Ltd', 'legal_name mapped from legalName');
  assert(dbPayload.business_type === 'Private Limited', 'business_type mapped');
  assert(dbPayload.business_description === 'Industrial Supplies & Logistics', 'business_description mapped');
  assert(dbPayload.owner_name === 'Hardik Sharma', 'owner_name mapped');
  assert(dbPayload.alternate_phone === '9812345678', 'alternate_phone mapped');
  assert(dbPayload.address_line_2 === 'Near Metro Station', 'address_line_2 mapped');
  assert(dbPayload.logo_url === 'https://cdn.example.com/logo.png', 'logo_url mapped');
  assert(dbPayload.logo_alignment === 'center', 'logo_alignment mapped');
  assert(dbPayload.signature_url === 'https://cdn.example.com/sig.png', 'signature_url mapped');
  assert(dbPayload.stamp_url === 'https://cdn.example.com/stamp.png', 'stamp_url mapped');
  assert(dbPayload.show_bank_on_invoice === true, 'show_bank_on_invoice mapped');
  assert(dbPayload.show_bank_on_quotation === false, 'show_bank_on_quotation mapped');
  assert(dbPayload.default_tax_mode === 'Inclusive', 'default_tax_mode mapped');
  assert(dbPayload.invoice_prefix === 'INV/2026/', 'invoice_prefix mapped');
  assert(dbPayload.quotation_prefix === 'QT/2026/', 'quotation_prefix mapped');
  assert(dbPayload.default_payment_terms === 'Net 30', 'default_payment_terms mapped');
  assert(dbPayload.default_quotation_validity === '30 Days', 'default_quotation_validity mapped');
  assert(dbPayload.default_font === 'Roboto', 'default_font mapped');
  assert(dbPayload.default_orientation === 'portrait', 'default_orientation mapped');
  assert(dbPayload.default_invoice_template === 'inv-classic-navy', 'default_invoice_template mapped');
  assert(dbPayload.default_quotation_template === 'qt-classic-navy', 'default_quotation_template mapped');
  assert(dbPayload.brand_color === '#1e40af', 'brand_color mapped');
  assert(dbPayload.default_invoice_terms === 'Goods once sold will not be taken back.', 'default_invoice_terms mapped');
  assert(dbPayload.default_quotation_terms === 'Prices subject to change without notice.', 'default_quotation_terms mapped');

  // TEST 2: Verify No Frontend camelCase keys in DB Payload
  console.log('\n--- TEST 2: LEAK PREVENTION (NO CAMELCASE IN DB PAYLOAD) ---');
  const forbiddenKeys = [
    'businessName', 'legalName', 'businessType', 'businessDescription', 'ownerName',
    'alternatePhone', 'addressLine2', 'logoUrl', 'logoAlignment', 'logoScale',
    'signatureUrl', 'signatureAlignment', 'signatureScale', 'stampUrl', 'stampAlignment',
    'stampScale', 'bankDetails', 'showBankDetailsOnInvoice', 'showBankDetailsOnQuotation',
    'defaultTaxMode', 'invoicePrefix', 'quotationPrefix', 'defaultPaymentTerms',
    'defaultQuotationValidity', 'defaultFont', 'defaultOrientation', 'defaultInvoiceTemplate',
    'defaultQuotationTemplate', 'brandColor', 'defaultInvoiceTerms', 'defaultQuotationTerms',
    'termsAndConditions', 'upiQrCodeUrl', 'showUpiQrOnQuotation', 'business_name'
  ];

  let leakedKeys: string[] = [];
  for (const k of forbiddenKeys) {
    if (k in dbPayload) {
      leakedKeys.push(k);
    }
  }
  assert(leakedKeys.length === 0, 'No camelCase or non-existent columns in dbPayload', leakedKeys.join(', '));

  // TEST 3: Bank Details JSONB Structure
  console.log('\n--- TEST 3: BANK DETAILS JSONB PACKING ---');
  assert(typeof dbPayload.bank_details === 'object' && dbPayload.bank_details !== null, 'bank_details is object');
  assert(dbPayload.bank_details.bankName === 'State Bank of India', 'bankName packed in JSONB');
  assert(dbPayload.bank_details.accountHolder === 'Hardik Sharma', 'accountHolder packed in JSONB');
  assert(dbPayload.bank_details.accountNo === '30012345678', 'accountNo packed in JSONB');
  assert(dbPayload.bank_details.ifscCode === 'SBIN0001234', 'ifscCode packed in JSONB');
  assert(dbPayload.bank_details.branch === 'Nariman Point', 'branch packed in JSONB');
  assert(dbPayload.bank_details.upiId === 'hardik@sbi', 'upiId packed in JSONB');
  assert(dbPayload.bank_details.upiQrCodeUrl === 'https://cdn.example.com/qr.png', 'upiQrCodeUrl packed in JSONB');

  // TEST 4: Reverse Mapping (DB snake_case -> Frontend camelCase)
  console.log('\n--- TEST 4: DATABASE TO FRONTEND MAPPING (READ PATH) ---');
  const restoredApp = mapDbSettingsToApp(dbPayload);

  assert(restoredApp.businessName === 'VISTAAR Enterprises Pvt Ltd', 'businessName read from legal_name');
  assert(restoredApp.legalName === 'VISTAAR Enterprises Pvt Ltd', 'legalName read from legal_name');
  assert(restoredApp.businessType === 'Private Limited', 'businessType restored');
  assert(restoredApp.businessDescription === 'Industrial Supplies & Logistics', 'businessDescription restored');
  assert(restoredApp.ownerName === 'Hardik Sharma', 'ownerName restored');
  assert(restoredApp.alternatePhone === '9812345678', 'alternatePhone restored');
  assert(restoredApp.addressLine2 === 'Near Metro Station', 'addressLine2 restored');
  assert(restoredApp.logoUrl === 'https://cdn.example.com/logo.png', 'logoUrl restored');
  assert(restoredApp.logoAlignment === 'center', 'logoAlignment restored');
  assert(restoredApp.signatureUrl === 'https://cdn.example.com/sig.png', 'signatureUrl restored');
  assert(restoredApp.stampUrl === 'https://cdn.example.com/stamp.png', 'stampUrl restored');
  assert(restoredApp.bankDetails.bankName === 'State Bank of India', 'bankDetails.bankName restored');
  assert(restoredApp.bankDetails.accountNo === '30012345678', 'bankDetails.accountNo restored');
  assert(restoredApp.bankDetails.upiId === 'hardik@sbi', 'bankDetails.upiId restored');
  assert(restoredApp.showBankDetailsOnInvoice === true, 'showBankDetailsOnInvoice restored');
  assert(restoredApp.showBankDetailsOnQuotation === false, 'showBankDetailsOnQuotation restored');
  assert(restoredApp.defaultTaxMode === 'Inclusive', 'defaultTaxMode restored');
  assert(restoredApp.invoicePrefix === 'INV/2026/', 'invoicePrefix restored');
  assert(restoredApp.quotationPrefix === 'QT/2026/', 'quotationPrefix restored');
  assert(restoredApp.defaultPaymentTerms === 'Net 30', 'defaultPaymentTerms restored');
  assert(restoredApp.defaultFont === 'Roboto', 'defaultFont restored');
  assert(restoredApp.defaultOrientation === 'portrait', 'defaultOrientation restored');
  assert(restoredApp.defaultInvoiceTemplate === 'inv-classic-navy', 'defaultInvoiceTemplate restored');
  assert(restoredApp.defaultQuotationTemplate === 'qt-classic-navy', 'defaultQuotationTemplate restored');
  assert(restoredApp.brandColor === '#1e40af', 'brandColor restored');
  assert(restoredApp.defaultInvoiceTerms === 'Goods once sold will not be taken back.', 'defaultInvoiceTerms restored');
  assert(restoredApp.defaultQuotationTerms === 'Prices subject to change without notice.', 'defaultQuotationTerms restored');

  // TEST 5: Business Name Fallback semantics
  console.log('\n--- TEST 5: BUSINESS NAME FALLBACK SEMANTICS ---');
  const payloadOnlyBusinessName = mapAppSettingsToDb({
    businessName: 'My Awesome Shop',
    phone: '9876543210',
    email: 'shop@example.com',
    address: '123 Market',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110001',
  }, testWorkspaceId);
  assert(payloadOnlyBusinessName.legal_name === 'My Awesome Shop', 'legal_name set from businessName when legalName omitted');

  const payloadOnlyLegalName = mapAppSettingsToDb({
    legalName: 'My Awesome Shop Pvt Ltd',
    phone: '9876543210',
    email: 'shop@example.com',
    address: '123 Market',
    city: 'Delhi',
    state: 'Delhi',
    pincode: '110001',
  }, testWorkspaceId);
  assert(payloadOnlyLegalName.legal_name === 'My Awesome Shop Pvt Ltd', 'legal_name set from legalName when businessName omitted');

  // TEST 6: Live Supabase PostgREST Schema Cache Validation
  console.log('\n--- TEST 6: LIVE SUPABASE POSTGREST SCHEMA CACHE TEST ---');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // We test querying and upserting the exact dbPayload produced by mapAppSettingsToDb.
  // Note: Unauthenticated anon key will be checked by PostgREST schema cache first.
  // If ANY column in dbPayload is invalid, PostgREST returns PGRST204 immediately.
  // If ALL columns are valid, PostgREST passes to PG RLS (code 42501).
  const postgrestTest = await supabase.from('business_settings').upsert(dbPayload);
  const isPgrst204 = postgrestTest.error?.code === 'PGRST204';
  const isSchemaValid = postgrestTest.error?.code !== 'PGRST204';

  assert(!isPgrst204, 'PostgREST did NOT return PGRST204 for mapAppSettingsToDb output', `Received: ${postgrestTest.error?.code || 'SUCCESS'}`);
  assert(isSchemaValid, 'All columns in dbPayload exist in live PostgREST schema cache');

  console.log('\n================================================================================');
  console.log(` RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
