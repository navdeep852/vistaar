import React from 'react';
import { X, Printer } from 'lucide-react';
import { PurchaseOrder } from '../../types';
import { PurchaseOrderPrintDocument } from './PurchaseOrderPrintDocument';

interface PurchaseOrderPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrder | null;
}

export const PurchaseOrderPrintModal: React.FC<PurchaseOrderPrintModalProps> = ({
  isOpen,
  onClose,
  purchaseOrder,
}) => {
  if (!isOpen || !purchaseOrder) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 no-print">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-400" />
              <span>Print Purchase Order — {purchaseOrder.poNumber}</span>
            </h2>
            <p className="text-xs text-slate-400">Preview A4 Purchase Order document before printing or exporting to PDF.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Document Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex justify-center">
          <div className="w-full max-w-[210mm]">
            <PurchaseOrderPrintDocument purchaseOrder={purchaseOrder} />
          </div>
        </div>
      </div>
    </div>
  );
};
