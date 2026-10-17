import React, { useState } from 'react';
import { CheckCircle2, Download, Printer, Eye, ArrowRight, ArrowLeftRight, Loader2, FileText } from 'lucide-react';
import { Modal } from '../Modal';
import { StockTransfer, Branch } from '../../types';
import { saveStockTransferPdf, printStockTransferNote } from '../../services/stockTransferDocumentService';
import { store } from '../../services/store';

export interface StockTransferSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: StockTransfer | null;
  sourceBranch?: Branch | null;
  destBranch?: Branch | null;
  onViewNote: (transfer: StockTransfer) => void;
  onViewHistory: () => void;
}

export const StockTransferSuccessModal: React.FC<StockTransferSuccessModalProps> = ({
  isOpen,
  onClose,
  transfer,
  sourceBranch,
  destBranch,
  onViewNote,
  onViewHistory,
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const settings = store.getSettings();

  if (!transfer) return null;

  const totalQty = transfer.totalQuantity ?? (transfer.items || []).reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const itemsCount = transfer.totalLineItems ?? (transfer.items || []).length;

  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      await saveStockTransferPdf({
        transfer,
        sourceBranch,
        destBranch,
        settings,
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    printStockTransferNote({
      transfer,
      sourceBranch,
      destBranch,
      settings,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock Transfer Successful"
      subtitle="Physical inventory successfully transferred and synchronized"
      maxWidth="md"
    >
      <div className="space-y-5 text-center">
        {/* SUCCESS ICON & BADGE */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm animate-bounce">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
              Stock Transfer Note Generated
            </h3>
            <div className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 font-mono font-bold text-xs text-blue-700 dark:text-blue-300">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span>#{transfer.transferNumber}</span>
            </div>
          </div>
        </div>

        {/* TRANSFER SUMMARY CARD */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-left space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex-1">
              <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">From Branch</span>
              <strong className="text-slate-900 dark:text-slate-100 text-xs">
                {transfer.sourceBranchName || sourceBranch?.branchName || 'Origin'}
              </strong>
            </div>

            <div className="px-3 text-blue-500">
              <ArrowRight className="w-4 h-4" />
            </div>

            <div className="flex-1 text-right">
              <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">To Branch</span>
              <strong className="text-slate-900 dark:text-slate-100 text-xs">
                {transfer.destinationBranchName || destBranch?.branchName || 'Destination'}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-200 dark:border-slate-700 text-center text-xs">
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Products</span>
              <strong className="text-slate-900 dark:text-slate-100">{itemsCount} Items</strong>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Total Units</span>
              <strong className="text-emerald-600 dark:text-emerald-400">{totalQty.toLocaleString()} Units</strong>
            </div>
            <div>
              <span className="block text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Date</span>
              <strong className="text-slate-900 dark:text-slate-100">{transfer.transferDate}</strong>
            </div>
          </div>
        </div>

        {/* PRIMARY ACTIONS: VIEW, DOWNLOAD, PRINT */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewNote(transfer);
            }}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Eye className="w-4 h-4 text-blue-500" />
            <span>View Note</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer ${
              isGeneratingPdf
                ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20 active:scale-95'
            }`}
          >
            {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{isGeneratingPdf ? 'Generating...' : 'Download PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white font-bold text-xs shadow-sm transition-colors cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
        </div>

        {/* SECONDARY / HISTORY ACTION */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewHistory();
            }}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Go to Transfer History</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};
