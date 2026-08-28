import { supabaseAuthService } from '../supabaseAuth';

const memoryStore: Record<string, string> = {};

/**
 * Tenant-scoped Local & In-Memory Storage Helper
 * Ensures fallback offline storage is strictly partitioned by current Workspace ID (auth.uid()).
 */
export function safeGetTenantStorage<T = any>(key: string, fallback: T[] = []): T[] {
  const currentWorkspaceId = supabaseAuthService.getCurrentCompanyId() || 'unauthenticated';
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
  const currentWorkspaceId = supabaseAuthService.getCurrentCompanyId() || 'unauthenticated';
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
  const currentWorkspaceId = supabaseAuthService.getCurrentCompanyId() || 'unauthenticated';
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
  const currentWorkspaceId = supabaseAuthService.getCurrentCompanyId() || 'unauthenticated';
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
  Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);

  if (typeof localStorage !== 'undefined') {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('vistaar_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('Failed to clear localStorage keys during logout:', e);
    }
  }
}

