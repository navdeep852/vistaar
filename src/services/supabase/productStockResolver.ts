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
      if (sum > 0) return Math.min(sum, master); // Capped by authoritative master to prevent stale inflation
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

  const authoritativeMainStock = Math.max(0, master - secondarySum);

  // 4. Branch Specific Resolution
  if (isMain) {
    // Main Branch holds the central warehouse stock (master stock minus allocations to valid secondary branches).
    // Physical Stock Invariant:
    // - A generated fallback record of 0 must NEVER suppress valid master stock.
    // - A stale local cache record with a higher number must NEVER inflate stock beyond (master - secondarySum).
    // Therefore, the authoritative Main Branch stock is strictly defined by (master - secondarySum).
    return authoritativeMainStock;
  }

  // 5. Secondary Branch:
  // If an explicit allocation exists for this secondary branch, use it (capped by master stock to prevent stale inflation).
  const directRecord = validProductAllocations.find((bi) => (bi.branchId || bi.branch_id) === targetBranchId);
  if (directRecord) {
    const directStock = Math.max(0, Number(directRecord.currentStock ?? directRecord.current_stock) || 0);
    return Math.min(directStock, master);
  }

  // In unified catalog mode (no physical partitioning), secondary branch displays available central stock
  return authoritativeMainStock;
}
