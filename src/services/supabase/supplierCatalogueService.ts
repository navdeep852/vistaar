import * as XLSX from 'xlsx';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  SupplierCatalogueFile,
  SupplierCatalogueItem,
  SupplierCatalogueMapping,
  SupplierCataloguePriceHistory,
  ImportPreviewRow,
  Product,
} from '../../types';
import { supabaseAuthService } from '../supabaseAuth';
import { storageService } from './storageService';
import { productService } from './productService';
import { handleSupabaseError } from '../../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage } from './safeStorage';

const LOCAL_FILES_KEY = 'vistaar_local_catalogue_files';
const LOCAL_ITEMS_KEY = 'vistaar_local_catalogue_items';
const LOCAL_MAPPINGS_KEY = 'vistaar_local_catalogue_mappings';

export class SupplierCatalogueService {
  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  // ==========================================
  // 1. FILE UPLOAD & STORAGE
  // ==========================================

  public async uploadFile(
    supplierId: string,
    file: File
  ): Promise<{ data?: SupplierCatalogueFile; error?: string }> {
    const wsId = this.getWorkspaceId();
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const timeStamp = Date.now();
    const storageFileName = `${timeStamp}_${cleanFileName}`;
    const folder = `supplier-catalogues/${supplierId}`;

    if (!isSupabaseConfigured()) {
      const mockFile: SupplierCatalogueFile = {
        id: `cat-file-${timeStamp}`,
        workspaceId: wsId,
        supplierId,
        fileName: file.name,
        storagePath: `${wsId}/${folder}/${storageFileName}`,
        fileType: ext,
        fileSize: file.size,
        importStatus: 'UPLOADED',
        totalRows: 0,
        successfulRows: 0,
        failedRows: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const files = safeGetTenantStorage<SupplierCatalogueFile>(LOCAL_FILES_KEY, []);
      files.unshift(mockFile);
      safeSaveTenantStorage(LOCAL_FILES_KEY, files);
      return { data: mockFile };
    }

    try {
      // 1. Upload to Supabase Storage
      const uploadRes = await storageService.uploadFile({
        bucket: 'documents',
        workspaceId: wsId,
        folder,
        fileName: storageFileName,
        fileBody: file,
        contentType: file.type,
      });

      if (uploadRes.error || !uploadRes.path) {
        return { error: uploadRes.error || 'Failed to upload file to storage.' };
      }

      // 2. Insert record in supplier_catalogue_files
      let insertResult = await supabase
        .from('supplier_catalogue_files')
        .insert([
          {
            workspace_id: wsId,
            business_id: wsId,
            supplier_id: supplierId,
            file_name: file.name,
            storage_path: uploadRes.path,
            file_type: ext,
            file_size: file.size,
            import_status: 'UPLOADED',
            total_rows: 0,
            successful_rows: 0,
            failed_rows: 0,
            warning_rows: 0,
            uploaded_by: supabaseAuthService.getUser()?.id || null,
          },
        ])
        .select(`
          *,
          suppliers(name)
        `)
        .single();

      if (insertResult.error) {
        // Retry select without join if relationship query fails
        insertResult = await supabase
          .from('supplier_catalogue_files')
          .insert([
            {
              workspace_id: wsId,
              business_id: wsId,
              supplier_id: supplierId,
              file_name: file.name,
              storage_path: uploadRes.path,
              file_type: ext,
              file_size: file.size,
              import_status: 'UPLOADED',
              total_rows: 0,
              successful_rows: 0,
              failed_rows: 0,
              warning_rows: 0,
              uploaded_by: supabaseAuthService.getUser()?.id || null,
            },
          ])
          .select('*')
          .single();
      }

      const { data, error } = insertResult;

      if (error || !data) {
        return { error: handleSupabaseError(error, 'uploadFile - insert header') };
      }

      return {
        data: {
          id: data.id,
          workspaceId: data.workspace_id,
          supplierId: data.supplier_id,
          supplierName: data.suppliers?.name || '',
          fileName: data.file_name,
          storagePath: data.storage_path,
          fileType: data.file_type,
          fileSize: data.file_size,
          importStatus: data.import_status,
          totalRows: data.total_rows || 0,
          successfulRows: data.successful_rows || 0,
          failedRows: data.failed_rows || 0,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      };
    } catch (err: any) {
      return { error: handleSupabaseError(err, 'uploadFile') };
    }
  }

  // ==========================================
  // 2. PARSE EXCEL / CSV FILE
  // ==========================================

  public async parseFile(file: File): Promise<{
    headers: string[];
    rows: Record<string, any>[];
    error?: string;
  }> {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          if (!json || json.length === 0) {
            resolve({ headers: [], rows: [], error: 'The uploaded file contains no readable data.' });
            return;
          }

          const headers = Object.keys(json[0]);
          resolve({ headers, rows: json });
        } catch (err: any) {
          resolve({ headers: [], rows: [], error: `Failed to parse file: ${err.message}` });
        }
      };

      reader.onerror = () => {
        resolve({ headers: [], rows: [], error: 'Failed to read file from local disk.' });
      };

      reader.readAsArrayBuffer(file);
    });
  }

  // ==========================================
  // 3. COLUMN MAPPING MEMORY
  // ==========================================

  public async getSavedMapping(supplierId: string): Promise<Record<string, string> | null> {
    const wsId = this.getWorkspaceId();

    if (!isSupabaseConfigured()) {
      const mappings = safeGetTenantStorage<any>(LOCAL_MAPPINGS_KEY, []);
      const match = mappings.find((m: any) => m.supplier_id === supplierId);
      return match ? match.mapping_config : null;
    }

    try {
      const { data } = await supabase
        .from('supplier_catalogue_mappings')
        .select('mapping_config')
        .eq('workspace_id', wsId)
        .eq('supplier_id', supplierId)
        .single();

      return data ? data.mapping_config : null;
    } catch {
      return null;
    }
  }

  public async saveMapping(supplierId: string, mappingConfig: Record<string, string>): Promise<void> {
    const wsId = this.getWorkspaceId();

    if (!isSupabaseConfigured()) {
      const mappings = safeGetTenantStorage<any>(LOCAL_MAPPINGS_KEY, []);
      const idx = mappings.findIndex((m: any) => m.supplier_id === supplierId);
      if (idx !== -1) {
        mappings[idx].mapping_config = mappingConfig;
      } else {
        mappings.push({ workspace_id: wsId, supplier_id: supplierId, mapping_config: mappingConfig });
      }
      safeSaveTenantStorage(LOCAL_MAPPINGS_KEY, mappings);
      return;
    }

    try {
      await supabase.from('supplier_catalogue_mappings').upsert(
        {
          workspace_id: wsId,
          supplier_id: supplierId,
          mapping_config: mappingConfig,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'workspace_id,supplier_id' }
      );
    } catch (e) {
      console.error('Failed to save supplier column mapping:', e);
    }
  }

  // ==========================================
  // 4. PREVIEW & VALIDATION
  // ==========================================

  public async prepareImportPreview(
    supplierId: string,
    rawRows: Record<string, any>[],
    mapping: Record<string, string>
  ): Promise<{
    previewRows: ImportPreviewRow[];
    totalRows: number;
    validCount: number;
    warningCount: number;
    errorCount: number;
  }> {
    // Reverse mapping: VISTAAR Field -> Supplier File Header
    const fieldToHeader: Record<string, string> = {};
    Object.entries(mapping).forEach(([header, field]) => {
      if (field && field !== 'IGNORE') {
        fieldToHeader[field] = header;
      }
    });

    // Fetch existing catalogue items for supplier to detect duplicates/updates
    let existingItems: SupplierCatalogueItem[] = [];
    const itemsRes = await this.getCatalogueItems({ supplierId, limit: 10000 });
    existingItems = itemsRes.items || [];

    // Fetch existing VISTAAR products to check for matches
    const { data: vProducts } = await productService.getProducts();

    const previewRows: ImportPreviewRow[] = [];
    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    rawRows.forEach((row, idx) => {
      const getVal = (fieldKey: string): string => {
        const h = fieldToHeader[fieldKey];
        if (!h) return '';
        return String(row[h] ?? '').trim();
      };

      const productName = getVal('productName');
      const supplierProductCode = getVal('supplierProductCode');
      const partNumber = getVal('partNumber');
      const rateStr = getVal('purchasePrice');
      const uom = getVal('uom') || 'Pcs';
      const gstStr = getVal('gstRate');
      const hsnSac = getVal('hsnSac');
      const brand = getVal('brand');
      const category = getVal('category');
      const description = getVal('description');
      const mrpStr = getVal('mrp');
      const barcode = getVal('barcode');

      const rate = rateStr ? parseFloat(rateStr.replace(/[^0-9.]/g, '')) : undefined;
      const gstRate = gstStr ? parseFloat(gstStr.replace(/[^0-9.]/g, '')) : undefined;
      const mrp = mrpStr ? parseFloat(mrpStr.replace(/[^0-9.]/g, '')) : undefined;

      let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
      let errorMessage: string | undefined;
      let action: 'NEW' | 'UPDATE' | 'MATCH' | 'ERROR' = 'NEW';
      let matchedCatalogueItemId: string | undefined;
      let matchedProductId: string | undefined;
      let matchedProductName: string | undefined;

      // Validation 1: Required Product Name
      if (!productName) {
        status = 'ERROR';
        errorMessage = 'Missing Product Name';
        action = 'ERROR';
        errorCount++;
      } else {
        // Validation 2: Check rate
        if (rateStr && (isNaN(rate!) || rate! < 0)) {
          status = 'WARNING';
          errorMessage = 'Invalid Purchase Price format';
          warningCount++;
        }

        // Check duplicate / existing in Supplier Catalogue
        const matchByCode = supplierProductCode
          ? existingItems.find((i) => i.supplierProductCode && i.supplierProductCode.toLowerCase() === supplierProductCode.toLowerCase())
          : null;
        const matchByPart = partNumber
          ? existingItems.find((i) => i.partNumber && i.partNumber.toLowerCase() === partNumber.toLowerCase())
          : null;
        const matchByName = existingItems.find(
          (i) => i.productName.toLowerCase() === productName.toLowerCase()
        );

        const matchedItem = matchByCode || matchByPart || matchByName;
        if (matchedItem) {
          matchedCatalogueItemId = matchedItem.id;
          action = 'UPDATE';
        }

        // Check product match in VISTAAR main products
        const vMatch = (vProducts || []).find(
          (vp) =>
            (partNumber && vp.partNumber && vp.partNumber.toLowerCase() === partNumber.toLowerCase()) ||
            vp.name.toLowerCase() === productName.toLowerCase()
        );
        if (vMatch) {
          matchedProductId = vMatch.id;
          matchedProductName = vMatch.name;
          if (action !== 'UPDATE') {
            action = 'MATCH';
          }
        }

        if (status === 'VALID') {
          validCount++;
        }
      }

      previewRows.push({
        rowNumber: idx + 1,
        productName,
        supplierProductCode: supplierProductCode || undefined,
        partNumber: partNumber || undefined,
        purchasePrice: isNaN(rate!) ? undefined : rate,
        uom,
        gstRate: isNaN(gstRate!) ? undefined : gstRate,
        hsnSac: hsnSac || undefined,
        brand: brand || undefined,
        category: category || undefined,
        description: description || undefined,
        mrp: isNaN(mrp!) ? undefined : mrp,
        barcode: barcode || undefined,
        status,
        errorMessage,
        matchedCatalogueItemId,
        matchedProductId,
        matchedProductName,
        action,
        rawData: row,
      });
    });

    return {
      previewRows,
      totalRows: rawRows.length,
      validCount,
      warningCount,
      errorCount,
    };
  }

  // ==========================================
  // 5. IMPORT PERSISTENCE & PRICE HISTORY
  // ==========================================

  public async importCatalogueData(
    fileId: string,
    supplierId: string,
    validRows: ImportPreviewRow[]
  ): Promise<{
    success: boolean;
    importedCount: number;
    updatedCount: number;
    failedCount: number;
    error?: string;
  }> {
    const wsId = this.getWorkspaceId();

    if (validRows.length === 0) {
      return { success: false, importedCount: 0, updatedCount: 0, failedCount: 0, error: 'No valid rows to import.' };
    }

    if (!isSupabaseConfigured()) {
      const items = safeGetTenantStorage<SupplierCatalogueItem>(LOCAL_ITEMS_KEY, []);
      let importedCount = 0;
      let updatedCount = 0;

      validRows.forEach((r) => {
        if (r.matchedCatalogueItemId) {
          const idx = items.findIndex((i) => i.id === r.matchedCatalogueItemId);
          if (idx !== -1) {
            items[idx].purchasePrice = r.purchasePrice ?? items[idx].purchasePrice;
            items[idx].updatedAt = new Date().toISOString();
            updatedCount++;
          }
        } else {
          items.push({
            id: `cat-item-${Date.now()}-${Math.random()}`,
            workspaceId: wsId,
            supplierId,
            catalogueFileId: fileId,
            productId: r.matchedProductId || null,
            productName: r.productName,
            supplierProductCode: r.supplierProductCode || null,
            partNumber: r.partNumber || null,
            description: r.description || null,
            brand: r.brand || null,
            category: r.category || null,
            purchasePrice: r.purchasePrice || 0,
            uom: r.uom || 'Pcs',
            gstRate: r.gstRate ?? 18,
            hsnSac: r.hsnSac || null,
            mrp: r.mrp || null,
            barcode: r.barcode || null,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          importedCount++;
        }
      });

      safeSaveTenantStorage(LOCAL_ITEMS_KEY, items);

      // Update file record
      const files = safeGetTenantStorage<SupplierCatalogueFile>(LOCAL_FILES_KEY, []);
      const fIdx = files.findIndex((f) => f.id === fileId);
      if (fIdx !== -1) {
        files[fIdx].importStatus = 'IMPORTED';
        files[fIdx].totalRows = validRows.length;
        files[fIdx].successfulRows = importedCount + updatedCount;
        safeSaveTenantStorage(LOCAL_FILES_KEY, files);
      }

      return { success: true, importedCount, updatedCount, failedCount: 0 };
    }

    try {
      let importedCount = 0;
      let updatedCount = 0;
      let failedCount = 0;

      const priceHistoryEntries: any[] = [];

      for (const r of validRows) {
        if (r.matchedCatalogueItemId) {
          // Update existing item
          const { data: currentItem } = await supabase
            .from('supplier_catalogue_items')
            .select('purchase_price')
            .eq('id', r.matchedCatalogueItemId)
            .single();

          const oldPrice = currentItem ? Number(currentItem.purchase_price) : null;
          const newPrice = r.purchasePrice !== undefined ? Number(r.purchasePrice) : oldPrice;

          const { error: updateErr } = await supabase
            .from('supplier_catalogue_items')
            .update({
              catalogue_file_id: fileId,
              supplier_product_code: r.supplierProductCode || undefined,
              part_number: r.partNumber || undefined,
              description: r.description || undefined,
              brand: r.brand || undefined,
              category: r.category || undefined,
              purchase_price: newPrice,
              uom: r.uom || 'Pcs',
              gst_rate: r.gstRate ?? 18,
              hsn_sac: r.hsnSac || undefined,
              mrp: r.mrp || undefined,
              barcode: r.barcode || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', r.matchedCatalogueItemId);

          if (updateErr) {
            failedCount++;
          } else {
            updatedCount++;
            // If purchase price changed, log to price history
            if (newPrice !== null && oldPrice !== newPrice) {
              priceHistoryEntries.push({
                workspace_id: wsId,
                supplier_catalogue_item_id: r.matchedCatalogueItemId,
                supplier_id: supplierId,
                purchase_price: newPrice,
                effective_date: new Date().toISOString().split('T')[0],
                source_file_id: fileId,
              });
            }
          }
        } else {
          // Insert new catalogue item
          const { data: newItem, error: insertErr } = await supabase
            .from('supplier_catalogue_items')
            .insert([
              {
                workspace_id: wsId,
                supplier_id: supplierId,
                catalogue_file_id: fileId,
                product_id: r.matchedProductId || null,
                product_name: r.productName,
                supplier_product_code: r.supplierProductCode || null,
                part_number: r.partNumber || null,
                description: r.description || null,
                brand: r.brand || null,
                category: r.category || null,
                purchase_price: r.purchasePrice || 0,
                currency: 'INR',
                uom: r.uom || 'Pcs',
                gst_rate: r.gstRate ?? 18,
                hsn_sac: r.hsnSac || null,
                mrp: r.mrp || null,
                barcode: r.barcode || null,
                is_active: true,
              },
            ])
            .select('id, purchase_price')
            .single();

          if (insertErr || !newItem) {
            failedCount++;
          } else {
            importedCount++;
            if (newItem.purchase_price !== null) {
              priceHistoryEntries.push({
                workspace_id: wsId,
                supplier_catalogue_item_id: newItem.id,
                supplier_id: supplierId,
                purchase_price: Number(newItem.purchase_price),
                effective_date: new Date().toISOString().split('T')[0],
                source_file_id: fileId,
              });
            }
          }
        }
      }

      // Batch insert price history logs
      if (priceHistoryEntries.length > 0) {
        await supabase.from('supplier_catalogue_price_history').insert(priceHistoryEntries);
      }

      // Update file status header
      const finalStatus = failedCount > 0 ? (importedCount + updatedCount > 0 ? 'PARTIALLY_IMPORTED' : 'FAILED') : 'IMPORTED';
      await supabase
        .from('supplier_catalogue_files')
        .update({
          import_status: finalStatus,
          total_rows: validRows.length,
          successful_rows: importedCount + updatedCount,
          failed_rows: failedCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId);

      return {
        success: true,
        importedCount,
        updatedCount,
        failedCount,
      };
    } catch (err: any) {
      return { success: false, importedCount: 0, updatedCount: 0, failedCount: validRows.length, error: handleSupabaseError(err, 'importCatalogueData') };
    }
  }

  // ==========================================
  // 6. SEARCH & QUERY CATALOGUE ITEMS
  // ==========================================

  public async getCatalogueItems(params: {
    supplierId?: string;
    search?: string;
    brand?: string;
    category?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ items: SupplierCatalogueItem[]; total: number; error?: string }> {
    const wsId = this.getWorkspaceId();

    if (!isSupabaseConfigured()) {
      let items = safeGetTenantStorage<SupplierCatalogueItem>(LOCAL_ITEMS_KEY, []);

      if (params.supplierId) {
        items = items.filter((i) => i.supplierId === params.supplierId);
      }
      if (params.brand) {
        items = items.filter((i) => i.brand?.toLowerCase() === params.brand?.toLowerCase());
      }
      if (params.category) {
        items = items.filter((i) => i.category?.toLowerCase() === params.category?.toLowerCase());
      }
      if (params.search) {
        const q = params.search.toLowerCase();
        items = items.filter(
          (i) =>
            i.productName.toLowerCase().includes(q) ||
            (i.partNumber && i.partNumber.toLowerCase().includes(q)) ||
            (i.supplierProductCode && i.supplierProductCode.toLowerCase().includes(q)) ||
            (i.hsnSac && i.hsnSac.toLowerCase().includes(q)) ||
            (i.barcode && i.barcode.toLowerCase().includes(q))
        );
      }

      return { items, total: items.length };
    }

    try {
      let query = supabase
        .from('supplier_catalogue_items')
        .select(`
          *,
          suppliers(name)
        `, { count: 'exact' })
        .eq('workspace_id', wsId);

      if (params.supplierId) {
        query = query.eq('supplier_id', params.supplierId);
      }
      if (params.brand) {
        query = query.ilike('brand', params.brand);
      }
      if (params.category) {
        query = query.ilike('category', params.category);
      }
      if (params.isActive !== undefined) {
        query = query.eq('is_active', params.isActive);
      }
      if (params.search && params.search.trim()) {
        const s = `%${params.search.trim()}%`;
        query = query.or(`product_name.ilike.${s},part_number.ilike.${s},supplier_product_code.ilike.${s},hsn_sac.ilike.${s},barcode.ilike.${s}`);
      }

      const limit = params.limit || 50;
      const page = params.page || 1;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, count, error } = await query;
      if (error) {
        return { items: [], total: 0, error: handleSupabaseError(error, 'getCatalogueItems') };
      }

      const items: SupplierCatalogueItem[] = (data || []).map((d: any) => ({
        id: d.id,
        workspaceId: d.workspace_id,
        supplierId: d.supplier_id,
        supplierName: d.suppliers?.name || '',
        catalogueFileId: d.catalogue_file_id,
        productId: d.product_id,
        productName: d.product_name,
        supplierProductCode: d.supplier_product_code,
        partNumber: d.part_number,
        description: d.description,
        brand: d.brand,
        category: d.category,
        purchasePrice: d.purchase_price !== null ? Number(d.purchase_price) : null,
        currency: d.currency || 'INR',
        uom: d.uom || 'Pcs',
        gstRate: Number(d.gst_rate) || 18,
        hsnSac: d.hsn_sac,
        mrp: d.mrp !== null ? Number(d.mrp) : null,
        minimumOrderQuantity: Number(d.minimum_order_quantity) || 1,
        packSize: d.pack_size,
        barcode: d.barcode,
        leadTimeDays: d.lead_time_days,
        isActive: d.is_active,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));

      return { items, total: count || items.length };
    } catch (err: any) {
      return { items: [], total: 0, error: handleSupabaseError(err, 'getCatalogueItems') };
    }
  }

  // ==========================================
  // 7. PRICE HISTORY & LINKING
  // ==========================================

  public async getPriceHistory(catalogueItemId: string): Promise<SupplierCataloguePriceHistory[]> {
    if (!isSupabaseConfigured()) return [];

    try {
      const { data } = await supabase
        .from('supplier_catalogue_price_history')
        .select('*')
        .eq('supplier_catalogue_item_id', catalogueItemId)
        .order('created_at', { ascending: false });

      return (data || []).map((d: any) => ({
        id: d.id,
        workspaceId: d.workspace_id,
        supplierCatalogueItemId: d.supplier_catalogue_item_id,
        supplierId: d.supplier_id,
        purchasePrice: Number(d.purchase_price),
        effectiveDate: d.effective_date,
        sourceFileId: d.source_file_id,
        createdAt: d.created_at,
      }));
    } catch {
      return [];
    }
  }

  public async linkCatalogueItemToProduct(
    catalogueItemId: string,
    productId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured()) {
      return { success: true };
    }

    try {
      const { error } = await supabase
        .from('supplier_catalogue_items')
        .update({ product_id: productId, updated_at: new Date().toISOString() })
        .eq('id', catalogueItemId);

      if (error) return { success: false, error: handleSupabaseError(error, 'linkCatalogueItemToProduct') };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: handleSupabaseError(e, 'linkCatalogueItemToProduct') };
    }
  }

  public async createProductFromCatalogueItem(
    catalogueItemId: string,
    item: SupplierCatalogueItem
  ): Promise<{ success: boolean; product?: Product; error?: string }> {
    try {
      const prodRes = await productService.createProduct({
        name: item.productName,
        category: item.category || 'General',
        unit: item.uom || 'Pcs',
        buyPrice: item.purchasePrice || 0,
        sellingPrice: item.mrp || item.purchasePrice || 0,
        currentStock: 0,
        minimumStockLevel: 5,
        hsnSac: item.hsnSac || '',
        partNumber: item.partNumber || item.supplierProductCode || '',
        taxPercent: item.gstRate || 18,
      });

      if (prodRes.error || !prodRes.product) {
        return { success: false, error: prodRes.error || 'Failed to create product.' };
      }

      await this.linkCatalogueItemToProduct(catalogueItemId, prodRes.product.id);
      return { success: true, product: prodRes.product };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // ==========================================
  // 8. CATALOGUE FILES HISTORY
  // ==========================================

  public async getCatalogueFiles(supplierId?: string): Promise<SupplierCatalogueFile[]> {
    const wsId = this.getWorkspaceId();

    if (!isSupabaseConfigured()) {
      const files = safeGetTenantStorage<SupplierCatalogueFile>(LOCAL_FILES_KEY, []);
      return supplierId ? files.filter((f) => f.supplierId === supplierId) : files;
    }

    try {
      let query = supabase
        .from('supplier_catalogue_files')
        .select(`
          *,
          suppliers(name)
        `)
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });

      if (supplierId) {
        query = query.eq('supplier_id', supplierId);
      }

      const { data } = await query;
      return (data || []).map((d: any) => ({
        id: d.id,
        workspaceId: d.workspace_id,
        supplierId: d.supplier_id,
        supplierName: d.suppliers?.name || '',
        fileName: d.file_name,
        storagePath: d.storage_path,
        fileType: d.file_type,
        fileSize: d.file_size,
        importStatus: d.import_status,
        totalRows: d.total_rows || 0,
        successfulRows: d.successful_rows || 0,
        failedRows: d.failed_rows || 0,
        uploadedBy: d.uploaded_by,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));
    } catch {
      return [];
    }
  }

  public async getDownloadUrl(storagePath: string): Promise<string | null> {
    if (!storagePath || !isSupabaseConfigured()) return null;
    const res = await storageService.getSignedUrl('documents', storagePath, 3600);
    return res.signedUrl || null;
  }
}

export const supplierCatalogueService = new SupplierCatalogueService();
