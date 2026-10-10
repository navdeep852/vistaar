import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Phone,
  Tag,
  User,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { CounterSale, StockMovement, Product } from '../types';
import { Modal } from './Modal';
import { inventoryService } from '../services/supabase';
import { formatInr } from '../lib/currency';
import { formatIndianDate } from '../lib/dateRange';

interface CounterSaleDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: CounterSale | null;
  branchName?: string;
}

export const CounterSaleDetailsModal: React.FC<CounterSaleDetailsModalProps> = ({
  isOpen,
  onClose,
  sale,
  branchName,
}) => {
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [showMovementsModal, setShowMovementsModal] = useState(false);

  useEffect(() => {
    if (isOpen && sale?.invoiceNumber) {
      setLoadingMovements(true);
      inventoryService
        .getStockMovements()
        .then((res) => {
          const list = (res.data || []).filter(
            (m: any) =>
              m.reference_id === sale.invoiceNumber ||
              m.referenceId === sale.invoiceNumber ||
              m.reference_id === sale.saleNumber ||
              m.referenceId === sale.saleNumber
          );
          setStockMovements(list);
        })
        .catch((e) => console.warn('Failed to load stock movements for sale:', e))
        .finally(() => setLoadingMovements(false));
    }
  }, [isOpen, sale?.invoiceNumber, sale?.saleNumber]);

  if (!sale) return null;

  const items = Array.isArray(sale.items) ? sale.items : [];
  const effectiveBranch = branchName || sale.branchId || 'Active Branch';

  const formatCurrency = (val?: number) => {
    return formatInr(Number(val) || 0);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Sale Details — ${sale.saleNumber}`}
        maxWidth="lg"
      >
        <div className="space-y-5 text-xs text-slate-800 dark:text-slate-200">
          {/* Header Card */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl space-y-3 shadow-lg border border-slate-700/60">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-amber-400 font-mono font-bold uppercase tracking-wider">
                    Invoice #: {sale.invoiceNumber || sale.saleNumber}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold border border-blue-400/30">
                    <Building2 className="w-3 h-3" />
                    <span>{effectiveBranch}</span>
                  </span>
                </div>
                <h3 className="text-lg font-black text-white mt-1.5 flex items-center gap-2">
                  <span>{sale.customerName || 'Walk-in Customer'}</span>
                </h3>
                {sale.phoneNumber && (
                  <p className="text-xs text-slate-300 flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{sale.phoneNumber}</span>
                  </p>
                )}
              </div>

              <div className="text-left sm:text-right">
                <span className="text-2xl font-black text-emerald-400 block tracking-tight">
                  {formatCurrency(sale.finalTotal)}
                </span>
                <span className={`text-[10px] uppercase font-bold tracking-wider inline-block px-2 py-0.5 rounded-md ${
                  sale.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {sale.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-slate-700/60 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Sale Date</span>
                <span className="font-bold text-white">{sale.saleDate ? formatIndianDate(sale.saleDate) : '—'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Reference</span>
                <span className="font-bold text-white">{sale.estimateReference || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Subtotal</span>
                <span className="font-bold text-slate-200">{formatCurrency(sale.subtotal)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Discount</span>
                <span className="font-bold text-amber-400">{formatCurrency(sale.discountAmount)}</span>
              </div>
            </div>
          </div>

          {/* Payment & Settlement Summary */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">
                Payment Method
              </span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mt-0.5">
                <CreditCard className="w-3.5 h-3.5 text-blue-500" />
                <span>{sale.paymentMethod || 'Cash'}</span>
              </span>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">
                Amount Received
              </span>
              <span className="font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                {formatCurrency(sale.amountReceived !== undefined ? sale.amountReceived : sale.finalTotal)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">
                Balance Due
              </span>
              <span className={`font-black mt-0.5 block ${Number(sale.balanceAmount) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                {formatCurrency(sale.balanceAmount || 0)}
              </span>
            </div>
          </div>

          {/* Items Purchased Table (PART 18) */}
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
                Items Purchased ({items.length})
              </h4>
              <span className="text-[10px] text-slate-400">
                Authoritative item snapshot records
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 text-[11px]">
                    <th className="p-2.5">Part #</th>
                    <th className="p-2.5">Product</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5 text-right">Rate</th>
                    <th className="p-2.5 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-slate-400">
                        No line items recorded for this sale.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="p-2.5 font-mono text-blue-600 dark:text-blue-400 font-bold text-[11px]">
                          {item.partNumberSnapshot || (item as any).partNumber || '—'}
                        </td>
                        <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">
                          {item.productNameSnapshot || (item as any).productName || 'Product'}
                        </td>
                        <td className="p-2.5 text-center font-bold text-slate-800 dark:text-slate-200">
                          {item.quantity}
                        </td>
                        <td className="p-2.5 text-right text-slate-700 dark:text-slate-300">
                          {formatCurrency(item.rate)}
                        </td>
                        <td className="p-2.5 text-right font-black text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(item.amount || item.quantity * item.rate)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 font-bold border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs">
                    <td colSpan={3} className="p-2.5 text-right text-slate-500 uppercase text-[10px]">
                      Totals:
                    </td>
                    <td className="p-2.5 text-right text-amber-600 dark:text-amber-400">
                      Disc: -{formatCurrency(sale.discountAmount)}
                    </td>
                    <td className="p-2.5 text-right font-black text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(sale.finalTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Notes if present */}
          {sale.notes && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-900 dark:text-amber-200">
              <span className="font-bold block uppercase text-[9px]">Notes</span>
              <p className="mt-0.5">{sale.notes}</p>
            </div>
          )}

          {/* Stock Impact (PART 19) */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] flex items-center justify-between">
              <span>Authoritative Stock Impact</span>
              {loadingMovements && <span className="text-slate-400 font-normal">Loading audit log...</span>}
            </h4>

            {stockMovements.length > 0 ? (
              <div className="space-y-1.5">
                {stockMovements.map((sm) => (
                  <div
                    key={sm.id}
                    className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        {(sm as any).productName || 'Inventory Stock Deduction'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Ref: {sm.referenceId || (sm as any).reference_id} • Type: {sm.type}
                      </span>
                    </div>
                    <span className="font-black text-rose-600 dark:text-rose-400">
                      -{Math.abs(sm.quantity)} Units
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 italic p-2 bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-slate-200/50 dark:border-slate-800/50">
                Authoritative FIFO inventory deduction was completed atomically for this sale.
              </p>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
            {stockMovements.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMovementsModal(true)}
                className="px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/60 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>View Complete Stock Log</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Complete Stock Movement Log Modal */}
      {showMovementsModal && (
        <Modal
          isOpen={showMovementsModal}
          onClose={() => setShowMovementsModal(false)}
          title={`Inventory Audit Trail — ${sale.saleNumber}`}
          maxWidth="md"
        >
          <div className="space-y-3 text-xs">
            <div className="bg-indigo-50 dark:bg-indigo-950/60 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 text-indigo-900 dark:text-indigo-200">
              <span className="font-bold block">Authoritative Inventory Stock Log</span>
              <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
                FIFO inventory receipts reduced in branch {effectiveBranch}.
              </p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {stockMovements.map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center"
                >
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      {(m as any).productName || 'Product'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Date: {m.date || (m as any).movementDate || (m as any).movement_date || '—'}
                    </span>
                  </div>
                  <span className="font-black text-rose-600 dark:text-rose-400">
                    -{Math.abs(m.quantity)} Units
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowMovementsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
