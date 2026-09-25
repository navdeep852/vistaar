import type { Product } from '../types/index.ts';

/**
 * Get display name for a product across different schema variations
 */
export const getProductDisplayName = (p: Partial<Product> | any): string => {
  if (!p) return '';
  return p.productName || p.name || 'Untitled Product';
};

/**
 * Get human-facing Part Number / Code for a product
 */
export const getProductPartNumber = (p: Partial<Product> | any): string => {
  if (!p) return '';
  return p.partNumber || p.part_number || p.productCode || p.product_code || p.sku || '';
};

/**
 * Get authoritative default selling price for a product
 */
export const getProductSellingPrice = (p: Partial<Product> | any): number => {
  if (!p) return 0;
  const price = p.sellingPrice ?? p.selling_price ?? p.currentSellPrice ?? p.current_sell_price ?? p.price;
  return typeof price === 'number' ? price : Number(price) || 0;
};

/**
 * Get authoritative tax/GST rate percentage for a product
 */
export const getProductTaxRate = (p: Partial<Product> | any): number => {
  if (!p) return 0;
  const tax = p.taxPercent ?? p.tax_percent ?? p.gstRate ?? p.gst_rate;
  return typeof tax === 'number' ? tax : (tax !== undefined && tax !== null ? Number(tax) : 18);
};

/**
 * Get current stock count for a product
 */
export const getProductStock = (p: Partial<Product> | any): number => {
  if (!p) return 0;
  const stock = p.currentStock ?? p.current_stock ?? p.stock;
  return typeof stock === 'number' ? stock : Number(stock) || 0;
};

/**
 * Rank search results according to strict priority order:
 * 1. Exact Part Number match
 * 2. Part Number starts-with match
 * 3. Part Number contains match
 * 4. Product Name match
 * 5. SKU / Product Code / Barcode match
 */
export const rankProductSearchResults = (query: string, products: Product[]): Product[] => {
  const q = query.trim().toLowerCase();
  if (!q) return products;

  const exactPartNumber: Product[] = [];
  const partNumberStartsWith: Product[] = [];
  const partNumberContains: Product[] = [];
  const nameMatch: Product[] = [];
  const otherMatch: Product[] = [];

  const seenIds = new Set<string>();

  for (const p of products) {
    const pId = p.id || `${p.name}-${p.sku}`;
    if (seenIds.has(pId)) continue;

    const partNo = (p.partNumber || (p as any).part_number || '').trim().toLowerCase();
    const prodName = (p.name || (p as any).productName || '').trim().toLowerCase();
    const sku = (p.sku || (p as any).product_code || '').trim().toLowerCase();
    const barcode = ((p as any).barcode || '').trim().toLowerCase();

    if (partNo === q) {
      exactPartNumber.push(p);
      seenIds.add(pId);
    } else if (partNo.startsWith(q)) {
      partNumberStartsWith.push(p);
      seenIds.add(pId);
    } else if (partNo.includes(q)) {
      partNumberContains.push(p);
      seenIds.add(pId);
    } else if (prodName.includes(q)) {
      nameMatch.push(p);
      seenIds.add(pId);
    } else if (sku.includes(q) || barcode.includes(q)) {
      otherMatch.push(p);
      seenIds.add(pId);
    }
  }

  return [
    ...exactPartNumber,
    ...partNumberStartsWith,
    ...partNumberContains,
    ...nameMatch,
    ...otherMatch,
  ];
};

/**
 * Determines whether a line item row is completely empty and unused.
 * Completely empty rows contain no product ID, no valid product name, no part number,
 * no description, and no selling price > 0.
 *
 * Such rows are created as UI conveniences (e.g. "+ Add More Product") and must
 * be automatically ignored/removed before calculation, validation, stock checking,
 * saving, and document conversion.
 */
export const isEmptyLineItem = (item: any): boolean => {
  if (!item) return true;

  // Has a valid database product ID
  const pId = item.productId || item.product_id;
  if (pId && typeof pId === 'string' && pId.trim() !== '' && pId !== 'null' && pId !== 'undefined') {
    return false;
  }

  // Has a user-entered product name (ignore placeholders like "Select product...")
  const rawName = (item.productName || item.product_name || item.name || '').trim();
  const hasValidName = rawName !== '' && rawName.toLowerCase() !== 'select product...' && rawName !== 'item';
  if (hasValidName) {
    return false;
  }

  // Has a user-entered part number
  const partNo = (item.partNumber || item.part_number || '').trim();
  if (partNo !== '') {
    return false;
  }

  // Has a user-entered description
  const desc = (item.description || '').trim();
  if (desc !== '') {
    return false;
  }

  // Has a non-zero selling price
  const price = Number(item.sellingPrice ?? item.selling_price ?? item.price ?? item.rate ?? 0);
  if (price > 0) {
    return false;
  }

  // If none of the above are present, it is completely empty
  return true;
};

/**
 * Filters an array of line items, removing completely empty and unused rows.
 */
export const filterValidLineItems = <T = any>(items: T[] | undefined | null): T[] => {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !isEmptyLineItem(item));
};
