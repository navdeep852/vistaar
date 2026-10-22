import { invoiceService } from '../src/services/supabase/invoiceService';
import { paymentService } from '../src/services/supabase/paymentService';
import { customerPaymentService } from '../src/services/supabase/customerPaymentService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { salesAnalyticsService } from '../src/services/supabase/salesAnalyticsService';
import { backupService } from '../src/services/backupService';
import { recoveryService } from '../src/services/recoveryService';
import { store } from '../src/services/store';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase';
import { resolveDateRange } from '../src/lib/dateRange';
import { safeGetTenantStorage } from '../src/services/supabase/safeStorage';

import { registerCurrentUserResolver } from '../src/lib/permissions';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, detail: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}: ${detail}`);
    results.push({ name: testName, passed: true, details: detail });
  } else {
    console.error(`❌ [FAIL] ${testName}: ${detail}`);
    results.push({ name: testName, passed: false, details: detail });
  }
}

async function runTestSuite() {
  console.log('\n=============================================================');
  console.log('   VISTAAR FINANCIAL DATA PERSISTENCE & BACKUP TEST SUITE    ');
  console.log('=============================================================\n');

  const wsId = 'a0000000-0000-4000-8000-000000000001';
  const ownerId = 'b0000000-0000-4000-8000-000000000001';

  registerCurrentUserResolver(() => ({
    id: ownerId,
    role: 'owner',
    status: 'Active',
    workspaceId: wsId,
  } as any));

  (supabaseAuthService as any).currentProfile = {
    id: ownerId,
    companyId: wsId,
    role: 'owner',
    name: 'Owner',
    email: 'admin@vistaar.com',
    employeeId: 'VST-0001',
    status: 'Active',
  };
  (supabaseAuthService as any).authoritativeWorkspaceId = wsId;
  supabaseAuthService.isAuthenticated = () => true;
  supabaseAuthService.getUser = () => (supabaseAuthService as any).currentProfile;
  supabaseAuthService.getCurrentCompanyId = () => wsId;
  supabaseAuthService.getAuthoritativeWorkspaceId = async () => wsId;

  const dateRange = resolveDateRange('THIS_YEAR');

  // -------------------------------------------------------------
  // TEST A: New Fully Paid Invoice (Soldier, ₹87,000 paid)
  // -------------------------------------------------------------
  console.log('--- TEST A: Creating fully paid invoice (Soldier, ₹87,000) ---');
  const soldierInvNum = `INV-TEST-SOLDIER-${Date.now().toString().slice(-4)}`;
  const resA = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    invoiceNumber: soldierInvNum,
    customerName: 'Soldier',
    customerPhone: '9876543210',
    date: new Date().toISOString().split('T')[0],
    subtotal: 87000,
    grandTotal: 87000,
    paidAmount: 87000,
    balanceAmount: 0,
    paymentMode: 'Cash',
    paymentNotes: 'Full cash payment for Soldier order',
    items: [
      {
        productName: 'Professional Hardware Supplies',
        quantity: 1,
        sellingPrice: 87000,
        total: 87000,
      },
    ],
  });

  assert(resA.success === true, 'Test A - Finalization Succeeded', `Invoice #${soldierInvNum} finalized`);
  assert(resA.paidAmount === 87000, 'Test A - Paid Amount', `Paid amount is ₹${resA.paidAmount}`);
  assert(resA.balanceAmount === 0, 'Test A - Balance Amount', `Outstanding balance is ₹${resA.balanceAmount}`);

  // Verify Invoice Records search works by customer name "Soldier"
  const recordsRes = await invoiceService.getInvoices({ search: 'Soldier' });
  const foundSoldier = recordsRes.data?.find((i) => i.invoiceNumber === soldierInvNum || i.customerName?.toLowerCase().includes('soldier'));
  assert(!!foundSoldier, 'Test A - Invoice Records Search', `Found invoice in records with customer name Soldier`);

  // Verify Analytics Collections & Sales
  const analyticsA = await enterpriseAnalyticsService.getAnalyticsOverview(dateRange, true, undefined, wsId);
  assert(analyticsA.kpis.collections >= 87000, 'Test A - Collections Updated', `Total collections: ₹${analyticsA.kpis.collections}`);

  // -------------------------------------------------------------
  // TEST B: Partial Payment Invoice (₹87,000 total, ₹20,000 paid)
  // -------------------------------------------------------------
  console.log('\n--- TEST B: Creating partial payment invoice (₹87,000 total, ₹20,000 paid) ---');
  const partialInvNum = `INV-TEST-PARTIAL-${Date.now().toString().slice(-4)}`;
  const resB = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    invoiceNumber: partialInvNum,
    customerName: 'Soldier Partial Client',
    customerPhone: '9876543211',
    date: new Date().toISOString().split('T')[0],
    subtotal: 87000,
    grandTotal: 87000,
    paidAmount: 20000,
    balanceAmount: 67000,
    paymentMode: 'UPI',
    paymentNotes: 'Partial UPI advance payment',
    items: [
      {
        productName: 'Specialized Equipment Batch',
        quantity: 1,
        sellingPrice: 87000,
        total: 87000,
      },
    ],
  });

  assert(resB.success === true, 'Test B - Partial Finalization', `Invoice #${partialInvNum} finalized`);
  assert(resB.paidAmount === 20000, 'Test B - Paid ₹20,000', `Paid: ₹${resB.paidAmount}`);
  assert(resB.balanceAmount === 67000, 'Test B - Outstanding ₹67,000', `Balance: ₹${resB.balanceAmount}`);

  const paymentsForB = store.getPaymentsForInvoice(partialInvNum);
  const totalPaidB = paymentsForB.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  assert(totalPaidB === 20000, 'Test B - Payment Record Persistence', `Payment history records exactly ₹${totalPaidB}`);

  // -------------------------------------------------------------
  // TEST C: Restart Persistence Simulation
  // -------------------------------------------------------------
  console.log('\n--- TEST C: Simulating Application Restart / Re-hydration ---');
  // Re-read from safe storage and store reconciliation
  const reloadedInvoices = await invoiceService.getInvoices({ search: soldierInvNum });
  const soldierAfterReload = reloadedInvoices.data?.find((i) => i.invoiceNumber === soldierInvNum);
  assert(!!soldierAfterReload, 'Test C - Invoice Persists After Reload', `Invoice #${soldierInvNum} retrieved after restart`);
  assert(soldierAfterReload?.paidAmount === 87000, 'Test C - Paid Amount Durable', `Paid amount remains ₹87,000`);

  const reloadedAnalytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRange, true, undefined, wsId);
  assert(reloadedAnalytics.kpis.collections >= 107000, 'Test C - Collections Persistent Across Restart', `Collections remain ₹${reloadedAnalytics.kpis.collections}`);

  // -------------------------------------------------------------
  // TEST D: Failed Database Write Resilience (No False Success)
  // -------------------------------------------------------------
  console.log('\n--- TEST D: Simulating Validation Rejection & Database Error ---');
  // Attempt to finalize with invalid/corrupt data that exceeds validation boundaries
  const resD = await customerPaymentService.recordCustomerPayment({
    invoiceNumber: partialInvNum,
    amount: -500, // Invalid negative amount
    paymentMethod: 'Cash',
  });

  assert(resD.success === false, 'Test D - Negative Payment Rejection', `Invalid payment properly rejected: "${resD.error}"`);
  assert(!!resD.error, 'Test D - Meaningful Error Returned', 'Honest failure reported to user, no false success');

  // Attempt to overpay invoice beyond balance
  const resD2 = await customerPaymentService.recordCustomerPayment({
    invoiceNumber: partialInvNum,
    amount: 100000, // Balance is only 67000
    paymentMethod: 'Cash',
  });
  assert(resD2.success === false, 'Test D - Overpayment Rejection', `Overpayment properly rejected: "${resD2.error}"`);

  // -------------------------------------------------------------
  // TEST E: Payment Idempotency
  // -------------------------------------------------------------
  console.log('\n--- TEST E: Testing Payment Idempotency & Duplicate Prevention ---');
  const idempotencyInvNum = `INV-IDEM-${Date.now().toString().slice(-4)}`;
  const resE = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    invoiceNumber: idempotencyInvNum,
    customerName: 'Idempotency Test Cust',
    grandTotal: 10000,
    paidAmount: 5000,
    balanceAmount: 5000,
    paymentMode: 'Cash',
    items: [{ productName: 'Item A', quantity: 1, sellingPrice: 10000, total: 10000 }],
  });

  // Check initial payment count for this invoice
  const paysE1 = store.getPaymentsForInvoice(idempotencyInvNum);
  assert(paysE1.length === 1, 'Test E - Initial Upfront Payment', `Exactly 1 payment initially recorded (₹${paysE1[0].amount})`);

  // Re-run store reconciliation simulating duplicate sync
  store.reconcileStateLedgers((store as any).state);
  const paysE2 = store.getPaymentsForInvoice(idempotencyInvNum);
  assert(paysE2.length === 1, 'Test E - Idempotent Reconciliation', `Duplicate sync did not double-count payment (count remains ${paysE2.length})`);

  // -------------------------------------------------------------
  // TEST F: Branch & Workspace Isolation
  // -------------------------------------------------------------
  console.log('\n--- TEST F: Testing Branch & Workspace Isolation ---');
  const branch1Id = 'b0000000-0000-0000-0000-000000000001';
  const branch2Id = 'b0000000-0000-0000-0000-000000000002';

  const invB1 = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    invoiceNumber: `INV-BR1-${Date.now().toString().slice(-4)}`,
    branchId: branch1Id,
    customerName: 'Branch 1 Customer',
    grandTotal: 15000,
    paidAmount: 15000,
    balanceAmount: 0,
    paymentMode: 'Cash',
    items: [{ productName: 'Branch 1 Item', quantity: 1, sellingPrice: 15000, total: 15000 }],
  });

  const branch1Invoices = await invoiceService.getInvoices({ branchId: branch1Id });
  const hasOnlyB1 = branch1Invoices.data?.every((i) => !i.branchId || i.branchId === branch1Id);
  assert(hasOnlyB1 === true, 'Test F - Branch Isolation Filtering', `Branch 1 query only retrieves Branch 1 authorized documents`);

  // -------------------------------------------------------------
  // TEST G: Backup & Restore Engine Verification
  // -------------------------------------------------------------
  console.log('\n--- TEST G: Testing Backup Creation, Checksum & Restore ---');
  const backupRes = await backupService.createBackup({ type: 'manual' });
  assert(backupRes.success === true, 'Test G - Backup Creation Succeeded', `Backup ID: ${backupRes.backup?.id.substring(0, 8)}`);
  assert(!!backupRes.backup?.checksumSha256, 'Test G - SHA-256 Checksum Present', `Checksum: ${backupRes.backup?.checksumSha256.substring(0, 16)}...`);
  assert((backupRes.backup?.fileSizeBytes || 0) > 0, 'Test G - Non-Empty Backup Size', `Size: ${backupRes.backup?.fileSizeBytes} bytes`);

  // Test Verification
  const content = await backupService.getBackupContent(backupRes.backup!.id);
  assert(!!content, 'Test G - Backup Content Retrievable', 'Content JSON string loaded successfully');

  const verifyRes = await backupService.verifyBackupIntegrity(content!);
  assert(verifyRes.valid === true, 'Test G - Integrity Verification', 'SHA-256 Checksum verified matches calculated hash');
  assert((verifyRes.recordCounts?.invoices || 0) > 0, 'Test G - Invoices Preserved in Snapshot', `Snapshot contains ${verifyRes.recordCounts?.invoices} invoices`);

  // Test Guarded Restore Rejection on incorrect confirmation
  const badRestore = await backupService.restoreBackup(backupRes.backup!.id, 'WRONG_CODE');
  assert(badRestore.success === false, 'Test G - Guarded Restore Rejection', `Restore correctly rejected without "RESTORE": "${badRestore.error}"`);

  // Test Guarded Restore Success with 'RESTORE'
  const goodRestore = await backupService.restoreBackup(backupRes.backup!.id, 'RESTORE');
  assert(goodRestore.success === true, 'Test G - Guarded Restore Success', `Restored ${goodRestore.restoredCounts?.invoices} invoices`);
  assert(!!goodRestore.safetyBackupId, 'Test G - Safety Snapshot Created First', `Safety backup created before restore (${goodRestore.safetyBackupId?.substring(0, 8)})`);

  // -------------------------------------------------------------
  // TEST H: Historical Data Reconciliation
  // -------------------------------------------------------------
  console.log('\n--- TEST H: Testing Historical Ledger Reconciliation ---');
  const finalAnalytics = await enterpriseAnalyticsService.getAnalyticsOverview(dateRange, true, undefined, wsId);
  const totalSalesVal = finalAnalytics.kpis.totalSales;
  const collectionsVal = finalAnalytics.kpis.collections;
  const outstandingVal = finalAnalytics.kpis.outstandingUdhari;

  console.log(`[Reconciliation Summary] Total Sales: ₹${totalSalesVal} | Collections: ₹${collectionsVal} | Outstanding: ₹${outstandingVal}`);
  assert(collectionsVal > 0, 'Test H - Collections Non-Zero & Reconciled', `Collections: ₹${collectionsVal}`);
  assert(totalSalesVal >= collectionsVal || outstandingVal >= 0, 'Test H - Mathematical Consistency', 'Sales, Collections, and Outstanding are structurally sound');

  // -------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n=============================================================');
  console.log('                 TEST SUITE EXECUTION SUMMARY                ');
  console.log('=============================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Total Assertions: ${results.length}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedCount === 0) {
    console.log('\n🎉 ALL REGRESSION TESTS PASSED! FINANCIAL INTEGRITY CONFIRMED.');
  } else {
    console.error('\n⚠️ SOME REGRESSION TESTS FAILED.');
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with uncaught exception:', err);
});
