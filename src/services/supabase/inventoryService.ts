import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { StockReceipt, StockMovement } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { hasCurrentUserPermission, AuthorizationError } from '../../lib/permissions';
import { auditLogService } from './auditLogService';
import { safeGetTenantStorage, safeSaveTenantStorage, safeGetTenantItem } from './safeStorage';

const LOCAL_RECEIPTS_KEY = 'vistaar_local_stock_receipts';
const LOCAL_MOVEMENTS_KEY = 'vistaar_local_stock_movements';

const safeStorageGet = (key: string): any[] => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return [];
};

const safeStorageSave = (key: string, items: any[]): void => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(items));
    }
  } catch (e) {
    // ignore
  }
};

export class InventoryService {
  private getWorkspaceId(): string {
    const wsId = supabaseAuthService.getCurrentCompanyId();
    const userId = supabaseAuthService.getUser()?.id;
    if (isValidUuid(wsId) && wsId !== userId) return wsId;
    return '';
  }

  public async getOrFetchWorkspaceId(): Promise<string> {
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) {
        return authWsId;
      }
    } catch (e) {
      console.warn('Failed to get authoritative workspace ID in inventoryService:', e);
    }
    return '';
  }

  public async getInventorySettings(): Promise<{ success: boolean; data?: { usesPartNumber: boolean | null } }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase.from('inventory_settings').select('*').eq('workspace_id', wsId).single();
      if (error) {
        handleSupabaseError(error, 'getInventorySettings');
        return { success: true, data: { usesPartNumber: true } };
      }
      if (!data) return { success: true, data: { usesPartNumber: null } };
      return { success: true, data: { usesPartNumber: data.uses_part_number } };
    } catch (e: any) {
      handleSupabaseError(e, 'getInventorySettings');
      return { success: true, data: { usesPartNumber: true } };
    }
  }

  public async updateInventorySettings(settings: { usesPartNumber: boolean }): Promise<{ success: boolean }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase.from('inventory_settings').upsert({
        workspace_id: wsId,
        uses_part_number: settings.usesPartNumber,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        handleSupabaseError(error, 'updateInventorySettings');
      }
      return { success: true };
    } catch (e: any) {
      handleSupabaseError(e, 'updateInventorySettings');
      return { success: true };
    }
  }

  public async getStockReceipts(productId?: string): Promise<{ data: any[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    let query = supabase.from('stock_receipts').select('*').eq('workspace_id', wsId);
    if (productId) query = query.eq('product_id', productId);

    try {
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        const errStr = handleSupabaseError(error, 'getStockReceipts');
        const local = safeStorageGet(LOCAL_RECEIPTS_KEY);
        const filtered = productId ? local.filter((r) => r.productId === productId || r.product_id === productId) : local;
        return { data: filtered, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getStockReceipts');
      const local = safeStorageGet(LOCAL_RECEIPTS_KEY);
      const filtered = productId ? local.filter((r) => r.productId === productId || r.product_id === productId) : local;
      return { data: filtered, error: errStr };
    }
  }

  public async createStockReceipt(receipt: Partial<StockReceipt>): Promise<{ receipt?: any; error?: string }> {
    const wsId = this.getWorkspaceId();
    const qty = Number(receipt.quantityReceived) || 0;

    let targetBranchId = receipt.branchId;
    if (!targetBranchId) {
      try {
        const saved = safeGetTenantItem<string | null>('active_branch_id', null);
        if (saved && saved !== 'ALL') {
          targetBranchId = saved;
        } else {
          const branches = safeGetTenantStorage<any>('vistaar_local_branches_db', []);
          const main = branches.find((b: any) => b.isMainBranch) || branches[0];
          if (main) targetBranchId = main.id;
        }
      } catch {}
    }

    const payload: any = {
      workspace_id: wsId,
      product_id: receipt.productId,
      supplier_id: receipt.supplierId || null,
      branch_id: targetBranchId || null,
      receipt_number: receipt.receiptNumber || `GRN-${Date.now()}`,
      purchase_order_number: receipt.purchaseOrderNumber || null,
      received_date: receipt.receivedDate || new Date().toISOString().split('T')[0],
      quantity_received: qty,
      quantity_remaining: receipt.quantityRemaining ?? qty,
      buy_price: receipt.buyPrice,
      notes: receipt.notes || null,
    };

    const updateLocalBranchInventory = (pId: string, bId: string, addedQty: number) => {
      try {
        const allBInv = safeGetTenantStorage<any>('vistaar_local_branch_inventory_db', []);
        let rec = allBInv.find((bi: any) => (bi.branchId || bi.branch_id) === bId && (bi.productId || bi.product_id) === pId);
        if (rec) {
          rec.currentStock = Math.max(0, (Number(rec.currentStock ?? rec.current_stock) || 0) + addedQty);
          rec.current_stock = rec.currentStock;
          rec.updatedAt = new Date().toISOString();
        } else {
          allBInv.push({
            id: `bi-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            workspaceId: wsId,
            branchId: bId,
            productId: pId,
            currentStock: addedQty,
            current_stock: addedQty,
            openingStock: 0,
            status: 'Active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        safeSaveTenantStorage('vistaar_local_branch_inventory_db', allBInv);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vistaar:branch_inventory_updated', { detail: { branchId: bId, productId: pId } }));
        }
      } catch (e) {
        console.warn('Failed to update local branch inventory on stock receipt:', e);
      }
    };

    try {
      const { data, error } = await supabase
        .from('stock_receipts')
        .insert([payload])
        .select()
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createStockReceipt');
        const newReceipt = { id: `rec-${Date.now()}`, ...payload, branchId: targetBranchId, createdAt: new Date().toISOString() };
        const local = safeStorageGet(LOCAL_RECEIPTS_KEY);
        local.unshift(newReceipt);
        safeStorageSave(LOCAL_RECEIPTS_KEY, local);

        const tenantRecs = safeGetTenantStorage<any>('vistaar_local_stock_receipts_db', []);
        tenantRecs.unshift(newReceipt);
        safeSaveTenantStorage('vistaar_local_stock_receipts_db', tenantRecs);

        if (receipt.productId && targetBranchId) {
          updateLocalBranchInventory(receipt.productId, targetBranchId, qty);
        }

        if (receipt.productId) {
          await auditLogService.logInventoryMutation({
            productId: receipt.productId,
            movementType: 'STOCK_RECEIVED',
            quantityDelta: qty,
            previousQuantity: 0,
            resultingQuantity: qty,
            referenceType: 'STOCK_RECEIPT',
            referenceId: payload.receipt_number,
            reason: receipt.notes || 'Goods Received Note',
          });
        }

        return { receipt: newReceipt };
      }

      if (data && data.product_id) {
        // Also update products table current_stock in Supabase
        const { data: recs } = await supabase
          .from('stock_receipts')
          .select('quantity_remaining')
          .eq('workspace_id', wsId)
          .eq('product_id', data.product_id);
        if (recs) {
          const sum = recs.reduce((acc: number, r: { quantity_remaining?: number | string | null }) => acc + (Number(r.quantity_remaining) || 0), 0);
          await supabase.from('products').update({ current_stock: sum, updated_at: new Date().toISOString() }).eq('id', data.product_id).eq('workspace_id', wsId);
        }

        // Branch-specific inventory increment
        if (targetBranchId) {
          const { data: bInv } = await supabase
            .from('branch_inventory')
            .select('current_stock')
            .eq('workspace_id', wsId)
            .eq('branch_id', targetBranchId)
            .eq('product_id', data.product_id)
            .maybeSingle();

          const prevBranchStock = bInv ? Number(bInv.current_stock) || 0 : 0;
          await supabase.from('branch_inventory').upsert({
            workspace_id: wsId,
            branch_id: targetBranchId,
            product_id: data.product_id,
            current_stock: prevBranchStock + qty,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'branch_id,product_id' });

          updateLocalBranchInventory(data.product_id, targetBranchId, qty);
        }

        await auditLogService.logInventoryMutation({
          productId: data.product_id,
          movementType: 'STOCK_RECEIVED',
          quantityDelta: qty,
          previousQuantity: 0,
          resultingQuantity: qty,
          referenceType: 'STOCK_RECEIPT',
          referenceId: data.receipt_number || payload.receipt_number,
          reason: receipt.notes || 'Goods Received Note',
        });
      }
      return { receipt: data };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createStockReceipt');
      const newReceipt = { id: `rec-${Date.now()}`, ...payload, branchId: targetBranchId, createdAt: new Date().toISOString() };
      const local = safeStorageGet(LOCAL_RECEIPTS_KEY);
      local.unshift(newReceipt);
      safeStorageSave(LOCAL_RECEIPTS_KEY, local);

      const tenantRecs = safeGetTenantStorage<any>('vistaar_local_stock_receipts_db', []);
      tenantRecs.unshift(newReceipt);
      safeSaveTenantStorage('vistaar_local_stock_receipts_db', tenantRecs);

      if (receipt.productId && targetBranchId) {
        updateLocalBranchInventory(receipt.productId, targetBranchId, qty);
      }

      if (receipt.productId) {
        await auditLogService.logInventoryMutation({
          productId: receipt.productId,
          movementType: 'STOCK_RECEIVED',
          quantityDelta: qty,
          previousQuantity: 0,
          resultingQuantity: qty,
          referenceType: 'STOCK_RECEIPT',
          referenceId: payload.receipt_number,
          reason: receipt.notes || 'Goods Received Note',
        });
      }

      return { receipt: newReceipt };
    }
  }

  public async addStockReceipt(receipt: Partial<StockReceipt>): Promise<{ success: boolean; data?: any; error?: string }> {
    const res = await this.createStockReceipt(receipt);
    if (!res.receipt) return { success: false, error: res.error || 'Failed to add stock receipt.' };
    return { success: true, data: res.receipt };
  }

  public async getStockMovements(productId?: string): Promise<{ data: any[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    let query = supabase.from('stock_movements').select('*').eq('workspace_id', wsId);
    if (productId) query = query.eq('product_id', productId);

    try {
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        const errStr = handleSupabaseError(error, 'getStockMovements');
        const local = safeStorageGet(LOCAL_MOVEMENTS_KEY);
        const filtered = productId ? local.filter((m) => m.productId === productId || m.product_id === productId) : local;
        return { data: filtered, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getStockMovements');
      const local = safeStorageGet(LOCAL_MOVEMENTS_KEY);
      const filtered = productId ? local.filter((m) => m.productId === productId || m.product_id === productId) : local;
      return { data: filtered, error: errStr };
    }
  }

  /**
   * Delete Stock Movement (Owner-only operation)
   */
  public async deleteStockMovement(id: string): Promise<{ success: boolean; error?: string }> {
    if (!supabaseAuthService.isOwner()) {
      return {
        success: false,
        error: 'Permission Denied: Deletion of stock movements is strictly restricted to Business Owners.',
      };
    }

    if (!isSupabaseConfigured()) {
      const local = safeStorageGet(LOCAL_MOVEMENTS_KEY);
      const updated = local.filter((m) => m.id !== id);
      safeStorageSave(LOCAL_MOVEMENTS_KEY, updated);
      return { success: true };
    }

    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase.from('stock_movements').delete().eq('workspace_id', wsId).eq('id', id);
      if (error) {
        return { success: false, error: handleSupabaseError(error, 'deleteStockMovement') };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'deleteStockMovement') };
    }
  }

  /**
   * Delete Stock Receipt (Owner-only operation)
   */
  public async deleteStockReceipt(id: string): Promise<{ success: boolean; error?: string }> {
    if (!supabaseAuthService.isOwner()) {
      return {
        success: false,
        error: 'Permission Denied: Deletion of stock receipts is strictly restricted to Business Owners.',
      };
    }

    if (!isSupabaseConfigured()) {
      const local = safeStorageGet(LOCAL_RECEIPTS_KEY);
      const updated = local.filter((r) => r.id !== id);
      safeStorageSave(LOCAL_RECEIPTS_KEY, updated);
      return { success: true };
    }

    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase.from('stock_receipts').delete().eq('workspace_id', wsId).eq('id', id);
      if (error) {
        return { success: false, error: handleSupabaseError(error, 'deleteStockReceipt') };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'deleteStockReceipt') };
    }
  }
}

export const inventoryService = new InventoryService();
