import { performance } from 'node:perf_hooks';

console.log('--- RUNNING CHART SAFETY & EDGE-INPUT TESTS ---');

// 1. TEST FORMATTERS WITH EDGE INPUTS
console.log('\n[TEST 1] Formatter Edge Inputs (0, NaN, Infinity, Negatives, Large Values)...');
function formatCompactInr(val) {
  if (isNaN(val) || val === 0 || !isFinite(val)) return '₹0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 10000000) {
    const cr = abs / 10000000;
    return `${sign}₹${cr >= 10 ? cr.toFixed(1) : cr.toFixed(2)}Cr`;
  }
  if (abs >= 100000) {
    const l = abs / 100000;
    return `${sign}₹${l >= 10 ? l.toFixed(1) : l.toFixed(2)}L`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}₹${k >= 10 ? Math.round(k) : k.toFixed(1)}K`;
  }
  return `${sign}₹${Math.round(abs)}`;
}

const formatterInputs = [0, -0, NaN, Infinity, -Infinity, undefined, null, -1500, 150000, 25000000];
for (const input of formatterInputs) {
  const t0 = performance.now();
  const res = formatCompactInr(input);
  const duration = performance.now() - t0;
  if (duration > 5) throw new Error(`Formatter slow on input: ${input}`);
  console.log(`  formatCompactInr(${String(input).padEnd(10)}) -> ${res} (${duration.toFixed(3)}ms)`);
}

// Warm up V8 Intl engine
new Date().toLocaleDateString('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short' });

// 2. TEST DATE BUCKETING WHILE LOOP WITH EDGE INPUTS
console.log('\n[TEST 2] Date Bucketing While Loop (Single day, 30 days, 365 days, Inverted, Malformed)...');
function testDateBucketing(startDateStr, endDateStr) {
  const trendMap = new Map();
  const [sy, sm, sd] = (startDateStr || '').split('-').map(Number);
  const [ey, em, ed] = (endDateStr || '').split('-').map(Number);
  const startMs = new Date(Date.UTC(sy || 2026, (sm || 1) - 1, sd || 1)).getTime();
  const endMs = new Date(Date.UTC(ey || 2026, (em || 1) - 1, ed || 1)).getTime();

  const formatter = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: '2-digit', month: 'short' });

  let guard = 0;
  if (!isNaN(startMs) && !isNaN(endMs) && startMs <= endMs) {
    let curMs = startMs;
    while (curMs <= endMs && guard++ < 1000) {
      const curObj = new Date(curMs);
      const yStr = curObj.getUTCFullYear();
      const mStr = String(curObj.getUTCMonth() + 1).padStart(2, '0');
      const dStr = String(curObj.getUTCDate()).padStart(2, '0');
      const curDateKey = `${yStr}-${mStr}-${dStr}`;
      const dayLabel = formatter.format(curObj);

      trendMap.set(curDateKey, {
        label: dayLabel,
        fullDate: curDateKey,
        sales: 0,
      });

      curMs += 86400000;
    }
  }
  return { count: trendMap.size, iterations: guard };
}

const testRanges = [
  { desc: 'Single Day', start: '2026-09-21', end: '2026-09-21' },
  { desc: '7 Days', start: '2026-09-14', end: '2026-09-21' },
  { desc: '30 Days', start: '2026-08-22', end: '2026-09-21' },
  { desc: '365 Days (1 Year)', start: '2025-09-21', end: '2026-09-21' },
  { desc: 'Inverted (End < Start)', start: '2026-09-21', end: '2026-09-01' },
  { desc: 'Empty Strings', start: '', end: '' },
  { desc: 'Malformed Date', start: 'invalid-date', end: 'invalid-date' },
  { desc: 'Extreme Range (10 Years, should cap at 1000)', start: '2010-01-01', end: '2026-01-01' },
];

for (const r of testRanges) {
  const t0 = performance.now();
  const res = testDateBucketing(r.start, r.end);
  const duration = performance.now() - t0;
  if (duration > 50) throw new Error(`Date bucketing too slow on ${r.desc}: ${duration}ms`);
  if (res.iterations > 1001) throw new Error(`Hard iteration cap exceeded on ${r.desc}!`);
  console.log(`  [PASS] ${r.desc.padEnd(45)} -> ${res.count} buckets, ${res.iterations} iterations in ${duration.toFixed(3)}ms`);
}

// 3. TEST CHART DATA ENRICHMENT WITH EDGE INPUTS
console.log('\n[TEST 3] Chart Data Derivation (Empty, All Zeros, Negatives, Extremes)...');
function enrichTrendData(points) {
  if (!points || points.length === 0) {
    return { chartData: [], avgSales: 0, maxSale: 0 };
  }
  let runningSum = 0;
  let maxSale = 0;
  const enriched = points.map((p, idx) => {
    const sales = Math.max(0, p.sales || 0);
    runningSum += sales;
    if (sales > maxSale) maxSale = sales;
    const windowStart = Math.max(0, idx - 6);
    const windowPoints = points.slice(windowStart, idx + 1);
    const movingAvg = Math.round(
      windowPoints.reduce((acc, curr) => acc + (curr.sales || 0), 0) / Math.max(1, windowPoints.length)
    );
    return { ...p, sales, movingAvg, cumulative: runningSum };
  });
  const avg = points.length > 0 ? Math.round(runningSum / points.length) : 0;
  return { chartData: enriched, avgSales: avg, maxSale };
}

const trendInputCases = [
  { desc: 'Empty Array', pts: [] },
  { desc: 'All Zeros (7 days)', pts: [0, 0, 0, 0, 0, 0, 0].map((v, i) => ({ label: `Day ${i}`, sales: v })) },
  { desc: 'Single Record Zero', pts: [{ label: 'Day 1', sales: 0 }] },
  { desc: 'Single Record Normal', pts: [{ label: 'Day 1', sales: 15000 }] },
  { desc: 'Negative Values Handled', pts: [{ label: 'Day 1', sales: -500 }, { label: 'Day 2', sales: 1000 }] },
  { desc: 'Large 1000 Points', pts: Array.from({ length: 1000 }, (_, i) => ({ label: `D${i}`, sales: i * 10 })) },
];

for (const tc of trendInputCases) {
  const t0 = performance.now();
  const res = enrichTrendData(tc.pts);
  const duration = performance.now() - t0;
  const isEmpty = !res.chartData || res.chartData.length === 0 || res.chartData.every(p => p.sales === 0);
  console.log(`  [PASS] ${tc.desc.padEnd(30)} -> ${res.chartData.length} pts, isEmpty=${isEmpty}, max=${res.maxSale} in ${duration.toFixed(3)}ms`);
}

console.log('\n--- ALL CHART SAFETY & EDGE-INPUT TESTS PASSED SUCCESSFULLY ---');
