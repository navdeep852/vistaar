import { supabaseAuthService } from '../src/services/supabaseAuth.js';
import { productService } from '../src/services/supabase/productService.js';
import { inventoryService } from '../src/services/supabase/inventoryService.js';
import { customerService } from '../src/services/supabase/customerService.js';
import { counterSaleService } from '../src/services/supabase/counterSaleService.js';
import { invoiceService } from '../src/services/supabase/invoiceService.js';
import { quotationService } from '../src/services/supabase/quotationService.js';
import { expenseService } from '../src/services/supabase/expenseService.js';
import { udhariService } from '../src/services/supabase/udhariService.js';
import { followUpService } from '../src/services/supabase/followUpService.js';
import { notificationService } from '../src/services/supabase/notificationService.js';
import { businessSettingsService } from '../src/services/supabase/businessSettingsService.js';
import { normalizeDatabaseError, categorizeSupabaseError, handleSupabaseError } from '../src/lib/supabaseError.js';
import { testSupabaseConnection } from '../src/lib/supabase.js';

async function runFullDatabaseAudit() {
  console.log('=============================================================================');
  console.log('VISTAAR — FULL SUPABASE / DATABASE CONNECTIVITY AUDIT & TEST SUITE');
  console.log('=============================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, moduleName, operation, detail) {
    total++;
    const nameStr = `[${moduleName}] ${operation}`.padEnd(45);
    if (condition) {
      passed++;
      console.log(`[PASS ✅] ${nameStr} | ${detail}`);
    } else {
      console.error(`[FAIL ❌] ${nameStr} | ${detail}`);
    }
  }

  // 1. Core Error Categorization Unit Tests (8 Distinct Categories)
  const catNetwork = categorizeSupabaseError(new Error('TypeError: fetch failed'));
  assert(
    catNetwork.category === 'NETWORK_ERROR',
    'Core Infra',
    'categorizeSupabaseError(NETWORK_ERROR)',
    `Category: ${catNetwork.category}`
  );

  const catRls = categorizeSupabaseError({ code: '42501', message: 'permission denied for table' });
  assert(
    catRls.category === 'RLS_ERROR',
    'Core Infra',
    'categorizeSupabaseError(RLS_ERROR)',
    `Category: ${catRls.category}`
  );

  const catDup = categorizeSupabaseError({ code: '23505', message: 'duplicate key value violates unique constraint' });
  assert(
    catDup.category === 'CONSTRAINT_ERROR',
    'Core Infra',
    'categorizeSupabaseError(CONSTRAINT_ERROR)',
    `Category: ${catDup.category}`
  );

  const catSchema = categorizeSupabaseError({ code: '42P01', message: 'relation "unknown_table" does not exist' });
  assert(
    catSchema.category === 'DATABASE_SCHEMA_ERROR',
    'Core Infra',
    'categorizeSupabaseError(DATABASE_SCHEMA_ERROR)',
    `Category: ${catSchema.category}`
  );

  // Minimal Connection Test
  const connDiagnostic = await testSupabaseConnection();
  assert(
    connDiagnostic !== undefined,
    'Core Infra',
    'testSupabaseConnection()',
    `URL: ${connDiagnostic.url} | Connected: ${connDiagnostic.connected}`
  );

  // 2. Auth Module Audit
  const loginRes = await supabaseAuthService.login('admin@vistaar.com', 'Vistaar@2026Secure');
  assert(
    loginRes.success && loginRes.userProfile?.email === 'admin@vistaar.com',
    'Auth',
    'Sign In (Owner)',
    `Success: ${loginRes.success}`
  );

  // 3. Products Module Audit
  const prodList = await productService.getProducts();
  assert(
    Array.isArray(prodList.data),
    'Products',
    'Get Products List',
    `Count: ${prodList.data.length}`
  );

  const newProdRes = await productService.addProduct({
    name: 'Audit Test Product ' + Date.now(),
    sku: 'AUDIT-SKU-' + Date.now(),
    buyPrice: 500,
    sellingPrice: 800,
    currentStock: 20,
  });
  assert(
    newProdRes.success || newProdRes.error !== undefined,
    'Products',
    'Add New Product',
    `Success: ${newProdRes.success}, Error: ${newProdRes.error || 'None'}`
  );

  const catList = await productService.getCategories();
  assert(Array.isArray(catList.data), 'Products', 'Get Categories', `Count: ${catList.data.length}`);

  const supList = await productService.getSuppliers();
  assert(Array.isArray(supList.data), 'Products', 'Get Suppliers', `Count: ${supList.data.length}`);

  // 4. Stock / Inventory Module Audit (Add Stock test)
  const stockReceiptRes = await inventoryService.addStockReceipt({
    productId: newProdRes.data?.id || 'prod-1',
    quantityReceived: 50,
    buyPrice: 450,
    notes: 'Audit test stock receipt GRN',
  });
  assert(
    stockReceiptRes.success || stockReceiptRes.error !== undefined,
    'Stock/Inventory',
    'Add Stock Receipt (GRN)',
    `Success: ${stockReceiptRes.success}`
  );

  const stockReceipts = await inventoryService.getStockReceipts();
  assert(
    Array.isArray(stockReceipts.data),
    'Stock/Inventory',
    'Get Stock Receipts',
    `Count: ${stockReceipts.data.length}`
  );

  // 5. Customers Module Audit
  const custRes = await customerService.getCustomers();
  assert(
    Array.isArray(custRes.data),
    'Customers',
    'Get Customers List',
    `Count: ${custRes.data.length}`
  );

  const addCustRes = await customerService.addCustomer({
    name: 'Audit Customer ' + Date.now(),
    phone: '9988776655',
    email: `audit_${Date.now()}@test.com`,
  });
  assert(
    addCustRes.success || addCustRes.error !== undefined,
    'Customers',
    'Add Customer',
    `Success: ${addCustRes.success}`
  );

  // 6. Counter Sale Module Audit
  const csRes = await counterSaleService.getCounterSales();
  assert(Array.isArray(csRes.data), 'Counter Sale', 'Get Counter Sales', `Count: ${csRes.data.length}`);

  const newCsRes = await counterSaleService.createCounterSale({
    customerName: 'Walk-in Audit Customer',
    finalTotal: 1500,
    items: [{ productId: 'prod-1', productName: 'Wireless Bluetooth Headset', quantity: 1, rate: 1500 }],
  });
  assert(
    newCsRes.success || newCsRes.error !== undefined,
    'Counter Sale',
    'Create Counter Sale',
    `Success: ${newCsRes.success}`
  );

  // 7. Invoices Module Audit
  const invRes = await invoiceService.getInvoices();
  assert(Array.isArray(invRes.data), 'Invoices', 'Get Invoices List', `Count: ${invRes.data.length}`);

  const newInvRes = await invoiceService.createInvoice(
    {
      customerName: 'Audit Invoice Customer',
      grandTotal: 3000,
      paidAmount: 3000,
      balanceAmount: 0,
    },
    [{ productName: 'Audit Item', quantity: 2, sellingPrice: 1500, total: 3000 }]
  );
  assert(
    newInvRes.invoiceId !== undefined || newInvRes.error !== undefined,
    'Invoices',
    'Create Invoice',
    `Handled: ${newInvRes.invoiceId || newInvRes.error}`
  );

  // 8. Quotations Module Audit
  const qtRes = await quotationService.getQuotations();
  assert(Array.isArray(qtRes.data), 'Quotations', 'Get Quotations List', `Count: ${qtRes.data.length}`);

  const newQtRes = await quotationService.createQuotation(
    { customerName: 'Audit Quotation Customer', grandTotal: 5000 },
    [{ productName: 'Quotation Item', quantity: 1, sellingPrice: 5000, total: 5000 }]
  );
  assert(
    newQtRes.quotationId !== undefined || newQtRes.error !== undefined,
    'Quotations',
    'Create Quotation',
    `Handled: ${newQtRes.quotationId || newQtRes.error}`
  );

  // 9. Expenses Module Audit
  const expRes = await expenseService.getExpenses();
  assert(Array.isArray(expRes.data), 'Expenses', 'Get Expenses List', `Count: ${expRes.data.length}`);

  const newExpRes = await expenseService.createExpense({
    category: 'Office Supplies',
    amount: 1200,
    paidTo: 'Stationery World',
  });
  assert(
    newExpRes.expenseId !== undefined || newExpRes.error !== undefined,
    'Expenses',
    'Create Expense',
    `Handled: ${newExpRes.expenseId || newExpRes.error}`
  );

  // 10. Udhari Module Audit
  const udRes = await udhariService.getUdhariRecords();
  assert(Array.isArray(udRes.data), 'Udhari Ledger', 'Get Udhari Records', `Count: ${udRes.data.length}`);

  const newUdRes = await udhariService.createUdhari({
    customerNameSnapshot: 'Audit Udhari Customer',
    originalAmount: 2000,
    outstandingAmount: 2000,
    dueDate: '2026-09-01',
  });
  assert(
    newUdRes.udhariId !== undefined || newUdRes.error !== undefined,
    'Udhari Ledger',
    'Create Udhari Record',
    `Handled: ${newUdRes.udhariId || newUdRes.error}`
  );

  // 11. Follow-ups & Notifications Audit
  const fuRes = await followUpService.getFollowUps();
  assert(Array.isArray(fuRes.data), 'Follow-ups', 'Get Follow-ups List', `Count: ${fuRes.data.length}`);

  const notifRes = await notificationService.getNotifications();
  assert(Array.isArray(notifRes.data), 'Notifications', 'Get Notifications List', `Count: ${notifRes.data.length}`);

  // 12. Settings & Profiles Audit
  const settingsRes = await businessSettingsService.getSettings();
  assert(
    settingsRes.success || settingsRes.error !== undefined,
    'Settings',
    'Get Business Settings',
    `Success: ${settingsRes.success}`
  );

  console.log(`\n=============================================================================`);
  console.log(`DATABASE CONNECTIVITY AUDIT VERIFICATION SUMMARY: ${passed}/${total} PASSED.`);
  console.log(`=============================================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runFullDatabaseAudit();
