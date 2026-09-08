import { supabase } from '../../lib/supabase';
import { Quotation, QuotationItem } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';

import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_QUOTATIONS_KEY = 'vistaar_local_quotations_db';

export class QuotationService {
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
      console.warn('Failed to get authoritative workspace ID in quotationService:', e);
    }
    return '';
  }

  public async getQuotations(): Promise<{ data: any[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select('*, quotation_items(*)')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getQuotations');
        const fallback = safeGetTenantStorage<any>(LOCAL_QUOTATIONS_KEY, []);
        return { data: fallback, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getQuotations');
      const fallback = safeGetTenantStorage<any>(LOCAL_QUOTATIONS_KEY, []);
      return { data: fallback, error: errStr };
    }
  }

  public async createQuotation(qt: Partial<Quotation>, items: QuotationItem[]): Promise<{ quotationId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const qtNumber = qt.quotationNumber || `QT-${Date.now()}`;

    try {
      const { data: parent, error: parentErr } = await supabase
        .from('quotations')
        .insert([{
          workspace_id: wsId,
          customer_id: qt.customerId || null,
          quotation_number: qtNumber,
          customer_name: qt.customerName || 'Walk-in Customer',
          customer_phone: qt.customerPhone || '',
          customer_email: qt.customerEmail || '',
          status: qt.status || 'Draft',
          valid_until: qt.validUntil || new Date().toISOString().split('T')[0],
          date: qt.date || new Date().toISOString().split('T')[0],
          subtotal: qt.subtotal || 0,
          discount_total: qt.discountTotal || 0,
          tax_total: qt.taxTotal || 0,
          grand_total: qt.grandTotal || 0,
          notes: qt.notes || null,
        }])
        .select('id')
        .single();

      if (parentErr) {
        const errStr = handleSupabaseError(parentErr, 'createQuotation');
        if (errStr.startsWith('Network Error')) {
          const newId = `qt-${Date.now()}`;
          const localQt = { id: newId, quotation_number: qtNumber, ...qt, quotation_items: items, createdAt: new Date().toISOString() };
          const local = safeGetTenantStorage<any>(LOCAL_QUOTATIONS_KEY, []);
          local.unshift(localQt);
          safeSaveTenantStorage(LOCAL_QUOTATIONS_KEY, local);
          return { quotationId: newId };
        }
        return { error: errStr };
      }

      const quotationId = parent.id;

      if (items && items.length > 0) {
        const itemRows = items.map((item) => ({
          workspace_id: wsId,
          quotation_id: quotationId,
          item_type: item.itemType || (item.productId ? 'product' : 'custom'),
          product_id: item.productId || null,
          product_name: item.productName,
          description: item.description || null,
          part_number: item.partNumber || null,
          sku: item.sku || '',
          unit: item.unit || 'Pcs',
          quantity: item.quantity,
          buy_price: item.buyPrice || 0,
          selling_price: item.sellingPrice,
          tax_percent: item.taxPercent || 0,
          tax_amount: item.taxAmount || 0,
          total: item.total,
        }));

        const { error: itemsErr } = await supabase.from('quotation_items').insert(itemRows);
        if (itemsErr) {
          handleSupabaseError(itemsErr, 'createQuotation.items');
          await supabase.from('quotations').delete().eq('id', quotationId);
          return { error: `Line item insert failed: ${itemsErr.message}` };
        }
      }

      return { quotationId };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createQuotation');
      const newId = `qt-${Date.now()}`;
      const localQt = { id: newId, quotation_number: qtNumber, ...qt, quotation_items: items, createdAt: new Date().toISOString() };
      const local = safeGetTenantStorage<any>(LOCAL_QUOTATIONS_KEY, []);
      local.unshift(localQt);
      safeSaveTenantStorage(LOCAL_QUOTATIONS_KEY, local);
      return { quotationId: newId };
    }
  }

  /**
   * Authoritative calculation of active/open quotations as of the end of a selected period (toDate).
   * Respects quotation lifecycle, valid_until, and status transitions.
   */
  public async getOpenQuotationsCountAsOf(asOfDateStr?: string): Promise<{
    count: number;
    activeQuotations: any[];
    error?: string;
  }> {
    const today = new Date().toISOString().split('T')[0];
    const targetDate = asOfDateStr || today;

    const res = await this.getQuotations();
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
}

export const quotationService = new QuotationService();
