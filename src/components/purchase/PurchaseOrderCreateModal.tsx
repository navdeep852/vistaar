import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Building2,
  Package,
  Plus,
  Trash2,
  Save,
  Search,
  AlertCircle,
  Tag,
} from 'lucide-react';
import { Supplier, Product, PurchaseOrder, PurchaseOrderItem, SupplierCatalogueItem } from '../../types';
import { purchaseOrderService, customerService, productService, supplierCatalogueService } from '../../services/supabase';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { showToast } from '../Toast';
import { QuickAddProductModal } from './QuickAddProductModal';

interface PurchaseOrderCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (po: PurchaseOrder) => void;
  initialPo?: PurchaseOrder | null;
}

export const PurchaseOrderCreateModal: React.FC<PurchaseOrderCreateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialPo,
}) => {
  const [loading, setLoading] = useState(false);

  // Suppliers & Products State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Quick Add Product Modal state
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);

  // Form Fields
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30 Days');
  const [notes, setNotes] = useState('');
  const [termsConditions, setTermsConditions] = useState(
    '1. Goods subject to inspection upon delivery.\n2. Payment as per agreed terms.\n3. Mention PO number on all invoices and delivery notes.'
  );
  const [internalNotes, setInternalNotes] = useState('');

  // Line Items
  const [items, setItems] = useState<Partial<PurchaseOrderItem>[]>([]);
  const [supplierCatalogueItems, setSupplierCatalogueItems] = useState<SupplierCatalogueItem[]>([]);

  // Fetch supplier catalogue items when supplier is selected
  useEffect(() => {
    if (!supplierId) {
      setSupplierCatalogueItems([]);
      return;
    }

    let isMounted = true;
    supplierCatalogueService
      .getCatalogueItems({
        supplierId,
        search: productSearch.trim() || undefined,
        limit: 15,
      })
      .then((res) => {
        if (isMounted) {
          setSupplierCatalogueItems(res.items || []);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [supplierId, productSearch]);

  useEffect(() => {
    if (!isOpen) return;

    const initializeModal = async () => {
      setLoading(true);
      try {
        // Load Suppliers
        const { data: sups } = await supabase.from('suppliers').select('*').order('name');
        const formattedSuppliers: Supplier[] = (sups || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          phone: s.phone || '',
          gstin: s.gstin || '',
          address: s.address || '',
        }));
        setSuppliers(formattedSuppliers);

        // Load Products
        const { data: prods } = await productService.getProducts();
        setProducts(prods || []);

        if (initialPo) {
          setPoNumber(initialPo.poNumber);
          setPoDate(initialPo.poDate);
          setExpectedDeliveryDate(initialPo.expectedDeliveryDate || '');
          setReferenceNumber(initialPo.referenceNumber || '');
          setPaymentTerms(initialPo.paymentTerms || 'Net 30 Days');
          setNotes(initialPo.notes || '');
          setTermsConditions(initialPo.termsConditions || '');
          setInternalNotes(initialPo.internalNotes || '');

          setSupplierId(initialPo.supplierId || '');
          const sup = formattedSuppliers.find((s) => s.id === initialPo.supplierId);
          if (sup) {
            setSelectedSupplier(sup);
            setSupplierSearch(sup.name);
          } else if (initialPo.supplierName) {
            setSupplierSearch(initialPo.supplierName);
          }

          setItems(
            (initialPo.items || []).map((it) => ({
              productId: it.productId || null,
              productName: it.productName || it.itemName || it.description || 'Custom Item',
              itemName: it.itemName || it.productName || it.description || 'Custom Item',
              isCustomItem: !it.productId,
              productSku: it.productSku || '',
              description: it.description || '',
              quantity: it.quantity,
              unit: it.unit || 'Pcs',
              unitPrice: it.unitPrice,
              discountType: it.discountType || 'FIXED',
              discountValue: it.discountValue || 0,
              taxRate: it.taxRate || 0,
            }))
          );
        } else {
          // Fresh PO
          const newNo = await purchaseOrderService.generatePoNumber();
          setPoNumber(newNo);
          setPoDate(new Date().toISOString().split('T')[0]);
          setExpectedDeliveryDate('');
          setReferenceNumber('');
          setSupplierId('');
          setSelectedSupplier(null);
          setSupplierSearch('');
          setItems([]);
        }
      } catch (err) {
        console.error('Failed to initialize PO modal:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeModal();
  }, [isOpen, initialPo]);

  if (!isOpen) return null;

  // Filtered Suppliers for Autocomplete
  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
      (s.phone && s.phone.includes(supplierSearch)) ||
      (s.gstin && s.gstin.toLowerCase().includes(supplierSearch.toLowerCase()))
  );

  // Filtered Products for Autocomplete
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.partNumber && p.partNumber.toLowerCase().includes(productSearch.toLowerCase())) ||
      (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  );

  const handleSelectSupplier = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setSupplierId(supplier.id);
    setSupplierSearch(supplier.name);
    setShowSupplierDropdown(false);
  };

  const handleAddProductLine = (product: Product) => {
    const existingIdx = items.findIndex((it) => it.productId === product.id);
    if (existingIdx !== -1) {
      const updated = [...items];
      updated[existingIdx].quantity = (updated[existingIdx].quantity || 1) + 1;
      setItems(updated);
    } else {
      const purchasePrice = Number(product.buyPrice ?? (product as any).purchasePrice ?? 0);
      const taxRate = Number(product.taxPercent ?? product.gstRate ?? 18);
      setItems([
        ...items,
        {
          productId: product.id,
          productName: product.name,
          itemName: product.name,
          isCustomItem: false,
          productSku: product.sku || product.partNumber || '',
          description: '',
          quantity: 1,
          unit: product.unit || 'Pcs',
          unitPrice: purchasePrice,
          discountType: 'FIXED',
          discountValue: 0,
          taxRate,
        },
      ]);
    }
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const handleAddCatalogueItemLine = (catItem: SupplierCatalogueItem) => {
    setItems((prev) => [
      ...prev,
      {
        productId: catItem.productId || null,
        supplierCatalogueItemId: catItem.id,
        productName: catItem.productName,
        itemName: catItem.productName,
        isCustomItem: !catItem.productId,
        productSku: catItem.partNumber || catItem.supplierProductCode || '',
        description: catItem.description || catItem.productName,
        quantity: 1,
        unit: catItem.uom || 'Pcs',
        unitPrice: catItem.purchasePrice || 0,
        discountType: 'FIXED',
        discountValue: 0,
        taxRate: catItem.gstRate || 18,
      },
    ]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const handleAddCustomProductLine = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setItems((prev) => [
      ...prev,
      {
        productId: null,
        productName: trimmed,
        itemName: trimmed,
        isCustomItem: true,
        productSku: '',
        description: trimmed,
        quantity: 1,
        unit: 'Pcs',
        unitPrice: 0,
        discountType: 'FIXED',
        discountValue: 0,
        taxRate: 18,
      },
    ]);
    setProductSearch('');
    setShowProductDropdown(false);
  };

  const handleQuickProductCreated = (newProduct: Product) => {
    setProducts((prev) => [newProduct, ...prev]);
    handleAddProductLine(newProduct);
  };

  const handleUpdateLine = (index: number, field: keyof PurchaseOrderItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleRemoveLine = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTaxable = 0;
    let totalTax = 0;
    let grandTotal = 0;

    const calculatedItems = items.map((it) => {
      const qty = Math.max(0.001, Number(it.quantity) || 0);
      const rate = Math.max(0, Number(it.unitPrice) || 0);
      const lineSub = qty * rate;

      let discAmt = 0;
      if (it.discountType === 'PERCENTAGE') {
        discAmt = (lineSub * (Number(it.discountValue) || 0)) / 100;
      } else {
        discAmt = Number(it.discountValue) || 0;
      }
      discAmt = Math.min(lineSub, discAmt);

      const taxable = Math.max(0, lineSub - discAmt);
      const taxRate = Number(it.taxRate) || 0;
      const taxAmt = (taxable * taxRate) / 100;
      const lineTot = taxable + taxAmt;

      subtotal += lineSub;
      totalDiscount += discAmt;
      totalTaxable += taxable;
      totalTax += taxAmt;
      grandTotal += lineTot;

      return {
        ...it,
        lineSubtotal: lineSub,
        discountAmount: discAmt,
        taxAmount: taxAmt,
        lineTotal: lineTot,
      };
    });

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      totalTaxable: Math.round(totalTaxable * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      calculatedItems,
    };
  };

  const totals = calculateTotals();

  const handleSave = async (status: 'DRAFT' | 'SENT' = 'DRAFT') => {
    if (!supplierId || !supplierId.trim()) {
      showToast('Please select a supplier from the supplier list.', 'error');
      return;
    }

    if (items.length === 0) {
      showToast('Please add at least one product line item to the Purchase Order.', 'error');
      return;
    }

    if (expectedDeliveryDate && expectedDeliveryDate < poDate) {
      showToast('Expected delivery date cannot be earlier than PO date.', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload: Partial<PurchaseOrder> = {
        supplierId,
        poNumber,
        poDate,
        expectedDeliveryDate: expectedDeliveryDate || null,
        referenceNumber: referenceNumber || null,
        paymentTerms,
        status,
        notes,
        termsConditions,
        internalNotes,
      };

      const res = await purchaseOrderService.createPurchaseOrder(payload, items);
      if (res.error || !res.data) {
        showToast(res.error || 'Failed to save Purchase Order.', 'error');
        return;
      }

      showToast(`Purchase Order ${res.data.poNumber} saved successfully!`, 'success');
      onSuccess(res.data);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'An unexpected error occurred.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span>{initialPo ? `Edit Purchase Order — ${poNumber}` : 'Create Purchase Order'}</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Order inventory from suppliers. Creating a PO does NOT alter stock until goods are received.
              </p>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Section A & B: Supplier & PO Meta Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/70 dark:bg-slate-950/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
              {/* Supplier Autocomplete */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Supplier *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type to search supplier name, phone, GSTIN..."
                    value={supplierSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSupplierSearch(val);
                      setShowSupplierDropdown(true);
                      if (selectedSupplier && val !== selectedSupplier.name) {
                        setSelectedSupplier(null);
                        setSupplierId('');
                      }
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>

                {/* Autocomplete Dropdown */}
                {showSupplierDropdown && filteredSuppliers.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredSuppliers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectSupplier(s)}
                        className="w-full text-left p-3 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{s.name}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{s.phone || 'No Phone'}</p>
                        </div>
                        {s.gstin && (
                          <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                            {s.gstin}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedSupplier && (
                  <div className="mt-2 p-2.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800/50 text-xs">
                    <p className="font-bold text-blue-900 dark:text-blue-300">{selectedSupplier.name}</p>
                    <p className="text-[11px] text-blue-700 dark:text-blue-400">{selectedSupplier.address || 'No Address Provided'}</p>
                  </div>
                )}
              </div>

              {/* PO Information */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">PO Number *</label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">PO Date *</label>
                  <input
                    type="date"
                    value={poDate}
                    onChange={(e) => setPoDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Expected Delivery Date</label>
                  <input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                  >
                    <option value="Advance">Advance Payment</option>
                    <option value="Net 15 Days">Net 15 Days</option>
                    <option value="Net 30 Days">Net 30 Days</option>
                    <option value="Net 60 Days">Net 60 Days</option>
                    <option value="Due on Receipt">Due on Receipt</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section C: Product Autocomplete Line Items Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-500" />
                  <span>Line Items</span>
                </h3>

                {/* Product Autocomplete Search Bar */}
                <div className="relative w-80">
                  <input
                    type="text"
                    placeholder="Type product name/SKU to add..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />

                  {/* Autocomplete & Custom Actions Dropdown */}
                  {showProductDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-30 max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {/* Supplier Specific Catalogue Items */}
                      {supplierCatalogueItems.length > 0 && (
                        <div>
                          <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950 text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center justify-between">
                            <span>Supplier Catalogue ({selectedSupplier?.name || 'Supplier'})</span>
                            <span className="text-[9px] bg-blue-200 dark:bg-blue-800 px-1 py-0.2 rounded font-bold">
                              Supplier Prices
                            </span>
                          </div>
                          {supplierCatalogueItems.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => handleAddCatalogueItemLine(cat)}
                              className="w-full text-left p-2.5 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer border-b border-slate-100 dark:border-slate-800/60"
                            >
                              <div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <span>{cat.productName}</span>
                                  {!cat.productId && (
                                    <span className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold px-1 rounded">
                                      Unlinked
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10px] text-slate-500 font-mono">
                                  Part No: {cat.partNumber || cat.supplierProductCode || 'N/A'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {cat.purchasePrice !== null && cat.purchasePrice !== undefined
                                    ? `₹${cat.purchasePrice.toFixed(2)}`
                                    : 'Rate N/A'}
                                </p>
                                <p className="text-[10px] font-mono text-slate-500">
                                  GST: {cat.gstRate || 18}% | {cat.uom || 'Pcs'}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {filteredProducts.length > 0 && (
                        <div>
                          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            VISTAAR Inventory Products ({filteredProducts.length})
                          </div>
                          {filteredProducts.map((p) => {
                            const stock = p.currentStock ?? 0;
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleAddProductLine(p)}
                                className="w-full text-left p-2.5 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer"
                              >
                                <div>
                                  <p className="text-xs font-bold text-slate-900 dark:text-white">{p.name}</p>
                                  <p className="text-[10px] text-slate-500 font-mono">SKU: {p.sku || p.partNumber || 'N/A'}</p>
                                </div>
                                <div className="text-right">
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      stock > 0
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                    }`}
                                  >
                                    Stock: {stock}
                                  </span>
                                  <p className="text-[10px] font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                                    Rate: ₹{p.buyPrice ?? 0}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {filteredProducts.length === 0 && productSearch.trim().length > 0 && (
                        <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                          No existing product found matching "{productSearch.trim()}".
                        </div>
                      )}

                      {/* Custom & Quick Add Actions */}
                      {productSearch.trim().length > 0 && (
                        <div className="p-2 bg-slate-50 dark:bg-slate-950/80 space-y-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setShowProductDropdown(false);
                              setIsQuickAddModalOpen(true);
                            }}
                            className="w-full text-left p-2 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add "{productSearch.trim()}" to Catalogue</span>
                            </span>
                            <span className="text-[10px] bg-blue-200 dark:bg-blue-800 px-1.5 py-0.5 rounded">
                              + Add New Product
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAddCustomProductLine(productSearch.trim())}
                            className="w-full text-left p-2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold flex items-center justify-between transition-colors cursor-pointer"
                          >
                            <span className="flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5" />
                              <span>Use "{productSearch.trim()}" as Custom Item</span>
                            </span>
                            <span className="text-[10px] bg-purple-200 dark:bg-purple-800 px-1.5 py-0.5 rounded">
                              Custom Line Item
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      <th className="p-3">Product</th>
                      <th className="p-3 w-24 text-right">Qty</th>
                      <th className="p-3 w-20">Unit</th>
                      <th className="p-3 w-32 text-right">Purchase Rate (₹)</th>
                      <th className="p-3 w-24 text-right">Disc (₹)</th>
                      <th className="p-3 w-20 text-right">GST %</th>
                      <th className="p-3 w-32 text-right">Line Total (₹)</th>
                      <th className="p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {totals.calculatedItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          No product lines added yet. Search and select products above to build your order.
                        </td>
                      </tr>
                    ) : (
                      totals.calculatedItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-slate-900 dark:text-white">{item.productName}</p>
                              {!item.productId && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[10px] font-bold rounded">
                                  Custom Item
                                </span>
                              )}
                            </div>
                            <input
                              type="text"
                              placeholder="Line note/description..."
                              value={item.description || ''}
                              onChange={(e) => handleUpdateLine(idx, 'description', e.target.value)}
                              className="mt-1 w-full text-[11px] px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:outline-none"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => handleUpdateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full text-right px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono font-bold"
                            />
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.unit || 'Pcs'}
                              onChange={(e) => handleUpdateLine(idx, 'unit', e.target.value)}
                              className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-center"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.unitPrice}
                              onChange={(e) => handleUpdateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="w-full text-right px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.discountValue || 0}
                              onChange={(e) => handleUpdateLine(idx, 'discountValue', parseFloat(e.target.value) || 0)}
                              className="w-full text-right px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono text-slate-600"
                            />
                          </td>
                          <td className="p-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.taxRate || 0}
                              onChange={(e) => handleUpdateLine(idx, 'taxRate', parseFloat(e.target.value) || 0)}
                              className="w-full text-right px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono"
                            />
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            ₹{(item.lineTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="text-rose-500 hover:text-rose-700 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section D & E: Notes & Financial Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Supplier Notes (Visible on Print)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Special instructions for supplier..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Internal Notes (Hidden from Supplier)
                  </label>
                  <textarea
                    rows={2}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Internal audit notes, budget references..."
                    className="w-full px-3 py-2 bg-amber-50/50 dark:bg-slate-950/80 border border-amber-200 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Totals Summary */}
              <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal:</span>
                  <span>₹{totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Discount:</span>
                  <span>-₹{totals.totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Taxable Value:</span>
                  <span>₹{totals.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>GST Tax Total:</span>
                  <span>₹{totals.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="border-t border-slate-300 dark:border-slate-700 pt-2 flex justify-between font-black text-sm text-slate-900 dark:text-white">
                  <span>GRAND TOTAL:</span>
                  <span className="text-base text-blue-600 dark:text-blue-400">
                    ₹{totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSave('DRAFT')}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save Draft</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleSave('SENT')}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                <span>Save & Issue PO</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Product Modal */}
      <QuickAddProductModal
        isOpen={isQuickAddModalOpen}
        onClose={() => setIsQuickAddModalOpen(false)}
        initialName={productSearch.trim()}
        onSuccess={handleQuickProductCreated}
      />
    </>
  );
};
