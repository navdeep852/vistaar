import React, { useRef, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, AlertCircle, Package } from 'lucide-react';
import { Product } from '../types';
import { ProductAutocomplete } from './ProductAutocomplete';
import { QuantityInput } from './QuantityInput';
import {
  getProductDisplayName,
  getProductPartNumber,
  getProductSellingPrice,
  getProductTaxRate,
  getProductStock,
} from '../lib/productHelpers';
import { showToast } from './Toast';

export interface LineItemRow {
  productId?: string;
  productName: string;
  partNumber?: string;
  sku?: string;
  unit?: string;
  quantity: number;
  sellingPrice: number;
  taxPercent: number;
  discountAmount?: number;
  availableStock?: number;
}

export interface ProductLineItemsTableProps {
  mode: 'invoice' | 'counterSale';
  items: LineItemRow[];
  onChange: (items: LineItemRow[]) => void;
  currency?: string;
  fallbackProducts?: Product[];
  usesPartNumber?: boolean | null;
  onStockWarning?: (warning: string) => void;
}

export const ProductLineItemsTable: React.FC<ProductLineItemsTableProps> = ({
  mode,
  items,
  onChange,
  currency = '₹',
  fallbackProducts = [],
  usesPartNumber = false,
}) => {
  const isInvoice = mode === 'invoice';

  // Refs for keyboard focus chaining across rows
  const partNumberInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const quantityInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const rateInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const taxInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  // When a new blank row is added, auto-focus its Part Number input
  const pendingFocusIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingFocusIndexRef.current !== null) {
      const idx = pendingFocusIndexRef.current;
      pendingFocusIndexRef.current = null;
      setTimeout(() => {
        partNumberInputRefs.current[idx]?.focus();
      }, 50);
    }
  }, [items.length]);

  const handleAddItem = () => {
    const newIdx = items.length;
    pendingFocusIndexRef.current = newIdx;

    const newItem: LineItemRow = {
      productName: '',
      partNumber: '',
      sku: '',
      unit: 'Pcs',
      quantity: 1,
      sellingPrice: 0,
      taxPercent: isInvoice ? 18 : 0,
      discountAmount: 0,
      availableStock: 0,
    };

    onChange([...items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      // Keep at least one blank row
      onChange([
        {
          productName: '',
          partNumber: '',
          sku: '',
          unit: 'Pcs',
          quantity: 1,
          sellingPrice: 0,
          taxPercent: isInvoice ? 18 : 0,
          discountAmount: 0,
          availableStock: 0,
        },
      ]);
      return;
    }
    const updated = items.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleProductSelect = (rowIndex: number, product: Product) => {
    const existingIndex = items.findIndex(
      (item, idx) => idx !== rowIndex && item.productId && item.productId === product.id
    );

    const displayName = getProductDisplayName(product);
    const partNo = getProductPartNumber(product);
    const sellPrice = getProductSellingPrice(product);
    const taxRate = isInvoice ? getProductTaxRate(product) : 0;
    const stock = getProductStock(product);
    const unit = product.unit || 'Pcs';

    if (existingIndex > -1) {
      // Duplicate product detected: increment existing row's quantity
      const updated = [...items];
      const existing = updated[existingIndex];
      const newQty = (existing.quantity || 1) + (items[rowIndex]?.quantity || 1);

      updated[existingIndex] = {
        ...existing,
        quantity: newQty,
        availableStock: stock,
      };

      // Remove or reset the duplicate row if it was just created
      if (!items[rowIndex].productId) {
        updated.splice(rowIndex, 1);
      }

      onChange(updated);
      showToast(
        `"${displayName}" is already in the list. Increased quantity to ${newQty}.`,
        'info'
      );

      // Focus existing row's quantity input
      setTimeout(() => {
        quantityInputRefs.current[existingIndex]?.focus();
      }, 50);
      return;
    }

    // Populate the selected row
    const updated = [...items];
    updated[rowIndex] = {
      ...updated[rowIndex],
      productId: product.id,
      productName: displayName,
      partNumber: partNo,
      sku: product.sku || '',
      unit: unit,
      sellingPrice: sellPrice,
      taxPercent: taxRate,
      availableStock: stock,
      quantity: updated[rowIndex].quantity > 0 ? updated[rowIndex].quantity : 1,
    };

    onChange(updated);

    // Auto-focus Quantity input for high-speed billing
    setTimeout(() => {
      quantityInputRefs.current[rowIndex]?.focus();
    }, 50);
  };

  const handleQuantityChange = (rowIndex: number, qty: number) => {
    const updated = [...items];
    updated[rowIndex] = {
      ...updated[rowIndex],
      quantity: qty,
    };
    onChange(updated);
  };

  const handleRateChange = (rowIndex: number, newRate: number) => {
    const updated = [...items];
    updated[rowIndex] = {
      ...updated[rowIndex],
      sellingPrice: isNaN(newRate) || newRate < 0 ? 0 : newRate,
    };
    onChange(updated);
  };

  const handleTaxChange = (rowIndex: number, newTax: number) => {
    const updated = [...items];
    updated[rowIndex] = {
      ...updated[rowIndex],
      taxPercent: isNaN(newTax) || newTax < 0 ? 0 : newTax,
    };
    onChange(updated);
  };

  const calculateLineTotal = (item: LineItemRow): number => {
    const lineSubtotal = (item.quantity || 0) * (item.sellingPrice || 0);
    const afterDiscount = Math.max(0, lineSubtotal - (item.discountAmount || 0));
    if (isInvoice) {
      const taxAmount = (afterDiscount * (item.taxPercent || 0)) / 100;
      return afterDiscount + taxAmount;
    }
    return afterDiscount;
  };

  return (
    <div className="space-y-4">
      {/* DESKTOP TABLE VIEW (md and up) */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-3 w-[220px]">
                Part Number {usesPartNumber ? <span className="text-rose-500">*</span> : ''}
              </th>
              <th className="py-3 px-3 min-w-[180px]">Part Name</th>
              <th className="py-3 px-3 w-[120px] text-center">Quantity</th>
              <th className="py-3 px-3 w-[120px] text-right">Rate</th>
              {isInvoice && <th className="py-3 px-3 w-[90px] text-right">Tax (%)</th>}
              <th className="py-3 px-3 w-[130px] text-right">Total</th>
              <th className="py-3 px-2 w-[50px] text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
            {items.map((item, idx) => {
              const lineTotal = calculateLineTotal(item);
              const isStockDepleted =
                item.productId &&
                item.availableStock !== undefined &&
                item.quantity > item.availableStock;
              const hasNoProduct = !item.productId && !item.productName;

              return (
                <tr
                  key={idx}
                  className={`transition-colors ${
                    isStockDepleted
                      ? 'bg-rose-50/50 dark:bg-rose-950/20'
                      : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  {/* Column 1: Part Number (Product Autocomplete Search & Select) */}
                  <td className="py-2.5 px-3 align-top">
                    <ProductAutocomplete
                      ref={(el) => { partNumberInputRefs.current[idx] = el; }}
                      selectedProductId={item.productId}
                      selectedProductName={item.productName}
                      selectedPartNumber={item.partNumber}
                      onSelectProduct={(p) => handleProductSelect(idx, p)}
                      fallbackProducts={fallbackProducts}
                      currency={currency}
                      placeholder={usesPartNumber ? 'Type part number *' : 'Part # or product...'}
                      prioritizePartNumber={true}
                      inputClassName={
                        hasNoProduct
                          ? 'border-slate-300 dark:border-slate-700'
                          : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/20'
                      }
                      onEnterWithoutSelection={() => {
                        // If user pressed Enter without picking a product, advance to Quantity if item has a product
                        if (item.productId) {
                          quantityInputRefs.current[idx]?.focus();
                        }
                      }}
                    />
                    {item.productId && item.partNumber && (
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1 block">
                        Code: {item.partNumber}
                      </span>
                    )}
                  </td>

                  {/* Column 2: Part Name & Live Stock Info */}
                  <td className="py-2.5 px-3 align-top">
                    <div className="pt-1.5">
                      <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs block truncate max-w-[220px]">
                        {item.productName || (
                          <span className="text-slate-400 dark:text-slate-500 italic">Select product...</span>
                        )}
                      </span>
                      {item.productId && (
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              isStockDepleted
                                ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            Stock: {item.availableStock ?? 0} {item.unit || 'Pcs'}
                          </span>
                          {isStockDepleted && (
                            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-0.5">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>Insufficient!</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Column 3: Quantity */}
                  <td className="py-2.5 px-3 align-top text-center">
                    <div className="flex justify-center pt-0.5">
                      <QuantityInput
                        ref={(el) => { quantityInputRefs.current[idx] = el; }}
                        size="sm"
                        min={1}
                        value={item.quantity}
                        onChange={(val) => handleQuantityChange(idx, val)}
                        selectOnFocus={true}
                        ariaLabel={`Quantity for row ${idx + 1}`}
                        onEnter={() => {
                          rateInputRefs.current[idx]?.focus();
                          rateInputRefs.current[idx]?.select();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !e.shiftKey) {
                            e.preventDefault();
                            rateInputRefs.current[idx]?.focus();
                            rateInputRefs.current[idx]?.select();
                          }
                        }}
                      />
                    </div>
                  </td>

                  {/* Column 4: Rate */}
                  <td className="py-2.5 px-3 align-top text-right">
                    <div className="relative inline-block w-full max-w-[110px]">
                      <span className="absolute left-2.5 top-2 text-[11px] font-bold text-slate-400 pointer-events-none">
                        {currency}
                      </span>
                      <input
                        ref={(el) => { rateInputRefs.current[idx] = el; }}
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.sellingPrice || ''}
                        onChange={(e) => handleRateChange(idx, parseFloat(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (isInvoice) {
                              taxInputRefs.current[idx]?.focus();
                              taxInputRefs.current[idx]?.select();
                            } else {
                              handleAddItem();
                            }
                          } else if (e.key === 'Tab' && !e.shiftKey) {
                            if (isInvoice) {
                              e.preventDefault();
                              taxInputRefs.current[idx]?.focus();
                              taxInputRefs.current[idx]?.select();
                            }
                          }
                        }}
                        className="w-full pl-6 pr-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </td>

                  {/* Column 5: Tax (%) — INVOICE ONLY */}
                  {isInvoice && (
                    <td className="py-2.5 px-3 align-top text-right">
                      <div className="relative inline-block w-full max-w-[80px]">
                        <input
                          ref={(el) => { taxInputRefs.current[idx] = el; }}
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={item.taxPercent ?? 18}
                          onChange={(e) => handleTaxChange(idx, parseFloat(e.target.value) || 0)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddItem();
                            }
                          }}
                          className="w-full pr-5 pl-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="18"
                        />
                        <span className="absolute right-2 top-2 text-[11px] font-bold text-slate-400 pointer-events-none">
                          %
                        </span>
                      </div>
                    </td>
                  )}

                  {/* Column 6: Line Total */}
                  <td className="py-2.5 px-3 align-top text-right whitespace-nowrap">
                    <div className="pt-2 font-black text-slate-900 dark:text-slate-100 text-xs">
                      {currency}{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </td>

                  {/* Column 7: Remove Button */}
                  <td className="py-2.5 px-2 align-top text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1.5 mt-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                      title="Remove row"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE RESPONSIVE CARD VIEW (below md) */}
      <div className="block md:hidden space-y-3">
        {items.map((item, idx) => {
          const lineTotal = calculateLineTotal(item);
          const isStockDepleted =
            item.productId &&
            item.availableStock !== undefined &&
            item.quantity > item.availableStock;

          return (
            <div
              key={idx}
              className={`p-4 rounded-2xl border space-y-3 bg-white dark:bg-slate-900 ${
                isStockDepleted
                  ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/10'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-500">Row #{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(idx)}
                  className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                  title="Remove Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                  Part Number / Product {usesPartNumber ? <span className="text-rose-500">*</span> : ''}
                </label>
                <ProductAutocomplete
                  selectedProductId={item.productId}
                  selectedProductName={item.productName}
                  selectedPartNumber={item.partNumber}
                  onSelectProduct={(p) => handleProductSelect(idx, p)}
                  fallbackProducts={fallbackProducts}
                  currency={currency}
                  placeholder={usesPartNumber ? 'Type part number *' : 'Part # or product...'}
                  prioritizePartNumber={true}
                />
              </div>

              {item.productId && (
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate mr-2">
                    {item.productName}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                      isStockDepleted
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Stock: {item.availableStock ?? 0} {item.unit || 'Pcs'}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                    Quantity
                  </label>
                  <QuantityInput
                    size="sm"
                    min={1}
                    value={item.quantity}
                    onChange={(val) => handleQuantityChange(idx, val)}
                    selectOnFocus={true}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                    Rate ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={item.sellingPrice || ''}
                    onChange={(e) => handleRateChange(idx, parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {isInvoice && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                      Tax (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={item.taxPercent ?? 18}
                      onChange={(e) => handleTaxChange(idx, parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right"
                      placeholder="18"
                    />
                  </div>

                  <div className="text-right flex flex-col justify-end">
                    <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                      Line Total
                    </span>
                    <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                      {currency}{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              {!isInvoice && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-500">Line Total:</span>
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {currency}{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* + Add More Row Button */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={handleAddItem}
          className="px-4 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>+ Add More Product</span>
        </button>

        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          {items.length} {items.length === 1 ? 'item' : 'items'} in table
        </span>
      </div>
    </div>
  );
};

export default ProductLineItemsTable;
