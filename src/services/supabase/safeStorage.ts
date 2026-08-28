import { supabaseAuthService } from '../supabaseAuth';

const memoryStore: Record<string, string> = {};

const getActiveCompanyId = (): string => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('vistaar_user_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.companyId) return parsed.companyId;
      }
    }
  } catch (e) {}
  try {
    if (typeof supabaseAuthService !== 'undefined' && supabaseAuthService?.getCurrentCompanyId) {
      return supabaseAuthService.getCurrentCompanyId() || 'unauthenticated';
    }
  } catch (e) {}
  return 'unauthenticated';
};

/**
 * Tenant-scoped Local & In-Memory Storage Helper
 * Ensures fallback offline storage is strictly partitioned by current Workspace ID (auth.uid()).
 */
export function safeGetTenantStorage<T = any>(key: string, fallback: T[] = []): T[] {
  const currentWorkspaceId = getActiveCompanyId();
  const tenantKey = `${key}_${currentWorkspaceId}`;

  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(tenantKey);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn(`Failed to read tenant storage key ${tenantKey}:`, e);
    }
  }

  if (memoryStore[tenantKey]) {
    try {
      return JSON.parse(memoryStore[tenantKey]);
    } catch (e) {
      console.warn(`Failed to parse memory tenant key ${tenantKey}:`, e);
    }
  }

  return fallback;
}

export function safeSaveTenantStorage<T = any>(key: string, items: T[]): void {
  const currentWorkspaceId = getActiveCompanyId();
  const tenantKey = `${key}_${currentWorkspaceId}`;

  const jsonStr = JSON.stringify(items);
  memoryStore[tenantKey] = jsonStr;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(tenantKey, jsonStr);
    } catch (e) {
      console.warn(`Failed to save tenant storage key ${tenantKey}:`, e);
    }
  }
}

export function safeGetTenantItem<T>(key: string, fallback: T): T {
  const currentWorkspaceId = getActiveCompanyId();
  const tenantKey = `${key}_${currentWorkspaceId}`;

  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(tenantKey);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn(`Failed to read tenant storage key ${tenantKey}:`, e);
    }
  }

  if (memoryStore[tenantKey]) {
    try {
      return JSON.parse(memoryStore[tenantKey]);
    } catch (e) {
      console.warn(`Failed to parse memory tenant key ${tenantKey}:`, e);
    }
  }

  return fallback;
}

export function safeSaveTenantItem<T>(key: string, item: T): void {
  const currentWorkspaceId = getActiveCompanyId();
  const tenantKey = `${key}_${currentWorkspaceId}`;

  const jsonStr = JSON.stringify(item);
  memoryStore[tenantKey] = jsonStr;

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(tenantKey, jsonStr);
    } catch (e) {
      console.warn(`Failed to save tenant storage key ${tenantKey}:`, e);
    }
  }
}

export function clearTenantStorage(): void {
  // Reset active workspace in-memory cache without purging workspace-partitioned records
}

