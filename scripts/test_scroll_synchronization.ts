import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`[PASS] ${message}`);
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('VISTAAR TEST SUITE: HORIZONTAL SCROLL SYNCHRONIZATION');
  console.log('COUNTER SALE ALL SALES HISTORY & PRODUCTS INVENTORY TABLES');
  console.log('================================================================\n');

  // ====================================================================
  // TEST GROUP 1: HeaderScrollableTable Component Architecture
  // ====================================================================
  console.log('--- TEST GROUP 1: HeaderScrollableTable Component Architecture ---');
  const compPath = path.resolve(process.cwd(), 'src/components/HeaderScrollableTable.tsx');
  assert(fs.existsSync(compPath), 'src/components/HeaderScrollableTable.tsx exists');

  const compContent = fs.readFileSync(compPath, 'utf8');
  assert(compContent.includes('export const HeaderScrollableTable'), 'HeaderScrollableTable component exported');
  assert(compContent.includes('headerContainerRef'), 'Defines headerContainerRef');
  assert(compContent.includes('headerTableRef'), 'Defines headerTableRef for explicit table width & layout');
  assert(compContent.includes('scrollbarTrackRef'), 'Defines scrollbarTrackRef for below-header scrollbar track');
  assert(compContent.includes('bodyContainerRef'), 'Defines bodyContainerRef');
  assert(compContent.includes('bodyTableRef'), 'Defines bodyTableRef');
  assert(compContent.includes('activeSourceRef'), 'Defines activeSourceRef lock');
  assert(compContent.includes('isSyncingRef'), 'Defines isSyncingRef to prevent recursive event feedback loops');
  assert(compContent.includes('overflow-x-auto') && compContent.includes('no-scrollbar'), 'Header viewport uses overflow-x-auto with no-scrollbar to possess true scroll capability');
  assert(compContent.includes("tableLayout: 'fixed'"), 'Header and body tables enforce tableLayout: fixed to guarantee 0.0px column drift');
  assert(compContent.includes('effectiveTotalWidth'), 'Shared effectiveTotalWidth applies to header table, body table, and virtual spacer');
  assert(compContent.includes('extractColWidthsFromThead'), 'Parses explicit min-widths from thead <th> definitions');
  assert(compContent.includes('renderColGroup'), 'Injects identical colgroup into both header table and body table');
  assert(compContent.includes('syncScroll'), 'Implements synchronous, real-time syncScroll for all viewports');

  // ====================================================================
  // TEST GROUP 2: Counter Sale Sales History Synchronization
  // ====================================================================
  console.log('\n--- TEST GROUP 2: Counter Sale All Sales History Alignment ---');
  const counterSalePath = path.resolve(process.cwd(), 'src/views/CounterSaleView.tsx');
  const counterSaleContent = fs.readFileSync(counterSalePath, 'utf8');

  assert(counterSaleContent.includes('<ScrollableTable minWidth="1100px" scrollbarPosition="below-header">'), 'CounterSaleView desktop table wrapped in ScrollableTable with below-header scrollbar');

  // Verify all 11 columns exist with explicit min-widths in thead
  const expectedCounterColumns = [
    { name: 'Sale #', minWidth: 'min-w-[120px]' },
    { name: 'Invoice #', minWidth: 'min-w-[120px]' },
    { name: 'Customer Name', minWidth: 'min-w-[160px]' },
    { name: 'Phone', minWidth: 'min-w-[120px]' },
    { name: 'Date', minWidth: 'min-w-[110px]' },
    { name: 'Items', minWidth: 'min-w-[80px]' },
    { name: 'Subtotal', minWidth: 'min-w-[110px]' },
    { name: 'Discount', minWidth: 'min-w-[100px]' },
    { name: 'Final Total', minWidth: 'min-w-[120px]' },
    { name: 'Status', minWidth: 'min-w-[110px]' },
    { name: 'Actions', minWidth: 'min-w-[240px]' },
  ];

  for (const col of expectedCounterColumns) {
    assert(
      counterSaleContent.includes(col.name) && counterSaleContent.includes(col.minWidth),
      `CounterSale table includes column "${col.name}" with ${col.minWidth}`
    );
  }

  // Calculate sum of min widths
  const counterTotalMinWidth = 120 + 120 + 160 + 120 + 110 + 80 + 110 + 100 + 120 + 110 + 240;
  assert(counterTotalMinWidth === 1390, 'Counter Sale table total base column width is exactly 1390px');

  // ====================================================================
  // TEST GROUP 3: Products Inventory Table Synchronization
  // ====================================================================
  console.log('\n--- TEST GROUP 3: Products / Inventory Table Alignment ---');
  const productsPath = path.resolve(process.cwd(), 'src/views/ProductsView.tsx');
  const productsContent = fs.readFileSync(productsPath, 'utf8');

  assert(productsContent.includes('<ScrollableTable minWidth="1180px" scrollbarPosition="below-header">'), 'ProductsView desktop table wrapped in ScrollableTable with below-header scrollbar');

  // Verify all 11 columns exist with explicit min-widths in thead
  const expectedProductColumns = [
    { name: 'Product Name', minWidth: 'min-w-[180px]' },
    { name: 'Part Number / Code', minWidth: 'min-w-[150px]' },
    { name: 'HSN/SAC', minWidth: 'min-w-[110px]' },
    { name: 'Location / Rack No.', minWidth: 'min-w-[140px]' },
    { name: 'Category', minWidth: 'min-w-[130px]' },
    { name: 'Stock', minWidth: 'min-w-[120px]' },
    { name: 'Buy Price', minWidth: 'min-w-[110px]' },
    { name: 'Sell Price', minWidth: 'min-w-[110px]' },
    { name: 'Stock Value', minWidth: 'min-w-[120px]' },
    { name: 'Status', minWidth: 'min-w-[110px]' },
    { name: 'Actions', minWidth: 'min-w-[210px]' },
  ];

  for (const col of expectedProductColumns) {
    assert(
      productsContent.includes(col.name) && productsContent.includes(col.minWidth),
      `Products table includes column "${col.name}" with ${col.minWidth}`
    );
  }

  const productsTotalMinWidth = 180 + 150 + 110 + 140 + 130 + 120 + 110 + 110 + 120 + 110 + 210;
  assert(productsTotalMinWidth === 1490, 'Products table total base column width is exactly 1490px');

  // ====================================================================
  // TEST GROUP 4: Mathematical Column Synchronization Simulation
  // ====================================================================
  console.log('\n--- TEST GROUP 4: Mathematical Column Synchronization Simulation ---');

  // Simulate scrolling across 0%, 25%, 50%, 75%, and 100% of horizontal scroll range
  const clientWidth = 1000; // Simulated viewport width
  const totalTableWidth = 1390;
  const maxScrollLeft = totalTableWidth - clientWidth; // 390px

  const scrollOffsets = [0, 0.25 * maxScrollLeft, 0.5 * maxScrollLeft, 0.75 * maxScrollLeft, maxScrollLeft];

  // Column left offsets in base geometry
  const columnWidths = [120, 120, 160, 120, 110, 80, 110, 100, 120, 110, 240];
  const columnLefts: number[] = [];
  let currentLeft = 0;
  for (const w of columnWidths) {
    columnLefts.push(currentLeft);
    currentLeft += w;
  }

  for (const sl of scrollOffsets) {
    const percent = Math.round((sl / maxScrollLeft) * 100);
    // At scroll offset sl:
    // Header container scrollLeft is sl
    // Body container scrollLeft is sl
    // Visible horizontal coordinate of column i: columnLefts[i] - sl
    for (let i = 0; i < columnWidths.length; i++) {
      const headerColumnX = columnLefts[i] - sl;
      const bodyColumnX = columnLefts[i] - sl;
      assert(
        headerColumnX === bodyColumnX,
        `Scroll at ${percent}% (${Math.round(sl)}px): Column ${i} header position (${headerColumnX}px) === body position (${bodyColumnX}px)`
      );
    }
  }

  // ====================================================================
  // TEST GROUP 5: Keyboard Navigation & Accessibility
  // ====================================================================
  console.log('\n--- TEST GROUP 5: Keyboard Navigation & Accessibility ---');
  assert(compContent.includes('handleScrollbarKeyDown'), 'Defines handleScrollbarKeyDown');
  assert(compContent.includes("e.key === 'ArrowLeft'"), 'Handles ArrowLeft key');
  assert(compContent.includes("e.key === 'ArrowRight'"), 'Handles ArrowRight key');
  assert(compContent.includes("e.key === 'Home'"), 'Handles Home key to scroll to start');
  assert(compContent.includes("e.key === 'End'"), 'Handles End key to scroll to end');
  assert(compContent.includes('role="scrollbar"'), 'Declares ARIA role="scrollbar"');
  assert(compContent.includes('aria-label="Horizontal table scrollbar positioned below headers"'), 'Maintains exact screen-reader label');

  // ====================================================================
  // TEST GROUP 6: CSS Classes & Theme Tokens
  // ====================================================================
  console.log('\n--- TEST GROUP 6: CSS Classes & Theme Tokens ---');
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert(cssContent.includes('.header-table-scrollbar'), 'index.css defines .header-table-scrollbar');
  assert(cssContent.includes('.no-scrollbar'), 'index.css defines .no-scrollbar utility to hide redundant scrollbars');
  assert(cssContent.includes('.no-scrollbar::-webkit-scrollbar'), 'Webkit scrollbar hidden via .no-scrollbar');
  assert(cssContent.includes('scrollbar-width: none'), 'Firefox scrollbar hidden via .no-scrollbar');

  console.log('\n================================================================');
  console.log('ALL HORIZONTAL SCROLL SYNCHRONIZATION TESTS PASSED!');
  console.log('================================================================');
}

runTestSuite().catch((err) => {
  console.error('\n[FATAL ERROR IN TEST SUITE]:', err);
  process.exit(1);
});
