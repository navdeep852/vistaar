import {
  getLocalTodayDateString,
  getLocalYesterdayDateString,
  getQuotationCreationDate,
  resolveQuotationDateFilter,
  matchesQuotationDateFilter,
  QuotationDatePreset,
} from '../src/lib/quotationDateFilter';

interface MockQuotation {
  id: string;
  quotationNumber: string;
  customerName: string;
  status: string;
  date: string;
  validUntil: string;
  createdAt?: string;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ ${testName}${detail ? `: ${detail}` : ''}`);
  }
}

console.log('================================================================');
console.log('VISTAAR QUOTATION DATE FILTER TEST SUITE');
console.log('================================================================');

// Baseline Dates in local timezone
const localToday = getLocalTodayDateString();
const localYesterday = getLocalYesterdayDateString();

// Fixed reference date: 2026-10-30 14:00:00 local time
const refDate = new Date(2026, 9, 30, 14, 0, 0); // Oct 30, 2026
const refTodayStr = '2026-10-30';
const refYesterdayStr = '2026-10-29';

console.log(`Local Today: ${localToday}`);
console.log(`Local Yesterday: ${localYesterday}`);
console.log(`Reference Date: ${refTodayStr} (Yesterday: ${refYesterdayStr})\n`);

// Mock Quotation Records
const mockQuotations: MockQuotation[] = [
  {
    id: 'qt-1',
    quotationNumber: 'QT-2026-001',
    customerName: 'Rahul Sharma',
    status: 'Accepted',
    date: '2026-10-30', // Ref Today
    validUntil: '2026-11-15',
    createdAt: '2026-10-30T10:15:00.000Z',
  },
  {
    id: 'qt-2',
    quotationNumber: 'QT-2026-002',
    customerName: 'Rahul Sharma',
    status: 'Draft',
    date: '2026-10-30', // Ref Today
    validUntil: '2026-11-20',
    createdAt: '2026-10-30T11:00:00.000Z',
  },
  {
    id: 'qt-3',
    quotationNumber: 'QT-2026-003',
    customerName: 'Priya Patel',
    status: 'Sent',
    date: '2026-10-29', // Ref Yesterday
    validUntil: '2026-10-30', // NOTE: validUntil is today, but date is yesterday!
    createdAt: '2026-10-29T16:45:00.000Z',
  },
  {
    id: 'qt-4',
    quotationNumber: 'QT-2026-004',
    customerName: 'Anil Kapoor',
    status: 'Accepted',
    date: '2026-10-25', // Specific earlier date
    validUntil: '2026-10-30', // NOTE: validUntil is today!
    createdAt: '2026-10-25T09:30:00.000Z',
  },
  {
    id: 'qt-5',
    quotationNumber: 'QT-2026-005',
    customerName: 'Vikram Singh',
    status: 'Converted',
    date: '25-10-2026', // DD-MM-YYYY format
    validUntil: '2026-11-05',
    createdAt: '2026-10-25T14:20:00.000Z',
  },
  {
    id: 'qt-6',
    quotationNumber: 'QT-2026-006',
    customerName: 'Midnight Creator',
    status: 'Sent',
    date: '2026-10-30 23:59:45', // Near midnight
    validUntil: '2026-11-30',
    createdAt: '2026-10-30T23:59:45.000Z',
  },
];

// Helper to simulate QuotationsView combined filter
function filterQuotations(
  list: MockQuotation[],
  search: string,
  status: string,
  datePreset: QuotationDatePreset,
  selectedDate: string,
  referenceDate: Date = refDate
): MockQuotation[] {
  return list.filter((q) => {
    const qNum = (q.quotationNumber || '').toLowerCase();
    const cName = (q.customerName || '').toLowerCase();
    const s = search.toLowerCase().trim();
    const matchesSearch = !s || qNum.includes(s) || cName.includes(s);
    const matchesStatus = status === 'ALL' || q.status === status;
    const matchesDate = matchesQuotationDateFilter(q, datePreset, selectedDate, referenceDate);
    return matchesSearch && matchesStatus && matchesDate;
  });
}

// -------------------------------------------------------------
// SCENARIO 1: ALL DATES
// -------------------------------------------------------------
console.log('--- Test 1: All Dates Preset ---');
const allDatesResult = filterQuotations(mockQuotations, '', 'ALL', 'ALL', '', refDate);
assert(allDatesResult.length === mockQuotations.length, 'All Dates returns all records without omission');
const allResolved = resolveQuotationDateFilter('ALL', '', refDate);
assert(allResolved.targetDate === '' && allResolved.badgeText === 'All Dates', 'All Dates resolution has empty targetDate');

// -------------------------------------------------------------
// SCENARIO 2: TODAY FILTER
// -------------------------------------------------------------
console.log('\n--- Test 2: Today Filter ---');
const todayResult = filterQuotations(mockQuotations, '', 'ALL', 'today', '', refDate);
assert(todayResult.length === 3, 'Today filter returns exact matches (QT-001, QT-002, QT-006)');
assert(todayResult.every((q) => ['QT-2026-001', 'QT-2026-002', 'QT-2026-006'].includes(q.quotationNumber)), 'Today filter only returns items created on 2026-10-30');
const todayResolved = resolveQuotationDateFilter('today', '', refDate);
assert(todayResolved.targetDate === refTodayStr, `Today targetDate resolved to ${refTodayStr}`);

// -------------------------------------------------------------
// SCENARIO 3: YESTERDAY FILTER
// -------------------------------------------------------------
console.log('\n--- Test 3: Yesterday Filter ---');
const yesterdayResult = filterQuotations(mockQuotations, '', 'ALL', 'yesterday', '', refDate);
assert(yesterdayResult.length === 1 && yesterdayResult[0].quotationNumber === 'QT-2026-003', 'Yesterday filter returns only QT-2026-003 (created 2026-10-29)');
const yesterdayResolved = resolveQuotationDateFilter('yesterday', '', refDate);
assert(yesterdayResolved.targetDate === refYesterdayStr, `Yesterday targetDate resolved to ${refYesterdayStr}`);

// -------------------------------------------------------------
// SCENARIO 4: SELECT DATE FILTER
// -------------------------------------------------------------
console.log('\n--- Test 4: Select Date Filter ---');
const customResult = filterQuotations(mockQuotations, '', 'ALL', 'custom', '2026-10-25', refDate);
assert(customResult.length === 2, 'Select Date (2026-10-25) returns both standard YYYY-MM-DD and DD-MM-YYYY formats');
assert(customResult.some((q) => q.quotationNumber === 'QT-2026-004'), 'Includes QT-2026-004');
assert(customResult.some((q) => q.quotationNumber === 'QT-2026-005'), 'Includes QT-2026-005 (parsed from 25-10-2026)');

// -------------------------------------------------------------
// SCENARIO 5: VALID UNTIL IS NEVER USED FOR FILTERING
// -------------------------------------------------------------
console.log('\n--- Test 5: Valid Until Exclusion ---');
// QT-3 and QT-4 have validUntil = 2026-10-30 (which is refToday), but their creation date is 10-29 and 10-25.
// They must NOT appear in 'today' filter!
const todayHasNoInvalidValidUntil = todayResult.every((q) => q.quotationNumber !== 'QT-2026-003' && q.quotationNumber !== 'QT-2026-004');
assert(todayHasNoInvalidValidUntil, 'Quotation validUntil date is never used to match date filters');

// Test with object having ONLY validUntil
const validUntilOnly = {
  quotationNumber: 'INVALID-TEST',
  customerName: 'Test',
  date: '',
  validUntil: refTodayStr,
};
assert(getQuotationCreationDate(validUntilOnly as any) === '', 'Quotation with only validUntil produces empty creation date');

// -------------------------------------------------------------
// SCENARIO 6: COMBINED INDEPENDENT FILTERS
// -------------------------------------------------------------
console.log('\n--- Test 6: Combined Filters (Search + Status + Date) ---');
// Search: "Rahul", Status: "Accepted", Date: "today" -> QT-2026-001 only (QT-002 is Draft)
const combined1 = filterQuotations(mockQuotations, 'Rahul', 'Accepted', 'today', '', refDate);
assert(combined1.length === 1 && combined1[0].quotationNumber === 'QT-2026-001', 'Search "Rahul" + Status "Accepted" + Date "today" returns exactly QT-2026-001');

// Search: "Rahul", Status: "Draft", Date: "today" -> QT-2026-002 only
const combined2 = filterQuotations(mockQuotations, 'Rahul', 'Draft', 'today', '', refDate);
assert(combined2.length === 1 && combined2[0].quotationNumber === 'QT-2026-002', 'Search "Rahul" + Status "Draft" + Date "today" returns exactly QT-2026-002');

// Changing status without changing date
const statusChangeOnly = filterQuotations(mockQuotations, '', 'Draft', 'today', '', refDate);
assert(statusChangeOnly.length === 1 && statusChangeOnly[0].quotationNumber === 'QT-2026-002', 'Status filter changes independently without mutating date filter');

// Changing search without changing date
const searchChangeOnly = filterQuotations(mockQuotations, 'Priya', 'ALL', 'yesterday', '', refDate);
assert(searchChangeOnly.length === 1 && searchChangeOnly[0].quotationNumber === 'QT-2026-003', 'Search changes independently without mutating date filter');

// -------------------------------------------------------------
// SCENARIO 7: EMPTY STATE / NO MATCH COMBINATIONS
// -------------------------------------------------------------
console.log('\n--- Test 7: Empty State Non-Matches ---');
const noMatches = filterQuotations(mockQuotations, 'NonExistentCustomer', 'ALL', 'today', '', refDate);
assert(noMatches.length === 0, 'Returns empty array when filters do not match any quotations');

const noDateMatch = filterQuotations(mockQuotations, '', 'ALL', 'custom', '2020-01-01', refDate);
assert(noDateMatch.length === 0, 'Returns empty array when custom date has no quotations');

// -------------------------------------------------------------
// SCENARIO 8: MIDNIGHT AND TIMESTAMP RESILIENCE
// -------------------------------------------------------------
console.log('\n--- Test 8: Midnight and Date Parsing Resilience ---');
const midnightQt = {
  date: '2026-10-30 23:59:59',
  createdAt: '2026-10-30T23:59:59.000Z',
};
assert(getQuotationCreationDate(midnightQt) === '2026-10-30', 'Quotation created at 23:59:59 local resolves to 2026-10-30');

const slashFormatQt = {
  date: '2026/10/30',
};
assert(getQuotationCreationDate(slashFormatQt) === '2026-10-30', 'YYYY/MM/DD slash format resolves to YYYY-MM-DD');

const indianSlashFormatQt = {
  date: '30/10/2026',
};
assert(getQuotationCreationDate(indianSlashFormatQt) === '2026-10-30', 'DD/MM/YYYY Indian slash format resolves to YYYY-MM-DD');

// Fallback to createdAt
const fallbackCreatedAtQt = {
  date: '',
  createdAt: '2026-10-30T08:00:00.000Z',
};
assert(getQuotationCreationDate(fallbackCreatedAtQt).length === 10, 'Fallback to createdAt generates valid 10-char YYYY-MM-DD string');

// -------------------------------------------------------------
// SCENARIO 9: IMMUTABILITY OF SOURCE RECORDS
// -------------------------------------------------------------
console.log('\n--- Test 9: Immutability Check ---');
const copyBefore = JSON.stringify(mockQuotations);
filterQuotations(mockQuotations, 'Rahul', 'Accepted', 'today', '', refDate);
filterQuotations(mockQuotations, 'Priya', 'Draft', 'yesterday', '', refDate);
const copyAfter = JSON.stringify(mockQuotations);
assert(copyBefore === copyAfter, 'Original quotation records are never mutated during filter evaluations');

console.log('\n================================================================');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL QUOTATION DATE FILTER TESTS PASSED SUCCESSFULLY! ✓\n');
}

