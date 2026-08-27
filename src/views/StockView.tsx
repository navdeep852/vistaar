import React, { useState, useEffect } from 'react';
import { Boxes, Plus, ArrowUpRight, ArrowDownRight, RefreshCw, AlertTriangle } from 'lucide-react';
import { store } from '../services/store';
import { productService } from '../services/supabase';
import { Product, InventoryTransaction, StockMovementReason } from '../types';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';
import { DedicatedWorkspace } from '../components/DedicatedWorkspace';

interface StockViewProps {
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
}

export const StockView: React.FC<StockViewProps> = ({ onNavigateTab, activeTab }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [reasonType, setReasonType] = useState<StockMovementReason>('Purchase');
  const [quantity, setQuantity] = useState<number>(10);
  const [notes, setNotes] = useState('');

  const settings = store.getSettings();

  useEffect(() => {
    const updateData = async () => {
      const prodRes = await productService.getProducts();
      setProducts(prodRes.data || []);
      setTransactions(store.getState().inventoryTransactions);
    };
    updateData();
    return store.subscribe(updateData);
  }, []);

  const handleAdjustStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || quantity === 0) {
      showToast('Select a product and enter a valid quantity.', 'error');
      return;
    }

    const isDeduction = reasonType === 'Sale' || reasonType === 'Damage' || reasonType === 'Purchase Return';
    const delta = isDeduction ? -Math.abs(quantity) : Math.abs(quantity);

    // Call store.adjustStock for transaction log
    store.adjustStock(selectedProductId, reasonType, delta, notes);

    // Call store.recordStockMovement for FIFO allocation
    const movementType = reasonType === 'Purchase' || reasonType === 'Opening Stock'
      ? 'STOCK_RECEIVED'
      : reasonType === 'Sale'
      ? 'SALE'
      : reasonType === 'Damage'
      ? 'DAMAGE'
      : 'ADJUSTMENT';

    store.recordStockMovement(selectedProductId, movementType, delta, notes, 'STOCK-ADJUST');

    showToast('Stock movement recorded successfully!', 'success');
    setAdjustModalOpen(false);
  };


  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Inventory Stock Transactions</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Every inventory change is tracked with timestamp and reason
          </p>
        </div>

        <button
          onClick={() => {
            if (products.length > 0 && !selectedProductId) setSelectedProductId(products[0].id);
            setAdjustModalOpen(true);
          }}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>+ Record Stock Movement</span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-3.5">Date & Time</th>
                <th className="px-6 py-3.5">Product</th>
                <th className="px-6 py-3.5">Movement Type</th>
                <th className="px-6 py-3.5">Change</th>
                <th className="px-6 py-3.5">Updated Stock</th>
                <th className="px-6 py-3.5">Reference / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                    No stock transactions recorded yet.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => {
                  const prod = products.find((p) => p.id === t.productId);
                  const isPositive = t.quantityDelta > 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        {new Date(t.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{prod ? prod.name : 'Product'}</td>
                      <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">{t.type}</td>
                      <td
                        className={`px-6 py-4 font-extrabold flex items-center gap-1 ${
                          isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        <span>
                          {isPositive ? '+' : ''}
                          {t.quantityDelta}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{t.newStock}</td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{t.referenceNo || t.notes || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADJUST STOCK WORKSPACE */}
      {adjustModalOpen && (
        <DedicatedWorkspace
          title="Record Stock Movement"
          subtitle="Adjust stock levels for purchases, sales returns, or damages"
          badgeText="INVENTORY"
          icon={Boxes}
          onClose={() => setAdjustModalOpen(false)}
          onNavigateTab={onNavigateTab}
          activeTab={activeTab || 'stock'}
        >
          <form onSubmit={handleAdjustStock} className="space-y-6 max-w-4xl mx-auto bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Product *</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {p.currentStock} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Movement Reason *
                </label>
                <select
                  value={reasonType}
                  onChange={(e) => setReasonType(e.target.value as StockMovementReason)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="Purchase">Purchase (+ Stock)</option>
                  <option value="Opening Stock">Opening Stock (+ Stock)</option>
                  <option value="Sales Return">Sales Return (+ Stock)</option>
                  <option value="Damage">Damage (- Stock)</option>
                  <option value="Adjustment">Adjustment (+/- Stock)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Quantity *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Notes / PO #</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Purchase order PO-8890"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                Confirm Adjustment
              </button>
            </div>
          </form>
        </DedicatedWorkspace>
      )}
    </div>
  );
};
