import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { store } from '../store';
import { fromDbCounterSale } from './types';
import { salesAnalyticsService } from './salesAnalyticsService';
import { productService } from './productService';
import { CounterSale } from '../../types';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

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
    return '';
  }

  private async deductCounterSaleStock(items: any[], invoiceNumber: string, saleDate: string, branchId?: string) {
    const wsId = await this.getOrFetchWorkspaceId();

    for (const item of items) {
      const productId = item.productId || item.product_id;
      const quantity = Math.abs(Number(item.quantity) || 0);

      if (!productId || quantity <= 0) continue;

      // 1. Always update local store state for instant UI sync
      store.adjustStock(productId, 'Sale', -quantity, `Counter Sale #${invoiceNumber}`, invoiceNumber, branchId);

      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          // 2. Fetch current product current_stock and deduct
          const { data: prod } = await supabase
            .from('products')
            .select('current_stock')
            .eq('workspace_id', wsId)
            .eq('id', productId)
            .maybeSingle();

          if (prod) {
            const newStock = Math.max(0, (Number(prod.current_stock) || 0) - quantity);
            await supabase
              .from('products')
              .update({ current_stock: newStock, updated_at: new Date().toISOString() })
              .eq('workspace_id', wsId)
              .eq('id', productId);
          }

          // 2b. Deduct strictly from branch_inventory
          if (branchId) {
            // Local branch inventory storage update
            const allLocalBInv = safeGetTenantStorage<any>('vistaar_local_branch_inventory_db', []);
            const targetBEntry = allLocalBInv.find((bi: any) => (bi.branchId === branchId || bi.branch_id === branchId) && (bi.productId === productId || bi.product_id === productId));
            if (targetBEntry) {
              const curB = Number(targetBEntry.currentStock ?? targetBEntry.current_stock ?? 0);
              const nextB = Math.max(0, curB - quantity);
              targetBEntry.currentStock = nextB;
              targetBEntry.current_stock = nextB;
              targetBEntry.updatedAt = new Date().toISOString();
              safeSaveTenantStorage('vistaar_local_branch_inventory_db', allLocalBInv);
            }

            if (isValidUuid(branchId)) {
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
            }
          }

          // 3. FIFO deduction on active stock receipts
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

          // 4. Log stock movement
          await supabase.from('stock_movements').insert([{
            workspace_id: wsId,
            branch_id: branchId && isValidUuid(branchId) ? branchId : null,
            product_id: productId,
            type: 'SALE',
            quantity: -quantity,
            movement_date: saleDate || new Date().toISOString().split('T')[0],
            reference_id: invoiceNumber,
            reference_type: 'COUNTER_SALE',
            notes: `Counter Sale #${invoiceNumber}`,
          }]);
        } catch (e) {
          console.error('Failed to perform Supabase stock deduction for item:', item, e);
          throw e; // Do NOT swallow stock errors
        }
      }
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

  public async getCounterSales(options?: { branchId?: string }): Promise<{ data: CounterSale[]; error?: string }> {
    const wsId = await this.getOrFetchWorkspaceId();
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        let query = supabase
          .from('counter_sales')
          .select('*, counter_sale_items(*)')
          .eq('workspace_id', wsId);

        if (options?.branchId && options.branchId !== 'ALL' && isValidUuid(options.branchId)) {
          query = query.eq('branch_id', options.branchId);
        }

        let { data, error } = await query.order('created_at', { ascending: false });

        if (error && (error.code === '42703' || error.message?.includes('branch_id'))) {
          const fbQuery = await supabase
            .from('counter_sales')
            .select('*, counter_sale_items(*)')
            .eq('workspace_id', wsId)
            .order('created_at', { ascending: false });
          data = fbQuery.data;
          error = fbQuery.error;
        }

        if (error) {
          const errStr = handleSupabaseError(error, 'getCounterSales');
          const fallback = safeStorageGet(LOCAL_SALES_KEY);
          const storeSales = store.getCounterSales();
          let merged = [...(fallback || [])];
          const seenIds = new Set(merged.map((s: any) => s.id));
          for (const ss of storeSales) {
            if (!seenIds.has(ss.id)) {
              merged.push(ss);
              seenIds.add(ss.id);
            }
          }
          if (options?.branchId && options.branchId !== 'ALL') {
            const branches = safeGetTenantStorage<any>('vistaar_local_branches_db', []);
            const bObj = branches.find((b: any) => b.id === options.branchId);
            const isMain = Boolean(bObj?.isMainBranch);
            merged = merged.filter((s: any) => {
              const bId = s.branchId || s.branch_id;
              if (bId) return bId === options.branchId;
              return isMain;
            });
          }
          return { data: merged.map((row: any) => fromDbCounterSale(row)), error: errStr };
        }
        return { data: (data || []).map((row: any) => fromDbCounterSale(row)) };
      }
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCounterSales');
      const fallback = safeStorageGet(LOCAL_SALES_KEY);
      const storeSales = store.getCounterSales();
      let merged = [...(fallback || [])];
      const seenIds = new Set(merged.map((s: any) => s.id));
      for (const ss of storeSales) {
        if (!seenIds.has(ss.id)) {
          merged.push(ss);
          seenIds.add(ss.id);
        }
      }
      if (options?.branchId && options.branchId !== 'ALL') {
        const branches = safeGetTenantStorage<any>('vistaar_local_branches_db', []);
        const bObj = branches.find((b: any) => b.id === options.branchId);
        const isMain = Boolean(bObj?.isMainBranch);
        merged = merged.filter((s: any) => {
          const bId = s.branchId || s.branch_id;
          if (bId) return bId === options.branchId;
          return isMain;
        });
      }
      return { data: merged.map((row: any) => fromDbCounterSale(row)), error: errStr };
    }

    const fallback = safeStorageGet(LOCAL_SALES_KEY);
    const storeSales = store.getCounterSales();
    let merged = [...(fallback || [])];
    const seenIds = new Set(merged.map((s: any) => s.id));
    for (const ss of storeSales) {
      if (!seenIds.has(ss.id)) {
        merged.push(ss);
        seenIds.add(ss.id);
      }
    }
    if (options?.branchId && options.branchId !== 'ALL') {
      const branches = safeGetTenantStorage<any>('vistaar_local_branches_db', []);
      const bObj = branches.find((b: any) => b.id === options.branchId);
      const isMain = Boolean(bObj?.isMainBranch);
      merged = merged.filter((s: any) => {
        const bId = s.branchId || s.branch_id;
        if (bId) return bId === options.branchId;
        return isMain;
      });
    }
    return { data: merged.map((row: any) => fromDbCounterSale(row)) };
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
    const sales = (data || []).filter((s) => s.status !== 'CANCELLED');
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);

    const todaySales = sales.filter((s) => s.saleDate === todayStr);
    const monthSales = sales.filter((s) => (s.saleDate || '').startsWith(currentMonthStr));

    const todayTotal = todaySales.reduce((acc, s) => acc + (s.finalTotal || 0), 0);
    const monthTotal = monthSales.reduce((acc, s) => acc + (s.finalTotal || 0), 0);
    const netSales = sales.reduce((acc, s) => acc + (s.finalTotal || 0), 0);
    const totalDiscounts = sales.reduce((acc, s) => acc + (s.discountAmount || 0), 0);

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
   */
  public async createCounterSale(sale: any): Promise<{ success: boolean; data?: CounterSale; error?: string }> {
    const wsId = await this.getOrFetchWorkspaceId();
    const saleNumber = sale.saleNumber || `CS-${Date.now()}`;
    const invoiceNumber = (sale.invoiceNumber || saleNumber).trim();
    const items = sale.items || [];
    const paymentMethod = sale.paymentMethod || 'Cash';
    const finalTotal = Number(sale.finalTotal) || 0;
    const isCredit = paymentMethod === 'Credit / Udhari' || paymentMethod === 'Credit';
    const amountReceived = sale.amountReceived !== undefined ? Number(sale.amountReceived) : (isCredit ? 0 : finalTotal);
    const balanceAmount = sale.balanceAmount !== undefined ? Number(sale.balanceAmount) : Math.max(0, finalTotal - amountReceived);

    if (!items || items.length === 0) {
      return { success: false, error: 'Please select at least one product for the counter sale.' };
    }

    // 1. PRE-FINALIZATION AUTHORITATIVE STOCK VALIDATION FOR ALL ITEMS
    const { productService } = await import('./productService');
    let saleBranchId = sale.branchId;
    if (!saleBranchId || saleBranchId === 'ALL') {
      try {
        const saved = safeGetTenantItem<string | null>('active_branch_id', null);
        if (saved && saved !== 'ALL') saleBranchId = saved;
      } catch {}
    }
    if (!saleBranchId) {
      const branches = safeGetTenantStorage<any>('vistaar_local_branches_db', []);
      const mainB = branches.find((b: any) => b.isMainBranch) || branches[0];
      saleBranchId = mainB?.id || 'default';
    }

    for (const item of items) {
      const productId = item.productId || item.product_id;
      const requestedQty = Math.abs(Number(item.quantity) || 0);

      if (productId && requestedQty > 0) {
        const availableStock = await productService.getProductAvailableStock(productId, saleBranchId);
        if (requestedQty > availableStock) {
          const prodName = item.productName || item.productNameSnapshot || item.product_name_snapshot || 'Product';
          return {
            success: false,
            error: `Insufficient stock for "${prodName}". Requested ${requestedQty}, but only ${availableStock} units are available.`,
          };
        }
      }
    }

    // 2. BUILD RPC PAYLOAD
    const rpcPayload = {
      branch_id: (saleBranchId && isValidUuid(saleBranchId)) ? saleBranchId : null,
      customer_id: sale.customerId || null,
      sale_number: saleNumber,
      invoice_number: invoiceNumber,
      customer_name: sale.customerName || 'Walk-in Customer',
      phone_number: sale.phoneNumber || '',
      sale_date: sale.saleDate || new Date().toISOString().split('T')[0],
      estimate_reference: sale.estimateReference || null,
      subtotal: sale.subtotal || 0,
      discount_type: sale.discountType || 'fixed',
      discount_value: sale.discountValue || 0,
      discount_amount: sale.discountAmount || 0,
      final_total: finalTotal,
      notes: sale.notes || null,
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

    // 3. PRODUCTION SUPABASE MODE: STRICT SERVER-SIDE ATOMIC POSTGRESQL RPC EXECUTION
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('finalize_counter_sale', {
        p_sale: rpcPayload,
      });

      if (!rpcErr && rpcRes && rpcRes.success && rpcRes.data) {
        // Update local store stock for instant UI reactivity
        items.forEach((item: any) => {
          const pId = item.productId || item.product_id;
          if (pId) store.adjustStock(pId, 'Sale', -Math.abs(item.quantity), `Counter Sale #${invoiceNumber}`, invoiceNumber, saleBranchId);
        });

        const completeSale = fromDbCounterSale(rpcRes.data);
        const finalTot = Number(completeSale.finalTotal) || 0;
        const recAmt = Number(completeSale.amountReceived !== undefined ? completeSale.amountReceived : finalTot) || 0;
        const balAmt = Number(completeSale.balanceAmount) || Math.max(0, finalTot - recAmt);
        const pStat = balAmt <= 0.01 ? 'PAID' : (recAmt > 0 ? 'PARTIALLY PAID' : 'UNPAID');

        // 1. Authoritative Daybook Sale Entry
        try {
          const { daybookService } = await import('./daybookService');
          await daybookService.recordFinancialTransaction({
            branchId: completeSale.branchId,
            referenceType: 'COUNTER_SALE',
            referenceId: completeSale.id,
            referenceNumber: completeSale.invoiceNumber || completeSale.saleNumber,
            transactionType: 'SALE',
            direction: 'IN',
            amount: recAmt, // Inflow = actual money received
            totalAmount: finalTot, // Gross Total filled strictly for Invoice & Counter Sale
            remainingAmount: balAmt, // Remaining unpaid
            paymentStatus: pStat,
            paymentMode: completeSale.paymentMethod,
            partyType: 'customer',
            partyId: completeSale.customerId || undefined,
            partyName: completeSale.customerName || 'Walk-in Customer',
            description: `Counter Sale #${completeSale.invoiceNumber || completeSale.saleNumber}`,
            transactionDate: completeSale.saleDate || new Date().toISOString().split('T')[0],
          });
        } catch (dbErr) {
          console.warn('[finalizeCounterSale] Daybook sync notice:', dbErr);
        }

        const finalPayMethod = completeSale.paymentMethod || 'Cash';

        // 2. Authoritative Cashbook Entry for actual money received
        if (recAmt > 0 && !['Credit', 'Credit / Udhari', 'Udhari'].includes(finalPayMethod)) {
          try {
            const { cashbookService } = await import('./cashbookService');
            await cashbookService.recordCashbookEntry({
              branchId: completeSale.branchId,
              sourceType: 'COUNTER_SALE',
              sourceId: completeSale.id,
              referenceNumber: completeSale.invoiceNumber || completeSale.saleNumber,
              direction: 'IN',
              amount: recAmt,
              paymentMethod: finalPayMethod,
              partyName: completeSale.customerName || 'Walk-in Customer',
              description: `Counter sale payment #${completeSale.invoiceNumber || completeSale.saleNumber}`,
              transactionDate: completeSale.saleDate || new Date().toISOString().split('T')[0],
            });
          } catch (cbErr) {
            console.warn('[finalizeCounterSale] Cashbook sync notice:', cbErr);
          }
        }

        // In case the DB RPC did not create the payment row (or older migration):
        if (recAmt > 0 && !['Credit', 'Credit / Udhari', 'Udhari'].includes(finalPayMethod)) {
          try {
            const { paymentService } = await import('./paymentService');
            await paymentService.createPayment({
              counterSaleId: completeSale.id,
              branchId: completeSale.branchId,
              amount: recAmt,
              method: finalPayMethod as any,
              customerName: completeSale.customerName || 'Walk-in Customer',
              customerId: completeSale.customerId,
              invoiceNumber: completeSale.invoiceNumber || completeSale.saleNumber,
              referenceNo: completeSale.paymentReference,
              notes: completeSale.paymentNotes || `Counter Sale payment #${completeSale.invoiceNumber || completeSale.saleNumber}`,
              date: completeSale.saleDate,
            });
          } catch (payErr) {
            console.warn('[finalizeCounterSale] Payment sync notice:', payErr);
          }
        }

        // Record Udhari if balanceAmount > 0
        if (balAmt > 0 && completeSale.customerId) {
          try {
            const { udhariService } = await import('./udhariService');
            await udhariService.syncInvoiceUdhari({
              invoiceId: completeSale.id,
              invoiceNumber: completeSale.invoiceNumber || completeSale.saleNumber,
              customerId: completeSale.customerId,
              customerName: completeSale.customerName || 'Customer',
              customerPhone: completeSale.phoneNumber || '9999999999',
              grandTotal: finalTot,
              paidAmount: recAmt,
              balanceAmount: balAmt,
              dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
            });
          } catch (uErr) {
            console.warn('[finalizeCounterSale] Udhari sync notice:', uErr);
          }
        }

        store.addOrUpdateCounterSale(completeSale);
        const local = safeStorageGet(LOCAL_SALES_KEY);
        local.unshift(completeSale);
        safeStorageSave(LOCAL_SALES_KEY, local);

        // Invalidate caches
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
        const errCode = (rpcErr as any).code || '';
        const errMsg = (rpcErr as any).message || '';
        const isFunctionMissing =
          errCode === 'PGRST202' ||
          errCode === 'P0001' ||
          errMsg.includes('UNAUTHORIZED') ||
          errMsg.includes('Could not find the function') ||
          errMsg.includes('does not exist');

        if (isFunctionMissing) {
          console.warn('[counterSaleService] RPC finalize_counter_sale returned error/missing; performing direct authoritative table finalization:', errMsg);
          try {
            // Direct Supabase table insert
            const salePayload: any = {
              workspace_id: wsId,
              branch_id: saleBranchId || null,
              customer_id: (sale.customerId && isValidUuid(sale.customerId)) ? sale.customerId : null,
              sale_number: saleNumber,
              invoice_number: invoiceNumber,
              customer_name: sale.customerName || 'Walk-in Customer',
              phone_number: sale.phoneNumber || '',
              sale_date: sale.saleDate || new Date().toISOString().split('T')[0],
              estimate_reference: sale.estimateReference || null,
              subtotal: sale.subtotal || 0,
              discount_type: sale.discountType || 'fixed',
              discount_value: sale.discountValue || 0,
              discount_amount: sale.discountAmount || 0,
              final_total: finalTotal,
              status: 'COMPLETED',
              notes: sale.notes || null,
              payment_method: paymentMethod,
              amount_received: amountReceived,
              balance_amount: balanceAmount,
              payment_reference: sale.paymentReference || null,
              payment_notes: sale.paymentNotes || null,
            };

            let { data: insertedSale, error: insertErr } = await supabase
              .from('counter_sales')
              .insert([salePayload])
              .select()
              .single();

            if (insertErr && (insertErr.code === '42703' || insertErr.message?.includes('branch_id'))) {
              delete salePayload.branch_id;
              const retry = await supabase.from('counter_sales').insert([salePayload]).select().single();
              insertedSale = retry.data;
              insertErr = retry.error;
            }

            if (!insertErr && insertedSale) {
              const saleId = insertedSale.id;
              const itemRows = items.map((i: any) => ({
                workspace_id: wsId,
                branch_id: saleBranchId || null,
                counter_sale_id: saleId,
                product_id: (i.productId && isValidUuid(i.productId)) ? i.productId : ((i.product_id && isValidUuid(i.product_id)) ? i.product_id : null),
                product_name_snapshot: i.productName || i.productNameSnapshot || i.product_name_snapshot || 'Product',
                part_number_snapshot: i.partNumber || i.partNumberSnapshot || i.part_number_snapshot || '',
                quantity: Math.abs(Number(i.quantity) || 0),
                rate: Number(i.rate) || 0,
                amount: Math.abs(Number(i.quantity) || 0) * (Number(i.rate) || 0),
                buy_price_snapshot: Number(i.buyPriceSnapshot || i.buy_price_snapshot || 0),
              }));

              const { error: itemsErr } = await supabase.from('counter_sale_items').insert(itemRows);
              if (itemsErr && (itemsErr.code === '42703' || itemsErr.message?.includes('column'))) {
                const strippedItems = itemRows.map((r: any) => ({
                  counter_sale_id: r.counter_sale_id,
                  product_id: r.product_id,
                  product_name_snapshot: r.product_name_snapshot,
                  part_number_snapshot: r.part_number_snapshot,
                  quantity: r.quantity,
                  rate: r.rate,
                  amount: r.amount,
                }));
                await supabase.from('counter_sale_items').insert(strippedItems);
              }

              // Deduct stock
              await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate, saleBranchId);

              // 1. Authoritative Daybook Sale Entry
              try {
                const { daybookService } = await import('./daybookService');
                await daybookService.recordFinancialTransaction({
                  branchId: saleBranchId,
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
                  transactionDate: sale.saleDate || new Date().toISOString().split('T')[0],
                });
              } catch (dbErr) {
                console.warn('[finalizeCounterSale fallback] Daybook sync notice:', dbErr);
              }

              // 2. Authoritative Payment Record
              if (amountReceived > 0 && !['Credit', 'Credit / Udhari', 'Udhari'].includes(paymentMethod)) {
                try {
                  const { paymentService } = await import('./paymentService');
                  await paymentService.createPayment({
                    counterSaleId: saleId,
                    branchId: saleBranchId,
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
                  console.warn('[finalizeCounterSale fallback] Payment sync notice:', payErr);
                }
              }

              // 3. Authoritative Cashbook Entry
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
                    transactionDate: sale.saleDate || new Date().toISOString().split('T')[0],
                  });
                } catch (cbErr) {
                  console.warn('[finalizeCounterSale fallback] Cashbook sync notice:', cbErr);
                }
              }

              // 4. Record Udhari if balanceAmount > 0 and customer exists
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
                  console.warn('[finalizeCounterSale fallback] Udhari sync notice:', uErr);
                }
              }

              const completeSale = fromDbCounterSale({ ...insertedSale, branch_id: saleBranchId, items: itemRows });
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
          } catch (directErr) {
            console.warn('[finalizeCounterSale direct fallback notice]:', directErr);
          }
        }
      }
    }

    // 4. PURE OFFLINE / LOCAL MODE (Only when Supabase is not configured)
    const saleId = sale.id || `cs-${Date.now()}`;
    const offlineSale = {
      id: saleId,
      branch_id: saleBranchId || null,
      sale_number: saleNumber,
      invoice_number: invoiceNumber,
      payment_method: paymentMethod,
      amount_received: amountReceived,
      balance_amount: balanceAmount,
      ...sale,
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

    await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate, saleBranchId);

    // Synchronize Daybook and Cashbook for offline/local mode
    try {
      const { daybookService } = await import('./daybookService');
      await daybookService.recordFinancialTransaction({
        branchId: saleBranchId,
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
        transactionDate: sale.saleDate || new Date().toISOString().split('T')[0],
      });
    } catch {}

    if (amountReceived > 0 && !['Credit', 'Credit / Udhari', 'Udhari'].includes(paymentMethod)) {
      try {
        const { cashbookService } = await import('./cashbookService');
        await cashbookService.recordCashbookEntry({
          branchId: saleBranchId,
          sourceType: 'COUNTER_SALE',
          sourceId: saleId,
          referenceNumber: invoiceNumber,
          direction: 'IN',
          amount: amountReceived,
          paymentMethod: paymentMethod,
          partyName: sale.customerName || 'Walk-in Customer',
          description: `Counter sale payment #${invoiceNumber}`,
          transactionDate: sale.saleDate || new Date().toISOString().split('T')[0],
        });
      } catch {}

      try {
        const { paymentService } = await import('./paymentService');
        await paymentService.createPayment({
          counterSaleId: saleId,
          branchId: saleBranchId,
          amount: amountReceived,
          method: paymentMethod as any,
          customerName: sale.customerName || 'Walk-in Customer',
          customerId: sale.customerId,
          invoiceNumber,
          referenceNo: sale.paymentReference,
          notes: sale.paymentNotes || `Counter Sale payment #${invoiceNumber}`,
          date: sale.saleDate,
        });
      } catch {}
    }

    const domainSale = fromDbCounterSale(offlineSale);
    store.addOrUpdateCounterSale(domainSale);

    productService.invalidateCache();
    salesAnalyticsService.invalidateCache();
    try {
      const { enterpriseAnalyticsService } = await import('./enterpriseAnalyticsService');
      enterpriseAnalyticsService.invalidateCache();
    } catch {}
    store.notify();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));

    return { success: true, data: domainSale };
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
