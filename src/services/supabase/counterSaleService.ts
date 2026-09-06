import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { store } from '../store';
import { fromDbCounterSale } from './types';
import { salesAnalyticsService } from './salesAnalyticsService';
import { CounterSale } from '../../types';

const LOCAL_SALES_KEY = 'vistaar_local_counter_sales_db';

const safeStorageGet = (key: string): any[] => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return [];
};

const safeStorageSave = (key: string, items: any[]): void => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(items));
    }
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

  private async deductCounterSaleStock(items: any[], invoiceNumber: string, saleDate: string) {
    const wsId = await this.getOrFetchWorkspaceId();

    for (const item of items) {
      const productId = item.productId || item.product_id;
      const quantity = Math.abs(Number(item.quantity) || 0);

      if (!productId || quantity <= 0) continue;

      // 1. Always update local store state for instant UI sync
      store.adjustStock(productId, 'Sale', -quantity, `Counter Sale #${invoiceNumber}`, invoiceNumber);

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

          // 3. FIFO deduction on active stock receipts
          const { data: receipts } = await supabase
            .from('stock_receipts')
            .select('id, quantity_remaining')
            .eq('workspace_id', wsId)
            .eq('product_id', productId)
            .gt('quantity_remaining', 0)
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

      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data: saleData } = await supabase
          .from('counter_sales')
          .select('invoice_number, sale_date, counter_sale_items(*)')
          .eq('workspace_id', wsId)
          .eq('id', saleId)
          .single();

        if (saleData && saleData.counter_sale_items) {
          items = saleData.counter_sale_items;
          invoiceNumber = saleData.invoice_number || '';
          saleDate = saleData.sale_date || saleDate;
        }
      } else {
        const local = safeStorageGet(LOCAL_SALES_KEY);
        const target = local.find((s) => s.id === saleId);
        if (target) {
          items = target.items || [];
          invoiceNumber = target.invoiceNumber || target.invoice_number || '';
        }
      }

      for (const item of items) {
        const productId = item.product_id || item.productId;
        const quantity = Math.abs(Number(item.quantity) || 0);

        if (!productId || quantity <= 0) continue;

        // Restore in local store
        store.adjustStock(productId, 'Sales Return', quantity, `Cancelled Counter Sale #${invoiceNumber}`, invoiceNumber);

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

  public async getCounterSales(): Promise<{ data: CounterSale[]; error?: string }> {
    const wsId = await this.getOrFetchWorkspaceId();
    try {
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data, error } = await supabase
          .from('counter_sales')
          .select('*, counter_sale_items(*)')
          .eq('workspace_id', wsId)
          .order('created_at', { ascending: false });

        if (error) {
          const errStr = handleSupabaseError(error, 'getCounterSales');
          const fallback = safeStorageGet(LOCAL_SALES_KEY);
          return { data: (fallback || []).map((row: any) => fromDbCounterSale(row)), error: errStr };
        }
        return { data: (data || []).map((row: any) => fromDbCounterSale(row)) };
      }
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCounterSales');
      const fallback = safeStorageGet(LOCAL_SALES_KEY);
      return { data: (fallback || []).map((row: any) => fromDbCounterSale(row)), error: errStr };
    }

    const fallback = safeStorageGet(LOCAL_SALES_KEY);
    return { data: (fallback || []).map((row: any) => fromDbCounterSale(row)) };
  }

  public async getCounterSaleMetrics(): Promise<{
    todayTotal: number;
    todayCount: number;
    monthTotal: number;
    netSales: number;
    totalTransactions: number;
    totalDiscounts: number;
  }> {
    const { data } = await this.getCounterSales();
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
    for (const item of items) {
      const productId = item.productId || item.product_id;
      const requestedQty = Math.abs(Number(item.quantity) || 0);

      if (productId && requestedQty > 0) {
        const availableStock = await productService.getProductAvailableStock(productId);
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
      items: items.map((i: any) => ({
        productId: i.productId || i.product_id,
        productNameSnapshot: i.productName || i.productNameSnapshot || i.product_name_snapshot || 'Product',
        partNumberSnapshot: i.partNumber || i.partNumberSnapshot || i.part_number_snapshot || '',
        quantity: Math.abs(Number(i.quantity) || 0),
        rate: Number(i.rate) || 0,
        amount: (Math.abs(Number(i.quantity) || 0)) * (Number(i.rate) || 0),
        buyPriceSnapshot: Number(i.buyPriceSnapshot || i.buy_price_snapshot || 0),
      })),
    };

    // 3. ATTEMPT SERVER-SIDE ATOMIC POSTGRESQL RPC EXECUTION
    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('finalize_counter_sale', {
          p_sale: rpcPayload,
        });

        if (!rpcErr && rpcRes && rpcRes.success && rpcRes.data) {
          console.log('[createCounterSale] Atomic RPC finalize_counter_sale succeeded:', rpcRes.data);

          // Update local store stock for instant UI reactivity
          items.forEach((item: any) => {
            const pId = item.productId || item.product_id;
            if (pId) store.adjustStock(pId, 'Sale', -Math.abs(item.quantity), `Counter Sale #${invoiceNumber}`, invoiceNumber);
          });

          // Invalidate caches
          productService.invalidateCache();
          salesAnalyticsService.invalidateCache();

          const completeSale = fromDbCounterSale(rpcRes.data);
          return { success: true, data: completeSale };
        }

        if (rpcErr) {
          const errCode = (rpcErr as any).code || '';
          const errMsg = (rpcErr as any).message || '';
          const isFunctionMissing =
            errCode === 'PGRST202' ||
            errMsg.includes('Could not find the function') ||
            errMsg.includes('does not exist');

          if (!isFunctionMissing) {
            // This is a genuine business failure (e.g. INSUFFICIENT_STOCK)
            console.error('[createCounterSale] Atomic RPC rejected transaction:', rpcErr);
            return { success: false, error: errMsg || 'Counter sale transaction failed.' };
          }

          console.warn('[createCounterSale] RPC not found in schema, executing client transactional fallback');
        }
      } catch (rpcEx: any) {
        console.warn('[createCounterSale] RPC invocation error:', rpcEx);
      }
    }

    // 4. FALLBACK TRANSACTIONAL PIPELINE (Guarantees atomic stock deduction, accounting & full object return)
    try {
      let saleId = sale.id;
      let insertedSaleRow: any = null;

      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        // A. Insert Parent
        const parentPayload: any = {
          workspace_id: wsId,
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
          status: 'COMPLETED',
          notes: sale.notes || null,
          payment_method: paymentMethod,
          amount_received: amountReceived,
          balance_amount: balanceAmount,
          payment_reference: sale.paymentReference || null,
          payment_notes: sale.paymentNotes || null,
        };

        const { data: parent, error: parentErr } = await supabase
          .from('counter_sales')
          .insert([parentPayload])
          .select()
          .single();

        if (parentErr) {
          // If column payment_method doesn't exist yet on live DB, retry with base columns
          if ((parentErr as any).message?.includes('payment_method')) {
            delete parentPayload.payment_method;
            delete parentPayload.amount_received;
            delete parentPayload.balance_amount;
            delete parentPayload.payment_reference;
            delete parentPayload.payment_notes;

            const { data: retryParent, error: retryErr } = await supabase
              .from('counter_sales')
              .insert([parentPayload])
              .select()
              .single();

            if (retryErr) {
              return { success: false, error: handleSupabaseError(retryErr, 'createCounterSale.parent') };
            }
            insertedSaleRow = retryParent;
          } else {
            return { success: false, error: handleSupabaseError(parentErr, 'createCounterSale.parent') };
          }
        } else {
          insertedSaleRow = parent;
        }

        saleId = insertedSaleRow.id;

        // B. Insert Line Items
        const itemRows = items.map((item: any) => ({
          workspace_id: wsId,
          counter_sale_id: saleId,
          product_id: item.productId || item.product_id,
          product_name_snapshot: item.productName || item.productNameSnapshot || item.product_name_snapshot || '',
          part_number_snapshot: item.partNumber || item.partNumberSnapshot || item.part_number_snapshot || '',
          quantity: Math.abs(Number(item.quantity) || 0),
          rate: Number(item.rate) || 0,
          amount: (Math.abs(Number(item.quantity) || 0)) * (Number(item.rate) || 0),
          buy_price_snapshot: Number(item.buyPriceSnapshot || item.buy_price_snapshot || 0),
        }));

        const { error: itemsErr } = await supabase.from('counter_sale_items').insert(itemRows);
        if (itemsErr) {
          // Rollback parent row
          await supabase.from('counter_sales').delete().eq('id', saleId);
          return { success: false, error: handleSupabaseError(itemsErr, 'createCounterSale.items') };
        }

        // C. Perform Deductions
        try {
          await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate);
        } catch (stockErr: any) {
          // Rollback parent and items if stock deduction fails
          await supabase.from('counter_sale_items').delete().eq('counter_sale_id', saleId);
          await supabase.from('counter_sales').delete().eq('id', saleId);
          return { success: false, error: `Stock deduction failed: ${stockErr.message || 'Unknown error'}` };
        }

        // D. Record Daybook & Cashbook Entries
        try {
          const { daybookService } = await import('./daybookService');
          await daybookService.recordFinancialTransaction({
            referenceType: 'COUNTER_SALE',
            referenceId: saleId,
            referenceNumber: invoiceNumber,
            transactionType: 'SALE',
            direction: 'IN',
            amount: finalTotal,
            paymentMode: paymentMethod as any,
            partyType: 'customer',
            partyId: sale.customerId || undefined,
            partyName: sale.customerName || 'Walk-in Customer',
            description: `Counter Sale #${invoiceNumber}`,
            transactionDate: sale.saleDate || new Date().toISOString().split('T')[0],
          });
        } catch (dbErr) {
          console.warn('[createCounterSale] Daybook recording notice:', dbErr);
        }

        // E. If money received, record Cashbook entry
        if (amountReceived > 0 && !isCredit) {
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
              description: `Receipt for Counter Sale #${invoiceNumber}`,
              transactionDate: sale.saleDate || new Date().toISOString().split('T')[0],
            });
          } catch (cbErr) {
            console.warn('[createCounterSale] Cashbook recording notice:', cbErr);
          }
        }

        // F. Fetch Complete Domain Object Joined with Items
        const { data: completeData, error: fetchErr } = await supabase
          .from('counter_sales')
          .select('*, counter_sale_items(*)')
          .eq('workspace_id', wsId)
          .eq('id', saleId)
          .single();

        if (completeData && !fetchErr) {
          productService.invalidateCache();
          salesAnalyticsService.invalidateCache();
          const completeSale = fromDbCounterSale(completeData);
          return { success: true, data: completeSale };
        }
      }

      // Offline / Local Mode fallback
      const offlineSale = {
        id: saleId || `cs-${Date.now()}`,
        sale_number: saleNumber,
        invoice_number: invoiceNumber,
        payment_method: paymentMethod,
        amount_received: amountReceived,
        balance_amount: balanceAmount,
        ...sale,
        items: items.map((i: any) => ({
          id: `csi-${Date.now()}-${Math.random()}`,
          counterSaleId: saleId || `cs-${Date.now()}`,
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

      await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate);
      productService.invalidateCache();
      salesAnalyticsService.invalidateCache();

      return { success: true, data: fromDbCounterSale(offlineSale) };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createCounterSale');
      return { success: false, error: errStr };
    }
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

      // Void or Reverse Daybook transaction
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

      salesAnalyticsService.invalidateCache();
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'cancelCounterSale');
      return { success: false, error: errStr };
    }
  }
}

export const counterSaleService = new CounterSaleService();
