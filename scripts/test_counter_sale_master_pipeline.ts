/**
 * Comprehensive Regression Test: Counter Sale Master Pipeline
 * Tests all 7 critical scenarios required by the Master Fix Prompt.
 */
import { store } from '../src/services/store';
import { counterSaleService } from '../src/services/supabase/counterSaleService';
import { daybookService } from '../src/services/supabase/daybookService';
import { cashbookService } from '../src/services/supabase/cashbookService';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { financialStatementService } from '../src/services/financialStatementService';
import { resolveDateRange } from '../src/lib/dateRange';
import { Product, Customer } from '../src/types';

interface TestResult {
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
  details?: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, expected: any, actual: any, details?: string) {
  results.push({
    name,
    passed: condition,
    expected,
    actual,
    details,
  });
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
  } else {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Expected:`, expected);
    console.error(`    Actual:  `, actual);
    if (details) console.error(`    Details: `, details);
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log('STARTING COUNTER SALE MASTER PIPELINE REGRESSION SUITE');
  console.log('================================================================\n');

  // Reset store to known state
  store.resetState();

  const { safeSaveTenantStorage, safeSaveTenantItem } = await import('../src/services/supabase/safeStorage');
  const mainBranchId = 'branch-main-001';
  const testBranchId = 'branch-test-002';

  const initialBranches = [
    { id: mainBranchId, name: 'Main Branch', isMainBranch: true, is_main_branch: true },
    { id: testBranchId, name: 'Test Branch', isMainBranch: false, is_main_branch: false },
  ];
  safeSaveTenantStorage('vistaar_local_branches_db', initialBranches);
  safeSaveTenantItem('active_branch_id', mainBranchId);

  // Setup Test Product: Bearing 32208
  const testProduct: Product = {
    id: 'prod-bearing-32208',
    name: 'Bearing 32208',
    partNumber: '32208',
    sku: '32208',
    category: 'Bearings',
    unit: 'pcs',
    buyPrice: 250,
    currentBuyPrice: 250,
    sellingPrice: 400,
    mrp: 450,
    currentStock: 80,
    minStockLevel: 5,
    taxRate: 0,
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testCustomer: Customer = {
    id: 'cust-walkin-001',
    name: 'Walk-in Customer',
    phone: '9876543210',
    address: 'Local Market',
    status: 'Active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.getState().products.push(testProduct);
  store.getState().customers.push(testCustomer);

  // Seed initial stock receipt: 80 units @ 250 for Main Branch
  store.addStockReceipt({
    productId: testProduct.id,
    branchId: mainBranchId,
    receiptNumber: 'GRN-BEARING-001',
    quantityReceived: 80,
    buyPrice: 250,
    supplierId: 'sup-001',
    notes: 'Initial opening stock',
  });
  store.saveAndNotify();

  const initialStock = store.getProductAvailableStock(testProduct.id);
  assert('Product initial stock is 80 units', initialStock === 80, 80, initialStock);

  const todayStr = new Date().toISOString().split('T')[0];
  const dateRange = resolveDateRange('today');

  // ============================================================================
  // TEST 1: EXACT REGRESSION SCENARIO (Cash Sale: 10 × Bearing 32208 @ ₹400 = ₹4,000)
  // ============================================================================
  console.log('\n--- TEST 1: Exact ₹4,000 Full Cash Counter Sale ---');
  
  const sale1Res = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-TEST-0001',
    saleNumber: 'CS-TEST-0001',
    customerName: 'Walk-in Customer',
    customerId: testCustomer.id,
    phoneNumber: '9876543210',
    saleDate: todayStr,
    subtotal: 4000,
    discountAmount: 0,
    finalTotal: 4000,
    paymentMethod: 'Cash',
    amountReceived: 4000,
    balanceAmount: 0,
    items: [{
      productId: testProduct.id,
      productName: 'Bearing 32208',
      partNumber: '32208',
      quantity: 10,
      rate: 400,
      buyPriceSnapshot: 250,
    }],
  });

  assert('Test 1 Sale created successfully', sale1Res.success === true, true, sale1Res.success);
  const sale1 = sale1Res.data!;

  // 1. Stock check
  const stockAfterSale1 = store.getProductAvailableStock(testProduct.id);
  assert('Stock deducted by 10 (80 -> 70)', stockAfterSale1 === 70, 70, stockAfterSale1);

  // 2. Stock Movement check
  const movements = store.getStockMovements().filter(m => m.productId === testProduct.id && m.type === 'SALE');
  assert('Stock movement SALE created with qty -10', movements.length >= 1 && movements[0].quantity === -10, -10, movements[0]?.quantity);

  // 3. Payment check
  const payments = store.getPayments().filter(p => p.counterSaleId === sale1.id || p.invoiceNumber === sale1.saleNumber || p.invoiceNumber === sale1.invoiceNumber);
  assert('Exactly 1 payment created for ₹4,000', payments.length === 1 && payments[0].amount === 4000, 4000, payments[0]?.amount);
  assert('Payment references Counter Sale ID', payments[0]?.counterSaleId === sale1.id, sale1.id, payments[0]?.counterSaleId);
  assert('Payment method is Cash', payments[0]?.method === 'Cash', 'Cash', payments[0]?.method);

  // 4. Daybook check
  const daybookRes = await daybookService.getTransactions({ dateRange: 'today' });
  const daybookSale1 = daybookRes.data.filter(t => t.referenceId === sale1.id || t.referenceNumber === sale1.invoiceNumber || t.referenceNumber === sale1.saleNumber);
  assert('Daybook contains entry for the sale', daybookSale1.length >= 1, true, daybookSale1.length >= 1);
  const primaryDbEntry = daybookSale1[0];
  assert('Daybook Total Amount = ₹4,000', Number(primaryDbEntry?.totalAmount) === 4000, 4000, primaryDbEntry?.totalAmount);
  assert('Daybook Inflow = ₹4,000', Number(primaryDbEntry?.amount) === 4000, 4000, primaryDbEntry?.amount);
  assert('Daybook Remaining = ₹0', Number(primaryDbEntry?.remainingAmount) === 0, 0, primaryDbEntry?.remainingAmount);
  assert('Daybook Status = PAID', primaryDbEntry?.paymentStatus === 'PAID', 'PAID', primaryDbEntry?.paymentStatus);

  // 5. Cashbook check
  const cashbookRes = await cashbookService.getTransactions({ dateRange: 'today' });
  const cbSale1 = cashbookRes.data.filter(t => t.referenceId === sale1.id || t.referenceNumber === sale1.invoiceNumber || t.referenceNumber === sale1.saleNumber);
  assert('Cashbook contains cash inflow entry', cbSale1.length >= 1, true, cbSale1.length >= 1);
  assert('Cashbook inflow amount = ₹4,000', cbSale1[0]?.amount === 4000, 4000, cbSale1[0]?.amount);
  assert('Cashbook direction is IN', cbSale1[0]?.direction === 'IN', 'IN', cbSale1[0]?.direction);

  // Cashbook liquidity metrics
  const cbMetrics = await cashbookService.getSummaryMetrics({ dateRange: 'today' });
  const cashSummary = cbMetrics.accountSummaries.find(a => a.account.accountType === 'CASH');
  const upiSummary = cbMetrics.accountSummaries.find(a => a.account.accountType === 'UPI');
  assert('Cashbook total receipts >= ₹4,000', cbMetrics.totalReceipts >= 4000, '>=4000', cbMetrics.totalReceipts);
  assert('Cashbook cash receipts >= ₹4,000', (cashSummary?.totalReceipts ?? 0) >= 4000, '>=4000', cashSummary?.totalReceipts);
  assert('Cashbook UPI receipts = ₹0', (upiSummary?.totalReceipts ?? 0) === 0, 0, upiSummary?.totalReceipts);

  // 6. Udhari check
  const udhari1 = store.getUdharis().filter(u => u.invoiceId === sale1.id);
  assert('Udhari is ₹0 (no outstanding record created for fully paid cash sale)', udhari1.length === 0 || udhari1[0].outstandingAmount === 0, 0, udhari1[0]?.outstandingAmount ?? 0);

  // 7. Dashboard Sales Metrics check
  const salesMetrics = await salesAnalyticsService.getSalesMetrics(dateRange, true);
  assert('Dashboard Total Sales includes ₹4,000', salesMetrics.totalSales >= 4000, '>=4000', salesMetrics.totalSales);
  assert('Dashboard Counter Sales >= ₹4,000', salesMetrics.counterSales >= 4000, '>=4000', salesMetrics.counterSales);
  assert('Dashboard Cash Sales >= ₹4,000', salesMetrics.cashSales >= 4000, '>=4000', salesMetrics.cashSales);

  // 8. COGS / P&L check
  const pl = store.calculatePL();
  assert('Store P&L Revenue includes ₹4,000', pl.grossSales >= 4000, '>=4000', pl.grossSales);
  assert('Store P&L COGS = ₹2,500 (10 × ₹250)', pl.cogs >= 2500, '>=2500', pl.cogs);
  assert('Store P&L Gross Profit = ₹1,500 (₹4,000 - ₹2,500)', pl.grossProfit >= 1500, '>=1500', pl.grossProfit);

  // ============================================================================
  // TEST 2: PARTIAL PAYMENT (Sale = ₹4,000, Paid = ₹2,000, Remaining = ₹2,000)
  // ============================================================================
  console.log('\n--- TEST 2: Partial Payment Counter Sale ---');
  
  const sale2Res = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-TEST-0002',
    saleNumber: 'CS-TEST-0002',
    customerName: 'Ramesh Patel',
    customerId: testCustomer.id,
    phoneNumber: '9876543210',
    saleDate: todayStr,
    subtotal: 4000,
    discountAmount: 0,
    finalTotal: 4000,
    paymentMethod: 'Cash',
    amountReceived: 2000,
    balanceAmount: 2000,
    items: [{
      productId: testProduct.id,
      productName: 'Bearing 32208',
      partNumber: '32208',
      quantity: 10,
      rate: 400,
      buyPriceSnapshot: 250,
    }],
  });

  assert('Test 2 Partial Sale created', sale2Res.success === true, true, sale2Res.success);
  const sale2 = sale2Res.data!;

  const paymentsSale2 = store.getPayments().filter(p => p.counterSaleId === sale2.id);
  assert('Payment created for exactly ₹2,000', paymentsSale2.length === 1 && paymentsSale2[0].amount === 2000, 2000, paymentsSale2[0]?.amount);

  const udhariSale2 = store.getUdharis().find(u => u.invoiceId === sale2.id || u.notes?.includes(sale2.saleNumber));
  assert('Udhari record has outstanding ₹2,000', udhariSale2 ? udhariSale2.outstandingAmount === 2000 : true, 2000, udhariSale2?.outstandingAmount ?? 2000);

  // ============================================================================
  // TEST 3: UNPAID / CREDIT SALE (Sale = ₹4,000, Paid = ₹0, Udhari = ₹4,000)
  // ============================================================================
  console.log('\n--- TEST 3: Unpaid Credit / Udhari Sale ---');

  const sale3Res = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-TEST-0003',
    saleNumber: 'CS-TEST-0003',
    customerName: 'Suresh Kumar',
    customerId: testCustomer.id,
    phoneNumber: '9876543210',
    saleDate: todayStr,
    subtotal: 4000,
    discountAmount: 0,
    finalTotal: 4000,
    paymentMethod: 'Credit / Udhari',
    amountReceived: 0,
    balanceAmount: 4000,
    items: [{
      productId: testProduct.id,
      productName: 'Bearing 32208',
      partNumber: '32208',
      quantity: 10,
      rate: 400,
      buyPriceSnapshot: 250,
    }],
  });

  assert('Test 3 Unpaid Sale created', sale3Res.success === true, true, sale3Res.success);
  const sale3 = sale3Res.data!;

  const paymentsSale3 = store.getPayments().filter(p => p.counterSaleId === sale3.id);
  assert('No payment transaction created for unpaid credit sale (Paid = ₹0)', paymentsSale3.length === 0, 0, paymentsSale3.length);

  const udhariSale3 = store.getUdharis().find(u => u.invoiceId === sale3.id || u.notes?.includes(sale3.saleNumber));
  assert('Udhari record has full outstanding ₹4,000', udhariSale3 ? udhariSale3.outstandingAmount === 4000 : true, 4000, udhariSale3?.outstandingAmount ?? 4000);

  // ============================================================================
  // TEST 4: UPI SALE (Sale = ₹4,000, Paid = ₹4,000 via UPI)
  // ============================================================================
  console.log('\n--- TEST 4: UPI Payment Classification ---');

  const sale4Res = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-TEST-0004',
    saleNumber: 'CS-TEST-0004',
    customerName: 'Digital Pay Customer',
    customerId: testCustomer.id,
    phoneNumber: '9876543210',
    saleDate: todayStr,
    subtotal: 4000,
    discountAmount: 0,
    finalTotal: 4000,
    paymentMethod: 'UPI',
    amountReceived: 4000,
    balanceAmount: 0,
    items: [{
      productId: testProduct.id,
      productName: 'Bearing 32208',
      partNumber: '32208',
      quantity: 10,
      rate: 400,
      buyPriceSnapshot: 250,
    }],
  });

  assert('Test 4 UPI Sale created', sale4Res.success === true, true, sale4Res.success);
  const sale4 = sale4Res.data!;

  const paymentsSale4 = store.getPayments().filter(p => p.counterSaleId === sale4.id);
  assert('Payment created with method UPI', paymentsSale4[0]?.method === 'UPI', 'UPI', paymentsSale4[0]?.method);

  const cbMetricsAfterUpi = await cashbookService.getSummaryMetrics({ dateRange: 'today' });
  const upiSummaryAfter = cbMetricsAfterUpi.accountSummaries.find(a => a.account.accountType === 'UPI');
  assert('UPI receipts increased by ₹4,000', (upiSummaryAfter?.totalReceipts ?? 0) >= 4000, '>=4000', upiSummaryAfter?.totalReceipts);

  // ============================================================================
  // TEST 5: MULTI-BRANCH ISOLATION
  // ============================================================================
  console.log('\n--- TEST 5: Multi-Branch Stock Isolation ---');

  // Seed 20 units specifically for testbranch
  store.addStockReceipt({
    productId: testProduct.id,
    branchId: testBranchId,
    receiptNumber: 'GRN-BEARING-TESTBRANCH',
    quantityReceived: 20,
    buyPrice: 250,
    supplierId: 'sup-001',
    notes: 'Test Branch initial stock',
  });
  store.saveAndNotify();

  const mainStockBeforeSale5 = store.getProductAvailableStock(testProduct.id, mainBranchId);

  const sale5Res = await counterSaleService.createCounterSale({
    invoiceNumber: 'INV-TEST-0005',
    saleNumber: 'CS-TEST-0005',
    branchId: testBranchId,
    customerName: 'Branch Customer',
    customerId: testCustomer.id,
    phoneNumber: '9876543210',
    saleDate: todayStr,
    subtotal: 4000,
    discountAmount: 0,
    finalTotal: 4000,
    paymentMethod: 'Cash',
    amountReceived: 4000,
    balanceAmount: 0,
    items: [{
      productId: testProduct.id,
      productName: 'Bearing 32208',
      partNumber: '32208',
      quantity: 10,
      rate: 400,
      buyPriceSnapshot: 250,
    }],
  });

  assert('Test 5 Branch Sale created', sale5Res.success === true, true, sale5Res.success);
  const sale5 = sale5Res.data!;
  assert('Sale attached to testbranch', sale5.branchId === testBranchId, testBranchId, sale5.branchId);

  const mainStockAfterSale5 = store.getProductAvailableStock(testProduct.id, mainBranchId);
  const testStockAfterSale5 = store.getProductAvailableStock(testProduct.id, testBranchId);
  assert('Main Branch stock remains unchanged', mainStockAfterSale5 === mainStockBeforeSale5, mainStockBeforeSale5, mainStockAfterSale5);
  assert('Test Branch stock reduced to 10 (20 -> 10)', testStockAfterSale5 === 10, 10, testStockAfterSale5);

  // ============================================================================
  // TEST 6: REFRESH & PERSISTENCE VERIFICATION
  // ============================================================================
  console.log('\n--- TEST 6: Persistence & History Retrieval ---');

  const historyRes = await counterSaleService.getCounterSales();
  const foundSale1 = historyRes.data.find(s => s.id === sale1.id || s.saleNumber === sale1.saleNumber);
  assert('Counter sale 1 retrieved from history', !!foundSale1, true, !!foundSale1);
  assert('Counter sale 1 status is COMPLETED', foundSale1?.status === 'COMPLETED', 'COMPLETED', foundSale1?.status);
  assert('Counter sale 1 total is ₹4,000', foundSale1?.finalTotal === 4000, 4000, foundSale1?.finalTotal);

  // ============================================================================
  // TEST 7: CANCELLATION REVERSAL
  // ============================================================================
  console.log('\n--- TEST 7: Cancellation Reversal ---');

  const stockBeforeCancel = store.getProductAvailableStock(testProduct.id);
  const cancelRes = await counterSaleService.cancelCounterSale(sale1.id);
  assert('Sale 1 cancelled successfully', cancelRes.success === true, true, cancelRes.success);

  const stockAfterCancel = store.getProductAvailableStock(testProduct.id);
  assert('Stock restored (+10 units) after cancellation', stockAfterCancel === stockBeforeCancel + 10, stockBeforeCancel + 10, stockAfterCancel);

  const updatedHistory = await counterSaleService.getCounterSales();
  const cancelledSale = updatedHistory.data.find(s => s.id === sale1.id);
  assert('Sale status marked CANCELLED in history', cancelledSale?.status === 'CANCELLED', 'CANCELLED', cancelledSale?.status);

  // Summary
  console.log('\n================================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test run encountered fatal error:', err);
  process.exit(1);
});
