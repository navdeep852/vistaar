import React, { useState } from 'react';
import {
  X,
  Printer,
  Copy,
  Send,
  CheckCircle2,
  Boxes,
  Lock,
  Ban,
  Building2,
  Calendar,
  Clock,
  FileText,
  History,
} from 'lucide-react';
import { PurchaseOrder } from '../../types';
import { purchaseOrderService } from '../../services/supabase';
import { PurchaseOrderStatusBadge } from './PurchaseOrderStatusBadge';
import { showToast } from '../Toast';

interface PurchaseOrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder | null;
  onRefresh: () => void;
  onOpenPrint: (po: PurchaseOrder) => void;
  onOpenReceive: (po: PurchaseOrder) => void;
  onOpenEdit: (po: PurchaseOrder) => void;
}

export const PurchaseOrderDetailsModal: React.FC<PurchaseOrderDetailsModalProps> = ({
  isOpen,
  onClose,
  purchaseOrder,
  onRefresh,
  onOpenPrint,
  onOpenReceive,
  onOpenEdit,
}) => {
  const [activeTab, setActiveTab] = useState<'items' | 'history' | 'receipts'>('items');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !purchaseOrder) return null;

  const po = purchaseOrder;

  const handleStatusChange = async (newStatus: any, notes?: string) => {
    setLoading(true);
    try {
      const res = await purchaseOrderService.updatePoStatus(po.id!, newStatus, notes);
      if (!res.success) {
        showToast(res.error || `Failed to update status to ${newStatus}`, 'error');
        return;
      }
      showToast(`Purchase Order status updated to ${newStatus}!`, 'success');
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update status.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async () => {
    setLoading(true);
    try {
      const res = await purchaseOrderService.duplicatePurchaseOrder(po.id!);
      if (res.error || !res.data) {
        showToast(res.error || 'Failed to duplicate Purchase Order.', 'error');
        return;
      }
      showToast(`Duplicated as new Draft Purchase Order ${res.data.poNumber}!`, 'success');
      onRefresh();
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Failed to duplicate.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Status timeline steps
  const timelineSteps = [
    { label: 'Created', status: 'DRAFT', date: po.createdAt },
    { label: 'Sent', status: 'SENT', date: po.sentAt },
    { label: 'Confirmed', status: 'CONFIRMED', date: po.confirmedAt },
    { label: 'Receiving', status: 'PARTIALLY_RECEIVED', date: null },
    { label: 'Fully Received', status: 'FULLY_RECEIVED', date: null },
    { label: 'Closed', status: 'CLOSED', date: po.closedAt },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white font-mono">{po.poNumber}</h2>
                <PurchaseOrderStatusBadge status={po.status} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Supplier: <span className="font-semibold text-slate-800 dark:text-slate-200">{po.supplierName}</span> • Date: {po.poDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenPrint(po)}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Print A4 Purchase Order"
            >
              <Printer className="w-5 h-5" />
            </button>
            <button
              onClick={handleDuplicate}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Duplicate as New Draft PO"
            >
              <Copy className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Bar based on Status */}
        <div className="px-6 py-3 bg-slate-100/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {po.status === 'DRAFT' && (
              <>
                <button
                  onClick={() => onOpenEdit(po)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Edit PO
                </button>
                <button
                  disabled={loading}
                  onClick={() => handleStatusChange('SENT', 'Sent PO to supplier')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Mark as Sent</span>
                </button>
              </>
            )}

            {po.status === 'SENT' && (
              <button
                disabled={loading}
                onClick={() => handleStatusChange('CONFIRMED', 'Supplier confirmed PO')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Order</span>
              </button>
            )}

            {(po.status === 'CONFIRMED' || po.status === 'PARTIALLY_RECEIVED') && (
              <button
                disabled={loading}
                onClick={() => onOpenReceive(po)}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md shadow-emerald-600/20 cursor-pointer flex items-center gap-1.5"
              >
                <Boxes className="w-4 h-4" />
                <span>Record Goods Receipt (GRN)</span>
              </button>
            )}

            {po.status === 'FULLY_RECEIVED' && (
              <button
                disabled={loading}
                onClick={() => handleStatusChange('CLOSED', 'Purchase Order closed')}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Close Purchase Order</span>
              </button>
            )}

            {(po.status === 'DRAFT' || po.status === 'SENT' || po.status === 'CONFIRMED') && (
              <button
                disabled={loading}
                onClick={() => handleStatusChange('CANCELLED', 'Purchase Order cancelled by user')}
                className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-lg border border-rose-200 dark:border-rose-800 cursor-pointer flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Cancel Order</span>
              </button>
            )}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Grand Total: <span className="font-bold text-slate-900 dark:text-white text-sm">₹{po.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex gap-6 bg-slate-50/50 dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('items')}
            className={`py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'items'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Order Line Items ({(po.items || []).length})
          </button>
          <button
            onClick={() => setActiveTab('receipts')}
            className={`py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'receipts'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Goods Receipts (GRN)
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Status Audit Log
          </button>
        </div>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'items' && (
            <div className="space-y-4">
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      <th className="p-3">Product</th>
                      <th className="p-3 text-right">Ordered</th>
                      <th className="p-3 text-right">Received</th>
                      <th className="p-3 text-right">Pending</th>
                      <th className="p-3 text-right">Rate</th>
                      <th className="p-3 text-right">GST %</th>
                      <th className="p-3 text-right">Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {(po.items || []).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-slate-900 dark:text-white">{item.productName || item.itemName || item.description || 'Custom Item'}</p>
                            {item.supplierCatalogueItemId ? (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold rounded flex items-center gap-0.5">
                                <Lock className="w-2.5 h-2.5 text-blue-600" /> Catalogue Rate
                              </span>
                            ) : item.isCustomItem ? (
                              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[10px] font-bold rounded">
                                Custom Item
                              </span>
                            ) : null}

                            {item.isPriceOverridden && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold rounded border border-amber-300 dark:border-amber-800" title={item.overrideReason || 'Authorized rate override'}>
                                Rate Override ({item.overrideStatus || 'APPROVED'})
                              </span>
                            )}
                          </div>
                          {item.productSku && <p className="text-[10px] text-slate-500 font-mono">SKU: {item.productSku}</p>}
                          {item.overrideReason && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-400 italic mt-0.5">
                              Audit Justification: {item.overrideReason}
                            </p>
                          )}
                          {item.description && item.description !== item.productName && (
                            <p className="text-[11px] text-slate-500 italic mt-0.5">{item.description}</p>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">{item.quantity}</td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{item.receivedQuantity || 0}</td>
                        <td className="p-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">{item.pendingQuantity || 0}</td>
                        <td className="p-3 text-right font-mono font-semibold">
                          ₹{item.unitPrice.toFixed(2)}
                          {item.catalogueUnitPrice && item.catalogueUnitPrice !== item.unitPrice && (
                            <div className="text-[9px] text-slate-400 line-through font-mono">
                              ₹{item.catalogueUnitPrice.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono">{item.taxRate || 0}%</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">₹{item.lineTotal?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial breakdown */}
              <div className="flex justify-end">
                <div className="w-72 p-4 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Subtotal:</span>
                    <span>₹{po.subtotal.toFixed(2)}</span>
                  </div>
                  {po.discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Discount:</span>
                      <span>-₹{po.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>GST Tax:</span>
                    <span>₹{po.taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-300 dark:border-slate-700 pt-1.5 flex justify-between font-black text-sm text-slate-900 dark:text-white">
                    <span>GRAND TOTAL:</span>
                    <span className="text-blue-600 dark:text-blue-400">₹{po.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'receipts' && (
            <div className="space-y-3">
              {!po.receipts || po.receipts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  No Goods Receipts (GRN) posted yet. Once stock is received, receipt records will appear here.
                </div>
              ) : (
                po.receipts.map((rec) => (
                  <div key={rec.id} className="p-4 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="font-bold text-xs text-slate-900 dark:text-white font-mono">{rec.receiptNumber}</p>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                        {rec.status} • {rec.receiptDate}
                      </span>
                    </div>
                    {rec.notes && <p className="text-xs text-slate-600 dark:text-slate-400 italic">{rec.notes}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {!po.statusHistory || po.statusHistory.length === 0 ? (
                <p className="text-xs text-slate-400">No status audit history recorded.</p>
              ) : (
                po.statusHistory.map((h, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-800">
                    <History className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Status changed to <span className="text-blue-600 dark:text-blue-400">{h.newStatus}</span>
                      </p>
                      {h.notes && <p className="text-[11px] text-slate-500 mt-0.5">{h.notes}</p>}
                      {h.createdAt && <p className="text-[10px] font-mono text-slate-400 mt-1">{new Date(h.createdAt).toLocaleString()}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
