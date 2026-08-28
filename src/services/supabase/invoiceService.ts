import { supabase } from '../../lib/supabase';
import { Invoice, Product } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { store } from '../store';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { productService } from './productService';


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

      // Step 3: If invoice status is Issued, Paid, or Partially Paid (Finalized), execute atomic stock deduction
      const isFinalized = invoice.status === 'Issued' || invoice.status === 'Paid' || invoice.status === 'Partially Paid';
      if (isFinalized) {
        const finRes = await this.finalizeInvoice(invoiceId);
        if (!finRes.success) {
          // Rollback invoice creation if stock deduction failed
          await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
          await supabase.from('invoices').delete().eq('id', invoiceId);
          return { error: finRes.error || 'Invoice finalization failed due to insufficient stock.' };
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

  public async finalizeInvoice(invoiceId: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();

    try {
      // Step 1: Try executing PostgreSQL RPC function on Supabase if available
      const { data, error } = await supabase.rpc('finalize_invoice_stock', { p_invoice_id: invoiceId });

      if (!error && data && data.success) {
        return { success: true };
      }

      if (error && error.message && error.message.includes('INSUFFICIENT_STOCK')) {
        return { success: false, error: error.message };
      }

      // Step 2: Fallback application-level stock deduction if RPC is unconfigured or in offline mode
      const { invoice } = await this.getInvoiceById(invoiceId);
      if (!invoice) return { success: false, error: 'Invoice not found.' };

      const items = invoice.invoice_items || invoice.items || [];
      const invNumber = invoice.invoice_number || invoice.invoiceNumber || invoiceId;

      // Validate stock availability for all items first
      for (const item of items) {
        const productId = item.product_id || item.productId;
        const qty = Number(item.quantity) || 0;
        if (!productId || qty <= 0) continue;

        const currentStock = await productService.getProductAvailableStock(productId);
        if (currentStock < qty) {
          const prod = store.getProducts().find((p: Product) => p.id === productId);
          const pName = prod ? prod.name : item.product_name || 'Product';
          return {
            success: false,
            error: `Insufficient stock for "${pName}". Requested ${qty}, but only ${currentStock} units are available.`,
          };
        }
      }

      // Perform stock deduction across all line items
      for (const item of items) {
        const productId = item.product_id || item.productId;
        const qty = Number(item.quantity) || 0;
        if (!productId || qty <= 0) continue;

        store.adjustStock(productId, 'Sale', -qty, `Invoice Finalization #${invNumber}`, invNumber);
      }

      // Update local tenant storage invoice status
      const local = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      const target = local.find((i) => i.id === invoiceId);
      if (target) {
        target.status = 'Issued';
        safeSaveTenantStorage(LOCAL_INVOICES_KEY, local);
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to finalize invoice stock.' };
    }
  }
}

export const invoiceService = new InvoiceService();

