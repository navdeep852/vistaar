import React, { useState, useEffect } from 'react';
import { ArrowRight, Plus, Trash2, Boxes, AlertCircle, RefreshCw } from 'lucide-react';
import { Modal } from './Modal';
import { Branch, Product } from '../types';
import { branchService } from '../services/supabase/branchService';
import { productService } from '../services/supabase/productService';
import { showToast } from './Toast';

interface StockTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentBranch?: Branch | null;
}

interface TransferLineItem {
  productId: string;
  quantity: number;
  availableStock?: number;
  notes?: string;
}

export const StockTransferModal: React.FC<StockTransferModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentBranch,
}) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceBranchId, setSourceBranchId] = useState<string>('');
  const [destBranchId, setDestBranchId] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<TransferLineItem[]>([
    { productId: '', quantity: 1 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) return;

    const init = async () => {
      try {
        const [bRes, pRes] = await Promise.all([
          branchService.getBranches({ activeOnly: true }),
          productService.getProducts(),
        ]);

        const branchList = bRes.data || [];
        setBranches(branchList);
        setProducts(pRes.data || []);

        // Default source to current branch or first branch
        const defaultSource = currentBranch?.id || (branchList[0] ? branchList[0].id : '');
        setSourceBranchId(defaultSource);

        // Default dest to another branch
        const destCandidate = branchList.find((b) => b.id !== defaultSource);
        if (destCandidate) {
          setDestBranchId(destCandidate.id);
        }
      } catch (err: any) {
        showToast('Failed to load branches: ' + err.message, 'error');
      }
    };

    init();
  }, [isOpen, currentBranch]);

  // Whenever source branch changes, refresh available stock for all products
  useEffect(() => {
    if (!sourceBranchId) return;

    const fetchStocks = async () => {
      try {
        const invRes = await branchService.getBranchInventory(sourceBranchId);
        const map: Record<string, number> = {};
        (invRes.data || []).forEach((row) => {
          map[row.productId] = row.currentStock;
        });
        setStockMap(map);
      } catch {
        setStockMap({});
      }
    };

    fetchStocks();
  }, [sourceBranchId]);

  const handleAddItem = () => {
    setItems([...items, { productId: '', quantity: 1 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      showToast('At least one item is required in a transfer.', 'error');
      return;
    }
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof TransferLineItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sourceBranchId || !destBranchId) {
      showToast('Please select both source and destination branches.', 'error');
      return;
    }

    if (sourceBranchId === destBranchId) {
      showToast('Source and destination branches cannot be the same.', 'error');
      return;
    }

    const validItems = items.filter((it) => it.productId && it.quantity > 0);
    if (validItems.length === 0) {
      showToast('Please add at least one valid product with quantity > 0.', 'error');
      return;
    }

    // Check for duplicate products
    const productIds = validItems.map((it) => it.productId);
    if (new Set(productIds).size !== productIds.length) {
      showToast('Cannot transfer the same product multiple times in one batch.', 'error');
      return;
    }

    // Validate available source stock
    for (const item of validItems) {
      const avail = stockMap[item.productId] ?? 0;
      if (item.quantity > avail) {
        const prod = products.find((p) => p.id === item.productId);
        showToast(
          `Insufficient stock for "${prod?.name || 'Product'}". Available at source: ${avail}, Requested: ${item.quantity}`,
          'error'
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await branchService.executeStockTransfer({
        sourceBranchId,
        destinationBranchId: destBranchId,
        transferDate,
        notes: notes.trim(),
        items: validItems.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          notes: it.notes,
        })),
      });

      if (res.success) {
        showToast(
          `Stock Transfer ${res.transferNumber || ''} completed successfully!`,
          'success'
        );
        onSuccess();
        onClose();
      } else {
        showToast(res.error || 'Stock transfer failed.', 'error');
      }
    } catch (err: any) {
      showToast('Stock transfer error: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sourceBranch = branches.find((b) => b.id === sourceBranchId);
  const destBranch = branches.find((b) => b.id === destBranchId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="📦 Inter-Branch Stock Transfer"
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Source & Destination Selector Card */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Source Branch (Transfer Out) <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={sourceBranchId}
                onChange={(e) => setSourceBranchId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-bold focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Origin Branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id} disabled={b.id === destBranchId}>
                    {b.branchName} ({b.branchCode}) {b.isMainBranch ? '★ HQ' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Destination Branch (Transfer In) <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={destBranchId}
                onChange={(e) => setDestBranchId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-bold focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Destination Branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id} disabled={b.id === sourceBranchId}>
                    {b.branchName} ({b.branchCode}) {b.isMainBranch ? '★ HQ' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
            <span>
              Movement: <strong className="text-slate-800 dark:text-slate-200">{sourceBranch?.branchName || 'Origin'}</strong>
            </span>
            <ArrowRight className="w-4 h-4 text-blue-500" />
            <span>
              Destination: <strong className="text-slate-800 dark:text-slate-200">{destBranch?.branchName || 'Target'}</strong>
            </span>
          </div>
        </div>

        {/* Transfer Date and Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Transfer Date
            </label>
            <input
              type="date"
              required
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Dispatch / Gate Pass Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Replenishment dispatch van #DL-04"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Transfer Items Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 uppercase">
              Products to Transfer ({items.length})
            </span>
            <button
              type="button"
              onClick={handleAddItem}
              className="text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Item</span>
            </button>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {items.map((item, idx) => {
              const currentStock = item.productId ? stockMap[item.productId] ?? 0 : null;
              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between"
                >
                  <div className="flex-1 w-full sm:w-auto">
                    <select
                      required
                      value={item.productId}
                      onChange={(e) => handleItemChange(idx, 'productId', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Product</option>
                      {products.map((p) => {
                        const avail = stockMap[p.id] ?? 0;
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.sku ? `(${p.sku})` : ''} — Avail at origin: {avail}
                          </option>
                        );
                      })}
                    </select>
                    {currentStock !== null && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                        Available at source: <strong className="text-slate-700 dark:text-slate-200">{currentStock}</strong> units
                      </span>
                    )}
                  </div>

                  <div className="w-full sm:w-28">
                    <input
                      type="number"
                      required
                      min={1}
                      max={currentStock !== null ? Math.max(1, currentStock) : undefined}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value, 10) || 1)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-center font-bold focus:ring-2 focus:ring-blue-500"
                      placeholder="Qty"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    title="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-2 shadow-md shadow-blue-600/20 cursor-pointer"
          >
            {submitting ? 'Executing Transfer...' : 'Complete Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
