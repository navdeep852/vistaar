/**
 * Comprehensive Product Creation & Inventory Integration Regression Suite
 */

import { productService } from '../src/services/supabase/productService';
import { supabaseAuthService } from '../src/services/supabaseAuth';

async function runProductRegressionTests() {
  console.log('=================================================================');
  console.log('  VISTAAR — PRODUCT CREATION & INVENTORY INTEGRATION TEST SUITE');
  console.log('=================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
    }
  }

  // 1. Authenticate Business A
  console.log('Step 1: Authenticating User A (Business A)...');
  const loginA = await supabaseAuthService.login('admin@vistaar.com', 'Vistaar@2026Secure');
  assert(loginA.success, 'Login User A', loginA.error);
  const workspaceA = supabaseAuthService.getCurrentCompanyId();
  console.log('   Business A Workspace ID:', workspaceA);

  // 2. Test Minimal Product Creation
  console.log('\nStep 2: Testing Minimal Product Creation (Test A)...');
  const minProdRes = await productService.addProduct({
    name: 'Minimal Test Bearing',
    partNumber: 'MIN-9901',
    productCode: 'MIN-9901',
    buyPrice: 100,
    sellingPrice: 150,
    currentStock: 0,
  });
  assert(minProdRes.success && Boolean(minProdRes.data?.id), 'Create Minimal Product', minProdRes.error);
  const minProdId = minProdRes.data?.id;

  // 3. Test Full Product Creation matching Screenshot (Test B)
  console.log('\nStep 3: Testing Full Master Product Creation (Test B - Screenshot values)...');
  const fullProdRes = await productService.addProduct({
    name: '75665',
    partNumber: '1000078',
    productCode: '1000078',
    sku: '1000078',
    category: 'Bearing',
    brand: 'ABC',
    unit: 'Piece',
    buyPrice: 200,
    sellingPrice: 300,
    currentStock: 23,
    receivedDate: '2026-08-28',
    purchaseOrderNumber: 'PO-2026-99',
    supplierName: 'ABC Bearings Ltd',
    hsnSac: '8482',
    gstRate: 18,
    minimumStock: 5,
    notes: 'Master Bearing Product Test',
  });

  assert(fullProdRes.success && Boolean(fullProdRes.data?.id), 'Create Full Master Product', fullProdRes.error);
  const fullProdId = fullProdRes.data?.id;

  if (fullProdRes.data) {
    assert(fullProdRes.data.name === '75665', 'Product Name correctly saved');
    assert(fullProdRes.data.partNumber === '1000078', 'Part Number correctly saved');
    assert(fullProdRes.data.buyPrice === 200, 'Buy Price correctly saved');
    assert(fullProdRes.data.sellingPrice === 300, 'Selling Price correctly saved');
    assert(fullProdRes.data.currentStock === 23, 'Opening Stock correctly set to 23');
  }

  // 4. Test Stock Availability Calculation (Test C)
  console.log('\nStep 4: Testing Product Available Stock...');
  if (fullProdId) {
    const stockQty = await productService.getProductAvailableStock(fullProdId);
    assert(stockQty === 23, 'Product Available Stock returns 23', `Got: ${stockQty}`);
  }

  // 5. Test Product List Fetch (Test E)
  console.log('\nStep 5: Testing Product List Fetching...');
  const listRes = await productService.getProducts();
  assert(!listRes.error, 'Fetch Products list without error', listRes.error);
  const foundProd = listRes.data.find((p) => p.id === fullProdId);
  assert(Boolean(foundProd), 'Newly created product appears in Product List');
  if (foundProd) {
    assert(foundProd.currentStock === 23, 'Product List displays correct stock (23)');
  }

  // 6. Test Multi-Tenant Data Isolation (Business B)
  console.log('\nStep 6: Testing Multi-Tenant Data Isolation (Business B)...');
  await supabaseAuthService.logout();

  let loginB = await supabaseAuthService.login('userb@compb.com', 'PassB@2026Secure');
  if (!loginB.success) {
    const signupB = await supabaseAuthService.signUpCompany({
      companyName: 'Company B Enterprises',
      email: 'userb@compb.com',
      password: 'PassB@2026Secure',
      confirmPassword: 'PassB@2026Secure',
      ownerName: 'Owner B',
      phone: '+91 99999 88888',
    });
    if (signupB.error) {
      console.log('   User B Signup error:', signupB.error);
    }
    loginB = await supabaseAuthService.login('userb@compb.com', 'PassB@2026Secure');
  }

  assert(loginB.success, 'Login User B (Business B)', loginB.error);
  const workspaceB = supabaseAuthService.getCurrentCompanyId();
  console.log('   Business B Workspace ID:', workspaceB);
  assert(workspaceB !== workspaceA, 'Business B has distinct Workspace ID');

  const listResB = await productService.getProducts();
  const prodInB = listResB.data.find((p) => p.id === fullProdId);
  assert(!prodInB, 'Business B CANNOT see Product A (Tenant Isolation Intact)');

  // 7. Cleanup Test Records
  console.log('\nStep 7: Cleaning up test records...');
  await supabaseAuthService.logout();
  await supabaseAuthService.login('admin@vistaar.com', 'Vistaar@2026Secure');

  if (minProdId) await productService.deleteProduct(minProdId);
  if (fullProdId) await productService.deleteProduct(fullProdId);

  const listAfterCleanup = await productService.getProducts();
  const existsAfterClean = listAfterCleanup.data.some((p) => p.id === fullProdId || p.id === minProdId);
  assert(!existsAfterClean, 'Test products successfully cleaned up');

  console.log('\n=================================================================');
  console.log(`  REGRESSION TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('=================================================================\n');

  if (passedTests === totalTests) {
    console.log('✨ ALL PRODUCT CREATION & INVENTORY TESTS PASSED PERFECTLY!');
  } else {
    process.exit(1);
  }
}

runProductRegressionTests().catch((err) => {
  console.error('Fatal regression suite error:', err);
  process.exit(1);
});
