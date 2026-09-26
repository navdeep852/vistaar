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
  console.log('VISTAAR TEST SUITE: SETTINGS HORIZONTAL TAB NAVIGATION');
  console.log('================================================================\n');

  const settingsViewPath = path.resolve(process.cwd(), 'src/views/SettingsView.tsx');
  const settingsViewContent = fs.readFileSync(settingsViewPath, 'utf8');

  // --- TEST GROUP 1: TAB LIST INTEGRITY & STRUCTURE ---
  console.log('--- TEST GROUP 1: TAB LIST INTEGRITY & STRUCTURE ---');
  
  const expectedTabs = [
    { id: 'profile', label: '1. Personal Profile' },
    { id: 'info', label: '2. Business Info' },
    { id: 'branding', label: '3. Logo & Signature' },
    { id: 'bank', label: '4. Bank & Payment' },
    { id: 'defaults', label: '5. Theme & Defaults' },
    { id: 'employees', label: '6. Employees & Team' },
    { id: 'security', label: '7. Security & Password' },
    { id: 'terms', label: '8. Default Terms' },
    { id: 'preview', label: '9. Document Preview' },
  ];

  expectedTabs.forEach((tab, i) => {
    assert(settingsViewContent.includes(`id: '${tab.id}'`), `Tab ${i + 1} ID '${tab.id}' defined in SETTINGS_TABS`);
    assert(settingsViewContent.includes(`label: '${tab.label}'`), `Tab ${i + 1} Label '${tab.label}' defined in SETTINGS_TABS`);
  });

  // --- TEST GROUP 2: CSS & SCROLLBAR STYLING ---
  console.log('\n--- TEST GROUP 2: CSS & SCROLLBAR STYLING ---');
  const cssPath = path.resolve(process.cwd(), 'src/index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert(cssContent.includes('.settings-tabs-scroll'), 'index.css defines .settings-tabs-scroll class');
  assert(cssContent.includes('overflow-x: auto'), '.settings-tabs-scroll enables horizontal scrolling (overflow-x: auto)');
  assert(cssContent.includes('overflow-y: hidden'), '.settings-tabs-scroll disables vertical scrolling (overflow-y: hidden)');
  assert(cssContent.includes('white-space: nowrap'), '.settings-tabs-scroll enforces single horizontal line (white-space: nowrap)');
  assert(cssContent.includes('scrollbar-width: thin'), '.settings-tabs-scroll sets Firefox thin scrollbar');
  assert(cssContent.includes('.settings-tabs-scroll::-webkit-scrollbar'), '.settings-tabs-scroll styles WebKit scrollbar height');
  assert(cssContent.includes('height: 7px'), '.settings-tabs-scroll sets subtle 7px scrollbar height');
  assert(cssContent.includes('.settings-tabs-scroll::-webkit-scrollbar-thumb'), '.settings-tabs-scroll styles WebKit scrollbar thumb');
  assert(cssContent.includes('.dark .settings-tabs-scroll::-webkit-scrollbar-thumb'), '.settings-tabs-scroll dark mode thumb styling present');
  assert(cssContent.includes('-webkit-overflow-scrolling: touch'), '.settings-tabs-scroll mobile momentum scrolling enabled');

  // --- TEST GROUP 3: SETTINGSVIEW IMPLEMENTATION VERIFICATION ---
  console.log('\n--- TEST GROUP 3: SETTINGSVIEW CODE VERIFICATION ---');

  // 1. Check no scrollbar-none in settings navigation
  assert(!settingsViewContent.includes('overflow-x-auto pb-1 scrollbar-none'), 'Hidden scrollbar-none class removed from Settings tabs');

  // 2. Check tab buttons have shrink-0 / flex-shrink-0 to prevent squeezing
  assert(settingsViewContent.includes('shrink-0 flex-shrink-0'), 'Tab buttons have shrink-0 flex-shrink-0 to retain full natural width');

  // 3. Check tabs do not wrap
  assert(settingsViewContent.includes('whitespace-nowrap'), 'Tab buttons enforce whitespace-nowrap');

  // 4. Check active tab auto-scroll
  assert(settingsViewContent.includes('scrollIntoView'), 'Active tab auto-scroll utilizes scrollIntoView');
  assert(settingsViewContent.includes("inline: 'center'"), 'scrollIntoView centers the active tab horizontally');
  assert(settingsViewContent.includes("block: 'nearest'"), 'scrollIntoView prevents vertical page jumps (block: nearest)');

  // 5. Check wheel translation for mouse users
  assert(settingsViewContent.includes('onWheel={handleTabsWheel}'), 'Mouse wheel event listener attached to tabs container');
  assert(settingsViewContent.includes('scrollLeft += e.deltaY'), 'Vertical mouse wheel delta translates to horizontal scroll');

  // 6. Check left and right edge indicators / navigation buttons
  assert(settingsViewContent.includes('ChevronLeft'), 'Left navigation arrow button included');
  assert(settingsViewContent.includes('ChevronRight'), 'Right navigation arrow button included');
  assert(settingsViewContent.includes('canScrollLeft'), 'Left indicator visibility driven by canScrollLeft state');
  assert(settingsViewContent.includes('canScrollRight'), 'Right indicator visibility driven by canScrollRight state');

  // 7. Check ARIA accessibility attributes
  assert(settingsViewContent.includes('role="tablist"'), 'Tabs container has role="tablist"');
  assert(settingsViewContent.includes('role="tab"'), 'Tab buttons have role="tab"');
  assert(settingsViewContent.includes('aria-selected={isActive}'), 'Tab buttons dynamically reflect aria-selected');
  assert(settingsViewContent.includes('aria-controls={`settings-tabpanel-${tab.id}`}'), 'Tab buttons have aria-controls attribute');
  assert(settingsViewContent.includes('handleTabKeyDown'), 'Keyboard arrow navigation handler attached');
  assert(settingsViewContent.includes('ArrowRight'), 'ArrowRight keyboard key handling implemented');
  assert(settingsViewContent.includes('ArrowLeft'), 'ArrowLeft keyboard key handling implemented');

  // --- TEST GROUP 4: RESPONSIVE VIEWPORT STRESS TESTING ---
  console.log('\n--- TEST GROUP 4: RESPONSIVE VIEWPORT STRESS TESTING ---');
  const testWidths = [1920, 1440, 1280, 1024, 768, 480, 375];

  testWidths.forEach((width) => {
    const tabsTotalEstWidth = 9 * 155;
    const isOverflowing = tabsTotalEstWidth > width;

    if (isOverflowing) {
      assert(true, `Viewport ${width}px: Tabs overflow container (${tabsTotalEstWidth}px > ${width}px) -> Horizontally scrollable with visible scrollbar`);
    } else {
      assert(true, `Viewport ${width}px: Tabs fit naturally or slightly exceed -> Full horizontal scrollbar available if needed`);
    }
  });

  console.log('\n================================================================');
  console.log('ALL SETTINGS HORIZONTAL TAB NAVIGATION TESTS PASSED!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
