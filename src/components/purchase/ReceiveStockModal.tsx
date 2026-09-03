import React, { useState, useEffect } from 'react';
import { X, Boxes, CheckCircle2, AlertCircle } from 'lucide-react';
import { PurchaseOrder } from '../../types';
import { purchaseOrderReceiptService } from '../../services/supabase';
import { showToast } from '../Toast';

interface ReceiveStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder | null;
  onSuccess: () => void;
}

export const ReceiveStockModal: React.FC<ReceiveStockModalProps> = ({
  isOpen,
  onClose,
  purchaseOrder,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !purchaseOrder) return;
    setReceiptDate(new Date().toISOString().split('T')[0]);
    setNotes('');
    setErrorMsg(null);

    // Default receiveQtys to pending quantities for each item
    const initialQtys: Record<string, number> = {};
    (purchaseOrder.items || []).forEach((item) => {
      const pending = Math.max(0, item.quantity - (item.receivedQuantity || 0));
      initialQtys[item.id || item.productId] = pending;
    });
    setReceiveQtys(initialQtys);
  }, [isOpen, purchaseOrder]);

  if (!isOpen || !purchaseOrder) return null;

  const handleQtyChange = (itemId: string, pendingQty: number, val: number) => {
    setErrorMsg(null);
    if (val > pendingQty) {
      setErrorMsg(`Cannot receive more than the remaining ${pendingQty} units.`);
    }
    setReceiveQtys((prev) => ({ ...prev, [itemId]: val }));
  };

  const handlePostReceipt = async () => {
    setErrorMsg(null);
    const poItems = purchaseOrder.items || [];

    const payloadItems = poItems
      .map((item) => {
        const key = item.id || item.productId;
        const qtyToReceive = receiveQtys[key] || 0;
        const pending = Math.max(0, item.quantity - (item.receivedQuantity || 0));
        return {
          purchaseOrderItemId: item.id!,
          productId: item.productId,
          receiveQuantity: qtyToReceive,
          pending,
        };
      })
      .filter((it) => it.receiveQuantity > 0);

    if (payloadItems.length === 0) {
      setErrorMsg('Please enter a quantity greater than 0 for at least one item.');
      return;
    }

    for (const it of payloadItems) {
      if (it.receiveQuantity > it.pending) {
        setErrorMsg(`Cannot receive ${it.receiveQuantity} units. Remaining allowed quantity is ${it.pending} units.`);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await purchaseOrderReceiptService.postGoodsReceipt({
        purchaseOrderId: purchaseOrder.id!,
        receiptDate,
        notes,
        items: payloadItems,
      });

      if (!res.success || res.error) {
        setErrorMsg(res.error || 'Failed to post Goods Receipt.');
        showToast(res.error || 'Failed to post Goods Receipt.', 'error');
        return;
      }

      showToast(`Stock Receipt ${res.receipt?.receiptNumber || ''} posted successfully! Inventory updated.`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'An unexpected error occurred.');
      showToast(err?.message || 'Failed to post Goods Receipt.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-emerald-500" />
              <span>Record Goods Receipt (GRN) — {purchaseOrder.poNumber}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Supplier: <span className="font-bold text-slate-700 dark:text-slate-200">{purchaseOrder.supplierName}</span></p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Receipt Date</label>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">GRN / Delivery Note Remarks</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Challan No, batch info, inspector name..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Items Receive Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  <th className="p-3">Product</th>
                  <th className="p-3 text-right">Ordered</th>
                  <th className="p-3 text-right">Received</th>
                  <th className="p-3 text-right">Pending</th>
                  <th className="p-3 text-right w-32">Receive Now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {(purchaseOrder.items || []).map((item) => {
                  const key = item.id || item.productId;
                  const prevRec = item.receivedQuantity || 0;
                  const pending = Math.max(0, item.quantity - prevRec);
                  const currentVal = receiveQtys[key] ?? pending;

                  return (
                    <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{item.productName}</td>
                      <td className="p-3 text-right font-mono font-semibold text-slate-600 dark:text-slate-400">
                        {item.quantity} {item.unit || 'Pcs'}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {prevRec} {item.unit || 'Pcs'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {pending} {item.unit || 'Pcs'}
                      </td>
                      <td className="p-3 text-right">
                        <input
                          type="number"
                          min="0"
                          max={pending}
                          step="any"
                          disabled={pending === 0}
                          value={currentVal}
                          onChange={(e) => handleQtyChange(key, pending, parseFloat(e.target.value) || 0)}
                          className="w-full text-right px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handlePostReceipt}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Post Goods Receipt & Update Stock</span>
          </button>
        </div>
      </div>
    </div>
  );
};
