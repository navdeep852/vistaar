import { supabaseAuthService } from '../supabaseAuth';

const memoryStore: Record<string, string> = {};

const getActiveCompanyId = (): string => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('vistaar_user_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.companyId) return parsed.companyId;
        if (parsed?.id) return parsed.id;
      }
      const direct = localStorage.getItem('vistaar_current_company_id');
      if (direct) return direct;
    }
  } catch (e) {}
  try {
    if (typeof supabaseAuthService !== 'undefined' && supabaseAuthService?.getCurrentCompanyId) {
      const cid = supabaseAuthService.getCurrentCompanyId();
      if (cid) return cid;
    }
  } catch (e) {}
  return 'default';
};

/**
 * Builds a strictly isolated cache key incorporating workspace and branch context.
 * Format: workspace:{workspaceId}:branch:{branchId}:key
 */
export function buildTenantCacheKey(key: string, branchId?: string): string {
  const currentWorkspaceId = getActiveCompanyId();
  const branchPart = branchId && branchId !== 'ALL' ? branchId : 'all';
  return `workspace:${currentWorkspaceId}:branch:${branchPart}:${key}`;
}

/**
 * Tenant & Branch-scoped Local & In-Memory Storage Helper.
 * Strictly guarantees that cached data does not leak between workspaces or branches.
 */
export function safeGetTenantStorage<T = any>(key: string, fallback: T[] = [], branchId?: string): T[] {
  const tenantKey = buildTenantCacheKey(key, branchId);
  const unifiedKey = buildTenantCacheKey(key);
  const legacyKey = `${key}_${getActiveCompanyId()}`;

  const readRaw = (k: string): T[] | null => {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(k);
        if (stored) return JSON.parse(stored);
      } catch (e) {
        console.warn(`Failed to read tenant storage key ${k}:`, e);
      }
    }
    if (memoryStore[k]) {
      try {
        return JSON.parse(memoryStore[k]);
      } catch (e) {
        console.warn(`Failed to parse memory tenant key ${k}:`, e);
      }
    }
    return null;
  };

  // Special handling for unified table: vistaar_local_branch_inventory_db
  if (key === 'vistaar_local_branch_inventory_db') {
    const unified = readRaw(unifiedKey);
    if (unified && Array.isArray(unified) && unified.length > 0) {
      if (branchId && branchId !== 'ALL') {
        return unified.filter((it: any) => (it.branchId || it.branch_id) === branchId);
      }
      return unified;
    }
  }

  // 1. Direct branch-specific read
  const direct = readRaw(tenantKey);
  if (direct && Array.isArray(direct) && direct.length > 0) {
    return direct;
  }

  // 2. If branchId is specified, check if unified table has items for this branch
  if (branchId && branchId !== 'ALL') {
    const unified = readRaw(unifiedKey);
    if (unified && Array.isArray(unified) && unified.length > 0) {
      const branchItems = unified.filter((it: any) => (it.branchId || it.branch_id) === branchId);
      if (branchItems.length > 0) return branchItems;
    }
  }

  // 3. Fallback to unified key if direct was empty and no specific branch filter or unified exists
  if (!branchId || branchId === 'ALL') {
    const unified = readRaw(unifiedKey);
    if (unified && Array.isArray(unified) && unified.length > 0) {
      return unified;
    }
  }

  // 4. Legacy key fallback
  const legacy = readRaw(legacyKey);
  if (legacy && Array.isArray(legacy)) {
    if (branchId && branchId !== 'ALL') {
      const filtered = legacy.filter((it: any) => (it.branchId || it.branch_id) === branchId);
      if (filtered.length > 0) return filtered;
    } else {
      return legacy;
    }
  }

  return fallback;
}

export function safeSaveTenantStorage<T = any>(key: string, items: T[], branchId?: string): void {
  const tenantKey = buildTenantCacheKey(key, branchId);
  const jsonStr = JSON.stringify(items);
  memoryStore[tenantKey] = jsonStr;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(tenantKey, jsonStr);
      // Also update legacy key when writing consolidated/global items for backward compatibility
      if (!branchId || branchId === 'ALL') {
        const legacyKey = `${key}_${getActiveCompanyId()}`;
        localStorage.setItem(legacyKey, jsonStr);
      }
    } catch (e) {
      console.warn(`Failed to save tenant storage key ${tenantKey}:`, e);
    }
  }

  // If saving branch-specific inventory, also merge into unified table
  if (key === 'vistaar_local_branch_inventory_db' && branchId && branchId !== 'ALL') {
    const unifiedKey = buildTenantCacheKey(key);
    const existingUnified = safeGetTenantStorage<any>(key, []);
    const filteredUnified = existingUnified.filter((it: any) => (it.branchId || it.branch_id) !== branchId);
    const merged = [...filteredUnified, ...items];
    const mergedStr = JSON.stringify(merged);
    memoryStore[unifiedKey] = mergedStr;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(unifiedKey, mergedStr);
        const legacyKey = `${key}_${getActiveCompanyId()}`;
        localStorage.setItem(legacyKey, mergedStr);
      } catch {}
    }
  }
}

export function safeGetTenantItem<T>(key: string, fallback: T, branchId?: string): T {
  const tenantKey = buildTenantCacheKey(key, branchId);
  const legacyKey = `${key}_${getActiveCompanyId()}`;

  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(tenantKey) || (!branchId ? localStorage.getItem(legacyKey) : null);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn(`Failed to read tenant storage key ${tenantKey}:`, e);
    }
  }

  if (memoryStore[tenantKey] || (!branchId && memoryStore[legacyKey])) {
    try {
      return JSON.parse(memoryStore[tenantKey] || memoryStore[legacyKey]);
    } catch (e) {
      console.warn(`Failed to parse memory tenant key ${tenantKey}:`, e);
    }
  }

  return fallback;
}

export function safeSaveTenantItem<T>(key: string, item: T, branchId?: string): void {
  const tenantKey = buildTenantCacheKey(key, branchId);
  const jsonStr = JSON.stringify(item);
  memoryStore[tenantKey] = jsonStr;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(tenantKey, jsonStr);
      if (!branchId || branchId === 'ALL') {
        const legacyKey = `${key}_${getActiveCompanyId()}`;
        localStorage.setItem(legacyKey, jsonStr);
      }
    } catch (e) {
      console.warn(`Failed to save tenant storage key ${tenantKey}:`, e);
    }
  }
}

/**
 * Purges cached entries for a specific branch or workspace to prevent stale data display
 */
export function clearTenantStorage(branchId?: string): void {
  const currentWorkspaceId = getActiveCompanyId();
  const prefix = branchId
    ? `workspace:${currentWorkspaceId}:branch:${branchId}:`
    : `workspace:${currentWorkspaceId}:`;

  Object.keys(memoryStore).forEach((k) => {
    if (k.startsWith(prefix)) delete memoryStore[k];
  });

  if (typeof localStorage !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn('Failed clearing tenant storage for prefix:', prefix, e);
    }
  }
}
