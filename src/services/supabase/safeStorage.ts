import { isValidUuid } from '../../lib/supabaseError';

function getMemoryStore(): Record<string, string> {
  const g = globalThis as any;
  if (!g.__vistaar_memory_store) {
    g.__vistaar_memory_store = {};
  }
  return g.__vistaar_memory_store;
}

export type ActiveWorkspaceResolver = () => string | null;

let activeWorkspaceResolver: ActiveWorkspaceResolver | null = null;

export function registerActiveWorkspaceResolver(resolver: ActiveWorkspaceResolver): void {
  activeWorkspaceResolver = resolver;
}

export function getActiveCompanyId(): string {
  // 1. Authoritative in-memory / service resolver (Dependency Injection)
  // Guarantees active session resolved by auth service is preferred over stale localStorage
  try {
    if (activeWorkspaceResolver) {
      const activeId = activeWorkspaceResolver();
      if (activeId && isValidUuid(activeId)) {
        return activeId;
      }
    }
  } catch (e: any) {
    console.warn('[safeStorage] Could not resolve active VISTAAR workspace from resolver:', e);
  }

  // 2. Authoritative session cache in localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const storedSession = localStorage.getItem('vistaar_user_session');
      if (storedSession) {
        const parsed = JSON.parse(storedSession);
        if (parsed?.companyId && isValidUuid(parsed.companyId) && parsed.companyId !== parsed.id) {
          return parsed.companyId;
        }
      }
      const direct = localStorage.getItem('vistaar_current_company_id');
      if (direct && isValidUuid(direct)) return direct;
      const wsDirect = localStorage.getItem('vistaar_workspace_id');
      if (wsDirect && isValidUuid(wsDirect)) return wsDirect;
    }
  } catch (e: any) {
    console.warn('[safeStorage] Could not resolve cached VISTAAR workspace:', e);
  }

  return 'unauthenticated';
}

/**
 * Builds a strictly isolated cache key incorporating workspace and branch context.
 * Format: workspace:{workspaceId}:branch:{branchId}:key
 */
export function buildTenantCacheKey(key: string, branchId?: string): string {
  const currentWorkspaceId = getActiveCompanyId();
  const branchPart = branchId && branchId !== 'ALL' ? branchId : 'all';
  return `workspace:${currentWorkspaceId}:branch:${branchPart}:${key}`;
}

function itemMatchesBranch(it: any, bId?: string | null): boolean {
  if (!bId || bId === 'ALL') return true;
  const itemBranch = it.branchId || it.branch_id;
  if (itemBranch === bId) return true;
  if (it.notes && typeof it.notes === 'string') {
    const match = it.notes.match(/\[branch(?:_id)?:?\s*([^\]]+)\]/i);
    if (match && match[1]) {
      const embedded = match[1].trim();
      if (embedded === bId || embedded.toLowerCase() === bId.toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

function readRaw<T = any>(k: string): T[] | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(k);
      if (stored) return JSON.parse(stored);
    } catch (e: any) {
      console.warn(`Failed to read tenant storage key ${k}:`, e);
    }
  }
  const store = getMemoryStore();
  if (store[k]) {
    try {
      return JSON.parse(store[k]);
    } catch (e: any) {
      console.warn(`Failed to parse memory tenant key ${k}:`, e);
    }
  }
  return null;
}

function readItem<T = any>(k: string): T | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(k);
      if (stored) return JSON.parse(stored);
    } catch (e: any) {
      console.warn(`Failed to read tenant storage key ${k}:`, e);
    }
  }
  const store = getMemoryStore();
  if (store[k]) {
    try {
      return JSON.parse(store[k]);
    } catch (e: any) {
      console.warn(`Failed to parse memory tenant key ${k}:`, e);
    }
  }
  return null;
}

/**
 * Tenant & Branch-scoped Local & In-Memory Storage Helper.
 * Strictly guarantees that cached data does not leak between workspaces or branches.
 */
export function safeGetTenantStorage<T = any>(key: string, fallback: T[] = [], branchId?: string): T[] {
  const currentWorkspaceId = getActiveCompanyId();
  if (!currentWorkspaceId || currentWorkspaceId === 'unauthenticated') {
    return fallback;
  }

  const tenantKey = buildTenantCacheKey(key, branchId);
  const unifiedKey = buildTenantCacheKey(key);
  const legacyKey = `${key}_${currentWorkspaceId}`;

  // Special handling for unified table: vistaar_local_branch_inventory_db
  if (key === 'vistaar_local_branch_inventory_db') {
    const unified = readRaw(unifiedKey);
    if (unified && Array.isArray(unified) && unified.length > 0) {
      if (branchId && branchId !== 'ALL') {
        return unified.filter((it: any) => itemMatchesBranch(it, branchId));
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
      const branchItems = unified.filter((it: any) => itemMatchesBranch(it, branchId));
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
      const filtered = legacy.filter((it: any) => itemMatchesBranch(it, branchId));
      if (filtered.length > 0) return filtered;
    } else {
      return legacy;
    }
  }

  return fallback;
}

export function safeSaveTenantStorage<T = any>(key: string, items: T[], branchId?: string): void {
  const currentWorkspaceId = getActiveCompanyId();
  if (!currentWorkspaceId || currentWorkspaceId === 'unauthenticated') {
    return;
  }

  const tenantKey = buildTenantCacheKey(key, branchId);
  const jsonStr = JSON.stringify(items);
  getMemoryStore()[tenantKey] = jsonStr;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(tenantKey, jsonStr);
      // Mirror to legacy key only if payload is reasonably small (< 50KB) to protect localStorage quota
      if ((!branchId || branchId === 'ALL') && jsonStr.length < 50000) {
        const legacyKey = `${key}_${currentWorkspaceId}`;
        localStorage.setItem(legacyKey, jsonStr);
      }
    } catch (e: any) {
      console.warn(`Failed to save tenant storage key ${tenantKey}:`, e);
      if (e && (e.name === 'QuotaExceededError' || String(e.message).toLowerCase().includes('quota'))) {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && !k.startsWith('vistaar_user_session') && !k.includes('auth-token') && k.startsWith('workspace:')) {
              localStorage.removeItem(k);
            }
          }
        } catch {}
      }
    }
  }

  // If saving branch-specific inventory, also merge into unified table
  if (key === 'vistaar_local_branch_inventory_db' && branchId && branchId !== 'ALL') {
    const unifiedKey = buildTenantCacheKey(key);
    const existingUnified = safeGetTenantStorage<any>(key, []);
    const filteredUnified = existingUnified.filter((it: any) => (it.branchId || it.branch_id) !== branchId);
    const merged = [...filteredUnified, ...items];
    const mergedStr = JSON.stringify(merged);
    getMemoryStore()[unifiedKey] = mergedStr;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(unifiedKey, mergedStr);
        const legacyKey = `${key}_${currentWorkspaceId}`;
        localStorage.setItem(legacyKey, mergedStr);
      } catch {}
    }
  }
}

export function safeGetTenantItem<T = any>(key: string, fallback: T = null as unknown as T, branchId?: string): T {
  const currentWorkspaceId = getActiveCompanyId();
  if (!currentWorkspaceId || currentWorkspaceId === 'unauthenticated') {
    return fallback;
  }

  const tenantKey = buildTenantCacheKey(key, branchId);
  const unifiedKey = buildTenantCacheKey(key);
  const legacyKey = `${key}_${currentWorkspaceId}`;

  const direct = readItem<T>(tenantKey);
  if (direct !== null) return direct;

  const unified = readItem(unifiedKey);
  if (unified !== null) return unified;

  const legacy = readItem(legacyKey);
  if (legacy !== null) return legacy;

  return fallback;
}

export function safeSaveTenantItem<T>(key: string, item: T, branchId?: string): void {
  const currentWorkspaceId = getActiveCompanyId();
  if (!currentWorkspaceId || currentWorkspaceId === 'unauthenticated') {
    return;
  }

  const tenantKey = buildTenantCacheKey(key, branchId);
  const jsonStr = JSON.stringify(item);
  getMemoryStore()[tenantKey] = jsonStr;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(tenantKey, jsonStr);
      if (!branchId || branchId === 'ALL') {
        const legacyKey = `${key}_${currentWorkspaceId}`;
        localStorage.setItem(legacyKey, jsonStr);
      }
    } catch (e: any) {
      console.warn(`Failed to save tenant storage key ${tenantKey}:`, e);
    }
  }
}

/**
 * Purges cached entries for a specific branch or workspace to prevent stale data display
 */
export function clearTenantStorage(branchId?: string): void {
  const currentWorkspaceId = getActiveCompanyId();
  if (!currentWorkspaceId || currentWorkspaceId === 'unauthenticated') {
    return;
  }

  const prefix = branchId
    ? `workspace:${currentWorkspaceId}:branch:${branchId}:`
    : `workspace:${currentWorkspaceId}:`;

  const mem = getMemoryStore();
  Object.keys(mem).forEach((k) => {
    if (k.startsWith(prefix)) delete mem[k];
  });

  if (typeof localStorage !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e: any) {
      console.warn('Failed clearing tenant storage for prefix:', prefix, e);
    }
  }
}

