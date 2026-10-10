import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Branch, UserBranchAccess, BranchInventory, StockTransfer, StockTransferItem, Product, StockReceipt, StockMovement } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage, safeGetTenantItem, safeSaveTenantItem } from './safeStorage';
import { auditLogService } from './auditLogService';
import { store } from '../store';

const LOCAL_BRANCHES_KEY = 'vistaar_local_branches_db';
const LOCAL_USER_BRANCH_ACCESS_KEY = 'vistaar_local_user_branch_access_db';
const LOCAL_BRANCH_INVENTORY_KEY = 'vistaar_local_branch_inventory_db';
const LOCAL_STOCK_TRANSFERS_KEY = 'vistaar_local_stock_transfers_db';
const LOCAL_PRODUCTS_KEY = 'vistaar_local_products_db';
const LOCAL_RECEIPTS_KEY = 'vistaar_local_stock_receipts_db';
const LOCAL_MOVEMENTS_KEY = 'vistaar_local_stock_movements_db';

const LOCAL_BRANCH_PASSWORDS_KEY = 'vistaar_local_branch_passwords_db';

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Hashes a branch access password using a cryptographic salt and SHA-256 via Web Crypto API.
 * Never stores or returns plaintext passwords.
 * Format: "v1:${salt}:${hexHash}"
 */
export async function hashBranchPassword(password: string, customSalt?: string): Promise<string> {
  const clean = password.trim();
  const salt = customSalt || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).substring(2, 18));
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${salt}:${clean}:vistaar_branch_security_v1`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `v1:${salt}:${hashHex}`;
  }
  let simpleHash = 0;
  for (let i = 0; i < clean.length; i++) {
    simpleHash = ((simpleHash << 5) - simpleHash) + clean.charCodeAt(i);
    simpleHash |= 0;
  }
  return `v1:${salt}:${Math.abs(simpleHash).toString(16)}`;
}

/**
 * Verifies a branch access password against the stored cryptographic hash.
 */
export async function verifyBranchPasswordHash(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !password) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;
  const salt = parts[1];
  const expectedHash = await hashBranchPassword(password, salt);
  return storedHash === expectedHash;
}

export class BranchService {
  private async getWorkspaceId(): Promise<string> {
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e) {
      console.warn('Failed to get authoritative workspace ID in branchService:', e);
    }
    const currentId = supabaseAuthService.getCurrentCompanyId();
    if (currentId && isValidUuid(currentId)) return currentId;
    return '';
  }

  /**
   * Helper to auto-provision default Main Branch if no branches exist.
   */
  private getOrCreateDefaultMainBranch(existingList: Branch[], wsId: string): Branch[] {
    if (existingList.length > 0) return existingList;
    const user = supabaseAuthService.getUser();
    const mainBranchId = generateUuid();
    const defaultBranch: Branch = {
      id: mainBranchId,
      workspaceId: wsId || 'default',
      branchCode: 'MAIN',
      branchName: user?.businessName ? `${user.businessName} (Main Branch)` : 'Main Branch',
      branchType: 'Store',
      status: 'Active',
      isMainBranch: true,
      country: 'India',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    safeSaveTenantStorage(LOCAL_BRANCHES_KEY, [defaultBranch]);
    safeSaveTenantItem('main_branch_id', defaultBranch.id);

    // Auto-assign owner to Main Branch
    if (user?.id) {
      const access: UserBranchAccess = {
        id: generateUuid(),
        workspaceId: wsId || 'default',
        userId: user.id,
        branchId: defaultBranch.id,
        isDefault: true,
        createdAt: new Date().toISOString(),
      };
      safeSaveTenantStorage(LOCAL_USER_BRANCH_ACCESS_KEY, [access]);
    }

    // Initialize branch_inventory for Main Branch from existing catalog products
    try {
      const prods = safeGetTenantStorage<any>('vistaar_local_products_db', []);
      if (prods.length > 0) {
        const invList = prods.map((p) => ({
          id: generateUuid(),
          workspaceId: wsId || 'default',
          branchId: defaultBranch.id,
          productId: p.id,
          currentStock: Math.max(0, Number(p.currentStock) || 0),
          openingStock: Math.max(0, Number(p.currentStock) || 0),
          minStock: Math.max(0, Number(p.minStock ?? p.minimumStock) || 0),
          sellingPrice: p.sellingPrice ? Number(p.sellingPrice) : undefined,
          purchasePrice: p.buyPrice ? Number(p.buyPrice) : undefined,
          rackLocation: p.location || undefined,
          status: 'Active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        safeSaveTenantStorage(LOCAL_BRANCH_INVENTORY_KEY, invList, defaultBranch.id);
      }
    } catch (e) {
      console.warn('Error initializing main branch inventory:', e);
    }

    return [defaultBranch];
  }

  /**
   * Get all permitted branches for the current user in this workspace.
   * Owner sees all workspace branches; Staff only sees permitted branches.
   */
  public async getBranches(options?: { activeOnly?: boolean }): Promise<{ data: Branch[]; error?: string }> {
    const wsId = await this.getWorkspaceId();

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        let query = supabase
          .from('branches')
          .select('*')
          .eq('workspace_id', wsId);

        if (options?.activeOnly !== false) {
          query = query.eq('status', 'Active');
        }

        query = query
          .order('is_main_branch', { ascending: false })
          .order('branch_name', { ascending: true });

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          const passMap = safeGetTenantItem<Record<string, string>>(LOCAL_BRANCH_PASSWORDS_KEY, {});
          const mapped: Branch[] = data.map((b: any) => ({
            id: b.id,
            workspaceId: b.workspace_id,
            branchCode: b.branch_code,
            branchName: b.branch_name,
            branchType: b.branch_type || 'Store',
            address: b.address,
            city: b.city,
            state: b.state,
            pincode: b.pincode,
            country: b.country || 'India',
            phone: b.phone,
            email: b.email,
            gstin: b.gstin,
            stateCode: b.state_code,
            status: b.status || 'Active',
            isMainBranch: Boolean(b.is_main_branch),
            hasPassword: Boolean(b.branch_password_hash || passMap[b.id]),
            createdAt: b.created_at,
            updatedAt: b.updated_at,
          }));

          safeSaveTenantStorage(LOCAL_BRANCHES_KEY, mapped);
          const mb = mapped.find((b) => b.isMainBranch) || mapped[0];
          if (mb) safeSaveTenantItem('main_branch_id', mb.id);
          return { data: mapped };
        }
      } catch (e: any) {
        // Fall through to local tenant storage
      }
    }

    // Local tenant storage fallback
    const local = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
    const guaranteed = this.getOrCreateDefaultMainBranch(local, wsId);
    const passMap = safeGetTenantItem<Record<string, string>>(LOCAL_BRANCH_PASSWORDS_KEY, {});
    const mappedWithPass = guaranteed.map((b) => ({
      ...b,
      hasPassword: Boolean(passMap[b.id] || b.hasPassword),
    }));
    const mbFallback = mappedWithPass.find((b) => b.isMainBranch) || mappedWithPass[0];
    if (mbFallback) safeSaveTenantItem('main_branch_id', mbFallback.id);
    const filtered = options?.activeOnly !== false ? mappedWithPass.filter((b) => b.status === 'Active') : mappedWithPass;
    return { data: filtered };
  }

  /**
   * Returns the current active branch ID from authoritative context or tenant storage.
   */
  public getActiveBranchId(): string | undefined {
    try {
      const saved = safeGetTenantItem<string | null>('active_branch_id', null);
      if (saved && saved !== 'ALL') return saved;
    } catch {}
    return undefined;
  }

  /**
   * Get authorized branches for a given user or current logged-in user.
   * - OWNER: authorized for all workspace branches (accesses individual branches via branch password).
   * - STAFF / EMPLOYEE: strictly authorized ONLY for their SINGLE assigned operating branch.
   */
  public async getUserAuthorizedBranches(targetUserId?: string): Promise<{ data: Branch[]; error?: string }> {
    const { data: allBranches = [], error } = await this.getBranches({ activeOnly: true });
    if (error) return { data: [], error };

    const currentUser = supabaseAuthService.getUser();
    const userId = targetUserId || currentUser?.id;

    // Role check from currentUser or session storage or employee list
    let role = (currentUser?.role || '').toLowerCase();
    let defaultBranchId = (currentUser as any)?.defaultBranchId || (currentUser as any)?.branchId;

    if (targetUserId && targetUserId !== currentUser?.id) {
      const allEmps = supabaseAuthService.getEmployees();
      const emp = allEmps.find((e) => e.id === targetUserId);
      if (emp) {
        role = (emp.role || '').toLowerCase();
        defaultBranchId = emp.defaultBranchId || emp.branchId;
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const savedSession = localStorage.getItem('vistaar_user_session');
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          if (parsed && (!targetUserId || parsed.id === targetUserId)) {
            if (parsed.role) role = parsed.role.toLowerCase();
            if (parsed.defaultBranchId) defaultBranchId = parsed.defaultBranchId;
            if (parsed.branchId && !defaultBranchId) defaultBranchId = parsed.branchId;
          }
        }
      } catch {}
    }

    const isOwner = role === 'owner';

    // Business Owner sees all branches for multi-location switching & administration
    if (isOwner) {
      return { data: allBranches };
    }

    // CRITICAL: Employee / Staff Member is permanently restricted to their SINGLE assigned branch
    if (defaultBranchId) {
      const match = allBranches.find((b) => b.id === defaultBranchId);
      if (match) return { data: [match] };
    }

    if (userId) {
      const { data: accesses = [] } = await this.getUserBranchAccessList(userId);
      if (accesses.length > 0) {
        const assignedId = accesses[0].branchId;
        const match = allBranches.find((b) => b.id === assignedId);
        if (match) return { data: [match] };
      }
    }

    // Default fallback: single main branch
    const fallback = allBranches.find((b) => b.isMainBranch) || allBranches[0];
    return { data: fallback ? [fallback] : [] };
  }

  public async getBranchById(id: string): Promise<{ data?: Branch; error?: string }> {
    const { data: list, error } = await this.getBranches({ activeOnly: false });
    if (error) return { error };
    const branch = (list || []).find((b) => b.id === id);
    return { data: branch };
  }

  /**
   * Create a new business location / branch (Owner / Admin only)
   */
  public async createBranch(branch: Partial<Branch>, branchPassword?: string): Promise<{ success: boolean; data?: Branch; error?: string }> {
    const wsId = await this.getWorkspaceId();
    if (!branch.branchCode || !branch.branchName) {
      return { success: false, error: 'Branch code and branch name are required.' };
    }

    const cleanCode = branch.branchCode.trim().toUpperCase();
    const cleanName = branch.branchName.trim();

    // Check unique constraint: workspace_id + branch_code must be unique
    const existingList = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
    const duplicateCode = existingList.find((b) => b.branchCode.toUpperCase() === cleanCode);
    if (duplicateCode) {
      return { success: false, error: `A branch with code "${cleanCode}" already exists in this enterprise.` };
    }

    const branchId = branch.id && isValidUuid(branch.id) ? branch.id : generateUuid();
    let passwordHash: string | null = null;
    if (branchPassword && branchPassword.trim()) {
      passwordHash = await hashBranchPassword(branchPassword.trim());
    }

    const newBranch: Branch = {
      id: branchId,
      workspaceId: wsId || 'default',
      branchCode: cleanCode,
      branchName: cleanName,
      branchType: branch.branchType || 'Store',
      address: branch.address || null,
      city: branch.city || null,
      state: branch.state || null,
      pincode: branch.pincode || null,
      country: branch.country || 'India',
      phone: branch.phone || null,
      email: branch.email || null,
      gstin: branch.gstin || null,
      stateCode: branch.stateCode || null,
      status: 'Active',
      isMainBranch: Boolean(branch.isMainBranch) || existingList.length === 0,
      hasPassword: Boolean(passwordHash),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // If setting as main branch, demote previous main branch
    if (newBranch.isMainBranch) {
      existingList.forEach((b) => {
        if (b.isMainBranch) b.isMainBranch = false;
      });
    }

    // Try Supabase insert if configured
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        if (newBranch.isMainBranch) {
          await supabase.from('branches').update({ is_main_branch: false }).eq('workspace_id', wsId);
        }

        const payload: any = {
          id: newBranch.id,
          workspace_id: wsId,
          branch_code: cleanCode,
          branch_name: cleanName,
          branch_type: newBranch.branchType,
          address: newBranch.address,
          city: newBranch.city,
          state: newBranch.state,
          pincode: newBranch.pincode,
          country: newBranch.country,
          phone: newBranch.phone,
          email: newBranch.email,
          gstin: newBranch.gstin,
          state_code: newBranch.stateCode,
          status: 'Active',
          is_main_branch: newBranch.isMainBranch,
        };
        if (passwordHash) {
          payload.branch_password_hash = passwordHash;
        }

        const { data: sbData, error: sbError } = await supabase.from('branches').insert([payload]).select().single();
        if (!sbError && sbData) {
          newBranch.id = sbData.id;
          const user = supabaseAuthService.getUser();
          if (user?.id) {
            await supabase.from('user_branch_access').insert([{
              workspace_id: wsId,
              user_id: user.id,
              branch_id: newBranch.id,
              is_default: Boolean(newBranch.isMainBranch),
            }]);
          }
        } else if (sbError) {
          console.warn('[createBranch] Supabase insert note:', sbError.message);
        }
      } catch (err) {
        console.warn('[createBranch] Supabase exception note:', err);
      }
    }

    // Save branch password in isolated storage if configured
    if (passwordHash) {
      const passMap = safeGetTenantItem<Record<string, string>>(LOCAL_BRANCH_PASSWORDS_KEY, {});
      passMap[newBranch.id] = passwordHash;
      safeSaveTenantItem(LOCAL_BRANCH_PASSWORDS_KEY, passMap);
    }

    // ALWAYS persist to local storage
    existingList.push(newBranch);
    safeSaveTenantStorage(LOCAL_BRANCHES_KEY, existingList);

    // Auto-assign user access locally
    const user = supabaseAuthService.getUser();
    if (user?.id) {
      const accessList = safeGetTenantStorage<UserBranchAccess>(LOCAL_USER_BRANCH_ACCESS_KEY, []);
      accessList.push({
        id: generateUuid(),
        workspaceId: wsId || 'default',
        userId: user.id,
        branchId: newBranch.id,
        isDefault: Boolean(newBranch.isMainBranch),
        createdAt: new Date().toISOString(),
      });
      safeSaveTenantStorage(LOCAL_USER_BRANCH_ACCESS_KEY, accessList);
    }

    // Initialize 0-stock branch_inventory for all master products in this new branch
    try {
      const prods = safeGetTenantStorage<any>('vistaar_local_products_db', []);
      const allBranchInv = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, []);
      prods.forEach((p) => {
        if (!allBranchInv.some((bi) => bi.branchId === newBranch.id && bi.productId === p.id)) {
          allBranchInv.push({
            id: generateUuid(),
            workspaceId: wsId || 'default',
            branchId: newBranch.id,
            productId: p.id,
            currentStock: 0,
            openingStock: 0,
            minStock: Number(p.minStock ?? p.minimumStock) || 0,
            status: 'Active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      });
      safeSaveTenantStorage(LOCAL_BRANCH_INVENTORY_KEY, allBranchInv);
    } catch (e) {
      console.warn('Error initializing new branch inventory:', e);
    }

    return { success: true, data: newBranch };
  }

  /**
   * Verifies a branch access password.
   * STRICT ACCESS RULES:
   * - Employees/staff are rejected immediately (cannot switch branches).
   * - Verified against server-side bcrypt hash via RPC or cryptographic SHA-256 fallback.
   * - Never exposes password or hash.
   */
  public async verifyBranchPassword(
    branchId: string,
    password: string
  ): Promise<{ success: boolean; authorized: boolean; requiresSetup?: boolean; error?: string }> {
    if (!password || !password.trim()) {
      return { success: false, authorized: false, error: 'Please enter the branch access password.' };
    }

    const cleanPass = password.trim();
    const currentUser = supabaseAuthService.getUser();
    const role = (currentUser?.role || '').toLowerCase();
    const isOwner = role === 'owner';

    // CRITICAL SECURITY RULE: Employees CANNOT switch branches, even if they know the branch password!
    if (!isOwner) {
      return {
        success: false,
        authorized: false,
        error: 'Permission denied: Employees cannot switch branches. You are restricted to your assigned operating location.',
      };
    }

    const wsId = await this.getWorkspaceId();

    // 1. Try Supabase RPC if configured
    if (isSupabaseConfigured() && isValidUuid(wsId) && isValidUuid(branchId)) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('verify_branch_password', {
          p_branch_id: branchId,
          p_password: cleanPass,
        });

        if (!rpcErr && rpcRes) {
          if (rpcRes.authorized) {
            return { success: true, authorized: true };
          }
          if (rpcRes.requires_setup) {
            return { success: false, authorized: false, requiresSetup: true, error: rpcRes.error };
          }
          return { success: false, authorized: false, error: rpcRes.error || 'Incorrect branch access password.' };
        }
      } catch (err) {
        // Fall through to local verification
      }
    }

    // 2. Local cryptographic verification fallback
    const passMap = safeGetTenantItem<Record<string, string>>(LOCAL_BRANCH_PASSWORDS_KEY, {});
    const storedHash = passMap[branchId];

    if (!storedHash) {
      return {
        success: false,
        authorized: false,
        requiresSetup: true,
        error: 'Branch access password has not been configured for this branch. Please set a password in Settings or setup now.',
      };
    }

    const isValid = await verifyBranchPasswordHash(cleanPass, storedHash);
    if (isValid) {
      return { success: true, authorized: true };
    }

    return { success: false, authorized: false, error: 'Incorrect branch access password.' };
  }

  /**
   * Sets or changes a branch access password (OWNER only).
   */
  public async setBranchPassword(
    branchId: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, error: 'Branch access password must be at least 4 characters long.' };
    }

    const cleanPass = newPassword.trim();
    const currentUser = supabaseAuthService.getUser();
    const role = (currentUser?.role || '').toLowerCase();
    const isOwner = role === 'owner';

    if (!isOwner) {
      return {
        success: false,
        error: 'Permission denied: Only the Business Owner can configure branch access passwords.',
      };
    }

    const wsId = await this.getWorkspaceId();

    // 1. Try Supabase RPC if configured
    if (isSupabaseConfigured() && isValidUuid(wsId) && isValidUuid(branchId)) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('set_branch_password', {
          p_branch_id: branchId,
          p_new_password: cleanPass,
        });

        if (rpcErr || (rpcRes && !rpcRes.success)) {
          console.warn('[setBranchPassword] Server note:', rpcErr?.message || rpcRes?.error);
        }
      } catch (err) {
        // Fall through to local
      }
    }

    // 2. Save cryptographic hash locally
    const hash = await hashBranchPassword(cleanPass);
    const passMap = safeGetTenantItem<Record<string, string>>(LOCAL_BRANCH_PASSWORDS_KEY, {});
    passMap[branchId] = hash;
    safeSaveTenantItem(LOCAL_BRANCH_PASSWORDS_KEY, passMap);

    // Update hasPassword on cached branches
    const local = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
    const target = local.find((b) => b.id === branchId);
    if (target) {
      target.hasPassword = true;
      safeSaveTenantStorage(LOCAL_BRANCHES_KEY, local);
    }

    await auditLogService.logSecurityEvent({
      action: 'BRANCH_PASSWORD_CHANGED',
      result: 'ALLOWED',
      details: { branchId },
    });

    return { success: true };
  }

  /**
   * Resets a branch access password (OWNER only).
   */
  public async resetBranchPassword(
    branchId: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.setBranchPassword(branchId, newPassword);
  }

  /**
   * Transfers an employee to a new branch (OWNER only).
   */
  public async transferEmployeeBranch(
    userId: string,
    targetBranchId: string
  ): Promise<{ success: boolean; error?: string }> {
    const currentUser = supabaseAuthService.getUser();
    const role = (currentUser?.role || '').toLowerCase();
    const isOwner = role === 'owner';

    if (!isOwner) {
      return {
        success: false,
        error: 'Permission denied: Only the Business Owner can transfer employees between branches.',
      };
    }

    const wsId = await this.getWorkspaceId();

    // 1. Try Supabase RPC if configured
    if (isSupabaseConfigured() && isValidUuid(wsId) && isValidUuid(userId) && isValidUuid(targetBranchId)) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('transfer_employee_branch', {
          p_employee_id: userId,
          p_new_branch_id: targetBranchId,
        });

        if (rpcErr || (rpcRes && !rpcRes.success)) {
          console.warn('[transferEmployeeBranch] Server note:', rpcErr?.message || rpcRes?.error);
        }
      } catch (err) {
        // Fall through to local
      }
    }

    // 2. Update local accesses
    await this.setUserBranchAccesses(userId, [targetBranchId]);

    // Update profile in local employee cache
    try {
      const employees = supabaseAuthService.getEmployees();
      const emp = employees.find((e) => e.id === userId);
      if (emp) {
        emp.branchId = targetBranchId;
        emp.defaultBranchId = targetBranchId;
        safeSaveTenantItem(`vistaar_local_employees_db_${wsId}`, employees);
      }
    } catch {}

    await auditLogService.logSecurityEvent({
      action: 'EMPLOYEE_BRANCH_TRANSFERRED',
      result: 'ALLOWED',
      details: { userId, targetBranchId },
    });

    return { success: true };
  }

  /**
   * Update branch metadata
   */
  public async updateBranch(id: string, updates: Partial<Branch>): Promise<{ success: boolean; data?: Branch; error?: string }> {
    const wsId = await this.getWorkspaceId();

    const payload: any = {
      updated_at: new Date().toISOString(),
    };
    if (updates.branchName) payload.branch_name = updates.branchName.trim();
    if (updates.branchCode) payload.branch_code = updates.branchCode.trim().toUpperCase();
    if (updates.branchType) payload.branch_type = updates.branchType;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.city !== undefined) payload.city = updates.city;
    if (updates.state !== undefined) payload.state = updates.state;
    if (updates.pincode !== undefined) payload.pincode = updates.pincode;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.gstin !== undefined) payload.gstin = updates.gstin;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.isMainBranch !== undefined) payload.is_main_branch = updates.isMainBranch;

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        if (updates.isMainBranch) {
          await supabase.from('branches').update({ is_main_branch: false }).eq('workspace_id', wsId);
        }
        await supabase.from('branches').update(payload).eq('id', id).eq('workspace_id', wsId);
      } catch (e) {
        console.warn('Supabase updateBranch note:', e);
      }
    }

    const list = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
    const idx = list.findIndex((b) => b.id === id);
    if (idx !== -1) {
      if (updates.isMainBranch) {
        list.forEach((b) => { if (b.id !== id && b.isMainBranch) b.isMainBranch = false; });
      }
      list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
      safeSaveTenantStorage(LOCAL_BRANCHES_KEY, list);
      return { success: true, data: list[idx] };
    }

    return { success: false, error: 'Branch not found' };
  }

  /**
   * Soft deactivate a branch. Hard deletion is forbidden to preserve financial audits.
   */
  public async deactivateBranch(id: string): Promise<{ success: boolean; error?: string }> {
    const branchRes = await this.getBranchById(id);
    if (branchRes.data?.isMainBranch) {
      return { success: false, error: 'Cannot deactivate the primary main branch. Please set another branch as main first.' };
    }
    return this.updateBranch(id, { status: 'Inactive' });
  }

  /**
   * Assign user to a branch
   */
  public async assignUserToBranch(userId: string, branchId: string, isDefault = false): Promise<{ success: boolean; error?: string }> {
    const wsId = await this.getWorkspaceId();

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        await supabase.from('user_branch_access').upsert({
          workspace_id: wsId,
          user_id: userId,
          branch_id: branchId,
          is_default: isDefault,
        });
        if (isDefault) {
          await supabase.from('profiles').update({ default_branch_id: branchId }).eq('id', userId);
        }
      } catch (e) {
        console.warn('Supabase assignUserToBranch note:', e);
      }
    }

    const list = safeGetTenantStorage<UserBranchAccess>(LOCAL_USER_BRANCH_ACCESS_KEY, []);
    const existing = list.find((a) => a.userId === userId && a.branchId === branchId);
    if (!existing) {
      list.push({
        id: generateUuid(),
        workspaceId: wsId || 'default',
        userId,
        branchId,
        isDefault,
        createdAt: new Date().toISOString(),
      });
      safeSaveTenantStorage(LOCAL_USER_BRANCH_ACCESS_KEY, list);
    }

    return { success: true };
  }

  /**
   * Fetch user branch assignments
   */
  public async getUserBranchAccessList(userId?: string): Promise<{ data: UserBranchAccess[]; error?: string }> {
    const wsId = await this.getWorkspaceId();

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        let query = supabase.from('user_branch_access').select('*').eq('workspace_id', wsId);
        if (userId) query = query.eq('user_id', userId);
        const { data, error } = await query;
        if (!error && data) {
          const mapped: UserBranchAccess[] = data.map((row: any) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            userId: row.user_id,
            branchId: row.branch_id,
            isDefault: Boolean(row.is_default),
            createdAt: row.created_at,
          }));
          return { data: mapped };
        }
      } catch (e) {
        // Fall through
      }
    }

    const local = safeGetTenantStorage<UserBranchAccess>(LOCAL_USER_BRANCH_ACCESS_KEY, []);
    return { data: userId ? local.filter((a) => a.userId === userId) : local };
  }

  /**
   * Set user branch access in bulk
   */
  public async setUserBranchAccesses(userId: string, branchIds: string[]): Promise<{ success: boolean; error?: string }> {
    const wsId = await this.getWorkspaceId();

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        await supabase.from('user_branch_access').delete().eq('workspace_id', wsId).eq('user_id', userId);
        if (branchIds.length > 0) {
          const rows = branchIds.map((bId, idx) => ({
            workspace_id: wsId,
            user_id: userId,
            branch_id: bId,
            is_default: idx === 0,
          }));
          await supabase.from('user_branch_access').insert(rows);
        }
      } catch (e) {
        console.warn('Supabase setUserBranchAccesses note:', e);
      }
    }

    const local = safeGetTenantStorage<UserBranchAccess>(LOCAL_USER_BRANCH_ACCESS_KEY, []);
    const filtered = local.filter((a) => a.userId !== userId);
    branchIds.forEach((bId, idx) => {
      filtered.push({
        id: generateUuid(),
        workspaceId: wsId || 'default',
        userId,
        branchId: bId,
        isDefault: idx === 0,
        createdAt: new Date().toISOString(),
      });
    });
    safeSaveTenantStorage(LOCAL_USER_BRANCH_ACCESS_KEY, filtered);
    return { success: true };
  }

  /**
   * Authoritative Multi-Branch Catalog & Inventory Synchronizer.
   * Guarantees:
   * 1. Every catalog product has persistent branch_inventory records.
   * 2. Existing product stock and branchless receipts are permanently mapped to Main Branch.
   * 3. Secondary branches (e.g. testbranch) have persistent branch_inventory records initialized to 0.
   * 4. Idempotent across local tenant storage and remote Supabase.
   */
  public async ensureBranchInventorySynchronized(targetBranchId?: string): Promise<BranchInventory[]> {
    const wsId = await this.getWorkspaceId();
    const branchesRes = await this.getBranches({ activeOnly: false });
    const allBranches = branchesRes.data || [];
    if (allBranches.length === 0) return [];

    const mainBranch = allBranches.find((b) => b.isMainBranch) || allBranches[0];
    if (!mainBranch) return [];

    // 1. Gather all products across store, local storage, and remote Supabase
    const localProds = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
    const storeProds = (typeof store !== 'undefined' && store?.getProducts) ? store.getProducts() : [];
    const prodMap = new Map<string, any>();
    localProds.forEach((p) => { if (p?.id) prodMap.set(p.id, p); });
    storeProds.forEach((p) => { if (p?.id && !prodMap.has(p.id)) prodMap.set(p.id, p); });

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data: sbProds, error: pErr } = await supabase
          .from('products')
          .select('id, name, sku, part_number, current_stock, minimum_stock, location, buy_price, selling_price')
          .eq('workspace_id', wsId);
        if (!pErr && sbProds && sbProds.length > 0) {
          sbProds.forEach((p: any) => {
            if (p?.id) {
              const existing = prodMap.get(p.id);
              prodMap.set(p.id, {
                id: p.id,
                name: p.name,
                productName: p.name,
                sku: p.sku,
                partNumber: p.part_number,
                currentStock: existing?.currentStock !== undefined ? existing.currentStock : Number(p.current_stock) || 0,
                minimumStock: Number(p.minimum_stock) || 0,
                location: p.location,
                buyPrice: Number(p.buy_price) || 0,
                sellingPrice: Number(p.selling_price) || 0,
              });
            }
          });
        }
      } catch (e) {
        // remote table error, ignore
      }
    }

    const allProducts = Array.from(prodMap.values());
    if (allProducts.length === 0) return [];

    // 2. Load existing branch inventory from unified key
    const allBranchInv = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, []);
    const invMap = new Map<string, BranchInventory>();
    allBranchInv.forEach((bi) => {
      invMap.set(`${bi.branchId}__${bi.productId}`, bi);
    });

    // 3. Load existing stock receipts and backfill branchless receipts to Main Branch
    const localReceipts = safeGetTenantStorage<any>(LOCAL_RECEIPTS_KEY, []);
    let receiptsModified = false;
    localReceipts.forEach((r: any) => {
      if (!r.branchId && !r.branch_id) {
        r.branchId = mainBranch.id;
        r.branch_id = mainBranch.id;
        receiptsModified = true;
      }
    });

    if (typeof store !== 'undefined' && store?.getState) {
      const stateReceipts = store.getState().stockReceipts || [];
      stateReceipts.forEach((r: any) => {
        if (!r.branchId) {
          r.branchId = mainBranch.id;
        }
      });
    }

    let inventoryModified = false;
    const nowIso = new Date().toISOString();

    // 4. Ensure each product has a Main Branch inventory entry and secondary branch entries
    for (const p of allProducts) {
      const masterStock = Math.max(0, Number(p.currentStock ?? p.stock) || 0);
      const mainKey = `${mainBranch.id}__${p.id}`;
      let mainEntry = invMap.get(mainKey);

      if (!mainEntry) {
        // Create Main Branch inventory entry with master stock
        mainEntry = {
          id: generateUuid(),
          workspaceId: wsId || 'default',
          branchId: mainBranch.id,
          productId: p.id,
          currentStock: masterStock,
          openingStock: masterStock,
          minStock: Number(p.minStock ?? p.minimumStock) || 0,
          reorderLevel: Number(p.reorderLevel) || 0,
          rackLocation: p.location,
          purchasePrice: p.buyPrice ? Number(p.buyPrice) : undefined,
          sellingPrice: p.sellingPrice ? Number(p.sellingPrice) : undefined,
          status: masterStock > 0 ? 'Active' : 'Out of Stock',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        invMap.set(mainKey, mainEntry);
        allBranchInv.push(mainEntry);
        inventoryModified = true;

        // If master stock > 0, ensure Main Branch has an active stock receipt for FIFO
        const hasMainReceipt = localReceipts.some((r: any) => 
          (r.productId === p.id || r.product_id === p.id) && 
          (r.branchId === mainBranch.id || r.branch_id === mainBranch.id) && 
          Number(r.quantityRemaining ?? r.quantity_remaining) > 0
        );

        if (!hasMainReceipt && masterStock > 0) {
          const initReceipt = {
            id: `rec-init-${p.id}`,
            workspace_id: wsId || 'default',
            product_id: p.id,
            productId: p.id,
            branch_id: mainBranch.id,
            branchId: mainBranch.id,
            receipt_number: `GRN-OPEN-${Date.now().toString().slice(-4)}`,
            received_date: nowIso.split('T')[0],
            quantity_received: masterStock,
            quantityReceived: masterStock,
            quantity_remaining: masterStock,
            quantityRemaining: masterStock,
            buy_price: Number(p.buyPrice) || 0,
            buyPrice: Number(p.buyPrice) || 0,
            notes: 'Authoritative opening stock for Main Branch',
            created_at: nowIso,
            createdAt: nowIso,
            updated_at: nowIso,
            updatedAt: nowIso,
          };
          localReceipts.unshift(initReceipt);
          if (typeof store !== 'undefined' && store?.getState) {
            const sRecs = store.getState().stockReceipts;
            if (sRecs && !sRecs.some((r: any) => r.id === initReceipt.id)) {
              sRecs.unshift(initReceipt as any);
            }
          }
          receiptsModified = true;
        }
      }

      // Also ensure entries for all other active branches (initialized to 0 if not present)
      for (const b of allBranches) {
        if (b.id === mainBranch.id) continue;
        const bKey = `${b.id}__${p.id}`;
        let bEntry = invMap.get(bKey);
        if (!bEntry) {
          bEntry = {
            id: generateUuid(),
            workspaceId: wsId || 'default',
            branchId: b.id,
            productId: p.id,
            currentStock: 0,
            openingStock: 0,
            minStock: 0,
            reorderLevel: 0,
            rackLocation: p.location,
            status: 'Active',
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          invMap.set(bKey, bEntry);
          allBranchInv.push(bEntry);
          inventoryModified = true;
        }
      }
    }

    if (receiptsModified) {
      safeSaveTenantStorage(LOCAL_RECEIPTS_KEY, localReceipts);
    }

    if (inventoryModified) {
      safeSaveTenantStorage(LOCAL_BRANCH_INVENTORY_KEY, allBranchInv);
    }

    // 5. If Supabase is configured and tables exist, attempt remote upsert
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const payload = allBranchInv.map((bi) => ({
          workspace_id: wsId,
          branch_id: bi.branchId,
          product_id: bi.productId,
          opening_stock: bi.openingStock,
          current_stock: bi.currentStock,
          min_stock: bi.minStock,
          reorder_level: bi.reorderLevel,
          rack_location: bi.rackLocation,
          purchase_price: bi.purchasePrice,
          selling_price: bi.sellingPrice,
          status: bi.currentStock > 0 ? 'In Stock' : 'Out of Stock',
          updated_at: new Date().toISOString(),
        }));
        await supabase.from('branch_inventory').upsert(payload, { onConflict: 'branch_id,product_id' });
        await supabase.from('stock_receipts').update({ branch_id: mainBranch.id }).eq('workspace_id', wsId).is('branch_id', null);
      } catch (sbErr) {
        // Table may not yet be migrated in remote Supabase
      }
    }

    return allBranchInv;
  }

  /**
   * Fetch Branch-specific inventory
   */
  public async getBranchInventory(branchId?: string, productId?: string): Promise<{ data: BranchInventory[]; error?: string }> {
    const wsId = await this.getWorkspaceId();

    // 1. Automatically ensure catalog branch inventory is synchronized
    await this.ensureBranchInventorySynchronized(branchId);

    // 2. Try Supabase query if configured
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        let query = supabase
          .from('branch_inventory')
          .select('*, products(*), branches(*)')
          .eq('workspace_id', wsId);

        if (branchId && branchId !== 'ALL') {
          query = query.eq('branch_id', branchId);
        }
        if (productId) {
          query = query.eq('product_id', productId);
        }

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          const mapped: BranchInventory[] = data.map((row: any) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            branchId: row.branch_id,
            productId: row.product_id,
            openingStock: Number(row.opening_stock) || 0,
            currentStock: Number(row.current_stock) || 0,
            minStock: Number(row.min_stock) || 0,
            reorderLevel: Number(row.reorder_level) || 0,
            rackLocation: row.rack_location,
            purchasePrice: row.purchase_price ? Number(row.purchase_price) : undefined,
            sellingPrice: row.selling_price ? Number(row.selling_price) : undefined,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            product: row.products ? {
              id: row.products.id,
              name: row.products.name,
              sku: row.products.sku,
              partNumber: row.products.part_number,
              currentStock: row.products.current_stock,
              unit: row.products.unit,
            } as any : undefined,
            branch: row.branches ? {
              id: row.branches.id,
              branchName: row.branches.branch_name,
              branchCode: row.branches.branch_code,
            } as any : undefined,
          }));

          safeSaveTenantStorage(LOCAL_BRANCH_INVENTORY_KEY, mapped, branchId);
          return { data: mapped };
        }
      } catch (e: any) {
        // Fall through to local tenant storage
      }
    }

    // 3. Local tenant storage query
    const allInv = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, []);
    const prods = safeGetTenantStorage<any>(LOCAL_PRODUCTS_KEY, []);
    const storeProds = (typeof store !== 'undefined' && store?.getProducts) ? store.getProducts() : [];
    const branches = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);

    let filtered = allInv;
    if (branchId && branchId !== 'ALL') {
      filtered = filtered.filter((bi) => bi.branchId === branchId);
    }
    if (productId) {
      filtered = filtered.filter((bi) => bi.productId === productId);
    }

    const prodMap = new Map<string, any>();
    prods.forEach((p: any) => { if (p?.id) prodMap.set(p.id, p); });
    storeProds.forEach((p: any) => { if (p?.id && !prodMap.has(p.id)) prodMap.set(p.id, p); });
    const branchMap = new Map<string, any>(branches.map((b: any) => [b.id, b]));

    const result = filtered.map((bi) => ({
      ...bi,
      product: prodMap.get(bi.productId),
      branch: branchMap.get(bi.branchId),
    }));

    return { data: result };
  }

  /**
   * Fetch Stock Transfers
   */
  public async getStockTransfers(branchId?: string): Promise<{ data: StockTransfer[]; error?: string }> {
    const wsId = await this.getWorkspaceId();

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        let query = supabase
          .from('stock_transfers')
          .select(`
            *,
            source_branch:branches!stock_transfers_source_branch_id_fkey(branch_name, branch_code),
            destination_branch:branches!stock_transfers_destination_branch_id_fkey(branch_name, branch_code),
            stock_transfer_items(*, products(name, sku, part_number))
          `)
          .eq('workspace_id', wsId)
          .order('transfer_date', { ascending: false })
          .order('created_at', { ascending: false });

        if (branchId && branchId !== 'ALL') {
          query = query.or(`source_branch_id.eq.${branchId},destination_branch_id.eq.${branchId}`);
        }

        const { data, error } = await query;
        if (!error && data) {
          const mapped: StockTransfer[] = data.map((row: any) => ({
            id: row.id,
            workspaceId: row.workspace_id,
            transferNumber: row.transfer_number,
            sourceBranchId: row.source_branch_id,
            sourceBranchName: row.source_branch?.branch_name,
            destinationBranchId: row.destination_branch_id,
            destinationBranchName: row.destination_branch?.branch_name,
            transferDate: row.transfer_date,
            status: row.status,
            requestedBy: row.requested_by,
            approvedBy: row.approved_by,
            notes: row.notes,
            createdAt: row.created_at,
            completedAt: row.completed_at,
            updatedAt: row.updated_at,
            items: (row.stock_transfer_items || []).map((it: any) => ({
              id: it.id,
              workspaceId: it.workspace_id,
              transferId: it.transfer_id,
              productId: it.product_id,
              productName: it.products?.name,
              partNumber: it.products?.part_number,
              sku: it.products?.sku,
              quantity: Number(it.quantity) || 0,
              unitCost: it.unit_cost ? Number(it.unit_cost) : undefined,
              notes: it.notes,
            })),
          }));

          safeSaveTenantStorage(LOCAL_STOCK_TRANSFERS_KEY, mapped, branchId);
          return { data: mapped };
        }
      } catch (e: any) {
        // Fall through
      }
    }

    const local = safeGetTenantStorage<StockTransfer>(LOCAL_STOCK_TRANSFERS_KEY, []);
    let filtered = local;
    if (branchId && branchId !== 'ALL') {
      filtered = filtered.filter((t) => t.sourceBranchId === branchId || t.destinationBranchId === branchId);
    }
    return { data: filtered };
  }

  /**
   * Execute atomic stock transfer between branches
   */
  public async executeStockTransfer(payload: {
    sourceBranchId: string;
    destinationBranchId: string;
    transferDate?: string;
    notes?: string;
    items: Array<{ productId: string; quantity: number; unitCost?: number; notes?: string }>;
  }): Promise<{ success: boolean; transferId?: string; transferNumber?: string; error?: string }> {
    const wsId = await this.getWorkspaceId();

    if (!payload.sourceBranchId || !payload.destinationBranchId) {
      return { success: false, error: 'Source and destination branches are required.' };
    }
    if (payload.sourceBranchId === payload.destinationBranchId) {
      return { success: false, error: 'Source and destination branches must be different.' };
    }
    if (!payload.items || payload.items.length === 0) {
      return { success: false, error: 'Please add at least one item to transfer.' };
    }

    // Ensure synchronized before validating
    await this.ensureBranchInventorySynchronized();

    const branchesRes = await this.getBranches({ activeOnly: false });
    const sourceBranch = branchesRes.data.find((b) => b.id === payload.sourceBranchId);
    const destBranch = branchesRes.data.find((b) => b.id === payload.destinationBranchId);
    const sourceName = sourceBranch ? `${sourceBranch.branchName} (${sourceBranch.branchCode})` : 'Source Branch';
    const destName = destBranch ? `${destBranch.branchName} (${destBranch.branchCode})` : 'Destination Branch';

    // Step 1: Strict pre-transfer stock validation:
    // source branch stock >= requested quantity
    for (const item of payload.items) {
      const qty = Math.abs(Number(item.quantity) || 0);
      if (qty <= 0) {
        return { success: false, error: 'Transfer quantity must be greater than 0.' };
      }
      const availableStock = await this.getAuthoritativeStock(item.productId, payload.sourceBranchId);
      if (availableStock < qty) {
        return {
          success: false,
          error: `Insufficient stock in ${sourceName}. Available: ${availableStock}, Requested: ${qty}`,
        };
      }
    }

    const transferId = generateUuid();
    const trfNum = `TRF-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const transferDate = payload.transferDate || new Date().toISOString().split('T')[0];

    // Step 2: Try Remote Supabase RPC first if configured
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data, error } = await supabase.rpc('execute_stock_transfer', {
          p_payload: {
            workspace_id: wsId,
            source_branch_id: payload.sourceBranchId,
            destination_branch_id: payload.destinationBranchId,
            transfer_date: transferDate,
            transfer_number: trfNum,
            notes: payload.notes,
            items: payload.items,
          },
        });

        if (!error && data?.success) {
          // Sync local storage as well
        } else if (error) {
          const code = (error as any).code || '';
          const msg = (error as any).message || '';
          const isMissing =
            code === 'PGRST202' ||
            code === 'PGRST205' ||
            code === 'P0001' ||
            msg.includes('UNAUTHORIZED') ||
            msg.includes('Could not find the function') ||
            msg.includes('does not exist');
          if (!isMissing) {
            return { success: false, error: handleSupabaseError(error, 'executeStockTransfer') };
          }
        }
      } catch (e: any) {
        console.warn('executeStockTransfer remote RPC notice:', e);
      }
    }

    // Step 3: Local Atomic Stock Transfer Execution & Storage Synchronization
    const allBranchInv = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, []);
    const localReceipts = safeGetTenantStorage<any>(LOCAL_RECEIPTS_KEY, []);
    const localMovements = safeGetTenantStorage<any>(LOCAL_MOVEMENTS_KEY, []);
    const nowIso = new Date().toISOString();

    for (const item of payload.items) {
      const qty = Math.abs(Number(item.quantity) || 0);

      // 1. Deduct from source branch inventory
      let srcEntry = allBranchInv.find((bi) => bi.branchId === payload.sourceBranchId && bi.productId === item.productId);
      if (srcEntry) {
        srcEntry.currentStock = Math.max(0, srcEntry.currentStock - qty);
        srcEntry.updatedAt = nowIso;
      }

      // 2. Add to destination branch inventory
      let destEntry = allBranchInv.find((bi) => bi.branchId === payload.destinationBranchId && bi.productId === item.productId);
      if (!destEntry) {
        destEntry = {
          id: generateUuid(),
          workspaceId: wsId || 'default',
          branchId: payload.destinationBranchId,
          productId: item.productId,
          currentStock: qty,
          openingStock: 0,
          minStock: 0,
          reorderLevel: 0,
          status: 'Active',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        allBranchInv.push(destEntry);
      } else {
        destEntry.currentStock += qty;
        destEntry.updatedAt = nowIso;
      }

      // 3. FIFO Deduct from source receipts
      let remToDeduct = qty;
      const sourceReceipts = localReceipts
        .filter((r: any) => 
          (r.productId === item.productId || r.product_id === item.productId) && 
          (r.branchId === payload.sourceBranchId || r.branch_id === payload.sourceBranchId) && 
          Number(r.quantityRemaining ?? r.quantity_remaining) > 0
        )
        .sort((a: any, b: any) => 
          new Date(a.receivedDate || a.received_date || 0).getTime() - 
          new Date(b.receivedDate || b.received_date || 0).getTime()
        );

      let unitCost = item.unitCost;
      for (const rec of sourceReceipts) {
        if (remToDeduct <= 0) break;
        const availInRec = Number(rec.quantityRemaining ?? rec.quantity_remaining) || 0;
        const deduct = Math.min(availInRec, remToDeduct);
        if (rec.quantityRemaining !== undefined) rec.quantityRemaining -= deduct;
        if (rec.quantity_remaining !== undefined) rec.quantity_remaining -= deduct;
        rec.updatedAt = nowIso;
        rec.updated_at = nowIso;
        remToDeduct -= deduct;
        if (!unitCost && (rec.buyPrice || rec.buy_price)) {
          unitCost = Number(rec.buyPrice || rec.buy_price);
        }
      }

      // Also update in-memory store receipts if present
      if (typeof store !== 'undefined' && store?.getState) {
        const storeRecs = (store.getState().stockReceipts || [])
          .filter((r) => r.productId === item.productId && r.branchId === payload.sourceBranchId && r.quantityRemaining > 0)
          .sort((a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime());
        let storeRem = qty;
        for (const sr of storeRecs) {
          if (storeRem <= 0) break;
          const deduct = Math.min(sr.quantityRemaining, storeRem);
          sr.quantityRemaining -= deduct;
          sr.updatedAt = nowIso;
          storeRem -= deduct;
        }
      }

      // 4. Create new Stock Receipt at destination branch
      const destReceipt = {
        id: `rec-trf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        workspace_id: wsId || 'default',
        branch_id: payload.destinationBranchId,
        branchId: payload.destinationBranchId,
        product_id: item.productId,
        productId: item.productId,
        receipt_number: `REC-${trfNum}`,
        received_date: transferDate,
        quantity_received: qty,
        quantityReceived: qty,
        quantity_remaining: qty,
        quantityRemaining: qty,
        buy_price: unitCost || 0,
        buyPrice: unitCost || 0,
        notes: `Inter-branch transfer from ${sourceName} (${trfNum})`,
        created_at: nowIso,
        createdAt: nowIso,
        updated_at: nowIso,
        updatedAt: nowIso,
      };
      localReceipts.unshift(destReceipt);
      if (typeof store !== 'undefined' && store?.getState) {
        store.getState().stockReceipts?.unshift(destReceipt as any);
      }

      // 5. Add Stock Movement records for audit trail
      const movOut: any = {
        id: `mov-${Date.now()}-out-${Math.random().toString(36).slice(2, 6)}`,
        workspaceId: wsId || 'default',
        productId: item.productId,
        branchId: payload.sourceBranchId,
        type: 'TRANSFER_OUT',
        quantity: -qty,
        date: transferDate,
        referenceId: trfNum,
        referenceType: 'STOCK_TRANSFER',
        notes: `Transferred to ${destName}`,
        createdAt: nowIso,
      };
      const movIn: any = {
        id: `mov-${Date.now()}-in-${Math.random().toString(36).slice(2, 6)}`,
        workspaceId: wsId || 'default',
        productId: item.productId,
        branchId: payload.destinationBranchId,
        type: 'TRANSFER_IN',
        quantity: qty,
        date: transferDate,
        referenceId: trfNum,
        referenceType: 'STOCK_TRANSFER',
        notes: `Received from ${sourceName}`,
        createdAt: nowIso,
      };
      localMovements.unshift(movOut, movIn);
      if (typeof store !== 'undefined' && store?.getState) {
        store.getState().stockMovements?.unshift(movOut as any, movIn as any);
      }
    }

    // Save atomic storage updates
    safeSaveTenantStorage(LOCAL_BRANCH_INVENTORY_KEY, allBranchInv);
    safeSaveTenantStorage(LOCAL_RECEIPTS_KEY, localReceipts);
    safeSaveTenantStorage(LOCAL_MOVEMENTS_KEY, localMovements);

    // Save StockTransfer record
    const newTrf: StockTransfer = {
      id: transferId,
      workspaceId: wsId || 'default',
      transferNumber: trfNum,
      sourceBranchId: payload.sourceBranchId,
      sourceBranchName: sourceBranch?.branchName,
      destinationBranchId: payload.destinationBranchId,
      destinationBranchName: destBranch?.branchName,
      transferDate,
      status: 'Completed',
      notes: payload.notes,
      createdAt: nowIso,
      completedAt: nowIso,
      items: payload.items.map((it) => ({
        id: generateUuid(),
        workspaceId: wsId || 'default',
        transferId,
        productId: it.productId,
        quantity: Math.abs(Number(it.quantity) || 0),
        unitCost: it.unitCost,
        notes: it.notes,
      })),
    };

    const transfersList = safeGetTenantStorage<StockTransfer>(LOCAL_STOCK_TRANSFERS_KEY, []);
    transfersList.unshift(newTrf);
    safeSaveTenantStorage(LOCAL_STOCK_TRANSFERS_KEY, transfersList);

    // Step 4: Cache Invalidation & Event Notifications
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vistaar:stock_transferred', {
        detail: {
          transferId,
          transferNumber: trfNum,
          sourceBranchId: payload.sourceBranchId,
          destinationBranchId: payload.destinationBranchId,
        },
      }));
      window.dispatchEvent(new CustomEvent('vistaar:branch_changed', {
        detail: { branchId: payload.sourceBranchId },
      }));
    }

    return { success: true, transferId, transferNumber: trfNum };
  }

  /**
   * Helper to fetch authoritative stock for a specific branch
   */
  public async getAuthoritativeStock(productId: string, branchId?: string): Promise<number> {
    const wsId = await this.getWorkspaceId();

    // Ensure synchronized first
    await this.ensureBranchInventorySynchronized(branchId);

    if (!branchId || branchId === 'ALL') {
      const allInv = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, []);
      const matching = allInv.filter((bi) => bi.productId === productId);
      if (matching.length > 0) {
        return matching.reduce((sum, bi) => sum + (Number(bi.currentStock) || 0), 0);
      }
      const prods = safeGetTenantStorage<any>(LOCAL_PRODUCTS_KEY, []);
      const p = prods.find((prod: any) => prod.id === productId);
      return Math.max(0, Number(p?.currentStock) || 0);
    }

    if (isSupabaseConfigured() && isValidUuid(wsId) && isValidUuid(productId)) {
      try {
        const { data, error } = await supabase.rpc('get_authoritative_branch_product_stock', {
          p_product_id: productId,
          p_branch_id: branchId,
          p_workspace_id: wsId,
        });
        if (!error && typeof data === 'number') {
          return Math.max(0, data);
        }
      } catch {}

      try {
        const { data: biRow, error: biErr } = await supabase
          .from('branch_inventory')
          .select('current_stock')
          .eq('branch_id', branchId)
          .eq('product_id', productId)
          .maybeSingle();
        if (!biErr && biRow) {
          return Math.max(0, Number(biRow.current_stock) || 0);
        }
      } catch {}
    }

    const allInv = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, []);
    const entry = allInv.find((bi) => bi.branchId === branchId && bi.productId === productId);
    if (entry) {
      return Math.max(0, Number(entry.currentStock) || 0);
    }

    return 0;
  }
}

export const branchService = new BranchService();

export function getActiveBranchId(): string | undefined {
  return branchService.getActiveBranchId();
}


