import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Product, Category, Supplier } from '../../types';
import { DbProduct, DbCategory, DbSupplier, fromDbProduct, toDbProduct } from './types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError } from '../../lib/supabaseError';
import { store } from '../store';

import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_PRODUCTS_KEY = 'vistaar_local_products_db';

export class ProductService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  public async getProducts(options?: {
    search?: string;
    categoryId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: Product[]; count: number; error?: string }> {
    if (!isSupabaseConfigured()) {
      let items = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      if (options?.search) {
        const s = options.search.toLowerCase();
        items = items.filter(
          (p) =>
            p.name.toLowerCase().includes(s) ||
            p.sku.toLowerCase().includes(s) ||
            (p.partNumber && p.partNumber.toLowerCase().includes(s))
        );
      }
      if (options?.categoryId) {
        items = items.filter((p) => p.category === options.categoryId);
      }
      return { data: items, count: items.length };
    }

    const wsId = this.getWorkspaceId();
    let query = supabase.from('products').select('*', { count: 'exact' }).eq('workspace_id', wsId);

    if (options?.search) {
      const s = `%${options.search}%`;
      query = query.or(`name.ilike.${s},sku.ilike.${s},part_number.ilike.${s}`);
    }

    if (options?.categoryId) {
      query = query.eq('category_id', options.categoryId);
    }

    if (options?.page && options?.pageSize) {
      const from = (options.page - 1) * options.pageSize;
      const to = from + options.pageSize - 1;
      query = query.range(from, to);
    }

    query = query.order('name', { ascending: true });

    try {
      const { data, count, error } = await query;
      if (error) {
        const errStr = handleSupabaseError(error, 'getProducts');
        return { data: [], count: 0, error: errStr };
      }

      // Fetch stock receipt sums for accurate available stock calculation
      const { data: receipts } = await supabase
        .from('stock_receipts')
        .select('product_id, quantity_remaining')
        .eq('workspace_id', wsId);

      const stockMap: Record<string, number> = {};
      if (receipts && Array.isArray(receipts)) {
        receipts.forEach((r: any) => {
          if (r.product_id) {
            stockMap[r.product_id] = (stockMap[r.product_id] || 0) + (r.quantity_remaining || 0);
          }
        });
      }

      const products = (data as DbProduct[]).map((row) => {
        const p = fromDbProduct(row);
        const calculatedStock = stockMap[row.id];
        if (calculatedStock !== undefined) {
          p.currentStock = calculatedStock;
        }
        return p;
      });

      return { data: products, count: count || 0 };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getProducts');
      return { data: [], count: 0, error: errStr };
    }
  }

  public async createProduct(product: Partial<Product>): Promise<{ product?: Product; error?: string }> {
    if (!isSupabaseConfigured()) {
      const fullProd: Product = {
        id: product.id || `prod-${Date.now()}`,
        name: product.name || 'Untitled Product',
        sku: product.sku || `SKU-${Date.now()}`,
        partNumber: product.partNumber || '',
        category: product.category || 'General',
        brand: product.brand || '',
        unit: product.unit || 'Piece',
        buyPrice: product.buyPrice || 0,
        sellingPrice: product.sellingPrice || 0,
        currentStock: product.currentStock || 0,
        minimumStock: product.minimumStock || 5,
        hsnSac: product.hsnSac || '',
        gstRate: product.gstRate || 18,
        notes: product.notes || '',
        categoryId: product.categoryId || '',
        taxPercent: product.taxPercent || product.gstRate || 18,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const local = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      local.unshift(fullProd);
      safeSaveTenantStorage(LOCAL_PRODUCTS_KEY, local);
      return { product: fullProd };
    }

    const wsId = this.getWorkspaceId();
    const payload = toDbProduct(product, wsId);

    try {
      const { data, error } = await supabase
        .from('products')
        .insert([payload])
        .select()
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'createProduct');
        return { error: errStr };
      }

      const createdProduct = fromDbProduct(data as DbProduct);
      const initialStock = product.currentStock || 0;

      // If initial stock is specified, create an initial stock receipt (GRN) in Supabase
      if (initialStock > 0 && createdProduct.id) {
        try {
          const pAny = product as any;
          const receiptPayload = {
            workspace_id: wsId,
            product_id: createdProduct.id,
            supplier_id: product.supplierId || null,
            receipt_number: `GRN-${Date.now()}`,
            purchase_order_number: pAny.purchaseOrderNumber || null,
            received_date: pAny.receivedDate || new Date().toISOString().split('T')[0],
            quantity_received: initialStock,
            quantity_remaining: initialStock,
            buy_price: product.buyPrice || 0,
            notes: product.notes || 'Initial Stock on Creation',
          };
          await supabase.from('stock_receipts').insert([receiptPayload]);
        } catch (e) {
          // Log warning if stock receipt insert fails but product row exists
          console.warn('Initial stock receipt creation failed:', e);
        }
        createdProduct.currentStock = initialStock;
      }

      return { product: createdProduct };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'createProduct');
      return { error: errStr };
    }
  }

  public async addProduct(product: Partial<Product>): Promise<{ success: boolean; data?: Product; error?: string }> {
    const res = await this.createProduct(product);
    if (res.error || !res.product) return { success: false, error: res.error };
    return { success: true, data: res.product };
  }

  public async getProductAvailableStock(productId: string): Promise<number> {
    if (!isSupabaseConfigured()) {
      const p = store.getProducts().find((prod) => prod.id === productId);
      return Math.max(0, Number(p?.currentStock) || 0);
    }

    const wsId = this.getWorkspaceId();
    try {
      // 1. Try fetching sum of active stock receipts
      const { data: receipts, error: recErr } = await supabase
        .from('stock_receipts')
        .select('quantity_remaining')
        .eq('workspace_id', wsId)
        .eq('product_id', productId);

      if (!recErr && receipts && receipts.length > 0) {
        const batchSum = receipts.reduce((acc, row) => acc + (Number(row.quantity_remaining) || 0), 0);
        if (batchSum > 0) return Math.max(0, batchSum);
      }

      // 2. Fallback to product.current_stock directly on products table
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('current_stock')
        .eq('workspace_id', wsId)
        .eq('id', productId)
        .maybeSingle();

      if (!prodErr && prodData) {
        return Math.max(0, Number(prodData.current_stock) || 0);
      }

      // 3. Fallback to local store
      const p = store.getProducts().find((prod) => prod.id === productId);
      return Math.max(0, Number(p?.currentStock) || 0);
    } catch (e) {
      handleSupabaseError(e, 'getProductAvailableStock');
      const p = store.getProducts().find((prod) => prod.id === productId);
      return Math.max(0, Number(p?.currentStock) || 0);
    }
  }

  public async updateProduct(id: string, product: Partial<Product>): Promise<{ product?: Product; error?: string }> {
    const wsId = this.getWorkspaceId();
    const payload = toDbProduct(product, wsId);

    try {
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('workspace_id', wsId)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        const errStr = handleSupabaseError(error, 'updateProduct');
        return { error: errStr };
      }
      return { product: fromDbProduct(data as DbProduct) };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'updateProduct');
      return { error: errStr };
    }
  }

  public async deleteProduct(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) {
        const errStr = handleSupabaseError(error, 'deleteProduct');
        return { success: false, error: errStr };
      }
      return { success: true };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'deleteProduct');
      return { success: false, error: errStr };
    }
  }

  public async deactivateProduct(id: string): Promise<{ success: boolean; error?: string }> {
    return this.deleteProduct(id);
  }

  public async getProductDetails(id: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const wsId = this.getWorkspaceId();
    try {
      const { data: pData, error: pErr } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('id', id)
        .single();

      if (pErr) {
        const errStr = handleSupabaseError(pErr, 'getProductDetails');
        return { success: false, error: errStr };
      }
      if (!pData) return { success: false, error: 'Product not found' };
      const product = fromDbProduct(pData as DbProduct);
      const { data: receipts } = await supabase
        .from('stock_receipts')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('product_id', id);
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('product_id', id);

      return {
        success: true,
        data: {
          product,
          stockReceipts: receipts || [],
          stockMovements: movements || [],
        },
      };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getProductDetails');
      return { success: false, error: errStr };
    }
  }

  public async getCategories(): Promise<{ data: Category[]; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { data: store.getCategories() };
    }
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase.from('categories').select('*').eq('workspace_id', wsId);
      if (error) {
        const errStr = handleSupabaseError(error, 'getCategories');
        return { data: [], error: errStr };
      }
      const categories: Category[] = (data as DbCategory[]).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
      }));
      return { data: categories };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCategories');
      return { data: [], error: errStr };
    }
  }

  public async getSuppliers(): Promise<{ data: Supplier[]; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { data: store.getSuppliers() };
    }
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase.from('suppliers').select('*').eq('workspace_id', wsId);
      if (error) {
        const errStr = handleSupabaseError(error, 'getSuppliers');
        return { data: [], error: errStr };
      }
      const suppliers: Supplier[] = (data as DbSupplier[]).map((s) => ({
        id: s.id,
        name: s.name,
        contactPerson: s.contact_person || '',
        phone: s.phone || '',
        email: s.email || '',
        address: s.address || '',
      }));
      return { data: suppliers };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getSuppliers');
      return { data: [], error: errStr };
    }
  }
}

export const productService = new ProductService();
