import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, AlertCircle, Sparkles, Edit2 } from 'lucide-react';
import { Product } from '../types';
import { ProductAutocomplete } from './ProductAutocomplete';
import { QuantityInput } from './QuantityInput';
import { Modal } from './Modal';
import {
  getProductDisplayName,
  getProductPartNumber,
  getProductSellingPrice,
  getProductTaxRate,
  getProductStock,
} from '../lib/productHelpers';
import { showToast } from './Toast';
import { ALLOWED_TAX_RATES } from '../constants/tax';

export interface LineItemRow {
  itemType?: 'product' | 'custom';
  productId?: string;
  productName: string;
  description?: string;
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
  mode: 'invoice' | 'counterSale' | 'quotation';
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
  const isInvoice = mode === 'invoice' || mode === 'quotation';
  const isQuotation = mode === 'quotation';

  // Custom Product Modal State
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customTargetIndex, setCustomTargetIndex] = useState<number | null>(null);
  const [customForm, setCustomForm] = useState({
    name: '',
    description: '',
    partNumber: '',
    quantity: 1,
    rate: 0,
    taxPercent: 18,
    unit: 'Pcs',
  });

  // Refs for keyboard focus chaining across rows
  const partNumberInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const quantityInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const rateInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const taxInputRefs = useRef<{ [key: number]: HTMLInputElement | HTMLSelectElement | null }>({});

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
      itemType: 'product',
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

  const handleOpenCustomModal = (initialName: string = '', rowIndex?: number) => {
    setCustomTargetIndex(rowIndex !== undefined ? rowIndex : null);
    if (rowIndex !== undefined && items[rowIndex]?.itemType === 'custom') {
      const row = items[rowIndex];
      setCustomForm({
        name: row.productName,
        description: row.description || '',
        partNumber: row.partNumber || '',
        quantity: row.quantity || 1,
        rate: row.sellingPrice || 0,
        taxPercent: row.taxPercent ?? 18,
        unit: row.unit || 'Pcs',
      });
    } else {
      setCustomForm({
        name: initialName,
        description: '',
        partNumber: '',
        quantity: 1,
        rate: 0,
        taxPercent: 18,
        unit: 'Pcs',
      });
    }
    setCustomModalOpen(true);
  };

  const handleSaveCustomProduct = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customForm.name.trim()) {
      showToast('Product name is required for custom product.', 'error');
      return;
    }

    const customRow: LineItemRow = {
      itemType: 'custom',
      productId: undefined,
      productName: customForm.name.trim(),
      description: customForm.description.trim() || undefined,
      partNumber: customForm.partNumber.trim() || undefined,
      unit: customForm.unit || 'Pcs',
      quantity: Math.max(1, customForm.quantity || 1),
      sellingPrice: Math.max(0, customForm.rate || 0),
      taxPercent: isInvoice ? (customForm.taxPercent ?? 18) : 0,
      discountAmount: 0,
      availableStock: undefined,
    };

    const updated = [...items];
    if (customTargetIndex !== null && customTargetIndex < updated.length) {
      updated[customTargetIndex] = customRow;
    } else {
      // If last item is blank, replace it; otherwise append
      const lastItem = updated[updated.length - 1];
      if (lastItem && !lastItem.productId && !lastItem.productName) {
        updated[updated.length - 1] = customRow;
      } else {
        updated.push(customRow);
      }
    }

    onChange(updated);
    setCustomModalOpen(false);
    showToast(`Added custom product "${customForm.name.trim()}"`, 'success');
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      // Keep at least one blank row
      onChange([
        {
          itemType: 'product',
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
      if (!items[rowIndex].productId && items[rowIndex].itemType !== 'custom') {
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
      itemType: 'product',
      productId: product.id,
      productName: displayName,
      description: undefined,
      partNumber: partNo,
      sku: product.sku || '',
      unit: unit,
      quantity: updated[rowIndex]?.quantity > 0 ? updated[rowIndex].quantity : 1,
      sellingPrice: sellPrice,
      taxPercent: taxRate,
      availableStock: stock,
    };

    onChange(updated);

    // Auto-advance focus to Quantity input
    setTimeout(() => {
      quantityInputRefs.current[rowIndex]?.focus();
      quantityInputRefs.current[rowIndex]?.select();
    }, 50);
  };

  const handleQuantityChange = (index: number, newQty: number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      quantity: Math.max(1, newQty),
    };
    onChange(updated);
  };

  const handleRateChange = (index: number, newRate: number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      sellingPrice: Math.max(0, newRate),
    };
    onChange(updated);
  };

  const handleTaxChange = (index: number, newTax: number) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      taxPercent: Math.max(0, Math.min(100, newTax)),
    };
    onChange(updated);
  };

  const handleCustomNameChange = (index: number, newName: string) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      productName: newName,
    };
    onChange(updated);
  };

  const handleCustomDescriptionChange = (index: number, newDesc: string) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      description: newDesc,
    };
    onChange(updated);
  };

  const handlePartNumberChange = (index: number, newPartNo: string) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      partNumber: newPartNo,
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
              <th className="py-3 px-3 min-w-[200px]">Part Name</th>
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
              const isCustom = item.itemType === 'custom' || (!item.productId && !!item.productName);
              // Stock depletion check only applies to catalog products in invoice/counterSale mode, NEVER for quotations
              const isStockDepleted =
                !isQuotation &&
                !!item.productId &&
                item.availableStock !== undefined &&
                item.quantity > item.availableStock;
              const hasNoProduct = !item.productId && !item.productName;

              return (
                <tr
                  key={idx}
                  className={`transition-colors ${
                    isStockDepleted
                      ? 'bg-rose-50/50 dark:bg-rose-950/20'
                      : isCustom
                      ? 'bg-amber-50/20 dark:bg-amber-950/10 hover:bg-amber-50/40'
                      : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  {/* Column 1: Part Number */}
                  <td className="py-2.5 px-3 align-top">
                    {isCustom ? (
                      <div>
                        <input
                          type="text"
                          value={item.partNumber || ''}
                          onChange={(e) => handlePartNumberChange(idx, e.target.value)}
                          placeholder="Part # (optional)"
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800/60 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <div className="flex items-center gap-1 mt-1 text-[10px] font-extrabold text-amber-600 dark:text-amber-400">
                          <Sparkles className="w-3 h-3 shrink-0 text-amber-500" />
                          <span>Custom Item</span>
                        </div>
                      </div>
                    ) : (
                      <>
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
                          allowCustomProduct={isQuotation}
                          onAddCustomProduct={(typed) => handleOpenCustomModal(typed, idx)}
                          inputClassName={
                            hasNoProduct
                              ? 'border-slate-300 dark:border-slate-700'
                              : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/20'
                          }
                          onEnterWithoutSelection={() => {
                            if (item.productId || item.itemType === 'custom') {
                              quantityInputRefs.current[idx]?.focus();
                            }
                          }}
                        />
                        {item.productId && item.partNumber && (
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-1 block">
                            Code: {item.partNumber}
                          </span>
                        )}
                      </>
                    )}
                  </td>

                  {/* Column 2: Part Name & Live Stock Info */}
                  <td className="py-2.5 px-3 align-top">
                    {isCustom ? (
                      <div className="pt-0.5 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            value={item.productName}
                            onChange={(e) => handleCustomNameChange(idx, e.target.value)}
                            placeholder="Product Name *"
                            className="w-full px-2 py-1 bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-800/60 rounded-lg text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleOpenCustomModal(item.productName, idx)}
                            title="Edit custom item details"
                            className="p-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 rounded cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={item.description || ''}
                          onChange={(e) => handleCustomDescriptionChange(idx, e.target.value)}
                          placeholder="Optional item description..."
                          className="w-full px-2 py-0.5 bg-transparent border-b border-dashed border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 placeholder:text-slate-400"
                        />
                      </div>
                    ) : (
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
                    )}
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
                            } else {
                              handleAddItem();
                            }
                          } else if (e.key === 'Tab' && !e.shiftKey) {
                            if (isInvoice) {
                              e.preventDefault();
                              taxInputRefs.current[idx]?.focus();
                            }
                          }
                        }}
                        className="w-full pl-6 pr-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </td>

                  {/* Column 5: Tax (%) — INVOICE & QUOTATION */}
                  {isInvoice && (
                    <td className="py-2.5 px-3 align-top text-right">
                      <div className="relative inline-block w-full max-w-[85px]">
                        <select
                          ref={(el) => { taxInputRefs.current[idx] = el; }}
                          value={item.taxPercent ?? 18}
                          onChange={(e) => handleTaxChange(idx, parseInt(e.target.value, 10) || 0)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddItem();
                            }
                          }}
                          className="w-full px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        >
                          {ALLOWED_TAX_RATES.map((rate) => (
                            <option key={rate} value={rate}>
                              {rate}%
                            </option>
                          ))}
                        </select>
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
          const isCustom = item.itemType === 'custom' || (!item.productId && !!item.productName);
          const isStockDepleted =
            !isQuotation &&
            !!item.productId &&
            item.availableStock !== undefined &&
            item.quantity > item.availableStock;

          return (
            <div
              key={idx}
              className={`p-4 rounded-2xl border space-y-3 bg-white dark:bg-slate-900 ${
                isStockDepleted
                  ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/10'
                  : isCustom
                  ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/10'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Row #{idx + 1}</span>
                  {isCustom && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 text-[10px] font-extrabold">
                      <Sparkles className="w-3 h-3" />
                      <span>Custom Product</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(idx)}
                  className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"
                  title="Remove Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {isCustom ? (
                <div className="space-y-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                      Product Name *
                    </label>
                    <input
                      type="text"
                      value={item.productName}
                      onChange={(e) => handleCustomNameChange(idx, e.target.value)}
                      placeholder="Custom Product Name"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={item.description || ''}
                      onChange={(e) => handleCustomDescriptionChange(idx, e.target.value)}
                      placeholder="e.g. Model, Color, Specs"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
                      Part Number (Optional)
                    </label>
                    <input
                      type="text"
                      value={item.partNumber || ''}
                      onChange={(e) => handlePartNumberChange(idx, e.target.value)}
                      placeholder="e.g. SNY-WH-06"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              ) : (
                <>
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
                      allowCustomProduct={isQuotation}
                      onAddCustomProduct={(typed) => handleOpenCustomModal(typed, idx)}
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
                </>
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
                    <select
                      value={item.taxPercent ?? 18}
                      onChange={(e) => handleTaxChange(idx, parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right cursor-pointer"
                    >
                      {ALLOWED_TAX_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate}%
                        </option>
                      ))}
                    </select>
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

      {/* Row Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddItem}
            className="px-4 py-2 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add More Product</span>
          </button>

          {isQuotation && (
            <button
              type="button"
              onClick={() => handleOpenCustomModal()}
              className="px-4 py-2 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>+ Add Custom Product</span>
            </button>
          )}
        </div>

        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          {items.length} {items.length === 1 ? 'item' : 'items'} in table
        </span>
      </div>

      {/* CUSTOM PRODUCT MODAL (QUOTATION MODULE) */}
      <Modal
        isOpen={customModalOpen}
        onClose={() => setCustomModalOpen(false)}
        title={customTargetIndex !== null ? 'Edit Custom Quotation Product' : 'Add Custom Quotation Product'}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveCustomProduct} className="space-y-4 py-1 text-xs">
          <div className="bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300">
            <p className="font-bold flex items-center gap-1.5 text-xs">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Non-Catalog Item (Quotation Only)</span>
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
              This custom product exists only inside this quotation. It does not create inventory records or require available stock.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Product Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                autoFocus
                required
                value={customForm.name}
                onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                placeholder="e.g. Sony WH-1000XM6"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                value={customForm.description}
                onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
                placeholder="e.g. Color: Black, 1-Year International Warranty"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Part Number (Optional)
                </label>
                <input
                  type="text"
                  value={customForm.partNumber}
                  onChange={(e) => setCustomForm({ ...customForm, partNumber: e.target.value })}
                  placeholder="e.g. SNY-WH-006"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Unit
                </label>
                <input
                  type="text"
                  value={customForm.unit}
                  onChange={(e) => setCustomForm({ ...customForm, unit: e.target.value })}
                  placeholder="Pcs, Box, Set..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Quantity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={customForm.quantity || ''}
                  onChange={(e) => setCustomForm({ ...customForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-center"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Rate ({currency}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={customForm.rate || ''}
                  onChange={(e) => setCustomForm({ ...customForm, rate: Math.max(0, parseFloat(e.target.value) || 0) })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Tax Rate (%)
                </label>
                <select
                  value={customForm.taxPercent}
                  onChange={(e) => setCustomForm({ ...customForm, taxPercent: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right cursor-pointer"
                >
                  {ALLOWED_TAX_RATES.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}%
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Calculated Total Card */}
            <div className="p-3 bg-slate-100 dark:bg-slate-800/60 rounded-xl flex items-center justify-between text-xs">
              <span className="font-bold text-slate-600 dark:text-slate-400">Calculated Line Total:</span>
              <span className="font-black text-sm text-slate-900 dark:text-slate-100">
                {currency}
                {(
                  (customForm.quantity || 1) *
                  (customForm.rate || 0) *
                  (1 + (customForm.taxPercent || 0) / 100)
                ).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCustomModalOpen(false)}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md shadow-blue-600/30 cursor-pointer"
            >
              {customTargetIndex !== null ? 'Update Item' : 'Add to Quotation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ProductLineItemsTable;
