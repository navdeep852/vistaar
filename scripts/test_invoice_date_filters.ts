import {
  resolveInvoiceDateFilter,
  formatCompactRange,
  InvoiceDateFilterPreset,
} from '../src/lib/invoiceDateFilter';
import { getIstTodayString, addDays } from '../src/lib/dateRange';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { store } from '../src/services/store';
import { Invoice } from '../src/types';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details: string) {
  if (condition) {
    console.log(`✅ [PASS] ${name} — ${details}`);
    results.push({ name, passed: true, details });
  } else {
    console.error(`❌ [FAIL] ${name} — ${details}`);
    results.push({ name, passed: false, details });
  }
}

async function runInvoiceDateFilterTests() {
  console.log('=============================================================');
  console.log('   VISTAAR INVOICE RECORDS DATE FILTER VERIFICATION SUITE   ');
  console.log('=============================================================\n');

  const todayIst = getIstTodayString();
  const yesterdayIst = addDays(todayIst, -1);
  console.log(`Current IST Date: ${todayIst}`);
  console.log(`Yesterday IST Date: ${yesterdayIst}\n`);

  // -------------------------------------------------------------------------
  // TEST 1: Preset "ALL" (All Dates)
  // -------------------------------------------------------------------------
  const allRes = resolveInvoiceDateFilter('ALL');
  assert(
    allRes.preset === 'ALL' && allRes.startDate === '' && allRes.endDate === '' && allRes.displayLabel === 'All Dates' && allRes.isValid,
    'Preset: All Dates',
    `Resolved: startDate="${allRes.startDate}", endDate="${allRes.endDate}", label="${allRes.displayLabel}"`
  );

  // -------------------------------------------------------------------------
  // TEST 2: Preset "today"
  // -------------------------------------------------------------------------
  const todayRes = resolveInvoiceDateFilter('today');
  assert(
    todayRes.preset === 'today' && todayRes.startDate === todayIst && todayRes.endDate === todayIst && todayRes.isValid,
    'Preset: Today',
    `Resolved: ${todayRes.startDate} to ${todayRes.endDate} (${todayRes.displayLabel})`
  );

  // -------------------------------------------------------------------------
  // TEST 3: Preset "yesterday"
  // -------------------------------------------------------------------------
  const yestRes = resolveInvoiceDateFilter('yesterday');
  assert(
    yestRes.preset === 'yesterday' && yestRes.startDate === yesterdayIst && yestRes.endDate === yesterdayIst && yestRes.isValid,
    'Preset: Yesterday',
    `Resolved: ${yestRes.startDate} to ${yestRes.endDate} (${yestRes.displayLabel})`
  );

  // -------------------------------------------------------------------------
  // TEST 4: Preset "this_week" (Monday to Sunday)
  // -------------------------------------------------------------------------
  const weekRes = resolveInvoiceDateFilter('this_week');
  const [wY, wM, wD] = weekRes.startDate.split('-').map(Number);
  const startDayOfWeek = new Date(wY, wM - 1, wD).getDay();
  // Monday is 1 in JavaScript getDay()
  assert(
    weekRes.preset === 'this_week' && startDayOfWeek === 1 && weekRes.startDate <= todayIst && weekRes.endDate >= todayIst && weekRes.isValid,
    'Preset: This Week',
    `Starts on Monday (${weekRes.startDate}) and ends on Sunday (${weekRes.endDate}) containing today (${todayIst})`
  );

  // -------------------------------------------------------------------------
  // TEST 5: Preset "this_month" (1st to last day of month)
  // -------------------------------------------------------------------------
  const monthRes = resolveInvoiceDateFilter('this_month');
  const expectedMonthStart = `${todayIst.substring(0, 7)}-01`;
  assert(
    monthRes.preset === 'this_month' && monthRes.startDate === expectedMonthStart && monthRes.startDate <= todayIst && monthRes.endDate >= todayIst && monthRes.isValid,
    'Preset: This Month',
    `Resolved: ${monthRes.startDate} to ${monthRes.endDate} (${monthRes.displayLabel})`
  );

  // -------------------------------------------------------------------------
  // TEST 6: Preset "last_month" & Year Boundary
  // -------------------------------------------------------------------------
  const lastMonthRes = resolveInvoiceDateFilter('last_month');
  const [curY, curM] = todayIst.split('-').map(Number);
  const expectedPrevYear = curM === 1 ? curY - 1 : curY;
  const expectedPrevMonth = curM === 1 ? 12 : curM - 1;
  const expectedPrevMonthStr = `${expectedPrevYear}-${String(expectedPrevMonth).padStart(2, '0')}-01`;
  assert(
    lastMonthRes.preset === 'last_month' && lastMonthRes.startDate === expectedPrevMonthStr && lastMonthRes.isValid,
    'Preset: Last Month',
    `Resolved: ${lastMonthRes.startDate} to ${lastMonthRes.endDate} (${lastMonthRes.displayLabel})`
  );

  // -------------------------------------------------------------------------
  // TEST 7: Custom Date Range (Inclusive boundaries)
  // -------------------------------------------------------------------------
  const customStart = '2026-09-10';
  const customEnd = '2026-10-17';
  const customRes = resolveInvoiceDateFilter('custom', customStart, customEnd);
  assert(
    customRes.preset === 'custom' && customRes.startDate === customStart && customRes.endDate === customEnd && customRes.isValid && customRes.displayLabel.includes('10 Sep–17 Oct 2026'),
    'Custom Date Range (Valid)',
    `Resolved: ${customRes.startDate} to ${customRes.endDate} (${customRes.displayLabel})`
  );

  // -------------------------------------------------------------------------
  // TEST 8: Custom Date Range Validation (start > end rejected)
  // -------------------------------------------------------------------------
  const invalidCustomRes = resolveInvoiceDateFilter('custom', '2026-10-20', '2026-10-10');
  assert(
    !invalidCustomRes.isValid && !!invalidCustomRes.errorMessage && invalidCustomRes.errorMessage.includes('cannot be later than end date'),
    'Custom Date Range (Invalid start > end rejection)',
    `Correctly rejected with error: "${invalidCustomRes.errorMessage}"`
  );

  // -------------------------------------------------------------------------
  // TEST 9: In-Memory / Local Invoice Filtering Simulation (Inclusive boundaries)
  // -------------------------------------------------------------------------
  const mockInvoices: Invoice[] = [
    {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      customerName: 'Soldier Enterprises',
      date: todayIst,
      dueDate: todayIst,
      items: [],
      subtotal: 87000,
      taxTotal: 0,
      grandTotal: 87000,
      paidAmount: 87000,
      balanceAmount: 0,
      status: 'Paid',
      createdAt: `${todayIst}T10:00:00.000Z`,
      branchId: 'branch-1',
    } as any,
    {
      id: 'inv-2',
      invoiceNumber: 'INV-2026-0002',
      customerName: 'Navdeep Technologies',
      date: yesterdayIst,
      dueDate: todayIst,
      items: [],
      subtotal: 45000,
      taxTotal: 0,
      grandTotal: 45000,
      paidAmount: 20000,
      balanceAmount: 25000,
      status: 'Partially Paid',
      createdAt: `${yesterdayIst}T14:30:00.000Z`,
      branchId: 'branch-1',
    } as any,
    {
      id: 'inv-3',
      invoiceNumber: 'INV-2026-0003',
      customerName: 'Old Customer Inc',
      date: '2026-08-15',
      dueDate: '2026-08-30',
      items: [],
      subtotal: 15000,
      taxTotal: 0,
      grandTotal: 15000,
      paidAmount: 0,
      balanceAmount: 15000,
      status: 'Issued',
      createdAt: '2026-08-15T09:00:00.000Z',
      branchId: 'branch-2',
    } as any,
  ];

  // Store mock invoices
  store.syncRemoteInvoices(mockInvoices);

  // Multi-Filter Scenario 1: Search = "Soldier", Status = "ALL", Date = "today"
  const filterMulti1 = (invs: Invoice[], q: string, st: string, range: any) => {
    return invs.filter((inv) => {
      const matchQ = !q || inv.invoiceNumber.toLowerCase().includes(q) || inv.customerName.toLowerCase().includes(q);
      const matchSt = st === 'ALL' || inv.status === st;
      let matchD = true;
      if (range.preset !== 'ALL' && range.isValid && range.startDate && range.endDate) {
        const d = (inv.date || '').split('T')[0];
        matchD = d >= range.startDate && d <= range.endDate;
      }
      return matchQ && matchSt && matchD;
    });
  };

  const resMulti1 = filterMulti1(mockInvoices, 'soldier', 'ALL', todayRes);
  assert(
    resMulti1.length === 1 && resMulti1[0].invoiceNumber === 'INV-2026-0001',
    'Multi-Filter: Search (Soldier) + Status (ALL) + Date (Today)',
    `Returned ${resMulti1.length} invoice: ${resMulti1[0]?.invoiceNumber}`
  );

  // Multi-Filter Scenario 2: Search = "Navdeep", Status = "Partially Paid", Date = "yesterday"
  const resMulti2 = filterMulti1(mockInvoices, 'navdeep', 'Partially Paid', yestRes);
  assert(
    resMulti2.length === 1 && resMulti2[0].invoiceNumber === 'INV-2026-0002',
    'Multi-Filter: Search (Navdeep) + Status (Partially Paid) + Date (Yesterday)',
    `Returned ${resMulti2.length} invoice: ${resMulti2[0]?.invoiceNumber}`
  );

  // Multi-Filter Scenario 3: Date = "yesterday", but searching for "Soldier" (should return empty)
  const resMulti3 = filterMulti1(mockInvoices, 'soldier', 'ALL', yestRes);
  assert(
    resMulti3.length === 0,
    'Multi-Filter: Search (Soldier) + Date (Yesterday) correctly yields 0 matches',
    `Returned ${resMulti3.length} invoices`
  );

  // Multi-Filter Scenario 4: All Dates preserves all invoices
  const resAll = filterMulti1(mockInvoices, '', 'ALL', allRes);
  assert(
    resAll.length === 3,
    'Multi-Filter: "All Dates" preserves all historical invoices',
    `Returned ${resAll.length} invoices`
  );

  // Multi-Filter Scenario 5: Custom Date Range inclusive boundary check
  const customBothBounds = resolveInvoiceDateFilter('custom', yesterdayIst, todayIst);
  const resBounds = filterMulti1(mockInvoices, '', 'ALL', customBothBounds);
  assert(
    resBounds.length === 2 && resBounds.some(i => i.date === yesterdayIst) && resBounds.some(i => i.date === todayIst),
    'Custom Date Range: Includes invoices on both boundary dates (yesterday and today)',
    `Included ${resBounds.map(i => `${i.invoiceNumber}(${i.date})`).join(', ')}`
  );

  // -------------------------------------------------------------------------
  // TEST 10: invoiceService query options with startDate and endDate
  // -------------------------------------------------------------------------
  console.log('\nTesting invoiceService.getInvoices query options...');
  try {
    const serviceRes = await invoiceService.getInvoices({
      startDate: yesterdayIst,
      endDate: todayIst,
      status: 'Paid',
    });
    assert(
      Array.isArray(serviceRes.data) && serviceRes.data.every(i => {
        const d = (i.date || i.created_at || '').split('T')[0];
        return d >= yesterdayIst && d <= todayIst && i.status === 'Paid';
      }),
      'invoiceService.getInvoices with Date and Status Filters',
      `Returned ${serviceRes.data.length} records matching date range [${yesterdayIst}, ${todayIst}] and status Paid`
    );
  } catch (e: any) {
    console.error('Service query test error:', e);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log('\n=============================================================');
  console.log(`TEST RUN COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED out of ${results.length}`);
  console.log('=============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runInvoiceDateFilterTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
