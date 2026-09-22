import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Invoice, Product, InvoiceStatus } from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { store } from '../store';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { productService } from './productService';
import { fromDbInvoice } from './types';
import { calculateInvoiceFinancials } from '../financialCalculationService';
const LOCAL_INVOICES_KEY = 'vistaar_local_invoices_db';

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
      console.error('Failed to get authoritative workspace ID in invoiceService:', e?.message || e);
      throw e;
    }
    throw new Error('[WORKSPACE RESOLUTION FAILED] Authoritative workspace ID could not be determined in invoiceService.');
  }

  public async getInvoices(options?: {
    search?: string;
    customerId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
    workspaceId?: string;
  }): Promise<{ data: any[]; count: number; error?: string }> {
    const wsId = options?.workspaceId && isValidUuid(options.workspaceId) ? options.workspaceId : await this.getOrFetchWorkspaceId();
    let query = supabase.from('invoices').select('*, invoice_items(*)', { count: 'exact' });
    if (isValidUuid(wsId)) {
      query = query.eq('workspace_id', wsId);
    }

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
        const mappedFallback = fallback.map((inv: any) => fromDbInvoice(inv));
        return { data: mappedFallback, count: mappedFallback.length, error: errStr };
      }
      const mapped = (data || []).map((row: any) => fromDbInvoice(row));
      return { data: mapped, count: count || mapped.length };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getInvoices');
      const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      const mappedFallback = fallback.map((inv: any) => fromDbInvoice(inv));
      return { data: mappedFallback, count: mappedFallback.length, error: errStr };
    }
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

      const { data, error } = await query.single();

      if (error) {
        const errStr = handleSupabaseError(error, 'getInvoiceById');
        const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
        const match = fallback.find((inv) => inv.id === id || inv.invoice_number === id);
        return { invoice: match ? fromDbInvoice(match) : undefined, error: match ? undefined : errStr };
      }
      return { invoice: data ? fromDbInvoice(data) : undefined };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getInvoiceById');
      const fallback = safeGetTenantStorage<any>(LOCAL_INVOICES_KEY, []);
      const match = fallback.find((inv) => inv.id === id || inv.invoice_number === id);
      return { invoice: match ? fromDbInvoice(match) : undefined, error: match ? undefined : errStr };
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

      const { data: parent, error: parentErr } = await supabase
        .from('invoices')
        .insert([{
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

      // Step 3: If invoice status is Finalized, execute atomic stock deduction via finalizeInvoice
      if (isFinalized) {
        const finRes = await this.finalizeInvoice(invoiceId);
        if (!finRes.success) {
          // Rollback invoice creation if stock deduction failed
          await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
          await supabase.from('invoices').delete().eq('id', invoiceId);
          return { error: finRes.error || 'Invoice finalization failed due to insufficient stock.' };
        }

        // If desired final status is Paid or Partially Paid, update status from Issued to target
        if (invoice.status && invoice.status !== 'Issued' && invoice.status !== 'Draft') {
          await supabase
            .from('invoices')
            .update({ status: invoice.status, updated_at: new Date().toISOString() })
            .eq('id', invoiceId)
            .eq('workspace_id', wsId);
        }

        const { grandTotal: total, paidAmount: paid, balanceAmount: remaining } = calculateInvoiceFinancials(
          invoice.grandTotal,
          invoice.paidAmount
        );
        const pStatus = remaining <= 0.01 ? 'PAID' : (paid > 0 ? 'PARTIALLY PAID' : 'UNPAID');

        // Record Daybook sale entry with strictly partitioned Inflow and Gross Total
        try {
          const { daybookService } = await import('./daybookService');
          await daybookService.recordFinancialTransaction({
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
          code === 'PGRST202' ||
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

      for (const [productId, req] of reqMap.entries()) {
        const currentStock = await productService.getProductAvailableStock(productId);
        if (currentStock < req.qty) {
          return {
            success: false,
            error: `Insufficient stock for "${req.name}". Requested ${req.qty}, but only ${currentStock} units are available.`,
          };
        }
      }

      // Perform stock deduction across line products
      for (const [productId, req] of reqMap.entries()) {
        store.adjustStock(productId, 'Sale', -req.qty, `Invoice Finalization #${invNumber}`, invNumber);

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
          } catch (e) {
            console.warn('[Stock Deduction] Supabase update warning:', e);
          }
        }
      }

      // Invalidate product service cache so all views receive fresh stock immediately
      productService.invalidateCache();

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

      const normalizedItems = (payload.items || []).map((item, idx) => {
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

      let effectivePaid = 0;
      let effectiveBalance = finalGrandTotal;
      let effectiveStatus: InvoiceStatus = 'Issued';

      if (payload.paymentStatus === 'Fully Paid') {
        effectivePaid = finalGrandTotal;
        effectiveBalance = 0;
        effectiveStatus = 'Paid';
      } else if (payload.paymentStatus === 'Partially Paid') {
        effectivePaid = Math.max(0, Math.min(finalGrandTotal, Number(payload.paidAmount) || 0));
        effectiveBalance = Math.max(0, Number((finalGrandTotal - effectivePaid).toFixed(2)));
        effectiveStatus = effectiveBalance <= 0.01 ? 'Paid' : 'Partially Paid';
      } else {
        effectivePaid = 0;
        effectiveBalance = finalGrandTotal;
        effectiveStatus = 'Issued';
      }

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
        const avail = await productService.getProductAvailableStock(pId);
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

      const invoicePayload = {
        workspaceId: wsId || undefined,
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
        notes: payload.notes,
        terms: payload.terms,
        footerText: payload.footerText,
        templateId: payload.templateId || 'inv-modern-blue',
        branding: payload.branding,
        theme: payload.theme,
        customization: payload.customization,
        snapshot: payload.snapshot,
      };

      let authoritativeInvoiceId = payload.id || `inv-${Date.now()}`;
      let authoritativeInvoiceNumber = payload.invoiceNumber;

      // 5. Persist to Remote Supabase FIRST (enforcing atomic stock deduction)
      if (isSupabaseConfigured() && isValidUuid(wsId) && Boolean(supabaseAuthService.getUser())) {
        const subRes = await this.createInvoice({
          ...invoicePayload,
          invoiceNumber: authoritativeInvoiceNumber || undefined,
          quotationId: payload.quotationId,
          status: effectiveStatus,
          paidAmount: effectivePaid,
          balanceAmount: effectiveBalance,
        }, normalizedItems);

        if (!subRes.invoiceId || subRes.error) {
          return {
            success: false,
            error: subRes.error || 'Invoice finalization failed due to database error.',
          };
        }

        authoritativeInvoiceId = subRes.invoiceId;

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

      // 6. Persist / Mirror to Local Store (reflecting validated execution)
      const localInvoiceData = {
        ...invoicePayload,
        id: authoritativeInvoiceId,
        status: effectiveStatus,
        paidAmount: effectivePaid,
        balanceAmount: effectiveBalance,
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

      // Synchronize local store stock levels for products that were deducted
      for (const [pId] of requestedByProduct.entries()) {
        try {
          const remainingStock = await productService.getProductAvailableStock(pId);
          store.syncProductStock(pId, remainingStock);
        } catch {
          // ignore
        }
      }

      // 6. Post Authoritative Daybook Transaction
      const pStatusTag = effectiveBalance <= 0.01 ? 'PAID' : (effectivePaid > 0 ? 'PARTIALLY PAID' : 'UNPAID');
      const invoiceDesc = payload.source === 'QUOTATION'
        ? `Invoice #${inv.invoiceNumber} (Converted from Quotation #${payload.quotationNumber || payload.quotationId})`
        : `Invoice #${inv.invoiceNumber}`;

      try {
        const { daybookService } = await import('./daybookService');
        await daybookService.recordFinancialTransaction({
          referenceType: 'INVOICE',
          referenceId: authoritativeInvoiceId,
          referenceNumber: inv.invoiceNumber,
          transactionType: 'SALE',
          direction: 'IN',
          amount: effectivePaid, // Inflow = actual cash received
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

      // 7. Authoritative Cashbook Entry & Payment Posting (STRICT RULE: ONLY when effectivePaid > 0)
      if (effectivePaid > 0) {
        try {
          const { cashbookService } = await import('./cashbookService');
          await cashbookService.recordCashbookEntry({
            sourceType: 'INVOICE_PAYMENT',
            sourceId: authoritativeInvoiceId,
            referenceNumber: inv.invoiceNumber,
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
          const { paymentService } = await import('./paymentService');
          await paymentService.createPayment({
            invoiceId: authoritativeInvoiceId,
            invoiceNumber: inv.invoiceNumber,
            customerId: payload.customerId,
            customerName: payload.customerName || 'Customer',
            amount: effectivePaid,
            date: payload.paymentDate || inv.date,
            method: (payload.paymentMode || 'Cash') as any,
            referenceNo: payload.paymentReference,
            notes: payload.paymentNotes || (payload.source === 'QUOTATION' ? `Payment recorded at quotation conversion (${payload.quotationNumber || inv.invoiceNumber})` : `Payment recorded at invoice finalization`),
            isUpfrontInvoicePayment: true,
          });
        } catch (payErr) {
          console.warn('[finalizeAuthoritativeInvoice] Cashbook/Payment sync notice:', payErr);
        }
      }

      // 8. Authoritative Udhari Receivable Synchronization (STRICT RULE: ONLY when effectiveBalance > 0.01)
      if (effectiveBalance > 0.01) {
        try {
          store.syncInvoiceUdhari({
            invoiceId: authoritativeInvoiceId,
            invoiceNumber: inv.invoiceNumber,
            customerId: payload.customerId,
            customerName: payload.customerName || 'Customer',
            customerPhone: payload.customerPhone || '9999999999',
            grandTotal: finalGrandTotal,
            paidAmount: effectivePaid,
            balanceAmount: effectiveBalance,
            dueDate: inv.dueDate,
          });

          const { udhariService } = await import('./udhariService');
          await udhariService.syncInvoiceUdhari({
            invoiceId: authoritativeInvoiceId,
            invoiceNumber: inv.invoiceNumber,
            customerId: payload.customerId,
            customerName: payload.customerName || 'Customer',
            customerPhone: payload.customerPhone || '9999999999',
            grandTotal: finalGrandTotal,
            paidAmount: effectivePaid,
            balanceAmount: effectiveBalance,
            dueDate: inv.dueDate,
          });
        } catch (uErr) {
          console.warn('[finalizeAuthoritativeInvoice] Udhari sync notice:', uErr);
        }
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
  paymentStatus?: 'Unpaid' | 'Partially Paid' | 'Fully Paid';
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

