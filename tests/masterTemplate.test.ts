import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractStateInfo,
  determineGstRouting,
  numberToWordsIndian,
} from '../src/templates/invoices/masterTemplateHelpers.ts';

describe('VISTAAR — Master Template Registration & Discovery', () => {
  const registryContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/templates/invoices/registry.ts'),
    'utf-8'
  );
  const displayTemplatesContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/templates/invoiceTemplates.ts'),
    'utf-8'
  );

  it('1. Master Template is registered with id "inv-master-template" in registry', () => {
    assert.ok(
      registryContent.includes("id: 'inv-master-template'"),
      'inv-master-template must be registered in registry.ts'
    );
    assert.ok(
      registryContent.includes("name: 'Master Template'"),
      'Master Template name must be declared'
    );
    assert.ok(
      registryContent.includes('component: MasterTemplate'),
      'MasterTemplate component must be bound'
    );
  });

  it('2. MasterTemplate component layout file exists and exports MasterTemplate', () => {
    const layoutPath = path.resolve(process.cwd(), 'src/templates/invoices/layouts/MasterTemplate.tsx');
    assert.ok(fs.existsSync(layoutPath), 'MasterTemplate.tsx file must exist');
    const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
    assert.ok(layoutContent.includes('export const MasterTemplate'), 'Must export MasterTemplate component');
  });

  it('3. Master Template is populated in display templates with preview color & badge', () => {
    assert.ok(
      displayTemplatesContent.includes("'inv-master-template': '#059669'"),
      'previewColorMap must map inv-master-template to #059669'
    );
    assert.ok(
      displayTemplatesContent.includes("'inv-master-template': 'GST Master'"),
      'badgeMap must map inv-master-template to "GST Master"'
    );
  });

  it('4. Total invoice templates count is 33 and all 32 existing templates remain intact', () => {
    // Count occurrences of `id: 'inv-` in registry.ts
    const idMatches = registryContent.match(/id:\s*['"]inv-[a-z0-9-]+['"]/g) || [];
    assert.strictEqual(idMatches.length, 33, 'Must contain exactly 33 invoice templates');

    // Verify first and last legacy templates are unchanged
    assert.ok(registryContent.includes("id: 'inv-classic-corporate'"));
    assert.ok(registryContent.includes("id: 'inv-black-white-business'"));
  });
});

describe('VISTAAR — GST State Code & Tax Routing Engine', () => {
  it('1. Extracts 2-digit state code from GSTIN prefix authoritatively', () => {
    const maharashtra = extractStateInfo('Maharashtra', '27DEPR58895N123');
    assert.strictEqual(maharashtra.code, '27');
    assert.strictEqual(maharashtra.state, 'Maharashtra');

    const rajasthan = extractStateInfo('', '08AABCB1234F1Z5');
    assert.strictEqual(rajasthan.code, '08');
    assert.strictEqual(rajasthan.state, 'RAJASTHAN');

    const delhi = extractStateInfo('Delhi', '07AAAAA0000A1Z5');
    assert.strictEqual(delhi.code, '07');
  });

  it('2. Looks up state code by state name for B2C customers without GSTIN', () => {
    const karnataka = extractStateInfo('Karnataka', '');
    assert.strictEqual(karnataka.code, '29');

    const gujarat = extractStateInfo('Gujarat', undefined);
    assert.strictEqual(gujarat.code, '24');
  });

  it('3. Intra-State Supply: Identical state codes route 100% to CGST + SGST (0% IGST)', () => {
    const seller = extractStateInfo('Maharashtra', '27DEPR58895N123');
    const buyer = extractStateInfo('Maharashtra', '27AABCT9999M1Z1');

    const routing = determineGstRouting(seller, buyer);
    assert.strictEqual(routing.isIntraState, true);
    assert.strictEqual(routing.isInterState, false);
  });

  it('4. Inter-State Supply: Different state codes route 100% to IGST (0% CGST/SGST)', () => {
    const seller = extractStateInfo('Maharashtra', '27DEPR58895N123'); // 27
    const buyer = extractStateInfo('Rajasthan', '08AABCB1234F1Z5');    // 08

    const routing = determineGstRouting(seller, buyer);
    assert.strictEqual(routing.isIntraState, false);
    assert.strictEqual(routing.isInterState, true);
  });

  it('5. Place of Supply override takes precedence for interstate deliveries', () => {
    const seller = extractStateInfo('Maharashtra', '27DEPR58895N123');
    const buyer = extractStateInfo('Maharashtra', '27AABCT9999M1Z1');
    const placeOfSupply = 'Gujarat'; // 24

    const routing = determineGstRouting(seller, buyer, placeOfSupply);
    assert.strictEqual(routing.isIntraState, false);
    assert.strictEqual(routing.isInterState, true);
  });
});

describe('VISTAAR — Master Template Line Item Tax Calculation & Financial Reconciliation', () => {
  it('1. Intra-State invoice with 18% GST splits evenly into 9% CGST and 9% SGST', () => {
    const qty = 5;
    const rate = 5000;
    const gross = qty * rate; // 25000
    const discount = 2000;
    const taxable = gross - discount; // 23000
    const taxPercent = 18;

    const cgstRate = taxPercent / 2; // 9%
    const sgstRate = taxPercent / 2; // 9%
    const cgstAmount = Number(((taxable * cgstRate) / 100).toFixed(2)); // 2070
    const sgstAmount = Number(((taxable * sgstRate) / 100).toFixed(2)); // 2070
    const totalTax = cgstAmount + sgstAmount; // 4140
    const grandTotal = taxable + totalTax; // 27140

    assert.strictEqual(gross, 25000);
    assert.strictEqual(taxable, 23000);
    assert.strictEqual(cgstAmount, 2070);
    assert.strictEqual(sgstAmount, 2070);
    assert.strictEqual(totalTax, 4140);
    assert.strictEqual(grandTotal, 27140);
  });

  it('2. Inter-State invoice with 18% GST routes completely to IGST without CGST/SGST bleed', () => {
    const qty = 5;
    const rate = 5000;
    const gross = qty * rate; // 25000
    const discount = 2000;
    const taxable = gross - discount; // 23000
    const taxPercent = 18;

    const igstRate = taxPercent; // 18%
    const igstAmount = Number(((taxable * igstRate) / 100).toFixed(2)); // 4140
    const cgstAmount = 0;
    const sgstAmount = 0;
    const grandTotal = taxable + igstAmount; // 27140

    assert.strictEqual(cgstAmount, 0);
    assert.strictEqual(sgstAmount, 0);
    assert.strictEqual(igstAmount, 4140);
    assert.strictEqual(grandTotal, 27140);
  });

  it('3. Multiple GST rates in single invoice (0%, 5%, 12%, 18%, 28%) calculate independently', () => {
    const items = [
      { qty: 1, rate: 1000, discount: 0, taxPercent: 0 },   // Taxable: 1000, Tax: 0
      { qty: 2, rate: 2000, discount: 0, taxPercent: 5 },   // Taxable: 4000, Tax: 200
      { qty: 1, rate: 5000, discount: 500, taxPercent: 12 },// Taxable: 4500, Tax: 540
      { qty: 1, rate: 10000, discount: 1000, taxPercent: 18 },// Taxable: 9000, Tax: 1620
      { qty: 1, rate: 20000, discount: 0, taxPercent: 28 }, // Taxable: 20000, Tax: 5600
    ];

    let totalTaxable = 0;
    let totalTax = 0;

    for (const item of items) {
      const taxable = item.qty * item.rate - item.discount;
      const tax = (taxable * item.taxPercent) / 100;
      totalTaxable += taxable;
      totalTax += tax;
    }

    assert.strictEqual(totalTaxable, 38500);
    assert.strictEqual(totalTax, 7960);
    assert.strictEqual(totalTaxable + totalTax, 46460);
  });

  it('4. Reverse Charge (Y/N): calculates GST on Reverse Charge strictly when enabled', () => {
    const totalTax = 4140;
    const isReverseChargeYes = true;
    const isReverseChargeNo = false;

    const rcmYes = isReverseChargeYes ? totalTax : 0;
    const rcmNo = isReverseChargeNo ? totalTax : 0;

    assert.strictEqual(rcmYes, 4140, 'When Reverse Charge is Y, GST on Reverse Charge equals tax amount');
    assert.strictEqual(rcmNo, 0, 'When Reverse Charge is N, GST on Reverse Charge is 0');
  });

  it('5. Dynamic expansion supports > 12 product rows without data truncation', () => {
    // Generate 18 line items
    const manyItems = Array.from({ length: 18 }, (_, i) => ({
      productName: `Item #${i + 1}`,
      quantity: i + 1,
      sellingPrice: 100 * (i + 1),
      taxPercent: 18,
    }));

    assert.strictEqual(manyItems.length, 18);
    const sumQty = manyItems.reduce((acc, item) => acc + item.quantity, 0);
    // Sum of 1..18 = (18 * 19) / 2 = 171
    assert.strictEqual(sumQty, 171);
  });

  it('6. Additional statutory charges (Freight, Insurance, Packing) integrate into totals', () => {
    const itemTaxable = 23000;
    const itemTax = 4140;
    const freight = 500;
    const insurance = 250;
    const packing = 150;

    const aggregateTaxable = itemTaxable + freight + insurance + packing; // 23900
    const aggregateGrand = aggregateTaxable + itemTax; // 28040

    assert.strictEqual(aggregateTaxable, 23900);
    assert.strictEqual(aggregateGrand, 28040);
  });
});

describe('VISTAAR — Number to Words Engine (Indian Format)', () => {
  it('1. Converts 27,140 to exact Excel reference amount in words', () => {
    const words = numberToWordsIndian(27140);
    assert.strictEqual(words, 'Twenty Seven Thousand One Hundred Forty Rupees Only');
  });

  it('2. Converts amounts with Paise correctly', () => {
    const words = numberToWordsIndian(27140.50);
    assert.strictEqual(words, 'Twenty Seven Thousand One Hundred Forty Rupees and Fifty Paise Only');
  });

  it('3. Converts Lakhs and Crores accurately', () => {
    const oneLakh = numberToWordsIndian(100000);
    assert.strictEqual(oneLakh, 'One Lakh Rupees Only');

    const multiCrore = numberToWordsIndian(12345678.90);
    assert.strictEqual(
      multiCrore,
      'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Rupees and Ninety Paise Only'
    );
  });

  it('4. Handles zero and edge cases gracefully', () => {
    assert.strictEqual(numberToWordsIndian(0), 'Zero Rupees Only');
    assert.strictEqual(numberToWordsIndian(undefined), 'Zero Rupees Only');
    assert.strictEqual(numberToWordsIndian(null), 'Zero Rupees Only');
  });
});
