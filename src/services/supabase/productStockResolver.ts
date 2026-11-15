export interface BranchLike {
  id: string;
  isMainBranch?: boolean;
  branchCode?: string;
  [key: string]: any;
}

export interface StockResolutionInput {
  productId: string;
  masterStock: number;
  targetBranchId?: string;
  branches: BranchLike[];
  branchInventory: Array<{
    branchId?: string;
    branch_id?: string;
    productId?: string;
    product_id?: string;
    currentStock?: number | string;
    current_stock?: number | string;
  }>;
  savedMainBranchId?: string | null;
}

/**
 * Authoritative Cross-Platform Product Stock Resolution Engine.
 * Single source of truth across Web, Desktop (Tauri), and Mobile (Capacitor/Android).
 *
 * Principles:
 * 1. Single Authoritative Master Stock: In PostgreSQL, `products.current_stock` is master truth.
 * 2. Genuine Out-of-Stock Protection: If masterStock <= 0 (e.g. Laptop), stock is ALWAYS 0.
 * 3. Explicit Allocation Priority: If an explicit record exists for (targetBranchId, productId), use it.
 * 4. Phantom / Orphan Protection: Records belonging to unknown/phantom branch IDs generated
 *    during cold-starts are completely ignored and never deducted from master stock.
 * 5. Main Branch Resolution: Master stock MINUS explicit allocations to valid known secondary branches.
 * 6. Secondary Branch Resolution:
 *    - If an explicit allocation exists for this secondary branch, use it.
 *    - If no explicit allocation exists for this branch:
 *      Master stock MINUS explicit allocations to other secondary branches.
 *      In unified/central catalog mode (no physical partitioning), secondary branch displays
 *      available central stock without arbitrary zero-outs.
 * 7. Consolidated ('ALL') View: Sum of branch allocations if explicit allocations exist;
 *    otherwise falls back authoritatively to masterStock.
 */
export function resolveAuthoritativeStock(input: StockResolutionInput): number {
  const master = Math.max(0, Number(input.masterStock) || 0);

  // 1. Genuine 0-stock products (e.g. Laptop) must ALWAYS remain strictly 0
  if (master <= 0) {
    return 0;
  }

  const { targetBranchId, branches = [], branchInventory = [], savedMainBranchId } = input;
  const isAll = !targetBranchId || targetBranchId === 'ALL';

  // Build clean list of valid known workspace branches
  const knownBranchIds = new Set(branches.map((b) => b.id));

  // Filter branch inventory to only valid known branches and this specific product
  const validProductAllocations = branchInventory.filter((bi) => {
    const bId = bi.branchId || bi.branch_id;
    const pId = bi.productId || bi.product_id;
    return bId && pId === input.productId && (knownBranchIds.size === 0 || knownBranchIds.has(bId));
  });

  // 2. Organization-wide / Consolidated View ('ALL' or undefined)
  if (isAll) {
    if (validProductAllocations.length > 0) {
      // Sum allocations across valid branches if distinct allocations exist
      const sum = validProductAllocations.reduce(
        (acc, bi) => acc + (Number(bi.currentStock ?? bi.current_stock) || 0),
        0
      );
      if (sum > 0) return Math.max(0, sum);
    }
    // If no explicit branch allocations exist across the workspace, master stock is the consolidated stock
    return master;
  }

  // 3. Determine if target branch is Main Branch
  const authoritativeMainId =
    branches.find((b) => b.isMainBranch || b.branchCode === 'MAIN')?.id ||
    savedMainBranchId ||
    branches[0]?.id;

  const targetBranchObj = branches.find((b) => b.id === targetBranchId);
  const isMain = Boolean(
    targetBranchObj?.isMainBranch ||
    targetBranchObj?.branchCode === 'MAIN' ||
    (targetBranchId && targetBranchId === authoritativeMainId) ||
    branches.length <= 1
  );

  // Secondary allocations = allocations to valid known branches OTHER than Main Branch
  const secondaryAllocations = validProductAllocations.filter((bi) => {
    const bId = bi.branchId || bi.branch_id;
    return bId !== authoritativeMainId && (!branches.find((b) => b.id === bId)?.isMainBranch);
  });

  const secondarySum = secondaryAllocations
    .filter((bi) => (bi.branchId || bi.branch_id) !== targetBranchId)
    .reduce(
      (acc, bi) => acc + (Number(bi.currentStock ?? bi.current_stock) || 0),
      0
    );

  const authoritativeStock = Math.max(0, master - secondarySum);

  // 4. Check for an explicit record for THIS specific branch
  const directRecord = validProductAllocations.find((bi) => (bi.branchId || bi.branch_id) === targetBranchId);
  const directStock = directRecord ? Math.max(0, Number(directRecord.currentStock ?? directRecord.current_stock) || 0) : 0;

  if (isMain) {
    // Main Branch: Master stock MINUS allocations to other valid secondary branches.
    // If an explicit positive allocation exists, take the maximum so legitimate stock is never suppressed.
    // A stale or zeroed local cache entry must NEVER override valid non-zero master stock.
    return directRecord ? Math.max(directStock, authoritativeStock) : authoritativeStock;
  }

  // 5. Secondary Branch:
  // If an explicit allocation exists for this secondary branch, use it.
  if (directRecord) {
    return directStock;
  }

  // In unified catalog mode (no physical partitioning), secondary branch displays available central stock
  return authoritativeStock;
}
