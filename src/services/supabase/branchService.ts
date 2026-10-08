import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Branch, UserBranchAccess, BranchInventory, StockTransfer, StockTransferItem } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { auditLogService } from './auditLogService';

const LOCAL_BRANCHES_KEY = 'vistaar_local_branches_db';
const LOCAL_USER_BRANCH_ACCESS_KEY = 'vistaar_local_user_branch_access_db';
const LOCAL_BRANCH_INVENTORY_KEY = 'vistaar_local_branch_inventory_db';
const LOCAL_STOCK_TRANSFERS_KEY = 'vistaar_local_stock_transfers_db';

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
            createdAt: b.created_at,
            updatedAt: b.updated_at,
          }));

          safeSaveTenantStorage(LOCAL_BRANCHES_KEY, mapped);
          return { data: mapped };
        }
      } catch (e: any) {
        // Fall through to local tenant storage
      }
    }

    // Local tenant storage fallback
    const local = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
    const guaranteed = this.getOrCreateDefaultMainBranch(local, wsId);
    const filtered = options?.activeOnly !== false ? guaranteed.filter((b) => b.status === 'Active') : guaranteed;
    return { data: filtered };
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
  public async createBranch(branch: Partial<Branch>): Promise<{ success: boolean; data?: Branch; error?: string }> {
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

        const payload = {
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
   * Fetch Branch-specific inventory
   */
  public async getBranchInventory(branchId?: string, productId?: string): Promise<{ data: BranchInventory[]; error?: string }> {
    const wsId = await this.getWorkspaceId();

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
        console.warn('Supabase getBranchInventory note:', e);
      }
    }

    // Local tenant storage fallback
    let allInv = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, []);
    const prods = safeGetTenantStorage<any>('vistaar_local_products_db', []);
    const branches = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
    const mainBranch = branches.find((b) => b.isMainBranch) || branches[0];

    // If local inventory is empty, initialize for Main Branch from products
    if (allInv.length === 0 && mainBranch && prods.length > 0) {
      allInv = prods.map((p: any) => ({
        id: generateUuid(),
        workspaceId: wsId || 'default',
        branchId: mainBranch.id,
        productId: p.id,
        currentStock: Math.max(0, Number(p.currentStock) || 0),
        openingStock: Math.max(0, Number(p.currentStock) || 0),
        minStock: Number(p.minStock ?? p.minimumStock) || 0,
        rackLocation: p.location,
        purchasePrice: p.buyPrice ? Number(p.buyPrice) : undefined,
        sellingPrice: p.sellingPrice ? Number(p.sellingPrice) : undefined,
        status: 'Active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      safeSaveTenantStorage(LOCAL_BRANCH_INVENTORY_KEY, allInv);
    }

    let filtered = allInv;
    if (branchId && branchId !== 'ALL') {
      filtered = filtered.filter((bi) => bi.branchId === branchId);
    }
    if (productId) {
      filtered = filtered.filter((bi) => bi.productId === productId);
    }

    const prodMap = new Map<string, any>(prods.map((p: any) => [p.id, p]));
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

    // Step 2: Try Remote Supabase RPC first if configured
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data, error } = await supabase.rpc('execute_stock_transfer', {
          p_payload: {
            workspace_id: wsId,
            source_branch_id: payload.sourceBranchId,
            destination_branch_id: payload.destinationBranchId,
            transfer_date: payload.transferDate || new Date().toISOString().split('T')[0],
            notes: payload.notes,
            items: payload.items,
          },
        });

        if (!error && data?.success) {
          return {
            success: true,
            transferId: data.transfer_id,
            transferNumber: data.transfer_number,
          };
        } else if (error) {
          const code = (error as any).code || '';
          const msg = (error as any).message || '';
          const isMissing = code === 'PGRST202' || msg.includes('Could not find the function') || msg.includes('does not exist');
          if (!isMissing) {
            return { success: false, error: handleSupabaseError(error, 'executeStockTransfer') };
          }
        }
      } catch (e: any) {
        console.warn('executeStockTransfer remote RPC notice:', e);
      }
    }

    // Step 3: Local Atomic Stock Transfer Execution
    const transferId = generateUuid();
    const trfNum = `TRF-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const transferDate = payload.transferDate || new Date().toISOString().split('T')[0];

    const allBranchInv = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, []);

    for (const item of payload.items) {
      const qty = Math.abs(Number(item.quantity) || 0);

      // 1. Deduct from source branch
      let srcEntry: BranchInventory | undefined = allBranchInv.find((bi) => bi.branchId === payload.sourceBranchId && bi.productId === item.productId);
      if (!srcEntry) {
        const prods = safeGetTenantStorage<any>('vistaar_local_products_db', []);
        const p = prods.find((prod: any) => prod.id === item.productId);
        srcEntry = {
          id: generateUuid(),
          workspaceId: wsId || 'default',
          branchId: payload.sourceBranchId,
          productId: item.productId,
          currentStock: Math.max(0, Number(p?.currentStock) || 0),
          openingStock: Math.max(0, Number(p?.currentStock) || 0),
          minStock: 0,
          status: 'Active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        allBranchInv.push(srcEntry);
      }
      if (srcEntry) {
        srcEntry.currentStock = Math.max(0, srcEntry.currentStock - qty);
        srcEntry.updatedAt = new Date().toISOString();
      }

      // 2. Add to destination branch
      let destEntry: BranchInventory | undefined = allBranchInv.find((bi) => bi.branchId === payload.destinationBranchId && bi.productId === item.productId);
      if (!destEntry) {
        destEntry = {
          id: generateUuid(),
          workspaceId: wsId || 'default',
          branchId: payload.destinationBranchId,
          productId: item.productId,
          currentStock: 0,
          openingStock: 0,
          minStock: 0,
          status: 'Active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        allBranchInv.push(destEntry);
      }
      if (destEntry) {
        destEntry.currentStock += qty;
        destEntry.updatedAt = new Date().toISOString();
      }
    }

    safeSaveTenantStorage(LOCAL_BRANCH_INVENTORY_KEY, allBranchInv);

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
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
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

    return { success: true, transferId, transferNumber: trfNum };
  }

  /**
   * Helper to fetch authoritative stock for a specific branch
   */
  public async getAuthoritativeStock(productId: string, branchId?: string): Promise<number> {
    const wsId = await this.getWorkspaceId();

    if (!branchId || branchId === 'ALL') {
      const allInv = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, []);
      const matching = allInv.filter((bi) => bi.productId === productId);
      if (matching.length > 0) {
        return matching.reduce((sum, bi) => sum + (Number(bi.currentStock) || 0), 0);
      }
      const prods = safeGetTenantStorage<any>('vistaar_local_products_db', []);
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

    const branches = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
    const b = branches.find((branch) => branch.id === branchId);
    if (b?.isMainBranch) {
      const prods = safeGetTenantStorage<any>('vistaar_local_products_db', []);
      const p = prods.find((prod: any) => prod.id === productId);
      return Math.max(0, Number(p?.currentStock) || 0);
    }

    return 0;
  }
}

export const branchService = new BranchService();

