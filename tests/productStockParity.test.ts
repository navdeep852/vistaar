import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('VISTAAR Product & Inventory Cross-Platform Parity Suite', () => {
  const WS_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';
  const MAIN_BRANCH_ID = '5c456a11-1321-40af-9c79-0fa151419922';
  const NORTH_BRANCH_ID = '4330d620-c0f8-4261-905b-7386b7e82520';
  const SOUTH_BRANCH_ID = '398bd10a-903e-47ff-8c47-3261f683ef40';

  const mockDbProducts = [
    { id: 'p1', name: '27W USB-C Charger', sku: 'EL-CHG-017', current_stock: 20.0, minimum_stock: 5.0 },
    { id: 'p2', name: 'Bluetooth Headphones', sku: 'EL-HDP-020', current_stock: 7.0, minimum_stock: 5.0 },
    { id: 'p3', name: 'Bluetooth Speaker', sku: 'EL-SPK-003', current_stock: 11.0, minimum_stock: 5.0 },
    { id: 'p4', name: 'CCTV Indoor Camera', sku: 'EL-CAM-019', current_stock: 4.0, minimum_stock: 5.0 },
    { id: 'p5', name: 'HDMI Cable 2m', sku: 'EL-CAB-006', current_stock: 20.0, minimum_stock: 5.0 },
    { id: 'p6', name: 'Laptop', sku: '10009106AC', current_stock: 0.0, minimum_stock: 2.0 }, // Genuine 0
    { id: 'p7', name: 'Laptop Cooling Pad', sku: 'EL-CLP-013', current_stock: 17.0, minimum_stock: 5.0 },
    { id: 'p8', name: 'LED Desk Lamp', sku: 'EL-LMP-012', current_stock: 19.0, minimum_stock: 5.0 },
    { id: 'p9', name: 'Mechanical Keyboard', sku: 'EL-MKB-016', current_stock: 11.0, minimum_stock: 5.0 },
    { id: 'p10', name: 'Portable SSD 256GB', sku: 'EL-SSD-015', current_stock: 12.0, minimum_stock: 5.0 },
    { id: 'p11', name: 'Power Bank 10000mAh', sku: 'EL-PBK-008', current_stock: 20.0, minimum_stock: 5.0 },
    { id: 'p12', name: 'Smart LED Bulb 9W', sku: 'EL-BLB-018', current_stock: 45.0, minimum_stock: 5.0 },
    { id: 'p13', name: 'Smart Plug 16A', sku: 'EL-PLG-014', current_stock: 15.0, minimum_stock: 5.0 },
    { id: 'p14', name: 'Surge Protector 4-Socket', sku: 'EL-SRG-007', current_stock: 22.0, minimum_stock: 5.0 },
    { id: 'p15', name: 'USB Flash Drive 64GB', sku: 'EL-USB-009', current_stock: 28.0, minimum_stock: 5.0 },
    { id: 'p16', name: 'USB-C Hub 6-in-1', sku: 'EL-HUB-002', current_stock: 18.0, minimum_stock: 5.0 },
    { id: 'p17', name: 'Webcam 1080p', sku: 'EL-WEB-010', current_stock: 13.0, minimum_stock: 5.0 },
    { id: 'p18', name: 'Wi-Fi Router', sku: 'EL-RTR-005', current_stock: 14.0, minimum_stock: 5.0 },
    { id: 'p19', name: 'Wired Keyboard', sku: 'EL-KEY-004', current_stock: 32.0, minimum_stock: 5.0 },
    { id: 'p20', name: 'Wireless Earbuds', sku: 'EL-EAR-011', current_stock: 25.0, minimum_stock: 5.0 },
    { id: 'p21', name: 'Wireless Mouse', sku: 'EL-MOU-001', current_stock: 24.0, minimum_stock: 5.0 },
  ];

  // Helper simulating the fixed productService.getProducts stock resolution
  function resolveStock(
    products: typeof mockDbProducts,
    targetBranchId: string | undefined,
    branches: any[],
    branchInventory: any[],
    savedMainBranchId: string | null = MAIN_BRANCH_ID
  ) {
    const isAll = targetBranchId === 'ALL';
    const specificBranchId = !isAll ? targetBranchId : undefined;

    return products.map((raw) => {
      const p = { ...raw, currentStock: Number(raw.current_stock) || 0 };

      if (specificBranchId) {
        const bEntry = branchInventory.find(
          (bi) => bi.branchId === specificBranchId && bi.productId === p.id
        );
        const bObj = branches.find((b) => b.id === specificBranchId);
        const isMain = bObj?.isMainBranch ?? (savedMainBranchId ? savedMainBranchId === specificBranchId : (branches.length <= 1));

        if (bEntry) {
          p.currentStock = Math.max(0, Number(bEntry.currentStock) || 0);
        } else if (isMain || (!bObj && branches.length === 0)) {
          const otherEntries = branchInventory.filter(
            (bi) => bi.branchId !== specificBranchId && bi.productId === p.id
          );
          const otherStockSum = otherEntries.reduce(
            (sum, bi) => sum + (Number(bi.currentStock) || 0),
            0
          );
          const masterStock = Math.max(0, Number(p.currentStock) || 0);
          p.currentStock = Math.max(0, masterStock - otherStockSum);
        } else {
          p.currentStock = 0;
        }
      } else if (isAll) {
        const matching = branchInventory.filter((bi) => bi.productId === p.id);
        if (matching.length > 0) {
          p.currentStock = matching.reduce(
            (sum, bi) => sum + (Number(bi.currentStock) || 0),
            0
          );
        }
      }

      return p;
    });
  }

  it('1. Main branch retains authoritative stock for all 21 products when storage is fully hydrated', () => {
    const branches = [
      { id: MAIN_BRANCH_ID, isMainBranch: true, name: 'Main Branch' },
      { id: NORTH_BRANCH_ID, isMainBranch: false, name: 'North Branch' },
      { id: SOUTH_BRANCH_ID, isMainBranch: false, name: 'South Branch' },
    ];
    const branchInventory: any[] = [];

    const resolved = resolveStock(mockDbProducts, MAIN_BRANCH_ID, branches, branchInventory);
    assert.equal(resolved.length, 21);

    const inStock = resolved.filter((p) => p.currentStock > 0);
    const outOfStock = resolved.filter((p) => p.currentStock === 0);

    assert.equal(inStock.length, 20, 'Exactly 20 products must be In Stock');
    assert.equal(outOfStock.length, 1, 'Exactly 1 product (Laptop) must be Out of Stock');
    assert.equal(outOfStock[0].name, 'Laptop');
    assert.equal(outOfStock[0].currentStock, 0);
  });

  it('2. Cold-start / App Update Race Condition: empty local branches does NOT wipe products to zero', () => {
    // When Android launches cold, branches array in localStorage is empty []
    const branches: any[] = [];
    const branchInventory: any[] = [];

    // Prior implementation zeroed out all 21 products here
    const resolved = resolveStock(mockDbProducts, MAIN_BRANCH_ID, branches, branchInventory, MAIN_BRANCH_ID);
    assert.equal(resolved.length, 21);

    const inStock = resolved.filter((p) => p.currentStock > 0);
    const outOfStock = resolved.filter((p) => p.currentStock === 0);

    assert.equal(inStock.length, 20, 'Products must NOT be zeroed out during cold start');
    assert.equal(outOfStock.length, 1, 'Only Laptop should be Out of Stock');
    assert.equal(outOfStock[0].name, 'Laptop');
  });

  it('3. All Branches consolidated view displays accurate organization-wide stock', () => {
    const branches = [
      { id: MAIN_BRANCH_ID, isMainBranch: true, name: 'Main Branch' },
      { id: NORTH_BRANCH_ID, isMainBranch: false, name: 'North Branch' },
    ];
    const branchInventory: any[] = [];

    const resolved = resolveStock(mockDbProducts, 'ALL', branches, branchInventory);
    assert.equal(resolved.length, 21);

    const totalStock = resolved.reduce((sum, p) => sum + p.currentStock, 0);
    assert.equal(totalStock, 377, 'Total stock across all 21 products should be 377 units');

    const laptop = resolved.find((p) => p.name === 'Laptop');
    assert.ok(laptop);
    assert.equal(laptop.currentStock, 0);
  });

  it('4. Secondary branch displays allocated stock or 0 if unallocated without mutating master stock', () => {
    const branches = [
      { id: MAIN_BRANCH_ID, isMainBranch: true, name: 'Main Branch' },
      { id: NORTH_BRANCH_ID, isMainBranch: false, name: 'North Branch' },
    ];
    // Suppose 5 USB-C Chargers transferred to North Branch
    const branchInventory = [
      { branchId: NORTH_BRANCH_ID, productId: 'p1', currentStock: 5 },
    ];

    // North branch view
    const northProducts = resolveStock(mockDbProducts, NORTH_BRANCH_ID, branches, branchInventory);
    const chargerNorth = northProducts.find((p) => p.id === 'p1');
    const speakerNorth = northProducts.find((p) => p.id === 'p3');

    assert.equal(chargerNorth?.currentStock, 5, 'North branch should have 5 chargers');
    assert.equal(speakerNorth?.currentStock, 0, 'North branch should have 0 speakers (unallocated)');

    // Main branch view: chargers deducted from main branch (20 - 5 = 15)
    const mainProducts = resolveStock(mockDbProducts, MAIN_BRANCH_ID, branches, branchInventory);
    const chargerMain = mainProducts.find((p) => p.id === 'p1');
    assert.equal(chargerMain?.currentStock, 15, 'Main branch should have 15 chargers (20 - 5)');
  });

  it('5. Status calculation parity across UI: In Stock vs Low Stock vs Out of Stock', () => {
    const branches = [{ id: MAIN_BRANCH_ID, isMainBranch: true, name: 'Main Branch' }];
    const resolved = resolveStock(mockDbProducts, MAIN_BRANCH_ID, branches, []);

    const categorized = resolved.map((p) => {
      const avail = p.currentStock;
      const isOut = avail <= 0;
      const isLow = avail <= p.minimum_stock && !isOut;
      const status = isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';
      return { name: p.name, currentStock: avail, min: p.minimum_stock, status };
    });

    const outList = categorized.filter((p) => p.status === 'Out of Stock');
    const lowList = categorized.filter((p) => p.status === 'Low Stock');
    const inList = categorized.filter((p) => p.status === 'In Stock');

    assert.equal(outList.length, 1, 'Exactly 1 product must have status "Out of Stock"');
    assert.equal(outList[0].name, 'Laptop');

    // CCTV Indoor Camera: stock 4, min 5 -> Low Stock
    assert.ok(lowList.some((p) => p.name === 'CCTV Indoor Camera'));
    assert.equal(inList.length + lowList.length, 20);
  });
});
