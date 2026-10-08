import React, { useState, useEffect } from 'react';
import { Boxes, Plus, ArrowUpRight, ArrowDownRight, ArrowRight, RefreshCw, AlertTriangle, Lock, ShieldAlert, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { store } from '../services/store';
import { productService } from '../services/supabase';
import { Product, InventoryTransaction, StockMovementReason, StockTransfer } from '../types';
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
    const handleBranchChanged = () => loadData();
    window.addEventListener('vistaar:branch_changed', handleBranchChanged);
    const unsubscribeStore = store.subscribe(loadData);
    return () => {
      window.removeEventListener('vistaar:branch_changed', handleBranchChanged);
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

      {/* TRANSFERS TABLE */}
      {activeSubSection === 'transfers' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
          <ScrollableTable minWidth="850px">
            <table className="w-full min-w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5 whitespace-nowrap">Transfer #</th>
                  <th className="px-6 py-3.5 whitespace-nowrap">Date</th>
                  <th className="px-6 py-3.5">Source → Destination</th>
                  <th className="px-6 py-3.5">Items Transferred</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      No inter-branch transfers recorded yet.
                    </td>
                  </tr>
                ) : (
                  transfers.map((trf) => (
                    <tr key={trf.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {trf.transferNumber}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(trf.transferDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100">
                          <span>{trf.sourceBranchName || 'Origin'}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
                          <span>{trf.destinationBranchName || 'Destination'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                          {trf.items?.length || 0} Products
                        </span>
                        {trf.items && trf.items.length > 0 && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate max-w-xs">
                            {trf.items.map((it) => `${it.productName || 'Item'} (${it.quantity})`).join(', ')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60">
                          <CheckCircle2 className="w-3 h-3" />
                          {trf.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        {trf.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollableTable>
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
                          const biEntry = branchInventory.find((bi) => bi.branchId === b.id && bi.productId === prod.id);
                          const bStock = biEntry ? Number(biEntry.currentStock) || 0 : (b.isMainBranch ? Number(prod.currentStock) || 0 : 0);
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
        currentBranch={currentBranch}
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
