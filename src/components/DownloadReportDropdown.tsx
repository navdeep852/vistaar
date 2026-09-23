import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, Printer, FileSpreadsheet, ChevronDown, Check, Loader2 } from 'lucide-react';
import { showToast } from './Toast';

export interface DownloadReportDropdownProps {
  onExport: (format: 'pdf' | 'print' | 'excel') => Promise<void> | void;
  recordCount: number;
  reportName?: string;
  className?: string;
}

export const DownloadReportDropdown: React.FC<DownloadReportDropdownProps> = ({
  onExport,
  recordCount,
  reportName = 'Report',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastExportedFormat, setLastExportedFormat] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectFormat = async (format: 'pdf' | 'print' | 'excel') => {
    if (isExporting) return;

    if (recordCount === 0) {
      showToast(`No transactions found for the selected filters. Please adjust filters before generating ${reportName}.`, 'info');
      setIsOpen(false);
      return;
    }

    setIsExporting(true);
    setIsOpen(false);

    try {
      await onExport(format);
      setLastExportedFormat(format);
      const formatNames: Record<string, string> = {
        pdf: 'PDF file downloaded',
        print: 'Printable document prepared',
        excel: 'Excel sheet downloaded',
      };
      showToast(`${reportName}: ${formatNames[format] || 'Report ready!'}`, 'success');
    } catch (err: any) {
      console.error('[DownloadReportDropdown] Export error:', err);
      showToast(err?.message || 'Failed to generate report. Please try again.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !isExporting && setIsOpen((prev) => !prev)}
        disabled={isExporting}
        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer select-none ${
          isExporting
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700'
            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 hover:border-slate-300 dark:hover:border-slate-600 text-slate-800 dark:text-white'
        }`}
        title="Download or Print Report for active filters"
        aria-expanded={isOpen}
      >
        {isExporting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
        ) : (
          <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        )}

        <span>{isExporting ? 'Generating Report...' : 'Download Report'}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-100 overflow-hidden">
          <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Export {recordCount} Filtered {recordCount === 1 ? 'Record' : 'Records'}
          </div>

          {/* Option 1: Direct PDF File Download */}
          <button
            type="button"
            onClick={() => handleSelectFormat('pdf')}
            className="w-full text-left px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-between transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 group-hover:bg-rose-100">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold text-[11px]">Download PDF (.pdf)</div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Official A4 Vector Financial Report</div>
              </div>
            </div>
            {lastExportedFormat === 'pdf' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
          </button>

          {/* Option 2: Print / Save as PDF */}
          <button
            type="button"
            onClick={() => handleSelectFormat('print')}
            className="w-full text-left px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-between transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 group-hover:bg-blue-100">
                <Printer className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold text-[11px]">Print / Save as PDF</div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Direct A4 Printer or Browser PDF</div>
              </div>
            </div>
            {lastExportedFormat === 'print' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
          </button>

          {/* Option 3: Excel Spreadsheet */}
          <button
            type="button"
            onClick={() => handleSelectFormat('excel')}
            className="w-full text-left px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-between transition-colors group cursor-pointer border-t border-slate-100 dark:border-slate-800/80"
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-100">
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-bold text-[11px]">Export to Excel (.xlsx)</div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Raw Data & Totals for Auditing</div>
              </div>
            </div>
            {lastExportedFormat === 'excel' && <Check className="w-3.5 h-3.5 text-emerald-500" />}
          </button>
        </div>
      )}
    </div>
  );
};
