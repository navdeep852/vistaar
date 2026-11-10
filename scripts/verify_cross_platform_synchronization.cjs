/**
 * VISTAAR Cross-Platform Synchronization Verification Suite
 * Verifies consistency, configuration parity, and distribution sync across:
 * 1. Web Application (Vite / React)
 * 2. Desktop Application (Tauri 2.x)
 * 3. Mobile Application (Capacitor 8.x / Android & iOS)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');

console.log('========================================================================');
console.log('  VISTAAR — CROSS-PLATFORM SYNCHRONIZATION & HEALTH VERIFICATION');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runCheck(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Platform Abstraction Layer Integrity
runCheck('1. Platform Abstraction Services present in src/platform/', () => {
  const platformDir = path.join(rootDir, 'src', 'platform');
  const requiredFiles = [
    'index.ts',
    'platformDetection.ts',
    'cameraService.ts',
    'clipboardService.ts',
    'fileService.ts',
    'networkService.ts',
    'notificationService.ts',
    'printService.ts',
    'qrScannerService.ts',
    'shareService.ts',
    'windowService.ts',
    'types.ts',
  ];

  requiredFiles.forEach((file) => {
    const fullPath = path.join(platformDir, file);
    assert.ok(fs.existsSync(fullPath), `Missing required platform abstraction: ${file}`);
  });
});

// 2. Desktop Configuration (Tauri 2.x)
runCheck('2. Desktop (Tauri) configuration parity and dist binding', () => {
  const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  assert.ok(fs.existsSync(tauriConfPath), 'src-tauri/tauri.conf.json does not exist');
  
  const content = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  assert.equal(content.build.frontendDist, '../dist', 'Tauri frontendDist must point to ../dist');
  assert.equal(content.productName, 'VISTAAR', 'Desktop productName must be VISTAAR');
  assert.equal(content.identifier, 'com.grovyx.vistaar', 'Desktop identifier must match com.grovyx.vistaar');
});

// 3. Mobile Configuration (Capacitor 8.x)
runCheck('3. Mobile (Capacitor) configuration parity and dist binding', () => {
  const capConfPath = path.join(rootDir, 'capacitor.config.ts');
  assert.ok(fs.existsSync(capConfPath), 'capacitor.config.ts does not exist');
  
  const content = fs.readFileSync(capConfPath, 'utf8');
  assert.ok(content.includes("webDir: 'dist'"), 'Capacitor webDir must be set to dist');
  assert.ok(content.includes("appId: 'com.grovyx.vistaar'"), 'Capacitor appId must match com.grovyx.vistaar');
  assert.ok(content.includes("appName: 'VISTAAR'"), 'Capacitor appName must match VISTAAR');
});

// 4. Web Build Artifacts Presence
runCheck('4. Web build outputs present in dist/', () => {
  const distDir = path.join(rootDir, 'dist');
  const indexHtml = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');
  
  assert.ok(fs.existsSync(indexHtml), 'dist/index.html missing - run npm run build');
  assert.ok(fs.existsSync(assetsDir), 'dist/assets directory missing');
});

// 5. Capacitor Native Asset Synchronization
runCheck('5. Mobile Android & iOS native assets synchronized with dist/', () => {
  const androidPublicIndex = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public', 'index.html');
  const iosPublicIndex = path.join(rootDir, 'ios', 'App', 'App', 'public', 'index.html');
  const distIndex = path.join(rootDir, 'dist', 'index.html');
  
  assert.ok(fs.existsSync(androidPublicIndex), 'Android web assets missing - run npm run sync:mobile');
  assert.ok(fs.existsSync(iosPublicIndex), 'iOS web assets missing - run npm run sync:mobile');

  const distHash = crypto.createHash('sha256').update(fs.readFileSync(distIndex)).digest('hex');
  const androidHash = crypto.createHash('sha256').update(fs.readFileSync(androidPublicIndex)).digest('hex');
  const iosHash = crypto.createHash('sha256').update(fs.readFileSync(iosPublicIndex)).digest('hex');

  assert.equal(androidHash, distHash, 'Android assets out of sync with dist. Run npm run sync:mobile');
  assert.equal(iosHash, distHash, 'iOS assets out of sync with dist. Run npm run sync:mobile');
});

// 6. Responsive UI & Navigation Parity
runCheck('6. Desktop and Mobile navigation components properly integrated in App.tsx', () => {
  const appPath = path.join(rootDir, 'src', 'App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  assert.ok(appContent.includes("import { Header } from './components/Header'"), 'App.tsx must import desktop Header');
  assert.ok(appContent.includes("import { MobileNav } from './components/MobileNav'"), 'App.tsx must import MobileNav');
  assert.ok(appContent.includes('<Header'), 'App.tsx must render Header for desktop view');
  assert.ok(appContent.includes('<MobileNav'), 'App.tsx must render MobileNav for mobile view');
});

// 7. Single Source of Truth for Financial Calculations
runCheck('7. Single Source of Truth for Financial Calculations & Business Logic', () => {
  const calcPath = path.join(rootDir, 'src', 'services', 'financialCalculationService.ts');
  const storePath = path.join(rootDir, 'src', 'services', 'store.ts');

  assert.ok(fs.existsSync(calcPath), 'financialCalculationService.ts must exist');
  assert.ok(fs.existsSync(storePath), 'store.ts must exist');

  const calcContent = fs.readFileSync(calcPath, 'utf8');
  assert.ok(calcContent.includes('calculateInvoiceFinancials'), 'calculateInvoiceFinancials must be defined in financialCalculationService');
});

// 8. Desktop Release Artifacts & Checksums
runCheck('8. Desktop Release setup executable and SHA-256 verification', () => {
  const releaseDir = path.join(rootDir, 'release');
  const setupExe = path.join(releaseDir, 'VISTAAR-Setup.exe');
  const checksumFile = path.join(releaseDir, 'checksums.txt');

  assert.ok(fs.existsSync(setupExe), 'release/VISTAAR-Setup.exe must exist');
  assert.ok(fs.existsSync(checksumFile), 'release/checksums.txt must exist');

  const exeHash = crypto.createHash('sha256').update(fs.readFileSync(setupExe)).digest('hex');
  const checksumContent = fs.readFileSync(checksumFile, 'utf8').toLowerCase();
  assert.ok(checksumContent.includes(exeHash), `VISTAAR-Setup.exe checksum ${exeHash} not recorded in checksums.txt`);
});

// 9. Mobile Android APK Artifact
runCheck('9. Mobile Android Debug APK artifact verified', () => {
  const apkPath = path.join(rootDir, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  assert.ok(fs.existsSync(apkPath), 'Android debug APK must exist at ' + apkPath);

  const stats = fs.statSync(apkPath);
  assert.ok(stats.size > 5000000, `APK size ${stats.size} is suspiciously small (< 5MB)`);
});

console.log('\n------------------------------------------------------------------------');
console.log(`  SUMMARY: ${passedTests} of ${totalTests} checks passed successfully.`);
console.log('========================================================================\n');
