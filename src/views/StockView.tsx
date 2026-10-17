import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Lock,
  ShieldAlert,
  ArrowLeftRight,
  CheckCircle2,
  Search,
  Download,
  Printer,
  Eye,
  X,
  RotateCcw,
  FileText,
  Loader2,
  Copy,
} from 'lucide-react';
import { store } from '../services/store';
import { productService } from '../services/supabase';
import { Product, InventoryTransaction, StockMovementReason, StockTransfer, Branch } from '../types';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';
import { DedicatedWorkspace } from '../components/DedicatedWorkspace';
import { QuantityInput } from '../components/QuantityInput';
import { ScrollableTable } from '../components/ScrollableTable';
import { hasCurrentUserPermission } from '../lib/permissions';
import { auditLogService } from '../services/supabase/auditLogService';
import { useBranch } from '../context/BranchContext';
import { branchService } from '../services/supabase/branchService';
import { StockTransferModal } from '../components/StockTransferModal';
import { StockTransferPreviewModal } from '../components/stock/StockTransferPreviewModal';
import { saveStockTransferPdf, printStockTransferNote } from '../services/stockTransferDocumentService';
import { clipboardService } from '../platform';

interface StockViewProps {
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
}

export const StockView: React.FC<StockViewProps> = ({ onNavigateTab, activeTab }) => {
  const { currentBranch, branches } = useBranch();
  const [activeSubSection, setActiveSubSection] = useState<'movements' | 'transfers' | 'comparison'>('movements');
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [branchInventory, setBranchInventory] = useState<any[]>([]);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [denialModalOpen, setDenialModalOpen] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [actualStock, setActualStock] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  // Transfer History Filters & Preview States
  const [selectedTransferForPreview, setSelectedTransferForPreview] = useState<StockTransfer | null>(null);
  const [transferSearch, setTransferSearch] = useState('');
  const [transferSourceFilter, setTransferSourceFilter] = useState('ALL');
  const [transferDestFilter, setTransferDestFilter] = useState('ALL');
  const [transferStatusFilter, setTransferStatusFilter] = useState('ALL');
  const [isGeneratingPdfTransferId, setIsGeneratingPdfTransferId] = useState<string | null>(null);

  const canAdjustStock = hasCurrentUserPermission('inventory.adjust_stock');
  const canTransferStock = hasCurrentUserPermission('stock_transfers.create') || hasCurrentUserPermission('inventory.adjust_stock');
  const settings = store.getSettings();

  const loadData = async () => {
    const [prodRes, trfRes, bInvRes] = await Promise.all([
      productService.getProducts({ branchId: currentBranch?.id }),
      branchService.getStockTransfers(currentBranch?.id),
      branchService.getBranchInventory(),
    ]);
    const prodList = prodRes.data || [];
    setProducts(prodList);
    setTransfers(trfRes.data || []);
    setBranchInventory(bInvRes.data || []);
    setTransactions(store.getState().inventoryTransactions);
    if (prodList.length > 0 && !selectedProductId) {
      setSelectedProductId(prodList[0].id);
      setActualStock(prodList[0].currentStock || 0);
    }
  };

  useEffect(() => {
    loadData();
    const handleRefresh = () => loadData();
    window.addEventListener('vistaar:branch_changed', handleRefresh);
    window.addEventListener('vistaar:stock_transferred', handleRefresh);
    window.addEventListener('vistaar:branch_inventory_updated', handleRefresh);
    const unsubscribeStore = store.subscribe(loadData);
    return () => {
      window.removeEventListener('vistaar:branch_changed', handleRefresh);
      window.removeEventListener('vistaar:stock_transferred', handleRefresh);
      window.removeEventListener('vistaar:branch_inventory_updated', handleRefresh);
      unsubscribeStore();
    };
  }, [currentBranch?.id]);

  const currentProduct = products.find((p) => p.id === selectedProductId);

  useEffect(() => {
    if (currentProduct) {
      setActualStock(currentProduct.currentStock || 0);
    }
  }, [selectedProductId]);

  const handleEmployeeAttemptAdjustment = () => {
    showToast('Stock adjustment requires Owner authorization.', 'error');
    auditLogService.logSecurityEvent(
      'STOCK_ADJUSTMENT_ATTEMPT',
      'Non-owner attempted generic stock adjustment in StockView',
      'DENIED',
      { productId: selectedProductId }
    );
    setDenialModalOpen(true);
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdjustStock) {
      handleEmployeeAttemptAdjustment();
      return;
    }

    if (!selectedProductId) {
      showToast('Select a product to adjust.', 'error');
      return;
    }

    if (!notes.trim()) {
      showToast('Please provide a mandatory reason for this stock adjustment.', 'error');
      return;
    }

    setAdjusting(true);
    try {
      const res = await productService.ownerAdjustStock(
        selectedProductId,
        actualStock,
        notes.trim(),
        'Owner Manual Inventory Audit'
      );

      if (res.success) {
        showToast(`Stock updated to ${actualStock} units with immutable audit record.`, 'success');
        setAdjustModalOpen(false);
        setNotes('');
        await loadData();
      } else {
        showToast(res.error || 'Failed to adjust stock', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Stock adjustment failed.', 'error');
    } finally {
      setAdjusting(false);
    }
  };

  // Filtered Stock Transfers for Transfer History tab
  const filteredTransfers = useMemo(() => {
    return transfers.filter((trf) => {
      // 1. Search filter: transfer number, product names, sku, part number, notes
      const q = transferSearch.trim().toLowerCase();
      if (q) {
        const numMatch = (trf.transferNumber || '').toLowerCase().includes(q);
        const notesMatch = (trf.notes || '').toLowerCase().includes(q);
        const srcMatch = (trf.sourceBranchName || '').toLowerCase().includes(q);
        const dstMatch = (trf.destinationBranchName || '').toLowerCase().includes(q);
        const itemsMatch = (trf.items || []).some(
          (it) =>
            (it.productName || '').toLowerCase().includes(q) ||
            (it.sku || '').toLowerCase().includes(q) ||
            (it.partNumber || '').toLowerCase().includes(q)
        );
        if (!numMatch && !notesMatch && !srcMatch && !dstMatch && !itemsMatch) return false;
      }

      // 2. Source Branch filter
      if (transferSourceFilter !== 'ALL' && trf.sourceBranchId !== transferSourceFilter) {
        return false;
      }

      // 3. Destination Branch filter
      if (transferDestFilter !== 'ALL' && trf.destinationBranchId !== transferDestFilter) {
        return false;
      }

      // 4. Status filter
      if (transferStatusFilter !== 'ALL' && trf.status !== transferStatusFilter) {
        return false;
      }

      return true;
    });
  }, [transfers, transferSearch, transferSourceFilter, transferDestFilter, transferStatusFilter]);

  // Aggregate metrics for transfers
  const transferStats = useMemo(() => {
    const totalTransfers = filteredTransfers.length;
    const totalUnits = filteredTransfers.reduce(
      (acc, t) => acc + (t.totalQuantity ?? (t.items || []).reduce((sum, it) => sum + it.quantity, 0)),
      0
    );
    const totalValue = filteredTransfers.reduce(
      (acc, t) => acc + (t.totalTransferValue ?? 0),
      0
    );
    return { totalTransfers, totalUnits, totalValue };
  }, [filteredTransfers]);

  const handleDownloadTransferPdf = async (trf: StockTransfer) => {
    if (isGeneratingPdfTransferId) return;
    setIsGeneratingPdfTransferId(trf.id || trf.transferNumber);
    try {
      const srcB = branches.find((b) => b.id === trf.sourceBranchId);
      const dstB = branches.find((b) => b.id === trf.destinationBranchId);
      await saveStockTransferPdf({
        transfer: trf,
        sourceBranch: srcB,
        destBranch: dstB,
        settings,
      });
    } finally {
      setIsGeneratingPdfTransferId(null);
    }
  };

  const handlePrintTransfer = (trf: StockTransfer) => {
    const srcB = branches.find((b) => b.id === trf.sourceBranchId);
    const dstB = branches.find((b) => b.id === trf.destinationBranchId);
    printStockTransferNote({
      transfer: trf,
      sourceBranch: srcB,
      destBranch: dstB,
      settings,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Inventory Stock Governance</h3>
            {currentBranch ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60">
                {currentBranch.branchName} ({currentBranch.branchCode})
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                All Branches (Consolidated)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time branch inventory tracking, immutable movement logs, and cross-location stock transfers.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {canTransferStock && (
            <button
              onClick={() => setTransferModalOpen(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>+ Stock Transfer</span>
            </button>
          )}

          {canAdjustStock ? (
            <button
              onClick={() => {
                if (products.length > 0 && !selectedProductId) {
                  setSelectedProductId(products[0].id);
                  setActualStock(products[0].currentStock || 0);
                }
                setAdjustModalOpen(true);
              }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Owner Adjustment</span>
            </button>
          ) : (
            <button
              onClick={handleEmployeeAttemptAdjustment}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Stock adjustment requires Owner authorization"
            >
              <Lock className="w-4 h-4 text-amber-500" />
              <span>Stock Adjustment</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubSection('movements')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubSection === 'movements'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Stock Movements & Audit ({transactions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubSection('transfers')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubSection === 'transfers'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>Inter-Branch Transfers ({transfers.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubSection('comparison')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubSection === 'comparison'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Boxes className="w-3.5 h-3.5" />
          <span>Multi-Branch Stock Comparison ({products.length})</span>
        </button>
      </div>

      {/* Denial Informational Modal for Non-Owner Employees */}
      {denialModalOpen && (
        <Modal
          isOpen={denialModalOpen}
          onClose={() => setDenialModalOpen(false)}
          title="Stock Adjustment Restricted"
          maxWidth="md"
        >
          <div className="p-6 space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Stock adjustment requires Owner authorization.
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
              Employees are strictly restricted from manually altering stock quantities to protect stock integrity.
              All stock deductions must originate from verified Invoices or Counter Sales. New stock must be received through purchase orders or stock receipts.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setDenialModalOpen(false)}
                className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MOVEMENTS TABLE */}
      {activeSubSection === 'movements' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
          <ScrollableTable minWidth="850px">
            <table className="w-full min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5 min-w-[150px] whitespace-nowrap">Date & Time</th>
                  <th className="px-6 py-3.5 min-w-[180px]">Product</th>
                  <th className="px-6 py-3.5 min-w-[140px] whitespace-nowrap">Movement Type</th>
                  <th className="px-6 py-3.5 min-w-[120px] whitespace-nowrap">Change</th>
                  <th className="px-6 py-3.5 min-w-[120px] whitespace-nowrap">Updated Stock</th>
                  <th className="px-6 py-3.5 min-w-[160px]">Reference / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      No stock transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t) => {
                    const prod = products.find((p) => p.id === t.productId);
                    const isPositive = t.quantityDelta > 0;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(t.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100 min-w-[180px]">{prod ? prod.name : 'Product'}</td>
                        <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{t.type}</td>
                        <td
                          className={`px-6 py-4 font-extrabold flex items-center gap-1 whitespace-nowrap ${
                            isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          <span>
                            {isPositive ? '+' : ''}
                            {t.quantityDelta}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">{t.newStock}</td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 min-w-[160px]">{t.referenceNo || t.notes || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      )}

      {/* INTER-BRANCH STOCK TRANSFERS HISTORY & DOCUMENT RETRIEVAL */}
      {activeSubSection === 'transfers' && (
        <div className="space-y-4">
          {/* TRANSFER HISTORY TOOLBAR & FILTERS */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card transition-colors space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                {/* Search Bar */}
                <div className="relative flex-1 sm:w-60 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={transferSearch}
                    onChange={(e) => setTransferSearch(e.target.value)}
                    placeholder="Search STN #, product, SKU, note..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Source Branch Filter */}
                <select
                  value={transferSourceFilter}
                  onChange={(e) => setTransferSourceFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">From: All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      From: {b.branchName} ({b.branchCode})
                    </option>
                  ))}
                </select>

                {/* Destination Branch Filter */}
                <select
                  value={transferDestFilter}
                  onChange={(e) => setTransferDestFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">To: All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      To: {b.branchName} ({b.branchCode})
                    </option>
                  ))}
                </select>

                {/* Status Filter */}
                <select
                  value={transferStatusFilter}
                  onChange={(e) => setTransferStatusFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="In Transit">In Transit</option>
                  <option value="Approved">Approved</option>
                  <option value="Draft">Draft</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {canTransferStock && (
                <button
                  type="button"
                  onClick={() => setTransferModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/20 cursor-pointer shrink-0"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span>+ New Transfer</span>
                </button>
              )}
            </div>

            {/* Active Filters Row & Summary Counters */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-3">
                <span>
                  Showing <strong>{filteredTransfers.length}</strong> of {transfers.length} transfers
                </span>
                <span>•</span>
                <span>
                  Total Units Moved: <strong className="text-emerald-600 dark:text-emerald-400">{transferStats.totalUnits.toLocaleString()}</strong>
                </span>
                {transferStats.totalValue > 0 && (
                  <>
                    <span>•</span>
                    <span>
                      Internal Valuation: <strong className="text-slate-700 dark:text-slate-300">{settings.currency}{transferStats.totalValue.toLocaleString()}</strong>
                    </span>
                  </>
                )}
              </div>

              {(transferSearch.trim() !== '' || transferSourceFilter !== 'ALL' || transferDestFilter !== 'ALL' || transferStatusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setTransferSearch('');
                    setTransferSourceFilter('ALL');
                    setTransferDestFilter('ALL');
                    setTransferStatusFilter('ALL');
                  }}
                  className="text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 font-semibold cursor-pointer ml-auto"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </div>

          {/* TRANSFERS TABLE */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
            <ScrollableTable minWidth="980px">
              <table className="w-full min-w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="px-5 py-3.5 whitespace-nowrap">Transfer Note #</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Date & Time</th>
                    <th className="px-5 py-3.5 min-w-[200px]">Origin → Destination</th>
                    <th className="px-5 py-3.5 min-w-[220px]">Items Transferred</th>
                    <th className="px-5 py-3.5 text-center whitespace-nowrap">Total Qty</th>
                    <th className="px-5 py-3.5 text-center whitespace-nowrap">Status</th>
                    <th className="px-5 py-3.5 text-right whitespace-nowrap">Document Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredTransfers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                          <p>No inter-branch transfers found matching active filters.</p>
                          {(transferSearch || transferSourceFilter !== 'ALL' || transferDestFilter !== 'ALL' || transferStatusFilter !== 'ALL') ? (
                            <button
                              type="button"
                              onClick={() => {
                                setTransferSearch('');
                                setTransferSourceFilter('ALL');
                                setTransferDestFilter('ALL');
                                setTransferStatusFilter('ALL');
                              }}
                              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                            >
                              Clear all filters
                            </button>
                          ) : (
                            canTransferStock && (
                              <button
                                type="button"
                                onClick={() => setTransferModalOpen(true)}
                                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                              >
                                + Create your first stock transfer
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTransfers.map((trf) => {
                      const totalTransferQty = trf.totalQuantity ?? (trf.items || []).reduce((a, it) => a + (Number(it.quantity) || 0), 0);
                      const isGeneratingThisPdf = isGeneratingPdfTransferId === (trf.id || trf.transferNumber);

                      return (
                        <tr key={trf.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          {/* Transfer Number */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedTransferForPreview(trf)}
                              className="group inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-mono font-bold hover:underline cursor-pointer"
                              title="Click to view Stock Transfer Note"
                            >
                              <span>{trf.transferNumber}</span>
                              <FileText className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
                            </button>
                          </td>

                          {/* Date */}
                          <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 whitespace-nowrap text-[11px]">
                            <div>{new Date(trf.transferDate).toLocaleDateString()}</div>
                            {trf.createdAt && (
                              <div className="text-[10px] text-slate-400">
                                {new Date(trf.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </td>

                          {/* Origin -> Destination */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                              <span className="truncate max-w-[110px]" title={trf.sourceBranchName || 'Origin'}>
                                {trf.sourceBranchName || 'Origin'}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="truncate max-w-[110px]" title={trf.destinationBranchName || 'Destination'}>
                                {trf.destinationBranchName || 'Destination'}
                              </span>
                            </div>
                            {trf.notes && (
                              <p className="text-[10px] text-slate-400 truncate max-w-xs mt-0.5" title={trf.notes}>
                                Note: {trf.notes}
                              </p>
                            )}
                          </td>

                          {/* Items Transferred */}
                          <td className="px-5 py-3.5">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">
                              {trf.items?.length || 0} Products
                            </span>
                            {trf.items && trf.items.length > 0 && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate max-w-xs" title={trf.items.map((it) => `${it.productName || 'Item'} (${it.quantity})`).join(', ')}>
                                {trf.items.map((it) => `${it.productName || 'Item'} (${it.quantity})`).join(', ')}
                              </span>
                            )}
                          </td>

                          {/* Total Quantity */}
                          <td className="px-5 py-3.5 text-center font-black text-slate-900 dark:text-slate-100">
                            {totalTransferQty.toLocaleString()}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-3.5 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
                              <CheckCircle2 className="w-3 h-3" />
                              {trf.status}
                            </span>
                          </td>

                          {/* Actions: View, PDF, Print */}
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setSelectedTransferForPreview(trf)}
                                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-slate-600 dark:text-slate-300 hover:text-blue-600 transition-colors cursor-pointer"
                                title="View Stock Transfer Note"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownloadTransferPdf(trf)}
                                disabled={isGeneratingThisPdf}
                                className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer"
                                title="Download A4 PDF Note"
                              >
                                {isGeneratingThisPdf ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handlePrintTransfer(trf)}
                                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                                title="Print Stock Transfer Note"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </ScrollableTable>
          </div>
        </div>
      )}

      {/* MULTI-BRANCH STOCK COMPARISON TABLE */}
      {activeSubSection === 'comparison' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Multi-Branch Stock Matrix & Location Allocation
              </h4>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Authoritative independent branch inventory breakdown across all operating locations.
              </p>
            </div>
            {canTransferStock && (
              <button
                onClick={() => setTransferModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Quick Transfer</span>
              </button>
            )}
          </div>
          <ScrollableTable minWidth="850px">
            <table className="w-full min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5 min-w-[200px]">Product</th>
                  <th className="px-6 py-3.5 min-w-[120px]">SKU / Part #</th>
                  {branches.map((b) => (
                    <th key={b.id} className="px-6 py-3.5 min-w-[120px] text-center whitespace-nowrap">
                      {b.branchName} ({b.branchCode})
                    </th>
                  ))}
                  <th className="px-6 py-3.5 min-w-[120px] text-right font-extrabold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                    Total Enterprise Stock
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={branches.length + 3} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      No products found in the catalog.
                    </td>
                  </tr>
                ) : (
                  products.map((prod) => {
                    let totalStock = 0;
                    return (
                      <tr key={prod.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">
                          {prod.name}
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-500 dark:text-slate-400">
                          {prod.partNumber || prod.sku || '—'}
                        </td>
                        {branches.map((b) => {
                          const biEntry = branchInventory.find(
                            (bi) => (bi.branchId || bi.branch_id) === b.id && (bi.productId || bi.product_id) === prod.id
                          );
                          const bStock = biEntry != null
                            ? Number(biEntry.currentStock ?? biEntry.current_stock ?? 0)
                            : (b.isMainBranch ? Number(prod.currentStock || 0) : 0);
                          totalStock += bStock;
                          return (
                            <td key={b.id} className="px-6 py-4 text-center font-bold">
                              <span className={`px-2.5 py-1 rounded-lg text-xs ${
                                bStock > 0
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                              }`}>
                                {bStock}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 text-right font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                          {totalStock}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      )}

      {/* Stock Transfer Modal */}
      <StockTransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        onSuccess={loadData}
        onViewHistory={() => setActiveSubSection('transfers')}
        currentBranch={currentBranch}
      />

      {/* Stock Transfer Note Preview Modal */}
      <StockTransferPreviewModal
        isOpen={!!selectedTransferForPreview}
        onClose={() => setSelectedTransferForPreview(null)}
        transfer={selectedTransferForPreview}
        sourceBranch={branches.find((b) => b.id === selectedTransferForPreview?.sourceBranchId)}
        destBranch={branches.find((b) => b.id === selectedTransferForPreview?.destinationBranchId)}
      />

      {/* OWNER-AUTHORIZED STOCK ADJUSTMENT WORKSPACE */}
      {adjustModalOpen && (
        <DedicatedWorkspace
          title="Owner-Authorized Stock Adjustment"
          subtitle="Audit and synchronize physical inventory count with immutable audit trail (Section 7)"
          badgeText="OWNER ONLY"
          icon={Boxes}
          onClose={() => setAdjustModalOpen(false)}
          onNavigateTab={onNavigateTab}
          activeTab={activeTab || 'stock'}
        >
          <form onSubmit={handleAdjustStock} className="space-y-6 max-w-4xl mx-auto bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Product *</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {p.currentStock} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Current VISTAAR Stock
                </label>
                <div className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200">
                  {currentProduct ? `${currentProduct.currentStock} ${currentProduct.unit}` : '0 Units'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Actual Physical Stock Count *
                </label>
                <QuantityInput
                  size="md"
                  min={0}
                  required
                  value={actualStock}
                  onChange={(val) => setActualStock(val)}
                  className="w-full justify-between"
                  ariaLabel="Actual Physical Stock Count"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Calculated Net Difference
                </label>
                <div className={`px-3.5 py-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-between ${
                  (actualStock - (currentProduct?.currentStock || 0)) === 0
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    : (actualStock - (currentProduct?.currentStock || 0)) > 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                }`}>
                  <span>
                    {(actualStock - (currentProduct?.currentStock || 0)) > 0 ? '+' : ''}
                    {actualStock - (currentProduct?.currentStock || 0)} {currentProduct?.unit}
                  </span>
                  <span className="text-[10px] font-semibold uppercase">
                    {(actualStock - (currentProduct?.currentStock || 0)) === 0 ? 'No Change' : (actualStock - (currentProduct?.currentStock || 0)) > 0 ? 'Increase' : 'Decrease'}
                  </span>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Mandatory Audit Reason *
                </label>
                <input
                  type="text"
                  required
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Physical inventory count verified post quarterly audit"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adjusting || !notes.trim()}
                className="px-6 py-2.5 rounded-xl bg-blue-600 disabled:opacity-50 text-white text-xs font-bold hover:bg-blue-700 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                {adjusting ? 'Authorizing Adjustment...' : 'Confirm & Authorize Stock Adjustment'}
              </button>
            </div>
          </form>
        </DedicatedWorkspace>
      )}
    </div>
  );
};
