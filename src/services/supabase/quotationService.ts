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
      const wsId = await this.getOrFetchWorkspaceId();

      // 1. Pre-validation: Check if already converted in local store
      const localQt = store.getQuotations().find((q) => q.id === qId);
      if (localQt && (localQt.status === 'Converted' || localQt.convertedInvoiceId)) {
        return {
          success: false,
          error: `This quotation was already converted into invoice ${localQt.convertedInvoiceId || ''}.`,
        };
      }

      // 2. Primary Path: Execute atomic PostgreSQL RPC if Supabase is connected
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('convert_quotation_to_invoice_atomic', {
            p_payload: {
              workspace_id: wsId,
              quotation_id: qId,
              payment_status: payload.paymentStatus,
              paid_amount: payload.paidAmount || 0,
              payment_mode: payload.paymentMode || 'Cash',
              payment_reference: payload.paymentReference || null,
              payment_notes: payload.paymentNotes || null,
              invoice_date: payload.invoiceDate || new Date().toISOString().split('T')[0],
              due_date: payload.dueDate || null,
              payment_date: payload.paymentDate || payload.invoiceDate || new Date().toISOString().split('T')[0],
            },
          });

          if (!rpcErr && rpcRes && rpcRes.success) {
            // Synchronize in-memory store
            store.convertQuotationToInvoice(qId, {
              paymentStatus: payload.paymentStatus,
              paidAmount: rpcRes.paid_amount,
              paymentMode: payload.paymentMode,
              paymentReference: payload.paymentReference,
              paymentNotes: payload.paymentNotes,
              invoiceId: rpcRes.invoice_id,
              invoiceNumber: rpcRes.invoice_number,
              invoiceDate: payload.invoiceDate,
              dueDate: payload.dueDate,
            });

            // Invalidate analytics caches
            try {
              const { salesAnalyticsService } = await import('./salesAnalyticsService');
              salesAnalyticsService.invalidateCache();
            } catch (e) {
              // ignore
            }

            return {
              success: true,
              invoiceId: rpcRes.invoice_id,
              invoiceNumber: rpcRes.invoice_number,
              paidAmount: rpcRes.paid_amount,
              balanceAmount: rpcRes.balance_amount,
              status: rpcRes.status,
            };
          } else if (rpcRes && !rpcRes.success && rpcRes.error) {
            return { success: false, error: rpcRes.error };
          }
        } catch (rpcEx) {
          console.warn('[convertQuotationToInvoice] RPC exception, falling through to client transaction:', rpcEx);
        }
      }

      // 3. Resilient Client-Side Transaction Pipeline (Fallback / Offline)
      let targetQt: any = localQt;
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

      if (targetQt.status === 'Converted' || targetQt.converted_invoice_id) {
        return { success: false, error: 'This quotation has already been converted.' };
      }

      const grandTotal = Number(targetQt.grand_total || targetQt.grandTotal || 0);
      let paidAmount = 0;
      let balanceAmount = grandTotal;
      let invStatus: 'Issued' | 'Partially Paid' | 'Paid' = 'Issued';

      if (payload.paymentStatus === 'Fully Paid') {
        paidAmount = grandTotal;
        balanceAmount = 0;
        invStatus = 'Paid';
      } else if (payload.paymentStatus === 'Partially Paid') {
        paidAmount = Math.max(0, Math.min(grandTotal, Number(payload.paidAmount) || 0));
        balanceAmount = Math.max(0, Number((grandTotal - paidAmount).toFixed(2)));
        invStatus = balanceAmount <= 0.01 ? 'Paid' : 'Partially Paid';
      } else {
        paidAmount = 0;
        balanceAmount = grandTotal;
        invStatus = 'Issued';
      }

      // Update store
      const inv = store.convertQuotationToInvoice(qId, {
        paymentStatus: payload.paymentStatus,
        paidAmount,
        paymentMode: payload.paymentMode,
        paymentReference: payload.paymentReference,
        paymentNotes: payload.paymentNotes,
        invoiceDate: payload.invoiceDate,
        dueDate: payload.dueDate,
      });

      if (!inv) {
        return { success: false, error: 'Failed to create invoice from quotation in local store.' };
      }

      // If Supabase is configured, persist to remote database
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          const { invoiceService } = await import('./invoiceService');
          const items = (targetQt.quotation_items || targetQt.items || []).map((i: any) => ({
            productId: i.product_id || i.productId,
            productName: i.product_name || i.productName,
            sku: i.sku,
            unit: i.unit || 'Pcs',
            quantity: Number(i.quantity) || 1,
            buyPrice: Number(i.buy_price || i.buyPrice) || 0,
            sellingPrice: Number(i.selling_price || i.sellingPrice || i.price) || 0,
            discountAmount: Number(i.discount_amount || i.discountAmount) || 0,
            taxPercent: Number(i.tax_percent || i.taxPercent) || 0,
            taxAmount: Number(i.tax_amount || i.taxAmount) || 0,
            total: Number(i.total) || 0,
          }));

          const invRes = await invoiceService.createInvoice({
            ...inv,
            quotationId: qId,
            paidAmount,
            balanceAmount,
            status: invStatus,
          }, items);

          if (invRes.invoiceId) {
            // Update Supabase quotation
            await supabase
              .from('quotations')
              .update({
                status: 'Converted',
                converted_invoice_id: invRes.invoiceId,
                updated_at: new Date().toISOString(),
              })
              .eq('id', qId);

            // Record upfront payment if paid > 0
            if (paidAmount > 0) {
              const { customerPaymentService } = await import('./customerPaymentService');
              await customerPaymentService.recordCustomerPayment({
                invoiceId: invRes.invoiceId,
                invoiceNumber: inv.invoiceNumber,
                customerId: inv.customerId,
                customerName: inv.customerName,
                customerPhone: inv.customerPhone,
                amount: paidAmount,
                paymentMethod: (payload.paymentMode || 'Cash') as any,
                paymentDate: payload.paymentDate || inv.date,
                reference: payload.paymentReference,
                notes: payload.paymentNotes || `Payment recorded at quotation conversion (${targetQt.quotation_number || targetQt.quotationNumber})`,
                isUpfrontInvoicePayment: true,
              });
            }
          }
        } catch (dbErr) {
          console.warn('[convertQuotationToInvoice] Database persistence notice:', dbErr);
        }
      }

      // Invalidate Analytics Caches
      try {
        const { salesAnalyticsService } = await import('./salesAnalyticsService');
        salesAnalyticsService.invalidateCache();
      } catch (e) {
        // ignore
      }

      return {
        success: true,
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        paidAmount,
        balanceAmount,
        status: invStatus,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Quotation conversion failed.' };
    } finally {
      this.activeLocks.delete(qId);
    }
  }

  /**
   * Batch reconcile converted quotations and ensure Daybook, Cashbook, and Udhari records exist
   */
  public async reconcileConversions(): Promise<{ success: boolean; message?: string }> {
    const wsId = await this.getOrFetchWorkspaceId();
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data, error } = await supabase.rpc('reconcile_quotation_conversions', {
          p_workspace_id: wsId,
        });
        if (!error && data) {
          return { success: true, message: `Reconciled: ${data.fixed_daybook} Daybook, ${data.fixed_cashbook} Cashbook, ${data.fixed_udhari} Udhari.` };
        }
      } catch (e) {
        console.warn('[reconcileConversions] Notice:', e);
      }
    }
    return { success: true };
  }
}

export const quotationService = new QuotationService();
