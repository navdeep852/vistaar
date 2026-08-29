import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Calendar,
  User,
  Phone,
  FileText,
  Trash2,
  Eye,
  X,
  DollarSign,
  Boxes,
  ArrowRight,
  RefreshCw,
  Ban,
  Tag,
  Save,
  ArrowLeft,
  Info,
  Check,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { counterSaleService, productService, customerService, inventoryService } from '../services/supabase';
import {
  CounterSale,
  CounterSaleItem,
  Product,
  Customer,
  StockMovement,
} from '../types';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';
import { DedicatedWorkspace } from '../components/DedicatedWorkspace';
import { PhoneInput } from '../components/PhoneInput';
import { validateIndianPhoneNumber, isValidIndianPhoneNumber, normalizeIndianPhoneNumber, formatIndianPhoneNumber } from '../lib/phoneUtils';

type DateFilterType = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';

interface DraftSaleItem {
  productId: string;
  productName: string;
  partNumber: string;
  availableStock: number;
  minimumStock: number;
  quantity: number;
  rate: number;
  amount: number;
  unit: string;
}

interface CounterSaleViewProps {
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
}

export const CounterSaleView: React.FC<CounterSaleViewProps> = ({
  onNavigateTab,
  activeTab,
}) => {
  // Store Collections
  const [sales, setSales] = useState<CounterSale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [metrics, setMetrics] = useState({ todayTotal: 0, todayCount: 0, monthTotal: 0, netSales: 0, totalTransactions: 0, totalDiscounts: 0 });

  // View & Mode State
  const [isCreatingSale, setIsCreatingSale] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('ALL');

  // Workspace Modals state
  const [productSelectorOpen, setProductSelectorOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [stockMovementModalOpen, setStockMovementModalOpen] = useState(false);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);

  // Form State: New Counter Sale Workspace
  const [custName, setCustName] = useState('Walk-in Customer');
  const [custPhone, setCustPhone] = useState('');
  const [custPhoneError, setCustPhoneError] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [estimateRef, setEstimateRef] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Line Items State
  const [lineItems, setLineItems] = useState<DraftSaleItem[]>([]);
  const [productSearch, setProductSearch] = useState('');

  // Active Target Records
  const [createdSale, setCreatedSale] = useState<CounterSale | null>(null);
  const [activeSale, setActiveSale] = useState<CounterSale | null>(null);
  const [activeStockMovements, setActiveStockMovements] = useState<StockMovement[]>([]);

  const refreshData = async () => {
    const saleRes = await counterSaleService.getCounterSales();
    setSales(saleRes.data || []);
    const prodRes = await productService.getProducts();
    setProducts(prodRes.data || []);
    const custRes = await customerService.getCustomers();
    setCustomers(custRes.data || []);
    const m = await counterSaleService.getCounterSaleMetrics();
    setMetrics(m);
  };

  useEffect(() => {
    refreshData();
  }, []);

  // Format Helpers
  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Handlers: Open Full-Screen Counter Sale Workspace
  const handleOpenWorkspace = () => {
    setCustName('Walk-in Customer');
    setCustPhone('');
    setSelectedCustomerId('');
    setSaleDate(new Date().toISOString().split('T')[0]);
    setInvoiceNumber(counterSaleService.generateNextInvoiceNumber());
    setEstimateRef('');
    setDiscountType('fixed');
    setDiscountValue('');
    setNotes('');
    setLineItems([]);
    setIsCreatingSale(true);
  };

  // Handlers: Cancel / Close Workspace with Unsaved Check
  const handleCancelWorkspace = () => {
    const isFormModified =
      lineItems.length > 0 ||
      custName !== 'Walk-in Customer' ||
      custPhone !== '' ||
      estimateRef !== '' ||
      discountValue !== '' ||
      notes !== '';

    if (isFormModified) {
      setDiscardModalOpen(true);
    } else {
      setIsCreatingSale(false);
    }
  };

  // Handlers: Add Product to Line Items
  const handleSelectProduct = async (p: Product) => {
    const fetchedAvail = await productService.getProductAvailableStock(p.id);
    const avail = fetchedAvail > 0 ? fetchedAvail : Math.max(0, Number(p.currentStock) || 0);
    if (avail <= 0) {
      showToast(`"${p.name}" is currently OUT OF STOCK and cannot be added.`, 'error');
      return;
    }

    const defaultRate = p.currentSellPrice || p.sellingPrice;

    setLineItems((prev) => {
      const existingIdx = prev.findIndex((item) => item.productId === p.id);
      if (existingIdx > -1) {
        const updated = [...prev];
        const target = updated[existingIdx];
        const newQty = Math.min(target.quantity + 1, avail);
        updated[existingIdx] = {
          ...target,
          quantity: newQty,
          amount: newQty * target.rate,
        };
        showToast(`Increased quantity for ${p.name} to ${newQty}`, 'info');
        return updated;
      } else {
        return [
          ...prev,
          {
            productId: p.id,
            productName: p.productName || p.name,
            partNumber: p.partNumber || p.sku,
            availableStock: avail,
            minimumStock: p.minimumStockLevel !== undefined ? p.minimumStockLevel : p.minimumStock,
            quantity: 1,
            rate: defaultRate,
            amount: defaultRate,
            unit: p.unit || 'Pcs',
          },
        ];
      }
    });

    setProductSelectorOpen(false);
  };

  // Line Item Handlers
  const handleUpdateItemQuantity = (index: number, qtyVal: number) => {
    setLineItems((prev) => {
      const next = [...prev];
      const target = next[index];
      const validQty = isNaN(qtyVal) ? 0 : qtyVal;
      target.quantity = validQty;
      target.amount = validQty * target.rate;
      next[index] = target;
      return next;
    });
  };

  const handleUpdateItemRate = (index: number, rateVal: number) => {
    setLineItems((prev) => {
      const next = [...prev];
      const target = next[index];
      const validRate = isNaN(rateVal) || rateVal < 0 ? 0 : rateVal;
      target.rate = validRate;
      target.amount = target.quantity * validRate;
      next[index] = target;
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Calculations
  const subtotal = lineItems.reduce((acc, item) => acc + item.amount, 0);
  const rawDiscountVal = parseFloat(discountValue) || 0;
  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = (subtotal * rawDiscountVal) / 100;
  } else {
    discountAmount = rawDiscountVal;
  }
  const finalTotal = Math.max(0, subtotal - discountAmount);

  // Validation Check
  const validationErrors: string[] = [];
  if (!invoiceNumber.trim()) validationErrors.push('Invoice Number is required.');
  if (!counterSaleService.isInvoiceNumberUnique(invoiceNumber)) {
    validationErrors.push(`Invoice number "${invoiceNumber}" already exists.`);
  }
  if (lineItems.length === 0) validationErrors.push('Select at least one product for the sale.');

  lineItems.forEach((item) => {
    if (item.quantity <= 0) {
      validationErrors.push(`Quantity for "${item.productName}" must be greater than 0.`);
    }
    if (item.quantity > item.availableStock) {
      validationErrors.push(
        `Insufficient stock for "${item.productName}". Requested ${item.quantity}, but only ${item.availableStock} units are available.`
      );
    }
  });

  if (discountAmount > subtotal) {
    validationErrors.push(`Discount (${formatCurrency(discountAmount)}) cannot exceed Subtotal.`);
  }

  // Open Pre-Submission Review Modal
  const handleOpenReviewModal = () => {
    if (custPhone && !isValidIndianPhoneNumber(custPhone, false)) {
      setCustPhoneError('Enter a valid 10-digit mobile number starting with 6–9.');
      document.getElementById('counter-sale-phone')?.focus();
      return;
    } else {
      setCustPhoneError('');
    }

    if (validationErrors.length > 0) {
      showToast(validationErrors[0], 'error');
      return;
    }
    setReviewModalOpen(true);
  };

  // Execute Sale Submission
  const handleConfirmAndCompleteSale = async () => {
    try {
      const cleanPhone = custPhone ? normalizeIndianPhoneNumber(custPhone) : '';
      const res = await counterSaleService.createCounterSale({
        customerId: selectedCustomerId || undefined,
        customerName: custName,
        phoneNumber: cleanPhone,
        saleDate,
        invoiceNumber,
        estimateReference: estimateRef,
        discountType,
        discountValue: rawDiscountVal,
        discountAmount,
        subtotal,
        finalTotal,
        notes,
        items: lineItems.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          partNumber: i.partNumber,
          quantity: i.quantity,
          rate: i.rate,
        })),
      });

      if (!res.success) throw new Error(res.error || 'Failed to record sale');

      setCreatedSale(res.data);
      setReviewModalOpen(false);
      setIsCreatingSale(false);
      setSuccessModalOpen(true);
      showToast(`Counter Sale completed! Inventory stock updated.`, 'success');
      refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to complete counter sale', 'error');
    }
  };

  // Save Draft
  const handleSaveDraft = () => {
    if (lineItems.length === 0) {
      showToast('Add at least one item before saving draft', 'error');
      return;
    }
    showToast('Counter Sale saved as Draft (Inventory stock unaffected).', 'info');
    setIsCreatingSale(false);
  };

  // Cancel Completed Sale
  const handleCancelSale = async (saleId: string) => {
    const sale = sales.find((s) => s.id === saleId);
    if (!sale) return;
    if (!window.confirm(`Are you sure you want to cancel Sale ${sale.saleNumber || sale.id}? Stock will be restored to inventory.`)) {
      return;
    }

    try {
      await counterSaleService.cancelCounterSale(saleId);
      showToast(`Sale cancelled and stock restored to inventory!`, 'info');
      refreshData();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel sale', 'error');
    }
  };

  // View Sale Details
  const handleViewSaleDetails = (sale: CounterSale) => {
    setActiveSale(sale);
    setDetailsModalOpen(true);
  };

  // View Stock Movements
  const handleViewSaleStockMovements = async (sale: CounterSale) => {
    const movsRes = await inventoryService.getStockMovements();
    const movs = (movsRes.data || []).filter((m: any) => m.reference_id === sale.invoiceNumber || m.referenceId === sale.invoiceNumber);
    setActiveStockMovements(movs);
    setStockMovementModalOpen(true);
  };

  // Search & Filter Sales History
  const filteredSales = sales.filter((s) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateFilter === 'TODAY' && s.saleDate !== todayStr) return false;

    if (dateFilter === 'WEEK') {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
      if (s.saleDate < weekAgo) return false;
    }

    if (dateFilter === 'MONTH') {
      const currentMonth = todayStr.substring(0, 7);
      if (!s.saleDate.startsWith(currentMonth)) return false;
    }

    if (historySearch.trim()) {
      const q = historySearch.toLowerCase().trim();
      const matchCust = s.customerName.toLowerCase().includes(q);
      const matchPhone = (s.phoneNumber || '').toLowerCase().includes(q);
      const matchInv = s.invoiceNumber.toLowerCase().includes(q);
      const matchSaleNo = s.saleNumber.toLowerCase().includes(q);
      const matchRef = (s.estimateReference || '').toLowerCase().includes(q);
      const matchItem = s.items.some(
        (i) => i.productNameSnapshot.toLowerCase().includes(q) || i.partNumberSnapshot.toLowerCase().includes(q)
      );
      if (!matchCust && !matchPhone && !matchInv && !matchSaleNo && !matchRef && !matchItem) return false;
    }

    return true;
  });

  // Calculate current active step for visual progress indicator
  const calculateCurrentStep = () => {
    if (lineItems.length > 0) return 4;
    if (invoiceNumber) return 3;
    if (custName) return 2;
    return 1;
  };
  const activeStep = calculateCurrentStep();

  return (
    <>
      {/* ========================================================================= */}
      {/* MODE 1: FULL-SCREEN COUNTER SALE WORKSPACE (RESPONSIVE FIX) */}
      {/* ========================================================================= */}
      {isCreatingSale ? (
        <DedicatedWorkspace
          title="COUNTER SALE"
          subtitle="Create a new counter sale and update inventory automatically."
          badgeText="NEW COUNTER SALE"
          icon={ShoppingBag}
          onClose={handleCancelWorkspace}
          onNavigateTab={onNavigateTab}
          activeTab={activeTab || 'counter-sale'}
          headerActions={
            <button
              onClick={handleSaveDraft}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Save Draft</span>
            </button>
          }
        >
          {/* FORM PROGRESS INDICATOR BAR */}
          <div className="bg-slate-950 px-4 sm:px-8 py-2.5 border-b border-slate-800 text-xs font-bold flex items-center justify-between overflow-x-auto gap-4 w-full max-w-full min-w-0 box-border">
            <div className="flex items-center gap-2 text-slate-300 min-w-max">
              <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-black ${activeStep >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>1</span>
              <span className={activeStep >= 1 ? 'text-white font-bold' : 'text-slate-500'}>1. Customer Information</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <div className="flex items-center gap-2 text-slate-300 min-w-max">
              <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-black ${activeStep >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>2</span>
              <span className={activeStep >= 2 ? 'text-white font-bold' : 'text-slate-500'}>2. Sale Information</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <div className="flex items-center gap-2 text-slate-300 min-w-max">
              <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-black ${activeStep >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>3</span>
              <span className={activeStep >= 3 ? 'text-white font-bold' : 'text-slate-500'}>3. Products & Stock</span>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <div className="flex items-center gap-2 text-slate-300 min-w-max">
              <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-black ${activeStep >= 4 ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>4</span>
              <span className={activeStep >= 4 ? 'text-white font-bold' : 'text-slate-500'}>4. Discount & Summary</span>
            </div>
          </div>

          {/* MAIN FULL-WIDTH WORKSPACE CONTAINER */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-full mx-auto space-y-6 pb-24 lg:pb-8 min-w-0 box-border">
            {/* SECTION 1: CUSTOMER INFORMATION */}
            <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 w-full min-w-0 transition-colors">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="w-7 h-7 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                  1
                </div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">1. Customer Information</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs w-full min-w-0">
                {/* Customer Name */}
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Walk-in Customer"
                    className="w-full min-w-0 box-border px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block">Default: Walk-in Customer</span>
                </div>

                <PhoneInput
                  id="counter-sale-phone"
                  label="Phone Number (Optional)"
                  value={custPhone}
                  onChange={(val) => {
                    setCustPhone(val);
                    if (custPhoneError) setCustPhoneError('');
                  }}
                  error={custPhoneError}
                  placeholder="9876543210"
                />
              </div>
            </div>

            {/* SECTION 2: SALE INFORMATION */}
            <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 w-full min-w-0 transition-colors">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="w-7 h-7 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                  2
                </div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">2. Sale Information</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs w-full min-w-0">
                {/* Sale Date */}
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Sale Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full min-w-0 box-border px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                {/* Invoice Number */}
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-2026-00105"
                    className="w-full min-w-0 box-border px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-blue-600 dark:text-blue-400 focus:outline-none"
                  />
                </div>

                {/* Estimate / Reference */}
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Estimate / Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={estimateRef}
                    onChange={(e) => setEstimateRef(e.target.value)}
                    placeholder="e.g. EST-0012 or Quotation #Q-2026-001"
                    className="w-full min-w-0 box-border px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* Notes */}
                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Transaction Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Internal remarks..."
                    className="w-full min-w-0 box-border px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: PRODUCTS & ITEMS */}
            <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card space-y-4 w-full min-w-0 transition-colors">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                    3
                  </div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">3. Products & Stock</h2>
                </div>

                <button
                  type="button"
                  onClick={() => setProductSelectorOpen(true)}
                  className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs inline-flex items-center gap-2 shadow-md shadow-indigo-600/20 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>+ Add Product from Inventory</span>
                </button>
              </div>

              {/* Validation Warning Inline if no products selected */}
              {lineItems.length === 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 rounded-2xl text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Select at least one product for the sale.</span>
                </div>
              )}

              {/* Line Items List */}
              {lineItems.length === 0 ? (
                <div className="p-10 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl text-center space-y-3 bg-slate-50/50 dark:bg-slate-800/20 w-full min-w-0">
                  <Boxes className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                  <div>
                    <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300">No Products Selected</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      Click the <strong>+ Add Product from Inventory</strong> button above to add products.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 w-full min-w-0">
                  {/* DESKTOP TABLE VIEW */}
                  <div className="hidden md:block overflow-x-auto w-full min-w-0">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          <th className="p-3 min-w-[200px]">Product Name</th>
                          <th className="p-3 min-w-[130px]">Part Number</th>
                          <th className="p-3 min-w-[110px]">Available Stock</th>
                          <th className="p-3 w-28 text-center">Quantity</th>
                          <th className="p-3 w-32 text-right">Unit Price</th>
                          <th className="p-3 w-32 text-right">Total</th>
                          <th className="p-3 w-16 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {lineItems.map((item, idx) => {
                          const isOverStock = item.quantity > item.availableStock;
                          const remainingAfterSale = item.availableStock - item.quantity;
                          const isLowAfterSale = remainingAfterSale <= item.minimumStock && !isOverStock;

                          return (
                            <tr key={item.productId} className={isOverStock ? 'bg-rose-50/60 dark:bg-rose-950/40' : isLowAfterSale ? 'bg-amber-50/40 dark:bg-amber-950/30' : ''}>
                              <td className="p-3">
                                <span className="font-extrabold text-slate-900 dark:text-slate-100 block">{item.productName}</span>
                                {isOverStock && (
                                  <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold block mt-0.5">
                                    ⚠️ Insufficient stock! Only {item.availableStock} available.
                                  </span>
                                )}
                                {isLowAfterSale && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block mt-0.5">
                                    ⚠️ Only {remainingAfterSale} will remain after sale.
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{item.partNumber}</td>
                              <td className="p-3 font-bold text-slate-700 dark:text-slate-300">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${isOverStock ? 'bg-rose-200 dark:bg-rose-950 text-rose-900 dark:text-rose-200' : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'}`}>
                                  {item.availableStock} {item.unit}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  max={item.availableStock}
                                  required
                                  value={item.quantity || ''}
                                  onChange={(e) => handleUpdateItemQuantity(idx, parseInt(e.target.value) || 0)}
                                  className="w-20 px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-sm font-black text-slate-900 dark:text-slate-100 text-center focus:outline-none focus:border-blue-500"
                                />
                              </td>
                              <td className="p-3 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  required
                                  value={item.rate}
                                  onChange={(e) => handleUpdateItemRate(idx, parseFloat(e.target.value) || 0)}
                                  className="w-28 px-2 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 text-right focus:outline-none focus:border-blue-500"
                                />
                              </td>
                              <td className="p-3 text-right font-black text-slate-900 dark:text-slate-100 text-sm">
                                {formatCurrency(item.amount)}
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="p-1.5 text-rose-500 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                                  title="Remove Product"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* MOBILE CARDS VIEW */}
                  <div className="block md:hidden space-y-3 w-full min-w-0">
                    {lineItems.map((item, idx) => {
                      const isOverStock = item.quantity > item.availableStock;
                      return (
                        <div key={item.productId} className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs w-full min-w-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">{item.productName}</h4>
                              <span className="font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">Part #: {item.partNumber}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                              Avail: {item.availableStock} {item.unit}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-1">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Quantity</label>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity || ''}
                                onChange={(e) => handleUpdateItemQuantity(idx, parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-black text-center text-slate-900 dark:text-slate-100"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Selling Rate</label>
                              <input
                                type="number"
                                value={item.rate}
                                onChange={(e) => handleUpdateItemRate(idx, parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-bold text-right text-slate-900 dark:text-slate-100"
                              />
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                            <span className="font-black text-slate-900 dark:text-slate-100 text-sm">Amount: {formatCurrency(item.amount)}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-xl font-bold text-xs cursor-pointer"
                            >
                              Remove Product
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 4: DISCOUNT & SUMMARY */}
            <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card space-y-6 w-full min-w-0 transition-colors">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="w-7 h-7 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-xs shrink-0">
                  4
                </div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">4. Discount & Summary</h2>
              </div>

              {/* DISCOUNT INPUTS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs w-full min-w-0">
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Discount Type
                  </span>
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-800 w-full min-w-0">
                    <button
                      type="button"
                      onClick={() => setDiscountType('fixed')}
                      className={`flex-1 py-2 rounded-lg font-bold transition-all text-xs cursor-pointer ${
                        discountType === 'fixed'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      ₹ Fixed Amount
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType('percentage')}
                      className={`flex-1 py-2 rounded-lg font-bold transition-all text-xs cursor-pointer ${
                        discountType === 'percentage'
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      % Percentage
                    </button>
                  </div>
                </div>

                <div className="min-w-0">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Discount Value
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'fixed' ? 'e.g. 500' : 'e.g. 10'}
                    className="w-full min-w-0 box-border px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* BOTTOM TOTALS BREAKDOWN AND COMPLETE SALE ACTION */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 w-full min-w-0">
                {/* Validation errors inline notice if any */}
                <div className="flex-1 w-full min-w-0 space-y-3">
                  {validationErrors.length > 0 ? (
                    <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold space-y-1.5 w-full">
                      <span className="font-bold flex items-center gap-1.5 text-rose-900 dark:text-rose-100 text-sm">
                        <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                        Please fix before completing:
                      </span>
                      <p className="text-xs text-rose-700 dark:text-rose-300 pl-5.5">{validationErrors[0]}</p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs space-y-1">
                      <span className="font-bold flex items-center gap-1.5 text-emerald-900 dark:text-emerald-100">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        Ready to Complete
                      </span>
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        Stock balances will be automatically updated in inventory upon sale completion.
                      </p>
                    </div>
                  )}
                </div>

                {/* Right-aligned Totals Summary Card & Action Button */}
                <div className="w-full md:w-80 space-y-4 shrink-0">
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Total Line Items:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{lineItems.length} Products</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Subtotal:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Discount:</span>
                      <span className="font-bold">-{formatCurrency(discountAmount)}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                      <span className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">FINAL TOTAL:</span>
                      <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(finalTotal)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={validationErrors.length > 0}
                    onClick={handleOpenReviewModal}
                    className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-sm shadow-xl shadow-emerald-600/30 disabled:opacity-50 transition-all transform hover:-translate-y-0.5 cursor-pointer text-center flex items-center justify-center gap-2"
                  >
                    <span>REVIEW & COMPLETE SALE</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* MOBILE STICKY BOTTOM ACTION BAR */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-4 border-t border-slate-800 z-40 flex items-center justify-between shadow-2xl">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Final Total</span>
              <span className="text-xl font-black text-emerald-400">{formatCurrency(finalTotal)}</span>
            </div>
            <button
              type="button"
              disabled={validationErrors.length > 0}
              onClick={handleOpenReviewModal}
              className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md disabled:opacity-50"
            >
              Review & Complete Sale
            </button>
          </div>
        </DedicatedWorkspace>
      ) : (
        /* ========================================================================= */
        /* MODE 2: MAIN COUNTER SALE LANDING PAGE & SALES HISTORY */
        /* ========================================================================= */
        <div className="space-y-6 animate-fade-in pb-16">
          {/* HERO HEADER */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 p-6 rounded-3xl text-white shadow-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest">
                <ShoppingBag className="w-4 h-4" />
                <span>Direct Counter Point of Sale</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
                Counter Sale
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                Record sales made directly at the counter and automatically update inventory stock balances.
              </p>
            </div>

            <button
              onClick={handleOpenWorkspace}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm shadow-lg shadow-amber-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <Plus className="w-5 h-5 stroke-[3]" />
              <span>+ New Counter Sale</span>
            </button>
          </div>

          {/* SALES SUMMARY METRICS CARDS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Today's Sales
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <h3 className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(metrics.todayTotal)}
                </h3>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 block">
                  {metrics.todayCount} transactions today
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  This Month's Sales
                </span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <h3 className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400">
                  {formatCurrency(metrics.monthTotal)}
                </h3>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 block">
                  Current billing month
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Net Sales Value
                </span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <h3 className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(metrics.netSales)}
                </h3>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 block">
                  {metrics.totalTransactions} completed sales
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Discounts Given
                </span>
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <Tag className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-3">
                <h3 className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400">
                  {formatCurrency(metrics.totalDiscounts)}
                </h3>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 block">
                  Total sales discount value
                </span>
              </div>
            </div>
          </div>

          {/* ALL SALES HISTORY TABLE & SEARCH */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden space-y-4 p-5 transition-colors">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">All Sales History</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Historical records of completed counter sales</p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <div className="relative min-w-[240px] flex-1 sm:flex-none">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Search Customer, Phone, Invoice #..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                </div>

                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => setDateFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${dateFilter === 'ALL' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setDateFilter('TODAY')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${dateFilter === 'TODAY' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setDateFilter('WEEK')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${dateFilter === 'WEEK' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    This Week
                  </button>
                  <button
                    onClick={() => setDateFilter('MONTH')}
                    className={`px-3 py-1.5 rounded-lg transition-colors ${dateFilter === 'MONTH' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                  >
                    This Month
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Sale #</th>
                    <th className="p-3.5">Invoice #</th>
                    <th className="p-3.5">Customer Name</th>
                    <th className="p-3.5">Phone</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5 text-center">Items</th>
                    <th className="p-3.5 text-right">Subtotal</th>
                    <th className="p-3.5 text-right">Discount</th>
                    <th className="p-3.5 text-right">Final Total</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400 dark:text-slate-500">
                        No counter sales recorded yet. Click <strong>+ New Counter Sale</strong> to open the full-screen workspace!
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3.5 font-mono font-bold text-blue-600 dark:text-blue-400">{s.saleNumber}</td>
                        <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-slate-100">{s.invoiceNumber}</td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">{s.customerName}</td>
                        <td className="p-3.5 text-slate-500 dark:text-slate-400">{s.phoneNumber || '-'}</td>
                        <td className="p-3.5 text-slate-600 dark:text-slate-300">{formatDate(s.saleDate)}</td>
                        <td className="p-3.5 text-center font-bold text-slate-700 dark:text-slate-300">{s.items.length}</td>
                        <td className="p-3.5 text-right font-medium text-slate-600 dark:text-slate-300">{formatCurrency(s.subtotal)}</td>
                        <td className="p-3.5 text-right font-medium text-amber-600 dark:text-amber-400">
                          {s.discountAmount > 0 ? `-${formatCurrency(s.discountAmount)}` : '-'}
                        </td>
                        <td className="p-3.5 text-right font-black text-emerald-600 dark:text-emerald-400 text-sm">
                          {formatCurrency(s.finalTotal)}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              s.status === 'COMPLETED' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleViewSaleDetails(s)}
                              className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 font-bold text-xs transition-colors flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Details</span>
                            </button>
                            {s.status === 'COMPLETED' && (
                              <button
                                onClick={() => handleCancelSale(s.id)}
                                className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-600 dark:text-rose-300 transition-colors"
                                title="Cancel Sale & Revert Stock"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="block md:hidden space-y-3">
              {filteredSales.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No sales found.</p>
              ) : (
                filteredSales.map((s) => (
                  <div key={s.id} className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{s.saleNumber}</span>
                        <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{s.customerName}</h4>
                        {s.phoneNumber && <p className="text-slate-500 dark:text-slate-400">{s.phoneNumber}</p>}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                          s.status === 'COMPLETED' ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
                      <span>Invoice: <strong className="text-slate-900 dark:text-slate-100">{s.invoiceNumber}</strong></span>
                      <span>Date: {formatDate(s.saleDate)}</span>
                    </div>

                    <div className="flex justify-between items-center pt-1">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{s.items.length} Item(s)</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(s.finalTotal)}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleViewSaleDetails(s)}
                        className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold text-center text-xs"
                      >
                        View Details
                      </button>
                      {s.status === 'COMPLETED' && (
                        <button
                          onClick={() => handleCancelSale(s.id)}
                          className="py-2 px-3 rounded-xl bg-rose-50 text-rose-600 font-bold text-xs"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- ALL SHARED MODALS --- */}

      {/* 1. SEARCHABLE PRODUCT SELECTOR MODAL */}
      <Modal
        isOpen={productSelectorOpen}
        onClose={() => setProductSelectorOpen(false)}
        title="Select Product from Inventory"
        maxWidth="4xl"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search by Part Number, Product Name, Code or SKU..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2 border border-slate-100 dark:border-slate-800 rounded-2xl p-2 bg-slate-50/50 dark:bg-slate-900/50">
            {products
              .filter((p) => {
                if (!productSearch.trim()) return true;
                const q = productSearch.toLowerCase().trim();
                return (
                  (p.productName || p.name).toLowerCase().includes(q) ||
                  (p.partNumber || '').toLowerCase().includes(q) ||
                  (p.productCode || '').toLowerCase().includes(q) ||
                  p.sku.toLowerCase().includes(q)
                );
              })
              .map((p) => {
                const avail = p.currentStock || 0;
                const isOut = avail <= 0;
                const rate = p.currentSellPrice || p.sellingPrice;

                return (
                  <div
                    key={p.id}
                    onClick={() => !isOut && handleSelectProduct(p)}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isOut
                        ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 opacity-60 cursor-not-allowed'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <div>
                      <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-xs">{p.productName || p.name}</h4>
                      <p className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                        Part #: {p.partNumber || p.sku}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase">Available</span>
                        <span className={`font-black text-xs ${isOut ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {avail} {p.unit}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block uppercase">Sell Rate</span>
                        <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs">
                          {formatCurrency(rate)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </Modal>

      {/* 2. PRE-SUBMISSION REVIEW MODAL */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title="Review Counter Sale"
        maxWidth="4xl"
      >
        <div className="space-y-4 py-1 text-xs">
          <div className="bg-amber-50 dark:bg-amber-950/60 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 space-y-1">
            <h4 className="font-extrabold text-sm">Final Review Before Financial Confirmation</h4>
            <p className="text-xs">
              Once confirmed, this sale will be recorded and inventory stock will be reduced.
            </p>
          </div>

          <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Customer:</span>
              <span className="font-black text-slate-900 dark:text-slate-100">{custName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Invoice Number:</span>
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Sale Date:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{formatDate(saleDate)}</span>
            </div>
          </div>

          {/* Stock Impact Summary */}
          <div className="space-y-2">
            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase block">Stock After Sale Breakdown:</span>
            {lineItems.map((item) => (
              <div key={item.productId} className="flex justify-between items-center p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{item.productName}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-mono">Part #: {item.partNumber}</span>
                </div>
                <div className="text-right">
                  <span className="font-black text-rose-600 dark:text-rose-400">-{item.quantity} {item.unit}</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">
                    ({item.availableStock - item.quantity} units remaining)
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold block">Final Amount</span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(finalTotal)}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300"
              >
                Back & Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmAndCompleteSale}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                CONFIRM & COMPLETE SALE
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* 3. SUCCESS CONFIRMATION MODAL */}
      {createdSale && (
        <Modal
          isOpen={successModalOpen}
          onClose={() => setSuccessModalOpen(false)}
          title="✓ SALE COMPLETED"
          maxWidth="md"
        >
          <div className="text-center space-y-4 py-2">
            <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">✓ SALE COMPLETED</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Counter Sale: <strong className="text-blue-600 dark:text-blue-400 font-mono">{createdSale.saleNumber}</strong> • Invoice: <strong className="text-slate-900 dark:text-slate-100 font-mono">{createdSale.invoiceNumber}</strong>
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-left text-xs">
              <span className="font-extrabold text-slate-800 dark:text-slate-200 uppercase block text-[10px]">
                Inventory Stock Updated:
              </span>
              {createdSale.items.map((item) => {
                const p = products.find((prod) => prod.id === item.productId);
                const availNow = p ? p.currentStock : 0;
                return (
                  <div key={item.id} className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{item.productNameSnapshot}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-mono">Part #: {item.partNumberSnapshot}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-rose-600 dark:text-rose-400">Sold: {item.quantity}</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 block text-xs">
                        {availNow} units remaining
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSuccessModalOpen(false);
                  handleOpenWorkspace();
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400"
              >
                + New Counter Sale
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuccessModalOpen(false);
                  handleViewSaleDetails(createdSale);
                }}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-500"
              >
                View Sale Details
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 4. DISCARD UNSAVED SALE MODAL */}
      <Modal
        isOpen={discardModalOpen}
        onClose={() => setDiscardModalOpen(false)}
        title="Discard Counter Sale?"
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300">
            You have unsaved changes in this Counter Sale workspace. Are you sure you want to discard this transaction?
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setDiscardModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold"
            >
              Continue Editing
            </button>
            <button
              onClick={() => {
                setDiscardModalOpen(false);
                setIsCreatingSale(false);
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
            >
              Discard Sale
            </button>
          </div>
        </div>
      </Modal>

      {/* 5. SALE DETAILS MODAL */}
      {activeSale && (
        <Modal
          isOpen={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          title={`Sale Details — ${activeSale.saleNumber}`}
          maxWidth="lg"
        >
          <div className="space-y-5 text-xs">
            <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] text-amber-400 font-mono font-bold uppercase">
                    Invoice #: {activeSale.invoiceNumber}
                  </span>
                  <h3 className="text-lg font-black text-white mt-0.5">{activeSale.customerName}</h3>
                  {activeSale.phoneNumber && <p className="text-xs text-slate-400">Phone: {activeSale.phoneNumber}</p>}
                </div>

                <div className="text-right">
                  <span className="text-2xl font-black text-emerald-400">
                    {formatCurrency(activeSale.finalTotal)}
                  </span>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    {activeSale.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Sale Date</span>
                  <span className="font-bold text-white">{formatDate(activeSale.saleDate)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Reference</span>
                  <span className="font-bold text-white">{activeSale.estimateReference || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase">Discount</span>
                  <span className="font-bold text-amber-400">{formatCurrency(activeSale.discountAmount)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
                Items Purchased ({activeSale.items.length})
              </h4>
              <div className="space-y-2">
                {activeSale.items.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <div>
                      <h5 className="font-extrabold text-slate-900 dark:text-slate-100">{item.productNameSnapshot}</h5>
                      <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-bold">
                        Part #: {item.partNumberSnapshot}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-slate-800 dark:text-slate-200">{item.quantity} x {formatCurrency(item.rate)}</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 block text-xs">{formatCurrency(item.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => {
                  setDetailsModalOpen(false);
                  handleViewSaleStockMovements(activeSale);
                }}
                className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/60 inline-flex items-center gap-1.5"
              >
                <Boxes className="w-4 h-4" />
                <span>View Stock Movement Log</span>
              </button>

              <button
                onClick={() => setDetailsModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 6. STOCK MOVEMENT LOG MODAL */}
      <Modal
        isOpen={stockMovementModalOpen}
        onClose={() => setStockMovementModalOpen(false)}
        title="Inventory Stock Movement Log"
        maxWidth="md"
      >
        <div className="space-y-3 text-xs">
          <div className="bg-indigo-50 dark:bg-indigo-950/60 p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/60 text-indigo-900 dark:text-indigo-200">
            <span className="font-bold block">Audit Trail Entries Created for Sale</span>
            <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5">
              These movements reduced active stock receipt balances in inventory.
            </p>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {activeStockMovements.length === 0 ? (
              <p className="text-slate-400 dark:text-slate-500 text-center py-4">No stock movements found.</p>
            ) : (
              activeStockMovements.map((m) => {
                const p = products.find((prod) => prod.id === m.productId);
                return (
                  <div key={m.id} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{p?.name || 'Product'}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block font-mono">
                        Ref: {m.referenceId} • Type: {m.type}
                      </span>
                    </div>
                    <span className="font-black text-rose-600 dark:text-rose-400 text-sm">{m.quantity} Units</span>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setStockMovementModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
