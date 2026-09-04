import { supabaseAuthService } from '../src/services/supabaseAuth.js';
import { productService } from '../src/services/supabase/productService.js';
import { counterSaleService } from '../src/services/supabase/counterSaleService.js';
import { supabase } from '../src/lib/supabase.js';
import { store } from '../src/services/store.js';

async function runCounterSaleRLSDiagnostic() {
  console.log('================================================================');
  console.log('VISTAAR — COUNTER SALE RLS & PRODUCT SEARCH FORENSIC DIAGNOSTIC');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail: string = '') {
    if (condition) {
      console.log(`[PASS ✅] ${testName.padEnd(50)} | ${detail}`);
      passed++;
    } else {
      console.error(`[FAIL ❌] ${testName.padEnd(50)} | ${detail}`);
      failed++;
    }
  }

  // 1. SETUP SESSION CONTEXT
  console.log('1. Initializing Authenticated Workspace Context...');
  const testUserId = '37baecfb-88c2-476a-a4d2-62a3b2e88494';
  const testWorkspaceId = '37baecfb-88c2-476a-a4d2-62a3b2e88494';

  (supabaseAuthService as any).currentProfile = {
    id: testUserId,
    companyId: testWorkspaceId,
    employeeId: 'VST-00001',
    name: 'Counter Sale RLS Tester',
    email: 'counter_sale_tester@vistaar.com',
    phone: '9876543210',
    department: 'Sales',
    designation: 'Store Manager',
    role: 'owner',
    status: 'Active',
    businessName: 'VISTAAR Test Store',
    mustChangePassword: false,
    avatarUrl: '',
  };

  const currentCompanyId = supabaseAuthService.getCurrentCompanyId();
  assert(
    currentCompanyId === testWorkspaceId,
    'Workspace Context Propagation',
    `Resolved Workspace ID: ${currentCompanyId}`
  );

  // 2. SETUP TEST PRODUCT IN STORE & DATABASE
  console.log('\n2. Setting up test product for counter sale...');
  const timestamp = Date.now();
  const testProdName = `Bearing 6205-${timestamp}`;
  const testProdSku = `SKU-6205-${timestamp}`;
  const testPartNo = `6205-2RS-${timestamp}`;

  const prodAddRes = await productService.addProduct({
    name: testProdName,
    sku: testProdSku,
    partNumber: testPartNo,
    productCode: testPartNo,
    barcode: `890123${timestamp.toString().slice(-6)}`,
    buyPrice: 150,
    sellingPrice: 300,
    currentStock: 50,
    minimumStock: 5,
    unit: 'Pcs',
  });

  const createdProd = prodAddRes.data;
  assert(
    prodAddRes.success && Boolean(createdProd?.id),
    'Product Creation (INSERT products)',
    `Product ID: ${createdProd?.id || 'N/A'}`
  );

  const productId = createdProd?.id || `prod-local-${timestamp}`;

  // 3. TEST OPERATION 1: PRODUCT AUTOCOMPLETE / SEARCH
  console.log('\n3. Testing Operation 1 — Add Product Autocomplete Search...');
  const searchResult = await productService.searchProducts(testProdSku);
  assert(
    !searchResult.error,
    'Product Search Query Execution',
    searchResult.error ? `Error: ${searchResult.error}` : 'No RLS authorization error'
  );
  assert(
    searchResult.data.some((p) => p.id === productId || p.sku === testProdSku),
    'Product Autocomplete Match Result',
    `Found ${searchResult.data.length} products matching "${testProdSku}"`
  );

  // 4. TEST OPERATION 2: PRODUCT STOCK LOOKUP
  console.log('\n4. Testing Operation 2 — Product Available Stock Lookup...');
  const availableStock = await productService.getProductAvailableStock(productId);
  assert(
    availableStock >= 50,
    'Product Stock Lookup (getProductAvailableStock)',
    `Available Stock: ${availableStock} units (Expected >= 50)`
  );

  // 5. TEST OPERATION 3: COUNTER SALE CREATION & ATOMIC STOCK DEDUCTION
  console.log('\n5. Testing Operation 3 — Counter Sale Creation & RPC Stock Finalization...');
  const invNumber = `CS-INV-${timestamp}`;
  const csResult = await counterSaleService.createCounterSale({
    customerId: null,
    customerName: 'Walk-in Retail Customer',
    phoneNumber: '9876543210',
    saleDate: new Date().toISOString().split('T')[0],
    subtotal: 900,
    discountType: 'fixed',
    discountValue: 0,
    discountAmount: 0,
    finalTotal: 900,
    invoiceNumber: invNumber,
    items: [
      {
        productId,
        productName: testProdName,
        partNumber: testPartNo,
        quantity: 3,
        rate: 300,
        amount: 900,
      },
    ],
  });

  assert(
    csResult.success,
    'Counter Sale Submission (createCounterSale)',
    csResult.success ? `Sale ID: ${csResult.data?.id || 'Success'}` : `Error: ${csResult.error}`
  );

  // 6. TEST OPERATION 4: POST-SALE STOCK DEDUCTION INTEGRITY
  console.log('\n6. Testing Operation 4 — Stock Level Post-Sale Verification...');
  const postSaleStock = await productService.getProductAvailableStock(productId);
  assert(
    postSaleStock === availableStock - 3,
    'Atomic Stock Deduction Verification',
    `Opening Stock: ${availableStock}, Post-Sale Stock: ${postSaleStock} (Deducted 3 units)`
  );

  // 7. TEST OPERATION 5: IDEMPOTENCY PROTECTION
  console.log('\n7. Testing Operation 5 — Idempotency Double-Submission Check...');
  const duplicateCsResult = await counterSaleService.createCounterSale({
    customerId: null,
    customerName: 'Walk-in Retail Customer',
    phoneNumber: '9876543210',
    saleDate: new Date().toISOString().split('T')[0],
    subtotal: 900,
    discountType: 'fixed',
    discountValue: 0,
    discountAmount: 0,
    finalTotal: 900,
    invoiceNumber: invNumber,
    items: [
      {
        productId,
        productName: testProdName,
        partNumber: testPartNo,
        quantity: 3,
        rate: 300,
        amount: 900,
      },
    ],
  });

  assert(
    duplicateCsResult.success,
    'Idempotent Sale Retry Rejection/Handling',
    'Duplicate submission handled cleanly without duplicating stock deduction'
  );

  const stockAfterDuplicate = await productService.getProductAvailableStock(productId);
  assert(
    stockAfterDuplicate === postSaleStock,
    'Idempotent Stock Protection (No Double Deduction)',
    `Stock remains: ${stockAfterDuplicate} units`
  );

  console.log('\n================================================================');
  console.log(`COUNTER SALE RLS DIAGNOSTIC SUMMARY: ${passed}/${passed + failed} PASSED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCounterSaleRLSDiagnostic().catch((err) => {
  console.error('Unhandled diagnostic error:', err);
  process.exit(1);
});
