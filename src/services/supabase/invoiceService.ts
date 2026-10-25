import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Invoice, Product, InvoiceStatus, Payment } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { store } from '../store';
import { safeGetTenantStorage, safeSaveTenantStorage, safeGetTenantItem } from './safeStorage';
import { productService } from './productService';
import { fromDbInvoice } from './types';
import { calculateInvoiceFinancials } from '../financialCalculationService';
import { filterValidLineItems } from '../../lib/productHelpers';
import { isRecordInBranch, resolveBranch } from '../../lib/branchUtils';
const LOCAL_INVOICES_KEY = 'vistaar_local_invoices_db';

function matchesInvoiceSearch(inv: any, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const num = (inv.invoiceNumber || inv.invoice_number || '').toLowerCase();
  const cust = (inv.customerName || inv.customer_name || '').toLowerCase();
  const phone = (inv.customerPhone || inv.customer_phone || '').toLowerCase();
  const notes = (inv.notes || '').toLowerCase();
  if (num.includes(q) || cust.includes(q) || phone.includes(q) || notes.includes(q)) {
    return true;
  }
  const items = inv.items || inv.invoice_items || [];
  if (Array.isArray(items)) {
    return items.some((item: any) => {
      const pName = (item.productName || item.product_name || item.name || '').toLowerCase();
      const pPart = (item.partNumber || item.part_number || '').toLowerCase();
      const pSku = (item.sku || '').toLowerCase();
      const pDesc = (item.description || '').toLowerCase();
      return pName.includes(q) || pPart.includes(q) || pSku.includes(q) || pDesc.includes(q);
    });
  }
  return false;
}

export class InvoiceService {
  private getWorkspaceId(): string {
    const wsId = supabaseAuthService.getCurrentCompanyId();
    const userId = supabaseAuthService.getUser()?.id;
    if (isValidUuid(wsId) && wsId !== userId) return wsId;
    return '';
  }

  public async getOrFetchWorkspaceId(): Promise<string> {
    if (!isSupabaseConfigured()) {
      return this.getWorkspaceId();
    }
    try {
      const authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
      if (authWsId && isValidUuid(authWsId)) {
        return authWsId;
      }
    } catch (e: any) {
      console.warn('Failed to get authoritative workspace ID in invoiceService:', e?.message || e);
    }
    const fallback = this.getWorkspaceId();
    if (fallback && isValidUuid(fallback)) return fallback;
    return '';
  }

  public async getInvoices(options?: {
    search?: string;
    customerId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
    workspaceId?: string;
    branchId?: string;
  }): Promise<{ data: any[]; count: number; error?: string }> {
    const wsId = options?.workspaceId && isValidUuid(options.workspaceId) ? options.workspaceId : await this.getOrFetchWorkspaceId();
    let query = supabase.from('invoices').select('*, invoice_items(*)', { count: 'exact' });
    if (isValidUuid(wsId)) {
      query = query.eq('workspace_id', wsId);
    }

    if (options?.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
      const mainBranchId = safeGetTenantItem('main_branch_id');
      const isMain = options.branchId === mainBranchId || String(options.branchId).toLowerCase().includes('main');
      if (isMain) {
        query = query.or(`branch_id.eq.${options.branchId},branch_id.is.null`);
      } else {
        query = query.eq('branch_id', options.branchId);
      }
    }

    if (options?.status) {
      query = query.eq('status', options.status);
    }

    if (options?.startDate) {
      query = query.gte('date', options.startDate);
    }

    if (options?.endDate) {
      query = query.lte('date', options.endDate);
    }

    query = query.order('created_at', { ascending: false });

    let supabaseInvoices: any[] = [];
    let queryError: string | undefined;

    try {
      let { data, error } = await query;

      // Resilience against unmigrated schema: if branch_id does not exist, retry query without branch_id
      if (error && (error.code === 'PGRST204' || error.message?.includes('branch_id'))) {
        console.warn('[getInvoices] Supabase column branch_id does not exist (PGRST204); querying workspace-wide');
        let retryQuery = supabase.from('invoices').select('*, invoice_items(*)', { count: 'exact' });
        if (isValidUuid(wsId)) {
          retryQuery = retryQuery.eq('workspace_id', wsId);
        }
        if (options?.status) {
          retryQuery = retryQuery.eq('status', options.status);
        }
        if (options?.startDate) {
          retryQuery = retryQuery.gte('date', options.startDate);
        }
        if (options?.endDate) {
          retryQuery = retryQuery.lte('date', options.endDate);
        }
        retryQuery = retryQuery.order('created_at', { ascending: false });
        const retryRes = await retryQuery;
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error) {
        queryError = handleSupabaseError(error, 'getInvoices');
      } else if (data) {
        supabaseInvoices = data.map((r: any) => fromDbInvoice(r));
      }
    } catch (e: any) {
      queryError = handleSupabaseError(e, 'getInvoices');
    }

    // Merge Supabase, local tenant storage, and memory store with deduplication
    const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
    const storeInvs = store.getInvoices();
    const candidatePool = [...supabaseInvoices, ...storeInvs, ...(fallback || []).map((r: any) => fromDbInvoice(r))];

    const seenIds = new Set<string>();
    const seenNumbers = new Set<string>();
    let merged: any[] = [];

    for (const item of candidatePool) {
      if (!item) continue;
      const idKey = item.id ? String(item.id).toLowerCase() : '';
      const numKey = (item.invoiceNumber || item.invoice_number) ? String(item.invoiceNumber || item.invoice_number).trim().toLowerCase() : '';

      if (idKey && seenIds.has(idKey)) continue;
      if (numKey && seenNumbers.has(numKey)) continue;

      if (idKey) seenIds.add(idKey);
      if (numKey) seenNumbers.add(numKey);

      merged.push(item);
    }

    // 1. Branch Isolation Filtering via canonical branch matching
    if (options?.branchId && options.branchId !== 'ALL') {
      merged = merged.filter((inv: any) => {
        const bId = inv.branchId || inv.branch_id || inv.snapshot?.branch_id;
        const notes = inv.notes || inv.terms || '';
        return isRecordInBranch(options.branchId, bId, notes);
      });
    }

    // 2. Status Filtering
    if (options?.status) {
      merged = merged.filter((inv: any) => inv.status === options.status);
    }

    // 3. Date Range Filtering
    if (options?.startDate || options?.endDate) {
      merged = merged.filter((inv: any) => {
        const d = (inv.date || inv.invoice_date || inv.createdAt || inv.created_at || '').split('T')[0];
        if (options.startDate && d < options.startDate) return false;
        if (options.endDate && d > options.endDate) return false;
        return true;
      });
    }

    // 4. Search Filtering (Matches invoice number, customer name, customer phone, notes, AND line items e.g. 100SS)
    if (options?.search && options.search.trim()) {
      merged = merged.filter((inv: any) => matchesInvoiceSearch(inv, options.search!));
    }

    const totalCount = merged.length;
    let paginated = merged;
    if (options?.page && options?.pageSize) {
      const from = (options.page - 1) * options.pageSize;
      const to = from + options.pageSize;
      paginated = merged.slice(from, to);
    }

    return {
      data: paginated,
      count: totalCount,
      error: queryError && merged.length === 0 ? queryError : undefined,
    };
  }

  public async getInvoiceById(id: string): Promise<{ invoice?: any; error?: string }> {
    const wsId = await this.getOrFetchWorkspaceId();
    try {
      let query = supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('id', id);

      if (isValidUuid(wsId)) {
        query = query.eq('workspace_id', wsId);
      }

      let { data, error } = await query.maybeSingle();

      if (!data && isValidUuid(wsId)) {
        // Query counter_sales if not found in invoices
        try {
          const { data: csData } = await supabase
            .from('counter_sales')
            .select('*, counter_sale_items(*)')
            .eq('workspace_id', wsId)
            .or(`id.eq.${id},invoice_number.eq.${id},sale_number.eq.${id}`)
            .maybeSingle();
          if (csData) {
            const { fromDbCounterSale } = await import('./types');
            const cs = fromDbCounterSale(csData);
            return { invoice: store.counterSaleToInvoice(cs) };
          }
        } catch {}
      }

      if (error && !data) {
        const errStr = handleSupabaseError(error, 'getInvoiceById');
        const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
        const match = fallback.find((inv) => inv.id === id || inv.invoice_number === id);
        if (match) return { invoice: fromDbInvoice(match) };
        const storeMatch = store.getInvoice(id);
        if (storeMatch) return { invoice: storeMatch };
        return { invoice: undefined, error: errStr };
      }
      if (data) return { invoice: fromDbInvoice(data) };
      const storeMatch = store.getInvoice(id);
      return { invoice: storeMatch };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getInvoiceById');
      const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      const match = fallback.find((inv) => inv.id === id || inv.invoice_number === id);
      if (match) return { invoice: fromDbInvoice(match) };
      const storeMatch = store.getInvoice(id);
      return { invoice: storeMatch, error: storeMatch ? undefined : errStr };
    }
  }

  public async createInvoice(invoice: Partial<Invoice>, items: any[]): Promise<{ invoiceId?: string; error?: string }> {
    const wsId = await this.getOrFetchWorkspaceId();
    const invNumber = invoice.invoiceNumber || `INV-${Date.now()}`;
    const isFinalized = invoice.status === 'Issued' || invoice.status === 'Paid' || invoice.status === 'Partially Paid';

    // Fall back directly to local tenant storage if Supabase is unconfigured or no user is logged in
    if (!isSupabaseConfigured() || !supabaseAuthService.getUser()) {
      const newId = `inv-${Date.now()}`;
      const localInv = { id: newId, invoice_number: invNumber, ...invoice, invoice_items: items, createdAt: new Date().toISOString() };
      const local = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      local.unshift(localInv);
      safeSaveTenantStorage(LOCAL_INVOICES_KEY, local);
      return { invoiceId: newId };
    }

    try {
      // Step 1: Insert Parent Invoice (insert as 'Draft' if finalizing via RPC to ensure stock finalization executes)
      const initialStatus = isFinalized ? 'Draft' : (invoice.status || 'Draft');
      const { grandTotal: normGrandTotal, paidAmount: normPaidAmount, balanceAmount: normBalanceAmount } = calculateInvoiceFinancials(
        invoice.grandTotal,
        invoice.paidAmount
      );

      const assignedId = (invoice.id && isValidUuid(invoice.id)) ? invoice.id : crypto.randomUUID();
      const invInsertPayload: Record<string, any> = {
        id: assignedId,
        workspace_id: wsId,
        customer_id: (invoice.customerId && isValidUuid(invoice.customerId)) ? invoice.customerId : null,
        invoice_number: invNumber,
        customer_name: invoice.customerName || 'Walk-in Customer',
        customer_phone: invoice.customerPhone || '',
        customer_email: invoice.customerEmail || '',
        quotation_id: ((invoice as any).quotationId && isValidUuid((invoice as any).quotationId)) ? (invoice as any).quotationId : (((invoice as any).quotation_id && isValidUuid((invoice as any).quotation_id)) ? (invoice as any).quotation_id : null),
        status: initialStatus,
        date: invoice.date || new Date().toISOString().split('T')[0],
        due_date: invoice.dueDate || new Date().toISOString().split('T')[0],
        subtotal: invoice.subtotal || 0,
        discount_total: invoice.discountTotal || 0,
        tax_total: invoice.taxTotal || 0,
        grand_total: normGrandTotal,
        paid_amount: normPaidAmount,
        balance_amount: normBalanceAmount,
        notes: invoice.notes,
        terms: invoice.terms,
        footer_text: invoice.footerText,
        template_id: invoice.templateId || 'inv-modern-blue',
        branding: invoice.branding,
        theme: invoice.theme,
        customization: invoice.customization,
        snapshot: invoice.snapshot,
      };

      if (invoice.branchId && isValidUuid(invoice.branchId)) {
        invInsertPayload.branch_id = invoice.branchId;
      }

      let { data: parent, error: parentErr } = await supabase
        .from('invoices')
        .insert([invInsertPayload])
        .select('id')
        .single();

      // Resilience against unmigrated schema: if branch_id does not exist, strip and retry
      if (parentErr && (parentErr.code === 'PGRST204' || parentErr.code === '42703')) {
        console.warn('[createInvoice] Invoices column not found in schema cache (PGRST204); retrying without unmigrated columns');
        const stashedBranchId = invInsertPayload.branch_id;
        delete invInsertPayload.branch_id;
        delete invInsertPayload.payment_mode;
        delete invInsertPayload.payment_method;
        delete invInsertPayload.payment_reference;
        delete invInsertPayload.payment_notes;
        delete invInsertPayload.is_stock_finalized;
        if (stashedBranchId) {
          invInsertPayload.snapshot = {
            ...(typeof invInsertPayload.snapshot === 'object' && invInsertPayload.snapshot ? invInsertPayload.snapshot : {}),
            branch_id: stashedBranchId,
            branchId: stashedBranchId,
          };
        }
        const retryRes = await supabase
          .from('invoices')
          .insert([invInsertPayload])
          .select('id')
          .single();
        parent = retryRes.data;
        parentErr = retryRes.error;
      }

      if (parentErr) {
        console.error('[createInvoice] Invoices insert failed:', {
          code: parentErr.code,
          message: parentErr.message,
          details: parentErr.details,
          hint: parentErr.hint,
        });
        const errStr = handleSupabaseError(parentErr, 'createInvoice');
        if (errStr.startsWith('Network Error') || parentErr.code === '42501' || parentErr.code === 'PGRST301' || !supabaseAuthService.isAuthenticated()) {
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
        const itemRows = items.map((item) => {
          const row: Record<string, any> = {
            workspace_id: wsId,
            invoice_id: invoiceId,
            product_id: (item.productId && isValidUuid(item.productId)) ? item.productId : null,
            product_name: item.productName || item.name || 'Item',
            sku: item.sku || '',
            unit: item.unit || 'Pcs',
            quantity: item.quantity,
            buy_price: item.buyPrice || 0,
            selling_price: item.sellingPrice || item.price || 0,
            tax_percent: item.taxPercent || 0,
            tax_amount: item.taxAmount || 0,
            total: item.total || (item.quantity * (item.sellingPrice || item.price || 0)),
          };
          if (invoice.branchId && isValidUuid(invoice.branchId)) {
            row.branch_id = invoice.branchId;
          }
          if (item.partNumber) row.part_number = item.partNumber;
          if (item.itemType) row.item_type = item.itemType;
          if (item.description) row.description = item.description;
          return row;
        });

        let { error: itemsErr } = await supabase.from('invoice_items').insert(itemRows);

        // Resilience against unmigrated schema: if extended item columns fail with PGRST204, strip to core columns and retry
        if (itemsErr && (itemsErr.code === 'PGRST204' || itemsErr.code === '42703')) {
          console.warn('[createInvoice.items] Line items column mismatch in schema cache (PGRST204); retrying with core columns');
          const coreItemRows = items.map((item) => ({
            workspace_id: wsId,
            invoice_id: invoiceId,
            product_id: (item.productId && isValidUuid(item.productId)) ? item.productId : null,
            product_name: item.productName || item.name || 'Item',
            sku: item.sku || '',
            unit: item.unit || 'Pcs',
            quantity: item.quantity,
            buy_price: item.buyPrice || 0,
            selling_price: item.sellingPrice || item.price || 0,
            tax_percent: item.taxPercent || 0,
            tax_amount: item.taxAmount || 0,
            total: item.total || (item.quantity * (item.sellingPrice || item.price || 0)),
          }));
          const retryItems = await supabase.from('invoice_items').insert(coreItemRows);
          itemsErr = retryItems.error;
        }

        if (itemsErr) {
          console.error('[createInvoice.items] Line items insert failed:', {
            code: itemsErr.code,
            message: itemsErr.message,
            details: itemsErr.details,
          });
          handleSupabaseError(itemsErr, 'createInvoice.items');
          await supabase.from('invoices').delete().eq('id', invoiceId);
          return { error: `Line item insert failed: ${itemsErr.message}` };
        }
      }

      // Step 3: If invoice status is Finalized, execute atomic stock deduction via finalizeInvoice
      if (isFinalized) {
        const finRes = await this.finalizeInvoice(invoiceId);
        if (!finRes.success) {
          // Rollback invoice creation if stock deduction failed
          await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
          await supabase.from('invoices').delete().eq('id', invoiceId);
          return { error: finRes.error || 'Invoice finalization failed due to insufficient stock.' };
        }

        const { grandTotal: total, paidAmount: paid, balanceAmount: remaining } = calculateInvoiceFinancials(
          invoice.grandTotal,
          invoice.paidAmount
        );
        const authoritativeStatus: InvoiceStatus =
          invoice.status === 'Draft' || invoice.status === 'Cancelled'
            ? invoice.status
            : (remaining <= 0.01 && total > 0 ? 'Paid' : (paid > 0 ? 'Partially Paid' : 'Issued'));

        const invUpdateFields: Record<string, any> = {
          status: authoritativeStatus,
          paid_amount: paid,
          balance_amount: remaining,
          updated_at: new Date().toISOString(),
        };

        const { error: updErr } = await supabase
          .from('invoices')
          .update({ ...invUpdateFields, is_stock_finalized: true })
          .eq('id', invoiceId)
          .eq('workspace_id', wsId);

        if (updErr && (updErr.code === 'PGRST204' || updErr.code === '42703')) {
          await supabase
            .from('invoices')
            .update(invUpdateFields)
            .eq('id', invoiceId)
            .eq('workspace_id', wsId);
        }

        const pStatus = remaining <= 0.01 ? 'PAID' : (paid > 0 ? 'PARTIALLY PAID' : 'UNPAID');

        // Record Daybook sale entry with strictly partitioned Inflow and Gross Total
        try {
          const { daybookService } = await import('./daybookService');
          await daybookService.recordFinancialTransaction({
            branchId: invoice.branchId,
            referenceType: 'INVOICE',
            referenceId: invoiceId,
            referenceNumber: invNumber,
            transactionType: 'SALE',
            direction: 'IN',
            amount: paid, // Inflow = actual money received
            totalAmount: total, // Gross Total column strictly for sales
            remainingAmount: remaining, // Unpaid balance
            paymentStatus: pStatus,
            partyType: 'customer',
            partyId: invoice.customerId || undefined,
            partyName: invoice.customerName || 'Customer',
            description: `Invoice #${invNumber}`,
            transactionDate: invoice.date || new Date().toISOString().split('T')[0],
          });
        } catch (dbErr) {
          console.warn('[createInvoice] Accounting record notice:', dbErr);
        }

        // Synchronize Udhari Ledger and Follow-up for customer receivable (Rule 8: Only when balance > 0)
        if (remaining > 0.01) {
          try {
            const { udhariService } = await import('./udhariService');
            await udhariService.syncInvoiceUdhari({
              branchId: invoice.branchId,
              invoiceId,
              invoiceNumber: invNumber,
              customerId: invoice.customerId,
              customerName: invoice.customerName || 'Customer',
              customerPhone: invoice.customerPhone || '9999999999',
              grandTotal: total,
              paidAmount: paid,
              balanceAmount: remaining,
              dueDate: invoice.dueDate,
            });
          } catch (uErr) {
            console.warn('[createInvoice] Udhari sync notice:', uErr);
          }
        }

        try {
          const { salesAnalyticsService } = await import('./salesAnalyticsService');
          salesAnalyticsService.invalidateCache();
        } catch (e) {
          // ignore
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
    const wsId = await this.getOrFetchWorkspaceId();

    try {
      // Step 1: Try executing PostgreSQL RPC function on Supabase if available
      if (isSupabaseConfigured() && isValidUuid(invoiceId)) {
        const { data, error } = await supabase.rpc('finalize_invoice_stock', { p_invoice_id: invoiceId });

        if (!error && data && data.success) {
          console.log('[finalizeInvoice] RPC finalize_invoice_stock succeeded:', data);
          // Sync local store product stock without performing duplicate stock deduction
          try {
            const { invoice } = await this.getInvoiceById(invoiceId);
            const items = invoice?.invoice_items || invoice?.items || [];
            for (const item of items) {
              const pId = item.product_id || item.productId;
              if (pId) {
                const liveStock = await productService.getProductAvailableStock(pId);
                store.syncProductStock(pId, liveStock);
              }
            }
          } catch (syncErr) {
            console.warn('[finalizeInvoice] Post-finalization local store sync warning:', syncErr);
          }
          return { success: true };
        }

        if (error) {
          console.error('[finalizeInvoice] RPC finalize_invoice_stock returned error:', error);

          const code = (error as any).code || '';
          let msg = (error as any).message || '';
          const isUnavailable =
            code === '22P02' ||
            code === 'PGRST202' ||
            code === 'P0001' ||
            msg.includes('UNAUTHORIZED') ||
            msg.includes('Could not find the function') ||
            msg.includes('does not exist') ||
            msg.startsWith('Failed to fetch') ||
            msg.includes('NetworkError');

          if (!isUnavailable) {
            if (msg.includes('INSUFFICIENT_STOCK:')) {
              msg = msg.replace(/^.*?INSUFFICIENT_STOCK:\s*/, '');
            }
            return { success: false, error: msg || 'Invoice finalization failed.' };
          }
        }
      }

      // Step 2: Fallback application-level stock deduction if RPC is unconfigured or in offline mode
      const { invoice } = await this.getInvoiceById(invoiceId);
      if (!invoice) return { success: false, error: 'Invoice not found.' };

      const items = invoice.invoice_items || invoice.items || [];
      const invNumber = invoice.invoice_number || invoice.invoiceNumber || invoiceId;

      // Validate stock availability aggregating by product ID
      const reqMap = new Map<string, { name: string; qty: number }>();
      for (const item of items) {
        const productId = item.product_id || item.productId;
        const qty = Number(item.quantity) || 0;
        if (!productId || qty <= 0) continue;
        const prev = reqMap.get(productId);
        if (prev) {
          prev.qty += qty;
        } else {
          const prod = store.getProducts().find((p: Product) => p.id === productId);
          reqMap.set(productId, {
            name: prod ? prod.name : item.product_name || 'Product',
            qty,
          });
        }
      }

      const branchId = invoice.branch_id || invoice.branchId;
      for (const [productId, req] of reqMap.entries()) {
        const currentStock = await productService.getProductAvailableStock(productId, branchId);
        if (currentStock < req.qty) {
          return {
            success: false,
            error: `Insufficient stock for "${req.name}". Requested ${req.qty}, but only ${currentStock} units are available.`,
          };
        }
      }

      // Perform stock deduction across line products
      for (const [productId, req] of reqMap.entries()) {
        store.adjustStock(productId, 'Sale', -req.qty, `Invoice Finalization #${invNumber}`, invNumber, branchId);

        if (isSupabaseConfigured()) {
          try {
            const { data: currentProd } = await supabase
              .from('products')
              .select('current_stock')
              .eq('workspace_id', wsId)
              .eq('id', productId)
              .maybeSingle();

            if (currentProd) {
              const newStock = Math.max(0, (Number(currentProd.current_stock) || 0) - req.qty);
              await supabase
                .from('products')
                .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                .eq('workspace_id', wsId)
                .eq('id', productId);
            }

            if (branchId && isValidUuid(branchId)) {
              const { data: bProd } = await supabase
                .from('branch_inventory')
                .select('current_stock')
                .eq('branch_id', branchId)
                .eq('product_id', productId)
                .maybeSingle();

              if (bProd) {
                const newBStock = Math.max(0, (Number(bProd.current_stock) || 0) - req.qty);
                await supabase
                  .from('branch_inventory')
                  .update({ current_stock: newBStock, updated_at: new Date().toISOString() })
                  .eq('branch_id', branchId)
                  .eq('product_id', productId);
              }
            }
          } catch (e) {
            console.warn('[Stock Deduction] Supabase update warning:', e);
          }
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vistaar:branch_inventory_updated', { detail: { branchId } }));
      }

      // Invalidate product service cache so all views receive fresh stock immediately
      productService.invalidateCache();

      // Update local tenant storage invoice status preserving authoritative financial status
      const local = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      const target = local.find((i) => i.id === invoiceId);
      if (target) {
        const gTotal = Number(target.grand_total ?? target.grandTotal ?? 0);
        const pAmount = Number(target.paid_amount ?? target.paidAmount ?? 0);
        const bal = Math.max(0, gTotal - pAmount);
        target.balance_amount = bal;
        target.balanceAmount = bal;
        target.status =
          target.status === 'Draft' || target.status === 'Cancelled'
            ? target.status
            : (bal <= 0.01 && gTotal > 0 ? 'Paid' : (pAmount > 0 ? 'Partially Paid' : 'Issued'));
        safeSaveTenantStorage(LOCAL_INVOICES_KEY, local);
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to finalize invoice stock.' };
    }
  }

  private activeFinalizeLocks = new Set<string>();

  /**
   * Single Authoritative Invoice Finalization & Accounting Pipeline.
   * Shared by:
   * 1. Manually created invoices (DocumentEditorView)
   * 2. Quotation-to-invoice conversion (QuotationService / QuotationsView)
   * 3. Any other valid invoice creation workflow.
   *
   * Guarantees:
   * - Validates workspace ownership and prevents duplicate conversion retries.
   * - Authoritative grand total, paid amount, and remaining balance calculation.
   * - Persists invoice record with linked quotation_id.
   * - Deducts stock for catalog products and exempts custom line items.
   * - Synchronizes Daybook SALE transaction (inflow = paidAmount, totalAmount = grandTotal).
   * - Synchronizes Cashbook inflow ONLY when paidAmount > 0.
   * - Synchronizes Udhari receivable ONLY when balanceAmount > 0.01.
   * - Invalidates analytics caches so Dashboard Total Sales immediately reflects the transaction.
   */
  public async finalizeAuthoritativeInvoice(payload: AuthoritativeInvoicePayload): Promise<AuthoritativeInvoiceResult> {
    const lockKey = payload.quotationId ? `qt-${payload.quotationId}` : (payload.id || payload.invoiceNumber || `inv-${Date.now()}`);
    if (this.activeFinalizeLocks.has(lockKey)) {
      return { success: false, error: 'Invoice finalization is already in progress. Please wait.' };
    }
    this.activeFinalizeLocks.add(lockKey);

    try {
      // 1. Idempotency Check for Quotations
      if (payload.quotationId) {
        const existingQt = store.getQuotations().find((q) => q.id === payload.quotationId);
        if (existingQt && (existingQt.status === 'Converted' || existingQt.convertedInvoiceId)) {
          const linkedInv = store.getInvoices().find((i) => i.id === existingQt.convertedInvoiceId || i.quotationId === existingQt.id);
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
      }

      // 2. Authoritative Financial Calculations
      let calcSubtotal = 0;
      let calcDiscountTotal = 0;
      let calcTaxTotal = 0;
      let calcGrandTotal = 0;
      const validPayloadItems = filterValidLineItems(payload.items || []);
      if (validPayloadItems.length === 0) {
        return { success: false, error: 'Add at least one product/item before continuing.' };
      }

      const normalizedItems = validPayloadItems.map((item, idx) => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const rate = Number(item.sellingPrice ?? item.price ?? item.rate ?? 0);
        const disc = Math.max(0, Number(item.discountAmount ?? 0));
        const taxPct = Math.max(0, Number(item.taxPercent ?? item.taxRate ?? 0));
        const base = qty * rate;
        const taxable = Math.max(0, base - disc);
        const taxAmt = item.taxAmount !== undefined ? Number(item.taxAmount) : Number(((taxable * taxPct) / 100).toFixed(2));
        const lineTotal = item.total !== undefined ? Number(item.total) : Number((taxable + taxAmt).toFixed(2));

        calcSubtotal += taxable;
        calcDiscountTotal += disc;
        calcTaxTotal += taxAmt;
        calcGrandTotal += lineTotal;

        return {
          id: item.id || `item-${Date.now()}-${idx}`,
          productId: item.productId || item.product_id || null,
          productName: item.productName || item.product_name || item.name || 'Product',
          description: item.description || null,
          partNumber: item.partNumber || item.part_number || null,
          sku: item.sku || '',
          unit: item.unit || 'Pcs',
          quantity: qty,
          buyPrice: Number(item.buyPrice || item.buy_price || 0),
          sellingPrice: rate,
          discountAmount: disc,
          taxPercent: taxPct,
          taxAmount: taxAmt,
          total: lineTotal,
          itemType: item.itemType || (item.productId ? 'product' : 'custom'),
        };
      });

      const finalGrandTotal = payload.grandTotal !== undefined && Number(payload.grandTotal) > 0
        ? Number(Number(payload.grandTotal).toFixed(2))
        : Number(calcGrandTotal.toFixed(2));
      const finalSubtotal = payload.subtotal !== undefined ? Number(Number(payload.subtotal).toFixed(2)) : Number(calcSubtotal.toFixed(2));
      const finalDiscountTotal = payload.discountTotal !== undefined ? Number(Number(payload.discountTotal).toFixed(2)) : Number(calcDiscountTotal.toFixed(2));
      const finalTaxTotal = payload.taxTotal !== undefined ? Number(Number(payload.taxTotal).toFixed(2)) : Number(calcTaxTotal.toFixed(2));

      let rawPaid = 0;
      if (
        payload.paymentStatus === 'Fully Paid' ||
        payload.paymentStatus === 'Paid' ||
        (payload.paidAmount !== undefined && payload.paidAmount >= finalGrandTotal && finalGrandTotal > 0)
      ) {
        rawPaid = finalGrandTotal;
      } else if (
        payload.paymentStatus === 'Partially Paid' ||
        (payload.paidAmount !== undefined && payload.paidAmount > 0)
      ) {
        rawPaid = Number(payload.paidAmount) || 0;
      } else {
        rawPaid = 0;
      }

      const {
        grandTotal: normGrandTotal,
        paidAmount: normPaid,
        balanceAmount: normBal,
        status: normStat,
      } = calculateInvoiceFinancials(finalGrandTotal, rawPaid);

      let effectivePaid = normPaid;
      let effectiveBalance = normBal;
      let effectiveStatus: InvoiceStatus = normStat;

      // 3. Authoritative Stock Validation (Catalog items check available stock; custom items exempt)
      const requestedByProduct = new Map<string, { name: string; quantity: number }>();
      for (const item of normalizedItems) {
        if (item.productId && item.itemType !== 'custom') {
          const prev = requestedByProduct.get(item.productId);
          if (prev) {
            prev.quantity += item.quantity;
          } else {
            requestedByProduct.set(item.productId, {
              name: item.productName || 'Product',
              quantity: item.quantity,
            });
          }
        }
      }

      for (const [pId, req] of requestedByProduct.entries()) {
        const avail = await productService.getProductAvailableStock(pId, payload.branchId);
        if (avail < req.quantity) {
          return {
            success: false,
            error: `Insufficient stock for "${req.name}". Requested ${req.quantity}, but only ${avail} units are available.`,
          };
        }
      }

      // 4. Resolve Authoritative Workspace ID
      let wsId = '';
      try {
        wsId = await this.getOrFetchWorkspaceId();
      } catch {
        wsId = this.getWorkspaceId();
      }

      const resolvedBranch = resolveBranch(payload.branchId);
      const canonicalBranchId = resolvedBranch?.id || payload.branchId;

      const invoicePayload = {
        workspaceId: wsId || undefined,
        branchId: canonicalBranchId,
        quotationId: payload.quotationId,
        customerId: payload.customerId,
        customerName: payload.customerName || 'Walk-in Customer',
        customerPhone: payload.customerPhone || '',
        customerWhatsapp: payload.customerWhatsapp || '',
        customerEmail: payload.customerEmail || '',
        customerAddress: payload.customerAddress || '',
        customerGstin: payload.customerGstin || '',
        status: effectiveStatus,
        date: payload.date || new Date().toISOString().split('T')[0],
        dueDate: payload.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
        items: normalizedItems,
        subtotal: finalSubtotal,
        discountTotal: finalDiscountTotal,
        taxTotal: finalTaxTotal,
        grandTotal: finalGrandTotal,
        paidAmount: effectivePaid,
        balanceAmount: effectiveBalance,
        notes: payload.notes || (canonicalBranchId ? `[branch: ${canonicalBranchId}]` : undefined),
        terms: payload.terms,
        footerText: payload.footerText,
        templateId: payload.templateId || 'inv-modern-blue',
        branding: payload.branding,
        theme: payload.theme,
        customization: payload.customization,
        snapshot: {
          ...(typeof payload.snapshot === 'object' && payload.snapshot ? payload.snapshot : {}),
          branch_id: canonicalBranchId,
          branchId: canonicalBranchId,
        },
      };

      let authoritativeInvoiceId = (payload.id && isValidUuid(payload.id)) ? payload.id : crypto.randomUUID();
      let authoritativeInvoiceNumber = payload.invoiceNumber;
      let isAtomicRpcExecuted = false;

      // 5. Persist to Remote Supabase FIRST (enforcing atomic finalization RPC with multi-step fallback)
      if (isSupabaseConfigured() && isValidUuid(wsId) && Boolean(supabaseAuthService.getUser())) {
        try {
          const { data: rpcData, error: rpcErr } = await supabase.rpc('finalize_invoice_transaction', {
            p_payload: {
              workspace_id: wsId,
              branch_id: (canonicalBranchId && isValidUuid(canonicalBranchId)) ? canonicalBranchId : undefined,
              id: isValidUuid(authoritativeInvoiceId) ? authoritativeInvoiceId : undefined,
              invoice_id: isValidUuid(authoritativeInvoiceId) ? authoritativeInvoiceId : undefined,
              invoice_number: authoritativeInvoiceNumber || undefined,
              quotation_id: isValidUuid(payload.quotationId) ? payload.quotationId : undefined,
              customer_id: isValidUuid(payload.customerId) ? payload.customerId : undefined,
              customer_name: payload.customerName || 'Walk-in Customer',
              customer_phone: payload.customerPhone || '',
              customer_whatsapp: payload.customerWhatsapp || '',
              customer_email: payload.customerEmail || '',
              customer_address: payload.customerAddress || '',
              customer_gstin: payload.customerGstin || '',
              date: payload.date || new Date().toISOString().split('T')[0],
              due_date: payload.dueDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
              subtotal: finalSubtotal,
              discount_total: finalDiscountTotal,
              tax_total: finalTaxTotal,
              grand_total: finalGrandTotal,
              paid_amount: effectivePaid,
              payment_mode: payload.paymentMode || 'Cash',
              payment_reference: payload.paymentReference,
              payment_notes: payload.paymentNotes,
              payment_date: payload.paymentDate || payload.date || new Date().toISOString().split('T')[0],
              notes: payload.notes,
              terms: payload.terms,
              footer_text: payload.footerText,
              template_id: payload.templateId || 'inv-modern-blue',
              branding: payload.branding,
              theme: payload.theme,
              customization: payload.customization,
              snapshot: payload.snapshot,
              items: normalizedItems,
            },
          });

          if (rpcErr) {
            // Reject immediately if the database raised a business validation rejection
            if (
              rpcErr.message?.includes('INSUFFICIENT_STOCK') ||
              rpcErr.message?.includes('OVERPAYMENT_REJECTED') ||
              rpcErr.message?.includes('INVALID_AMOUNT') ||
              rpcErr.message?.includes('UNAUTHORIZED')
            ) {
              return { success: false, error: rpcErr.message };
            }

            // Structured Forensic Developer Logging (Section 22)
            console.error('[Invoice Finalization Failed]', {
              invoiceId: authoritativeInvoiceId,
              workspaceId: wsId,
              operation: 'finalize_invoice_transaction RPC',
              supabaseCode: rpcErr.code || 'UNKNOWN',
              table: 'invoices',
              column: 'branch_id/rpc',
              message: rpcErr.message,
              details: rpcErr.details,
              hint: rpcErr.hint,
            });

            console.warn('[finalizeAuthoritativeInvoice] finalize_invoice_transaction RPC notice, executing resilient fallback pipeline:', rpcErr);
          } else if (rpcData?.success) {
            isAtomicRpcExecuted = true;
            authoritativeInvoiceId = rpcData.invoice_id || authoritativeInvoiceId;
            authoritativeInvoiceNumber = rpcData.invoice_number || authoritativeInvoiceNumber;
            if (rpcData.status) {
              effectiveStatus = rpcData.status as InvoiceStatus;
            }
            if (rpcData.paid_amount !== undefined) {
              effectivePaid = Number(rpcData.paid_amount);
            }
            if (rpcData.balance_amount !== undefined) {
              effectiveBalance = Number(rpcData.balance_amount);
            }
          }
        } catch (rpcEx: any) {
          console.error('[Invoice Finalization Failed - Exception]', {
            invoiceId: authoritativeInvoiceId,
            workspaceId: wsId,
            operation: 'finalize_invoice_transaction RPC exception',
            error: rpcEx.message || rpcEx,
          });
        }

        // Fallback multi-step pipeline if RPC was unavailable (e.g. migration not applied yet)
        if (!isAtomicRpcExecuted) {
          const subRes = await this.createInvoice({
            ...invoicePayload,
            invoiceNumber: authoritativeInvoiceNumber || undefined,
            quotationId: payload.quotationId,
            status: 'Draft',
            paidAmount: effectivePaid,
            balanceAmount: effectiveBalance,
          }, normalizedItems);

          if (!subRes.invoiceId || subRes.error) {
            console.error('[Invoice Finalization Failed - Fallback]', {
              invoiceId: authoritativeInvoiceId,
              workspaceId: wsId,
              operation: 'createInvoice fallback',
              error: subRes.error,
            });
            return {
              success: false,
              error: subRes.error?.includes('insufficient stock')
                ? subRes.error
                : 'Unable to finalize invoice. No financial or stock changes were made. Please try again.',
            };
          }

          authoritativeInvoiceId = subRes.invoiceId;

          // Transition invoice status in database
          if (isValidUuid(authoritativeInvoiceId)) {
            try {
              const { error: invUpErr } = await supabase
                .from('invoices')
                .update({
                  status: effectiveStatus,
                  paid_amount: effectivePaid,
                  balance_amount: effectiveBalance,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', authoritativeInvoiceId)
                .eq('workspace_id', wsId);
              if (invUpErr) {
                console.error('[finalizeAuthoritativeInvoice] Supabase invoice status update failed:', invUpErr);
              }
            } catch (invUpErr) {
              console.warn('[finalizeAuthoritativeInvoice] Supabase invoice status update notice:', invUpErr);
            }
          }

          if (payload.quotationId || payload.quotationNumber) {
            try {
              const updatePayload: any = {
                status: 'Converted',
                updated_at: new Date().toISOString(),
              };
              if (isValidUuid(authoritativeInvoiceId)) {
                updatePayload.converted_invoice_id = authoritativeInvoiceId;
              }

              let updateQuery = supabase.from('quotations').update(updatePayload).eq('workspace_id', wsId);
              if (isValidUuid(payload.quotationId)) {
                await updateQuery.eq('id', payload.quotationId);
              } else if (payload.quotationNumber) {
                await updateQuery.eq('quotation_number', payload.quotationNumber);
              }
            } catch (qtUpErr) {
              console.warn('[finalizeAuthoritativeInvoice] Quotation Supabase status update notice:', qtUpErr);
            }
          }
        }
      }

      // 6. Persist / Mirror to Local Store (reflecting validated execution)
      const localInvoiceData = {
        ...invoicePayload,
        id: authoritativeInvoiceId,
        status: effectiveStatus,
        paidAmount: effectivePaid,
        balanceAmount: effectiveBalance,
        paymentMethod: payload.paymentMode || 'Cash',
        paymentMode: payload.paymentMode || 'Cash',
        skipStockDeduction: true,
      };

      let inv: Invoice;
      if (payload.id && store.getInvoices().some((i) => i.id === payload.id)) {
        inv = store.updateInvoice(payload.id, localInvoiceData) as Invoice;
      } else if (store.getInvoices().some((i) => i.id === authoritativeInvoiceId)) {
        inv = store.updateInvoice(authoritativeInvoiceId, localInvoiceData) as Invoice;
      } else {
        inv = store.addInvoice(localInvoiceData as any);
        if (authoritativeInvoiceId && inv.id !== authoritativeInvoiceId) {
          inv.id = authoritativeInvoiceId;
        }
      }

      if (authoritativeInvoiceNumber && authoritativeInvoiceNumber !== inv.invoiceNumber) {
        inv.invoiceNumber = authoritativeInvoiceNumber;
      }

      // Link quotation in store
      if (payload.quotationId || payload.quotationNumber) {
        const qt = store.getQuotations().find(
          (q) => q.id === payload.quotationId || (payload.quotationNumber && q.quotationNumber === payload.quotationNumber)
        );
        if (qt) {
          qt.status = 'Converted';
          qt.convertedInvoiceId = inv.id;
          qt.convertedAt = new Date().toISOString();
          qt.updatedAt = new Date().toISOString();
        }
        store.saveAndNotify();
      }

      // Sync local tenant storage mirror
      const localInvoices = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      const existingIdx = localInvoices.findIndex((i: any) => i.id === inv.id || i.invoice_number === inv.invoiceNumber);
      const localRow = {
        ...inv,
        invoice_number: inv.invoiceNumber,
        quotation_id: payload.quotationId || null,
        grand_total: inv.grandTotal,
        paid_amount: inv.paidAmount,
        balance_amount: inv.balanceAmount,
      };
      if (existingIdx >= 0) {
        localInvoices[existingIdx] = localRow;
      } else {
        localInvoices.unshift(localRow);
      }
      safeSaveTenantStorage(LOCAL_INVOICES_KEY, localInvoices);

      // Synchronize stock levels for products that were deducted
      for (const [pId, req] of requestedByProduct.entries()) {
        try {
          if (!isAtomicRpcExecuted) {
            store.adjustStock(pId, 'Sale', -req.quantity, `Invoice Finalization #${inv.invoiceNumber}`, inv.invoiceNumber, canonicalBranchId);
            if (isSupabaseConfigured() && isValidUuid(wsId)) {
              const { data: currentProd } = await supabase
                .from('products')
                .select('current_stock')
                .eq('workspace_id', wsId)
                .eq('id', pId)
                .maybeSingle();

              if (currentProd) {
                const newStock = Math.max(0, (Number(currentProd.current_stock) || 0) - req.quantity);
                await supabase
                  .from('products')
                  .update({ current_stock: newStock, updated_at: new Date().toISOString() })
                  .eq('workspace_id', wsId)
                  .eq('id', pId);
              }

              try {
                const smRow: any = {
                  workspace_id: wsId,
                  product_id: pId,
                  movement_type: 'Sale',
                  quantity: -req.quantity,
                  source_id: authoritativeInvoiceId,
                  source_type: 'INVOICE',
                  reference_number: inv.invoiceNumber,
                  notes: `Invoice Finalization #${inv.invoiceNumber}${canonicalBranchId ? ` [branch: ${canonicalBranchId}]` : ''}`,
                };
                if (canonicalBranchId && isValidUuid(canonicalBranchId)) {
                  smRow.branch_id = canonicalBranchId;
                }
                const { error: smErr } = await supabase.from('stock_movements').insert([smRow]);
                if (smErr && (smErr.code === '42703' || smErr.code === 'PGRST204')) {
                  delete smRow.branch_id;
                  await supabase.from('stock_movements').insert([smRow]);
                }
              } catch {}
            }
          }
          const remainingStock = await productService.getProductAvailableStock(pId, canonicalBranchId);
          store.syncProductStock(pId, remainingStock);
        } catch {
          // ignore
        }
      }

      // 7. Post Authoritative Daybook Transaction (Only executed if RPC was not already committed remotely)
      const pStatusTag = effectiveBalance <= 0.01 ? 'PAID' : (effectivePaid > 0 ? 'PARTIALLY PAID' : 'UNPAID');
      const invoiceDesc = payload.source === 'QUOTATION'
        ? `Invoice #${inv.invoiceNumber} (Converted from Quotation #${payload.quotationNumber || payload.quotationId})`
        : `Invoice #${inv.invoiceNumber}`;

      if (!isAtomicRpcExecuted) {
        try {
          const { daybookService } = await import('./daybookService');
          await daybookService.recordFinancialTransaction({
            referenceType: 'INVOICE',
            referenceId: authoritativeInvoiceId,
            referenceNumber: inv.invoiceNumber,
            branchId: payload.branchId,
            transactionType: 'SALE',
            direction: 'IN',
            amount: 0, // Commercial document records gross sale volume (totalAmount); cash inflow is recorded authoritatively by payment record
            totalAmount: finalGrandTotal, // Gross sales volume
            remainingAmount: effectiveBalance,
            paymentStatus: pStatusTag,
            paymentMode: effectivePaid > 0 ? (payload.paymentMode || 'Cash') : 'Cash',
            partyType: 'customer',
            partyId: payload.customerId || undefined,
            partyName: payload.customerName || 'Customer',
            description: invoiceDesc,
            transactionDate: inv.date,
          });
        } catch (dbErr) {
          console.warn('[finalizeAuthoritativeInvoice] Daybook sync notice:', dbErr);
        }

        // 8. Authoritative Cashbook Entry & Upfront Payment Posting (STRICT RULE: ONLY when effectivePaid > 0)
        if (effectivePaid > 0) {
          try {
            const { cashbookService } = await import('./cashbookService');
            await cashbookService.recordCashbookEntry({
              sourceType: 'INVOICE_PAYMENT',
              sourceId: authoritativeInvoiceId,
              referenceNumber: inv.invoiceNumber,
              branchId: payload.branchId,
              direction: 'IN',
              amount: effectivePaid,
              paymentMethod: payload.paymentMode || 'Cash',
              partyName: payload.customerName || 'Customer',
              description: `Payment receipt for Invoice #${inv.invoiceNumber}`,
              notes: payload.paymentNotes,
              transactionDate: payload.paymentDate || inv.date,
            });
          } catch (cbErr) {
            console.warn('[finalizeAuthoritativeInvoice] Cashbook entry notice:', cbErr);
          }

          try {
            const upfrontNotes = payload.paymentNotes || (payload.source === 'QUOTATION' ? `Payment recorded at quotation conversion (${payload.quotationNumber || inv.invoiceNumber})` : `Payment recorded at invoice finalization`);
            const payMethod = payload.paymentMode || 'Cash';
            const payRef = payload.paymentReference || null;

            // 1. Persist to local store and local tenant storage
            const count = (store.getPayments()?.length || 0) + 1;
            const year = new Date().getFullYear();
            const localPayRecord: Payment = {
              id: `pay-init-${authoritativeInvoiceId}`,
              paymentNumber: `PAY-${year}-${String(count).padStart(4, '0')}`,
              customerId: payload.customerId || '',
              customerName: payload.customerName || 'Customer',
              invoiceId: authoritativeInvoiceId,
              invoiceNumber: inv.invoiceNumber,
              branchId: payload.branchId || inv.branchId,
              amount: effectivePaid,
              date: payload.paymentDate || inv.date,
              method: payMethod as any,
              referenceNo: payRef || '',
              notes: upfrontNotes,
              createdAt: new Date().toISOString(),
            };
            store.addPayment(localPayRecord);

            // 2. Persist to remote Supabase payments table
            if (isSupabaseConfigured() && isValidUuid(wsId) && isValidUuid(authoritativeInvoiceId)) {
              const fullPayRow: Record<string, any> = {
                workspace_id: wsId,
                invoice_id: authoritativeInvoiceId,
                invoice_number: inv.invoiceNumber,
                customer_id: isValidUuid(payload.customerId) ? payload.customerId : null,
                customer_name: payload.customerName || 'Customer',
                amount: effectivePaid,
                payment_date: payload.paymentDate || inv.date,
                method: payMethod,
                payment_method: payMethod,
                reference_no: payRef,
                reference_number: payRef,
                notes: upfrontNotes,
              };
              if (payload.branchId && isValidUuid(payload.branchId)) {
                fullPayRow.branch_id = payload.branchId;
              }

              let { error: payErr } = await supabase.from('payments').insert([fullPayRow]);

              // Resilience against unmigrated schema: if branch_id, payment_method, or reference_number fail with PGRST204, strip to core columns and retry
              if (payErr && (payErr.code === 'PGRST204' || payErr.code === '42703')) {
                console.warn('[finalizeAuthoritativeInvoice] Payments column mismatch in schema cache (PGRST204); retrying with core columns');
                const corePayRow = {
                  workspace_id: wsId,
                  invoice_id: authoritativeInvoiceId,
                  invoice_number: inv.invoiceNumber,
                  customer_id: isValidUuid(payload.customerId) ? payload.customerId : null,
                  customer_name: payload.customerName || 'Customer',
                  amount: effectivePaid,
                  payment_date: payload.paymentDate || inv.date,
                  method: payMethod,
                  reference_no: payRef,
                  notes: upfrontNotes,
                };
                const retryPayRes = await supabase.from('payments').insert([corePayRow]);
                payErr = retryPayRes.error;
              }

              if (payErr) {
                console.error('[finalizeAuthoritativeInvoice] Critical: Remote payment insert failed:', payErr);
              }
            }
          } catch (payErr) {
            console.error('[finalizeAuthoritativeInvoice] Upfront payment persistence notice:', payErr);
          }
        }
      }

      // 9. Authoritative Udhari Receivable Synchronization
      try {
        store.syncInvoiceUdhari({
          invoiceId: authoritativeInvoiceId,
          invoiceNumber: inv.invoiceNumber,
          branchId: payload.branchId || inv.branchId,
          customerId: payload.customerId,
          customerName: payload.customerName || 'Customer',
          customerPhone: payload.customerPhone || '9999999999',
          grandTotal: finalGrandTotal,
          paidAmount: effectivePaid,
          balanceAmount: effectiveBalance,
          dueDate: inv.dueDate,
        });

        if (!isAtomicRpcExecuted) {
          const { udhariService } = await import('./udhariService');
          await udhariService.syncInvoiceUdhari({
            invoiceId: authoritativeInvoiceId,
            invoiceNumber: inv.invoiceNumber,
            branchId: payload.branchId || inv.branchId,
            customerId: payload.customerId,
            customerName: payload.customerName || 'Customer',
            customerPhone: payload.customerPhone || '9999999999',
            grandTotal: finalGrandTotal,
            paidAmount: effectivePaid,
            balanceAmount: effectiveBalance,
            dueDate: inv.dueDate,
          });
        }
      } catch (uErr) {
        console.warn('[finalizeAuthoritativeInvoice] Udhari sync notice:', uErr);
      }

      // 9. Invalidate Analytics Caches and Trigger Dashboard Refresh
      try {
        const { salesAnalyticsService } = await import('./salesAnalyticsService');
        salesAnalyticsService.invalidateCache();
      } catch {
        // ignore
      }

      store.saveAndNotify();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));
      }

      return {
        success: true,
        invoiceId: authoritativeInvoiceId,
        invoiceNumber: inv.invoiceNumber,
        paidAmount: effectivePaid,
        balanceAmount: effectiveBalance,
        status: effectiveStatus,
      };
    } catch (err: any) {
      console.error('[finalizeAuthoritativeInvoice] Uncaught error:', err);
      return { success: false, error: err.message || 'Authoritative invoice finalization failed.' };
    } finally {
      this.activeFinalizeLocks.delete(lockKey);
    }
  }
}

export interface AuthoritativeInvoicePayload {
  branchId?: string;
  source: 'MANUAL' | 'QUOTATION';
  quotationId?: string;
  quotationNumber?: string;
  id?: string;
  invoiceNumber?: string;
  date?: string;
  dueDate?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerWhatsapp?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerGstin?: string;
  status?: InvoiceStatus;
  items: any[];
  subtotal?: number;
  discountTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  paymentStatus?: 'Unpaid' | 'Partially Paid' | 'Fully Paid' | 'Paid';
  paidAmount?: number;
  balanceAmount?: number;
  paymentMode?: string;
  paymentReference?: string;
  paymentNotes?: string;
  paymentDate?: string;
  notes?: string;
  terms?: string;
  footerText?: string;
  templateId?: string;
  branding?: any;
  theme?: any;
  customization?: any;
  snapshot?: any;
}

export interface AuthoritativeInvoiceResult {
  success: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  paidAmount?: number;
  balanceAmount?: number;
  status?: string;
  error?: string;
}

export const invoiceService = new InvoiceService();

