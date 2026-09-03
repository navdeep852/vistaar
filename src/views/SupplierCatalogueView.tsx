import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Download,
  Building2,
  FileSpreadsheet,
  Package,
  Eye,
  Link2,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Boxes,
} from 'lucide-react';
import {
  SupplierCatalogueItem,
  SupplierCatalogueFile,
  Supplier,
} from '../types';
import { supplierCatalogueService, productService } from '../services/supabase';
import { showToast } from '../components/Toast';
import { UploadCatalogueModal } from '../components/catalogue/UploadCatalogueModal';
import { SupplierCatalogueDetailModal } from '../components/catalogue/SupplierCatalogueDetailModal';

export const SupplierCatalogueView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'items' | 'history'>('items');
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Filters State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Data State
  const [catalogueItems, setCatalogueItems] = useState<SupplierCatalogueItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);

  const [catalogueFiles, setCatalogueFiles] = useState<SupplierCatalogueFile[]>([]);

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedDetailItem, setSelectedDetailItem] = useState<SupplierCatalogueItem | null>(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (activeTab === 'items') {
      fetchCatalogueItems();
    } else {
      fetchCatalogueFiles();
    }
  }, [activeTab, selectedSupplierId, searchQuery, brandFilter, categoryFilter, page]);

  const fetchSuppliers = async () => {
    const { data } = await productService.getSuppliers();
    setSuppliers(data || []);
  };

  const fetchCatalogueItems = async () => {
    setLoading(true);
    const res = await supplierCatalogueService.getCatalogueItems({
      supplierId: selectedSupplierId || undefined,
      search: searchQuery || undefined,
      brand: brandFilter || undefined,
      category: categoryFilter || undefined,
      page,
      limit: 50,
    });
    setCatalogueItems(res.items || []);
    setTotalItems(res.total || 0);
    setLoading(false);
  };

  const fetchCatalogueFiles = async () => {
    setLoading(true);
    const files = await supplierCatalogueService.getCatalogueFiles(selectedSupplierId || undefined);
    setCatalogueFiles(files);
    setLoading(false);
  };

  const handleDownloadOriginalFile = async (storagePath: string) => {
    const url = await supplierCatalogueService.getDownloadUrl(storagePath);
    if (!url) {
      showToast('Could not retrieve download link.', 'error');
      return;
    }
    window.open(url, '_blank');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            <span>Supplier Catalogue</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Import and manage supplier products, pricing, specifications, and price history audit trails.
          </p>
        </div>

        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Supplier Catalogue</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => {
            setActiveTab('items');
            setPage(1);
          }}
          className={`py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'items'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Catalogue Products ({totalItems})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Upload & Import History</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Supplier Dropdown Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Filter by Supplier</label>
            <select
              value={selectedSupplierId}
              onChange={(e) => {
                setSelectedSupplierId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
            >
              <option value="">-- All Suppliers --</option>
              {suppliers.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Search Products</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by product name, part number, item code, HSN, barcode..."
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Reset Filters */}
          <div className="flex items-end">
            <button
              onClick={() => {
                setSelectedSupplierId('');
                setSearchQuery('');
                setBrandFilter('');
                setCategoryFilter('');
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* ITEMS TAB */}
      {activeTab === 'items' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
              <span>Loading supplier catalogue items...</span>
            </div>
          ) : catalogueItems.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <Package className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">No Catalogue Items Found</p>
              <p className="mt-1">Upload a supplier price list (.xlsx/.csv) to import supplier catalogue products.</p>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
              >
                Upload Supplier Catalogue
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <th className="p-3">Supplier</th>
                    <th className="p-3">Product Name</th>
                    <th className="p-3">Part Number</th>
                    <th className="p-3">Supplier Code</th>
                    <th className="p-3 text-right">Purchase Price</th>
                    <th className="p-3">UOM</th>
                    <th className="p-3 text-right">GST %</th>
                    <th className="p-3">HSN/SAC</th>
                    <th className="p-3">VISTAAR Link</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {catalogueItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate max-w-[140px]">{item.supplierName || 'Supplier'}</span>
                      </td>

                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        {item.productName}
                      </td>

                      <td className="p-3 text-slate-500 font-mono">
                        {item.partNumber || '-'}
                      </td>

                      <td className="p-3 text-slate-500 font-mono">
                        {item.supplierProductCode || '-'}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {item.purchasePrice !== null && item.purchasePrice !== undefined
                          ? `₹${item.purchasePrice.toFixed(2)}`
                          : '-'}
                      </td>

                      <td className="p-3 text-slate-600 dark:text-slate-400 font-medium">
                        {item.uom || 'Pcs'}
                      </td>

                      <td className="p-3 text-right font-mono font-semibold">
                        {item.gstRate !== undefined ? `${item.gstRate}%` : '18%'}
                      </td>

                      <td className="p-3 text-slate-500 font-mono">
                        {item.hsnSac || '-'}
                      </td>

                      <td className="p-3">
                        {item.productId ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold rounded flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" />
                            Linked
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold rounded flex items-center gap-1 w-fit">
                            <AlertCircle className="w-3 h-3" />
                            Unlinked
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          onClick={() => setSelectedDetailItem(item)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ml-auto"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          {catalogueFiles.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <FileSpreadsheet className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">No Import History</p>
              <p className="mt-1">No supplier price lists have been uploaded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <th className="p-3">Supplier</th>
                    <th className="p-3">File Name</th>
                    <th className="p-3">Uploaded Date</th>
                    <th className="p-3 text-right">Total Rows</th>
                    <th className="p-3 text-right">Imported</th>
                    <th className="p-3 text-right">Failed</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {catalogueFiles.map((file) => (
                    <tr key={file.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">
                        {file.supplierName || 'Supplier'}
                      </td>
                      <td className="p-3 font-mono font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 shrink-0" />
                        <span>{file.fileName}</span>
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        {new Date(file.createdAt).toLocaleString('en-IN')}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">{file.totalRows}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {file.successfulRows}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {file.failedRows}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                            file.importStatus === 'IMPORTED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : file.importStatus === 'PARTIALLY_IMPORTED'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          {file.importStatus}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDownloadOriginalFile(file.storagePath)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer ml-auto"
                          title="Download Original File from Storage"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Upload Wizard Modal */}
      <UploadCatalogueModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        suppliers={suppliers}
        onSuccess={() => {
          fetchCatalogueItems();
          fetchCatalogueFiles();
        }}
      />

      {/* Catalogue Item Detail Modal */}
      <SupplierCatalogueDetailModal
        isOpen={!!selectedDetailItem}
        onClose={() => setSelectedDetailItem(null)}
        item={selectedDetailItem}
        onRefresh={() => {
          fetchCatalogueItems();
        }}
      />
    </div>
  );
};
