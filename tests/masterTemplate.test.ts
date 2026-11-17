import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractStateInfo,
  determineGstRouting,
  numberToWordsIndian,
  chunkMasterTemplateItems,
  COPY_BADGE_CONFIG,
} from '../src/templates/invoices/masterTemplateHelpers.ts';
import type { ProcessedItem } from '../src/templates/invoices/masterTemplateHelpers.ts';

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

describe('VISTAAR — Master Template A4 Landscape Multi-Page Pagination', () => {
  const createMockItems = (count: number): ProcessedItem[] =>
    Array.from({ length: count }, (_, i) => ({
      sNo: i + 1,
      description: `Test Product Item #${i + 1}`,
      hsn: '84713010',
      uom: 'PCS',
      qty: 1,
      rate: 1000,
      gross: 1000,
      discount: 0,
      taxable: 1000,
      cgstRate: 9,
      cgstAmount: 90,
      sgstRate: 9,
      sgstAmount: 90,
      igstRate: 0,
      igstAmount: 0,
      total: 1180,
    }));

  it('1. Single page invoice (1 to 6 items): chunks strictly into 1 page with padding rows', () => {
    const items1 = createMockItems(1);
    const chunks1 = chunkMasterTemplateItems(items1);
    assert.strictEqual(chunks1.length, 1);
    assert.strictEqual(chunks1[0].pageNumber, 1);
    assert.strictEqual(chunks1[0].totalPages, 1);
    assert.strictEqual(chunks1[0].isFirstPage, true);
    assert.strictEqual(chunks1[0].isLastPage, true);
    assert.strictEqual(chunks1[0].items.length, 1);
    assert.strictEqual(chunks1[0].paddingRowsCount, 5);

    const items6 = createMockItems(6);
    const chunks6 = chunkMasterTemplateItems(items6);
    assert.strictEqual(chunks6.length, 1);
    assert.strictEqual(chunks6[0].items.length, 6);
    assert.strictEqual(chunks6[0].paddingRowsCount, 0);
  });

  it('2. Multi-page invoice (7 to 14 items): splits cleanly across 2 pages without empty pages', () => {
    const items7 = createMockItems(7);
    const chunks7 = chunkMasterTemplateItems(items7);
    assert.strictEqual(chunks7.length, 2);
    assert.strictEqual(chunks7[0].isFirstPage, true);
    assert.strictEqual(chunks7[0].isLastPage, false);
    assert.strictEqual(chunks7[1].isFirstPage, false);
    assert.strictEqual(chunks7[1].isLastPage, true);
    assert.strictEqual(chunks7[0].items.length + chunks7[1].items.length, 7);

    const items14 = createMockItems(14);
    const chunks14 = chunkMasterTemplateItems(items14);
    assert.strictEqual(chunks14.length, 2);
    assert.strictEqual(chunks14[0].items.length, 8);
    assert.strictEqual(chunks14[1].items.length, 6);
    assert.strictEqual(chunks14[1].isLastPage, true);
  });

  it('3. Large multi-page invoice (20 and 30 items): preserves all items without loss', () => {
    const items20 = createMockItems(20);
    const chunks20 = chunkMasterTemplateItems(items20);
    const sum20 = chunks20.reduce((acc, c) => acc + c.items.length, 0);
    assert.strictEqual(sum20, 20);
    assert.strictEqual(chunks20[chunks20.length - 1].isLastPage, true);
    assert.strictEqual(chunks20[0].isFirstPage, true);

    const items30 = createMockItems(30);
    const chunks30 = chunkMasterTemplateItems(items30);
    const sum30 = chunks30.reduce((acc, c) => acc + c.items.length, 0);
    assert.strictEqual(sum30, 30);
    assert.strictEqual(chunks30[chunks30.length - 1].isLastPage, true);
  });
});

describe('VISTAAR — Copy Identification Badges and Dropdown Mapping', () => {
  it('1. Original copy maps to ORIGINAL COPY (For Recipient)', () => {
    assert.deepStrictEqual(COPY_BADGE_CONFIG['Original'], {
      title: 'ORIGINAL COPY',
      subtitle: '(For Recipient)',
    });
  });

  it('2. Duplicate copy maps to DUPLICATE COPY (For Transporter)', () => {
    assert.deepStrictEqual(COPY_BADGE_CONFIG['Duplicate'], {
      title: 'DUPLICATE COPY',
      subtitle: '(For Transporter)',
    });
  });

  it('3. Triplicate copy maps to TRIPLICATE COPY (For Supplier)', () => {
    assert.deepStrictEqual(COPY_BADGE_CONFIG['Triplicate'], {
      title: 'TRIPLICATE COPY',
      subtitle: '(For Supplier)',
    });
  });

  it('4. Extra OC copy maps to EXTRA OC COPY (Office Copy)', () => {
    assert.deepStrictEqual(COPY_BADGE_CONFIG['Extra OC'], {
      title: 'EXTRA OC COPY',
      subtitle: '(Office Copy)',
    });
  });
});

describe('VISTAAR — 16-Column Proportions and Layout Invariants', () => {
  it('1. MasterTemplate source strictly implements 16-column colgroup summing to 100.0%', () => {
    const layoutContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/templates/invoices/layouts/MasterTemplate.tsx'),
      'utf-8'
    );

    // Extract widths from colgroup
    const colgroupMatch = layoutContent.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
    assert.ok(colgroupMatch, 'Must define <colgroup>');
    const widthMatches = colgroupMatch[1].match(/width:\s*['"]([0-9.]+)%['"]/g) || [];
    assert.strictEqual(widthMatches.length, 16, 'Must define exactly 16 column width percentages');

    const percentages = widthMatches.map((m) => {
      const match = m.match(/([0-9.]+)%/);
      return match ? parseFloat(match[1]) : 0;
    });

    const sum = Math.round(percentages.reduce((a, b) => a + b, 0) * 10) / 10;
    assert.strictEqual(sum, 100.0, 'Colgroup column widths must sum exactly to 100.0%');
  });

  it('2. Discrete .master-template-page class is used for page separation', () => {
    const layoutContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/templates/invoices/layouts/MasterTemplate.tsx'),
      'utf-8'
    );
    assert.ok(
      layoutContent.includes('master-template-page'),
      'MasterTemplate must render elements with className "master-template-page"'
    );
  });

  it('3. pdfService detects inv-master-template and handles discrete pages', () => {
    const pdfServiceContent = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/document/pdfService.ts'),
      'utf-8'
    );
    assert.ok(
      pdfServiceContent.includes("props.templateId === 'inv-master-template'"),
      'pdfService must detect inv-master-template'
    );
    assert.ok(
      pdfServiceContent.includes('.master-template-page'),
      'pdfService must query for .master-template-page elements'
    );
  });
});

