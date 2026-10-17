import React, { useState } from 'react';
import { Download, Printer, X, Loader2, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { Modal } from '../Modal';
import { StockTransfer, Branch } from '../../types';
import { StockTransferPrintDocument } from './StockTransferPrintDocument';
import { saveStockTransferPdf, printStockTransferNote } from '../../services/stockTransferDocumentService';
import { store } from '../../services/store';

export interface StockTransferPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: StockTransfer | null;
  sourceBranch?: Branch | null;
  destBranch?: Branch | null;
}

export const StockTransferPreviewModal: React.FC<StockTransferPreviewModalProps> = ({
  isOpen,
  onClose,
  transfer,
  sourceBranch,
  destBranch,
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const settings = store.getSettings();

  if (!transfer) return null;

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
      title={`Stock Transfer Note — ${transfer.transferNumber}`}
      subtitle={`From: ${transfer.sourceBranchName || 'Source'} → To: ${transfer.destinationBranchName || 'Destination'} • Date: ${transfer.transferDate}`}
      maxWidth="4xl"
    >
      <div className="space-y-4">
        {/* ACTION TOOLBAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-900/60">
              #{transfer.transferNumber}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 hidden sm:inline">
              Official A4 Transfer Document
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                isGeneratingPdf
                  ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95'
              }`}
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
          </div>
        </div>

        {/* DOCUMENT VIEWER CONTAINER */}
        <div className="bg-slate-200/70 dark:bg-slate-950/80 p-4 sm:p-6 rounded-2xl border border-slate-300 dark:border-slate-800 max-h-[72vh] overflow-y-auto">
          <StockTransferPrintDocument
            transfer={transfer}
            sourceBranch={sourceBranch}
            destBranch={destBranch}
            settings={settings}
            isPrintMode={false}
          />
        </div>
      </div>
    </Modal>
  );
};
