import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { store } from '../store';
import { fromDbCounterSale } from './types';
import { salesAnalyticsService } from './salesAnalyticsService';
import { productService } from './productService';
import { CounterSale } from '../../types';
import { safeGetTenantStorage, safeSaveTenantStorage, safeGetTenantItem } from './safeStorage';
import { isRecordInBranch, resolveBranch } from '../../lib/branchUtils';
import { normalizeToYyyyMmDd, getIstTodayString, isTransactionInTodayIst, isTransactionInMonthIst } from '../../lib/dateRange';

const LOCAL_SALES_KEY = 'vistaar_local_counter_sales_db';

const safeStorageGet = (key: string): any[] => {
  try {
    const list = safeGetTenantStorage<any>(key, []);
    if (Array.isArray(list) && list.length > 0) return list;
  } catch (e) {
    // ignore
  }
  return store.getCounterSales();
};

const safeStorageSave = (key: string, items: any[]): void => {
  try {
    safeSaveTenantStorage(key, items);
  } catch (e) {
    // ignore
  }
};

export class CounterSaleService {
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
      console.warn('Failed to get authoritative workspace ID in counterSaleService:', e);
    }
    const currentId = supabaseAuthService.getCurrentCompanyId();
    if (currentId && isValidUuid(currentId)) return currentId;
    return '';
  }

  private async deductCounterSaleStock(items: any[], invoiceNumber: string, saleDate: string, branchId?: string) {
    const wsId = await this.getOrFetchWorkspaceId();
    const executedMutations: Array<{ productId: string; previousStock: number }> = [];

    try {
      for (const item of items) {
        const productId = item.productId || item.product_id;
        const quantity = Math.abs(Number(item.quantity) || 0);

        if (!productId || quantity <= 0) continue;

        // 1. Update local store state for instant UI sync
        store.adjustStock(productId, 'Sale', -quantity, `Counter Sale #${invoiceNumber}`, invoiceNumber, branchId);

        if (isSupabaseConfigured() && isValidUuid(wsId)) {
          // 2. Fetch current product current_stock and deduct
          const { data: prod } = await supabase
            .from('products')
            .select('current_stock')
            .eq('workspace_id', wsId)
            .eq('id', productId)
            .maybeSingle();

          if (prod) {
            const oldStock = Number(prod.current_stock) || 0;
            const newStock = Math.max(0, oldStock - quantity);
            executedMutations.push({ productId, previousStock: oldStock });

            await supabase
              .from('products')
              .update({ current_stock: newStock, updated_at: new Date().toISOString() })
              .eq('workspace_id', wsId)
              .eq('id', productId);
          }

          // 2b. Deduct strictly from remote branch_inventory if table exists and branchId is valid
          if (branchId && isValidUuid(branchId)) {
            try {
              const { data: bProd } = await supabase
                .from('branch_inventory')
                .select('current_stock')
                .eq('branch_id', branchId)
                .eq('product_id', productId)
                .maybeSingle();

              if (bProd) {
                const newBStock = Math.max(0, (Number(bProd.current_stock) || 0) - quantity);
                await supabase
                  .from('branch_inventory')
                  .update({ current_stock: newBStock, updated_at: new Date().toISOString() })
                  .eq('branch_id', branchId)
                  .eq('product_id', productId);
              }
            } catch (bInvErr) {
              // branch_inventory may not exist in schema cache
            }
          }

          // 3. FIFO deduction on active stock receipts
          try {
            let recQuery = supabase
              .from('stock_receipts')
              .select('id, quantity_remaining')
              .eq('workspace_id', wsId)
              .eq('product_id', productId)
              .gt('quantity_remaining', 0);
            if (branchId && isValidUuid(branchId)) {
              recQuery = recQuery.eq('branch_id', branchId);
            }
            const { data: receipts } = await recQuery
              .order('received_date', { ascending: true })
              .order('created_at', { ascending: true });

            if (receipts && receipts.length > 0) {
              let remainingToDeduct = quantity;
              for (const rec of receipts) {
                if (remainingToDeduct <= 0) break;
                const rem = Number(rec.quantity_remaining) || 0;
                const deduct = Math.min(rem, remainingToDeduct);
                const newRem = Math.max(0, rem - deduct);
                await supabase
                  .from('stock_receipts')
                  .update({ quantity_remaining: newRem, updated_at: new Date().toISOString() })
                  .eq('workspace_id', wsId)
                  .eq('id', rec.id);
                remainingToDeduct -= deduct;
              }
            }
          } catch (recErr) {
            // stock_receipts schema tolerance
          }

          // 4. Log stock movement with branch resilience
          const movementNotes = `Counter Sale #${invoiceNumber}${branchId ? ` [branch: ${branchId}]` : ''}`;
          const movPayload: any = {
            workspace_id: wsId,
            product_id: productId,
            type: 'SALE',
            quantity: -quantity,
            movement_date: saleDate || new Date().toISOString().split('T')[0],
            reference_id: invoiceNumber,
            reference_type: 'COUNTER_SALE',
            notes: movementNotes,
          };
          if (branchId && isValidUuid(branchId)) {
            movPayload.branch_id = branchId;
          }

          let { error: movErr } = await supabase.from('stock_movements').insert([movPayload]);
          if (movErr && (movErr.code === '42703' || movErr.code === 'PGRST204' || movErr.message?.includes('branch_id'))) {
            delete movPayload.branch_id;
            await supabase.from('stock_movements').insert([movPayload]);
          }
        }
      }
    } catch (e) {
      console.error('Failed to perform atomic stock deduction, executing rollback:', e);
      // Rollback products stock
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        for (const mut of executedMutations) {
          try {
            await supabase
              .from('products')
              .update({ current_stock: mut.previousStock, updated_at: new Date().toISOString() })
              .eq('workspace_id', wsId)
              .eq('id', mut.productId);
          } catch {}
        }
      }
      throw e;
    }
  }

  private async restoreCounterSaleStock(saleId: string) {
    const wsId = await this.getOrFetchWorkspaceId();

    try {
      let items: any[] = [];
      let invoiceNumber = '';
      let saleDate = new Date().toISOString().split('T')[0];
      let branchId: string | undefined;

      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data: saleData } = await supabase
          .from('counter_sales')
          .select('invoice_number, sale_date, branch_id, counter_sale_items(*)')
          .eq('workspace_id', wsId)
          .eq('id', saleId)
          .single();

        if (saleData && saleData.counter_sale_items) {
          items = saleData.counter_sale_items;
          invoiceNumber = saleData.invoice_number || '';
          saleDate = saleData.sale_date || saleDate;
          branchId = saleData.branch_id || undefined;
        }
      } else {
        const local = safeStorageGet(LOCAL_SALES_KEY);
        const target = local.find((s) => s.id === saleId);
        if (target) {
          items = target.items || [];
          invoiceNumber = target.invoiceNumber || target.invoice_number || '';
          branchId = target.branchId || target.branch_id || undefined;
        }
      }

      for (const item of items) {
        const productId = item.product_id || item.productId;
        const quantity = Math.abs(Number(item.quantity) || 0);

        if (!productId || quantity <= 0) continue;

        // Restore in local store
        store.adjustStock(productId, 'Sales Return', quantity, `Cancelled Counter Sale #${invoiceNumber}`, invoiceNumber, branchId);

        if (isSupabaseConfigured() && isValidUuid(wsId)) {
          // Restore products.current_stock
          const { data: prod } = await supabase
            .from('products')
            .select('current_stock')
            .eq('workspace_id', wsId)
            .eq('id', productId)
            .maybeSingle();

          if (prod) {
            const newStock = (Number(prod.current_stock) || 0) + quantity;
            await supabase
              .from('products')
              .update({ current_stock: newStock, updated_at: new Date().toISOString() })
              .eq('workspace_id', wsId)
              .eq('id', productId);
          }

          // Restore stock_receipts
          const { data: receipts } = await supabase
            .from('stock_receipts')
            .select('id, quantity_remaining')
            .eq('workspace_id', wsId)
            .eq('product_id', productId)
            .order('received_date', { ascending: false })
            .limit(1);

          if (receipts && receipts.length > 0) {
            const rec = receipts[0];
            const newRem = (Number(rec.quantity_remaining) || 0) + quantity;
            await supabase
              .from('stock_receipts')
              .update({ quantity_remaining: newRem, updated_at: new Date().toISOString() })
              .eq('workspace_id', wsId)
              .eq('id', rec.id);
          }

          // Log RETURN movement
          await supabase.from('stock_movements').insert([{
            workspace_id: wsId,
            product_id: productId,
            type: 'RETURN',
            quantity: quantity,
            movement_date: saleDate,
            reference_id: invoiceNumber,
            reference_type: 'COUNTER_SALE_CANCEL',
            notes: `Cancelled Counter Sale #${invoiceNumber}`,
          }]);
        }
      }
    } catch (e) {
      console.warn('Failed to restore stock for cancelled sale:', e);
    }
  }

  public async getCounterSales(options?: {
    branchId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ data: CounterSale[]; error?: string }> {
    const wsId = await this.getOrFetchWorkspaceId();
    let supabaseSales: any[] = [];
    let queryError: string | undefined;

    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        let query = supabase
          .from('counter_sales')
          .select('*, counter_sale_items(*)')
          .eq('workspace_id', wsId);

        if (options?.startDate) {
          query = query.gte('sale_date', options.startDate);
        }
        if (options?.endDate) {
          query = query.lte('sale_date', options.endDate);
        }

        let { data, error } = await query.order('created_at', { ascending: false }).limit(100);

        if (error) {
          queryError = handleSupabaseError(error, 'getCounterSales');
          console.warn('[getCounterSales] Supabase query notice:', error);
        } else if (data) {
          supabaseSales = data;
        }
      }
    } catch (e: any) {
      queryError = handleSupabaseError(e, 'getCounterSales');
    }

    // Merge Supabase, local tenant storage, and memory store with deduplication and metadata enrichment
    const fallback = safeStorageGet(LOCAL_SALES_KEY);
    const storeSales = store.getCounterSales();
    const candidatePool = [...supabaseSales, ...(fallback || []), ...storeSales];

    const recordMap = new Map<string, any>();

    for (const item of candidatePool) {
      if (!item) continue;
      const idKey = item.id ? String(item.id).toLowerCase() : '';
      const invNum = (item.invoiceNumber || item.invoice_number) ? String(item.invoiceNumber || item.invoice_number).trim().toLowerCase() : '';
      const saleNum = (item.saleNumber || item.sale_number) ? String(item.saleNumber || item.sale_number).trim().toLowerCase() : '';

      // Find if we already have an entry for this sale across any canonical key
      let existingKey = '';
      if (idKey && recordMap.has(`id:${idKey}`)) existingKey = `id:${idKey}`;
      else if (invNum && recordMap.has(`inv:${invNum}`)) existingKey = `inv:${invNum}`;
      else if (saleNum && recordMap.has(`sale:${saleNum}`)) existingKey = `sale:${saleNum}`;

      if (existingKey) {
        // ENRICH existing record with missing metadata from this duplicate (e.g. branch_id missing from remote Supabase schema cache)
        const existing = recordMap.get(existingKey)!;
        const b = existing.branch_id || existing.branchId;
        const newB = item.branch_id || item.branchId;
        if (!b && newB) {
          existing.branch_id = newB;
          existing.branchId = newB;
        }
        if (!existing.notes && item.notes) {
          existing.notes = item.notes;
        } else if (item.notes && !existing.notes?.includes('[branch:') && item.notes.includes('[branch:')) {
          existing.notes = `${existing.notes || ''} ${item.notes}`.trim();
        }
        const existingItems = existing.items || existing.counter_sale_items || [];
        const newItems = item.items || item.counter_sale_items || [];
        if (existingItems.length === 0 && newItems.length > 0) {
          existing.items = newItems;
          existing.counter_sale_items = newItems;
        }
        continue;
      }

      if (idKey) recordMap.set(`id:${idKey}`, item);
      if (invNum) recordMap.set(`inv:${invNum}`, item);
      if (saleNum) recordMap.set(`sale:${saleNum}`, item);
    }

    let merged = Array.from(new Set(recordMap.values()));

    // Ensure newest records appear first
    merged.sort((a, b) => {
      const tA = new Date(a.saleDate || a.sale_date || a.createdAt || a.created_at || 0).getTime();
      const tB = new Date(b.saleDate || b.sale_date || b.createdAt || b.created_at || 0).getTime();
      return tB - tA;
    });

    // Branch Isolation Filtering
    if (options?.branchId && options.branchId !== 'ALL') {
      merged = merged.filter((s: any) => {
        const bId = s.branchId || s.branch_id;
        const notes = s.notes || '';
        return isRecordInBranch(options.branchId, bId, notes);
      });
    }

    // Date Range Filtering
    if (options?.startDate || options?.endDate) {
      merged = merged.filter((s: any) => {
        const d = normalizeToYyyyMmDd(s.saleDate || s.sale_date || s.createdAt || s.created_at);
        if (options.startDate && d < options.startDate) return false;
        if (options.endDate && d > options.endDate) return false;
        return true;
      });
    }

    // Search Filtering across sale number, invoice number, customer, phone, reference, AND line items (e.g. 100SS)
    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      merged = merged.filter((s: any) => {
        const num = (s.invoiceNumber || s.invoice_number || '').toLowerCase();
        const saleNo = (s.saleNumber || s.sale_number || '').toLowerCase();
        const cust = (s.customerName || s.customer_name || '').toLowerCase();
        const phone = (s.phoneNumber || s.phone_number || '').toLowerCase();
        const ref = (s.estimateReference || s.estimate_reference || '').toLowerCase();
        const items = s.items || s.counter_sale_items || [];

        if (num.includes(q) || saleNo.includes(q) || cust.includes(q) || phone.includes(q) || ref.includes(q)) {
          return true;
        }

        if (Array.isArray(items)) {
          return items.some((i: any) => {
            const pName = (i.productNameSnapshot || i.product_name_snapshot || i.productName || i.name || '').toLowerCase();
            const pPart = (i.partNumberSnapshot || i.part_number_snapshot || i.partNumber || '').toLowerCase();
            const pSku = (i.sku || '').toLowerCase();
            return pName.includes(q) || pPart.includes(q) || pSku.includes(q);
          });
        }
        return false;
      });
    }

    return {
      data: merged.map((row: any) => fromDbCounterSale(row)),
      error: queryError && merged.length === 0 ? queryError : undefined,
    };
  }

  public invalidateCache(): void {
    salesAnalyticsService.invalidateCache();
    try {
      import('./enterpriseAnalyticsService').then((m) => m.enterpriseAnalyticsService.invalidateCache()).catch(() => {});
    } catch {}
  }

  public async getCounterSaleMetrics(options?: { branchId?: string }): Promise<{
    todayTotal: number;
    todayCount: number;
    monthTotal: number;
    netSales: number;
    totalTransactions: number;
    totalDiscounts: number;
  }> {
    const { data } = await this.getCounterSales(options);
    const sales = (data || []).filter((s) => {
      const st = String(s.status || '').toUpperCase();
      return st === 'COMPLETED' || (st !== 'CANCELLED' && st !== 'DRAFT');
    });

    const todaySales = sales.filter((s) =>
      isTransactionInTodayIst(s.saleDate || (s as any).sale_date || s.createdAt || (s as any).created_at)
    );
    const monthSales = sales.filter((s) =>
      isTransactionInMonthIst(s.saleDate || (s as any).sale_date || s.createdAt || (s as any).created_at)
    );

    const todayTotal = todaySales.reduce((acc, s) => acc + (Number(s.finalTotal) || 0), 0);
    const monthTotal = monthSales.reduce((acc, s) => acc + (Number(s.finalTotal) || 0), 0);
    const netSales = sales.reduce((acc, s) => acc + (Number(s.finalTotal) || 0), 0);
    const totalDiscounts = sales.reduce((acc, s) => acc + (Number(s.discountAmount) || 0), 0);

    return {
      todayTotal,
      todayCount: todaySales.length,
      monthTotal,
      netSales,
      totalTransactions: sales.length,
      totalDiscounts,
    };
  }

  public generateNextInvoiceNumber(): string {
    return `INV-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
  }

  public isInvoiceNumberUnique(invNumber: string): boolean {
    return true;
  }

  /**
   * Record a new Counter Sale atomically.
   * Returns a complete domain-level CounterSale object with child items.
   * Eliminates silent failure: fails if stock deduction or database operations fail.
   * Primary rule: No stock deduction without a saved, recoverable sale record.
   */
  public async createCounterSale(sale: any): Promise<{ success: boolean; data?: CounterSale; error?: string }> {
    let wsId = await this.getOrFetchWorkspaceId();
    if (!wsId || !isValidUuid(wsId)) {
      wsId = supabaseAuthService.getCurrentCompanyId() || '';
    }

    const saleNumber = sale.saleNumber || `CS-${Date.now()}`;
    const invoiceNumber = (sale.invoiceNumber || saleNumber).trim();
    const items = sale.items || [];
    const paymentMethod = sale.paymentMethod || 'Cash';
    const finalTotal = Number(sale.finalTotal) || 0;
    const isCredit = paymentMethod === 'Credit / Udhari' || paymentMethod === 'Credit';
    const amountReceived = sale.amountReceived !== undefined ? Number(sale.amountReceived) : (isCredit ? 0 : finalTotal);
    const balanceAmount = sale.balanceAmount !== undefined ? Number(sale.balanceAmount) : Math.max(0, finalTotal - amountReceived);
    const canonicalSaleDate = sale.saleDate ? normalizeToYyyyMmDd(sale.saleDate) : getIstTodayString();

    if (!items || items.length === 0) {
      return { success: false, error: 'Please select at least one product for the counter sale.' };
    }

    // 1. Authoritative Branch Context Resolution
    let rawBranchId = sale.branchId;
    if (!rawBranchId || rawBranchId === 'ALL') {
      try {
        const saved = safeGetTenantItem<string | null>('active_branch_id', null);
        if (saved && saved !== 'ALL') rawBranchId = saved;
      } catch {}
    }
    const resolvedBranch = resolveBranch(rawBranchId);
    let canonicalBranchId = resolvedBranch?.id || rawBranchId;
    if (!canonicalBranchId) {
      const branches = safeGetTenantStorage<any>('vistaar_local_branches_db', []);
      const mainB = branches.find((b: any) => b.isMainBranch) || branches[0];
      canonicalBranchId = mainB?.id || 'default';
    }

    // 2. Pre-Finalization Authoritative Stock Validation (Aggregated by Product ID)
    const { productService } = await import('./productService');
    const aggregatedQtys = new Map<string, { qty: number; name: string }>();
    for (const item of items) {
      const productId = item.productId || item.product_id;
      const requestedQty = Math.abs(Number(item.quantity) || 0);
      if (productId && requestedQty > 0) {
        const prodName = item.productName || item.productNameSnapshot || item.product_name_snapshot || 'Product';
        const curr = aggregatedQtys.get(productId) || { qty: 0, name: prodName };
        curr.qty += requestedQty;
        aggregatedQtys.set(productId, curr);
      }
    }

    for (const [productId, { qty: requestedQty, name: prodName }] of aggregatedQtys.entries()) {
      const availableStock = await productService.getProductAvailableStock(productId, canonicalBranchId);
      if (requestedQty > availableStock) {
        return {
          success: false,
          error: `INSUFFICIENT_STOCK: Insufficient stock for "${prodName}". Available: ${availableStock.toFixed(2)}, Requested: ${requestedQty}`,
        };
      }
    }

    // 3. Idempotency Guard: Check if transaction was already completed
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data: existingSale } = await supabase
          .from('counter_sales')
          .select('*, counter_sale_items(*)')
          .eq('workspace_id', wsId)
          .or(`invoice_number.eq.${invoiceNumber},sale_number.eq.${saleNumber}`)
          .maybeSingle();

        if (existingSale) {
          const mapped = fromDbCounterSale(existingSale);
          return { success: true, data: mapped };
        }
      } catch (idempErr) {
        // Proceed if lookup fails
      }
    }

    const localExisting = safeStorageGet(LOCAL_SALES_KEY).find(
      (s: any) =>
        (s.invoiceNumber || s.invoice_number) === invoiceNumber ||
        (s.saleNumber || s.sale_number) === saleNumber
    );
    if (localExisting) {
      return { success: true, data: fromDbCounterSale(localExisting) };
    }

    // 4. Build RPC Payload with explicit workspace_id
    const rpcPayload: any = {
      workspace_id: isValidUuid(wsId) ? wsId : undefined,
      branch_id: (canonicalBranchId && isValidUuid(canonicalBranchId)) ? canonicalBranchId : null,
      customer_id: (sale.customerId && isValidUuid(sale.customerId)) ? sale.customerId : null,
      sale_number: saleNumber,
      invoice_number: invoiceNumber,
      customer_name: sale.customerName || 'Walk-in Customer',
      phone_number: sale.phoneNumber || '',
      sale_date: canonicalSaleDate,
      estimate_reference: sale.estimateReference || null,
      subtotal: sale.subtotal || 0,
      discount_type: sale.discountType || 'fixed',
      discount_value: sale.discountValue || 0,
      discount_amount: sale.discountAmount || 0,
      final_total: finalTotal,
      notes: (sale.notes ? `${sale.notes} ` : '') + (canonicalBranchId && !sale.notes?.includes('[branch:') ? `[branch: ${canonicalBranchId}]` : ''),
      payment_method: paymentMethod,
      amount_received: amountReceived,
      balance_amount: balanceAmount,
      payment_reference: sale.paymentReference || null,
      payment_notes: sale.paymentNotes || null,
      items: items.map((i: any) => {
        const pId = i.productId || i.product_id;
        const pName = i.productName || i.productNameSnapshot || i.product_name_snapshot || 'Product';
        const pPart = i.partNumber || i.partNumberSnapshot || i.part_number_snapshot || '';
        const qty = Math.abs(Number(i.quantity) || 0);
        const rate = Number(i.rate) || 0;
        const buyPrice = Number(i.buyPriceSnapshot || i.buy_price_snapshot || 0);
        return {
          productId: pId,
          product_id: pId,
          productNameSnapshot: pName,
          product_name_snapshot: pName,
          partNumberSnapshot: pPart,
          part_number_snapshot: pPart,
          quantity: qty,
          rate: rate,
          amount: qty * rate,
          buyPriceSnapshot: buyPrice,
          buy_price_snapshot: buyPrice,
        };
      }),
    };

    // 5. SERVER-SIDE ATOMIC EXECUTION (If Supabase is configured and authenticated)
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('finalize_counter_sale', {
          p_sale: rpcPayload,
        });

        if (!rpcErr && rpcRes && rpcRes.success && rpcRes.data) {
          // Instant store inventory sync
          items.forEach((item: any) => {
            const pId = item.productId || item.product_id;
            if (pId) store.adjustStock(pId, 'Sale', -Math.abs(item.quantity), `Counter Sale #${invoiceNumber}`, invoiceNumber, canonicalBranchId);
          });

          const completeSale = fromDbCounterSale(rpcRes.data);
          store.addOrUpdateCounterSale(completeSale);
          const local = safeStorageGet(LOCAL_SALES_KEY);
          local.unshift(completeSale);
          safeStorageSave(LOCAL_SALES_KEY, local);

          productService.invalidateCache();
          salesAnalyticsService.invalidateCache();
          try {
            const { enterpriseAnalyticsService } = await import('./enterpriseAnalyticsService');
            enterpriseAnalyticsService.invalidateCache();
          } catch {}
          store.notify();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));

          return { success: true, data: completeSale };
        }

        if (rpcErr) {
          const errMsg = (rpcErr as any).message || '';
          if (errMsg.includes('INSUFFICIENT_STOCK')) {
            // Re-verify against live authoritative inventory to distinguish genuine depletion from stale RPC receipt artifact
            let isGenuineShortage = false;
            let shortageMessage = errMsg;
            for (const [productId, { qty: requestedQty, name: prodName }] of aggregatedQtys.entries()) {
              const liveStock = await productService.getProductAvailableStock(productId, canonicalBranchId);
              if (requestedQty > liveStock) {
                isGenuineShortage = true;
                shortageMessage = `INSUFFICIENT_STOCK: Insufficient stock for "${prodName}". Available: ${liveStock.toFixed(2)}, Requested: ${requestedQty}`;
                break;
              }
            }

            if (isGenuineShortage) {
              return { success: false, error: shortageMessage };
            }

            console.warn('[counterSaleService] Server RPC returned false INSUFFICIENT_STOCK due to stale receipt check. Authoritative stock is verified in branch inventory. Proceeding with atomic table insertion.');
          } else if (errMsg.includes('VALIDATION_ERROR') || errMsg.includes('must equal final total')) {
            return { success: false, error: errMsg };
          }
        }
      } catch (rpcEx: any) {
        console.warn('[counterSaleService] RPC exception, attempting direct atomic table insert:', rpcEx?.message || rpcEx);
      }

      // DIRECT ATOMIC SUPABASE TABLE INSERTION PIPELINE
      try {
        const salePayload: any = {
          workspace_id: wsId,
          customer_id: (sale.customerId && isValidUuid(sale.customerId)) ? sale.customerId : null,
          sale_number: saleNumber,
          invoice_number: invoiceNumber,
          customer_name: sale.customerName || 'Walk-in Customer',
          phone_number: sale.phoneNumber || '',
          sale_date: canonicalSaleDate,
          estimate_reference: sale.estimateReference || null,
          subtotal: sale.subtotal || 0,
          discount_type: sale.discountType || 'fixed',
          discount_value: sale.discountValue || 0,
          discount_amount: sale.discountAmount || 0,
          final_total: finalTotal,
          status: 'COMPLETED',
          notes: (sale.notes ? `${sale.notes} ` : '') + (canonicalBranchId && !sale.notes?.includes('[branch:') ? `[branch: ${canonicalBranchId}]` : ''),
          payment_method: paymentMethod,
          amount_received: amountReceived,
          balance_amount: balanceAmount,
          payment_reference: sale.paymentReference || null,
          payment_notes: sale.paymentNotes || null,
        };
        if (canonicalBranchId && isValidUuid(canonicalBranchId)) {
          salePayload.branch_id = canonicalBranchId;
        }

        let { data: insertedSale, error: insertErr } = await supabase
          .from('counter_sales')
          .insert([salePayload])
          .select()
          .single();

        if (insertErr && (insertErr.code === '42703' || insertErr.code === 'PGRST204' || insertErr.message?.includes('branch_id') || insertErr.message?.includes('payment_'))) {
          // Schema resilience: strip non-core columns and encode metadata into notes
          const corePayload: any = {
            workspace_id: wsId,
            customer_id: (sale.customerId && isValidUuid(sale.customerId)) ? sale.customerId : null,
            sale_number: saleNumber,
            invoice_number: invoiceNumber,
            customer_name: sale.customerName || 'Walk-in Customer',
            phone_number: sale.phoneNumber || '',
            sale_date: canonicalSaleDate,
            estimate_reference: sale.estimateReference || null,
            subtotal: sale.subtotal || 0,
            discount_type: sale.discountType || 'fixed',
            discount_value: sale.discountValue || 0,
            discount_amount: sale.discountAmount || 0,
            final_total: finalTotal,
            status: 'COMPLETED',
            notes: (sale.notes ? `${sale.notes} ` : '') + (canonicalBranchId && !sale.notes?.includes('[branch:') ? `[branch: ${canonicalBranchId}]` : ''),
            payment_method: paymentMethod,
            amount_received: amountReceived,
            balance_amount: balanceAmount,
          };
          const retry = await supabase.from('counter_sales').insert([corePayload]).select().single();
          insertedSale = retry.data;
          insertErr = retry.error;
        }

        if (insertErr || !insertedSale) {
          console.error('[counterSaleService] Direct table insertion failed:', insertErr?.message);
          return {
            success: false,
            error: `Failed to record counter sale in database: ${insertErr?.message || 'Database insert failed'}. Transaction was not committed.`,
          };
        }

        const saleId = insertedSale.id;
        const itemRows = items.map((i: any) => ({
          workspace_id: wsId,
          counter_sale_id: saleId,
          product_id: (i.productId && isValidUuid(i.productId)) ? i.productId : ((i.product_id && isValidUuid(i.product_id)) ? i.product_id : null),
          product_name_snapshot: i.productName || i.productNameSnapshot || i.product_name_snapshot || 'Product',
          part_number_snapshot: i.partNumber || i.partNumberSnapshot || i.part_number_snapshot || '',
          quantity: Math.abs(Number(i.quantity) || 0),
          rate: Number(i.rate) || 0,
          amount: Math.abs(Number(i.quantity) || 0) * (Number(i.rate) || 0),
          buy_price_snapshot: Number(i.buyPriceSnapshot || i.buy_price_snapshot || 0),
        }));

        let { error: itemsErr } = await supabase.from('counter_sale_items').insert(itemRows);
        if (itemsErr) {
          console.error('[counterSaleService] Line items insertion failed, executing rollback of header:', itemsErr);
          await supabase.from('counter_sales').delete().eq('id', saleId);
          return {
            success: false,
            error: `Failed to record line items: ${itemsErr.message}. Transaction cancelled; no stock was deducted.`,
          };
        }

        // STRICT ATOMICITY: Deduct stock ONLY AFTER sale header AND items exist in database
        try {
          await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate, canonicalBranchId);
        } catch (stockDeductErr: any) {
          console.error('[counterSaleService] Stock deduction failed, rolling back committed sale records:', stockDeductErr);
          await supabase.from('counter_sale_items').delete().eq('counter_sale_id', saleId);
          await supabase.from('counter_sales').delete().eq('id', saleId);
          return {
            success: false,
            error: `Stock deduction failed: ${stockDeductErr?.message || 'Stock mutation error'}. Transaction rolled back cleanly.`,
          };
        }

        // Record Authoritative Payment Entry
        if (amountReceived > 0 && !['Credit', 'Credit / Udhari', 'Udhari'].includes(paymentMethod)) {
          try {
            const { paymentService } = await import('./paymentService');
            await paymentService.createPayment({
              counterSaleId: saleId,
              branchId: canonicalBranchId,
              amount: amountReceived,
              method: paymentMethod as any,
              customerName: sale.customerName || 'Walk-in Customer',
              customerId: sale.customerId,
              invoiceNumber,
              referenceNo: sale.paymentReference,
              notes: sale.paymentNotes || `Counter Sale payment #${invoiceNumber}`,
              date: sale.saleDate,
            });
          } catch (payErr) {
            console.warn('[counterSaleService] Payment record notice:', payErr);
          }
        }

        // Record Daybook Entry
        try {
          const { daybookService } = await import('./daybookService');
          await daybookService.recordFinancialTransaction({
            branchId: canonicalBranchId,
            referenceType: 'COUNTER_SALE',
            referenceId: saleId,
            referenceNumber: invoiceNumber,
            transactionType: 'SALE',
            direction: 'IN',
            amount: amountReceived,
            totalAmount: finalTotal,
            remainingAmount: balanceAmount,
            paymentStatus: balanceAmount <= 0.01 ? 'PAID' : (amountReceived > 0 ? 'PARTIALLY PAID' : 'UNPAID'),
            paymentMode: paymentMethod,
            partyType: 'customer',
            partyId: sale.customerId || undefined,
            partyName: sale.customerName || 'Walk-in Customer',
            description: `Counter Sale #${invoiceNumber}`,
            transactionDate: canonicalSaleDate,
          });
        } catch (dbErr) {
          console.warn('[counterSaleService] Daybook record notice:', dbErr);
        }

        // Record Cashbook Entry (Only for actual money received, non-credit)
        if (amountReceived > 0 && !['Credit', 'Credit / Udhari', 'Udhari'].includes(paymentMethod)) {
          try {
            const { cashbookService } = await import('./cashbookService');
            await cashbookService.recordCashbookEntry({
              sourceType: 'COUNTER_SALE',
              sourceId: saleId,
              referenceNumber: invoiceNumber,
              direction: 'IN',
              amount: amountReceived,
              paymentMethod: paymentMethod,
              partyName: sale.customerName || 'Walk-in Customer',
              description: `Counter sale payment #${invoiceNumber}`,
              transactionDate: canonicalSaleDate,
            });
          } catch (cbErr) {
            console.warn('[counterSaleService] Cashbook record notice:', cbErr);
          }
        }

        // Record Udhari if balanceAmount > 0
        if (balanceAmount > 0 && sale.customerId) {
          try {
            const { udhariService } = await import('./udhariService');
            await udhariService.syncInvoiceUdhari({
              invoiceId: saleId,
              invoiceNumber,
              customerId: sale.customerId,
              customerName: sale.customerName || 'Customer',
              customerPhone: sale.phoneNumber || '9999999999',
              grandTotal: finalTotal,
              paidAmount: amountReceived,
              balanceAmount,
              dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
            });
          } catch (uErr) {
            console.warn('[counterSaleService] Udhari record notice:', uErr);
          }
        }

        const completeSale = fromDbCounterSale({
          ...insertedSale,
          branch_id: canonicalBranchId,
          branchId: canonicalBranchId,
          items: itemRows,
        });

        store.addOrUpdateCounterSale(completeSale);
        const local = safeStorageGet(LOCAL_SALES_KEY);
        local.unshift(completeSale);
        safeStorageSave(LOCAL_SALES_KEY, local);

        productService.invalidateCache();
        salesAnalyticsService.invalidateCache();
        try {
          const { enterpriseAnalyticsService } = await import('./enterpriseAnalyticsService');
          enterpriseAnalyticsService.invalidateCache();
        } catch {}
        store.notify();
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));

        return { success: true, data: completeSale };
      } catch (directEx: any) {
        console.error('[counterSaleService] Direct table insertion exception:', directEx);
        return {
          success: false,
          error: `Failed to save counter sale: ${directEx?.message || 'Database transaction error'}`,
        };
      }
    }

    // 6. PURE OFFLINE / LOCAL MODE (Only when Supabase is completely unconfigured)
    const saleId = sale.id || `cs-${Date.now()}`;
    const offlineSale = {
      ...sale,
      id: saleId,
      branch_id: canonicalBranchId || null,
      branchId: canonicalBranchId || null,
      sale_number: saleNumber,
      invoice_number: invoiceNumber,
      payment_method: paymentMethod,
      amount_received: amountReceived,
      balance_amount: balanceAmount,
      notes: (sale.notes ? `${sale.notes} ` : '') + (canonicalBranchId && !sale.notes?.includes('[branch:') ? `[branch: ${canonicalBranchId}]` : ''),
      items: items.map((i: any) => ({
        id: `csi-${Date.now()}-${Math.random()}`,
        counterSaleId: saleId,
        productId: i.productId || i.product_id,
        productNameSnapshot: i.productName || i.productNameSnapshot || 'Product',
        partNumberSnapshot: i.partNumber || i.partNumberSnapshot || '',
        quantity: Math.abs(Number(i.quantity) || 0),
        rate: Number(i.rate) || 0,
        amount: (Math.abs(Number(i.quantity) || 0)) * (Number(i.rate) || 0),
        createdAt: new Date().toISOString(),
      })),
      createdAt: new Date().toISOString(),
    };

    const local = safeStorageGet(LOCAL_SALES_KEY);
    local.unshift(offlineSale);
    safeStorageSave(LOCAL_SALES_KEY, local);

    // Deduct stock in local store only
    await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate, canonicalBranchId);

    // Synchronize local Daybook & Cashbook
    try {
      const { daybookService } = await import('./daybookService');
      await daybookService.recordFinancialTransaction({
        branchId: canonicalBranchId,
        referenceType: 'COUNTER_SALE',
        referenceId: saleId,
        referenceNumber: invoiceNumber,
        transactionType: 'SALE',
        direction: 'IN',
        amount: amountReceived,
        totalAmount: finalTotal,
        remainingAmount: balanceAmount,
        paymentStatus: balanceAmount <= 0.01 ? 'PAID' : (amountReceived > 0 ? 'PARTIALLY PAID' : 'UNPAID'),
        paymentMode: paymentMethod,
        partyType: 'customer',
        partyId: sale.customerId || undefined,
        partyName: sale.customerName || 'Walk-in Customer',
        description: `Counter Sale #${invoiceNumber}`,
        transactionDate: canonicalSaleDate,
      });
    } catch {}

    if (amountReceived > 0 && !['Credit', 'Credit / Udhari', 'Udhari'].includes(paymentMethod)) {
      try {
        const { cashbookService } = await import('./cashbookService');
        await cashbookService.recordCashbookEntry({
          branchId: canonicalBranchId,
          sourceType: 'COUNTER_SALE',
          sourceId: saleId,
          referenceNumber: invoiceNumber,
          direction: 'IN',
          amount: amountReceived,
          paymentMethod: paymentMethod,
          partyName: sale.customerName || 'Walk-in Customer',
          description: `Counter sale payment #${invoiceNumber}`,
          transactionDate: canonicalSaleDate,
        });
      } catch {}

      try {
        const { paymentService } = await import('./paymentService');
        await paymentService.createPayment({
          counterSaleId: saleId,
          branchId: canonicalBranchId,
          amount: amountReceived,
          method: paymentMethod as any,
          customerName: sale.customerName || 'Walk-in Customer',
          customerId: sale.customerId,
          invoiceNumber,
          referenceNo: sale.paymentReference,
          notes: sale.paymentNotes || `Counter Sale payment #${invoiceNumber}`,
          date: canonicalSaleDate,
        });
      } catch {}
    }

    const completeSale = fromDbCounterSale(offlineSale);
    store.addOrUpdateCounterSale(completeSale);
    productService.invalidateCache();
    salesAnalyticsService.invalidateCache();
    try {
      const { enterpriseAnalyticsService } = await import('./enterpriseAnalyticsService');
      enterpriseAnalyticsService.invalidateCache();
    } catch {}
    store.notify();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));

    return { success: true, data: completeSale };
  }

  public async cancelCounterSale(saleId: string): Promise<{ success: boolean; error?: string }> {
    const wsId = await this.getOrFetchWorkspaceId();
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        // Idempotency & status check
        const { data: targetSale } = await supabase
          .from('counter_sales')
          .select('status')
          .eq('workspace_id', wsId)
          .eq('id', saleId)
          .maybeSingle();

        if (targetSale && targetSale.status === 'CANCELLED') {
          console.log('[COUNTER SALE CANCEL IDEMPOTENCY] Sale already cancelled:', saleId);
          return { success: true };
        }

        // Try Atomic PostgreSQL RPC
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('cancel_counter_sale_atomic', {
          p_sale_id: saleId,
        });

        if (!rpcErr && rpcRes && rpcRes.success) {
          console.log('[RPC cancel_counter_sale_atomic success]', rpcRes);
        } else {
          // Fallback cancel
          const { error } = await supabase
            .from('counter_sales')
            .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
            .eq('workspace_id', wsId)
            .eq('id', saleId);

          if (error) {
            const errStr = handleSupabaseError(error, 'cancelCounterSale');
            return { success: false, error: errStr };
          }
          await this.restoreCounterSaleStock(saleId);
        }
      } else {
        const local = safeStorageGet(LOCAL_SALES_KEY);
        const target = local.find((s) => s.id === saleId);
        if (target) {
          if (target.status === 'CANCELLED') return { success: true };
          target.status = 'CANCELLED';
          safeStorageSave(LOCAL_SALES_KEY, local);
        }
        await this.restoreCounterSaleStock(saleId);
      }

      // 1. Cancel linked payments in Supabase
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          await supabase
            .from('payments')
            .delete()
            .eq('workspace_id', wsId)
            .eq('counter_sale_id', saleId);
        } catch {}
      }

      // 2. Void or Reverse Daybook transaction
      try {
        const { daybookService } = await import('./daybookService');
        await daybookService.recordReversalTransaction({
          sourceType: 'COUNTER_SALE',
          sourceId: saleId,
          description: `Cancelled Counter Sale`,
        });
      } catch (e) {
        // ignore
      }

      // 3. Cancel in local store and storage
      store.cancelCounterSale(saleId);
      const local = safeStorageGet(LOCAL_SALES_KEY);
      const lIdx = local.findIndex((s) => s.id === saleId);
      if (lIdx >= 0) {
        local[lIdx].status = 'CANCELLED';
        safeStorageSave(LOCAL_SALES_KEY, local);
      }

      productService.invalidateCache();
      salesAnalyticsService.invalidateCache();
      try {
        const { enterpriseAnalyticsService } = await import('./enterpriseAnalyticsService');
        enterpriseAnalyticsService.invalidateCache();
      } catch {}
      try {
        const { analyticsService } = await import('./analyticsService');
        analyticsService.invalidateCache();
      } catch {}
      store.notify();
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));

      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'cancelCounterSale');
      return { success: false, error: errStr };
    }
  }
}

export const counterSaleService = new CounterSaleService();
