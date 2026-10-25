import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Calendar,
  Search,
  Filter,
  Download,
  Printer,
  Boxes,
  FileSpreadsheet,
  AlertCircle,
  Tag,
  Building2,
  Clock,
  ArrowDownLeft,
  CheckCircle2,
  ChevronDown,
  X,
} from 'lucide-react';
import { Modal } from './Modal';
import { Product } from '../types';
import { inventoryService, ProductStockReceiptEvent } from '../services/supabase/inventoryService';
import { HeaderScrollableTable } from './HeaderScrollableTable';
import { formatInr } from '../lib/currency';
import { formatIndianDate, normalizeToYyyyMmDd } from '../lib/dateRange';
import * as XLSX from 'xlsx';

interface ProductStockReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  branchId?: string;
  branchName?: string;
}

export const ProductStockReceiptModal: React.FC<ProductStockReceiptModalProps> = ({
  isOpen,
  onClose,
  product,
  branchId,
  branchName,
}) => {
  const [receipts, setReceipts] = useState<ProductStockReceiptEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (isOpen && product?.id) {
      setLoading(true);
      inventoryService
        .getProductStockReceiptHistory(product.id, branchId)
        .then((res) => {
          setReceipts(res.data || []);
        })
        .catch((e) => {
          console.warn('Failed to load stock receipt history:', e);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, product?.id, branchId]);

  if (!product) return null;

  const unit = product.unit || 'Pcs';
  const currentStock = product.currentStock ?? 0;

  // Filter receipts based on search, event type, and date range
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      // 1. Text Search across receiptNumber, PO, supplier, notes
      const q = search.trim().toLowerCase();
      if (q) {
        const num = (r.receiptNumber || '').toLowerCase();
        const po = (r.purchaseOrderNumber || '').toLowerCase();
        const sup = (r.supplierName || '').toLowerCase();
        const notes = (r.notes || '').toLowerCase();
        if (!num.includes(q) && !po.includes(q) && !sup.includes(q) && !notes.includes(q)) {
          return false;
        }
      }

      // 2. Type Filter
      if (typeFilter !== 'ALL' && r.eventType !== typeFilter) {
        return false;
      }

      // 3. Date Range Filter
      const d = normalizeToYyyyMmDd(r.receivedDate);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;

      return true;
    });
  }, [receipts, search, typeFilter, startDate, endDate]);

  // Aggregate Metrics from unfiltered receipts for full reconciliation context
  const totalUnitsReceived = receipts.reduce((sum, r) => sum + (Number(r.quantityReceived) || 0), 0);
  const totalUnitsRemaining = receipts.reduce((sum, r) => sum + (Number(r.quantityRemaining) || 0), 0);
  const totalPurchaseValue = receipts.reduce((sum, r) => sum + (Number(r.totalCost) || ((Number(r.unitCost) || 0) * (Number(r.quantityReceived) || 0))), 0);
  const totalBatches = receipts.length;

  const getEventTypeBadge = (type: ProductStockReceiptEvent['eventType']) => {
    switch (type) {
      case 'PURCHASE_RECEIPT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            Supplier GRN
          </span>
        );
      case 'INITIAL_STOCK':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Opening Stock
          </span>
        );
      case 'CUSTOMER_RETURN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            Customer Return
          </span>
        );
      case 'TRANSFER_IN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
            Branch Inflow
          </span>
        );
      case 'MANUAL_INWARD':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            Manual Adjustment
          </span>
        );
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Receipt / Ref Number',
      'Event Type',
      'Product Name',
      'Part Number',
      'Supplier Name',
      'PO / Reference',
      'Quantity Received',
      'Unit',
      'Unit Purchase Cost (INR)',
      'Total Value (INR)',
      'Remaining Quantity',
      'Status',
      'Notes',
    ];

    const rows = filteredReceipts.map((r) => [
      r.receivedDate,
      r.receiptNumber,
      r.eventType,
      product.name || product.productName,
      product.partNumber || product.productCode || '',
      r.supplierName || '—',
      r.purchaseOrderNumber || '—',
      r.quantityReceived,
      unit,
      r.unitCost !== undefined ? r.unitCost : '',
      r.totalCost !== undefined ? r.totalCost : '',
      r.quantityRemaining !== undefined ? r.quantityRemaining : '',
      r.status || 'Active',
      r.notes || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Receipt History');
    const safeCode = (product.partNumber || product.productCode || 'PRODUCT').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Stock_Receipts_${safeCode}_${new Date().toISOString().split('T')[0]}.csv`, { bookType: 'csv' });
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Stock Receipt History — ${product.name || product.productName}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0f172a; }
            h2 { margin: 0 0 4px 0; font-size: 20px; }
            p { margin: 0 0 16px 0; font-size: 12px; color: #64748b; }
            .meta { margin-bottom: 20px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 10px; }
            .text-right { text-align: right; }
            .font-mono { font-family: monospace; }
          </style>
        </head>
        <body>
          <h2>VISTAAR Business OS — Stock Receipt Audit Report</h2>
          <p>Generated on ${new Date().toLocaleString('en-IN')}</p>
          <div class="meta">
            <strong>Product:</strong> ${product.name || product.productName} | 
            <strong>Part #:</strong> ${product.partNumber || product.productCode || '—'} | 
            <strong>Current In-Stock:</strong> ${currentStock} ${unit} | 
            <strong>Total Received:</strong> ${totalUnitsReceived} ${unit}
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Receipt #</th>
                <th>Type</th>
                <th>Supplier</th>
                <th>PO / Ref</th>
                <th class="text-right">Qty Received</th>
                <th class="text-right">Unit Cost</th>
                <th class="text-right">Total Value</th>
                <th class="text-right">Remaining</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${filteredReceipts
                .map(
                  (r) => `
                <tr>
                  <td>${r.receivedDate}</td>
                  <td class="font-mono">${r.receiptNumber}</td>
                  <td>${r.eventType}</td>
                  <td>${r.supplierName || '—'}</td>
                  <td>${r.purchaseOrderNumber || '—'}</td>
                  <td class="text-right"><strong>${r.quantityReceived}</strong> ${unit}</td>
                  <td class="text-right">${r.unitCost !== undefined ? formatInr(r.unitCost) : '—'}</td>
                  <td class="text-right">${r.totalCost !== undefined ? formatInr(r.totalCost) : '—'}</td>
                  <td class="text-right">${r.quantityRemaining !== undefined ? `${r.quantityRemaining} ${unit}` : '—'}</td>
                  <td>${r.notes || '—'}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stock Receipt History & Batch Audit"
      maxWidth="5xl"
    >
      <div className="space-y-4 text-xs text-slate-800 dark:text-slate-200">
        {/* 1. PRODUCT AUDIT HEADER CARD */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-5 rounded-2xl shadow-md border border-slate-700/60">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-amber-400 font-mono font-bold uppercase tracking-wider">
                  Part #: {product.partNumber || product.productCode || product.sku || 'N/A'}
                </span>
                {product.hsnSac && (
                  <span className="text-[10px] text-slate-300 font-mono">
                    HSN: {product.hsnSac}
                  </span>
                )}
                {product.category && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-700/60 text-slate-200 border border-slate-600">
                    {product.category}
                  </span>
                )}
                {branchName && (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30 font-bold">
                    <Building2 className="w-3 h-3" />
                    <span>{branchName}</span>
                  </span>
                )}
              </div>
              <h3 className="text-lg font-black text-white mt-1">
                {product.name || product.productName}
              </h3>
              {product.brand && (
                <span className="text-[11px] text-slate-300 font-medium block">
                  Brand: {product.brand}
                </span>
              )}
            </div>

            <div className="text-left sm:text-right bg-white/10 dark:bg-black/20 p-3 rounded-xl border border-white/10">
              <span className="text-[10px] text-slate-300 block uppercase font-bold tracking-wider">
                Current Authoritative Stock
              </span>
              <span className="text-2xl font-black text-emerald-400 font-mono">
                {currentStock} {unit}
              </span>
              <span className="text-[10px] text-slate-300 block">
                Reorder Level: {product.minimumStock || 0} {unit}
              </span>
            </div>
          </div>

          {/* Reconciliation Summary Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 mt-3 border-t border-slate-700/60 text-center text-xs">
            <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Inward Units</span>
              <span className="font-black text-white text-sm font-mono">+{totalUnitsReceived} {unit}</span>
            </div>
            <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50">
              <span className="text-[10px] text-emerald-400 block uppercase font-bold">Batch Units Remaining</span>
              <span className="font-black text-emerald-400 text-sm font-mono">{totalUnitsRemaining} {unit}</span>
            </div>
            <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Recorded Batches</span>
              <span className="font-black text-indigo-300 text-sm font-mono">{totalBatches} Receipts</span>
            </div>
            <div className="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50">
              <span className="text-[10px] text-amber-400 block uppercase font-bold">Total Inward Valuation</span>
              <span className="font-black text-amber-300 text-sm font-mono">{formatInr(totalPurchaseValue)}</span>
            </div>
          </div>
        </div>

        {/* 2. SEARCH, FILTER, AND EXPORT TOOLBAR */}
        <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by receipt #, PO, supplier..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Event Type Filter */}
            <div className="min-w-[140px]">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Inward Types</option>
                <option value="PURCHASE_RECEIPT">Supplier Purchases (GRN)</option>
                <option value="INITIAL_STOCK">Opening Stock</option>
                <option value="MANUAL_INWARD">Manual Adjustments</option>
                <option value="CUSTOMER_RETURN">Customer Returns</option>
                <option value="TRANSFER_IN">Branch Inflow</option>
              </select>
            </div>

            {/* Date Range Inputs */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono"
                title="Start Date"
              />
              <span className="text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono"
                title="End Date"
              />
              {(startDate || endDate || search || typeFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setTypeFilter('ALL');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  title="Clear Filters"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Export Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={filteredReceipts.length === 0}
              className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredReceipts.length === 0}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* 3. TABLE OF STOCK RECEIPTS WITH HEADER-ADJACENT SCROLLBAR */}
        <div className="relative">
          {loading ? (
            <div className="p-12 text-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
              Loading stock receipt records...
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="p-12 text-center space-y-2 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Boxes className="w-10 h-10 text-slate-400 mx-auto opacity-40" />
              <p className="font-bold text-slate-600 dark:text-slate-400">No stock receipt records match your filters.</p>
              <p className="text-[11px] text-slate-400">
                To add inventory stock, click <strong>+ Receive Stock Batch</strong> in the Products view.
              </p>
            </div>
          ) : (
            <HeaderScrollableTable minWidth="1050px">
              <table className="w-full min-w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="p-3 min-w-[100px] whitespace-nowrap">Date</th>
                    <th className="p-3 min-w-[130px] whitespace-nowrap">Receipt / Ref #</th>
                    <th className="p-3 min-w-[120px] whitespace-nowrap">Inward Type</th>
                    <th className="p-3 min-w-[150px]">Supplier Name</th>
                    <th className="p-3 min-w-[120px] whitespace-nowrap">PO / Ref #</th>
                    <th className="p-3 min-w-[100px] text-right whitespace-nowrap">Qty Received</th>
                    <th className="p-3 min-w-[100px] text-right whitespace-nowrap">Unit Cost</th>
                    <th className="p-3 min-w-[110px] text-right whitespace-nowrap">Total Value</th>
                    <th className="p-3 min-w-[100px] text-right whitespace-nowrap">Remaining</th>
                    <th className="p-3 min-w-[160px]">Notes / Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredReceipts.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 min-w-[100px] text-slate-700 dark:text-slate-300 whitespace-nowrap font-medium">
                        {formatIndianDate(r.receivedDate)}
                      </td>
                      <td className="p-3 min-w-[130px] font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {r.receiptNumber}
                      </td>
                      <td className="p-3 min-w-[120px] whitespace-nowrap">
                        {getEventTypeBadge(r.eventType)}
                      </td>
                      <td className="p-3 min-w-[150px] font-semibold text-slate-800 dark:text-slate-200">
                        {r.supplierName ? (
                          <span>{r.supplierName}</span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="p-3 min-w-[120px] font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {r.purchaseOrderNumber || '—'}
                      </td>
                      <td className="p-3 min-w-[100px] text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap font-mono text-sm">
                        +{r.quantityReceived} {unit}
                      </td>
                      <td className="p-3 min-w-[100px] text-right font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap font-mono">
                        {r.unitCost !== undefined ? formatInr(r.unitCost) : '—'}
                      </td>
                      <td className="p-3 min-w-[110px] text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap font-mono">
                        {r.totalCost !== undefined ? formatInr(r.totalCost) : (r.unitCost !== undefined ? formatInr(r.unitCost * r.quantityReceived) : '—')}
                      </td>
                      <td className="p-3 min-w-[100px] text-right font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap font-mono">
                        {r.quantityRemaining !== undefined ? (
                          <span className={r.quantityRemaining > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                            {r.quantityRemaining} {unit}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-3 min-w-[160px] text-slate-500 dark:text-slate-400">
                        {r.notes ? (
                          <span>{r.notes}</span>
                        ) : (
                          <span className="text-slate-400 italic">No remarks recorded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </HeaderScrollableTable>
          )}
        </div>

        {/* 4. FOOTER NOTE & CLOSE BUTTON */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
            All stock receipts are immutable and recorded in the FIFO inventory ledger. Viewing this history does not alter current stock.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProductStockReceiptModal;
