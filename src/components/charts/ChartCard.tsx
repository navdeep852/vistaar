import React, { useState, useRef } from 'react';
import { MoreHorizontal, Table, Download, X, AlertCircle } from 'lucide-react';

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  actionSlot?: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  tableData?: Array<Record<string, any>>;
  tableColumns?: Array<{ key: string; label: string; format?: (val: any) => string }>;
  children: React.ReactNode;
  className?: string;
  minHeight?: number | string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  badge,
  actionSlot,
  loading = false,
  empty = false,
  emptyMessage = 'No data in this period',
  tableData,
  tableColumns,
  children,
  className = '',
  minHeight = 320,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleExportPng = async () => {
    setShowMenu(false);
    if (!cardRef.current) return;

    try {
      // Find SVG inside the card
      const svgElem = cardRef.current.querySelector('svg');
      if (!svgElem) {
        alert('No chart graphic found to export.');
        return;
      }

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElem);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = (svgElem.clientWidth || 800) * 2;
        canvas.height = (svgElem.clientHeight || 400) * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = pngUrl;
          downloadLink.download = `${title.toLowerCase().replace(/\s+/g, '_')}_chart.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (e) {
      console.warn('Failed to export chart image:', e);
    }
  };

  return (
    <div
      ref={cardRef}
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs transition-colors relative flex flex-col justify-between ${className}`}
      style={{ minHeight }}
      aria-label={`${title} Visual`}
    >
      {/* Visual Header */}
      <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate">
              {title}
            </h3>
            {badge && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/40">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>

        {/* Top Right Actions & Context Menu */}
        <div className="flex items-center gap-1.5 shrink-0">
          {actionSlot}

          {/* Power BI "..." Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="More options"
              aria-label="More visual options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl py-1 z-50 animate-in fade-in-50 zoom-in-95 duration-100 text-xs">
                  {tableData && tableData.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setShowTableModal(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/70 font-medium"
                    >
                      <Table className="w-3.5 h-3.5 text-blue-500" />
                      <span>Show as a table</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportPng}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/70 font-medium"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Export as PNG</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Visual Body */}
      <div className="flex-1 w-full min-h-0 flex flex-col justify-center">
        {loading ? (
          <div className="w-full h-full min-h-[180px] flex flex-col items-center justify-center space-y-3">
            <div className="w-full h-32 bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse" />
            <div className="w-2/3 h-3.5 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          </div>
        ) : empty ? (
          <div className="w-full h-full min-h-[180px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs space-y-2 p-6 text-center">
            <AlertCircle className="w-7 h-7 opacity-35 text-slate-400" />
            <p className="font-medium">{emptyMessage}</p>
          </div>
        ) : (
          children
        )}
      </div>

      {/* Power BI "Show as a table" Modal */}
      {showTableModal && tableData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in-50">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {title} — Data Table
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Underlying dataset representation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-auto flex-1 p-4">
              {(() => {
                const resolvedColumns: Array<{ key: string; label: string; format?: (val: any) => string }> =
                  tableColumns ||
                  (tableData && tableData.length > 0
                    ? Object.keys(tableData[0]).map((k) => ({ key: k, label: k }))
                    : []);

                return (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase text-[10px]">
                        {resolvedColumns.map((col) => (
                          <th key={col.key} className="p-2.5">
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {tableData.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          {resolvedColumns.map((col) => (
                            <td key={col.key} className="p-2.5 text-slate-800 dark:text-slate-200 font-medium">
                              {col.format ? col.format(row[col.key]) : String(row[col.key] ?? '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
