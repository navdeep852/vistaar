import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Quotation, QuotationItem, QuotationStatus } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { store, LOCAL_QUOTATIONS_KEY } from '../store';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { filterValidLineItems, isEmptyLineItem } from '../../lib/productHelpers';
import { fromDbQuotation } from './types';

export { LOCAL_QUOTATIONS_KEY };

function logQuotationDiagnostic(op: string, detail: {
  quotationId?: string;
  quotationNumber?: string;
  workspaceId?: string;
  success: boolean;
  count?: number;
  errorCode?: string;
  error?: string;
}) {
  const safeWsId = detail.workspaceId ? `${detail.workspaceId.slice(0, 8)}...` : 'unresolved';
  console.info(`[QUOTATION_DIAGNOSTIC] ${op}:`, {
    quotationId: detail.quotationId,
    quotationNumber: detail.quotationNumber,
    workspace: safeWsId,
    success: detail.success,
    count: detail.count,
    errorCode: detail.errorCode,
    error: detail.error,
    timestamp: new Date().toISOString(),
  });
}

export interface ConvertQuotationPayload {
  quotationId: string;
  paymentStatus: 'Unpaid' | 'Partially Paid' | 'Fully Paid';
  paidAmount?: number;
  paymentMode?: string;
  paymentReference?: string;
  paymentNotes?: string;
  invoiceDate?: string;
  paymentDate?: string;
  dueDate?: string;
}

export interface ConvertQuotationResult {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  paidAmount?: number;
  balanceAmount?: number;
  status?: string;
  error?: string;
}

export class QuotationService {
  private activeLocks = new Set<string>();

  private async getWorkspaceId(): Promise<string> {
    if (!isSupabaseConfigured()) {
      const cid = supabaseAuthService.getCurrentCompanyId();
      const userId = supabaseAuthService.getUser()?.id;
      if (isValidUuid(cid) && cid !== userId) return cid;
      return '';
    }
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) return authWsId;
    } catch (e: any) {
      console.warn('Failed to get authoritative workspace ID in quotationService:', e?.message || e);
    }
    const cid = supabaseAuthService.getCurrentCompanyId();
    if (cid && isValidUuid(cid)) return cid;
    return '';
  }

  public async getOrFetchWorkspaceId(): Promise<string> {
    const wsId = await this.getWorkspaceId();
    if (wsId && isValidUuid(wsId)) {
      return wsId;
    }
    throw new Error('[WORKSPACE RESOLUTION FAILED] Authoritative workspace ID could not be determined in quotationService.');
  }

  public async getQuotations(explicitWsId?: string, options?: { branchId?: string }): Promise<{ data: Quotation[]; error?: string }> {
    const wsId = explicitWsId && isValidUuid(explicitWsId) ? explicitWsId : await this.getWorkspaceId();
    const localStoreQuotations = store.getQuotations() || [];
    const localFallbackQuotations = safeGetTenantStorage<any>(LOCAL_QUOTATIONS_KEY, []).map((q) => fromDbQuotation(q));

    // Seed candidate map from local sources
    const mergedMap = new Map<string, Quotation>();
    [...localFallbackQuotations, ...localStoreQuotations].forEach((q) => {
      const canonical = fromDbQuotation(q);
      if (canonical.quotationNumber) mergedMap.set(canonical.quotationNumber.trim(), canonical);
      if (canonical.id) mergedMap.set(canonical.id.trim(), canonical);
    });

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        let query = supabase
          .from('quotations')
          .select('*, quotation_items(*)')
          .eq('workspace_id', wsId);

        let branchFilterAppliedInDb = false;
        if (options?.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
          query = query.eq('branch_id', options.branchId);
          branchFilterAppliedInDb = true;
        }

        query = query.order('created_at', { ascending: false });

        let { data, error } = await query;

        // Resilience against unmigrated schema: if branch_id column does not exist (PGRST204 / 42703)
        if (error && (error.code === 'PGRST204' || error.code === '42703' || error.message?.includes('branch_id'))) {
          console.warn('[getQuotations] Supabase column branch_id does not exist; querying workspace-wide and filtering in memory');
          branchFilterAppliedInDb = false;
          const retryRes = await supabase
            .from('quotations')
            .select('*, quotation_items(*)')
            .eq('workspace_id', wsId)
            .order('created_at', { ascending: false });
          data = retryRes.data;
          error = retryRes.error;
        }

        if (error) {
          const errStr = handleSupabaseError(error, 'getQuotations');
          logQuotationDiagnostic('READ_ERROR', {
            workspaceId: wsId,
            success: false,
            errorCode: error.code,
            error: errStr,
          });
          const localList = Array.from(new Set(mergedMap.values()));
          return { data: localList, error: errStr };
        }

        let remoteList = data || [];

        // If branch filter could not be applied at DB level, filter in memory
        if (!branchFilterAppliedInDb && options?.branchId && options.branchId !== 'ALL') {
          remoteList = remoteList.filter((rq: any) => {
            const bId = rq.branch_id || rq.snapshot?.branch_id || rq.snapshot?.branchId;
            return bId === options.branchId;
          });
        }

        // Merge remote quotations authoritatively into the merged map
        remoteList.forEach((rq: any) => {
          const mapped = fromDbQuotation(rq);
          const qNumKey = mapped.quotationNumber?.trim();
          const idKey = mapped.id?.trim();

          const existing = (qNumKey ? mergedMap.get(qNumKey) : null) || (idKey ? mergedMap.get(idKey) : null);
          const isConverted = mapped.status === 'Converted' || (existing && existing.status === 'Converted');

          const finalized: Quotation = {
            ...(existing || {}),
            ...mapped,
            id: mapped.id || existing?.id || `qt-${Date.now()}`,
            quotationNumber: mapped.quotationNumber || existing?.quotationNumber || `QT-${Date.now()}`,
            branchId: mapped.branchId || existing?.branchId,
            branchName: mapped.branchName || existing?.branchName,
            status: isConverted ? 'Converted' : (mapped.status || existing?.status || 'Draft'),
            items: mapped.items && mapped.items.length > 0 ? mapped.items : (existing?.items || []),
          };

          if (qNumKey) mergedMap.set(qNumKey, finalized);
          if (idKey) mergedMap.set(idKey, finalized);
        });

        const deduplicated = Array.from(new Set(mergedMap.values()));

        // Save authoritative list to local tenant mirror
        try {
          safeSaveTenantStorage(LOCAL_QUOTATIONS_KEY, deduplicated);
        } catch {}

        logQuotationDiagnostic('READ_SUCCESS', {
          workspaceId: wsId,
          success: true,
          count: deduplicated.length,
        });

        return { data: deduplicated };
      }

      const localList = Array.from(new Set(mergedMap.values()));
      return { data: localList };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getQuotations');
      logQuotationDiagnostic('READ_EXCEPTION', {
        workspaceId: wsId,
        success: false,
        error: errStr,
      });
      const localList = Array.from(new Set(mergedMap.values()));
      return { data: localList, error: errStr };
    }
  }

  public async createQuotation(qt: Partial<Quotation>, items: QuotationItem[]): Promise<{ quotationId?: string; quotation?: Quotation; error?: string }> {
    const wsId = await this.getWorkspaceId();
    const qtNumber = (qt.quotationNumber || `QT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`).trim();

    // Idempotency lock
    if (this.activeLocks.has(qtNumber)) {
      return { error: `Quotation creation for ${qtNumber} is already in progress.` };
    }
    this.activeLocks.add(qtNumber);

    try {
      // 1. Validate required fields
      if (!qt.customerName || !qt.customerName.trim()) {
        qt.customerName = 'Walk-in Customer';
      }

      const validItems = filterValidLineItems(items) as QuotationItem[];
      const calcSubtotal = validItems.reduce((acc, i) => acc + (Number(i.quantity) || 0) * (Number(i.sellingPrice) || 0), 0);
      const calcDiscount = validItems.reduce((acc, i) => acc + (Number(i.discountAmount) || 0), 0);
      const calcTax = validItems.reduce((acc, i) => acc + (Number(i.taxAmount) || 0), 0);
      const calcGrandTotal = Number((calcSubtotal - calcDiscount + calcTax).toFixed(2));

      const subtotal = qt.subtotal !== undefined ? Number(qt.subtotal) : calcSubtotal;
      const discountTotal = qt.discountTotal !== undefined ? Number(qt.discountTotal) : calcDiscount;
      const taxTotal = qt.taxTotal !== undefined ? Number(qt.taxTotal) : calcTax;
      const grandTotal = qt.grandTotal !== undefined ? Number(qt.grandTotal) : calcGrandTotal;

      const dateStr = qt.date || new Date().toISOString().split('T')[0];
      const validUntilStr = qt.validUntil || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];

      // Build structured snapshot incorporating branch and branding
      const snapshot = qt.snapshot || {
        templateId: qt.templateId || 'qt-modern-blue',
        branding: qt.branding || null,
        theme: qt.theme || null,
        customization: qt.customization || null,
        branch_id: qt.branchId || null,
        branchId: qt.branchId || null,
        notes: qt.notes || null,
        terms: qt.terms || null,
        footerText: qt.footerText || null,
      };

      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        // Prepare parent insert payload
        const parentPayload: Record<string, any> = {
          workspace_id: wsId,
          customer_id: (qt.customerId && isValidUuid(qt.customerId)) ? qt.customerId : null,
          quotation_number: qtNumber,
          customer_name: qt.customerName,
          customer_phone: qt.customerPhone || '',
          customer_whatsapp: qt.customerWhatsapp || null,
          customer_email: qt.customerEmail || null,
          customer_address: qt.customerAddress || null,
          customer_gstin: qt.customerGstin || null,
          status: qt.status || 'Draft',
          valid_until: validUntilStr,
          date: dateStr,
          subtotal,
          discount_total: discountTotal,
          tax_total: taxTotal,
          grand_total: grandTotal,
          notes: qt.notes || null,
          terms: qt.terms || null,
          footer_text: qt.footerText || null,
          template_id: qt.templateId || 'qt-modern-blue',
          branding: qt.branding || null,
          theme: qt.theme || null,
          customization: qt.customization || null,
          snapshot,
          is_snapshot_finalized: qt.isSnapshotFinalized ?? true,
        };

        if (qt.branchId && isValidUuid(qt.branchId)) {
          parentPayload.branch_id = qt.branchId;
        }

        let { data: parent, error: parentErr } = await supabase
          .from('quotations')
          .insert([parentPayload])
          .select()
          .single();

        // Resilience against unmigrated schema: if branch_id column does not exist (PGRST204 / 42703)
        if (parentErr && (parentErr.code === 'PGRST204' || parentErr.code === '42703' || parentErr.message?.includes('branch_id'))) {
          console.warn('[createQuotation] quotations.branch_id column not found in schema cache (PGRST204); retrying with branch in snapshot');
          const stashedBranchId = parentPayload.branch_id;
          delete parentPayload.branch_id;
          parentPayload.snapshot = {
            ...(typeof parentPayload.snapshot === 'object' && parentPayload.snapshot ? parentPayload.snapshot : {}),
            branch_id: stashedBranchId,
            branchId: stashedBranchId,
          };

          const retryParent = await supabase
            .from('quotations')
            .insert([parentPayload])
            .select()
            .single();

          parent = retryParent.data;
          parentErr = retryParent.error;
        }

        if (parentErr) {
          const errStr = handleSupabaseError(parentErr, 'createQuotation');
          logQuotationDiagnostic('CREATE_ERROR', {
            quotationNumber: qtNumber,
            workspaceId: wsId,
            success: false,
            errorCode: parentErr.code,
            error: errStr,
          });

          // Save local backup so user data is not lost if network/permission issue
          const localFallback: Quotation = fromDbQuotation({
            ...parentPayload,
            id: qt.id || `qt-${Date.now()}`,
            items: validItems,
          });
          const savedFallback = store.addQuotation(localFallback);
          try {
            const currentTenantQt = safeGetTenantStorage<any>(LOCAL_QUOTATIONS_KEY, []);
            currentTenantQt.unshift(savedFallback);
            safeSaveTenantStorage(LOCAL_QUOTATIONS_KEY, currentTenantQt);
          } catch {}

          return { error: errStr };
        }

        const quotationId = parent.id;

        // Step 2: Insert Child Quotation Items with Schema Resilience
        if (validItems.length > 0) {
          const itemRows = validItems.map((item) => {
            const row: Record<string, any> = {
              workspace_id: wsId,
              quotation_id: quotationId,
              product_id: (item.productId && isValidUuid(item.productId)) ? item.productId : null,
              product_name: item.productName || 'Item',
              sku: item.sku || '',
              unit: item.unit || 'Pcs',
              quantity: Number(item.quantity) || 1,
              buy_price: Number(item.buyPrice) || 0,
              selling_price: Number(item.sellingPrice) || 0,
              discount_amount: Number(item.discountAmount) || 0,
              tax_percent: Number(item.taxPercent) || 0,
              tax_amount: Number(item.taxAmount) || 0,
              total: Number(item.total) || 0,
            };

            if (qt.branchId && isValidUuid(qt.branchId)) row.branch_id = qt.branchId;
            if (item.itemType) row.item_type = item.itemType;
            if (item.description) row.description = item.description;
            if (item.partNumber) row.part_number = item.partNumber;

            return row;
          });

          let { error: itemsErr } = await supabase.from('quotation_items').insert(itemRows);

          // Resilience against unmigrated columns: if branch_id/item_type/description/part_number fail
          if (itemsErr && (itemsErr.code === 'PGRST204' || itemsErr.code === '42703')) {
            console.warn('[createQuotation.items] Extended line items columns not found in schema cache (PGRST204); retrying with core columns');
            const coreItemRows = validItems.map((item) => ({
              workspace_id: wsId,
              quotation_id: quotationId,
              product_id: (item.productId && isValidUuid(item.productId)) ? item.productId : null,
              product_name: item.productName || 'Item',
              sku: item.sku || '',
              unit: item.unit || 'Pcs',
              quantity: Number(item.quantity) || 1,
              buy_price: Number(item.buyPrice) || 0,
              selling_price: Number(item.sellingPrice) || 0,
              discount_amount: Number(item.discountAmount) || 0,
              tax_percent: Number(item.taxPercent) || 0,
              tax_amount: Number(item.taxAmount) || 0,
              total: Number(item.total) || 0,
            }));

            const retryItems = await supabase.from('quotation_items').insert(coreItemRows);
            itemsErr = retryItems.error;
          }

          if (itemsErr) {
            handleSupabaseError(itemsErr, 'createQuotation.items');
            logQuotationDiagnostic('CREATE_ITEMS_ERROR', {
              quotationId,
              quotationNumber: qtNumber,
              workspaceId: wsId,
              success: false,
              errorCode: itemsErr.code,
              error: itemsErr.message,
            });
            // Roll back parent quotation on line item failure
            await supabase.from('quotations').delete().eq('id', quotationId);
            return { error: `Failed to save quotation line items: ${itemsErr.message}` };
          }
        }

        // Canonical saved record
        const savedQuotation: Quotation = fromDbQuotation({
          ...parent,
          items: validItems,
        });

        // Mirror to local store and storage
        store.syncRemoteQuotations([savedQuotation]);

        logQuotationDiagnostic('CREATE_SUCCESS', {
          quotationId,
          quotationNumber: qtNumber,
          workspaceId: wsId,
          success: true,
          count: validItems.length,
        });

        return { quotationId, quotation: savedQuotation };
      }

      // Offline / Local-only fallback
      const localId = qt.id || `qt-${Date.now()}`;
      const savedQuotation: Quotation = fromDbQuotation({
        ...qt,
        id: localId,
        quotation_number: qtNumber,
        status: qt.status || 'Draft',
        date: dateStr,
        valid_until: validUntilStr,
        subtotal,
        discount_total: discountTotal,
        tax_total: taxTotal,
        grand_total: grandTotal,
        items: validItems,
        snapshot,
      });

      store.addQuotation(savedQuotation);

      logQuotationDiagnostic('CREATE_LOCAL_FALLBACK', {
        quotationId: localId,
        quotationNumber: qtNumber,
        workspaceId: wsId || 'offline',
        success: true,
      });

      return { quotationId: localId, quotation: savedQuotation };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createQuotation');
      logQuotationDiagnostic('CREATE_EXCEPTION', {
        quotationNumber: qtNumber,
        workspaceId: wsId,
        success: false,
        error: errStr,
      });
      return { error: errStr };
    } finally {
      this.activeLocks.delete(qtNumber);
    }
  }

  public async updateQuotation(
    id: string,
    updates: Partial<Quotation>,
    items?: QuotationItem[]
  ): Promise<{ success: boolean; quotation?: Quotation; error?: string }> {
    if (!id) return { success: false, error: 'Quotation ID is required for update.' };

    const wsId = await this.getWorkspaceId();

    try {
      const validItems = items ? (filterValidLineItems(items) as QuotationItem[]) : undefined;

      let subtotal = updates.subtotal;
      let discountTotal = updates.discountTotal;
      let taxTotal = updates.taxTotal;
      let grandTotal = updates.grandTotal;

      if (validItems) {
        const calcSubtotal = validItems.reduce((acc, i) => acc + (Number(i.quantity) || 0) * (Number(i.sellingPrice) || 0), 0);
        const calcDiscount = validItems.reduce((acc, i) => acc + (Number(i.discountAmount) || 0), 0);
        const calcTax = validItems.reduce((acc, i) => acc + (Number(i.taxAmount) || 0), 0);
        subtotal = subtotal !== undefined ? subtotal : calcSubtotal;
        discountTotal = discountTotal !== undefined ? discountTotal : calcDiscount;
        taxTotal = taxTotal !== undefined ? taxTotal : calcTax;
        grandTotal = grandTotal !== undefined ? grandTotal : Number((subtotal - discountTotal + taxTotal).toFixed(2));
      }

      if (isSupabaseConfigured() && isValidUuid(wsId) && isValidUuid(id)) {
        const updatePayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };

        if (updates.customerName) updatePayload.customer_name = updates.customerName;
        if (updates.customerPhone !== undefined) updatePayload.customer_phone = updates.customerPhone;
        if (updates.customerWhatsapp !== undefined) updatePayload.customer_whatsapp = updates.customerWhatsapp;
        if (updates.customerEmail !== undefined) updatePayload.customer_email = updates.customerEmail;
        if (updates.customerAddress !== undefined) updatePayload.customer_address = updates.customerAddress;
        if (updates.customerGstin !== undefined) updatePayload.customer_gstin = updates.customerGstin;
        if (updates.status) updatePayload.status = updates.status;
        if (updates.date) updatePayload.date = updates.date;
        if (updates.validUntil) updatePayload.valid_until = updates.validUntil;
        if (subtotal !== undefined) updatePayload.subtotal = subtotal;
        if (discountTotal !== undefined) updatePayload.discount_total = discountTotal;
        if (taxTotal !== undefined) updatePayload.tax_total = taxTotal;
        if (grandTotal !== undefined) updatePayload.grand_total = grandTotal;
        if (updates.notes !== undefined) updatePayload.notes = updates.notes;
        if (updates.terms !== undefined) updatePayload.terms = updates.terms;
        if (updates.footerText !== undefined) updatePayload.footer_text = updates.footerText;
        if (updates.templateId) updatePayload.template_id = updates.templateId;
        if (updates.branding !== undefined) updatePayload.branding = updates.branding;
        if (updates.theme !== undefined) updatePayload.theme = updates.theme;
        if (updates.customization !== undefined) updatePayload.customization = updates.customization;
        if (updates.snapshot !== undefined) updatePayload.snapshot = updates.snapshot;
        if (updates.branchId && isValidUuid(updates.branchId)) updatePayload.branch_id = updates.branchId;

        let { data: updatedParent, error: updateErr } = await supabase
          .from('quotations')
          .update(updatePayload)
          .eq('id', id)
          .eq('workspace_id', wsId)
          .select()
          .single();

        // Resilience against missing branch_id
        if (updateErr && (updateErr.code === 'PGRST204' || updateErr.code === '42703')) {
          delete updatePayload.branch_id;
          const retry = await supabase
            .from('quotations')
            .update(updatePayload)
            .eq('id', id)
            .eq('workspace_id', wsId)
            .select()
            .single();
          updatedParent = retry.data;
          updateErr = retry.error;
        }

        if (updateErr) {
          const errStr = handleSupabaseError(updateErr, 'updateQuotation');
          return { success: false, error: errStr };
        }

        // If items were updated, reconcile quotation_items
        if (validItems) {
          await supabase.from('quotation_items').delete().eq('quotation_id', id).eq('workspace_id', wsId);

          const itemRows = validItems.map((item) => {
            const row: Record<string, any> = {
              workspace_id: wsId,
              quotation_id: id,
              product_id: (item.productId && isValidUuid(item.productId)) ? item.productId : null,
              product_name: item.productName || 'Item',
              sku: item.sku || '',
              unit: item.unit || 'Pcs',
              quantity: Number(item.quantity) || 1,
              buy_price: Number(item.buyPrice) || 0,
              selling_price: Number(item.sellingPrice) || 0,
              discount_amount: Number(item.discountAmount) || 0,
              tax_percent: Number(item.taxPercent) || 0,
              tax_amount: Number(item.taxAmount) || 0,
              total: Number(item.total) || 0,
            };
            if (updates.branchId && isValidUuid(updates.branchId)) row.branch_id = updates.branchId;
            if (item.itemType) row.item_type = item.itemType;
            if (item.description) row.description = item.description;
            if (item.partNumber) row.part_number = item.partNumber;
            return row;
          });

          let { error: itemsErr } = await supabase.from('quotation_items').insert(itemRows);
          if (itemsErr && (itemsErr.code === 'PGRST204' || itemsErr.code === '42703')) {
            const coreItemRows = validItems.map((item) => ({
              workspace_id: wsId,
              quotation_id: id,
              product_id: (item.productId && isValidUuid(item.productId)) ? item.productId : null,
              product_name: item.productName || 'Item',
              sku: item.sku || '',
              unit: item.unit || 'Pcs',
              quantity: Number(item.quantity) || 1,
              buy_price: Number(item.buyPrice) || 0,
              selling_price: Number(item.sellingPrice) || 0,
              discount_amount: Number(item.discountAmount) || 0,
              tax_percent: Number(item.taxPercent) || 0,
              tax_amount: Number(item.taxAmount) || 0,
              total: Number(item.total) || 0,
            }));
            await supabase.from('quotation_items').insert(coreItemRows);
          }
        }

        const canonical = fromDbQuotation({
          ...updatedParent,
          items: validItems,
        });

        store.updateQuotation(id, canonical);

        logQuotationDiagnostic('UPDATE_SUCCESS', {
          quotationId: id,
          workspaceId: wsId,
          success: true,
        });

        return { success: true, quotation: canonical };
      }

      // Local store update
      const updated = store.updateQuotation(id, {
        ...updates,
        items: validItems,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
      });

      return { success: true, quotation: updated || undefined };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'updateQuotation');
      logQuotationDiagnostic('UPDATE_EXCEPTION', {
        quotationId: id,
        workspaceId: wsId,
        success: false,
        error: errStr,
      });
      return { success: false, error: errStr };
    }
  }

  public async deleteQuotation(id: string): Promise<{ success: boolean; error?: string }> {
    if (!id) return { success: false, error: 'Quotation ID is required for deletion.' };

    const wsId = await this.getWorkspaceId();

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId) && isValidUuid(id)) {
        const { error } = await supabase
          .from('quotations')
          .delete()
          .eq('id', id)
          .eq('workspace_id', wsId);

        if (error) {
          const errStr = handleSupabaseError(error, 'deleteQuotation');
          logQuotationDiagnostic('DELETE_ERROR', {
            quotationId: id,
            workspaceId: wsId,
            success: false,
            errorCode: error.code,
            error: errStr,
          });
          return { success: false, error: errStr };
        }
      }

      store.deleteQuotation(id);

      logQuotationDiagnostic('DELETE_SUCCESS', {
        quotationId: id,
        workspaceId: wsId,
        success: true,
      });

      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'deleteQuotation');
      logQuotationDiagnostic('DELETE_EXCEPTION', {
        quotationId: id,
        workspaceId: wsId,
        success: false,
        error: errStr,
      });
      return { success: false, error: errStr };
    }
  }

  public async updateQuotationStatus(id: string, status: QuotationStatus): Promise<{ success: boolean; error?: string }> {
    if (!id) return { success: false, error: 'Quotation ID is required.' };

    const wsId = await this.getWorkspaceId();

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId) && isValidUuid(id)) {
        const updatePayload: Record<string, any> = {
          status,
          updated_at: new Date().toISOString(),
        };
        if (status === 'Converted') {
          updatePayload.updated_at = new Date().toISOString();
        }

        await supabase
          .from('quotations')
          .update(updatePayload)
          .eq('id', id)
          .eq('workspace_id', wsId);
      }

      store.updateQuotationStatus(id, status);
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'updateQuotationStatus');
      return { success: false, error: errStr };
    }
  }

  /**
   * Authoritative calculation of active/open quotations as of the end of a selected period (toDate).
   * Respects quotation lifecycle, valid_until, and status transitions.
   */
  public async getOpenQuotationsCountAsOf(asOfDateStr?: string, explicitWsId?: string): Promise<{
    count: number;
    activeQuotations: any[];
    error?: string;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const targetDate = asOfDateStr || today;

    const res = await this.getQuotations(explicitWsId);
    if (res.error && (!res.data || res.data.length === 0)) {
      return { count: 0, activeQuotations: [], error: res.error };
    }

    const allQuotations = res.data || [];
    const active = allQuotations.filter((q: any) => {
      const qDate = (q.date || q.created_at || q.createdAt || '').split('T')[0];
      // Must have been created on or before targetDate
      if (qDate && qDate > targetDate) {
        return false;
      }

      const validUntil = q.valid_until || q.validUntil;
      const status = (q.status || 'Draft').toLowerCase();

      // If rejected prior to targetDate, it's not open
      if (status === 'rejected') {
        const updateDate = (q.updated_at || q.updatedAt || qDate).split('T')[0];
        if (updateDate <= targetDate) return false;
      }

      // If accepted or converted prior to targetDate, it's not open
      if (status === 'accepted' || status === 'converted' || q.converted_invoice_id) {
        const convertDate = (q.updated_at || q.updatedAt || qDate).split('T')[0];
        if (convertDate <= targetDate) return false;
      }

      // Check expiry: if validUntil was before targetDate, it was already expired as of targetDate
      if (validUntil && validUntil < targetDate) {
        return false;
      }

      // If status is draft, sent, viewed, or valid until >= targetDate
      return true;
    });

    return {
      count: active.length,
      activeQuotations: active,
    };
  }

  /**
   * Convert a quotation into an authoritative invoice with atomic payment, Daybook,
   * Cashbook, and Udhari ledger synchronization.
   */
  public async convertQuotationToInvoice(payload: ConvertQuotationPayload): Promise<ConvertQuotationResult> {
    const qId = payload.quotationId;
    if (!qId) {
      return { success: false, error: 'Quotation ID is required for conversion.' };
    }

    if (this.activeLocks.has(qId)) {
      return { success: false, error: 'Quotation conversion is already in progress. Please wait.' };
    }
    this.activeLocks.add(qId);

    try {
      let wsId = '';
      try {
        wsId = await this.getOrFetchWorkspaceId();
      } catch {
        wsId = await this.getWorkspaceId();
      }

      // 1. Resolve quotation from store, local tenant storage, or Supabase
      let targetQt: any = store.getQuotations().find((q) => q.id === qId || q.quotationNumber === qId);
      if (!targetQt) {
        const localQuotations = safeGetTenantStorage<any>(LOCAL_QUOTATIONS_KEY, []);
        targetQt = localQuotations.find((q: any) => q.id === qId || q.quotationNumber === qId || q.quotation_number === qId);
      }
      if (!targetQt && isSupabaseConfigured() && isValidUuid(wsId)) {
        let dbQuery = supabase
          .from('quotations')
          .select('*, quotation_items(*)')
          .eq('workspace_id', wsId);
        if (isValidUuid(qId)) {
          const { data: dbQt } = await dbQuery.eq('id', qId).maybeSingle();
          targetQt = dbQt;
        } else {
          const { data: dbQt } = await dbQuery.eq('quotation_number', qId).maybeSingle();
          targetQt = dbQt;
        }
      }

      if (!targetQt) {
        return { success: false, error: 'Quotation not found.' };
      }

      if (targetQt.status === 'Converted' || targetQt.converted_invoice_id || targetQt.convertedInvoiceId) {
        const existingInvId = targetQt.converted_invoice_id || targetQt.convertedInvoiceId;
        const linkedInv = store.getInvoices().find((i) => i.id === existingInvId || i.quotationId === qId);
        if (linkedInv) {
          return {
            success: true,
            invoiceId: linkedInv.id,
            invoiceNumber: linkedInv.invoiceNumber,
            paidAmount: linkedInv.paidAmount,
            balanceAmount: linkedInv.balanceAmount,
            status: linkedInv.status,
          };
        }
        return { success: false, error: 'This quotation has already been converted into an invoice.' };
      }

      // 2. Prepare line items for authoritative invoice (filtering out any unused empty rows)
      const rawItems = targetQt.quotation_items || targetQt.items || [];
      const validRawItems = rawItems.filter((i: any) => !isEmptyLineItem({
        productId: i.product_id || i.productId,
        productName: i.product_name || i.productName || i.name,
        partNumber: i.part_number || i.partNumber,
        sellingPrice: i.selling_price || i.sellingPrice || i.rate || i.price,
        description: i.description,
        itemType: i.item_type || i.itemType,
      }));

      if (validRawItems.length === 0) {
        return { success: false, error: 'Quotation contains no valid line items to convert.' };
      }

      const items = validRawItems.map((i: any) => {
        const rawPId = i.product_id || i.productId;
        const cleanProductId = (rawPId && typeof rawPId === 'string' && rawPId.trim() !== '' && rawPId !== 'null' && rawPId !== 'undefined') ? rawPId.trim() : null;
        const itemType = i.item_type || i.itemType || (cleanProductId ? 'product' : 'custom');

        return {
          id: i.id,
          productId: cleanProductId,
          productName: i.product_name || i.productName || i.name || 'Item',
          description: i.description || null,
          partNumber: i.part_number || i.partNumber || null,
          sku: i.sku || '',
          unit: i.unit || 'Pcs',
          quantity: Number(i.quantity) || 1,
          buyPrice: Number(i.buy_price || i.buyPrice) || 0,
          sellingPrice: Number(i.selling_price || i.sellingPrice || i.rate || i.price) || 0,
          discountAmount: Number(i.discount_amount || i.discountAmount) || 0,
          taxPercent: Number(i.tax_percent || i.taxPercent || i.taxRate) || 0,
          taxAmount: Number(i.tax_amount || i.taxAmount) || 0,
          total: Number(i.total) || 0,
          itemType,
        };
      });

      // 3. Delegate directly to the single Authoritative Invoice Accounting Pipeline
      const { invoiceService } = await import('./invoiceService');
      const result = await invoiceService.finalizeAuthoritativeInvoice({
        source: 'QUOTATION',
        quotationId: qId,
        quotationNumber: targetQt.quotation_number || targetQt.quotationNumber,
        customerId: targetQt.customer_id || targetQt.customerId,
        customerName: targetQt.customer_name || targetQt.customerName,
        customerPhone: targetQt.customer_phone || targetQt.customerPhone,
        customerWhatsapp: targetQt.customer_whatsapp || targetQt.customerWhatsapp,
        customerEmail: targetQt.customer_email || targetQt.customerEmail,
        customerAddress: targetQt.customer_address || targetQt.customerAddress,
        customerGstin: targetQt.customer_gstin || targetQt.customerGstin,
        items,
        subtotal: Number(targetQt.subtotal) || 0,
        discountTotal: Number(targetQt.discount_total || targetQt.discountTotal) || 0,
        taxTotal: Number(targetQt.tax_total || targetQt.taxTotal) || 0,
        grandTotal: Number(targetQt.grand_total || targetQt.grandTotal) || 0,
        paymentStatus: payload.paymentStatus,
        paidAmount: payload.paidAmount,
        paymentMode: payload.paymentMode,
        paymentReference: payload.paymentReference,
        paymentNotes: payload.paymentNotes,
        paymentDate: payload.paymentDate,
        date: payload.invoiceDate || targetQt.date || new Date().toISOString().split('T')[0],
        dueDate: payload.dueDate || targetQt.valid_until || targetQt.validUntil,
        notes: targetQt.notes,
        terms: targetQt.terms,
        footerText: targetQt.footer_text || targetQt.footerText,
        templateId: (targetQt.template_id || targetQt.templateId || 'qt-modern-blue').replace('qt-', 'inv-'),
        branding: targetQt.branding,
        theme: targetQt.theme,
        customization: targetQt.customization,
        snapshot: targetQt.snapshot,
      });

      if (result.success) {
        store.saveAndNotify();
      }

      return result;
    } catch (err: any) {
      console.error('[convertQuotationToInvoice] Error:', err);
      return { success: false, error: err.message || 'Quotation conversion failed.' };
    } finally {
      this.activeLocks.delete(qId);
    }
  }

  /**
   * Batch reconcile converted quotations and ensure Daybook, Cashbook, and Udhari records exist
   */
  public async reconcileConversions(): Promise<{ success: boolean; message?: string }> {
    let wsId = '';
    try {
      wsId = await this.getOrFetchWorkspaceId();
    } catch {
      wsId = await this.getWorkspaceId();
    }

    let reconciledCount = 0;

    // 1. Reconcile in local store
    const storeInvoices = store.getInvoices();
    const quotations = store.getQuotations();
    for (const qt of quotations) {
      if (qt.status === 'Converted' && qt.convertedInvoiceId) {
        const inv = storeInvoices.find((i) => i.id === qt.convertedInvoiceId || i.quotationId === qt.id);
        if (inv) {
          const grandTotal = Number(inv.grandTotal) || 0;
          const paid = Number(inv.paidAmount) || 0;
          const remaining = Math.max(0, Number((grandTotal - paid).toFixed(2)));
          const pStatus = remaining <= 0.01 ? 'PAID' : (paid > 0 ? 'PARTIALLY PAID' : 'UNPAID');

          const storePayments = store.getPayments();
          const hasPayments = storePayments.some((p) => p.invoiceId === inv.id || (p.invoiceNumber && p.invoiceNumber === inv.invoiceNumber));
          const effectiveInflow = hasPayments ? 0 : paid;

          // Ensure Daybook entry
          try {
            const { daybookService } = await import('./daybookService');
            await daybookService.recordFinancialTransaction({
              referenceType: 'INVOICE',
              referenceId: inv.id,
              referenceNumber: inv.invoiceNumber,
              transactionType: 'SALE',
              direction: 'IN',
              amount: effectiveInflow,
              totalAmount: grandTotal,
              remainingAmount: remaining,
              paymentStatus: pStatus,
              paymentMode: paid > 0 ? 'Cash' : 'Cash',
              partyType: 'customer',
              partyId: inv.customerId,
              partyName: inv.customerName,
              description: `Invoice #${inv.invoiceNumber} (Quotation #${qt.quotationNumber})`,
              transactionDate: inv.date,
            });
            reconciledCount++;
          } catch (e) {
            // ignore
          }

          // Ensure Cashbook if paid > 0 and no distinct payment record exists
          if (paid > 0 && !hasPayments) {
            try {
              const { cashbookService } = await import('./cashbookService');
              await cashbookService.recordCashbookEntry({
                sourceType: 'INVOICE_PAYMENT',
                sourceId: inv.id,
                referenceNumber: inv.invoiceNumber,
                direction: 'IN',
                amount: paid,
                paymentMethod: 'Cash',
                partyName: inv.customerName,
                description: `Payment received for Invoice #${inv.invoiceNumber}`,
                transactionDate: inv.date,
              });
            } catch (e) {
              // ignore
            }
          }

          // Ensure Udhari if remaining > 0.01
          if (remaining > 0.01) {
            try {
              store.syncInvoiceUdhari({
                invoiceId: inv.id,
                invoiceNumber: inv.invoiceNumber,
                customerId: inv.customerId,
                customerName: inv.customerName,
                customerPhone: inv.customerPhone || '9999999999',
                grandTotal,
                paidAmount: paid,
                balanceAmount: remaining,
                dueDate: inv.dueDate,
              });
            } catch (e) {
              // ignore
            }
          }
        }
      }
    }

    // 2. RPC reconciliation if Supabase is connected
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data, error } = await supabase.rpc('reconcile_quotation_conversions', {
          p_workspace_id: wsId,
        });
        if (!error && data) {
          return { success: true, message: `Reconciled: ${data.fixed_daybook} Daybook, ${data.fixed_cashbook} Cashbook, ${data.fixed_udhari} Udhari.` };
        }
      } catch (e) {
        console.warn('[reconcileConversions] Supabase RPC notice:', e);
      }
    }

    return { success: true, message: `Reconciled ${reconciledCount} converted quotation records.` };
  }
}

export const quotationService = new QuotationService();
