/**
 * Automated Test Suite for Stale Deployment / Chunk Recovery Mechanism
 */
import {
  isChunkLoadError,
  handleChunkLoadFailure,
  clearChunkReloadRecord,
} from '../src/lib/lazyWithRetry';

// In-memory sessionStorage polyfill for test environment
const sessionMap: Record<string, string> = {};
let reloadCalls = 0;

(global as any).sessionStorage = {
  getItem: (k: string) => sessionMap[k] || null,
  setItem: (k: string, v: string) => { sessionMap[k] = v; },
  removeItem: (k: string) => { delete sessionMap[k]; },
  clear: () => { Object.keys(sessionMap).forEach((k) => delete sessionMap[k]); },
};

(global as any).window = {
  location: {
    reload: () => { reloadCalls++; },
  },
};

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string) {
  if (cond) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}`);
    failed++;
  }
}

console.log('\n===============================================================');
console.log('       STALE DEPLOYMENT CHUNK RECOVERY VERIFICATION SUITE       ');
console.log('===============================================================\n');

// 1. Test error identification
console.log('1. Chunk Load Error Pattern Matching:');

const realProductionError = new TypeError(
  'Failed to fetch dynamically imported module: https://www.vistaarone.com/assets/CounterSaleView-DKohoBgJ.js'
);
assert(isChunkLoadError(realProductionError), 'Identifies production CounterSale chunk failure');

const safariError = new TypeError('Importing a module script failed.');
assert(isChunkLoadError(safariError), 'Identifies Safari module script failure');

const firefoxError = new Error('error loading dynamically imported module');
assert(isChunkLoadError(firefoxError), 'Identifies Firefox dynamic import failure');

const viteCssError = new Error('Unable to preload CSS for /assets/StockView-abc.css');
assert(isChunkLoadError(viteCssError), 'Identifies Vite CSS preload failure');

const normalAppError = new TypeError("Cannot read properties of undefined (reading 'map')");
assert(!isChunkLoadError(normalAppError), 'Does NOT flag standard JavaScript runtime error as chunk error');

const supabaseNetworkError = new Error('Failed to fetch: Supabase network timeout');
assert(!isChunkLoadError(supabaseNetworkError), 'Does NOT flag backend network error as chunk error');

// 2. Test controlled reload & infinite loop protection
console.log('\n2. Controlled Reload & Infinite Loop Prevention:');
clearChunkReloadRecord();
reloadCalls = 0;

// First chunk error -> should trigger reload
const didReload1 = handleChunkLoadFailure(realProductionError);
assert(didReload1 === true, 'First chunk failure triggers controlled reload');
assert(reloadCalls === 1, 'window.location.reload() called exactly once');

// Immediate subsequent chunk error -> must be blocked by cooldown
const didReload2 = handleChunkLoadFailure(realProductionError);
assert(didReload2 === false, 'Subsequent chunk error within cooldown is blocked (prevents loop)');
assert(reloadCalls === 1, 'window.location.reload() was NOT called again');

// Non-chunk error -> never triggers reload
const didReloadNormal = handleChunkLoadFailure(normalAppError);
assert(didReloadNormal === false, 'Normal error never triggers reload');
assert(reloadCalls === 1, 'Reload count remains unchanged');

// 3. User session preservation test
console.log('\n3. User Session Preservation Verification:');
const fakeUserSession = JSON.stringify({ id: 'user-123', email: 'owner@vistaar.com', role: 'owner' });
const fakeCompanyId = 'comp-456';
const localMap: Record<string, string> = {
  vistaar_user_session: fakeUserSession,
  vistaar_current_company_id: fakeCompanyId,
};

// Polyfill localStorage to verify it is NOT touched
(global as any).localStorage = {
  getItem: (k: string) => localMap[k] || null,
  setItem: (k: string, v: string) => { localMap[k] = v; },
  removeItem: (k: string) => { delete localMap[k]; },
};

// Trigger recovery
clearChunkReloadRecord();
handleChunkLoadFailure(realProductionError);

assert(
  localMap['vistaar_user_session'] === fakeUserSession,
  'User Supabase session in localStorage is 100% preserved and untouched'
);
assert(
  localMap['vistaar_current_company_id'] === fakeCompanyId,
  'Company ID in localStorage is 100% preserved and untouched'
);

console.log('\n---------------------------------------------------------------');
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('---------------------------------------------------------------\n');

if (failed > 0) process.exit(1);
