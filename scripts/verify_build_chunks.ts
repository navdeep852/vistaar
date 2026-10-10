import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');
const assetsDir = path.resolve('dist/assets');

console.log('\n===============================================================');
console.log('       VISTAAR BUILD CHUNK INTEGRITY & ASSET VERIFICATION       ');
console.log('===============================================================\n');

if (!fs.existsSync(distDir) || !fs.existsSync(assetsDir)) {
  console.error('❌ dist/ or dist/assets/ directory does not exist. Run npm run build first.');
  process.exit(1);
}

const assets = fs.readdirSync(assetsDir);
console.log(`Found ${assets.length} assets in dist/assets/\n`);

// 1. Verify all required view chunks exist in dist/assets
const requiredViews = [
  'CounterSaleView',
  'StockView',
  'PurchaseOrdersView',
  'DaybookView',
  'CashbookView',
  'ProductsView',
  'InvoicesView',
  'QuotationsView',
  'CustomersView',
  'UdhariView',
  'ExpensesView',
  'AnalyticsView',
  'EwayBillsView',
  'CategoriesView',
  'SuppliersView',
  'SupplierCatalogueView',
  'FinancialStatementsView',
  'FollowUpsView',
  'FeedbackView',
  'OffersView',
  'ReportsView',
  'SettingsView',
  'SalaryPayrollView',
];

let missingViews = 0;
for (const view of requiredViews) {
  const match = assets.find((f) => f.startsWith(view + '-') && f.endsWith('.js'));
  if (match) {
    console.log(`  ✅ [FOUND] ${view.padEnd(26)} -> ${match}`);
  } else {
    console.error(`  ❌ [MISSING] ${view}`);
    missingViews++;
  }
}

// 2. Verify dist/index.html references valid assets
console.log('\nVerifying dist/index.html asset references...');
const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
const scriptMatches = Array.from(indexHtml.matchAll(/src="\/assets\/([^"]+)"/g)).map((m) => m[1]);
const linkMatches = Array.from(indexHtml.matchAll(/href="\/assets\/([^"]+)"/g)).map((m) => m[1]);
const allReferencedAssets = [...scriptMatches, ...linkMatches];

let missingReferences = 0;
for (const ref of allReferencedAssets) {
  if (fs.existsSync(path.join(assetsDir, ref))) {
    console.log(`  ✅ [VALID REF] ${ref}`);
  } else {
    console.error(`  ❌ [INVALID REF] ${ref} does not exist in dist/assets/!`);
    missingReferences++;
  }
}

// 3. Scan all generated JS assets for internal chunk imports
console.log('\nScanning generated JS files for internal chunk references...');
let totalInternalRefs = 0;
let brokenInternalRefs = 0;

for (const assetFile of assets) {
  if (!assetFile.endsWith('.js')) continue;
  const content = fs.readFileSync(path.join(assetsDir, assetFile), 'utf-8');
  // Match import("./chunk-xxxx.js") or from "./chunk-xxxx.js"
  const importMatches = Array.from(content.matchAll(/["']\.\/([a-zA-Z0-9_\-\.]+\.js)["']/g)).map((m) => m[1]);
  for (const targetChunk of importMatches) {
    totalInternalRefs++;
    if (!fs.existsSync(path.join(assetsDir, targetChunk))) {
      console.error(`  ❌ Broken internal import in ${assetFile} -> ${targetChunk}`);
      brokenInternalRefs++;
    }
  }
}

console.log(`  Scanned ${totalInternalRefs} internal chunk references: ${totalInternalRefs - brokenInternalRefs} valid, ${brokenInternalRefs} broken.`);

console.log('\n---------------------------------------------------------------');
const totalErrors = missingViews + missingReferences + brokenInternalRefs;
if (totalErrors === 0) {
  console.log('✅ ALL BUILD CHUNK INTEGRITY CHECKS PASSED PERFECTLY!');
  console.log('---------------------------------------------------------------\n');
} else {
  console.error(`❌ FAILED: Found ${totalErrors} chunk issues.`);
  process.exit(1);
}
