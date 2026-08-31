import { supabase } from '../../lib/supabase';
import { StockReceipt, StockMovement } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

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
    return supabaseAuthService.getCurrentCompanyId();
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
    const payload = {
      workspace_id: wsId,
      product_id: receipt.productId,
      supplier_id: receipt.supplierId || null,
      receipt_number: receipt.receiptNumber || `GRN-${Date.now()}`,
      purchase_order_number: receipt.purchaseOrderNumber || null,
      received_date: receipt.receivedDate || new Date().toISOString().split('T')[0],
      quantity_received: receipt.quantityReceived,
      quantity_remaining: receipt.quantityRemaining ?? receipt.quantityReceived,
      buy_price: receipt.buyPrice,
      notes: receipt.notes || null,
    };

    try {
      const { data, error } = await supabase
        .from('stock_receipts')
        .insert([payload])
        .select()
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createStockReceipt');
        if (errStr.startsWith('Network Error')) {
          const newReceipt = { id: `rec-${Date.now()}`, ...payload, createdAt: new Date().toISOString() };
          const local = safeStorageGet(LOCAL_RECEIPTS_KEY);
          local.unshift(newReceipt);
          safeStorageSave(LOCAL_RECEIPTS_KEY, local);
          return { receipt: newReceipt };
        }
        return { error: errStr };
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
      }
      return { receipt: data };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createStockReceipt');
      const newReceipt = { id: `rec-${Date.now()}`, ...payload, createdAt: new Date().toISOString() };
      const local = safeStorageGet(LOCAL_RECEIPTS_KEY);
      local.unshift(newReceipt);
      safeStorageSave(LOCAL_RECEIPTS_KEY, local);
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
}

export const inventoryService = new InventoryService();
