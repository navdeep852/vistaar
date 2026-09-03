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
  Lock,
  ShieldAlert,
  Key,
  Check,
} from 'lucide-react';
import { Supplier, Product, PurchaseOrder, PurchaseOrderItem, SupplierCatalogueItem } from '../../types';
import { purchaseOrderService, customerService, productService, supplierCatalogueService } from '../../services/supabase';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../../services/supabaseAuth';
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

  // User Role Check
  const currentUser = supabaseAuthService.getUser();
  const userRole = (currentUser?.role || 'employee').toLowerCase();
  const isAuthorizedRole = ['owner', 'admin', 'manager'].includes(userRole);

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

  // Price Override Modal State
  const [overrideModalIndex, setOverrideModalIndex] = useState<number | null>(null);
  const [overrideRateInput, setOverrideRateInput] = useState<string>('');
  const [overrideReasonInput, setOverrideReasonInput] = useState<string>('');

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
              supplierCatalogueItemId: it.supplierCatalogueItemId || null,
              catalogueUnitPrice: it.catalogueUnitPrice ?? it.unitPrice,
              isPriceOverridden: it.isPriceOverridden || false,
              overrideReason: it.overrideReason || null,
              overrideRequestedBy: it.overrideRequestedBy || null,
              overrideApprovedBy: it.overrideApprovedBy || null,
              overrideStatus: it.overrideStatus || 'NONE',
              productName: it.productName || it.itemName || it.description || 'Custom Item',
              itemName: it.itemName || it.productName || it.description || 'Custom Item',
              isCustomItem: !it.productId && !it.supplierCatalogueItemId,
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
          supplierCatalogueItemId: null,
          catalogueUnitPrice: purchasePrice,
          isPriceOverridden: false,
          overrideStatus: 'NONE',
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
    const rate = Number(catItem.purchasePrice || 0);
    setItems((prev) => [
      ...prev,
      {
        productId: catItem.productId || null,
        supplierCatalogueItemId: catItem.id,
        catalogueUnitPrice: rate,
        isPriceOverridden: false,
        overrideStatus: 'NONE',
        productName: catItem.productName,
        itemName: catItem.productName,
        isCustomItem: !catItem.productId,
        productSku: catItem.partNumber || catItem.supplierProductCode || '',
        description: catItem.description || catItem.productName,
        quantity: 1,
        unit: catItem.uom || 'Pcs',
        unitPrice: rate,
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
        supplierCatalogueItemId: null,
        catalogueUnitPrice: null,
        isPriceOverridden: false,
        overrideStatus: 'NONE',
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
    if (field === 'unitPrice') {
      const targetItem = items[index];
      if (targetItem?.supplierCatalogueItemId && !isAuthorizedRole && !targetItem.isPriceOverridden) {
        showToast(
          'Purchase rate is controlled by the supplier catalogue. Click "Request Override" to submit a negotiated price.',
          'info'
        );
        return;
      }
    }
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleRemoveLine = (index: number) => {
    setItems(items.filter((_, idx) => idx !== index));
  };

  const openOverrideModal = (idx: number) => {
    const item = items[idx];
    if (!item) return;
    setOverrideModalIndex(idx);
    setOverrideRateInput(String(item.unitPrice || item.catalogueUnitPrice || 0));
    setOverrideReasonInput(item.overrideReason || '');
  };

  const handleApplyOverride = async () => {
    if (overrideModalIndex === null) return;
    const item = items[overrideModalIndex];
    if (!item) return;

    const requestedRate = parseFloat(overrideRateInput);
    if (isNaN(requestedRate) || requestedRate < 0) {
      showToast('Please enter a valid purchase rate.', 'error');
      return;
    }

    if (!overrideReasonInput || !overrideReasonInput.trim()) {
      showToast('Please provide a justification reason for modifying the purchase rate.', 'error');
      return;
    }

    const updated = [...items];
    const catRate = item.catalogueUnitPrice ?? item.unitPrice ?? requestedRate;

    if (isAuthorizedRole) {
      updated[overrideModalIndex] = {
        ...item,
        unitPrice: requestedRate,
        catalogueUnitPrice: catRate,
        isPriceOverridden: Math.abs(requestedRate - catRate) > 0.001,
        overrideStatus: 'APPROVED',
        overrideReason: overrideReasonInput.trim(),
        overrideApprovedBy: currentUser?.id || 'manager',
      };
      showToast(`Purchase rate override to ₹${requestedRate.toFixed(2)} approved & applied!`, 'success');
    } else {
      updated[overrideModalIndex] = {
        ...item,
        unitPrice: requestedRate,
        catalogueUnitPrice: catRate,
        isPriceOverridden: true,
        overrideStatus: 'PENDING_APPROVAL',
        overrideReason: overrideReasonInput.trim(),
        overrideRequestedBy: currentUser?.id || 'buyer',
      };
      await purchaseOrderService.requestPriceOverride({
        supplierCatalogueItemId: item.supplierCatalogueItemId || undefined,
        itemName: item.productName || item.itemName || 'Line Item',
        originalRate: catRate,
        requestedRate,
        reason: overrideReasonInput.trim(),
      });
      showToast(`Purchase rate override request for ₹${requestedRate.toFixed(2)} submitted for authorization!`, 'info');
    }

    setItems(updated);
    setOverrideModalIndex(null);
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
        taxableAmount: taxable,
        taxAmount: taxAmt,
        lineTotal: lineTot,
      };
    });

    return {
      subtotal,
      totalDiscount,
      totalTaxable,
      totalTax,
      grandTotal,
      calculatedItems,
    };
  };

  const totals = calculateTotals();

  const handleSave = async (statusToSave: 'DRAFT' | 'SENT') => {
    if (!supplierId) {
      showToast('Please select a supplier from the list.', 'error');
      return;
    }

    if (items.length === 0) {
      showToast('Please add at least one line item to the Purchase Order.', 'error');
      return;
    }

    setLoading(true);
    try {
      const poPayload: Partial<PurchaseOrder> = {
        supplierId,
        supplierName: selectedSupplier?.name || supplierSearch,
        poNumber,
        poDate,
        expectedDeliveryDate: expectedDeliveryDate || null,
        referenceNumber: referenceNumber || null,
        paymentTerms,
        notes,
        termsConditions,
        internalNotes,
        status: statusToSave,
      };

      const result = initialPo?.id
        ? await purchaseOrderService.updatePurchaseOrder(initialPo.id, poPayload, items)
        : await purchaseOrderService.createPurchaseOrder(poPayload, items);

      if (result.error || !result.data) {
        showToast(result.error || 'Failed to save Purchase Order.', 'error');
        return;
      }

      showToast(
        statusToSave === 'DRAFT'
          ? `Purchase Order ${result.data.poNumber} saved as Draft!`
          : `Purchase Order ${result.data.poNumber} saved and marked as Issued!`,
        'success'
      );

      onSuccess(result.data);
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
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {initialPo ? 'Edit Purchase Order' : 'Create Purchase Order'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select supplier catalogue products with locked rates & purchase governance
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Top Form Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Supplier Selection */}
              <div className="relative md:col-span-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Supplier Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search supplier name or GSTIN..."
                    value={supplierSearch}
                    onChange={(e) => {
                      setSupplierSearch(e.target.value);
                      setShowSupplierDropdown(true);
                      if (selectedSupplier && e.target.value !== selectedSupplier.name) {
                        setSelectedSupplier(null);
                        setSupplierId('');
                      }
                    }}
                    onFocus={() => setShowSupplierDropdown(true)}
                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>

                {showSupplierDropdown && filteredSuppliers.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredSuppliers.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleSelectSupplier(s)}
                        className="w-full text-left p-2.5 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{s.name}</p>
                          <p className="text-[10px] text-slate-500">GSTIN: {s.gstin || 'N/A'}</p>
                        </div>
                        {s.phone && <span className="text-[10px] text-slate-400 font-mono">{s.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* PO Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  PO Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              {/* PO Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">PO Date</label>
                <input
                  type="date"
                  value={poDate}
                  onChange={(e) => setPoDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                />
              </div>

              {/* Expected Delivery Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Expected Delivery Date
                </label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                />
              </div>

              {/* Reference Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Quote / Ref Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. QT-2026-001"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                />
              </div>

              {/* Payment Terms */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Terms</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
                >
                  <option value="Immediate">Immediate / Advance</option>
                  <option value="Net 15 Days">Net 15 Days</option>
                  <option value="Net 30 Days">Net 30 Days</option>
                  <option value="Net 45 Days">Net 45 Days</option>
                  <option value="Net 60 Days">Net 60 Days</option>
                </select>
              </div>
            </div>

            {/* Line Items Section */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Order Line Items</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Add products from supplier catalogue or master inventory. Purchase rates are strictly locked to supplier terms.
                  </p>
                </div>
              </div>

              {/* Add Product Search Input */}
              <div className="relative">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={
                      selectedSupplier
                        ? `Search ${selectedSupplier.name} catalogue or master items...`
                        : 'Select a supplier above to search catalogue products...'
                    }
                    disabled={!selectedSupplier}
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>

                {/* Dropdown for Catalogue & Master Products */}
                {showProductDropdown && selectedSupplier && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {/* Supplier Catalogue Items */}
                    {supplierCatalogueItems.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 bg-blue-50/80 dark:bg-blue-950/80 text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center justify-between">
                          <span>Supplier Catalogue (Locked Purchase Rates)</span>
                          <span className="bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 px-1.5 py-0.2 rounded font-mono">
                            {supplierCatalogueItems.length} items
                          </span>
                        </div>
                        {supplierCatalogueItems.map((catItem) => (
                          <button
                            key={catItem.id}
                            type="button"
                            onClick={() => handleAddCatalogueItemLine(catItem)}
                            className="w-full text-left p-2.5 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-bold text-slate-900 dark:text-white">{catItem.productName}</p>
                                <span className="text-[9px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Catalogue
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 font-mono">
                                Code: {catItem.supplierProductCode || catItem.partNumber || 'N/A'} • UOM: {catItem.uom || 'Pcs'}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                ₹{catItem.purchasePrice?.toFixed(2) || '0.00'}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono">GST: {catItem.gstRate || 18}%</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Master Inventory Products */}
                    {filteredProducts.length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-950 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                          Master Inventory Products
                        </div>
                        {filteredProducts.map((p) => {
                          const stock = Number(p.currentStock ?? 0);
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

                    {filteredProducts.length === 0 && supplierCatalogueItems.length === 0 && productSearch.trim().length > 0 && (
                      <div className="p-3 text-center text-xs text-slate-500 dark:text-slate-400">
                        No catalogue or master products found matching "{productSearch.trim()}".
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

              {/* Line Items Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-950 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      <th className="p-3">Product / Item</th>
                      <th className="p-3 w-20 text-right">Qty</th>
                      <th className="p-3 w-16">Unit</th>
                      <th className="p-3 w-44 text-right">Purchase Rate (₹)</th>
                      <th className="p-3 w-20 text-right">Disc (₹)</th>
                      <th className="p-3 w-20 text-right">GST %</th>
                      <th className="p-3 w-28 text-right">Line Total (₹)</th>
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
                          {/* Item Description */}
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-slate-900 dark:text-white">{item.productName}</p>
                              {item.supplierCatalogueItemId ? (
                                <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[9px] font-bold rounded flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Supplier Catalogue
                                </span>
                              ) : item.isCustomItem ? (
                                <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[9px] font-bold rounded">
                                  Custom Item
                                </span>
                              ) : null}
                            </div>
                            <input
                              type="text"
                              placeholder="Line note/description..."
                              value={item.description || ''}
                              onChange={(e) => handleUpdateLine(idx, 'description', e.target.value)}
                              className="mt-1 w-full text-[11px] px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded focus:outline-none"
                            />
                          </td>

                          {/* Quantity */}
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

                          {/* Unit */}
                          <td className="p-3">
                            <input
                              type="text"
                              value={item.unit || 'Pcs'}
                              onChange={(e) => handleUpdateLine(idx, 'unit', e.target.value)}
                              className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded text-center text-xs"
                            />
                          </td>

                          {/* Purchase Rate Field (LOCKED FOR CATALOGUE ITEMS) */}
                          <td className="p-3 text-right">
                            {item.supplierCatalogueItemId ? (
                              <div className="flex flex-col items-end space-y-1">
                                <div className="relative flex items-center w-full justify-end">
                                  <input
                                    type="number"
                                    readOnly
                                    disabled
                                    value={item.unitPrice}
                                    onKeyDown={(e) => e.preventDefault()}
                                    onPaste={(e) => e.preventDefault()}
                                    onDrop={(e) => e.preventDefault()}
                                    className="w-28 text-right pr-6 py-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded font-mono text-slate-800 dark:text-slate-200 select-none cursor-not-allowed font-bold"
                                    title="Purchase rate is controlled by the supplier catalogue."
                                  />
                                  <Lock className="w-3.5 h-3.5 text-amber-500 absolute right-2 select-none pointer-events-none" />
                                </div>

                                {item.isPriceOverridden ? (
                                  <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                    Override ({item.overrideStatus})
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openOverrideModal(idx)}
                                    className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Key className="w-3 h-3" />
                                    <span>Request Override</span>
                                  </button>
                                )}
                              </div>
                            ) : item.isCustomItem ? (
                              <div className="flex flex-col items-end space-y-1">
                                {isAuthorizedRole || item.isPriceOverridden || item.overrideStatus === 'APPROVED' ? (
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={item.unitPrice}
                                    onChange={(e) => handleUpdateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                    className="w-28 text-right px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono font-bold"
                                  />
                                ) : (
                                  <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                      Auth Required
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => openOverrideModal(idx)}
                                      className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline mt-0.5 cursor-pointer"
                                    >
                                      Authorize Rate
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.unitPrice}
                                onChange={(e) => handleUpdateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                                className="w-28 text-right px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-mono"
                              />
                            )}
                          </td>

                          {/* Discount */}
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

                          {/* GST % */}
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

                          {/* Line Total */}
                          <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            ₹{(item.lineTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>

                          {/* Remove */}
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

              {/* Notes & Summary Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Notes for Supplier
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Delivery instructions, packing requirements..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Terms & Conditions
                    </label>
                    <textarea
                      rows={3}
                      value={termsConditions}
                      onChange={(e) => setTermsConditions(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-3">
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

        {/* Price Override Modal */}
        {overrideModalIndex !== null && items[overrideModalIndex] && (
          <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 rounded-xl">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {isAuthorizedRole ? 'Authorized Rate Override' : 'Request Price Override'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Supplier Rate Governance Control
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOverrideModalIndex(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <p className="font-bold text-slate-900 dark:text-white">{items[overrideModalIndex].productName}</p>
                  <p className="text-[11px] text-slate-500">
                    Official Catalogue Rate: <span className="font-mono font-bold text-emerald-600">₹{(items[overrideModalIndex].catalogueUnitPrice ?? items[overrideModalIndex].unitPrice ?? 0).toFixed(2)}</span>
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Requested Negotiated Rate (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={overrideRateInput}
                    onChange={(e) => setOverrideRateInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {items[overrideModalIndex].catalogueUnitPrice && (
                    <p className="text-[10px] font-mono text-slate-500 mt-1">
                      Variance: ₹{(parseFloat(overrideRateInput || '0') - Number(items[overrideModalIndex].catalogueUnitPrice)).toFixed(2)}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Justification Reason for Audit Trail <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Negotiated 5% volume discount directly with supplier management."
                    value={overrideReasonInput}
                    onChange={(e) => setOverrideReasonInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOverrideModalIndex(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyOverride}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isAuthorizedRole ? 'Approve & Apply Rate' : 'Submit Request'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
