import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Quotation, QuotationItem } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { store } from '../store';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_QUOTATIONS_KEY = 'vistaar_local_quotations_db';

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

  public async getQuotations(explicitWsId?: string): Promise<{ data: any[]; error?: string }> {
    const wsId = explicitWsId && isValidUuid(explicitWsId) ? explicitWsId : await this.getWorkspaceId();
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
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
      }
      const fallback = safeGetTenantStorage<any>(LOCAL_QUOTATIONS_KEY, []);
      return { data: fallback };
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

      // 1. Resolve quotation from store or Supabase
      let targetQt: any = store.getQuotations().find((q) => q.id === qId);
      if (!targetQt && isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data: dbQt } = await supabase
          .from('quotations')
          .select('*, quotation_items(*)')
          .eq('id', qId)
          .maybeSingle();
        targetQt = dbQt;
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

      // 2. Prepare line items for authoritative invoice
      const rawItems = targetQt.quotation_items || targetQt.items || [];
      const items = rawItems.map((i: any) => {
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

          // Ensure Daybook entry
          try {
            const { daybookService } = await import('./daybookService');
            await daybookService.recordFinancialTransaction({
              referenceType: 'INVOICE',
              referenceId: inv.id,
              referenceNumber: inv.invoiceNumber,
              transactionType: 'SALE',
              direction: 'IN',
              amount: paid,
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

          // Ensure Cashbook if paid > 0
          if (paid > 0) {
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
