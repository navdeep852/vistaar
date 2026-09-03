import React, { useState, useEffect } from 'react';
import {
  X,
  Package,
  History,
  Link2,
  Plus,
  FileSpreadsheet,
  Building2,
  Tag,
  Boxes,
  Barcode,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { SupplierCatalogueItem, SupplierCataloguePriceHistory, Product } from '../../types';
import { supplierCatalogueService, productService } from '../../services/supabase';
import { showToast } from '../Toast';
import { QuickAddProductModal } from '../purchase/QuickAddProductModal';

interface SupplierCatalogueDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: SupplierCatalogueItem | null;
  onRefresh: () => void;
}

export const SupplierCatalogueDetailModal: React.FC<SupplierCatalogueDetailModalProps> = ({
  isOpen,
  onClose,
  item,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'price_history'>('details');
  const [loading, setLoading] = useState(false);
  const [priceHistory, setPriceHistory] = useState<SupplierCataloguePriceHistory[]>([]);
  const [linkedProduct, setLinkedProduct] = useState<Product | null>(null);

  // Link / Create Product modal state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isLinkSearchOpen, setIsLinkSearchOpen] = useState(false);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    if (isOpen && item) {
      setActiveTab('details');
      fetchPriceHistory();
      if (item.productId) {
        fetchLinkedProduct(item.productId);
      } else {
        setLinkedProduct(null);
      }
    }
  }, [isOpen, item]);

  const fetchPriceHistory = async () => {
    if (!item) return;
    const history = await supplierCatalogueService.getPriceHistory(item.id);
    setPriceHistory(history);
  };

  const fetchLinkedProduct = async (prodId: string) => {
    const { data } = await productService.getProducts();
    const prod = (data || []).find((p) => p.id === prodId);
    setLinkedProduct(prod || null);
  };

  const handleOpenLinkSearch = async () => {
    const { data } = await productService.getProducts();
    setAllProducts(data || []);
    setIsLinkSearchOpen(true);
  };

  const handleLinkProduct = async (prodId: string) => {
    if (!item) return;
    setLoading(true);
    const res = await supplierCatalogueService.linkCatalogueItemToProduct(item.id, prodId);
    setLoading(false);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast('Linked catalogue item to VISTAAR product successfully!', 'success');
    setIsLinkSearchOpen(false);
    onRefresh();
    fetchLinkedProduct(prodId);
  };

  const handleProductCreated = async (newProd: Product) => {
    if (!item) return;
    setLoading(true);
    const res = await supplierCatalogueService.linkCatalogueItemToProduct(item.id, newProd.id);
    setLoading(false);
    if (res.error) {
      showToast(res.error, 'error');
      return;
    }
    showToast(`Created & linked new product "${newProd.name}"!`, 'success');
    setIsQuickAddOpen(false);
    onRefresh();
    fetchLinkedProduct(newProd.id);
  };

  if (!isOpen || !item) return null;

  const filteredProductsToLink = allProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.partNumber && p.partNumber.toLowerCase().includes(productSearch.toLowerCase()))
  );

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden transition-colors max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold rounded">
                  Supplier Catalogue Item
                </span>
                {item.supplierName && (
                  <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {item.supplierName}
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                {item.productName}
              </h2>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Section Tabs */}
          <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex gap-6 bg-slate-50/50 dark:bg-slate-900">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'details'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Item Specifications</span>
            </button>
            <button
              onClick={() => setActiveTab('price_history')}
              className={`py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'price_history'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Price History ({priceHistory.length})</span>
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 flex-1 overflow-y-auto space-y-6">
            {activeTab === 'details' && (
              <div className="space-y-6">
                {/* Linked VISTAAR Product Status */}
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      VISTAAR Catalogue Link Status
                    </p>
                    {linkedProduct ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          Linked to "{linkedProduct.name}" (SKU: {linkedProduct.partNumber || 'N/A'})
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                          Unlinked Supplier Item
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {!linkedProduct && (
                      <>
                        <button
                          onClick={handleOpenLinkSearch}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>Link Existing Product</span>
                        </button>
                        <button
                          onClick={() => setIsQuickAddOpen(true)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer shadow-sm transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create Product</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Grid Details */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Purchase Price</p>
                    <p className="text-base font-black text-slate-900 dark:text-white font-mono">
                      {item.purchasePrice !== null && item.purchasePrice !== undefined
                        ? `₹${item.purchasePrice.toFixed(2)}`
                        : 'N/A'}
                    </p>
                  </div>

                  <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">GST Rate %</p>
                    <p className="text-base font-black text-slate-900 dark:text-white font-mono">
                      {item.gstRate !== undefined ? `${item.gstRate}%` : '18%'}
                    </p>
                  </div>

                  <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Part Number</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                      {item.partNumber || '-'}
                    </p>
                  </div>

                  <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Supplier Item Code</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                      {item.supplierProductCode || '-'}
                    </p>
                  </div>

                  <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">UOM (Unit)</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{item.uom || 'Pcs'}</p>
                  </div>

                  <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">HSN / SAC Code</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">{item.hsnSac || '-'}</p>
                  </div>

                  <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Brand</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{item.brand || '-'}</p>
                  </div>

                  <div className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Category</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{item.category || '-'}</p>
                  </div>
                </div>

                {item.description && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                      Description / Specifications
                    </label>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300">
                      {item.description}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'price_history' && (
              <div className="space-y-4">
                {priceHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">No historical price entries recorded yet.</p>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          <th className="p-3">Effective Date</th>
                          <th className="p-3 text-right">Purchase Price (₹)</th>
                          <th className="p-3">Source File</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {priceHistory.map((ph) => (
                          <tr key={ph.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                              {ph.effectiveDate}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              ₹{ph.purchasePrice.toFixed(2)}
                            </td>
                            <td className="p-3 text-slate-500 flex items-center gap-1 font-mono text-[11px]">
                              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-500" />
                              <span>Catalogue Import</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-950/80">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold shadow-md cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Link Product Modal Picker */}
      {isLinkSearchOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Link to Catalogue Product
              </h3>
              <button onClick={() => setIsLinkSearchOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              placeholder="Search product by name or part number..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
            />

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
              {filteredProductsToLink.map((p) => (
                <div
                  key={p.id}
                  onClick={() => handleLinkProduct(p.id)}
                  className="p-3 hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{p.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">Stock: {p.currentStock} {p.unit} | SKU: {p.partNumber || '-'}</p>
                  </div>
                  <button className="px-2.5 py-1 bg-blue-600 text-white rounded text-[10px] font-bold">
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Product Modal */}
      <QuickAddProductModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        initialName={item.productName}
        onSuccess={handleProductCreated}
      />
    </>
  );
};
