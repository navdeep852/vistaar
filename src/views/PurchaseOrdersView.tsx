import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Filter,
  ShoppingCart,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
  Boxes,
  Eye,
  Edit,
  ArrowUpDown,
  DollarSign,
} from 'lucide-react';
import { PurchaseOrder, Supplier } from '../types';
import { purchaseOrderService } from '../services/supabase';
import { supabase } from '../lib/supabase';
import { PurchaseOrderStatusBadge } from '../components/purchase/PurchaseOrderStatusBadge';
import { PurchaseOrderCreateModal } from '../components/purchase/PurchaseOrderCreateModal';
import { PurchaseOrderDetailsModal } from '../components/purchase/PurchaseOrderDetailsModal';
import { ReceiveStockModal } from '../components/purchase/ReceiveStockModal';
import { PurchaseOrderPrintModal } from '../components/purchase/PurchaseOrderPrintModal';
import { showToast } from '../components/Toast';

export const PurchaseOrdersView: React.FC = () => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest_value' | 'lowest_value'>('newest');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [poToEdit, setPoToEdit] = useState<PurchaseOrder | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch POs
      const poRes = await purchaseOrderService.getPurchaseOrders({
        search: searchTerm,
        status: statusFilter,
        supplierId: supplierFilter === 'ALL' ? undefined : supplierFilter,
        sortBy,
      });
      setPurchaseOrders(poRes.data || []);

      // Fetch Suppliers for filter
      const { data: sups } = await supabase.from('suppliers').select('id, name').order('name');
      setSuppliers((sups || []).map((s: any) => ({ id: s.id, name: s.name } as Supplier)));
    } catch (err) {
      console.error('Failed to load purchase orders:', err);
      showToast('Failed to load purchase orders.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchTerm, statusFilter, supplierFilter, sortBy]);

  // KPI Calculations
  const totalPos = purchaseOrders.length;
  const draftPos = purchaseOrders.filter((p) => p.status === 'DRAFT').length;
  const pendingPos = purchaseOrders.filter((p) => ['SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED'].includes(p.status)).length;
  const receivedPos = purchaseOrders.filter((p) => ['FULLY_RECEIVED', 'CLOSED'].includes(p.status)).length;

  const totalValue = purchaseOrders.reduce((acc, p) => acc + (p.grandTotal || 0), 0);
  const pendingValue = purchaseOrders
    .filter((p) => ['DRAFT', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED'].includes(p.status))
    .reduce((acc, p) => acc + (p.grandTotal || 0), 0);

  const handleOpenDetails = async (po: PurchaseOrder) => {
    const res = await purchaseOrderService.getPurchaseOrderById(po.id!);
    setSelectedPo(res.data || po);
    setIsDetailsModalOpen(true);
  };

  const handleOpenReceive = async (po: PurchaseOrder) => {
    const res = await purchaseOrderService.getPurchaseOrderById(po.id!);
    setSelectedPo(res.data || po);
    setIsReceiveModalOpen(true);
  };

  const handleOpenPrint = (po: PurchaseOrder) => {
    setSelectedPo(po);
    setIsPrintModalOpen(true);
  };

  const handleOpenEdit = (po: PurchaseOrder) => {
    setPoToEdit(po);
    setIsCreateModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            <span>Purchase Orders</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage supplier orders and track incoming stock.</p>
        </div>

        <button
          onClick={() => {
            setPoToEdit(null);
            setIsCreateModalOpen(true);
          }}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Purchase Order</span>
        </button>
      </div>

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total POs</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{totalPos}</p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Draft</p>
          <p className="text-xl font-bold text-slate-600 dark:text-slate-300 mt-1">{draftPos}</p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Pending Receipt</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{pendingPos}</p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Fully Received</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{receivedPos}</p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Total PO Value</p>
          <p className="text-sm font-black text-slate-900 dark:text-white font-mono mt-1">₹{totalValue.toLocaleString('en-IN')}</p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Pending Value</p>
          <p className="text-sm font-black text-indigo-600 dark:text-indigo-400 font-mono mt-1">₹{pendingValue.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by PO number, supplier, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SENT">Sent</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PARTIALLY_RECEIVED">Partially Received</option>
            <option value="FULLY_RECEIVED">Fully Received</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[160px] truncate"
          >
            <option value="ALL">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="highest_value">Highest Value</option>
            <option value="lowest_value">Lowest Value</option>
          </select>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading purchase orders...</div>
        ) : purchaseOrders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ShoppingCart className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">No Purchase Orders Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">Create purchase orders to manage inventory procurement from suppliers.</p>
            <button
              onClick={() => {
                setPoToEdit(null);
                setIsCreateModalOpen(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer inline-flex items-center gap-2 mt-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Purchase Order</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-950/80 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <th className="p-4">PO Number</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Supplier</th>
                  <th className="p-4 text-center">Items</th>
                  <th className="p-4 text-right">Grand Total (₹)</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-900 dark:text-white">
                      <button
                        onClick={() => handleOpenDetails(po)}
                        className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                      >
                        {po.poNumber}
                      </button>
                    </td>
                    <td className="p-4 text-slate-600 dark:text-slate-300">{po.poDate}</td>
                    <td className="p-4">
                      <p className="font-bold text-slate-900 dark:text-white">{po.supplierName}</p>
                      {po.supplierGstin && <p className="text-[10px] text-slate-400 font-mono">GSTIN: {po.supplierGstin}</p>}
                    </td>
                    <td className="p-4 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                      {(po.items || []).length}
                    </td>
                    <td className="p-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                      ₹{po.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4">
                      <PurchaseOrderStatusBadge status={po.status} />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenDetails(po)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenPrint(po)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Print A4 PO"
                        >
                          <Printer className="w-4 h-4" />
                        </button>

                        {(po.status === 'CONFIRMED' || po.status === 'PARTIALLY_RECEIVED') && (
                          <button
                            onClick={() => handleOpenReceive(po)}
                            className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg transition-colors cursor-pointer"
                            title="Record Goods Receipt (GRN)"
                          >
                            <Boxes className="w-4 h-4" />
                          </button>
                        )}

                        {po.status === 'DRAFT' && (
                          <button
                            onClick={() => handleOpenEdit(po)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Edit Draft PO"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialogs */}
      <PurchaseOrderCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setPoToEdit(null);
        }}
        initialPo={poToEdit}
        onSuccess={() => loadData()}
      />

      <PurchaseOrderDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        purchaseOrder={selectedPo}
        onRefresh={() => {
          loadData();
          if (selectedPo) handleOpenDetails(selectedPo);
        }}
        onOpenPrint={handleOpenPrint}
        onOpenReceive={handleOpenReceive}
        onOpenEdit={handleOpenEdit}
      />

      <ReceiveStockModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
        purchaseOrder={selectedPo}
        onSuccess={() => loadData()}
      />

      <PurchaseOrderPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        purchaseOrder={selectedPo}
      />
    </div>
  );
};
