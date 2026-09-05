import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Product, Category, Supplier } from '../../types';
import { DbProduct, DbCategory, DbSupplier, fromDbProduct, toDbProduct } from './types';
import { supabaseAuthService } from '../supabaseAuth';
import { handleSupabaseError, isValidUuid } from '../../lib/supabaseError';
import { store } from '../store';

import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';
import { validateIndianPhoneNumber } from '../../lib/phoneUtils';

const LOCAL_PRODUCTS_KEY = 'vistaar_local_products_db';

export class ProductService {
  private productsCache: { data: Product[]; count: number; timestamp: number; wsId: string } | null = null;
  private categoriesCache: { data: Category[]; timestamp: number; wsId: string } | null = null;
  private CACHE_TTL_MS = 30000; // 30 seconds

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
      console.warn('Failed to get authoritative workspace ID in productService:', e);
    }
    return '';
  }

  public invalidateCache(): void {
    this.productsCache = null;
    this.categoriesCache = null;
  }

  public async getProducts(options?: {
    search?: string;
    categoryId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: Product[]; count: number; error?: string }> {
    let wsId = this.getWorkspaceId();
    const isDefaultFetch = !options?.search && !options?.categoryId && !options?.page;

    // Return from in-memory cache if available and fresh (<30s)
    if (isDefaultFetch && this.productsCache && this.productsCache.wsId === wsId && (Date.now() - this.productsCache.timestamp < this.CACHE_TTL_MS)) {
      return { data: this.productsCache.data, count: this.productsCache.count };
    }

    if (!isSupabaseConfigured()) {
      let items = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      const receipts = safeGetTenantStorage<any>('vistaar_local_stock_receipts_db', []);
      const stockMap: Record<string, number> = {};
      if (receipts && Array.isArray(receipts)) {
        receipts.forEach((r: any) => {
          if (r.product_id) {
            stockMap[r.product_id] = (stockMap[r.product_id] || 0) + (Number(r.quantity_remaining) || 0);
          }
        });
      }

      items = items.map((p) => {
        const recStock = stockMap[p.id];
        return {
          ...p,
          productName: p.productName || p.name,
          productCode: p.productCode || p.partNumber || '',
          currentStock: recStock !== undefined ? recStock : p.currentStock || 0,
        };
      });

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
        items = items.filter((p) => p.category === options.categoryId || p.categoryId === options.categoryId);
      }
      return { data: items, count: items.length };
    }

    wsId = await this.getOrFetchWorkspaceId();
    const SELECT_FIELDS = 'id, workspace_id, name, sku, part_number, product_code, category_id, categories(name), brand, unit, buy_price, selling_price, current_stock, minimum_stock, hsn_sac, gst_rate, tax_percent, active, created_at, updated_at';

    let query = supabase
      .from('products')
      .select(SELECT_FIELDS, { count: 'exact' })
      .eq('active', true);

    if (isValidUuid(wsId)) {
      query = query.eq('workspace_id', wsId);
    }

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

      const products = (data as DbProduct[]).map((row) => fromDbProduct(row));

      if (isDefaultFetch) {
        this.productsCache = {
          data: products,
          count: count || products.length,
          timestamp: Date.now(),
          wsId,
        };
      }

      return { data: products, count: count || 0 };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getProducts');
      return { data: [], count: 0, error: errStr };
    }
  }

  public async searchProducts(searchTerm: string, limit: number = 50): Promise<{ data: Product[]; error?: string }> {
    const s = (searchTerm || '').trim();

    // Get products from local store cache for instant availability
    const storeProducts = store.getProducts();

    if (!isSupabaseConfigured()) {
      let items = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      const allItems = [...items];
      storeProducts.forEach((sp) => {
        if (!allItems.some((p) => p.id === sp.id)) {
          allItems.push(sp);
        }
      });
      if (s.length < 1) {
        return { data: allItems.slice(0, limit) };
      }
      const q = s.toLowerCase();
      const matched = allItems.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          ((p as any).productName && (p as any).productName.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
          ((p as any).barcode && (p as any).barcode.toLowerCase().includes(q)) ||
          ((p as any).productCode && (p as any).productCode.toLowerCase().includes(q))
      ).slice(0, limit);

      return { data: matched };
    }

    const wsId = await this.getOrFetchWorkspaceId();

    try {
      const SELECT_FIELDS = 'id, workspace_id, name, sku, part_number, product_code, barcode, category_id, categories(name), brand, unit, buy_price, selling_price, current_stock, minimum_stock, hsn_sac, gst_rate, tax_percent, active, created_at, updated_at';

      let query = supabase
        .from('products')
        .select(SELECT_FIELDS)
        .eq('active', true);

      if (isValidUuid(wsId)) {
        query = query.eq('workspace_id', wsId);
      }

      if (s.length > 0) {
        const pattern = `%${s}%`;
        query = query.or(`name.ilike.${pattern},sku.ilike.${pattern},part_number.ilike.${pattern},barcode.ilike.${pattern},product_code.ilike.${pattern}`);
      }

      const { data, error } = await query
        .order('name', { ascending: true })
        .limit(limit);

      if (error) {
        const errStr = handleSupabaseError(error, 'searchProducts');
        const q = s.toLowerCase();
        const matched = storeProducts.filter(
          (p) =>
            !s ||
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.sku && p.sku.toLowerCase().includes(q)) ||
            (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
            ((p as any).barcode && (p as any).barcode.toLowerCase().includes(q))
        ).slice(0, limit);
        return { data: matched, error: errStr };
      }

      const products = (data as DbProduct[]).map((row) => fromDbProduct(row));

      return { data: products };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'searchProducts');
      const q = s.toLowerCase();
      const matched = storeProducts.filter(
        (p) =>
          !s ||
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
          ((p as any).barcode && (p as any).barcode.toLowerCase().includes(q))
      ).slice(0, limit);
      return { data: matched, error: errStr };
    }
  }


  public async createProduct(product: Partial<Product>): Promise<{ product?: Product; error?: string }> {
    const prodName = (product.name || (product as any).productName || 'Untitled Product').trim();
    const partNo = (product.partNumber || (product as any).productCode || '').trim();
    const skuCode = (product.sku || partNo || `SKU-${Date.now()}`).trim();
    const initialStock = Number(product.currentStock) || 0;

    if (!isSupabaseConfigured()) {
      const fullProd: Product = {
        id: product.id || `prod-${Date.now()}`,
        name: prodName,
        productName: prodName,
        sku: skuCode,
        partNumber: partNo,
        productCode: partNo,
        category: product.category || 'General',
        brand: product.brand || '',
        unit: product.unit || 'Piece',
        buyPrice: Number(product.buyPrice) || 0,
        sellingPrice: Number(product.sellingPrice) || Number(product.buyPrice) || 0,
        currentStock: initialStock,
        minimumStock: Number(product.minimumStock) || 5,
        hsnSac: product.hsnSac || '',
        gstRate: Number(product.gstRate) || 18,
        notes: product.notes || '',
        categoryId: product.categoryId || '',
        taxPercent: Number(product.taxPercent) || Number(product.gstRate) || 18,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const local = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      local.unshift(fullProd);
      safeSaveTenantStorage(LOCAL_PRODUCTS_KEY, local);

      // Save initial stock receipt locally if initialStock > 0
      if (initialStock > 0) {
        const localReceipts = safeGetTenantStorage<any>('vistaar_local_stock_receipts_db', []);
        localReceipts.unshift({
          id: `rcpt-${Date.now()}`,
          workspace_id: this.getWorkspaceId(),
          product_id: fullProd.id,
          receipt_number: `GRN-${Date.now()}`,
          purchase_order_number: (product as any).purchaseOrderNumber || '',
          received_date: (product as any).receivedDate || new Date().toISOString().split('T')[0],
          quantity_received: initialStock,
          quantity_remaining: initialStock,
          buy_price: fullProd.buyPrice,
          notes: product.notes || 'Initial Stock on Creation',
          created_at: new Date().toISOString(),
        });
        safeSaveTenantStorage('vistaar_local_stock_receipts_db', localReceipts);
      }

      return { product: fullProd };
    }

    const authUserId = supabaseAuthService.getUser()?.id || '';
    let cachedWsId = supabaseAuthService.getCurrentCompanyId();
    let authWsId = await supabaseAuthService.getAuthoritativeWorkspaceId(true);

    if (cachedWsId !== authWsId) {
      console.warn(`[WORKSPACE_RECONCILIATION_RETRY] Cached workspace_id (${cachedWsId}) differs from authoritative database workspace_id (${authWsId}). Refreshing session...`);
      cachedWsId = authWsId;
    }

    supabaseAuthService.assertWorkspaceIdValid(authWsId, 'INSERT', 'products');
    const wsId = authWsId;

    // Resolve Category ID if name provided but ID missing
    let resolvedCategoryId = product.categoryId;
    if (!resolvedCategoryId && product.category) {
      try {
        let catQuery = supabase.from('categories').select('id, name');
        if (isValidUuid(wsId)) {
          catQuery = catQuery.eq('workspace_id', wsId);
        }
        const { data: existingCats } = await catQuery.ilike('name', product.category.trim());
        if (existingCats && existingCats.length > 0) {
          resolvedCategoryId = existingCats[0].id;
        } else {
          const catPayload: any = { name: product.category.trim(), description: 'Auto-created category' };
          if (isValidUuid(wsId)) {
            catPayload.workspace_id = wsId;
          }
          const { data: newCat } = await supabase
            .from('categories')
            .insert([catPayload])
            .select('id')
            .single();
          if (newCat) {
            resolvedCategoryId = newCat.id;
          }
        }
      } catch (e) {
        // Ignore category lookup fallback
      }
    }

    const payload = toDbProduct({ ...product, categoryId: resolvedCategoryId }, wsId);

    console.log('PRODUCT INSERT WORKSPACE DEBUG', {
      'auth.uid()': authUserId,
      'cached workspace_id': cachedWsId,
      'authoritative workspace_id': authWsId,
      'payload workspace_id': payload.workspace_id,
    });

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
      createdProduct.productName = prodName;
      createdProduct.productCode = partNo;
      createdProduct.category = product.category || 'General';

      // If initial stock is specified, create an initial stock receipt (GRN) in Supabase
      if (initialStock > 0 && createdProduct.id) {
        try {
          const pAny = product as any;
          const receiptPayload: any = {
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
          if (isValidUuid(wsId)) {
            receiptPayload.workspace_id = wsId;
          }
          await supabase.from('stock_receipts').insert([receiptPayload]);

          let stockUpdateQuery = supabase
            .from('products')
            .update({ current_stock: initialStock, updated_at: new Date().toISOString() })
            .eq('id', createdProduct.id);
          if (isValidUuid(wsId)) {
            stockUpdateQuery = stockUpdateQuery.eq('workspace_id', wsId);
          }
          await stockUpdateQuery;
        } catch (e) {
          console.warn('Initial stock receipt creation failed:', e);
        }
        createdProduct.currentStock = initialStock;
      }

      // Also cache in local tenant storage for immediate UI rendering
      const local = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      local.unshift(createdProduct);
      safeSaveTenantStorage(LOCAL_PRODUCTS_KEY, local);

      this.invalidateCache();
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

  /**
   * Resolves the canonical database Product record for an item.
   * Prevents identity mismatches where productId points to a different product than productName.
   */
  public async resolveCanonicalProduct(item: { productId?: string; productName?: string; sku?: string; partNumber?: string }): Promise<Product | null> {
    const wsId = await this.getOrFetchWorkspaceId();
    const cleanName = (item.productName || '').trim();
    const cleanSku = (item.sku || '').trim();
    const cleanPartNo = (item.partNumber || '').trim();

    // 1. Try matching by productId UUID first if valid
    if (item.productId && isValidUuid(item.productId)) {
      if (isSupabaseConfigured()) {
        let query = supabase.from('products').select('*, categories(name)').eq('id', item.productId).eq('active', true);
        if (isValidUuid(wsId)) {
          query = query.eq('workspace_id', wsId);
        }
        const { data: prod } = await query.maybeSingle();
        if (prod) {
          if (!cleanName || prod.name.toLowerCase() === cleanName.toLowerCase()) {
            return fromDbProduct(prod as DbProduct);
          }
        }
      } else {
        const local = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
        const p = local.find((prod) => prod.id === item.productId) || store.getProducts().find((prod) => prod.id === item.productId);
        if (p) return p;
      }
    }

    // 2. Fallback search by productName, SKU, or part number if productId was missing or mismatched
    if (isSupabaseConfigured() && (cleanName || cleanSku || cleanPartNo)) {
      let query = supabase.from('products').select('*, categories(name)').eq('active', true);
      if (isValidUuid(wsId)) {
        query = query.eq('workspace_id', wsId);
      }

      if (cleanName) {
        query = query.ilike('name', cleanName);
      } else if (cleanSku) {
        query = query.ilike('sku', cleanSku);
      } else if (cleanPartNo) {
        query = query.ilike('part_number', cleanPartNo);
      }

      const { data: matched } = await query.limit(1).maybeSingle();
      if (matched) {
        return fromDbProduct(matched as DbProduct);
      }
    }

    // 3. Check local store memory fallback
    const storeProds = store.getProducts();
    const matchStore = storeProds.find(
      (p) =>
        (item.productId && p.id === item.productId) ||
        (cleanName && p.name.toLowerCase() === cleanName.toLowerCase()) ||
        (cleanSku && p.sku.toLowerCase() === cleanSku.toLowerCase())
    );
    return matchStore || null;
  }

  public async getProductAvailableStock(productId: string): Promise<number> {
    if (!productId) return 0;

    if (!isSupabaseConfigured()) {
      const local = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      const p = local.find((prod) => prod.id === productId) || store.getProducts().find((prod) => prod.id === productId);
      const prodStock = Math.max(0, Number(p?.currentStock) || 0);

      const receipts = safeGetTenantStorage<any>('vistaar_local_stock_receipts_db', []).filter(
        (r: any) => r.product_id === productId
      );
      if (receipts.length > 0) {
        const batchSum = receipts.reduce((acc, row) => acc + (Number(row.quantity_remaining) || 0), 0);
        return Math.max(prodStock, Math.max(0, batchSum));
      }
      return prodStock;
    }

    const wsId = await this.getOrFetchWorkspaceId();
    try {
      // 1. Fetch current_stock directly from products table (canonical inventory source)
      let prodQuery = supabase
        .from('products')
        .select('id, name, current_stock')
        .eq('id', productId);

      if (isValidUuid(wsId)) {
        prodQuery = prodQuery.eq('workspace_id', wsId);
      }

      const { data: prodData, error: prodErr } = await prodQuery.maybeSingle();

      if (prodErr) {
        handleSupabaseError(prodErr, 'getProductAvailableStock.products');
        throw new Error(`Failed to query inventory stock: ${prodErr.message}`);
      }

      const prodStock = prodData ? Math.max(0, Number(prodData.current_stock) || 0) : 0;

      // 2. Fetch stock_receipts sum if receipts are configured
      let batchSum = 0;
      let recQuery = supabase
        .from('stock_receipts')
        .select('quantity_remaining')
        .eq('product_id', productId);

      if (isValidUuid(wsId)) {
        recQuery = recQuery.eq('workspace_id', wsId);
      }

      const { data: receipts, error: recErr } = await recQuery;

      if (!recErr && receipts && receipts.length > 0) {
        batchSum = receipts.reduce((acc: number, row: { quantity_remaining?: number | string | null }) => acc + (Number(row.quantity_remaining) || 0), 0);
      }

      // Return maximum between products table current_stock and active stock_receipts sum
      const availableStock = receipts && receipts.length > 0 ? Math.max(prodStock, Math.max(0, batchSum)) : (prodData ? prodStock : 0);
      const pStore = store.getProducts().find((prod) => prod.id === productId);
      const finalStock = (prodData || (receipts && receipts.length > 0)) ? availableStock : Math.max(0, Number(pStore?.currentStock) || 0);

      console.log('[AUTHORITATIVE STOCK CHECK]', {
        productId,
        productName: prodData?.name || pStore?.name || 'Product',
        workspaceId: wsId,
        storedCurrentStock: prodData?.current_stock,
        batchSum: receipts && receipts.length > 0 ? batchSum : 'N/A',
        finalAvailableStock: finalStock,
      });

      return finalStock;
    } catch (e: any) {
      console.error('[getProductAvailableStock Error]', e);
      const p = store.getProducts().find((prod) => prod.id === productId);
      if (p && p.currentStock !== undefined) {
        return Math.max(0, Number(p.currentStock) || 0);
      }
      throw e;
    }
  }

  public async updateProduct(id: string, product: Partial<Product>): Promise<{ product?: Product; error?: string }> {
    if (!isSupabaseConfigured()) {
      const local = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      const idx = local.findIndex((p) => p.id === id);
      if (idx !== -1) {
        local[idx] = { ...local[idx], ...product, updatedAt: new Date().toISOString() };
        safeSaveTenantStorage(LOCAL_PRODUCTS_KEY, local);
        return { product: local[idx] };
      }
      return { error: 'Product not found in local storage' };
    }

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
      this.invalidateCache();
      return { product: fromDbProduct(data as DbProduct) };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'updateProduct');
      return { error: errStr };
    }
  }

  public async deleteProduct(id: string): Promise<{ success: boolean; error?: string }> {
    // 1. Authorize owner role
    const user = supabaseAuthService.getUser();
    if (!user || user.role !== 'owner') {
      return { success: false, error: 'Unauthorized: Product deletion is restricted to Business Owners only.' };
    }

    if (!isSupabaseConfigured()) {
      let local = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      local = local.map((p) => (p.id === id ? { ...p, active: false } : p));
      safeSaveTenantStorage(LOCAL_PRODUCTS_KEY, local);
      return { success: true };
    }

    const wsId = this.getWorkspaceId();
    try {
      // Try hard deletion first
      const { error: delErr } = await supabase
        .from('products')
        .delete()
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (delErr) {
        // Fallback to soft deletion (deactivation) if FK constraint blocks hard delete
        const { error: softErr } = await supabase
          .from('products')
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq('workspace_id', wsId)
          .eq('id', id);

        if (softErr) {
          const errStr = handleSupabaseError(softErr, 'deleteProduct');
          return { success: false, error: errStr };
        }
      }

      // Sync local tenant storage
      let local = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      local = local.filter((p) => p.id !== id);
      safeSaveTenantStorage(LOCAL_PRODUCTS_KEY, local);

      this.invalidateCache();
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
    if (!isSupabaseConfigured()) {
      const local = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, []);
      const product = local.find((p) => p.id === id);
      if (!product) return { success: false, error: 'Product not found' };

      const receipts = safeGetTenantStorage<any>('vistaar_local_stock_receipts_db', []).filter(
        (r: any) => r.product_id === id
      );

      const totalReceived = receipts.reduce((acc: number, r: any) => acc + (Number(r.quantity_received) || Number(r.quantityReceived) || 0), 0);
      const totalRemaining = receipts.reduce((acc: number, r: any) => acc + (Number(r.quantity_remaining) || Number(r.quantityRemaining) || 0), 0);

      const resultData = {
        product,
        stockReceipts: receipts || [],
        receipts: receipts || [],
        stockMovements: [],
        movements: [],
        totalReceived: totalReceived || product.currentStock || 0,
        totalSold: Math.max(0, (totalReceived || product.currentStock || 0) - totalRemaining),
        totalDamaged: 0,
        availableStock: totalRemaining !== undefined && receipts.length > 0 ? totalRemaining : product.currentStock || 0,
      };

      return {
        success: true,
        data: resultData,
      };
    }

    const wsId = this.getWorkspaceId();
    try {
      const { data: pData, error: pErr } = await supabase
        .from('products')
        .select('*, categories(name)')
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
        .eq('product_id', id)
        .order('received_date', { ascending: false });

      const { data: movements } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('workspace_id', wsId)
        .eq('product_id', id)
        .order('movement_date', { ascending: false });

      const safeReceipts = receipts || [];
      const safeMovements = movements || [];

      const totalReceived = safeReceipts.reduce((acc: number, r: { quantity_received?: number | string | null }) => acc + (Number(r.quantity_received) || 0), 0);
      const totalRemaining = safeReceipts.reduce((acc: number, r: { quantity_remaining?: number | string | null }) => acc + (Number(r.quantity_remaining) || 0), 0);

      const totalSold = safeMovements
        .filter((m: { type?: string }) => m.type === 'SALE')
        .reduce((acc: number, m: { quantity?: number | string | null }) => acc + Math.abs(Number(m.quantity) || 0), 0);

      const totalDamaged = safeMovements
        .filter((m: { type?: string }) => m.type === 'DAMAGE' || m.type === 'LOSS')
        .reduce((acc: number, m: { quantity?: number | string | null }) => acc + Math.abs(Number(m.quantity) || 0), 0);

      const availStock = safeReceipts.length > 0 ? totalRemaining : product.currentStock;

      return {
        success: true,
        data: {
          product,
          stockReceipts: safeReceipts,
          receipts: safeReceipts,
          stockMovements: safeMovements,
          movements: safeMovements,
          totalReceived: totalReceived || product.currentStock,
          totalSold,
          totalDamaged,
          availableStock: availStock,
        },
      };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getProductDetails');
      return { success: false, error: errStr };
    }
  }

  public async getCategories(): Promise<{ data: Category[]; error?: string }> {
    const wsId = this.getWorkspaceId();
    if (this.categoriesCache && this.categoriesCache.wsId === wsId && (Date.now() - this.categoriesCache.timestamp < this.CACHE_TTL_MS)) {
      return { data: this.categoriesCache.data };
    }

    if (!isSupabaseConfigured()) {
      let stored = safeGetTenantStorage<Category>('vistaar_local_categories_db', store.getCategories());
      const localProducts = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, store.getProducts());
      const catNames = new Set(stored.map((c) => c.name.toLowerCase()));
      let added = false;
      localProducts.forEach((p) => {
        const pCat = p.category?.trim();
        if (pCat && !catNames.has(pCat.toLowerCase())) {
          const newCat: Category = {
            id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: pCat,
            description: 'Auto-reconciled category from inventory products',
          };
          stored.push(newCat);
          catNames.add(pCat.toLowerCase());
          added = true;
        }
      });
      if (added) {
        safeSaveTenantStorage('vistaar_local_categories_db', stored);
      }
      return { data: stored };
    }

    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, description')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getCategories');
        const fallback = safeGetTenantStorage<Category>('vistaar_local_categories_db', []);
        return { data: fallback, error: errStr };
      }
      let categories: Category[] = (data as DbCategory[]).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description || '',
      }));

      // Data Integrity Auto-Reconciliation: Ensure any product referencing a category string has a matching Category record
      try {
        const { data: prodData } = await supabase
          .from('products')
          .select('category_id, categories(name)')
          .eq('workspace_id', wsId)
          .eq('active', true);

        if (prodData && prodData.length > 0) {
          const existingNames = new Set(categories.map((c) => c.name.trim().toLowerCase()));
          const missingNames = new Set<string>();

          prodData.forEach((p: any) => {
            const rawCat = p.categories;
            const catName = (Array.isArray(rawCat) ? rawCat[0]?.name : rawCat?.name)?.trim();
            if (catName && !existingNames.has(catName.toLowerCase())) {
              missingNames.add(catName);
            }
          });

          if (missingNames.size > 0) {
            const inserts = Array.from(missingNames).map((name) => ({
              workspace_id: wsId,
              name,
              description: 'Auto-reconciled category from inventory products',
            }));

            const { data: insertedData } = await supabase
              .from('categories')
              .insert(inserts)
              .select();

            if (insertedData) {
              insertedData.forEach((ic: any) => {
                categories.push({
                  id: ic.id,
                  name: ic.name,
                  description: ic.description || '',
                });
              });
            }
          }
        }
      } catch (reconcileErr) {
        console.warn('[Category Sync] Auto-reconciliation warning:', reconcileErr);
      }

      safeSaveTenantStorage('vistaar_local_categories_db', categories);

      this.categoriesCache = {
        data: categories,
        timestamp: Date.now(),
        wsId,
      };

      return { data: categories };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getCategories');
      const fallback = safeGetTenantStorage<Category>('vistaar_local_categories_db', []);
      return { data: fallback, error: errStr };
    }
  }

  public async getSuppliers(): Promise<{ data: Supplier[]; error?: string }> {
    if (!isSupabaseConfigured()) {
      const stored = safeGetTenantStorage<Supplier>('vistaar_local_suppliers_db', store.getSuppliers());
      return { data: stored };
    }
    const wsId = this.getWorkspaceId();
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (error) {
        const errStr = handleSupabaseError(error, 'getSuppliers');
        const fallback = safeGetTenantStorage<Supplier>('vistaar_local_suppliers_db', []);
        return { data: fallback, error: errStr };
      }
      const suppliers: Supplier[] = (data as DbSupplier[]).map((s) => ({
        id: s.id,
        name: s.name,
        contactPerson: s.contact_person || '',
        phone: s.phone || '',
        email: s.email || '',
        address: s.address || '',
      }));

      safeSaveTenantStorage('vistaar_local_suppliers_db', suppliers);

      return { data: suppliers };
    } catch (e: any) {
      const errStr = handleSupabaseError(e, 'getSuppliers');
      const fallback = safeGetTenantStorage<Supplier>('vistaar_local_suppliers_db', []);
      return { data: fallback, error: errStr };
    }
  }

  public async createCategory(category: { name: string; description?: string }): Promise<{ category?: Category; error?: string }> {
    const wsId = this.getWorkspaceId();
    if (!category.name || !category.name.trim()) {
      return { error: 'Category name is required.' };
    }

    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: category.name.trim(),
      description: category.description?.trim() || '',
    };

    if (!isSupabaseConfigured()) {
      const existing = safeGetTenantStorage<Category>('vistaar_local_categories_db', store.getCategories());
      const updated = [newCat, ...existing.filter((c) => c.id !== newCat.id)];
      safeSaveTenantStorage('vistaar_local_categories_db', updated);
      this.invalidateCache();
      return { category: newCat };
    }

    try {
      const { data, error } = await supabase
        .from('categories')
        .insert([{ workspace_id: wsId, name: category.name.trim(), description: category.description?.trim() || null }])
        .select()
        .single();

      if (error) return { error: handleSupabaseError(error, 'createCategory') };
      if (!data) return { error: 'Database failed to return inserted category.' };

      const created: Category = { id: data.id, name: data.name, description: data.description || '' };
      const existing = safeGetTenantStorage<Category>('vistaar_local_categories_db', []);
      safeSaveTenantStorage('vistaar_local_categories_db', [created, ...existing.filter((c) => c.id !== created.id)]);

      this.invalidateCache();
      return { category: created };
    } catch (e: any) {
      return { error: handleSupabaseError(e, 'createCategory') };
    }
  }

  public async updateCategory(id: string, category: { name: string; description?: string }): Promise<{ category?: Category; error?: string }> {
    const wsId = this.getWorkspaceId();
    if (!category.name || !category.name.trim()) {
      return { error: 'Category name is required.' };
    }

    if (!isSupabaseConfigured()) {
      const existing = safeGetTenantStorage<Category>('vistaar_local_categories_db', store.getCategories());
      const updatedCat: Category = { id, name: category.name.trim(), description: category.description?.trim() || '' };
      const updatedList = existing.map((c) => (c.id === id ? updatedCat : c));
      safeSaveTenantStorage('vistaar_local_categories_db', updatedList);
      this.invalidateCache();
      return { category: updatedCat };
    }

    try {
      const { data, error } = await supabase
        .from('categories')
        .update({ name: category.name.trim(), description: category.description?.trim() || null, updated_at: new Date().toISOString() })
        .eq('workspace_id', wsId)
        .eq('id', id)
        .select()
        .single();

      if (error) return { error: handleSupabaseError(error, 'updateCategory') };
      if (!data) return { error: 'Category update failed.' };

      const updated: Category = { id: data.id, name: data.name, description: data.description || '' };
      const existing = safeGetTenantStorage<Category>('vistaar_local_categories_db', []);
      safeSaveTenantStorage('vistaar_local_categories_db', existing.map((c) => (c.id === id ? updated : c)));

      this.invalidateCache();
      return { category: updated };
    } catch (e: any) {
      return { error: handleSupabaseError(e, 'updateCategory') };
    }
  }

  public async deleteCategory(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    if (!isSupabaseConfigured()) {
      const existing = safeGetTenantStorage<Category>('vistaar_local_categories_db', store.getCategories());
      safeSaveTenantStorage('vistaar_local_categories_db', existing.filter((c) => c.id !== id));
      const localProducts = safeGetTenantStorage<Product>(LOCAL_PRODUCTS_KEY, store.getProducts());
      const updatedProducts = localProducts.map((p) => {
        if (p.categoryId === id || p.category === id) {
          return { ...p, categoryId: undefined, category: '' };
        }
        return p;
      });
      safeSaveTenantStorage(LOCAL_PRODUCTS_KEY, updatedProducts);
      this.invalidateCache();
      return { success: true };
    }

    try {
      const catToDelete = this.categoriesCache?.data.find((c) => c.id === id);
      const catName = catToDelete?.name;

      // Safely unassign linked products so no orphaned category references remain
      try {
        await supabase
          .from('products')
          .update({ category_id: null })
          .eq('workspace_id', wsId)
          .eq('category_id', id);
      } catch (unassignErr) {
        console.warn('[Category Delete] Product unassign warning:', unassignErr);
      }

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) return { success: false, error: handleSupabaseError(error, 'deleteCategory') };

      const existing = safeGetTenantStorage<Category>('vistaar_local_categories_db', []);
      safeSaveTenantStorage('vistaar_local_categories_db', existing.filter((c) => c.id !== id));

      this.invalidateCache();
      return { success: true };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'deleteCategory') };
    }
  }

  public async createSupplier(supplier: Partial<Supplier>): Promise<{ supplier?: Supplier; error?: string }> {
    const wsId = this.getWorkspaceId();
    if (!supplier.name || !supplier.name.trim()) {
      return { error: 'Supplier company name is required.' };
    }

    let cleanPhone = supplier.phone?.trim() || '';
    if (cleanPhone) {
      const vRes = validateIndianPhoneNumber(cleanPhone, false);
      if (!vRes.isValid) {
        return { error: vRes.error || 'Phone number must contain exactly 10 digits.' };
      }
      cleanPhone = vRes.normalized;
    }

    const newSup: Supplier = {
      id: `sup-${Date.now()}`,
      name: supplier.name.trim(),
      contactPerson: supplier.contactPerson?.trim() || '',
      phone: cleanPhone,
      email: supplier.email?.trim() || '',
      address: supplier.address?.trim() || '',
    };

    if (!isSupabaseConfigured()) {
      const existing = safeGetTenantStorage<Supplier>('vistaar_local_suppliers_db', store.getSuppliers());
      const updated = [newSup, ...existing.filter((s) => s.id !== newSup.id)];
      safeSaveTenantStorage('vistaar_local_suppliers_db', updated);
      return { supplier: newSup };
    }

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert([{
          workspace_id: wsId,
          name: supplier.name.trim(),
          contact_person: supplier.contactPerson?.trim() || null,
          phone: cleanPhone || null,
          email: supplier.email?.trim() || null,
          address: supplier.address?.trim() || null,
        }])
        .select()
        .single();

      if (error) return { error: handleSupabaseError(error, 'createSupplier') };
      if (!data) return { error: 'Database failed to return inserted supplier record.' };

      const created: Supplier = {
        id: data.id,
        name: data.name,
        contactPerson: data.contact_person || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
      };

      const existing = safeGetTenantStorage<Supplier>('vistaar_local_suppliers_db', []);
      safeSaveTenantStorage('vistaar_local_suppliers_db', [created, ...existing.filter((s) => s.id !== created.id)]);

      return { supplier: created };
    } catch (e: any) {
      return { error: handleSupabaseError(e, 'createSupplier') };
    }
  }

  public async updateSupplier(id: string, supplier: Partial<Supplier>): Promise<{ supplier?: Supplier; error?: string }> {
    const wsId = this.getWorkspaceId();
    if (!supplier.name || !supplier.name.trim()) {
      return { error: 'Supplier company name is required.' };
    }

    let cleanPhone = supplier.phone?.trim() || '';
    if (cleanPhone) {
      const vRes = validateIndianPhoneNumber(cleanPhone, false);
      if (!vRes.isValid) {
        return { error: vRes.error || 'Phone number must contain exactly 10 digits.' };
      }
      cleanPhone = vRes.normalized;
    }

    if (!isSupabaseConfigured()) {
      const existing = safeGetTenantStorage<Supplier>('vistaar_local_suppliers_db', store.getSuppliers());
      const updatedSup: Supplier = {
        id,
        name: supplier.name.trim(),
        contactPerson: supplier.contactPerson?.trim() || '',
        phone: cleanPhone,
        email: supplier.email?.trim() || '',
        address: supplier.address?.trim() || '',
      };
      safeSaveTenantStorage('vistaar_local_suppliers_db', existing.map((s) => (s.id === id ? updatedSup : s)));
      return { supplier: updatedSup };
    }

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .update({
          name: supplier.name.trim(),
          contact_person: supplier.contactPerson?.trim() || null,
          phone: cleanPhone || null,
          email: supplier.email?.trim() || null,
          address: supplier.address?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', wsId)
        .eq('id', id)
        .select()
        .single();

      if (error) return { error: handleSupabaseError(error, 'updateSupplier') };
      if (!data) return { error: 'Supplier update failed.' };

      const updated: Supplier = {
        id: data.id,
        name: data.name,
        contactPerson: data.contact_person || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
      };

      const existing = safeGetTenantStorage<Supplier>('vistaar_local_suppliers_db', []);
      safeSaveTenantStorage('vistaar_local_suppliers_db', existing.map((s) => (s.id === id ? updated : s)));

      return { supplier: updated };
    } catch (e: any) {
      return { error: handleSupabaseError(e, 'updateSupplier') };
    }
  }

  public async deleteSupplier(id: string): Promise<{ success: boolean; error?: string }> {
    const wsId = this.getWorkspaceId();
    if (!isSupabaseConfigured()) {
      const existing = safeGetTenantStorage<Supplier>('vistaar_local_suppliers_db', store.getSuppliers());
      safeSaveTenantStorage('vistaar_local_suppliers_db', existing.filter((s) => s.id !== id));
      return { success: true };
    }

    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('workspace_id', wsId)
        .eq('id', id);

      if (error) return { success: false, error: handleSupabaseError(error, 'deleteSupplier') };

      const existing = safeGetTenantStorage<Supplier>('vistaar_local_suppliers_db', []);
      safeSaveTenantStorage('vistaar_local_suppliers_db', existing.filter((s) => s.id !== id));

      return { success: true };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'deleteSupplier') };
    }
  }
}

export const productService = new ProductService();
