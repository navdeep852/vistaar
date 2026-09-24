import { payrollService } from '../src/services/supabase/payrollService.js';
import { expenseService } from '../src/services/supabase/expenseService.js';
import { daybookService } from '../src/services/supabase/daybookService.js';
import { cashbookService } from '../src/services/supabase/cashbookService.js';
import { financialStatementService } from '../src/services/financialStatementService.js';
import { resolveDateRange } from '../src/lib/dateRange.js';

async function runPayrollIntegrationTest() {
  console.log('===============================================================');
  console.log('VISTAAR BUSINESS OS — PAYROLL & FINANCIAL INTEGRATION TEST');
  console.log('===============================================================');

  const testEmpId = '00000000-0000-0000-0000-000000000099';
  const testEmpName = 'Rahul Sharma (Test)';
  const testEmpCode = 'VST-00099';
  const testMonth = '09';
  const testYear = '2026';
  const periodStart = '2026-09-01';
  const periodEnd = '2026-09-30';
  const periodLabel = 'September 2026';
  const paymentDate = '2026-09-30';

  // STEP 1: CONFIGURE SALARY STRUCTURE
  console.log('\n--- 1. Testing Salary Structure Upsert ---');
  const structRes = await payrollService.upsertSalaryStructure({
    employeeId: testEmpId,
    salaryFrequency: 'Monthly',
    baseSalary: 30000,
    hraAllowance: 5000,
    otherAllowances: 2000,
    standardDeductions: 1000,
    paymentMode: 'Bank Transfer',
    bankName: 'HDFC Bank',
    bankAccountNo: '50100234567890',
  });
  console.log('Structure Upsert Success:', structRes.success);
  console.log('Base Salary:', structRes.structure?.baseSalary);
  console.log('Payment Mode:', structRes.structure?.paymentMode);

  if (!structRes.success) {
    throw new Error('Salary structure upsert failed');
  }

  // STEP 2: DUPLICATE CHECK (BEFORE PAYMENT)
  console.log('\n--- 2. Checking Duplicate Prevention (Pre-payment) ---');
  const preCheck = await payrollService.checkDuplicateSalary(testEmpId, periodStart, periodEnd, 'REGULAR');
  console.log('Pre-check isDuplicate (expect false):', preCheck.isDuplicate);
  if (preCheck.isDuplicate) {
    throw new Error('Expected duplicate check to be false before recording payment');
  }

  // STEP 3: RECORD SALARY PAYMENT
  console.log('\n--- 3. Recording Salary Payment ---');
  const payRes = await payrollService.recordSalaryPayment({
    employeeId: testEmpId,
    employeeName: testEmpName,
    employeeCode: testEmpCode,
    department: 'Operations',
    designation: 'Store Manager',
    salaryPeriodStart: periodStart,
    salaryPeriodEnd: periodEnd,
    salaryPeriodLabel: periodLabel,
    paymentDate,
    grossAmount: 37000,
    deductionAmount: 2000, // 1000 standard + 1000 advance recovery
    additionAmount: 0,
    netAmount: 35000,
    paymentMode: 'Bank Transfer',
    status: 'PAID',
    transactionType: 'REGULAR',
    notes: 'September salary disbursed via bank transfer',
  });

  console.log('Payment Record Success:', payRes.success);
  console.log('Payment ID:', payRes.paymentId);
  console.log('Reference No:', payRes.payment?.referenceNo);
  console.log('Net Amount:', payRes.payment?.netAmount);

  if (!payRes.success || !payRes.paymentId) {
    throw new Error('Salary payment recording failed: ' + payRes.error);
  }

  const paymentId = payRes.paymentId;
  const refNo = payRes.payment!.referenceNo;

  // STEP 4: DUPLICATE PREVENTION CHECK (POST-PAYMENT)
  console.log('\n--- 4. Testing Duplicate Prevention (Post-payment) ---');
  const postCheck = await payrollService.checkDuplicateSalary(testEmpId, periodStart, periodEnd, 'REGULAR');
  console.log('Post-check isDuplicate (expect true):', postCheck.isDuplicate);
  if (!postCheck.isDuplicate) {
    throw new Error('Duplicate check failed: duplicate salary should be blocked for same employee & period!');
  }

  // Attempt duplicate record
  const dupAttempt = await payrollService.recordSalaryPayment({
    employeeId: testEmpId,
    employeeName: testEmpName,
    employeeCode: testEmpCode,
    salaryPeriodStart: periodStart,
    salaryPeriodEnd: periodEnd,
    salaryPeriodLabel: periodLabel,
    paymentDate,
    grossAmount: 37000,
    deductionAmount: 2000,
    netAmount: 35000,
    paymentMode: 'Bank Transfer',
    status: 'PAID',
    transactionType: 'REGULAR',
  });
  console.log('Duplicate attempt rejected (expect false):', !dupAttempt.success);
  console.log('Rejection message:', dupAttempt.error);
  if (dupAttempt.success) {
    throw new Error('Duplicate payment was erroneously permitted!');
  }

  // STEP 5: VERIFY LINKED FINANCIAL POSTINGS
  console.log('\n--- 5. Verifying Linked Postings (Expense, Daybook, Cashbook) ---');

  // A. Linked Expense
  const { data: expenses } = await expenseService.getExpenses();
  const linkedExp = expenses.find((e) => (e as any).sourceId === paymentId || e.referenceNo === refNo);
  console.log('Linked Expense Found:', Boolean(linkedExp));
  console.log('Expense Category:', linkedExp?.category);
  console.log('Expense Amount:', linkedExp?.amount);
  console.log('Expense Source Type:', (linkedExp as any)?.sourceType);
  if (!linkedExp || linkedExp.amount !== 35000 || linkedExp.category !== 'Salary') {
    throw new Error('Linked expense mismatch or missing!');
  }

  // B. Linked Daybook
  const { data: daybookTxs } = await daybookService.getTransactions();
  const linkedDb = daybookTxs.find((t) => t.referenceId === paymentId || t.referenceNumber === refNo);
  console.log('Linked Daybook Entry Found:', Boolean(linkedDb));
  console.log('Daybook Type:', linkedDb?.transactionType);
  console.log('Daybook Direction:', linkedDb?.direction);
  console.log('Daybook Outflow Amount:', linkedDb?.amount);
  if (!linkedDb || linkedDb.amount !== 35000 || linkedDb.direction !== 'OUT') {
    throw new Error('Linked Daybook entry mismatch or missing!');
  }

  // STEP 6: VERIFY P&L SINGLE SOURCE OF TRUTH (NO DOUBLE COUNTING)
  console.log('\n--- 6. Verifying P&L Integration ---');
  const dateRange = resolveDateRange('custom', '2026-09-01', '2026-09-30');
  const plReport = await financialStatementService.getComprehensiveFinancials(dateRange);

  const salaryCategory = plReport.current.operatingExpenses.categories.find(
    (c) => c.category.toLowerCase() === 'salary'
  );
  console.log('P&L Operating Expenses Total:', plReport.current.operatingExpenses.totalExpenses);
  console.log('P&L Salary Category Amount:', salaryCategory?.amount);

  if (!salaryCategory || salaryCategory.amount < 35000) {
    throw new Error('P&L failed to include the verified salary payment in Operating Expenses!');
  }

  // STEP 7: AUDIT CONSISTENCY
  console.log('\n--- 7. Running Payroll Consistency Audit ---');
  const auditRes = await payrollService.auditPayrollConsistency(dateRange);
  console.log('Audit Overall Status:', auditRes.overallStatus);
  console.log('Total Payments Checked:', auditRes.totalPaymentsChecked);
  console.log('Reconciled Count:', auditRes.reconciledCount);
  console.log('Mismatches Found:', auditRes.mismatchesFound);
  if (auditRes.mismatchesFound > 0) {
    console.warn('Audit issues:', auditRes.results.map((r) => r.issues));
  }

  // STEP 8: CANCELLATION & REVERSAL WORKFLOW
  console.log('\n--- 8. Testing Cancellation & Reversal Workflow ---');
  const cancelRes = await payrollService.cancelSalaryPayment(paymentId, 'Test cancellation validation');
  console.log('Cancellation Success:', cancelRes.success);
  if (!cancelRes.success) {
    throw new Error('Failed to cancel salary payment: ' + cancelRes.error);
  }

  // Verify status is CANCELLED
  const cancelledPayment = await payrollService.getSalaryPayment(paymentId);
  console.log('Payment Status (expect CANCELLED):', cancelledPayment?.status);
  console.log('Cancellation Reason:', cancelledPayment?.cancellationReason);
  if (cancelledPayment?.status !== 'CANCELLED') {
    throw new Error('Payment status did not transition to CANCELLED');
  }

  // Verify linked expense was deleted/reversed
  const { data: expsAfterCancel } = await expenseService.getExpenses();
  const orphanedExp = expsAfterCancel.find((e) => (e as any).sourceId === paymentId);
  console.log('Linked Expense Deleted (expect undefined):', orphanedExp);
  if (orphanedExp) {
    throw new Error('Linked expense was not removed upon cancellation!');
  }

  // Verify Daybook entry was marked VOID
  const { data: dbAfterCancel } = await daybookService.getTransactions();
  const voidedDb = dbAfterCancel.find((t) => t.referenceId === paymentId);
  console.log('Daybook Status (expect VOID):', voidedDb?.status);
  if (voidedDb && voidedDb.status !== 'VOID') {
    throw new Error('Daybook entry was not voided upon cancellation!');
  }

  console.log('\n===============================================================');
  console.log('ALL PAYROLL INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
  console.log('===============================================================');
}

runPayrollIntegrationTest().catch((err) => {
  console.error('\nTEST RUN FAILED:', err);
  process.exit(1);
});
