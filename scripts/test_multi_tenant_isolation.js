import { supabase } from '../src/lib/supabase.js';
import { supabaseAuthService } from '../src/services/supabaseAuth.js';
import { productService } from '../src/services/supabase/productService.js';
import { customerService } from '../src/services/supabase/customerService.js';
import { invoiceService } from '../src/services/supabase/invoiceService.js';
import { quotationService } from '../src/services/supabase/quotationService.js';
import { expenseService } from '../src/services/supabase/expenseService.js';
import { paymentService } from '../src/services/supabase/paymentService.js';
import { udhariService } from '../src/services/supabase/udhariService.js';

async function runMultiTenantIsolationTests() {
  console.log('=============================================================================');
  console.log('VISTAAR — MULTI-TENANT DATA ISOLATION & SECURITY TEST SUITE (PHASE 26-32)');
  console.log('=============================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, detail) {
    total++;
    const formattedName = testName.padEnd(55);
    if (condition) {
      passed++;
      console.log(`[PASS ✅] ${formattedName} | ${detail}`);
    } else {
      console.error(`[FAIL ❌] ${formattedName} | ${detail}`);
    }
  }

  const timestamp = Date.now();
  const companyAEmail = `company_a_${timestamp}@testvistaar.com`;
  const companyAPass = `CompanyA@2026Secure!`;
  const companyBEmail = `company_b_${timestamp}@testvistaar.com`;
  const companyBPass = `CompanyB@2026Secure!`;

  let companyAWorkspaceId = '';
  let companyBWorkspaceId = '';
  let companyAProductId = '';

  // ---------------------------------------------------------------------------
  // 1. REGISTER COMPANY A
  // ---------------------------------------------------------------------------
  console.log('--- STEP 1: REGISTERING COMPANY A ---');
  const regARes = await supabaseAuthService.signUpCompany({
    companyName: 'Vistaar Test Company A',
    ownerName: 'Alice Owner A',
    email: companyAEmail,
    phone: '9810011111',
    password: companyAPass,
    confirmPassword: companyAPass,
  });

  assert(regARes.success, 'Company A Registration', `Email: ${companyAEmail}`);

  const userA = supabaseAuthService.getUser();
  companyAWorkspaceId = supabaseAuthService.getCurrentCompanyId();
  assert(
    userA !== null && companyAWorkspaceId !== '',
    'Company A Session Resolution',
    `Workspace ID: ${companyAWorkspaceId}`
  );

  // Create Company A Unique Test Records
  const prodARes = await productService.addProduct({
    name: `UNIQUE_PRODUCT_A_${timestamp}`,
    sku: `SKU-A-${timestamp}`,
    buyPrice: 1000,
    sellingPrice: 1500,
    currentStock: 10,
  });
  assert(prodARes.success, 'Company A Product Creation', `Product Name: UNIQUE_PRODUCT_A_${timestamp}`);
  companyAProductId = prodARes.data?.id || '';

  const custARes = await customerService.addCustomer({
    name: `UNIQUE_CUSTOMER_A_${timestamp}`,
    phone: '9810011111',
    email: `cust_a_${timestamp}@test.com`,
  });
  assert(custARes.success, 'Company A Customer Creation', `Customer Name: UNIQUE_CUSTOMER_A_${timestamp}`);

  const invARes = await invoiceService.createInvoice(
    { customerName: `UNIQUE_CUSTOMER_A_${timestamp}`, grandTotal: 1500, paidAmount: 1500, balanceAmount: 0 },
    [{ productName: `UNIQUE_PRODUCT_A_${timestamp}`, quantity: 1, sellingPrice: 1500, total: 1500 }]
  );
  assert(invARes.invoiceId !== undefined, 'Company A Invoice Creation', `Invoice ID: ${invARes.invoiceId}`);

  const expARes = await expenseService.createExpense({
    category: 'Rent',
    expenseName: `UNIQUE_EXPENSE_A_${timestamp}`,
    amount: 5000,
  });
  assert(expARes.expenseId !== undefined, 'Company A Expense Creation', `Expense ID: ${expARes.expenseId}`);

  // ---------------------------------------------------------------------------
  // 2. REGISTER COMPANY B & VERIFY ISOLATION
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 2: REGISTERING COMPANY B & TESTING DATA ISOLATION ---');
  await supabaseAuthService.logout();

  const regBRes = await supabaseAuthService.signUpCompany({
    companyName: 'Vistaar Test Company B',
    ownerName: 'Bob Owner B',
    email: companyBEmail,
    phone: '9820022222',
    password: companyBPass,
    confirmPassword: companyBPass,
  });

  assert(regBRes.success, 'Company B Registration', `Email: ${companyBEmail}`);

  const userB = supabaseAuthService.getUser();
  companyBWorkspaceId = supabaseAuthService.getCurrentCompanyId();
  assert(
    userB !== null && companyBWorkspaceId !== '' && companyBWorkspaceId !== companyAWorkspaceId,
    'Company B Distinct Workspace Verification',
    `Workspace A: ${companyAWorkspaceId} | Workspace B: ${companyBWorkspaceId}`
  );

  // Check Company B views: MUST NOT see Company A data
  const companyBProducts = await productService.getProducts();
  const hasProdAInB = companyBProducts.data?.some((p) => p.name?.includes(`UNIQUE_PRODUCT_A_${timestamp}`));
  assert(!hasProdAInB, 'Company B Cannot Read Company A Products', `Found in Company B: ${hasProdAInB}`);

  const companyBCustomers = await customerService.getCustomers();
  const hasCustAInB = companyBCustomers.data?.some((c) => c.name?.includes(`UNIQUE_CUSTOMER_A_${timestamp}`));
  assert(!hasCustAInB, 'Company B Cannot Read Company A Customers', `Found in Company B: ${hasCustAInB}`);

  const companyBExpenses = await expenseService.getExpenses();
  const hasExpAInB = companyBExpenses.data?.some((e) => e.expense_name?.includes(`UNIQUE_EXPENSE_A_${timestamp}`));
  assert(!hasExpAInB, 'Company B Cannot Read Company A Expenses', `Found in Company B: ${hasExpAInB}`);

  // Create Company B Unique Test Records
  const prodBRes = await productService.addProduct({
    name: `UNIQUE_PRODUCT_B_${timestamp}`,
    sku: `SKU-B-${timestamp}`,
    buyPrice: 2000,
    sellingPrice: 3000,
    currentStock: 5,
  });
  assert(prodBRes.success, 'Company B Product Creation', `Product Name: UNIQUE_PRODUCT_B_${timestamp}`);

  // ---------------------------------------------------------------------------
  // 3. SWITCH BACK TO COMPANY A & VERIFY COMPARTMENTALIZATION
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 3: LOGGING BACK INTO COMPANY A & VERIFYING ISOLATION ---');
  await supabaseAuthService.logout();

  const loginARes = await supabaseAuthService.login(companyAEmail, companyAPass);
  assert(loginARes.success, 'Company A Re-Authentication', `LoggedIn: ${loginARes.userProfile?.email}`);

  const companyAProducts = await productService.getProducts();
  const hasProdAInA = companyAProducts.data?.some((p) => p.name?.includes(`UNIQUE_PRODUCT_A_${timestamp}`));
  const hasProdBInA = companyAProducts.data?.some((p) => p.name?.includes(`UNIQUE_PRODUCT_B_${timestamp}`));
  assert(hasProdAInA, 'Company A Sees Own Product A', `Product A Visible: ${hasProdAInA}`);
  assert(!hasProdBInA, 'Company A CANNOT See Company B Product', `Product B Hidden from A: ${!hasProdBInA}`);

  // ---------------------------------------------------------------------------
  // 4. DIRECT DATABASE ACCESS & ANTI-SPOOFING TESTS (PHASE 28-31)
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 4: DIRECT DATABASE SECURITY & SPOOFING TESTS ---');
  await supabaseAuthService.logout();
  await supabaseAuthService.login(companyBEmail, companyBPass);

  // Test 4A: Direct ID Enumeration / SELECT Query by Record UUID
  if (companyAProductId) {
    const { data: directQueryData } = await supabase
      .from('products')
      .select('*')
      .eq('id', companyAProductId);

    assert(
      !directQueryData || directQueryData.length === 0,
      'Direct ID Enumeration (SELECT) Protection',
      `Attempted to fetch Product ID ${companyAProductId} as Company B. Returned rows: ${directQueryData?.length || 0}`
    );

    // Test 4B: INSERT Spoofing Protection (Attempting to insert company_id = Company A while as B)
    const { error: insertSpoofError } = await supabase
      .from('products')
      .insert([
        {
          workspace_id: companyAWorkspaceId,
          name: `SPOOF_PRODUCT_${timestamp}`,
          sku: `SPOOF-SKU-${timestamp}`,
          unit: 'Pcs',
          buy_price: 10,
          selling_price: 20,
        },
      ]);

    assert(
      insertSpoofError !== null,
      'Insert Spoofing Protection (RLS WITH CHECK)',
      `Attempted insert into Company A workspace as Company B. Rejected by DB RLS: ${insertSpoofError !== null}`
    );

    // Test 4C: UPDATE Spoofing Protection
    const { error: updateSpoofError, data: updateData } = await supabase
      .from('products')
      .update({ name: 'HACKED_BY_COMPANY_B' })
      .eq('id', companyAProductId)
      .select();

    assert(
      updateSpoofError !== null || !updateData || updateData.length === 0,
      'Update Spoofing Protection (RLS USING/WITH CHECK)',
      `Attempted update of Company A record as Company B. Blocked by DB: ${updateSpoofError !== null || !updateData || updateData.length === 0}`
    );

    // Test 4D: DELETE Spoofing Protection
    const { error: deleteSpoofError, data: deleteData } = await supabase
      .from('products')
      .delete()
      .eq('id', companyAProductId)
      .select();

    assert(
      deleteSpoofError !== null || !deleteData || deleteData.length === 0,
      'Delete Spoofing Protection (RLS DELETE)',
      `Attempted delete of Company A record as Company B. Blocked by DB: ${deleteSpoofError !== null || !deleteData || deleteData.length === 0}`
    );
  } else {
    console.warn('⚠️ Warning: companyAProductId was not generated, skipping direct enumeration tests');
  }

  console.log('\n=============================================================================');
  console.log(`MULTI-TENANT ISOLATION SECURITY AUDIT SUMMARY: ${passed}/${total} PASSED.`);
  console.log('=============================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runMultiTenantIsolationTests();
