import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseOrderFilterOptions,
  PurchaseOrderStatusHistory,
} from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_POS_KEY = 'vistaar_local_purchase_orders';
const LOCAL_PO_ITEMS_KEY = 'vistaar_local_purchase_order_items';
const LOCAL_PO_HISTORY_KEY = 'vistaar_local_purchase_order_history';

// Allowed State Machine Matrix
const ALLOWED_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['FULLY_RECEIVED'],
  FULLY_RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export class PurchaseOrderService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public validateStatusTransition(currentStatus: PurchaseOrderStatus, newStatus: PurchaseOrderStatus): { valid: boolean; reason?: string } {
    if (currentStatus === newStatus) return { valid: true };
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      return {
        valid: false,
        reason: `Cannot transition Purchase Order from '${currentStatus}' to '${newStatus}'. Allowed next states: ${allowed.join(', ') || 'None'}.`,
      };
    }
    return { valid: true };
  }

  public async generatePoNumber(): Promise<string> {
    const wsId = this.getWorkspaceId();
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;

    if (!isSupabaseConfigured()) {
      const local = safeGetTenantStorage<PurchaseOrder>(LOCAL_POS_KEY, []);
      const count = local.length + 1;
      return `${prefix}${count.toString().padStart(5, '0')}`;
    }

    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .eq('workspace_id', wsId)
        .ilike('po_number', `${prefix}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        return `${prefix}00001`;
      }

      const lastNoStr = data[0].po_number.replace(prefix, '');
      const lastNo = parseInt(lastNoStr, 10);
      const nextNo = isNaN(lastNo) ? 1 : lastNo + 1;
      return `${prefix}${nextNo.toString().padStart(5, '0')}`;
    } catch {
      return `${prefix}${Date.now().toString().slice(-5)}`;
    }
  }

  public async getPurchaseOrders(options?: PurchaseOrderFilterOptions): Promise<{ data: PurchaseOrder[]; count: number; error?: string }> {
    const wsId = this.getWorkspaceId();

    if (!isSupabaseConfigured()) {
      let local = safeGetTenantStorage<PurchaseOrder>(LOCAL_POS_KEY, []);
      if (options?.status && options.status !== 'ALL') {
        local = local.filter((po) => po.status === options.status);
      }
      if (options?.search) {
        const q = options.search.toLowerCase();
        local = local.filter(
          (po) =>
            po.poNumber.toLowerCase().includes(q) ||
            (po.supplierName && po.supplierName.toLowerCase().includes(q)) ||
            (po.notes && po.notes.toLowerCase().includes(q))
        );
      }
      return { data: local, count: local.length };
    }

    try {
      let query = supabase
        .from('purchase_orders')
        .select('*, suppliers(id, name, phone, gstin, address), purchase_order_items(*)', { count: 'exact' })
        .eq('workspace_id', wsId);

      if (options?.status && options.status !== 'ALL') {
        query = query.eq('status', options.status);
      }

      if (options?.supplierId) {
        query = query.eq('supplier_id', options.supplierId);
      }

      if (options?.search) {
        const term = `%${options.search}%`;
        query = query.or(`po_number.ilike.${term},notes.ilike.${term}`);
      }

      // Sorting
      if (options?.sortBy === 'oldest') {
        query = query.order('created_at', { ascending: true });
      } else if (options?.sortBy === 'highest_value') {
        query = query.order('grand_total', { ascending: false });
      } else if (options?.sortBy === 'lowest_value') {
        query = query.order('grand_total', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, count, error } = await query;

      if (error) {
        const errStr = handleSupabaseError(error, 'getPurchaseOrders');
        return { data: [], count: 0, error: errStr };
      }

      const mapped: PurchaseOrder[] = (data || []).map((row: any) => this.mapRowToPo(row));
      return { data: mapped, count: count || mapped.length };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getPurchaseOrders');
      return { data: [], count: 0, error: errStr };
    }
  }

  public async getPurchaseOrderById(id: string): Promise<{ data?: PurchaseOrder; error?: string }> {
    const wsId = this.getWorkspaceId();

    if (!isSupabaseConfigured()) {
      const local = safeGetTenantStorage<PurchaseOrder>(LOCAL_POS_KEY, []);
      const po = local.find((p) => p.id === id);
      return { data: po };
    }

    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers(id, name, phone, gstin, address),
          purchase_order_items(*, products(name, sku)),
          purchase_order_status_history(*),
          purchase_order_receipts(*, purchase_order_receipt_items(*))
        `)
        .eq('workspace_id', wsId)
        .eq('id', id)
        .single();

      if (error) {
        return { error: handleSupabaseError(error, 'getPurchaseOrderById') };
      }

      return { data: this.mapRowToPo(data) };
    } catch (e: any) {
      return { error: handleSupabaseError(e, 'getPurchaseOrderById') };
    }
  }

  public async createPurchaseOrder(
    poData: Partial<PurchaseOrder>,
    items: Partial<PurchaseOrderItem>[]
  ): Promise<{ data?: PurchaseOrder; error?: string }> {
    const wsId = this.getWorkspaceId();

    if (!poData.supplierId || typeof poData.supplierId !== 'string' || !poData.supplierId.trim()) {
      return { error: 'Please select a supplier from the supplier list.' };
    }

    if (!items || items.length === 0) {
      return { error: 'Purchase Order must contain at least one line item.' };
    }

    // Verify supplier exists and belongs to current workspace if Supabase is configured
    if (isSupabaseConfigured()) {
      try {
        const { data: supData, error: supErr } = await supabase
          .from('suppliers')
          .select('id, workspace_id')
          .eq('id', poData.supplierId)
          .single();

        if (supErr || !supData) {
          return { error: 'The selected supplier could not be found. Please select the supplier again.' };
        }

        if (supData.workspace_id !== wsId) {
          return { error: 'Invalid supplier for this business.' };
        }
      } catch (err) {
        return { error: 'The selected supplier could not be found. Please select the supplier again.' };
      }
    }

    const poNumber = poData.poNumber || (await this.generatePoNumber());
    const initialStatus: PurchaseOrderStatus = (poData.status as PurchaseOrderStatus) || 'DRAFT';

    // Recalculate totals decimal-safely
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTaxable = 0;
    let totalTax = 0;
    let grandTotal = 0;

    const mappedItemsPayload = items.map((it) => {
      const qty = Math.max(0.001, Number(it.quantity) || 1);
      const rate = Math.max(0, Number(it.unitPrice) || 0);
      const lineSubtotal = qty * rate;

      let discAmt = 0;
      if (it.discountType === 'PERCENTAGE') {
        discAmt = (lineSubtotal * (Number(it.discountValue) || 0)) / 100;
      } else {
        discAmt = Number(it.discountValue) || 0;
      }
      discAmt = Math.min(lineSubtotal, discAmt);

      const taxable = Math.max(0, lineSubtotal - discAmt);
      const taxRate = Number(it.taxRate) || 0;
      const taxAmt = (taxable * taxRate) / 100;
      const lineTotal = taxable + taxAmt;

      subtotal += lineSubtotal;
      totalDiscount += discAmt;
      totalTaxable += taxable;
      totalTax += taxAmt;
      grandTotal += lineTotal;

      const customName = it.productName || it.itemName || it.description || 'Custom Item';

      return {
        product_id: it.productId || null,
        supplier_catalogue_item_id: it.supplierCatalogueItemId || null,
        item_name: customName,
        description: it.description || customName,
        quantity: qty,
        unit: it.unit || 'Pcs',
        unit_price: rate,
        discount_type: it.discountType || 'FIXED',
        discount_value: it.discountValue || 0,
        discount_amount: discAmt,
        tax_rate: taxRate,
        tax_amount: taxAmt,
        cgst_amount: taxAmt / 2,
        sgst_amount: taxAmt / 2,
        igst_amount: 0,
        line_subtotal: lineSubtotal,
        line_total: lineTotal,
        received_quantity: 0,
      };
    });

    const poPayload = {
      workspace_id: wsId,
      supplier_id: poData.supplierId,
      po_number: poNumber,
      po_date: poData.poDate || new Date().toISOString().split('T')[0],
      expected_delivery_date: poData.expectedDeliveryDate || null,
      reference_number: poData.referenceNumber || null,
      status: initialStatus,
      payment_terms: poData.paymentTerms || null,
      delivery_location_id: poData.deliveryLocationId || null,
      subtotal: Math.round(subtotal * 100) / 100,
      discount_amount: Math.round(totalDiscount * 100) / 100,
      taxable_amount: Math.round(totalTaxable * 100) / 100,
      tax_amount: Math.round(totalTax * 100) / 100,
      grand_total: Math.round(grandTotal * 100) / 100,
      notes: poData.notes || null,
      terms_conditions: poData.termsConditions || null,
      internal_notes: poData.internalNotes || null,
      created_by: supabaseAuthService.getUser()?.id || null,
    };

    if (!isSupabaseConfigured()) {
      const newPo: PurchaseOrder = {
        id: `po-${Date.now()}`,
        workspaceId: wsId,
        supplierId: poData.supplierId,
        poNumber,
        poDate: poPayload.po_date,
        status: initialStatus,
        subtotal: poPayload.subtotal,
        discountAmount: poPayload.discount_amount,
        taxableAmount: poPayload.taxable_amount,
        taxAmount: poPayload.tax_amount,
        grandTotal: poPayload.grand_total,
        notes: poData.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: items as any,
      };
      const local = safeGetTenantStorage<PurchaseOrder>(LOCAL_POS_KEY, []);
      local.unshift(newPo);
      safeSaveTenantStorage(LOCAL_POS_KEY, local);
      return { data: newPo };
    }

    try {
      const { data: poRecord, error: poErr } = await supabase
        .from('purchase_orders')
        .insert([poPayload])
        .select()
        .single();

      if (poErr) {
        return { error: handleSupabaseError(poErr, 'createPurchaseOrder') };
      }

      // Insert items
      const itemsToInsert = mappedItemsPayload.map((item) => ({
        ...item,
        purchase_order_id: poRecord.id,
      }));

      await supabase.from('purchase_order_items').insert(itemsToInsert);

      // Log initial status history
      await supabase.from('purchase_order_status_history').insert([
        {
          purchase_order_id: poRecord.id,
          old_status: null,
          new_status: initialStatus,
          changed_by: supabaseAuthService.getUser()?.id || null,
          notes: 'Purchase Order created',
        },
      ]);

      const freshPo = await this.getPurchaseOrderById(poRecord.id);
      return { data: freshPo.data };
    } catch (e: any) {
      return { error: handleSupabaseError(e, 'createPurchaseOrder') };
    }
  }

  public async updatePoStatus(
    id: string,
    newStatus: PurchaseOrderStatus,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();

    const existingRes = await this.getPurchaseOrderById(id);
    if (!existingRes.data) return { success: false, error: 'Purchase Order not found.' };

    const currentPo = existingRes.data;
    const transitionCheck = this.validateStatusTransition(currentPo.status, newStatus);
    if (!transitionCheck.valid) {
      return { success: false, error: transitionCheck.reason };
    }

    const timestampFieldMap: Record<string, string> = {
      SENT: 'sent_at',
      CONFIRMED: 'confirmed_at',
      CANCELLED: 'cancelled_at',
      CLOSED: 'closed_at',
    };

    const updateFields: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (timestampFieldMap[newStatus]) {
      updateFields[timestampFieldMap[newStatus]] = new Date().toISOString();
    }

    if (!isSupabaseConfigured()) {
      const local = safeGetTenantStorage<PurchaseOrder>(LOCAL_POS_KEY, []);
      const idx = local.findIndex((p) => p.id === id);
      if (idx !== -1) {
        local[idx].status = newStatus;
        safeSaveTenantStorage(LOCAL_POS_KEY, local);
      }
      return { success: true };
    }

    try {
      const { error: updateErr } = await supabase
        .from('purchase_orders')
        .update(updateFields)
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (updateErr) {
        return { success: false, error: handleSupabaseError(updateErr, 'updatePoStatus') };
      }

      // Log status history
      await supabase.from('purchase_order_status_history').insert([
        {
          purchase_order_id: id,
          old_status: currentPo.status,
          new_status: newStatus,
          changed_by: supabaseAuthService.getUser()?.id || null,
          notes: notes || `Status updated to ${newStatus}`,
        },
      ]);

      return { success: true };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'updatePoStatus') };
    }
  }

  public async duplicatePurchaseOrder(id: string): Promise<{ data?: PurchaseOrder; error?: string }> {
    const { data: original, error } = await this.getPurchaseOrderById(id);
    if (error || !original) return { error: error || 'Original PO not found' };

    const newPoNumber = await this.generatePoNumber();

    const duplicatedItems: Partial<PurchaseOrderItem>[] = (original.items || []).map((it) => ({
      productId: it.productId,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      discountType: it.discountType,
      discountValue: it.discountValue,
      taxRate: it.taxRate,
    }));

    return this.createPurchaseOrder(
      {
        supplierId: original.supplierId,
        poNumber: newPoNumber,
        poDate: new Date().toISOString().split('T')[0],
        expectedDeliveryDate: original.expectedDeliveryDate,
        paymentTerms: original.paymentTerms,
        notes: original.notes,
        termsConditions: original.termsConditions,
        status: 'DRAFT',
      },
      duplicatedItems
    );
  }

  private mapRowToPo(row: any): PurchaseOrder {
    const supplier = row.suppliers || {};
    const dbItems = row.purchase_order_items || [];
    const dbHistory = row.purchase_order_status_history || [];
    const dbReceipts = row.purchase_order_receipts || [];

    const items: PurchaseOrderItem[] = dbItems.map((it: any) => {
      const prod = it.products || {};
      const qty = Number(it.quantity) || 0;
      const rec = Number(it.received_quantity) || 0;
      const isCustom = !it.product_id;
      const name = prod.name || it.item_name || it.description || 'Custom Item';
      return {
        id: it.id,
        purchaseOrderId: it.purchase_order_id,
        productId: it.product_id || null,
        supplierCatalogueItemId: it.supplier_catalogue_item_id || null,
        productName: name,
        itemName: it.item_name || name,
        isCustomItem: !it.product_id && !it.supplier_catalogue_item_id,
        productSku: prod.sku || '',
        description: it.description,
        quantity: qty,
        unit: it.unit || 'Pcs',
        unitPrice: Number(it.unit_price) || 0,
        discountType: it.discount_type || 'FIXED',
        discountValue: Number(it.discount_value) || 0,
        discountAmount: Number(it.discount_amount) || 0,
        taxRate: Number(it.tax_rate) || 0,
        taxAmount: Number(it.tax_amount) || 0,
        cgstAmount: Number(it.cgst_amount) || 0,
        sgstAmount: Number(it.sgst_amount) || 0,
        igstAmount: Number(it.igst_amount) || 0,
        lineSubtotal: Number(it.line_subtotal) || 0,
        lineTotal: Number(it.line_total) || 0,
        receivedQuantity: rec,
        pendingQuantity: Math.max(0, qty - rec),
        createdAt: it.created_at,
      };
    });

    const statusHistory: PurchaseOrderStatusHistory[] = dbHistory.map((h: any) => ({
      id: h.id,
      purchaseOrderId: h.purchase_order_id,
      oldStatus: h.old_status,
      newStatus: h.new_status,
      changedBy: h.changed_by,
      notes: h.notes,
      createdAt: h.created_at,
    }));

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      supplierId: row.supplier_id,
      supplierName: supplier.name || 'Unknown Supplier',
      supplierPhone: supplier.phone || '',
      supplierGstin: supplier.gstin || '',
      supplierAddress: supplier.address || '',
      poNumber: row.po_number,
      poDate: row.po_date,
      expectedDeliveryDate: row.expected_delivery_date,
      referenceNumber: row.reference_number,
      status: row.status as PurchaseOrderStatus,
      paymentTerms: row.payment_terms,
      deliveryLocationId: row.delivery_location_id,
      subtotal: Number(row.subtotal) || 0,
      discountAmount: Number(row.discount_amount) || 0,
      taxableAmount: Number(row.taxable_amount) || 0,
      taxAmount: Number(row.tax_amount) || 0,
      grandTotal: Number(row.grand_total) || 0,
      notes: row.notes,
      termsConditions: row.terms_conditions,
      internalNotes: row.internal_notes,
      createdBy: row.created_by,
      sentAt: row.sent_at,
      confirmedAt: row.confirmed_at,
      cancelledAt: row.cancelled_at,
      closedAt: row.closed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items,
      statusHistory,
      receipts: dbReceipts,
    };
  }
}

export const purchaseOrderService = new PurchaseOrderService();
