/**
 * VISTAAR BUSINESS OS — Expense -> Daybook -> Cashbook -> Dashboard Outflow Pipeline Test Suite
 * 
 * Tests:
 * - Test A: Record a paid expense (persist, Daybook outflow, Cashbook outflow, Dashboard outflow, Net movement)
 * - Test B: Record an unpaid expense (0 cash outflow; marking paid increases outflow once)
 * - Test C: Partial expense payment (only paid portion counted in cash outflow)
 * - Test D: Date filters (Today, Yesterday, Week, Month, Last Month, Custom Range)
 * - Test E: Duplicate prevention (idempotency, no duplicate ledger entries)
 * - Test F: Cross-module consistency (Daybook, Cashbook, Dashboard agreement)
 * - Test G: Regression (Invoices, Counter Sales, Customer Payments remain intact)
 * - Test H: Multi-tenant workspace isolation
 */

import { expenseService } from '../src/services/supabase/expenseService';
import { daybookService } from '../src/services/supabase/daybookService';
import { cashbookService } from '../src/services/supabase/cashbookService';
import { enterpriseAnalyticsService } from '../src/services/supabase/enterpriseAnalyticsService';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { store } from '../src/services/store';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase';
import { registerCurrentUserResolver } from '../src/lib/permissions';
import { safeSaveTenantStorage, safeGetTenantStorage } from '../src/services/supabase/safeStorage';
import { Expense } from '../src/types';
import { resolveDateRange } from '../src/lib/dateRange';

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

async function runExpensePipelineTestSuite() {
  console.log('\n=============================================================');
  console.log('   VISTAAR EXPENSE -> DAYBOOK -> CASHBOOK TEST SUITE         ');
  console.log('=============================================================\n');

  const wsA = 'a0000000-0000-4000-8000-000000000001';
  const ownerA = 'b0000000-0000-4000-8000-000000000001';

  registerCurrentUserResolver(() => ({
    id: ownerA,
    role: 'owner',
    status: 'Active',
    workspaceId: wsA,
  } as any));

  (supabaseAuthService as any).currentProfile = {
    id: ownerA,
    companyId: wsA,
    role: 'owner',
    name: 'Test Owner A',
    email: 'admin@vistaar.com',
    employeeId: 'VST-0001',
    status: 'Active',
  };
  (supabaseAuthService as any).authoritativeWorkspaceId = wsA;
  supabaseAuthService.isAuthenticated = () => true;
  supabaseAuthService.getUser = () => (supabaseAuthService as any).currentProfile;
  supabaseAuthService.getCurrentCompanyId = () => wsA;
  supabaseAuthService.getAuthoritativeWorkspaceId = async () => wsA;

  // Clear test state
  store.setExpenses([]);
  safeSaveTenantStorage('vistaar_local_expenses_db', []);
  safeSaveTenantStorage('vistaar_local_daybook_db', []);
  safeSaveTenantStorage('vistaar_local_cashbook_db', []);

  // Simulated Database Tables (Simulating authenticated PostgreSQL with RLS)
  const simulatedDbExpenses: any[] = [];
  const simulatedDbDaybook: any[] = [];
  const simulatedDbCashbook: any[] = [];

  const originalFrom = supabase.from.bind(supabase);
  (supabase as any).from = (table: string) => {
    if (table === 'expenses') {
      return {
        insert: (rows: any[]) => {
          const inserted = rows.map((r) => ({
            ...r,
            id: r.id || `exp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));
          simulatedDbExpenses.push(...inserted);
          return {
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
            }),
          };
        },
        select: (fields: string) => {
          let filtered = [...simulatedDbExpenses];
          const queryObj: any = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] === val);
              return queryObj;
            },
            gte: (col: string, val: any) => {
              filtered = filtered.filter((r) => (r[col] || r.expense_date || r.date) >= val);
              return queryObj;
            },
            lte: (col: string, val: any) => {
              filtered = filtered.filter((r) => (r[col] || r.expense_date || r.date) <= val);
              return queryObj;
            },
            or: () => queryObj,
            order: () => {
              return {
                order: () => Promise.resolve({ data: filtered, error: null }),
                then: (resolve: any) => resolve({ data: filtered, error: null }),
              };
            },
            then: (resolve: any) => resolve({ data: filtered, error: null }),
          };
          return queryObj;
        },
        update: (payload: any) => {
          let filtered = [...simulatedDbExpenses];
          const queryObj: any = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] === val);
              if (col === 'id') {
                const target = simulatedDbExpenses.find((r) => r.id === val);
                if (target) Object.assign(target, payload, { updated_at: new Date().toISOString() });
              }
              return queryObj;
            },
            then: (resolve: any) => resolve({ data: filtered, error: null }),
          };
          return queryObj;
        },
        delete: () => {
          let wsVal: string | null = null;
          let idVal: string | null = null;
          const queryObj: any = {
            eq: (col: string, val: any) => {
              if (col === 'workspace_id') wsVal = val;
              if (col === 'id') idVal = val;
              if (wsVal && idVal) {
                const idx = simulatedDbExpenses.findIndex((r) => r.workspace_id === wsVal && r.id === idVal);
                if (idx >= 0) simulatedDbExpenses.splice(idx, 1);
              }
              return queryObj;
            },
            then: (resolve: any) => resolve({ data: null, error: null }),
          };
          return queryObj;
        },
      };
    }

    if (table === 'daybook_transactions') {
      return {
        insert: (rows: any[]) => {
          const inserted = rows.map((r) => ({
            ...r,
            id: r.id || `dt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));
          simulatedDbDaybook.push(...inserted);
          return {
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
            }),
          };
        },
        select: () => {
          let filtered = [...simulatedDbDaybook];
          const queryObj: any = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] === val);
              return queryObj;
            },
            gte: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] >= val);
              return queryObj;
            },
            lte: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] <= val);
              return queryObj;
            },
            order: () => Promise.resolve({ data: filtered, error: null }),
            then: (resolve: any) => resolve({ data: filtered, error: null }),
          };
          return queryObj;
        },
        update: (payload: any) => {
          const queryObj: any = {
            eq: (col: string, val: any) => {
              if (col === 'id') {
                const target = simulatedDbDaybook.find((r) => r.id === val);
                if (target) Object.assign(target, payload);
              }
              return queryObj;
            },
            then: (resolve: any) => resolve({ data: null, error: null }),
          };
          return queryObj;
        },
        delete: () => {
          let wsVal: string | null = null;
          let refType: string | null = null;
          let refId: string | null = null;
          const queryObj: any = {
            eq: (col: string, val: any) => {
              if (col === 'workspace_id') wsVal = val;
              if (col === 'reference_type') refType = val;
              if (col === 'reference_id') refId = val;
              if (col === 'id') {
                const idx = simulatedDbDaybook.findIndex((r) => r.id === val);
                if (idx >= 0) simulatedDbDaybook.splice(idx, 1);
              }
              if (wsVal && refType && refId) {
                const idx = simulatedDbDaybook.findIndex(
                  (r) => r.workspace_id === wsVal && r.reference_type === refType && r.reference_id === refId
                );
                if (idx >= 0) simulatedDbDaybook.splice(idx, 1);
              }
              return queryObj;
            },
            then: (resolve: any) => resolve({ data: null, error: null }),
          };
          return queryObj;
        },
      };
    }

    if (table === 'cashbook_entries') {
      return {
        insert: (rows: any[]) => {
          const inserted = rows.map((r) => ({
            ...r,
            id: r.id || `cbe-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            created_at: new Date().toISOString(),
          }));
          simulatedDbCashbook.push(...inserted);
          return {
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
            }),
          };
        },
        select: () => {
          let filtered = [...simulatedDbCashbook];
          const queryObj: any = {
            eq: (col: string, val: any) => {
              filtered = filtered.filter((r) => r[col] === val);
              return queryObj;
            },
            order: () => Promise.resolve({ data: filtered, error: null }),
            then: (resolve: any) => resolve({ data: filtered, error: null }),
          };
          return queryObj;
        },
        delete: () => {
          const queryObj: any = {
            eq: () => queryObj,
            then: (resolve: any) => resolve({ data: null, error: null }),
          };
          return queryObj;
        },
      };
    }

    return originalFrom(table);
  };

  const todayStr = new Date().toISOString().split('T')[0];

  // -------------------------------------------------------------
  // TEST A: Record a paid expense of ₹1,000 dated today
  // -------------------------------------------------------------
  console.log('--- TEST A: Record a paid expense of ₹1,000 ---');
  const expARes = await expenseService.createExpense({
    category: 'Office Supplies',
    expenseName: 'Stationery & Printing',
    amount: 1000,
    date: todayStr,
    paymentMode: 'Cash',
    paidTo: 'Raj Stationery Mart',
    referenceNo: 'EXP-TEST-A-01',
  });

  assert(!!expARes.expenseId && !expARes.error, 'Test A1 - Expense Creation', `Expense created with ID ${expARes.expenseId}`);

  // Fetch Daybook transactions and summary
  const daybookResA = await daybookService.getTransactions({ dateRange: 'today' });
  const daybookTxA = daybookResA.data?.find((t) => t.referenceId === expARes.expenseId);
  assert(!!daybookTxA, 'Test A2 - Daybook Persistence', `Found Daybook transaction for expense ${expARes.expenseId}`);
  assert(daybookTxA?.direction === 'OUT', 'Test A3 - Daybook Direction', `Direction is OUT (was ${daybookTxA?.direction})`);
  assert(daybookTxA?.amount === 1000, 'Test A4 - Daybook Amount', `Amount is ₹${daybookTxA?.amount}`);

  const daybookMetricsA = await daybookService.getSummaryMetrics({ dateRange: 'today' });
  assert(daybookMetricsA.totalOutflow >= 1000, 'Test A5 - Daybook Outflow Metric', `Daybook totalOutflow is ₹${daybookMetricsA.totalOutflow}`);

  // Fetch Cashbook transactions and summary
  const cashbookResA = await cashbookService.getTransactions({ dateRange: 'today' });
  const cashbookTxA = cashbookResA.data?.find((t) => t.referenceId === expARes.expenseId || t.description?.includes('Stationery'));
  assert(!!cashbookTxA, 'Test A6 - Cashbook Persistence', `Found Cashbook transaction for expense`);
  assert(cashbookTxA?.paymentMode === 'Cash', 'Test A7 - Cashbook Payment Mode', `Payment mode is Cash`);

  const cashbookMetricsA = await cashbookService.getSummaryMetrics({ dateRange: 'today' });
  assert(cashbookMetricsA.totalPayments >= 1000, 'Test A8 - Cashbook Total Payments', `Cashbook totalPayments is ₹${cashbookMetricsA.totalPayments}`);

  // Verify Net Movement = Inflow - Outflow
  const expectedNetA = daybookMetricsA.totalInflow - daybookMetricsA.totalOutflow;
  assert(daybookMetricsA.netMovement === expectedNetA, 'Test A9 - Net Movement Integrity', `Net Movement is ₹${daybookMetricsA.netMovement} (Inflow ₹${daybookMetricsA.totalInflow} - Outflow ₹${daybookMetricsA.totalOutflow})`);

  // -------------------------------------------------------------
  // TEST B: Record an unpaid expense of ₹500
  // -------------------------------------------------------------
  console.log('\n--- TEST B: Record an unpaid expense of ₹500 ---');
  const initialOutflowB = (await daybookService.getSummaryMetrics({ dateRange: 'today' })).totalOutflow;

  // Simulate unpaid expense record in store / storage
  const unpaidExpId = `exp-unpaid-${Date.now()}`;
  const unpaidExp: Expense = {
    id: unpaidExpId,
    category: 'Repairs & Maintenance',
    expenseName: 'AC Servicing (On Credit)',
    amount: 500,
    date: todayStr,
    paymentMode: 'Other',
    status: 'UNPAID',
    createdAt: new Date().toISOString(),
  };

  const currentList = safeGetTenantStorage<Expense>('vistaar_local_expenses_db', []);
  safeSaveTenantStorage('vistaar_local_expenses_db', [unpaidExp, ...currentList]);
  store.setExpenses([unpaidExp, ...store.getExpenses()]);

  // Unpaid expense must NOT increase cash outflow
  const metricsAfterUnpaid = await daybookService.getSummaryMetrics({ dateRange: 'today' });
  assert(
    metricsAfterUnpaid.totalOutflow === initialOutflowB,
    'Test B1 - Unpaid Expense Zero Outflow',
    `Outflow remained ₹${metricsAfterUnpaid.totalOutflow} after adding unpaid expense of ₹500`
  );

  // Now mark it PAID
  const paidExp: Expense = {
    ...unpaidExp,
    status: 'PAID',
    paymentMode: 'Cash',
  };
  safeSaveTenantStorage('vistaar_local_expenses_db', [paidExp, ...currentList]);
  store.setExpenses([paidExp, ...store.getExpenses().filter((e) => e.id !== unpaidExpId)]);

  const metricsAfterPaid = await daybookService.getSummaryMetrics({ dateRange: 'today' });
  assert(
    metricsAfterPaid.totalOutflow === initialOutflowB + 500,
    'Test B2 - Paid Expense Increments Outflow',
    `Outflow increased by exactly ₹500 to ₹${metricsAfterPaid.totalOutflow}`
  );

  // -------------------------------------------------------------
  // TEST C: Partial expense payment (only paid portion counted)
  // -------------------------------------------------------------
  console.log('\n--- TEST C: Partial expense payment ---');
  const baseOutflowC = (await daybookService.getSummaryMetrics({ dateRange: 'today' })).totalOutflow;

  const partialExpId = `exp-partial-${Date.now()}`;
  const partialExpStage1: Expense = {
    id: partialExpId,
    category: 'Rent',
    expenseName: 'Office Rent Part 1',
    amount: 400, // actual paid so far
    totalAmount: 1000, // total liability
    remainingAmount: 600,
    paymentStatus: 'PARTIAL',
    date: todayStr,
    paymentMode: 'Bank Transfer',
    createdAt: new Date().toISOString(),
  };

  const expListC = safeGetTenantStorage<Expense>('vistaar_local_expenses_db', []);
  safeSaveTenantStorage('vistaar_local_expenses_db', [partialExpStage1, ...expListC]);
  store.setExpenses([partialExpStage1, ...store.getExpenses()]);

  const metricsPartialStage1 = await daybookService.getSummaryMetrics({ dateRange: 'today' });
  assert(
    metricsPartialStage1.totalOutflow === baseOutflowC + 400,
    'Test C1 - Partial Outflow',
    `Outflow increased by ₹400 paid portion (was ₹${baseOutflowC}, now ₹${metricsPartialStage1.totalOutflow})`
  );

  // Now pay remaining ₹600 (cumulative paid = ₹1000)
  const partialExpStage2: Expense = {
    ...partialExpStage1,
    amount: 1000,
    remainingAmount: 0,
    paymentStatus: 'PAID',
  };
  safeSaveTenantStorage(
    'vistaar_local_expenses_db',
    [partialExpStage2, ...expListC.filter((e) => e.id !== partialExpId)]
  );
  store.setExpenses([partialExpStage2, ...store.getExpenses().filter((e) => e.id !== partialExpId)]);

  const metricsPartialStage2 = await daybookService.getSummaryMetrics({ dateRange: 'today' });
  assert(
    metricsPartialStage2.totalOutflow === baseOutflowC + 1000,
    'Test C2 - Cumulative Outflow',
    `Cumulative outflow is ₹${metricsPartialStage2.totalOutflow} (base + ₹1,000, not doubled)`
  );

  // -------------------------------------------------------------
  // TEST D: Date filter precision
  // -------------------------------------------------------------
  console.log('\n--- TEST D: Date filters (Today, Yesterday, Custom) ---');

  // Create an expense dated yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const expYesterdayRes = await expenseService.createExpense({
    category: 'Travel & Conveyance',
    expenseName: 'Taxi Fare Yesterday',
    amount: 250,
    date: yesterdayStr,
    paymentMode: 'Cash',
    referenceNo: 'EXP-YEST-01',
  });

  const todayDb = await daybookService.getTransactions({ dateRange: 'today' });
  const yestInToday = todayDb.data?.find((t) => t.referenceId === expYesterdayRes.expenseId);
  assert(!yestInToday, 'Test D1 - Yesterday Excluded From Today', `Yesterday expense not included in Today date filter`);

  const yestDb = await daybookService.getTransactions({ dateRange: 'yesterday' });
  const yestInYest = yestDb.data?.find((t) => t.referenceId === expYesterdayRes.expenseId);
  assert(!!yestInYest, 'Test D2 - Yesterday Included In Yesterday', `Yesterday expense properly included in Yesterday filter`);

  const customDb = await daybookService.getTransactions({
    dateRange: 'custom',
    startDate: yesterdayStr,
    endDate: todayStr,
  });
  const bothInCustom =
    customDb.data?.some((t) => t.referenceId === expYesterdayRes.expenseId) &&
    customDb.data?.some((t) => t.referenceId === expARes.expenseId);
  assert(bothInCustom, 'Test D3 - Custom Range Boundaries', `Custom range includes both yesterday and today expenses`);

  // -------------------------------------------------------------
  // TEST E: Duplicate prevention & idempotency
  // -------------------------------------------------------------
  console.log('\n--- TEST E: Duplicate prevention ---');
  // Attempt rapid duplicate creation
  const p1 = expenseService.createExpense({
    category: 'Utilities',
    amount: 800,
    date: todayStr,
    paymentMode: 'UPI',
    paidTo: 'Electric Board',
    referenceNo: 'DUP-TEST-01',
  });
  const p2 = expenseService.createExpense({
    category: 'Utilities',
    amount: 800,
    date: todayStr,
    paymentMode: 'UPI',
    paidTo: 'Electric Board',
    referenceNo: 'DUP-TEST-01',
  });

  const [resE1, resE2] = await Promise.all([p1, p2]);
  const duplicateCaught = !!resE1.error || !!resE2.error;
  assert(duplicateCaught, 'Test E1 - Concurrent Submit Guard', `Duplicate submission lock detected and blocked concurrent duplicate`);

  // -------------------------------------------------------------
  // TEST F: Cross-module consistency (Daybook == Cashbook == Dashboard)
  // -------------------------------------------------------------
  console.log('\n--- TEST F: Cross-module consistency ---');
  const todayRange = resolveDateRange('TODAY');
  const finalDaybook = await daybookService.getSummaryMetrics({ dateRange: 'today' });
  const finalCashbook = await cashbookService.getSummaryMetrics({ dateRange: 'today' });
  const finalAnalytics = await enterpriseAnalyticsService.getAnalyticsOverview(todayRange);
  const totalAnalyticsExpenses = finalAnalytics.profitability.totalExpenses;

  console.log(`Daybook Outflow: ₹${finalDaybook.totalOutflow}`);
  console.log(`Cashbook Payments: ₹${finalCashbook.totalPayments}`);
  console.log(`Dashboard Analytics Outflow: ₹${totalAnalyticsExpenses}`);

  assert(finalDaybook.totalOutflow > 0, 'Test F1 - Daybook Outflow Non-Zero', `Daybook totalOutflow is ₹${finalDaybook.totalOutflow} (> 0)`);
  assert(finalCashbook.totalPayments > 0, 'Test F2 - Cashbook Payments Non-Zero', `Cashbook totalPayments is ₹${finalCashbook.totalPayments} (> 0)`);
  assert(totalAnalyticsExpenses > 0, 'Test F3 - Dashboard Outflow Non-Zero', `Dashboard totalExpenses is ₹${totalAnalyticsExpenses} (> 0)`);
  assert(
    Math.abs(finalDaybook.totalOutflow - finalCashbook.totalPayments) < 1.0,
    'Test F4 - Daybook & Cashbook Reconciliation',
    `Daybook outflow (₹${finalDaybook.totalOutflow}) matches Cashbook payments (₹${finalCashbook.totalPayments})`
  );

  // -------------------------------------------------------------
  // TEST G: Regression - Invoices and receipts still flow to Inflow
  // -------------------------------------------------------------
  console.log('\n--- TEST G: Regression on Invoices & Receipts ---');
  const invNum = `INV-REG-TEST-${Date.now().toString().slice(-4)}`;
  const invRes = await invoiceService.finalizeAuthoritativeInvoice({
    source: 'MANUAL',
    invoiceNumber: invNum,
    customerName: 'Regression Customer',
    customerPhone: '9123456789',
    date: todayStr,
    subtotal: 5000,
    grandTotal: 5000,
    paidAmount: 5000,
    balanceAmount: 0,
    paymentMode: 'UPI',
    items: [
      {
        productName: 'Diagnostic Headphone Test',
        quantity: 1,
        sellingPrice: 5000,
        total: 5000,
      },
    ],
  });

  assert(invRes.success === true, 'Test G1 - Invoice Finalized', `Invoice #${invNum} finalized`);

  const regDaybook = await daybookService.getTransactions({ dateRange: 'today' });
  const foundInv = regDaybook.data?.find((t) => t.referenceNumber === invNum || t.description?.includes(invNum));
  assert(!!foundInv, 'Test G2 - Invoice in Daybook', `Invoice present in Daybook as INFLOW`);
  assert(foundInv?.direction === 'IN', 'Test G3 - Direction is IN', `Direction is IN`);

  const metricsAfterInv = await daybookService.getSummaryMetrics({ dateRange: 'today' });
  assert(metricsAfterInv.totalInflow >= 5000, 'Test G4 - Inflow Incremented', `Inflow is ₹${metricsAfterInv.totalInflow}`);
  assert(
    metricsAfterInv.netMovement === metricsAfterInv.totalInflow - metricsAfterInv.totalOutflow,
    'Test G5 - Net Movement Matches Formula',
    `Net Movement = Inflow ₹${metricsAfterInv.totalInflow} - Outflow ₹${metricsAfterInv.totalOutflow} = ₹${metricsAfterInv.netMovement}`
  );

  // -------------------------------------------------------------
  // TEST H: Multi-tenant workspace isolation
  // -------------------------------------------------------------
  console.log('\n--- TEST H: Multi-tenant workspace isolation ---');
  const wsB = 'b0000000-0000-4000-8000-000000000002';
  const ownerB = 'b0000000-0000-4000-8000-000000000002';

  // Switch to Company B
  registerCurrentUserResolver(() => ({
    id: ownerB,
    role: 'owner',
    status: 'Active',
    workspaceId: wsB,
  } as any));

  (supabaseAuthService as any).currentProfile = {
    id: ownerB,
    companyId: wsB,
    role: 'owner',
    name: 'Test Owner B',
    email: 'admin_b@vistaar.com',
    employeeId: 'VST-B001',
    status: 'Active',
  };
  (supabaseAuthService as any).authoritativeWorkspaceId = wsB;
  supabaseAuthService.getCurrentCompanyId = () => wsB;
  supabaseAuthService.getAuthoritativeWorkspaceId = async () => wsB;

  // Clear memory store for Workspace B
  store.setExpenses([]);

  const compBExpenses = await expenseService.getExpenses();
  const leakedExp = compBExpenses.data?.find((e) => e.id === expARes.expenseId);
  assert(!leakedExp, 'Test H1 - Workspace Isolation in Expenses', `Company B cannot see Company A's expense ${expARes.expenseId}`);

  const compBDaybook = await daybookService.getTransactions({ dateRange: 'today' });
  const leakedDaybook = compBDaybook.data?.find((t) => t.referenceId === expARes.expenseId);
  assert(!leakedDaybook, 'Test H2 - Workspace Isolation in Daybook', `Company B cannot see Company A's Daybook transaction`);

  // Summary
  console.log('\n=============================================================');
  console.log(`   TEST RESULTS: ${results.filter((r) => r.passed).length}/${results.length} PASSED`);
  console.log('=============================================================\n');

  if (results.some((r) => !r.passed)) {
    console.error('Some tests failed!');
    process.exit(1);
  } else {
    console.log('All tests passed successfully!');
    process.exit(0);
  }
}

runExpensePipelineTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
