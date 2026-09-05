import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { store } from '../store';
import { fromDbCounterSale } from './types';

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
    const wsId = this.getWorkspaceId();

    for (const item of items) {
      const productId = item.productId || item.product_id;
      const quantity = Math.abs(Number(item.quantity) || 0);

      if (!productId || quantity <= 0) continue;

      // 1. Always update local store state for instant UI sync
      store.adjustStock(productId, 'Sale', -quantity, `Counter Sale #${invoiceNumber}`, invoiceNumber);

      if (isSupabaseConfigured()) {
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
              .update({ current_stock: newStock })
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
                .update({ quantity_remaining: newRem })
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
          console.warn('Failed to perform Supabase stock deduction for item:', item, e);
        }
      }
    }
  }

  private async restoreCounterSaleStock(saleId: string) {
    const wsId = this.getWorkspaceId();

    try {
      let items: any[] = [];
      let invoiceNumber = '';
      let saleDate = new Date().toISOString().split('T')[0];

      if (isSupabaseConfigured()) {
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

        if (isSupabaseConfigured()) {
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
              .update({ current_stock: newStock })
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
              .update({ quantity_remaining: newRem })
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

  public async getCounterSales(): Promise<{ data: any[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
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
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCounterSales');
      const fallback = safeStorageGet(LOCAL_SALES_KEY);
      return { data: (fallback || []).map((row: any) => fromDbCounterSale(row)), error: errStr };
    }
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
    const sales = data || [];
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);

    const todaySales = sales.filter((s: any) => (s.sale_date || s.saleDate) === todayStr);
    const monthSales = sales.filter((s: any) => ((s.sale_date || s.saleDate) || '').startsWith(currentMonthStr));

    const todayTotal = todaySales.reduce((acc: number, s: any) => acc + (s.final_total || s.finalTotal || 0), 0);
    const monthTotal = monthSales.reduce((acc: number, s: any) => acc + (s.final_total || s.finalTotal || 0), 0);
    const netSales = sales.reduce((acc: number, s: any) => acc + (s.final_total || s.finalTotal || 0), 0);
    const totalDiscounts = sales.reduce((acc: number, s: any) => acc + (s.discount_amount || s.discountAmount || 0), 0);

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

  public async createCounterSale(sale: any): Promise<{ success: boolean; data?: any; error?: string }> {
    const wsId = await this.getOrFetchWorkspaceId();
    const saleNumber = sale.saleNumber || `CS-${Date.now()}`;
    const invoiceNumber = (sale.invoiceNumber || saleNumber).trim();
    const items = sale.items || [];

    if (!items || items.length === 0) {
      return { success: false, error: 'Please select at least one product for the counter sale.' };
    }

    // 1. PRE-FINALIZATION STOCK VALIDATION FOR ALL ITEMS (Atomic check)
    const { productService } = await import('./productService');
    for (const item of items) {
      const productId = item.productId || item.product_id;
      const requestedQty = Math.abs(Number(item.quantity) || 0);

      if (productId && requestedQty > 0) {
        const availableStock = await productService.getProductAvailableStock(productId);
        if (requestedQty > availableStock) {
          const prodName = item.productName || item.product_name_snapshot || 'Product';
          return {
            success: false,
            error: `Insufficient stock for "${prodName}". Requested ${requestedQty}, but only ${availableStock} units are available.`,
          };
        }
      }
    }

    try {
      // 2. IDEMPOTENCY CHECK: Check if sale is already completed
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        const { data: existingSale } = await supabase
          .from('counter_sales')
          .select('*, counter_sale_items(*)')
          .eq('workspace_id', wsId)
          .or(`invoice_number.eq.${invoiceNumber},sale_number.eq.${saleNumber}`)
          .maybeSingle();

        if (existingSale && existingSale.status === 'COMPLETED') {
          console.log('[COUNTER SALE IDEMPOTENCY] Sale already completed:', invoiceNumber);
          return { success: true, data: existingSale };
        }
      }

      // 3. Insert counter sale parent record
      let saleId = sale.id;
      let parent: any = null;

      if (isSupabaseConfigured()) {
        const parentPayload: any = {
          customer_id: sale.customerId || null,
          sale_number: saleNumber,
          invoice_number: invoiceNumber,
          customer_name: sale.customerName || 'Walk-in Customer',
          phone_number: sale.phoneNumber || '',
          sale_date: sale.saleDate || new Date().toISOString().split('T')[0],
          subtotal: sale.subtotal || 0,
          discount_type: sale.discountType || 'fixed',
          discount_value: sale.discountValue || 0,
          discount_amount: sale.discountAmount || 0,
          final_total: sale.finalTotal || 0,
          status: 'COMPLETED',
        };

        if (isValidUuid(wsId)) {
          parentPayload.workspace_id = wsId;
        }

        const { data: insertedParent, error: parentErr } = await supabase
          .from('counter_sales')
          .insert([parentPayload])
          .select()
          .single();

        if (parentErr) {
          const errStr = handleSupabaseError(parentErr, 'createCounterSale');
          if (errStr.startsWith('Network Error') || !isSupabaseConfigured()) {
            const newSale = { id: `cs-${Date.now()}`, sale_number: saleNumber, ...sale, createdAt: new Date().toISOString() };
            const local = safeStorageGet(LOCAL_SALES_KEY);
            local.unshift(newSale);
            safeStorageSave(LOCAL_SALES_KEY, local);

            // Deduct stock for offline sale
            await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate);
            return { success: true, data: newSale };
          }
          return { success: false, error: errStr };
        }

        parent = insertedParent;
        saleId = parent.id;

        // Insert items
        if (items && items.length > 0) {
          const itemRows = items.map((item: any) => {
            const row: any = {
              counter_sale_id: saleId,
              product_id: item.productId || item.product_id,
              product_name_snapshot: item.productName || item.product_name_snapshot || '',
              part_number_snapshot: item.partNumber || item.part_number_snapshot || '',
              quantity: item.quantity,
              rate: item.rate,
              amount: (item.quantity || 0) * (item.rate || 0),
              buy_price_snapshot: item.buyPriceSnapshot || 0,
            };
            if (isValidUuid(wsId)) {
              row.workspace_id = wsId;
            }
            return row;
          });

          const { error: itemsErr } = await supabase.from('counter_sale_items').insert(itemRows);
          if (itemsErr) {
            handleSupabaseError(itemsErr, 'createCounterSale.items');
          }
        }

        // Try Atomic PostgreSQL RPC execution
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('finalize_counter_sale_stock', {
            p_sale_id: saleId,
          });

          if (rpcErr) {
            console.warn('[RPC finalize_counter_sale_stock fallback]', rpcErr);
            await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate);
          } else {
            console.log('[RPC finalize_counter_sale_stock success]', rpcRes);
            // Sync local store state for instant UI update
            items.forEach((item: any) => {
              const pId = item.productId || item.product_id;
              if (pId) store.adjustStock(pId, 'Sale', -Math.abs(item.quantity), `Counter Sale #${invoiceNumber}`, invoiceNumber);
            });
          }
        } catch (rpcEx) {
          console.warn('[RPC Exception fallback]', rpcEx);
          await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate);
        }
      } else {
        // Local/Offline Mode
        parent = { id: `cs-${Date.now()}`, sale_number: saleNumber, ...sale, createdAt: new Date().toISOString() };
        const local = safeStorageGet(LOCAL_SALES_KEY);
        local.unshift(parent);
        safeStorageSave(LOCAL_SALES_KEY, local);

        await this.deductCounterSaleStock(items, invoiceNumber, sale.saleDate);
      }

      // Record Daybook Financial Transaction
      try {
        const { daybookService } = await import('./daybookService');
        await daybookService.recordFinancialTransaction({
          referenceType: 'COUNTER_SALE',
          referenceId: saleId,
          referenceNumber: invoiceNumber || saleNumber,
          transactionType: 'SALE',
          direction: 'IN',
          amount: sale.finalTotal || 0,
          paymentMode: (sale.paymentMethod || sale.paymentMode || 'Cash') as any,
          partyType: 'customer',
          partyId: sale.customerId || undefined,
          partyName: sale.customerName || 'Walk-in Customer',
          description: `Counter Sale #${invoiceNumber || saleNumber}`,
          transactionDate: sale.saleDate || new Date().toISOString().split('T')[0],
        });
      } catch (dbErr) {
        console.warn('Failed to record Daybook entry for counter sale:', dbErr);
      }

      return { success: true, data: parent };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createCounterSale');
      return { success: false, error: errStr };
    }
  }

  public async cancelCounterSale(saleId: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      if (isSupabaseConfigured()) {
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
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('cancel_counter_sale_stock', {
          p_sale_id: saleId,
        });

        if (rpcErr) {
          console.warn('[RPC cancel_counter_sale_stock fallback]', rpcErr);
          const { error } = await supabase
            .from('counter_sales')
            .update({ status: 'CANCELLED' })
            .eq('workspace_id', wsId)
            .eq('id', saleId);

          if (error) {
            const errStr = handleSupabaseError(error, 'cancelCounterSale');
            return { success: false, error: errStr };
          }
          await this.restoreCounterSaleStock(saleId);
        } else {
          console.log('[RPC cancel_counter_sale_stock success]', rpcRes);
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

      // Void Daybook transaction
      try {
        const { daybookService } = await import('./daybookService');
        const { data: daybookTx } = await daybookService.getTransactions({ search: saleId });
        const match = (daybookTx || []).find((t) => t.referenceId === saleId && t.referenceType === 'COUNTER_SALE');
        if (match) {
          await daybookService.voidTransaction(match.id, 'Counter sale cancelled');
        }
      } catch (e) {
        // ignore
      }

      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'cancelCounterSale');
      return { success: false, error: errStr };
    }
  }

}

export const counterSaleService = new CounterSaleService();
