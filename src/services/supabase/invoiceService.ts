import { supabase } from '../../lib/supabase';
import { Invoice } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';

import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_INVOICES_KEY = 'vistaar_local_invoices_db';

export class InvoiceService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getInvoices(options?: {
    search?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: any[]; count: number; error?: string }> {
    const wsId = this.getWorkspaceId();
    let query = supabase.from('invoices').select('*, invoice_items(*)', { count: 'exact' }).eq('workspace_id', wsId);

    if (options?.search) {
      const s = `%${options.search}%`;
      query = query.or(`invoice_number.ilike.${s},customer_name.ilike.${s}`);
    }

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.page && options?.pageSize) {
      const from = (options.page - 1) * options.pageSize;
      const to = from + options.pageSize - 1;
      query = query.range(from, to);
    }

    query = query.order('created_at', { ascending: false });

    try {
      const { data, count, error } = await query;
      if (error) {
        const errStr = handleSupabaseError(error, 'getInvoices');
        const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
        return { data: fallback, count: fallback.length, error: errStr };
      }
      return { data: data || [], count: count || 0 };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getInvoices');
      const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      return { data: fallback, count: fallback.length, error: errStr };
    }
  }

  public async getInvoiceById(id: string): Promise<{ invoice?: any; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('workspace_id', wsId)
        .eq('id', id)
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'getInvoiceById');
        const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
        const match = fallback.find((inv) => inv.id === id);
        return { invoice: match, error: match ? undefined : errStr };
      }
      return { invoice: data };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getInvoiceById');
      const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      const match = fallback.find((inv) => inv.id === id);
      return { invoice: match, error: match ? undefined : errStr };
    }
  }

  public async createInvoice(invoice: Partial<Invoice>, items: any[]): Promise<{ invoiceId?: string; error?: string }> {
    const wsId = this.getWorkspaceId();
    const invNumber = invoice.invoiceNumber || `INV-${Date.now()}`;

    try {
      // Step 1: Insert Parent Invoice
      const { data: parent, error: parentErr } = await supabase
        .from('invoices')
        .insert([{
          workspace_id: wsId,
          customer_id: invoice.customerId || null,
          invoice_number: invNumber,
          customer_name: invoice.customerName || 'Walk-in Customer',
          customer_phone: invoice.customerPhone || '',
          customer_email: invoice.customerEmail || '',
          status: invoice.status || 'Issued',
          date: invoice.date || new Date().toISOString().split('T')[0],
          due_date: invoice.dueDate || new Date().toISOString().split('T')[0],
          subtotal: invoice.subtotal || 0,
          discount_total: invoice.discountTotal || 0,
          tax_total: invoice.taxTotal || 0,
          grand_total: invoice.grandTotal || 0,
          paid_amount: invoice.paidAmount || 0,
          balance_amount: invoice.balanceAmount || 0,
        }])
        .select('id')
        .single();

      if (parentErr) {
        const errStr = handleSupabaseError(parentErr, 'createInvoice');
        if (errStr.startsWith('Network Error')) {
          const newId = `inv-${Date.now()}`;
          const localInv = { id: newId, invoice_number: invNumber, ...invoice, invoice_items: items, createdAt: new Date().toISOString() };
          const local = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
          local.unshift(localInv);
          safeSaveTenantStorage(LOCAL_INVOICES_KEY, local);
          return { invoiceId: newId };
        }
        return { error: errStr };
      }

      const invoiceId = parent.id;

      // Step 2: Insert Child Invoice Items
      if (items && items.length > 0) {
        const itemRows = items.map((item) => ({
          workspace_id: wsId,
          invoice_id: invoiceId,
          product_id: item.productId || null,
          product_name: item.productName || item.name,
          sku: item.sku || '',
          unit: item.unit || 'Pcs',
          quantity: item.quantity,
          buy_price: item.buyPrice || 0,
          selling_price: item.sellingPrice || item.price || 0,
          tax_percent: item.taxPercent || 0,
          tax_amount: item.taxAmount || 0,
          total: item.total || (item.quantity * (item.sellingPrice || item.price || 0)),
        }));

        const { error: itemsErr } = await supabase.from('invoice_items').insert(itemRows);
        if (itemsErr) {
          handleSupabaseError(itemsErr, 'createInvoice.items');
          await supabase.from('invoices').delete().eq('id', invoiceId);
          return { error: `Line item insert failed: ${itemsErr.message}` };
        }
      }

      return { invoiceId };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createInvoice');
      const newId = `inv-${Date.now()}`;
      const localInv = { id: newId, invoice_number: invNumber, ...invoice, invoice_items: items, createdAt: new Date().toISOString() };
      const local = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      local.unshift(localInv);
      safeSaveTenantStorage(LOCAL_INVOICES_KEY, local);
      return { invoiceId: newId };
    }
  }
}

export const invoiceService = new InvoiceService();
