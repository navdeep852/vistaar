import React, { useState, useEffect } from 'react';
import { X, Package, Plus, AlertCircle } from 'lucide-react';
import { Product } from '../../types';
import { productService } from '../../services/supabase';
import { showToast } from '../Toast';

interface QuickAddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  onSuccess: (newProduct: Product) => void;
}

export const QuickAddProductModal: React.FC<QuickAddProductModalProps> = ({
  isOpen,
  onClose,
  initialName = '',
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [unit, setUnit] = useState('Piece');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [category, setCategory] = useState('General');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setPartNumber('');
      setUnit('Piece');
      setBuyPrice('');
      setSellingPrice('');
      setGstRate('18');
      setCategory('General');
      setErrorMsg(null);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Product name is required.');
      return;
    }

    const parsedBuyPrice = parseFloat(buyPrice);
    if (isNaN(parsedBuyPrice) || parsedBuyPrice < 0) {
      setErrorMsg('Please enter a valid Cost / Buy Price.');
      return;
    }

    const parsedSellPrice = sellingPrice ? parseFloat(sellingPrice) : parsedBuyPrice;
    const parsedGstRate = parseFloat(gstRate) || 18;

    setLoading(true);
    try {
      const res = await productService.createProduct({
        name: trimmedName,
        productName: trimmedName,
        partNumber: partNumber.trim() || undefined,
        productCode: partNumber.trim() || undefined,
        sku: partNumber.trim() || `SKU-${Date.now().toString().slice(-6)}`,
        category: category,
        unit: unit,
        buyPrice: parsedBuyPrice,
        sellingPrice: parsedSellPrice,
        currentStock: 0, // Freshly created product starts with 0 stock in catalogue
        minimumStock: 5,
        gstRate: parsedGstRate,
        taxPercent: parsedGstRate,
      } as any);

      if (res.error || !res.product) {
        setErrorMsg(res.error || 'Failed to create product.');
        showToast(res.error || 'Failed to create product.', 'error');
        return;
      }

      showToast(`Product "${res.product.name}" created and added to PO!`, 'success');
      onSuccess(res.product);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'An error occurred while creating product.');
      showToast(err?.message || 'Failed to create product.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Quick Add New Product</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Create item in catalogue and attach to PO.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Product Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Industrial Bearing 6205"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Part No / SKU</label>
              <input
                type="text"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="Optional SKU"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Unit of Measure</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="Piece">Piece / Pcs</option>
                <option value="Box">Box</option>
                <option value="Pack">Pack</option>
                <option value="Kg">Kg</option>
                <option value="Meter">Meter</option>
                <option value="Set">Set</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Cost Price (₹) *</label>
              <input
                type="number"
                step="any"
                required
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Sell Price (₹)</label>
              <input
                type="number"
                step="any"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">GST Rate (%)</label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{loading ? 'Creating...' : 'Create & Select'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
