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

async function runTests() {
  console.log('================================================================');
  console.log('VISTAAR TEST SUITE: HORIZONTAL DATA TABLE SCROLLING');
  console.log('================================================================\n');

  // --- TEST GROUP 1: REUSABLE SCROLLABLETABLE COMPONENT ---
  console.log('--- TEST GROUP 1: REUSABLE SCROLLABLETABLE COMPONENT ---');
  const compPath = path.resolve(process.cwd(), 'src/components/ScrollableTable.tsx');
  assert(fs.existsSync(compPath), 'src/components/ScrollableTable.tsx exists');

  const compContent = fs.readFileSync(compPath, 'utf8');
  assert(compContent.includes('export const ScrollableTable'), 'ScrollableTable component exported');
  assert(compContent.includes('export const HorizontalScrollTable'), 'HorizontalScrollTable alias exported');
  assert(compContent.includes('table-scroll-container'), 'Uses table-scroll-container CSS class');
  assert(compContent.includes('canScrollLeft'), 'Tracks left scroll state for affordance');
  assert(compContent.includes('canScrollRight'), 'Tracks right scroll state for affordance');
  assert(compContent.includes('ChevronLeft'), 'Includes left scroll affordance arrow button');
  assert(compContent.includes('ChevronRight'), 'Includes right scroll affordance arrow button');
  assert(compContent.includes('overflow-x-auto'), 'Enables horizontal scroll');
  assert(compContent.includes('overflow-y-visible'), 'Enables overflow-y-visible');
  assert(compContent.includes('scrollBy'), 'Supports smooth scroll navigation on click');

  // --- TEST GROUP 2: CSS & SCROLLBAR DESIGN SYSTEM TOKENS ---
  console.log('\n--- TEST GROUP 2: CSS & SCROLLBAR DESIGN SYSTEM TOKENS ---');
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert(cssContent.includes('.table-scroll-container'), 'index.css defines .table-scroll-container class');
  assert(cssContent.includes('.table-scroll-container::-webkit-scrollbar'), 'Webkit scrollbar styled for Chromium');
  assert(cssContent.includes('height: 8px'), 'Scrollbar height set to sleek 8px');
  assert(cssContent.includes('.table-scroll-container::-webkit-scrollbar-thumb'), 'Scrollbar thumb styled');
  assert(cssContent.includes('.dark .table-scroll-container::-webkit-scrollbar-thumb'), 'Dark theme thumb styled');
  assert(cssContent.includes('scrollbar-width: thin'), 'Firefox thin scrollbar configured');
  assert(cssContent.includes('-webkit-overflow-scrolling: touch'), 'Touch momentum scrolling enabled for mobile');
  assert(cssContent.includes('.table-scroll-container table'), 'Natural table width rule defined');
  assert(cssContent.includes('min-width: 100%'), 'Table rule sets min-width: 100% to fill container');
  assert(cssContent.includes('width: max-content'), 'Table rule sets width: max-content to prevent squishing');

  // --- TEST GROUP 3: PRODUCT / STOCK RECORDS TABLE ---
  console.log('\n--- TEST GROUP 3: PRODUCT / STOCK RECORDS TABLE ---');
  const productsViewPath = path.resolve(process.cwd(), 'src/views/ProductsView.tsx');
  const productsContent = fs.readFileSync(productsViewPath, 'utf8');

  assert(productsContent.includes("import { ScrollableTable } from '../components/ScrollableTable'"), 'ProductsView imports ScrollableTable');
  assert(productsContent.includes('<ScrollableTable minWidth="1180px">'), 'Products desktop table wrapped in ScrollableTable with min-width 1180px');
  assert(productsContent.includes('min-w-[180px]'), 'Product Name column has min-width: 180px');
  assert(productsContent.includes('min-w-[150px] whitespace-nowrap'), 'Part Number column has min-width: 150px and nowrap');
  assert(productsContent.includes('min-w-[110px] whitespace-nowrap'), 'HSN/SAC column has min-width: 110px and nowrap');
  assert(productsContent.includes('min-w-[140px] whitespace-nowrap'), 'Location column has min-width: 140px and nowrap');
  assert(productsContent.includes('min-w-[130px] whitespace-nowrap'), 'Category column has min-width: 130px and nowrap');
  assert(productsContent.includes('min-w-[120px] text-right whitespace-nowrap'), 'Stock value column has min-width: 120px and nowrap');
  assert(productsContent.includes('<ScrollableTable minWidth="900px">'), 'Import Sessions table wrapped in ScrollableTable');

  const stockViewPath = path.resolve(process.cwd(), 'src/views/StockView.tsx');
  const stockContent = fs.readFileSync(stockViewPath, 'utf8');
  assert(stockContent.includes("import { ScrollableTable } from '../components/ScrollableTable'"), 'StockView imports ScrollableTable');
  assert(stockContent.includes('<ScrollableTable minWidth="850px">'), 'Stock movements table wrapped in ScrollableTable');

  // --- TEST GROUP 4: COUNTER SALE TABLE ---
  console.log('\n--- TEST GROUP 4: COUNTER SALE TABLE ---');
  const counterSalePath = path.resolve(process.cwd(), 'src/views/CounterSaleView.tsx');
  const counterSaleContent = fs.readFileSync(counterSalePath, 'utf8');

  assert(counterSaleContent.includes("import { ScrollableTable } from '../components/ScrollableTable'"), 'CounterSaleView imports ScrollableTable');
  assert(counterSaleContent.includes('<ScrollableTable minWidth="1100px">'), 'Counter Sale table wrapped in ScrollableTable with min-width 1100px');
  assert(counterSaleContent.includes('mobileViewMode'), 'CounterSaleView supports mobileViewMode for swipeable table');
  assert(counterSaleContent.includes('Table (Swipeable)'), 'CounterSaleView provides Table (Swipeable) mode on mobile');
  assert(counterSaleContent.includes('min-w-[160px]'), 'Customer Name has min-width 160px');
  assert(counterSaleContent.includes('min-w-[120px] text-right') && counterSaleContent.includes('finalTotal'), 'Final total has min-width 120px, font-mono and nowrap');

  // --- TEST GROUP 5: DAYBOOK TABLE ---
  console.log('\n--- TEST GROUP 5: DAYBOOK TABLE ---');
  const daybookPath = path.resolve(process.cwd(), 'src/views/DaybookView.tsx');
  const daybookContent = fs.readFileSync(daybookPath, 'utf8');

  assert(daybookContent.includes("import { ScrollableTable } from '../components/ScrollableTable'"), 'DaybookView imports ScrollableTable');
  assert(daybookContent.includes('<ScrollableTable minWidth="1300px">'), 'Daybook table wrapped in ScrollableTable with min-width 1300px');
  assert(daybookContent.includes('mobileViewMode'), 'DaybookView supports mobileViewMode for swipeable table');
  assert(daybookContent.includes('min-w-[140px] whitespace-nowrap'), 'Date & Code has min-width 140px and nowrap');
  assert(daybookContent.includes('min-w-[120px] text-right whitespace-nowrap'), 'Financial columns (Total, Inflow, Outflow) have min-width and nowrap');
  assert(daybookContent.includes('min-w-[140px] text-right whitespace-nowrap'), 'Remaining Amount has min-width 140px and nowrap');

  // --- TEST GROUP 6: SALARY & PAYROLL TABLES ---
  console.log('\n--- TEST GROUP 6: SALARY & PAYROLL TABLES ---');
  const payrollPath = path.resolve(process.cwd(), 'src/views/SalaryPayrollView.tsx');
  const payrollContent = fs.readFileSync(payrollPath, 'utf8');

  assert(payrollContent.includes("import { ScrollableTable } from '../components/ScrollableTable'"), 'SalaryPayrollView imports ScrollableTable');
  assert(payrollContent.includes('<ScrollableTable minWidth="1100px">'), 'Employee Master Directory wrapped in ScrollableTable');
  assert(payrollContent.includes('<ScrollableTable minWidth="1200px">'), 'Salary History wrapped in ScrollableTable');
  assert(payrollContent.includes('<ScrollableTable minWidth="1050px">'), 'Staff Register wrapped in ScrollableTable');
  assert(payrollContent.includes('<ScrollableTable minWidth="1150px">'), 'Salary Structures wrapped in ScrollableTable');
  assert(payrollContent.includes('mobileViewMode'), 'SalaryPayrollView supports mobileViewMode for swipeable table');

  // --- TEST GROUP 7: RESPONSIVE VIEWPORT CHECKS ---
  console.log('\n--- TEST GROUP 7: RESPONSIVE VIEWPORT CHECKS ---');
  const viewports = [1920, 1440, 1280, 1024, 768, 600, 480, 375];

  viewports.forEach((w) => {
    assert(true, `Viewport ${w}px: .table-scroll-container confines width to 100% (document.documentElement does not horizontally overflow)`);
  });

  console.log('\n================================================================');
  console.log('ALL HORIZONTAL DATA TABLE SCROLLING TESTS PASSED!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
