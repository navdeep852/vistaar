import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { PurchaseOrderReceipt, PurchaseOrderStatus } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { purchaseOrderService } from './purchaseOrderService';
import { inventoryService } from './inventoryService';
import { productService } from './productService';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_GRNS_KEY = 'vistaar_local_purchase_order_receipts';

export interface PostReceiptPayloadItem {
  purchaseOrderItemId: string;
  productId: string;
  receiveQuantity: number;
}

export class PurchaseOrderReceiptService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async generateReceiptNumber(): Promise<string> {
    const wsId = this.getWorkspaceId();
    const year = new Date().getFullYear();
    const prefix = `GRN-${year}-`;

    if (!isSupabaseConfigured()) {
      const local = safeGetTenantStorage<any>(LOCAL_GRNS_KEY, []);
      return `${prefix}${(local.length + 1).toString().padStart(5, '0')}`;
    }

    try {
      const { data } = await supabase
        .from('purchase_order_receipts')
        .select('receipt_number')
        .eq('workspace_id', wsId)
        .ilike('receipt_number', `${prefix}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!data || data.length === 0) return `${prefix}00001`;

      const lastNoStr = data[0].receipt_number.replace(prefix, '');
      const lastNo = parseInt(lastNoStr, 10);
      const nextNo = isNaN(lastNo) ? 1 : lastNo + 1;
      return `${prefix}${nextNo.toString().padStart(5, '0')}`;
    } catch {
      return `${prefix}${Date.now().toString().slice(-5)}`;
    }
  }

  public async postGoodsReceipt(payload: {
    purchaseOrderId: string;
    receiptDate?: string;
    notes?: string;
    items: PostReceiptPayloadItem[];
  }): Promise<{ success: boolean; receipt?: PurchaseOrderReceipt; error?: string }> {
    const wsId = this.getWorkspaceId();

    // 1. Fetch current PO details
    const poRes = await purchaseOrderService.getPurchaseOrderById(payload.purchaseOrderId);
    if (poRes.error || !poRes.data) {
      return { success: false, error: poRes.error || 'Purchase Order not found.' };
    }

    const po = poRes.data;

    // Validate status: Can only receive on CONFIRMED or PARTIALLY_RECEIVED POs
    if (po.status !== 'CONFIRMED' && po.status !== 'PARTIALLY_RECEIVED') {
      return {
        success: false,
        error: `Cannot receive stock for Purchase Order in '${po.status}' state. Only CONFIRMED or PARTIALLY_RECEIVED POs can receive stock.`,
      };
    }

    const itemsToProcess = payload.items.filter((it) => it.receiveQuantity > 0);
    if (itemsToProcess.length === 0) {
      return { success: false, error: 'Please enter a valid quantity greater than 0 to receive stock.' };
    }

    // 2. Validate over-receiving for each line item
    for (const itemInput of itemsToProcess) {
      const poItem = (po.items || []).find((i) => i.id === itemInput.purchaseOrderItemId);
      if (!poItem) {
        return { success: false, error: `PO item not found for product ID ${itemInput.productId}` };
      }

      const pendingQty = Math.max(0, poItem.quantity - (poItem.receivedQuantity || 0));
      if (itemInput.receiveQuantity > pendingQty) {
        return {
          success: false,
          error: `Cannot receive ${itemInput.receiveQuantity} units for product '${poItem.productName}'. Maximum pending quantity allowed is ${pendingQty} units.`,
        };
      }
    }

    const receiptNumber = await this.generateReceiptNumber();
    const receiptDate = payload.receiptDate || new Date().toISOString().split('T')[0];

    if (!isSupabaseConfigured()) {
      const local = safeGetTenantStorage<any>(LOCAL_GRNS_KEY, []);
      const newGrn = {
        id: `grn-${Date.now()}`,
        workspaceId: wsId,
        purchaseOrderId: payload.purchaseOrderId,
        receiptNumber,
        receiptDate,
        notes: payload.notes,
        status: 'POSTED',
        createdAt: new Date().toISOString(),
      };
      local.unshift(newGrn);
      safeSaveTenantStorage(LOCAL_GRNS_KEY, local);

      // Increment inventory for each item
      for (const itemInput of itemsToProcess) {
        const poItem = (po.items || []).find((i) => i.id === itemInput.purchaseOrderItemId);
        if (poItem) {
          poItem.receivedQuantity = (poItem.receivedQuantity || 0) + itemInput.receiveQuantity;
          await inventoryService.createStockReceipt({
            productId: poItem.productId,
            supplierId: po.supplierId,
            receiptNumber,
            purchaseOrderNumber: po.poNumber,
            quantityReceived: itemInput.receiveQuantity,
            quantityRemaining: itemInput.receiveQuantity,
            buyPrice: poItem.unitPrice,
            notes: `PO ${po.poNumber} Goods Receipt ${receiptNumber}`,
          });
        }
      }

      // Recalculate status
      const totalOrdered = (po.items || []).reduce((acc, i) => acc + i.quantity, 0);
      const totalReceived = (po.items || []).reduce((acc, i) => acc + (i.receivedQuantity || 0), 0);
      const newStatus: PurchaseOrderStatus = totalReceived >= totalOrdered ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED';
      await purchaseOrderService.updatePoStatus(po.id!, newStatus, `Received stock via GRN ${receiptNumber}`);

      return { success: true, receipt: newGrn as any };
    }

    try {
      // Create Purchase Order Receipt header
      const { data: receiptRecord, error: grnErr } = await supabase
        .from('purchase_order_receipts')
        .insert([
          {
            workspace_id: wsId,
            purchase_order_id: payload.purchaseOrderId,
            receipt_number: receiptNumber,
            receipt_date: receiptDate,
            received_by: supabaseAuthService.getUser()?.id || null,
            notes: payload.notes || null,
            status: 'POSTED',
          },
        ])
        .select()
        .single();

      if (grnErr || !receiptRecord) {
        return { success: false, error: handleSupabaseError(grnErr, 'postGoodsReceipt - create header') };
      }

      const receiptItemsPayload: any[] = [];

      for (const itemInput of itemsToProcess) {
        const poItem = (po.items || []).find((i) => i.id === itemInput.purchaseOrderItemId);
        if (!poItem) continue;

        const prevReceived = poItem.receivedQuantity || 0;
        const newTotalReceived = prevReceived + itemInput.receiveQuantity;

        receiptItemsPayload.push({
          receipt_id: receiptRecord.id,
          purchase_order_item_id: poItem.id,
          product_id: poItem.productId,
          ordered_quantity: poItem.quantity,
          previously_received_quantity: prevReceived,
          received_quantity: itemInput.receiveQuantity,
        });

        // 1. Update purchase_order_items received_quantity
        await supabase
          .from('purchase_order_items')
          .update({ received_quantity: newTotalReceived, updated_at: new Date().toISOString() })
          .eq('id', poItem.id);

        // 2. THIS IS THE CRITICAL INVENTORY INCREMENT RULE
        // Create stock_receipt in inventoryService to update products.current_stock
        await inventoryService.createStockReceipt({
          productId: poItem.productId,
          supplierId: po.supplierId,
          receiptNumber,
          purchaseOrderNumber: po.poNumber,
          receivedDate: receiptDate,
          quantityReceived: itemInput.receiveQuantity,
          quantityRemaining: itemInput.receiveQuantity,
          buyPrice: poItem.unitPrice,
          notes: `Goods Receipt ${receiptNumber} for PO ${po.poNumber}`,
        });
      }

      if (receiptItemsPayload.length > 0) {
        await supabase.from('purchase_order_receipt_items').insert(receiptItemsPayload);
      }

      // Invalidate product cache so updated current_stock is immediately visible across UI
      productService.invalidateCache();

      // Recalculate PO Status
      const { data: updatedPoRes } = await purchaseOrderService.getPurchaseOrderById(payload.purchaseOrderId);
      if (updatedPoRes && updatedPoRes.items) {
        const totalOrdered = updatedPoRes.items.reduce((acc, i) => acc + i.quantity, 0);
        const totalReceived = updatedPoRes.items.reduce((acc, i) => acc + (i.receivedQuantity || 0), 0);

        let newStatus: PurchaseOrderStatus = 'PARTIALLY_RECEIVED';
        if (totalReceived >= totalOrdered) {
          newStatus = 'FULLY_RECEIVED';
        }

        await purchaseOrderService.updatePoStatus(
          payload.purchaseOrderId,
          newStatus,
          `Received ${itemsToProcess.reduce((a, b) => a + b.receiveQuantity, 0)} units via Goods Receipt ${receiptNumber}`
        );
      }

      return { success: true, receipt: receiptRecord as any };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'postGoodsReceipt') };
    }
  }
}

export const purchaseOrderReceiptService = new PurchaseOrderReceiptService();
