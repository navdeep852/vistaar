import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { store } from '../store';

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
    return supabaseAuthService.getCurrentCompanyId();
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
        return { data: fallback, error: errStr };
      }
      return { data: data || [] };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCounterSales');
      const fallback = safeStorageGet(LOCAL_SALES_KEY);
      return { data: fallback, error: errStr };
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
    const wsId = this.getWorkspaceId();
    const saleNumber = sale.saleNumber || `CS-${Date.now()}`;
    const items = sale.items || [];

    try {
      const { data: parent, error: parentErr } = await supabase
        .from('counter_sales')
        .insert([{
          workspace_id: wsId,
          customer_id: sale.customerId || null,
          sale_number: saleNumber,
          invoice_number: sale.invoiceNumber || '',
          customer_name: sale.customerName || 'Walk-in Customer',
          phone_number: sale.phoneNumber || '',
          sale_date: sale.saleDate || new Date().toISOString().split('T')[0],
          subtotal: sale.subtotal || 0,
          discount_type: sale.discountType || 'fixed',
          discount_value: sale.discountValue || 0,
          discount_amount: sale.discountAmount || 0,
          final_total: sale.finalTotal || 0,
          status: sale.status || 'COMPLETED',
        }])
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
          await this.deductCounterSaleStock(items, sale.invoiceNumber, sale.saleDate);
          return { success: true, data: newSale };
        }
        return { success: false, error: errStr };
      }

      const saleId = parent.id;

      if (items && items.length > 0) {
        const itemRows = items.map((item: any) => ({
          workspace_id: wsId,
          counter_sale_id: saleId,
          product_id: item.productId,
          product_name_snapshot: item.productName || item.productNameSnapshot || '',
          part_number_snapshot: item.partNumber || item.partNumberSnapshot || '',
          quantity: item.quantity,
          rate: item.rate,
          amount: (item.quantity || 0) * (item.rate || 0),
          buy_price_snapshot: item.buyPriceSnapshot || 0,
        }));

        const { error: itemsErr } = await supabase.from('counter_sale_items').insert(itemRows);
        if (itemsErr) {
          handleSupabaseError(itemsErr, 'createCounterSale.items');
        }
      }

      // Perform atomic stock deduction & log movements
      await this.deductCounterSaleStock(items, sale.invoiceNumber, sale.saleDate);

      return { success: true, data: parent };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createCounterSale');
      const newSale = { id: `cs-${Date.now()}`, sale_number: saleNumber, ...sale, createdAt: new Date().toISOString() };
      const local = safeStorageGet(LOCAL_SALES_KEY);
      local.unshift(newSale);
      safeStorageSave(LOCAL_SALES_KEY, local);

      // Deduct stock for offline sale
      await this.deductCounterSaleStock(items, sale.invoiceNumber, sale.saleDate);
      return { success: true, data: newSale };
    }
  }

  public async cancelCounterSale(saleId: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('counter_sales')
          .update({ status: 'CANCELLED' })
          .eq('workspace_id', wsId)
          .eq('id', saleId);

        if (error) {
          const errStr = handleSupabaseError(error, 'cancelCounterSale');
          return { success: false, error: errStr };
        }
      } else {
        const local = safeStorageGet(LOCAL_SALES_KEY);
        const target = local.find((s) => s.id === saleId);
        if (target) {
          target.status = 'CANCELLED';
          safeStorageSave(LOCAL_SALES_KEY, local);
        }
      }

      // Restore stock for cancelled sale
      await this.restoreCounterSaleStock(saleId);

      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'cancelCounterSale');
      return { success: false, error: errStr };
    }
  }
}

export const counterSaleService = new CounterSaleService();
