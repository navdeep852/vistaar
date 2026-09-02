import React from 'react';
import { Printer, X, ShieldCheck } from 'lucide-react';
import { EwayBill } from '../../types';
import { EwayBillPrintDocument } from './EwayBillPrintDocument';
import { printEwayBill } from '../../services/printService';

interface EwayBillPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  ewayBill: EwayBill | null;
}

export const EwayBillPrintModal: React.FC<EwayBillPrintModalProps> = ({
  isOpen,
  onClose,
  ewayBill,
}) => {
  if (!isOpen || !ewayBill) return null;

  const handlePrint = () => {
    printEwayBill(ewayBill);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/80 backdrop-blur-xs overflow-y-auto print:hidden">
      <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-[300mm] max-h-[94vh] flex flex-col overflow-hidden">
        {/* Modal Controls Bar */}
        <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-950 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                GST E-Way Bill Official Document
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A4 Landscape Print & PDF Preview • EWB #{ewayBill.ewayBillNumber || 'DRAFT'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-600/20 transition-all hover:scale-[1.02]"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body — Screen Preview Area styled like an A4 Landscape Sheet */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-400/20 dark:bg-slate-950/50 flex justify-center">
          <div className="w-full max-w-[281mm]">
            <EwayBillPrintDocument ewayBill={ewayBill} isPrintMode={false} />
          </div>
        </div>
      </div>
    </div>
  );
};
