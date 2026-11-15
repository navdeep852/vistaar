import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthoritativeStock } from '../src/services/supabase/productStockResolver.ts';

describe('VISTAAR Legacy 21-Product Stock Parity & 22nd Product Test Suite', () => {
  const WS_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';
  const MAIN_BRANCH_ID = '5c456a11-1321-40af-9c79-0fa151419922';
  const NORTH_BRANCH_ID = '4330d620-c0f8-4261-905b-7386b7e82520';
  const SOUTH_BRANCH_ID = '398bd10a-903e-47ff-8c47-3261f683ef40';

  const mockBranches = [
    { id: MAIN_BRANCH_ID, branchCode: 'MAIN', branchName: 'My Business (Main Branch)', isMainBranch: true },
    { id: NORTH_BRANCH_ID, branchCode: 'BR-4330', branchName: 'North Branch', isMainBranch: false },
    { id: SOUTH_BRANCH_ID, branchCode: 'BR-398B', branchName: 'South Branch', isMainBranch: false },
  ];

  // Exact 22 products matching live PostgreSQL Supabase database
  const catalog22 = [
    { id: 'bf4e0d92-c620-4d76-92e7-ac92591d85c4', name: 'Laptop', sku: '10009106AC', masterStock: 0.0, isLegacy: true }, // Genuine 0
    { id: 'c09bf6ea-6ade-4c83-bd8f-5d6d3364249f', name: 'Wireless Mouse', sku: 'EL-MOU-001', masterStock: 24.0, isLegacy: true },
    { id: '125e1018-130c-4d15-adb5-99bd0249be29', name: 'USB-C Hub 6-in-1', sku: 'EL-HUB-002', masterStock: 18.0, isLegacy: true },
    { id: '7cc10fea-5691-4f10-9c7f-d44d458a5049', name: 'Bluetooth Speaker', sku: 'EL-SPK-003', masterStock: 11.0, isLegacy: true },
    { id: 'be50539e-f9a2-4dc2-ae69-39ca4e2afb54', name: 'Wired Keyboard', sku: 'EL-KEY-004', masterStock: 32.0, isLegacy: true },
    { id: '80e4b876-5c51-4118-b6db-1b0916066764', name: 'Wi-Fi Router', sku: 'EL-RTR-005', masterStock: 14.0, isLegacy: true },
    { id: 'b64397b8-63e2-4844-9dc2-0c7754f79c3c', name: 'HDMI Cable 2m', sku: 'EL-CAB-006', masterStock: 20.0, isLegacy: true },
    { id: '78f118d4-7966-443a-a329-ba27662c511f', name: 'Surge Protector 4-Socket', sku: 'EL-SRG-007', masterStock: 22.0, isLegacy: true },
    { id: '1ac90fe1-fa02-4269-99f7-be475cd18922', name: 'Power Bank 10000mAh', sku: 'EL-PBK-008', masterStock: 20.0, isLegacy: true },
    { id: '24a79719-933d-415f-bc79-ac08fc59baeb', name: 'USB Flash Drive 64GB', sku: 'EL-USB-009', masterStock: 28.0, isLegacy: true },
    { id: '65f97f78-0f1c-4eb5-adb8-2ccdba883075', name: 'Webcam 1080p', sku: 'EL-WEB-010', masterStock: 13.0, isLegacy: true },
    { id: 'e5d0627e-3c84-4928-b7a6-4a985271a799', name: 'Wireless Earbuds', sku: 'EL-EAR-011', masterStock: 25.0, isLegacy: true },
    { id: '312fbbfe-4e46-4c32-9a9a-cf3fc937d3b9', name: 'LED Desk Lamp', sku: 'EL-LMP-012', masterStock: 19.0, isLegacy: true },
    { id: '484fe48b-a1c4-49f9-a4e5-06e69681a363', name: 'Laptop Cooling Pad', sku: 'EL-CLP-013', masterStock: 17.0, isLegacy: true },
    { id: 'fa90ad4a-7554-4a54-869f-38edafe9e507', name: 'Smart Plug 16A', sku: 'EL-PLG-014', masterStock: 15.0, isLegacy: true },
    { id: '75e381dc-b884-42fd-9d32-7e85562c4b02', name: 'Portable SSD 256GB', sku: 'EL-SSD-015', masterStock: 12.0, isLegacy: true },
    { id: 'b60b50eb-6c98-4850-ba02-1038b01b30f7', name: 'Mechanical Keyboard', sku: 'EL-MKB-016', masterStock: 11.0, isLegacy: true },
    { id: '29aacda7-3385-4ea7-9468-0f5bd52d9ec4', name: '27W USB-C Charger', sku: 'EL-CHG-017', masterStock: 10.0, isLegacy: true },
    { id: '0efbdb3f-9265-48ab-93aa-4f51ba3fcb7f', name: 'Smart LED Bulb 9W', sku: 'EL-BLB-018', masterStock: 45.0, isLegacy: true },
    { id: 'd5b321e8-59a7-4699-b2d8-3e9fbca5a581', name: 'CCTV Indoor Camera', sku: 'EL-CAM-019', masterStock: 0.0, isLegacy: true }, // Genuine 0
    { id: 'e2ff07cc-3a90-45ad-95ad-c5abc06c8c70', name: 'Bluetooth Headphones', sku: 'EL-HDP-020', masterStock: 7.0, isLegacy: true },
    { id: 'f49076cb-6e46-4a86-90b1-6c49895ad6b3', name: 'Phone Stand', sku: '100537272', masterStock: 95.0, isLegacy: false }, // Newly added 22nd
  ];

  it('1. Mobile state with zeroed/dummy legacy branch inventory entries: restores all 19 non-zero products', () => {
    // Exactly reproducing the mobile environment:
    // Phone Stand has explicit allocation of 95, while legacy products have 0 (or unseeded entries)
    const mobileBranchInventory = catalog22.map((p) => ({
      branchId: MAIN_BRANCH_ID,
      productId: p.id,
      currentStock: p.isLegacy ? 0 : 95.0,
    }));

    const resolvedResults = catalog22.map((p) => ({
      ...p,
      resolvedStock: resolveAuthoritativeStock({
        productId: p.id,
        masterStock: p.masterStock,
        targetBranchId: MAIN_BRANCH_ID,
        branches: mockBranches,
        branchInventory: mobileBranchInventory,
        savedMainBranchId: MAIN_BRANCH_ID,
      }),
    }));

    // Verify Phone Stand
    const phoneStand = resolvedResults.find((p) => p.name === 'Phone Stand')!;
    assert.strictEqual(phoneStand.resolvedStock, 95.0, 'Phone Stand must display 95.0 units');

    // Verify Wireless Mouse
    const mouse = resolvedResults.find((p) => p.name === 'Wireless Mouse')!;
    assert.strictEqual(mouse.resolvedStock, 24.0, 'Wireless Mouse must display authoritative 24.0 units');

    // Verify Genuine 0-stock products (Laptop, CCTV Indoor Camera)
    const laptop = resolvedResults.find((p) => p.name === 'Laptop')!;
    assert.strictEqual(laptop.resolvedStock, 0.0, 'Laptop must strictly remain 0.0 (sold out)');

    const cctv = resolvedResults.find((p) => p.name === 'CCTV Indoor Camera')!;
    assert.strictEqual(cctv.resolvedStock, 0.0, 'CCTV Indoor Camera must strictly remain 0.0 (sold out)');

    // Verify In Stock and Out of Stock counts across catalog
    const inStockList = resolvedResults.filter((p) => p.resolvedStock > 0);
    const outOfStockList = resolvedResults.filter((p) => p.resolvedStock === 0);

    assert.strictEqual(inStockList.length, 20, 'Exactly 20 products must be In Stock');
    assert.strictEqual(outOfStockList.length, 2, 'Exactly 2 products (Laptop, CCTV) must be Out of Stock');

    // Verify total catalog available stock
    const totalUnits = resolvedResults.reduce((sum, p) => sum + p.resolvedStock, 0);
    assert.strictEqual(totalUnits, 458.0, 'Total available stock must equal exactly 458.0 units');
  });

  it('2. Cold-start / fresh mobile install (empty branchInventory): resolves master stock authoritatively', () => {
    const emptyInventory: any[] = [];

    const resolved = catalog22.map((p) => ({
      id: p.id,
      name: p.name,
      stock: resolveAuthoritativeStock({
        productId: p.id,
        masterStock: p.masterStock,
        targetBranchId: MAIN_BRANCH_ID,
        branches: mockBranches,
        branchInventory: emptyInventory,
        savedMainBranchId: MAIN_BRANCH_ID,
      }),
    }));

    const totalUnits = resolved.reduce((sum, p) => sum + p.stock, 0);
    assert.strictEqual(totalUnits, 458.0);
    assert.strictEqual(resolved.find((p) => p.name === 'Phone Stand')!.stock, 95.0);
    assert.strictEqual(resolved.find((p) => p.name === 'Wireless Mouse')!.stock, 24.0);
    assert.strictEqual(resolved.find((p) => p.name === 'Laptop')!.stock, 0.0);
    assert.strictEqual(resolved.find((p) => p.name === 'CCTV Indoor Camera')!.stock, 0.0);
  });

  it('3. Consolidated ALL Branches view correctly sums allocations and falls back to masterStock', () => {
    const mixedInventory = [
      { branchId: MAIN_BRANCH_ID, productId: 'c09bf6ea-6ade-4c83-bd8f-5d6d3364249f', currentStock: 20 },
      { branchId: NORTH_BRANCH_ID, productId: 'c09bf6ea-6ade-4c83-bd8f-5d6d3364249f', currentStock: 4 },
    ];

    // Wireless Mouse with physical distribution (20 in Main, 4 in North)
    const mouseAllStock = resolveAuthoritativeStock({
      productId: 'c09bf6ea-6ade-4c83-bd8f-5d6d3364249f',
      masterStock: 24.0,
      targetBranchId: 'ALL',
      branches: mockBranches,
      branchInventory: mixedInventory,
      savedMainBranchId: MAIN_BRANCH_ID,
    });
    assert.strictEqual(mouseAllStock, 24.0, 'Consolidated stock must equal 20 + 4 = 24.0');

    // Unpartitioned product (e.g. Phone Stand) with empty secondary allocations
    const phoneStandAllStock = resolveAuthoritativeStock({
      productId: 'f49076cb-6e46-4a86-90b1-6c49895ad6b3',
      masterStock: 95.0,
      targetBranchId: 'ALL',
      branches: mockBranches,
      branchInventory: [],
      savedMainBranchId: MAIN_BRANCH_ID,
    });
    assert.strictEqual(phoneStandAllStock, 95.0, 'Unpartitioned consolidated stock must equal master stock (95.0)');
  });

  it('4. Secondary branch explicit stock transfer deducts from Main Branch without stock duplication', () => {
    // 5 units of HDMI Cable transferred to North Branch
    const hdmiInventory = [
      { branchId: NORTH_BRANCH_ID, productId: 'b64397b8-63e2-4844-9dc2-0c7754f79c3c', currentStock: 5.0 },
    ];

    // Main Branch
    const mainHdmi = resolveAuthoritativeStock({
      productId: 'b64397b8-63e2-4844-9dc2-0c7754f79c3c',
      masterStock: 20.0,
      targetBranchId: MAIN_BRANCH_ID,
      branches: mockBranches,
      branchInventory: hdmiInventory,
      savedMainBranchId: MAIN_BRANCH_ID,
    });
    assert.strictEqual(mainHdmi, 15.0, 'Main Branch must retain 20 - 5 = 15.0 units');

    // North Branch
    const northHdmi = resolveAuthoritativeStock({
      productId: 'b64397b8-63e2-4844-9dc2-0c7754f79c3c',
      masterStock: 20.0,
      targetBranchId: NORTH_BRANCH_ID,
      branches: mockBranches,
      branchInventory: hdmiInventory,
      savedMainBranchId: MAIN_BRANCH_ID,
    });
    assert.strictEqual(northHdmi, 5.0, 'North Branch must display its 5.0 allocated units');

    // Total conservation: 15 + 5 = 20
    assert.strictEqual(mainHdmi + northHdmi, 20.0);
  });
});
