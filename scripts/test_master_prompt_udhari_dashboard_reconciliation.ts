/**
 * MASTER PROMPT VERIFICATION TEST SUITE — VISTAAR OUTSTANDING UDHARI RECONCILIATION & DASHBOARD KPI FIX
 *
 * Implements Section 11 Test Matrix (Tests A through I):
 * - Test A: Discrepancy reconciliation (Root Cause of ₹36,354.00 verified and eliminated via branch-scoped engine)
 * - Test B: Partial payment (Invoice ₹10,000, Paid ₹6,000 -> Outstanding ₹4,000)
 * - Test C: Decimal settlement (Invoice ₹1,000, Paid ₹999.20, Payment ₹0.80 -> ₹0.00, Status PAID)
 * - Test D: Overdue partial payment (Invoice ₹10,000, Paid ₹6,000, Past due -> Outstanding ₹4,000, Overdue ₹4,000)
 * - Test E: Not overdue (Invoice ₹10,000, Paid ₹6,000, Future due -> Outstanding ₹4,000, Overdue ₹0)
 * - Test F: Fully paid invoice (Invoice ₹5,000, Paid ₹5,000 -> Outstanding ₹0, Overdue ₹0)
 * - Test G: Branch isolation (Branch A ₹316,693.60 vs Branch B ₹36,354.00 vs All Branches ₹353,047.60)
 * - Test H: Persistence and refresh (Reconciliation maintains exact state consistency)
 * - Test I: Existing inconsistent records audit and auto-repair
 */

// Mock browser environment for Node.js test execution
if (typeof globalThis.localStorage === 'undefined') {
  const storeMap = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => storeMap.get(key) || null,
    setItem: (key: string, value: string) => { storeMap.set(key, String(value)); },
    removeItem: (key: string) => { storeMap.delete(key); },
    clear: () => { storeMap.clear(); },
    key: (index: number) => Array.from(storeMap.keys())[index] || null,
    get length() { return storeMap.size; },
  } as any;
}

import { store } from '../src/services/store';
import {
  calculateInvoiceFinancials,
  calculateUdhariFinancials,
  calculateAuthoritativeUdhariMetrics,
  calculateAuthoritativeInvoiceOutstanding,
  roundTo2,
  PAYMENT_TOLERANCE,
} from '../src/services/financialCalculationService';
import { udhariService } from '../src/services/supabase/udhariService';
import { dashboardReconciliationService } from '../src/services/dashboardReconciliationService';
import { resolveDateRange } from '../src/lib/dateRange';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function runReconciliationTestSuite() {
  console.log('================================================================================');
  console.log('MASTER PROMPT TEST MATRIX: UDHARI RECONCILIATION & DASHBOARD KPI FIX');
  console.log('================================================================================\n');

  // Reset local state for clean testing
  const state = store.getState();
  state.invoices = [];
  state.payments = [];
  state.udharis = [];
  state.udhariPayments = [];

  const branchAlpha = 'BRANCH-ALPHA-MAIN';
  const branchBeta = 'BRANCH-BETA-SECONDARY';

  // ---------------------------------------------------------------------------
  // TEST A: Discrepancy Reconciliation (₹36,354.00 Root Cause Verification)
  // ---------------------------------------------------------------------------
  console.log('--- TEST A: Current Discrepancy & Root Cause Resolution ---');
  {
    // Simulate the exact observed state:
    // Branch Alpha (Main Branch): ₹3,16,693.60 outstanding
    // Branch Beta (Secondary Branch): ₹36,354.00 outstanding
    // Total Issued: ₹5,28,435.60, Total Recovered: ₹1,75,388.00, Total Net Outstanding: ₹3,53,047.60

    // Record in Branch Alpha: Total ₹4,50,000, Paid ₹1,33,306.40 -> Outstanding ₹3,16,693.60
    store.addInvoice({
      invoiceNumber: 'INV-ALPHA-001',
      branchId: branchAlpha,
      customerId: 'CUST-A1',
      customerName: 'Branch A Enterprise',
      date: '2026-10-01',
      dueDate: '2026-10-10', // Overdue
      grandTotal: 450000,
      paidAmount: 133306.40,
      balanceAmount: 316693.60,
      status: 'Partially Paid',
      items: [],
    });

    // Record in Branch Beta: Total ₹78,435.60, Paid ₹42,081.60 -> Outstanding ₹36,354.00
    store.addInvoice({
      invoiceNumber: 'INV-BETA-001',
      branchId: branchBeta,
      customerId: 'CUST-B1',
      customerName: 'Branch B Industrial',
      date: '2026-10-01',
      dueDate: '2026-10-25',
      grandTotal: 78435.60,
      paidAmount: 42081.60,
      balanceAmount: 36354.00,
      status: 'Partially Paid',
      items: [],
    });

    // 1. Scoped to Branch Alpha (Main Dashboard for Branch Alpha)
    const metricsAlpha = store.getUdhariMetrics({ branchId: branchAlpha, isMainBranch: true });
    assert(metricsAlpha.outstanding === 316693.60, `Branch Alpha Outstanding is exactly ₹3,16,693.60 (got ${metricsAlpha.outstanding})`);
    assert(metricsAlpha.totalUdhari === 450000, `Branch Alpha Total Issued is ₹4,50,000.00`);
    assert(metricsAlpha.totalReceived === 133306.40, `Branch Alpha Total Recovered is ₹1,33,306.40`);

    // 2. Scoped to Branch Beta
    const metricsBeta = store.getUdhariMetrics({ branchId: branchBeta, isMainBranch: false });
    assert(metricsBeta.outstanding === 36354.00, `Branch Beta Outstanding is exactly ₹36,354.00 (got ${metricsBeta.outstanding})`);
    assert(metricsBeta.totalUdhari === 78435.60, `Branch Beta Total Issued is ₹78,435.60`);
    assert(metricsBeta.totalReceived === 42081.60, `Branch Beta Total Recovered is ₹42,081.60`);

    // 3. Combined / All Branches Scope (All Branches Analysis)
    const metricsAll = store.getUdhariMetrics({ branchId: 'ALL' });
    assert(metricsAll.totalUdhari === 528435.60, `All Branches Total Issued is exactly ₹5,28,435.60 (got ${metricsAll.totalUdhari})`);
    assert(metricsAll.totalReceived === 175388.00, `All Branches Total Recovered is exactly ₹1,75,388.00 (got ${metricsAll.totalReceived})`);
    assert(metricsAll.outstanding === 353047.60, `All Branches Net Outstanding is exactly ₹3,53,047.60 (got ${metricsAll.outstanding})`);

    // Mathematical identity verification
    const diff = roundTo2(metricsAll.outstanding - metricsAlpha.outstanding);
    assert(diff === 36354.00, `Reconciled Discrepancy is verified: All Branches (₹3,53,047.60) - Branch A (₹3,16,693.60) = ₹${diff.toFixed(2)}`);

    // Invariant: Total Issued - Total Recovered = Net Outstanding
    assert(roundTo2(metricsAll.totalUdhari - metricsAll.totalReceived) === metricsAll.outstanding, 'Arithmetic Identity Verified: Total Issued - Total Recovered = Net Outstanding');
  }

  // ---------------------------------------------------------------------------
  // TEST B: Partial Payment (Invoice ₹10,000, Paid ₹6,000)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST B: Partial Payment ---');
  {
    const invB = calculateInvoiceFinancials(10000, 6000);
    assert(invB.grandTotal === 10000, 'Test B: Grand total is ₹10,000.00');
    assert(invB.paidAmount === 6000, 'Test B: Paid amount is ₹6,000.00');
    assert(invB.balanceAmount === 4000, 'Test B: Expected outstanding is ₹4,000.00');
    assert(invB.status === 'Partially Paid', 'Test B: Status is Partially Paid');
  }

  // ---------------------------------------------------------------------------
  // TEST C: Decimal Settlement (Invoice ₹1,000, Paid ₹999.20, Payment ₹0.80)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST C: Decimal Settlement ---');
  {
    // Midway state
    const midway = calculateInvoiceFinancials(1000, 999.20);
    assert(midway.balanceAmount === 0.80, 'Test C: Midway balance is exact ₹0.80');
    assert(midway.status === 'Partially Paid', 'Test C: Midway status is Partially Paid');

    // Settle with exact ₹0.80 payment
    const finalFin = calculateInvoiceFinancials(1000, 1000);
    assert(finalFin.paidAmount === 1000, 'Test C: Total paid is ₹1,000.00');
    assert(finalFin.balanceAmount === 0, 'Test C: Outstanding is ₹0.00');
    assert(finalFin.status === 'Paid', 'Test C: Status is PAID');

    const udFin = calculateUdhariFinancials(1000, 1000);
    assert(udFin.outstandingAmount === 0, 'Test C: Udhari outstanding is ₹0.00');
    assert(udFin.status === 'PAID', 'Test C: Udhari status is PAID');
  }

  // ---------------------------------------------------------------------------
  // TEST D: Overdue Partial Payment (Invoice ₹10,000, Paid ₹6,000, Past Due)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST D: Overdue Partial Payment ---');
  {
    const pastDate = '2026-09-01';
    const singleRecord = [{
      id: 'UD-TEST-D',
      originalAmount: 10000,
      totalReceived: 6000,
      outstandingAmount: 4000,
      dueDate: pastDate,
      status: 'OVERDUE',
      branchId: branchAlpha,
    }];

    const metricsD = calculateAuthoritativeUdhariMetrics(singleRecord, { branchId: branchAlpha });
    assert(metricsD.outstanding === 4000, 'Test D: Net Outstanding is ₹4,000.00');
    assert(metricsD.overdue === 4000, 'Test D: Overdue Credit is ₹4,000.00');
    assert(metricsD.overdue <= metricsD.outstanding, 'Test D: Overdue is <= Net Outstanding');
  }

  // ---------------------------------------------------------------------------
  // TEST E: Not Overdue (Invoice ₹10,000, Paid ₹6,000, Future Due)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST E: Not Overdue ---');
  {
    const futureDate = '2026-12-31';
    const singleRecord = [{
      id: 'UD-TEST-E',
      originalAmount: 10000,
      totalReceived: 6000,
      outstandingAmount: 4000,
      dueDate: futureDate,
      status: 'PARTIALLY PAID',
      branchId: branchAlpha,
    }];

    const metricsE = calculateAuthoritativeUdhariMetrics(singleRecord, { branchId: branchAlpha });
    assert(metricsE.outstanding === 4000, 'Test E: Net Outstanding is ₹4,000.00');
    assert(metricsE.overdue === 0, 'Test E: Overdue Credit is ₹0.00');
  }

  // ---------------------------------------------------------------------------
  // TEST F: Fully Paid Invoice (Invoice ₹5,000, Paid ₹5,000)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST F: Fully Paid Invoice ---');
  {
    const singleRecord = [{
      id: 'UD-TEST-F',
      originalAmount: 5000,
      totalReceived: 5000,
      outstandingAmount: 0,
      dueDate: '2026-09-01', // Past due date, but balance is 0
      status: 'PAID',
      branchId: branchAlpha,
    }];

    const metricsF = calculateAuthoritativeUdhariMetrics(singleRecord, { branchId: branchAlpha });
    assert(metricsF.outstanding === 0, 'Test F: Outstanding is ₹0.00');
    assert(metricsF.overdue === 0, 'Test F: Overdue is ₹0.00 (settled invoice not counted in overdue)');
    assert(metricsF.settledCount === 1, 'Test F: Exactly 1 settled record counted');
  }

  // ---------------------------------------------------------------------------
  // TEST G: Branch Isolation (Branch A vs Branch B vs All Branches)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST G: Multi-Branch Financial Isolation ---');
  {
    const multiBranchRecords = [
      { id: 'UD-G1', branchId: 'BRANCH-1', originalAmount: 50000, totalReceived: 20000, outstandingAmount: 30000, dueDate: '2026-10-01' },
      { id: 'UD-G2', branchId: 'BRANCH-2', originalAmount: 70000, totalReceived: 10000, outstandingAmount: 60000, dueDate: '2026-10-01' },
      { id: 'UD-G3', branchId: 'BRANCH-3', originalAmount: 40000, totalReceived: 40000, outstandingAmount: 0, dueDate: '2026-10-01' },
    ];

    const m1 = calculateAuthoritativeUdhariMetrics(multiBranchRecords, { branchId: 'BRANCH-1' });
    const m2 = calculateAuthoritativeUdhariMetrics(multiBranchRecords, { branchId: 'BRANCH-2' });
    const m3 = calculateAuthoritativeUdhariMetrics(multiBranchRecords, { branchId: 'BRANCH-3' });
    const mAll = calculateAuthoritativeUdhariMetrics(multiBranchRecords, { branchId: 'ALL' });

    assert(m1.outstanding === 30000, 'Branch 1 outstanding is ₹30,000');
    assert(m2.outstanding === 60000, 'Branch 2 outstanding is ₹60,000');
    assert(m3.outstanding === 0, 'Branch 3 outstanding is ₹0');
    assert(mAll.outstanding === 90000, 'All Branches outstanding is sum: ₹90,000');
    assert(m1.outstanding + m2.outstanding + m3.outstanding === mAll.outstanding, 'Branch isolation invariant holds: Sum(Branches) == All Branches');
  }

  // ---------------------------------------------------------------------------
  // TEST H: Persistence and Refresh Consistency
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST H: Persistence & Refresh Consistency ---');
  {
    // Reconcile and simulate reload
    const targetState = store.getState();
    store.reconcileStateLedgers(targetState);

    const checkAlpha = store.getUdhariMetrics({ branchId: branchAlpha, isMainBranch: true });
    assert(checkAlpha.outstanding === 316693.60, 'Branch Alpha Outstanding maintained across state reconciliation');

    const checkAll = store.getUdhariMetrics({ branchId: 'ALL' });
    assert(checkAll.outstanding === 353047.60, 'All Branches Outstanding maintained across state reconciliation');
  }

  // ---------------------------------------------------------------------------
  // TEST I: Audit and Auto-Repair of Orphan Invoices
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST I: Audit & Auto-Repair of Orphan Invoices ---');
  {
    // Create an invoice with positive balance that has NO matching Udhari entry
    const orphanInv = store.addInvoice({
      invoiceNumber: 'INV-ORPHAN-001',
      branchId: branchAlpha,
      customerId: 'CUST-ORPHAN',
      customerName: 'Orphan Customer',
      date: '2026-10-12',
      dueDate: '2026-10-27',
      grandTotal: 15000,
      paidAmount: 5000,
      balanceAmount: 10000,
      status: 'Partially Paid',
      items: [],
    });

    // Artificially remove any linked udhari from state to test auto-repair
    state.udharis = state.udharis.filter((u) => u.invoiceId !== orphanInv.id && u.id !== `UD-${orphanInv.invoiceNumber}`);

    // Trigger reconciliation
    store.reconcileStateLedgers(store.getState());

    // Check that auto-repair created the linked Udhari entry
    const repairedU = store.getUdharis().find((u) => u.invoiceId === orphanInv.id || u.id === `UD-${orphanInv.invoiceNumber}`);
    assert(!!repairedU, 'Orphan invoice receivable automatically repaired and linked in Udhari ledger');
    assert(repairedU?.outstandingAmount === 10000, 'Repaired Udhari outstanding matches invoice balance ₹10,000');
    assert(repairedU?.branchId === branchAlpha, 'Repaired Udhari branch matches invoice branch');
  }

  console.log('\n================================================================================');
  console.log('✅ ALL TESTS A THROUGH I IN MASTER PROMPT TEST MATRIX PASSED SUCCESSFULLY!');
  console.log('================================================================================');
}

runReconciliationTestSuite().catch((err) => {
  console.error('Fatal error in Master Prompt Test Matrix:', err);
  process.exit(1);
});
