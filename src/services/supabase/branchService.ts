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
   * Get all permitted branches for the current user in this workspace.
   * Owner sees all workspace branches; Staff only sees permitted branches.
   */
  public async getBranches(options?: { activeOnly?: boolean }): Promise<{ data: Branch[]; error?: string }> {
    const wsId = await this.getWorkspaceId();
    const user = supabaseAuthService.getUser();
    const isOwner = user?.role === 'owner';

    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      const local = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
      if (local.length > 0) {
        return { data: options?.activeOnly ? local.filter((b) => b.status === 'Active') : local };
      }

      // Default fallback main branch for offline mode
      const defaultBranch: Branch = {
        id: `branch-main-${wsId || 'default'}`,
        workspaceId: wsId || 'default',
        branchCode: 'MAIN',
        branchName: user?.businessName || 'Main Branch',
        branchType: 'Store',
        status: 'Active',
        isMainBranch: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      safeSaveTenantStorage(LOCAL_BRANCHES_KEY, [defaultBranch]);
      return { data: [defaultBranch] };
    }

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
      if (error) {
        const errStr = handleSupabaseError(error, 'getBranches');
        const fallback = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
        return { data: fallback, error: errStr };
      }

      const mapped: Branch[] = (data || []).map((b: any) => ({
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
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getBranches');
      const fallback = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  public async getBranchById(id: string): Promise<{ data?: Branch; error?: string }> {
    const { data: list, error } = await this.getBranches();
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

    const payload = {
      workspace_id: wsId,
      branch_code: cleanCode,
      branch_name: cleanName,
      branch_type: branch.branchType || 'Store',
      address: branch.address || null,
      city: branch.city || null,
      state: branch.state || null,
      pincode: branch.pincode || null,
      country: branch.country || 'India',
      phone: branch.phone || null,
      email: branch.email || null,
      gstin: branch.gstin || null,
      state_code: branch.stateCode || null,
      status: 'Active',
      is_main_branch: Boolean(branch.isMainBranch),
    };

    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      const newB: Branch = {
        id: `branch-${Date.now()}`,
        workspaceId: wsId,
        branchCode: branch.branchCode.toUpperCase().trim(),
        branchName: branch.branchName.trim(),
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
        isMainBranch: Boolean(branch.isMainBranch),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const list = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
      list.push(newB);
      safeSaveTenantStorage(LOCAL_BRANCHES_KEY, list);
      return { success: true, data: newB };
    }

    try {
      // If setting as main branch, demote previous main branch first
      if (branch.isMainBranch) {
        await supabase
          .from('branches')
          .update({ is_main_branch: false })
          .eq('workspace_id', wsId);
      }

      const { data, error } = await supabase.from('branches').insert([payload]).select().single();
      if (error) {
        return { success: false, error: handleSupabaseError(error, 'createBranch') };
      }

      const created: Branch = {
        id: data.id,
        workspaceId: data.workspace_id,
        branchCode: data.branch_code,
        branchName: data.branch_name,
        branchType: data.branch_type,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        country: data.country,
        phone: data.phone,
        email: data.email,
        gstin: data.gstin,
        stateCode: data.state_code,
        status: data.status,
        isMainBranch: data.is_main_branch,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      // Assign current user to this branch automatically
      const user = supabaseAuthService.getUser();
      if (user?.id) {
        await supabase.from('user_branch_access').insert([{
          workspace_id: wsId,
          user_id: user.id,
          branch_id: created.id,
          is_default: Boolean(branch.isMainBranch),
        }]);
      }

      const list = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
      list.push(created);
      safeSaveTenantStorage(LOCAL_BRANCHES_KEY, list);

      return { success: true, data: created };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'createBranch') };
    }
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

    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      const list = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
      const idx = list.findIndex((b) => b.id === id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
        safeSaveTenantStorage(LOCAL_BRANCHES_KEY, list);
        return { success: true, data: list[idx] };
      }
      return { success: false, error: 'Branch not found' };
    }

    try {
      if (updates.isMainBranch) {
        await supabase
          .from('branches')
          .update({ is_main_branch: false })
          .eq('workspace_id', wsId);
      }

      const { data, error } = await supabase
        .from('branches')
        .update(payload)
        .eq('id', id)
        .eq('workspace_id', wsId)
        .select()
        .single();

      if (error) {
        return { success: false, error: handleSupabaseError(error, 'updateBranch') };
      }

      const updated: Branch = {
        id: data.id,
        workspaceId: data.workspace_id,
        branchCode: data.branch_code,
        branchName: data.branch_name,
        branchType: data.branch_type,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        country: data.country,
        phone: data.phone,
        email: data.email,
        gstin: data.gstin,
        stateCode: data.state_code,
        status: data.status,
        isMainBranch: data.is_main_branch,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      const list = safeGetTenantStorage<Branch>(LOCAL_BRANCHES_KEY, []);
      const idx = list.findIndex((b) => b.id === id);
      if (idx !== -1) list[idx] = updated;
      safeSaveTenantStorage(LOCAL_BRANCHES_KEY, list);

      return { success: true, data: updated };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'updateBranch') };
    }
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

    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      return { success: true };
    }

    try {
      const { error } = await supabase.from('user_branch_access').upsert({
        workspace_id: wsId,
        user_id: userId,
        branch_id: branchId,
        is_default: isDefault,
      });

      if (error) return { success: false, error: handleSupabaseError(error, 'assignUserToBranch') };

      if (isDefault) {
        await supabase.from('profiles').update({ default_branch_id: branchId }).eq('id', userId);
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'assignUserToBranch') };
    }
  }

  /**
   * Fetch user branch assignments
   */
  public async getUserBranchAccessList(userId?: string): Promise<{ data: UserBranchAccess[]; error?: string }> {
    const wsId = await this.getWorkspaceId();
    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      const local = safeGetTenantStorage<UserBranchAccess>(LOCAL_USER_BRANCH_ACCESS_KEY, []);
      return { data: userId ? local.filter((a) => a.userId === userId) : local };
    }

    try {
      let query = supabase
        .from('user_branch_access')
        .select('*')
        .eq('workspace_id', wsId);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error } = await query;
      if (error) {
        return { data: [], error: handleSupabaseError(error, 'getUserBranchAccessList') };
      }

      const mapped: UserBranchAccess[] = (data || []).map((row: any) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        userId: row.user_id,
        branchId: row.branch_id,
        isDefault: Boolean(row.is_default),
        createdAt: row.created_at,
      }));

      return { data: mapped };
    } catch (e: any) {
      return { data: [], error: handleSupabaseError(e, 'getUserBranchAccessList') };
    }
  }

  /**
   * Set user branch access in bulk
   */
  public async setUserBranchAccesses(userId: string, branchIds: string[]): Promise<{ success: boolean; error?: string }> {
    const wsId = await this.getWorkspaceId();
    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      const local = safeGetTenantStorage<UserBranchAccess>(LOCAL_USER_BRANCH_ACCESS_KEY, []);
      const filtered = local.filter((a) => a.userId !== userId);
      branchIds.forEach((bId, idx) => {
        filtered.push({
          id: `uba-${Date.now()}-${idx}`,
          workspaceId: wsId,
          userId,
          branchId: bId,
          isDefault: idx === 0,
          createdAt: new Date().toISOString(),
        });
      });
      safeSaveTenantStorage(LOCAL_USER_BRANCH_ACCESS_KEY, filtered);
      return { success: true };
    }

    try {
      // Delete existing branch access for this user in workspace
      await supabase
        .from('user_branch_access')
        .delete()
        .eq('workspace_id', wsId)
        .eq('user_id', userId);

      if (branchIds.length > 0) {
        const rows = branchIds.map((bId, idx) => ({
          workspace_id: wsId,
          user_id: userId,
          branch_id: bId,
          is_default: idx === 0,
        }));

        const { error } = await supabase.from('user_branch_access').insert(rows);
        if (error) {
          return { success: false, error: handleSupabaseError(error, 'setUserBranchAccesses') };
        }
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'setUserBranchAccesses') };
    }
  }

  /**
   * Fetch Branch-specific inventory
   */
  public async getBranchInventory(branchId?: string, productId?: string): Promise<{ data: BranchInventory[]; error?: string }> {
    const wsId = await this.getWorkspaceId();
    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      const local = safeGetTenantStorage<BranchInventory>(LOCAL_BRANCH_INVENTORY_KEY, [], branchId);
      return { data: local };
    }

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
      if (error) {
        return { data: [], error: handleSupabaseError(error, 'getBranchInventory') };
      }

      const mapped: BranchInventory[] = (data || []).map((row: any) => ({
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
    } catch (e: any) {
      return { data: [], error: handleSupabaseError(e, 'getBranchInventory') };
    }
  }

  /**
   * Fetch Stock Transfers
   */
  public async getStockTransfers(branchId?: string): Promise<{ data: StockTransfer[]; error?: string }> {
    const wsId = await this.getWorkspaceId();

    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      const local = safeGetTenantStorage<StockTransfer>(LOCAL_STOCK_TRANSFERS_KEY, [], branchId);
      return { data: local };
    }

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
      if (error) {
        return { data: [], error: handleSupabaseError(error, 'getStockTransfers') };
      }

      const mapped: StockTransfer[] = (data || []).map((row: any) => ({
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
    } catch (e: any) {
      return { data: [], error: handleSupabaseError(e, 'getStockTransfers') };
    }
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

    if (payload.sourceBranchId === payload.destinationBranchId) {
      return { success: false, error: 'Source and destination branches must be different.' };
    }
    if (!payload.items || payload.items.length === 0) {
      return { success: false, error: 'Please add at least one item to transfer.' };
    }

    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      const trfNum = `TRF-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
      const localTrf: StockTransfer = {
        id: `trf-${Date.now()}`,
        workspaceId: wsId,
        transferNumber: trfNum,
        sourceBranchId: payload.sourceBranchId,
        destinationBranchId: payload.destinationBranchId,
        transferDate: payload.transferDate || new Date().toISOString().split('T')[0],
        status: 'Completed',
        notes: payload.notes,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        items: payload.items.map((it) => ({
          id: `item-${Date.now()}-${Math.random()}`,
          workspaceId: wsId,
          productId: it.productId,
          quantity: it.quantity,
          unitCost: it.unitCost,
          notes: it.notes,
        })),
      };
      const list = safeGetTenantStorage<StockTransfer>(LOCAL_STOCK_TRANSFERS_KEY, []);
      list.unshift(localTrf);
      safeSaveTenantStorage(LOCAL_STOCK_TRANSFERS_KEY, list);
      return { success: true, transferId: localTrf.id, transferNumber: trfNum };
    }

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

      if (error) {
        return { success: false, error: handleSupabaseError(error, 'executeStockTransfer') };
      }

      if (!data?.success) {
        return { success: false, error: data?.message || 'Stock transfer failed.' };
      }

      return {
        success: true,
        transferId: data.transfer_id,
        transferNumber: data.transfer_number,
      };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'executeStockTransfer') };
    }
  }

  /**
   * Helper to fetch authoritative stock for a specific branch
   */
  public async getAuthoritativeStock(productId: string, branchId?: string): Promise<number> {
    const wsId = await this.getWorkspaceId();
    if (!isSupabaseConfigured() || !isValidUuid(wsId)) {
      return 0;
    }

    try {
      const { data, error } = await supabase.rpc('get_authoritative_branch_product_stock', {
        p_product_id: productId,
        p_branch_id: branchId && branchId !== 'ALL' ? branchId : null,
        p_workspace_id: wsId,
      });

      if (!error && typeof data === 'number') {
        return data;
      }
      return 0;
    } catch {
      return 0;
    }
  }
}

export const branchService = new BranchService();
