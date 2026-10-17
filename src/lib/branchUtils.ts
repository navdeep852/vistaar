import { safeGetTenantStorage, safeGetTenantItem } from '../services/supabase/safeStorage';

export interface BranchRef {
  id: string;
  branchName?: string;
  branchCode?: string;
  isMainBranch?: boolean;
}

/**
 * Retrieves the list of known branches from tenant storage or fallback defaults.
 */
export function getKnownBranches(): BranchRef[] {
  try {
    const list = safeGetTenantStorage<BranchRef>('vistaar_local_branches_db', []);
    if (Array.isArray(list) && list.length > 0) return list;
  } catch {}
  return [];
}

/**
 * Resolves a branch identifier (which could be an ID, branch code, or name like 'testbranch')
 * to its canonical branch record.
 */
export function resolveBranch(branchIdentifier?: string | null): BranchRef | null {
  if (!branchIdentifier || branchIdentifier === 'ALL') return null;
  const branches = getKnownBranches();
  const lower = String(branchIdentifier).toLowerCase().trim();

  // 1. Direct ID match
  const byId = branches.find((b) => b.id === branchIdentifier);
  if (byId) return byId;

  // 2. Branch code match
  const byCode = branches.find((b) => (b.branchCode || '').toLowerCase() === lower);
  if (byCode) return byCode;

  // 3. Branch name match (e.g. 'testbranch' or 'My Business (Main Branch)')
  const byName = branches.find((b) => (b.branchName || '').toLowerCase() === lower);
  if (byName) return byName;

  // 4. Fallback check for main branch keywords
  if (lower.includes('main')) {
    const mainB = branches.find((b) => b.isMainBranch) || branches[0];
    if (mainB) return mainB;
  }

  return null;
}

/**
 * Authoritative Branch Matching predicate:
 * Determines whether a transaction record associated with `recordBranchId`
 * belongs to the currently active filter `filterBranchId`.
 */
export function isRecordInBranch(
  filterBranchId: string | undefined | null,
  recordBranchId: string | undefined | null,
  recordNotes?: string | null
): boolean {
  // Case 1: 'ALL' or empty filter includes all records
  if (!filterBranchId || filterBranchId === 'ALL') {
    return true;
  }

  const branches = getKnownBranches();
  let mainBranchId = safeGetTenantItem('main_branch_id');
  if (!mainBranchId) {
    const mb = branches.find((b) => b.isMainBranch) || branches[0];
    if (mb?.id) mainBranchId = mb.id;
  }

  const resolvedFilter = resolveBranch(filterBranchId);
  const isFilterMain =
    (resolvedFilter && Boolean(resolvedFilter.isMainBranch)) ||
    (mainBranchId && filterBranchId === mainBranchId) ||
    String(filterBranchId).toLowerCase().includes('main');

  // Case 2: Record has no branch assigned
  if (!recordBranchId) {
    // Check if branch was embedded in notes, e.g. [branch: testbranch] or [branch_id: ...]
    if (recordNotes) {
      const match = recordNotes.match(/\[branch(?:_id)?:?\s*([^\]]+)\]/i);
      if (match && match[1]) {
        return isRecordInBranch(filterBranchId, match[1].trim());
      }
    }
    // Unassigned transactions belong strictly to Main Branch
    return isFilterMain;
  }

  // Case 3: Exact direct string match
  if (recordBranchId === filterBranchId) {
    return true;
  }

  // Case 4: Case-insensitive direct match
  const lowerRecord = String(recordBranchId).toLowerCase().trim();
  const lowerFilter = String(filterBranchId).toLowerCase().trim();
  if (lowerRecord === lowerFilter) {
    return true;
  }

  // Case 5: Compare resolved canonical branch objects
  const resolvedRecord = resolveBranch(recordBranchId);
  if (resolvedFilter && resolvedRecord && resolvedFilter.id === resolvedRecord.id) {
    return true;
  }

  // Case 6: Cross-check against resolved filter attributes
  if (resolvedFilter) {
    if (
      recordBranchId === resolvedFilter.id ||
      lowerRecord === (resolvedFilter.branchCode || '').toLowerCase() ||
      lowerRecord === (resolvedFilter.branchName || '').toLowerCase()
    ) {
      return true;
    }
  }

  // Case 7: Cross-check against resolved record attributes
  if (resolvedRecord) {
    if (
      filterBranchId === resolvedRecord.id ||
      lowerFilter === (resolvedRecord.branchCode || '').toLowerCase() ||
      lowerFilter === (resolvedRecord.branchName || '').toLowerCase()
    ) {
      return true;
    }
  }

  return false;
}
