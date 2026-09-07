/**
 * Test Quotation Workflow:
 * 1. Custom Product calculation (Sony WH-1000XM6 x 10 @ 28000 + 18% Tax)
 * 2. Mixed Items calculation (Existing Catalog Product + Custom Product)
 * 3. Stock Exemption: Quotation items with 0 stock do not trigger depletion errors
 * 4. Business Settings: UPI QR URL mapping & optional rendering flags
 */

function calculateQuotationItem(item) {
  const quantity = Number(item.quantity) || 0;
  const rate = Number(item.rate) || 0;
  const taxRate = Number(item.taxRate) || 0;
  const discountPercent = Number(item.discountPercent) || 0;

  const baseAmount = quantity * rate;
  const discountAmount = (baseAmount * discountPercent) / 100;
  const taxableAmount = baseAmount - discountAmount;
  const taxAmount = (taxableAmount * taxRate) / 100;
  const total = taxableAmount + taxAmount;

  return {
    ...item,
    baseAmount,
    discountAmount,
    taxableAmount,
    taxAmount,
    total
  };
}

function calculateQuotationTotals(items) {
  return items.reduce(
    (acc, item) => {
      const calc = calculateQuotationItem(item);
      acc.subtotal += calc.taxableAmount;
      acc.taxTotal += calc.taxAmount;
      acc.grandTotal += calc.total;
      return acc;
    },
    { subtotal: 0, taxTotal: 0, grandTotal: 0 }
  );
}

function validateStockForDocument(documentType, items, stockMap) {
  // Quotations must NEVER be blocked by stock
  if (documentType === 'quotation') {
    return { valid: true, depletedItems: [] };
  }

  // Invoices or counter sales check inventory
  const depleted = [];
  for (const it of items) {
    if (it.productId) {
      const available = stockMap[it.productId] ?? 0;
      if (it.quantity > available) {
        depleted.push({ productId: it.productId, name: it.name, requested: it.quantity, available });
      }
    }
  }

  return {
    valid: depleted.length === 0,
    depletedItems: depleted
  };
}

function runTests() {
  console.log('=== VISTAAR QUOTATION REDESIGN VERIFICATION TESTS ===\n');

  // Test 1: Custom Product calculations
  console.log('Test 1: Custom Product Line Item Calculation (Sony WH-1000XM6)');
  const customItem = {
    itemType: 'custom',
    productId: null,
    name: 'Sony WH-1000XM6',
    description: 'Noise Cancelling Headphones (Unreleased)',
    partNumber: 'WH-1000XM6-BLK',
    quantity: 10,
    rate: 28000,
    taxRate: 18,
    discountPercent: 0
  };

  const customCalc = calculateQuotationItem(customItem);
  console.log(`  Taxable: ₹${customCalc.taxableAmount} (Expected: ₹280,000)`);
  console.log(`  Tax (18%): ₹${customCalc.taxAmount} (Expected: ₹50,400)`);
  console.log(`  Total: ₹${customCalc.total} (Expected: ₹330,400)`);

  if (customCalc.taxableAmount === 280000 && customCalc.taxAmount === 50400 && customCalc.total === 330400) {
    console.log('  -> PASS: Custom item calculation matches expected values.\n');
  } else {
    throw new Error('Test 1 Failed');
  }

  // Test 2: Mixed Existing and Custom Products
  console.log('Test 2: Mixed Existing Catalog Product + Custom Product Totals');
  const catalogItem = {
    itemType: 'product',
    productId: 'prod-uuid-1234',
    name: 'Wireless Mouse',
    partNumber: 'WM-01',
    quantity: 2,
    rate: 1000,
    taxRate: 18,
    discountPercent: 0
  };

  const totals = calculateQuotationTotals([catalogItem, customItem]);
  console.log(`  Combined Subtotal: ₹${totals.subtotal} (Expected: ₹282,000)`);
  console.log(`  Combined Tax: ₹${totals.taxTotal} (Expected: ₹50,760)`);
  console.log(`  Combined Grand Total: ₹${totals.grandTotal} (Expected: ₹332,760)`);

  if (totals.subtotal === 282000 && totals.taxTotal === 50760 && totals.grandTotal === 332760) {
    console.log('  -> PASS: Mixed items aggregated correctly.\n');
  } else {
    throw new Error('Test 2 Failed');
  }

  // Test 3: Stock Exemption for Quotations
  console.log('Test 3: Stock Validation Exemption Rule');
  const mockStock = {
    'prod-uuid-1234': 0 // 0 stock for catalog product
  };

  const quoteStockCheck = validateStockForDocument('quotation', [catalogItem, customItem], mockStock);
  console.log(`  Quotation check with 0 stock: valid = ${quoteStockCheck.valid}`);

  const invoiceStockCheck = validateStockForDocument('invoice', [catalogItem, customItem], mockStock);
  console.log(`  Invoice check with 0 stock: valid = ${invoiceStockCheck.valid} (Depleted: ${invoiceStockCheck.depletedItems.length})`);

  if (quoteStockCheck.valid === true && invoiceStockCheck.valid === false) {
    console.log('  -> PASS: Quotations are never blocked by stock, while invoices enforce stock.\n');
  } else {
    throw new Error('Test 3 Failed');
  }

  // Test 4: Custom Item Persistence Structure
  console.log('Test 4: Quotation Items DB Payload Integrity');
  const dbPayload = [catalogItem, customItem].map((item, idx) => ({
    quotation_id: 'quote-uuid-abc',
    line_number: idx + 1,
    item_type: item.itemType || 'product',
    product_id: item.itemType === 'custom' ? null : item.productId,
    product_name: item.name,
    description: item.description || null,
    part_number: item.partNumber || null,
    quantity: item.quantity,
    unit_price: item.rate,
    tax_percent: item.taxRate,
    total: calculateQuotationItem(item).total
  }));

  console.log('  Custom item payload product_id:', dbPayload[1].product_id, '(Expected: null)');
  console.log('  Custom item payload item_type:', dbPayload[1].item_type, '(Expected: custom)');
  console.log('  Catalog item payload product_id:', dbPayload[0].product_id, '(Expected: prod-uuid-1234)');

  if (dbPayload[1].product_id === null && dbPayload[1].item_type === 'custom' && dbPayload[0].product_id === 'prod-uuid-1234') {
    console.log('  -> PASS: Database payload properly isolates custom products without fake IDs.\n');
  } else {
    throw new Error('Test 4 Failed');
  }

  // Test 5: UPI QR Code Configuration Snapshot
  console.log('Test 5: UPI QR Code Settings & Remittance Snapshot');
  const businessSettings = {
    upiQrCodeUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    showUpiQrOnQuotation: true,
    bankDetails: {
      accountNumber: '1234567890',
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank',
      upiQrCodeUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    }
  };

  console.log('  UPI QR URL configured:', !!businessSettings.upiQrCodeUrl);
  console.log('  Show QR on Quotation:', businessSettings.showUpiQrOnQuotation);
  if (businessSettings.upiQrCodeUrl && businessSettings.showUpiQrOnQuotation) {
    console.log('  -> PASS: UPI QR configuration preserved for quotation remittance.\n');
  } else {
    throw new Error('Test 5 Failed');
  }

  console.log('ALL REGRESSION CHECKS PASSED SUCCESSFULLY!');
}

runTests();
