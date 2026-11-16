import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveAuthoritativeStock } from '../src/services/supabase/productStockResolver.ts';

describe('Authoritative Stock Resolution Engine', () => {
  const MAIN_ID = '5c456a11-1321-40af-9c79-0fa151419922';
  const NORTH_ID = '4330d620-c0f8-4261-905b-7386b7e82520';
  const SOUTH_ID = '398bd10a-903e-47ff-8c47-3261f683ef40';
  const PHANTOM_ID = 'phantom-uuid-from-cold-start-12345';

  const mockBranches = [
    { id: MAIN_ID, branchCode: 'MAIN', isMainBranch: true, branchName: 'Main Branch' },
    { id: NORTH_ID, branchCode: 'BR-4330', isMainBranch: false, branchName: 'North Branch' },
    { id: SOUTH_ID, branchCode: 'BR-398B', isMainBranch: false, branchName: 'South Branch' },
  ];

  it('1. Genuine 0-stock products (e.g. Laptop) strictly return 0 across ALL views', () => {
    const pId = 'laptop-uuid';
    // Main Branch
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock: 0,
        targetBranchId: MAIN_ID,
        branches: mockBranches,
        branchInventory: [],
      }),
      0
    );

    // North Branch
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock: 0,
        targetBranchId: NORTH_ID,
        branches: mockBranches,
        branchInventory: [],
      }),
      0
    );

    // Consolidated ALL
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock: 0,
        targetBranchId: 'ALL',
        branches: mockBranches,
        branchInventory: [],
      }),
      0
    );
  });

  it('2. Central inventory mode (no physical partitioning): all branches have access to master stock', () => {
    const pId = 'bulb-uuid';
    const masterStock = 45;

    // Main Branch
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: MAIN_ID,
        branches: mockBranches,
        branchInventory: [],
        savedMainBranchId: MAIN_ID,
      }),
      45
    );

    // North Branch
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: NORTH_ID,
        branches: mockBranches,
        branchInventory: [],
        savedMainBranchId: MAIN_ID,
      }),
      45
    );

    // Consolidated ALL
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: 'ALL',
        branches: mockBranches,
        branchInventory: [],
        savedMainBranchId: MAIN_ID,
      }),
      45
    );
  });

  it('3. Phantom branch records from cold start are completely ignored and do NOT deplete stock', () => {
    const pId = 'bulb-uuid';
    const masterStock = 45;

    // Phantom record created during cold start with random UUID
    const phantomInventory = [
      {
        branchId: PHANTOM_ID,
        productId: pId,
        currentStock: 45,
      },
    ];

    // Main Branch MUST NOT be depleted (45 - 45 != 0)
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: MAIN_ID,
        branches: mockBranches,
        branchInventory: phantomInventory,
        savedMainBranchId: MAIN_ID,
      }),
      45
    );

    // North Branch MUST NOT be depleted
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: NORTH_ID,
        branches: mockBranches,
        branchInventory: phantomInventory,
        savedMainBranchId: MAIN_ID,
      }),
      45
    );
  });

  it('4. Explicit branch allocation overrides central stock for that branch and deducts from Main Branch', () => {
    const pId = 'earbuds-uuid';
    const masterStock = 25;

    // 10 units explicitly allocated/transferred to South Branch
    const inventory = [
      {
        branchId: SOUTH_ID,
        productId: pId,
        currentStock: 10,
      },
    ];

    // South Branch displays its direct allocation of 10
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: SOUTH_ID,
        branches: mockBranches,
        branchInventory: inventory,
        savedMainBranchId: MAIN_ID,
      }),
      10
    );

    // Main Branch retains remaining stock: 25 - 10 = 15
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: MAIN_ID,
        branches: mockBranches,
        branchInventory: inventory,
        savedMainBranchId: MAIN_ID,
      }),
      15
    );

    // North Branch (unallocated) has access to available central stock: 25 - 10 = 15
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: NORTH_ID,
        branches: mockBranches,
        branchInventory: inventory,
        savedMainBranchId: MAIN_ID,
      }),
      15
    );
  });

  it('5. Unresolved branch state (branches empty) falls back safely without collapsing to zero', () => {
    const pId = 'mouse-uuid';
    const masterStock = 24;

    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: undefined,
        branches: [],
        branchInventory: [],
      }),
      24
    );

    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: 'some-unresolved-id',
        branches: [],
        branchInventory: [],
      }),
      24
    );
  });

  it('6. Stale local record with higher stock does NOT inflate stock beyond PostgreSQL master', () => {
    const pId = 'phone-stand-uuid';
    // Scenario: local storage on an offline mobile client still has 100 units from yesterday,
    // but 10 units were sold on desktop, reducing remote PostgreSQL master to 90.
    const masterStock = 90;
    const staleLocalInventory = [
      {
        branchId: MAIN_ID,
        productId: pId,
        currentStock: 100, // Stale outdated value!
      },
    ];

    // Main Branch MUST NOT be inflated to 100; it must strictly equal authoritative master (90)
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: MAIN_ID,
        branches: mockBranches,
        branchInventory: staleLocalInventory,
        savedMainBranchId: MAIN_ID,
      }),
      90,
      'Main Branch must not be inflated by stale local record'
    );

    // Consolidated ALL view MUST NOT be inflated to 100
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: 'ALL',
        branches: mockBranches,
        branchInventory: staleLocalInventory,
        savedMainBranchId: MAIN_ID,
      }),
      90,
      'ALL view must be capped at authoritative master stock'
    );
  });

  it('7. Generated fallback record with 0 stock does NOT suppress authoritative master stock', () => {
    const pId = 'mouse-uuid';
    const masterStock = 24;
    // Scenario: generated dummy fallback record created during branch initialization
    const generatedFallbackInventory = [
      {
        branchId: MAIN_ID,
        productId: pId,
        currentStock: 0, // Generated fallback!
      },
    ];

    // Main Branch MUST NOT be zeroed out; it must retain authoritative master (24)
    assert.strictEqual(
      resolveAuthoritativeStock({
        productId: pId,
        masterStock,
        targetBranchId: MAIN_ID,
        branches: mockBranches,
        branchInventory: generatedFallbackInventory,
        savedMainBranchId: MAIN_ID,
      }),
      24,
      'Main Branch must not be suppressed by generated fallback record with 0'
    );
  });
});
