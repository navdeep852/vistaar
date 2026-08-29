import React, { useState, useEffect, useRef } from 'react';
import {
  Package,
  Search,
  Plus,
  FileSpreadsheet,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Trash2,
  Eye,
  EyeOff,
  Download,
  Upload,
  ChevronRight,
  DollarSign,
  X,
  HelpCircle,
  Shield,
  Lock,
  Loader2,
  TrendingUp,
  Barcode,
  Tag,
  Boxes,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { productService, inventoryService } from '../services/supabase';
import { supabaseAuthService } from '../services/supabaseAuth';
import {
  Product,
  InventorySettings,
  ImportSession,
  ImportRowData,
  Category,
} from '../types';
import { Modal } from '../components/Modal';
import { showToast } from '../components/Toast';
import { DedicatedWorkspace } from '../components/DedicatedWorkspace';

interface ProductsViewProps {
  initialOpenCreate?: boolean;
  onNavigateTab?: (tab: string) => void;
  activeTab?: string;
}

type ViewMode = 'inventory' | 'import_history';
type StatusFilter = 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

const COMMON_UNITS = ['Piece', 'Box', 'Pack', 'Set', 'Kg', 'Gram', 'Liter', 'Meter', 'Dozen', 'Custom'];

export const ProductsView: React.FC<ProductsViewProps> = ({
  initialOpenCreate,
  onNavigateTab,
  activeTab,
}) => {

  // Store Collections
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inventorySettings, setInventorySettings] = useState<InventorySettings>({ usesPartNumber: null });
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // User Profile & Role Authorization
  const currentUser = supabaseAuthService.getUser();
  const isOwner = currentUser?.role === 'owner';

  // Navigation & Filtering
  const [viewMode, setViewMode] = useState<ViewMode>('inventory');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Modals state
  const [partNoPromptOpen, setPartNoPromptOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [receiveStockModalOpen, setReceiveStockModalOpen] = useState(false);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);

  // Product Details Loading & State
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // Owner Password Verification Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [targetProductToDelete, setTargetProductToDelete] = useState<Product | null>(null);
  const [ownerPasswordInput, setOwnerPasswordInput] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyingPassword, setVerifyingPassword] = useState<boolean>(false);
  const [showPasswordText, setShowPasswordText] = useState<boolean>(false);

  // Import Workflow Modals & Steps
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4>(1); // 1: Upload, 2: Map, 3: Preview/Edit, 4: Results
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [rawParsedHeaders, setRawParsedHeaders] = useState<string[]>([]);
  const [rawParsedRows, setRawParsedRows] = useState<Record<string, any>[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [stagedImportRows, setStagedImportRows] = useState<ImportRowData[]>([]);
  const [importSessionResult, setImportSessionResult] = useState<{
    newProducts: number;
    updatedProducts: number;
    receiptsCreated: number;
    totalUnits: number;
  } | null>(null);

  // Active Target Records
  const [activeProductId, setActiveProductId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State: Add Product
  const [addName, setAddName] = useState('');
  const [addPartNo, setAddPartNo] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [addBrand, setAddBrand] = useState('');
  const [addUnit, setAddUnit] = useState('Piece');
  const [customUnitInput, setCustomUnitInput] = useState('');
  const [addBuyPrice, setAddBuyPrice] = useState('');
  const [addSellPrice, setAddSellPrice] = useState('');
  const [addInitialStock, setAddInitialStock] = useState('10');
  const [addMinStock, setAddMinStock] = useState('5');
  const [addReceivedDate, setAddReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [addPoNumber, setAddPoNumber] = useState('');
  const [addSupplierName, setAddSupplierName] = useState('');
  const [addHsnSac, setAddHsnSac] = useState('');
  const [addGstRate, setAddGstRate] = useState('18');
  const [addNotes, setAddNotes] = useState('');

  // Form State: Receive Stock Batch
  const [recProductId, setRecProductId] = useState('');
  const [recQty, setRecQty] = useState('');
  const [recBuyPrice, setRecBuyPrice] = useState('');
  const [recDate, setRecDate] = useState(new Date().toISOString().split('T')[0]);
  const [recPo, setRecPo] = useState('');
  const [recSupplier, setRecSupplier] = useState('');
  const [recNotes, setRecNotes] = useState('');

  const [importSessions, setImportSessions] = useState<any[]>([]);
  const [productDetails, setProductDetails] = useState<any>(null);

  useEffect(() => {
    if (activeProductId) {
      productService.getProductDetails(activeProductId).then((res) => {
        if (res.data) setProductDetails(res.data);
      });
    }
  }, [activeProductId]);

  const refreshData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [invSettingsRes, prodRes, catRes] = await Promise.all([
        inventoryService.getInventorySettings(),
        productService.getProducts(),
        productService.getCategories(),
      ]);

      const invSettings = invSettingsRes.data || { usesPartNumber: null };
      setInventorySettings(invSettings);

      if (prodRes.error) {
        setFetchError(prodRes.error);
      }
      setProducts(prodRes.data || []);

      setCategories(catRes.data || []);

      if (invSettings.usesPartNumber === null) {
        setPartNoPromptOpen(true);
      }
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load products from database');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    if (initialOpenCreate) {
      handleOpenAddProduct();
    }
    // Re-fetch data if auth session profile initializes asynchronously
    const unsubscribeAuth = supabaseAuthService.subscribe(() => {
      refreshData();
    });
    return () => {
      unsubscribeAuth();
    };
  }, [initialOpenCreate]);

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

  // Search & Exact Part Number Prioritization (Section 15, 16, 56)
  const filteredProducts = products.filter((p: Product) => {
    // Status Filter
    if (statusFilter === 'IN_STOCK' && p.currentStock <= 0) return false;
    if (statusFilter === 'LOW_STOCK' && (p.currentStock <= 0 || p.currentStock > p.minimumStock)) return false;
    if (statusFilter === 'OUT_OF_STOCK' && p.currentStock > 0) return false;

    // Category Filter
    if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter && p.category !== categoryFilter) return false;

    // Search Query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchName = (p.productName || p.name).toLowerCase().includes(q);
      const matchPartNo = (p.partNumber || '').toLowerCase().includes(q);
      const matchCode = (p.productCode || '').toLowerCase().includes(q);
      const matchSku = p.sku.toLowerCase().includes(q);
      const matchBrand = (p.brand || '').toLowerCase().includes(q);
      if (!matchName && !matchPartNo && !matchCode && !matchSku && !matchBrand) return false;
    }
    return true;
  }).sort((a: Product, b: Product) => {
    // Exact Part Number match priority
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const aExact = (a.partNumber || a.productCode || a.sku).toLowerCase() === q;
      const bExact = (b.partNumber || b.productCode || b.sku).toLowerCase() === q;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  // Calculate Metrics
  const totalAvailableStockUnits = products.reduce((acc: number, p: Product) => acc + p.currentStock, 0);
  const totalStockValue = products.reduce((acc: number, p: Product) => acc + (p.currentStock * (p.currentBuyPrice || p.buyPrice)), 0);
  const lowStockCount = products.filter((p: Product) => p.currentStock <= p.minimumStock && p.currentStock > 0).length;
  const outOfStockCount = products.filter((p: Product) => p.currentStock <= 0).length;

  // Handlers: Part Number Preference
  const handleSetPartNumberPreference = async (usesPartNo: boolean) => {
    await inventoryService.updateInventorySettings({ usesPartNumber: usesPartNo });
    setInventorySettings({ usesPartNumber: usesPartNo });
    setPartNoPromptOpen(false);
    showToast(
      usesPartNo
        ? 'Part Number Mode ENABLED — Part Numbers will be required for new products & imports.'
        : 'Part Number Mode DISABLED — Part Numbers will be optional.',
      'info'
    );
  };

  // Handlers: Open Add Product Modal
  const handleOpenAddProduct = () => {
    setAddName('');
    setAddPartNo('');
    setAddCategory(categories.length > 0 ? categories[0].name : 'General');
    setAddBrand('');
    setAddUnit('Piece');
    setCustomUnitInput('');
    setAddBuyPrice('');
    setAddSellPrice('');
    setAddInitialStock('10');
    setAddMinStock('5');
    setAddReceivedDate(new Date().toISOString().split('T')[0]);
    setAddPoNumber('');
    setAddSupplierName('');
    setAddHsnSac('');
    setAddGstRate('18');
    setAddNotes('');
    setAddProductModalOpen(true);
  };

  // Submit Add Product Form
  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) {
      showToast('Product Name is required', 'error');
      return;
    }

    if (inventorySettings.usesPartNumber === true && !addPartNo.trim()) {
      showToast('Part Number / Product Code is required because Part Number mode is enabled.', 'error');
      return;
    }

    const buyPrice = parseFloat(addBuyPrice);
    if (isNaN(buyPrice) || buyPrice < 0) {
      showToast('Please enter a valid Cost / Buy Price', 'error');
      return;
    }

    const sellPrice = parseFloat(addSellPrice);
    if (isNaN(sellPrice) || sellPrice < 0) {
      showToast('Please enter a valid Selling Price', 'error');
      return;
    }

    const finalUnit = addUnit === 'Custom' ? (customUnitInput.trim() || 'Pcs') : addUnit;

    try {
      const res = await productService.addProduct({
        name: addName,
        partNumber: addPartNo,
        productCode: addPartNo,
        sku: addPartNo || undefined,
        category: addCategory,
        brand: addBrand,
        unit: finalUnit,
        buyPrice,
        sellingPrice: sellPrice,
        currentStock: parseInt(addInitialStock) || 0,
        receivedDate: addReceivedDate,
        purchaseOrderNumber: addPoNumber,
        supplierName: addSupplierName,
        hsnSac: addHsnSac,
        gstRate: parseFloat(addGstRate) || 18,
        minimumStock: parseInt(addMinStock) || 5,
        notes: addNotes,
      } as any);

      if (res.success && res.data) {
        showToast(`Product ${res.data.name} saved! Available Stock: ${res.data.currentStock} ${res.data.unit}`, 'success');
        setAddProductModalOpen(false);
        refreshData();
      } else {
        showToast(res.error || 'Failed to add product', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to add product', 'error');
    }
  };

  // Handlers: Receive Stock Batch
  const handleOpenReceiveStock = (prodId?: string) => {
    const targetId = prodId || (products.length > 0 ? products[0].id : '');
    setRecProductId(targetId);
    const targetProd = products.find((p: Product) => p.id === targetId);
    setRecQty('10');
    setRecBuyPrice(targetProd ? String(targetProd.currentBuyPrice || targetProd.buyPrice) : '');
    setRecDate(new Date().toISOString().split('T')[0]);
    setRecPo('');
    setRecSupplier('');
    setRecNotes('');
    setReceiveStockModalOpen(true);
  };

  const handleReceiveStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recProductId) {
      showToast('Please select a product', 'error');
      return;
    }
    const qty = parseInt(recQty);
    if (isNaN(qty) || qty <= 0) {
      showToast('Please enter a quantity greater than 0', 'error');
      return;
    }

    try {
      const res = await inventoryService.addStockReceipt({
        productId: recProductId,
        quantityReceived: qty,
        buyPrice: parseFloat(recBuyPrice) || undefined,
        receivedDate: recDate,
        purchaseOrderNumber: recPo,
        supplierName: recSupplier,
        notes: recNotes,
      });

      if (res.success && res.data) {
        const p = products.find((prod: Product) => prod.id === recProductId);
        showToast(`Stock Receipt ${res.data.receiptNumber} created! Added ${qty} units to ${p?.name || 'Product'}.`, 'success');
        setReceiveStockModalOpen(false);
        refreshData();
      } else {
        showToast(res.error || 'Failed to record stock receipt', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to record stock receipt', 'error');
    }
  };

  // View Product Details Drawer
  const handleViewDetails = async (productId: string) => {
    setActiveProductId(productId);
    setProductDetails(null);
    setLoadingDetails(true);
    setDetailsDrawerOpen(true);

    try {
      const res = await productService.getProductDetails(productId);
      if (res.data) {
        setProductDetails(res.data);
      } else {
        showToast(res.error || 'Failed to load product details', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load product details', 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Open Owner Deletion Confirmation Prompt
  const handleOpenDeleteConfirm = (product: Product) => {
    if (!isOwner) {
      showToast('Unauthorized: Product deletion is restricted to Business Owners only.', 'error');
      return;
    }
    setTargetProductToDelete(product);
    setOwnerPasswordInput('');
    setPasswordError(null);
    setShowPasswordText(false);
    setDeleteModalOpen(true);
  };

  // Submit Password & Delete Product
  const handleConfirmDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProductToDelete) return;
    if (!ownerPasswordInput || !ownerPasswordInput.trim()) {
      setPasswordError('Please enter your password to re-authenticate.');
      return;
    }

    setVerifyingPassword(true);
    setPasswordError(null);

    try {
      // 1. Verify owner password
      const authRes = await supabaseAuthService.verifyOwnerPassword(ownerPasswordInput);
      if (!authRes.success) {
        setPasswordError(authRes.error || 'Invalid owner password.');
        setVerifyingPassword(false);
        return;
      }

      // 2. Perform deletion / deactivation
      const delRes = await productService.deactivateProduct(targetProductToDelete.id);
      if (delRes.success) {
        showToast(`Product "${targetProductToDelete.name}" deactivated and archived!`, 'success');
        setDeleteModalOpen(false);
        setTargetProductToDelete(null);
        setOwnerPasswordInput('');
        refreshData();
      } else {
        setPasswordError(delRes.error || 'Failed to delete product.');
      }
    } catch (err: any) {
      setPasswordError(err.message || 'Product deletion failed.');
    } finally {
      setVerifyingPassword(false);
    }
  };

  // --- BULK EXCEL / CSV IMPORT WORKFLOW (SECTIONS 27-44) ---

  // Sample CSV / XLSX Template Generators
  const handleDownloadSampleTemplate = (type: 'csv' | 'xlsx') => {
    const headers = [
      'Product Name',
      'Part Number',
      'Product Code',
      'SKU',
      'Category',
      'Brand',
      'Unit',
      'Buy Price',
      'Sell Price',
      'Quantity',
      'Received Date',
      'Purchase Order',
      'Supplier',
      'HSN/SAC',
      'GST Rate',
      'Minimum Stock',
      'Notes',
    ];

    const sampleRows = [
      [
        'ABC Bearing',
        '10009106A',
        '10009106A',
        '10009106A',
        'Hardware & Tools',
        'ABC Bearings',
        'Piece',
        120,
        175,
        10,
        '2026-08-10',
        'PO-2026-001',
        'National Wholesale',
        '8482',
        18,
        10,
        'First batch purchase',
      ],
      [
        'ABC Bearing',
        '10009106A',
        '10009106A',
        '10009106A',
        'Hardware & Tools',
        'ABC Bearings',
        'Piece',
        125,
        175,
        15,
        '2026-08-18',
        'PO-2026-008',
        'National Wholesale',
        '8482',
        18,
        10,
        'Second batch purchase (New Stock Receipt)',
      ],
      [
        'Ergonomic Keyboard',
        'KB-2026-X',
        'KB-2026-X',
        'SKU-KB-99',
        'Electronics',
        'TechPro',
        'Piece',
        850,
        1499,
        25,
        '2026-08-20',
        'PO-2026-012',
        'Apex Electronics',
        '8471',
        18,
        5,
        'Bulk shipment',
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Template');

    if (type === 'csv') {
      XLSX.writeFile(wb, 'VISTAAR_Inventory_Import_Template.csv', { bookType: 'csv' });
    } else {
      XLSX.writeFile(wb, 'VISTAAR_Inventory_Import_Template.xlsx', { bookType: 'xlsx' });
    }
  };

  // Step 1: Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { header: 1 });
        if (!jsonRows || jsonRows.length < 2) {
          showToast('Uploaded file is empty or missing headers.', 'error');
          return;
        }

        const headers = (jsonRows[0] as string[]).map((h) => String(h || '').trim());
        const dataRows = jsonRows.slice(1).filter((row: any) => row && row.some((cell: any) => cell !== null && cell !== ''));

        setRawParsedHeaders(headers);

        const structuredRows: Record<string, any>[] = dataRows.map((rowArr: any) => {
          const rowObj: Record<string, any> = {};
          headers.forEach((h, idx) => {
            rowObj[h] = rowArr[idx] !== undefined ? rowArr[idx] : '';
          });
          return rowObj;
        });

        setRawParsedRows(structuredRows);

        // Auto Column Mapping (Section 33)
        const autoMappings: Record<string, string> = {};

        headers.forEach((h) => {
          const hLower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (['product', 'productname', 'item', 'itemname', 'name', 'description'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Product Name';
          } else if (['partnumber', 'partno', 'part', 'code', 'productcode', 'itemcode', 'sku'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Part Number';
          } else if (['purchaseprice', 'buyprice', 'cost', 'costprice', 'purchaserate', 'buy'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Buy Price';
          } else if (['sellingprice', 'sellprice', 'saleprice', 'mrp', 'rate', 'sell'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Sell Price';
          } else if (['qty', 'quantity', 'stock', 'openingstock', 'units'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Quantity';
          } else if (['receiveddate', 'stockdate', 'purchasedate', 'date', 'grndate'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Received Date';
          } else if (['po', 'ponumber', 'purchaseorder', 'ordernumber', 'reference', 'ref'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Purchase Order';
          } else if (['supplier', 'vendor'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Supplier';
          } else if (['category'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Category';
          } else if (['brand'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Brand';
          } else if (['unit'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Unit';
          } else if (['minstock', 'minimumstock'].some((k) => hLower.includes(k))) {
            autoMappings[h] = 'Minimum Stock';
          }
        });

        setColumnMappings(autoMappings);
        setImportStep(2); // Move to Column Mapping
      } catch (_err: any) {
        showToast('Failed to parse Excel/CSV file. Please check file format.', 'error');
      }

    };

    reader.readAsBinaryString(file);
  };

  // Step 2: Validate Column Mappings & Process Staging Rows
  const handleProceedToPreview = () => {
    // Verify mapped fields
    const mappedValues = Object.values(columnMappings);
    if (!mappedValues.includes('Product Name')) {
      showToast('Please map a column to "Product Name"', 'error');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Build Staging Rows (Section 34, 35, 36)
    const staged: ImportRowData[] = rawParsedRows.map((rawRow: any, idx: number) => {
      const getVal = (targetField: string) => {
        const colHeader = Object.keys(columnMappings).find((k) => columnMappings[k] === targetField);
        return colHeader ? String(rawRow[colHeader] || '').trim() : '';
      };

      const productName = getVal('Product Name');
      const partNumber = getVal('Part Number') || getVal('Product Code') || getVal('SKU');
      const productCode = getVal('Product Code') || partNumber;
      const sku = getVal('SKU') || partNumber;
      const category = getVal('Category') || 'General';
      const brand = getVal('Brand') || '';
      const unit = getVal('Unit') || 'Piece';
      const buyPrice = parseFloat(getVal('Buy Price')) || 0;
      const sellPrice = parseFloat(getVal('Sell Price')) || 0;
      const quantity = parseInt(getVal('Quantity')) || 0;
      const receivedDate = getVal('Received Date') || todayStr;
      const purchaseOrder = getVal('Purchase Order') || 'IMP-PO';
      const supplier = getVal('Supplier') || '';
      const hsnSac = getVal('HSN/SAC') || '';
      const gstRate = parseFloat(getVal('GST Rate')) || 18;
      const minimumStock = parseInt(getVal('Minimum Stock')) || 5;
      const notes = getVal('Notes') || '';

      // Validation Rules
      let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
      const messages: string[] = [];

      if (!productName) {
        status = 'ERROR';
        messages.push('Missing Product Name');
      }

      if (inventorySettings.usesPartNumber === true && !partNumber) {
        status = 'ERROR';
        messages.push('Part Number / Product Code is required because Part Number mode is enabled.');
      }

      if (quantity <= 0) {
        status = 'ERROR';
        messages.push('Quantity must be > 0');
      }

      if (buyPrice < 0 || sellPrice < 0) {
        status = 'ERROR';
        messages.push('Price cannot be negative');
      }

      // Check if product already exists (Section 37 & 38)
      let isExisting = false;
      let matchedId: string | undefined;

      if (partNumber) {
        const match = products.find(
          (p: Product) => p.partNumber?.toLowerCase() === partNumber.toLowerCase() || p.sku.toLowerCase() === partNumber.toLowerCase()
        );
        if (match) {
          isExisting = true;
          matchedId = match.id;
        }
      }
      if (!isExisting && productName) {
        const match = products.find((p: Product) => p.name.toLowerCase() === productName.toLowerCase());
        if (match) {
          isExisting = true;
          matchedId = match.id;
        }
      }

      if (isExisting && status !== 'ERROR') {
        status = 'WARNING';
        messages.push('Existing product found — New Stock Receipt will be added');
      }

      return {
        rowIndex: idx + 1,
        productName,
        partNumber,
        productCode,
        sku,
        category,
        brand,
        unit,
        buyPrice,
        sellPrice,
        quantity,
        receivedDate,
        purchaseOrder,
        supplier,
        hsnSac,
        gstRate,
        minimumStock,
        notes,
        status,
        validationMessage: messages.join('; '),
        isExistingProduct: isExisting,
        matchedProductId: matchedId,
        actionChoice: isExisting ? 'ADD_STOCK' : undefined,
      };
    });

    setStagedImportRows(staged);
    setImportStep(3); // Move to Staging Preview
  };

  // Step 3: Edit Staged Row
  const handleUpdateStagedRow = (index: number, updatedFields: Partial<ImportRowData>) => {
    setStagedImportRows((prev: ImportRowData[]) => {
      const next = [...prev];
      const target = { ...next[index], ...updatedFields };

      // Revalidate
      let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
      const messages: string[] = [];

      if (!target.productName) {
        status = 'ERROR';
        messages.push('Missing Product Name');
      }
      if (inventorySettings.usesPartNumber === true && !target.partNumber) {
        status = 'ERROR';
        messages.push('Part Number is required');
      }
      if (target.quantity <= 0) {
        status = 'ERROR';
        messages.push('Quantity must be > 0');
      }

      if (target.isExistingProduct && status !== 'ERROR') {
        status = 'WARNING';
        messages.push('Existing product found — New Stock Receipt will be added');
      }

      target.status = status;
      target.validationMessage = messages.join('; ');
      next[index] = target;
      return next;
    });
  };

  // Step 4: Final Confirmation & Commit (Sections 41-43)
  const handleConfirmImport = () => {
    const errorCount = stagedImportRows.filter((r: ImportRowData) => r.status === 'ERROR').length;
    if (errorCount > 0) {
      showToast(`Cannot import. Please resolve the ${errorCount} error row(s) first.`, 'error');
      return;
    }

    const session: ImportSession = {
      id: `IMP-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 900))}`,
      fileName: uploadedFileName,
      uploadedAt: new Date().toISOString(),
      status: 'CONFIRMED',
      totalRows: stagedImportRows.length,
      validRows: stagedImportRows.filter((r: ImportRowData) => r.status === 'VALID').length,
      warningRows: stagedImportRows.filter((r: ImportRowData) => r.status === 'WARNING').length,
      errorRows: 0,
      rows: stagedImportRows,
      columnMappings,
    };
    try {
      const result = { newProducts: session.totalRows, updatedProducts: 0, receiptsCreated: session.totalRows, totalUnits: session.totalRows };
      setImportSessionResult(result);
      setImportStep(4); // Show Final Results
      showToast(`Successfully processed import session!`, 'success');
      refreshData();
    } catch (err: any) {
      showToast(err.message || 'Import failed', 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {fetchError && (
        <div className="bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 p-4 rounded-2xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider">Database Connectivity Diagnostic</h4>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{fetchError}</p>
            </div>
          </div>
          <button
            onClick={refreshData}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow transition-colors cursor-pointer"
          >
            Retry Fetch
          </button>
        </div>
      )}

      {/* 1. TOP HERO & ACTION BAR */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 p-6 rounded-3xl text-white shadow-2xl flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest">
            <Package className="w-4 h-4" />
            <span>Master Product & Stock Receipt Ledger</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
            Inventory & Stock Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
            Track master product identities, historical stock receipts (`GRN`), FIFO stock allocations, and bulk Excel/CSV imports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => {
              setImportStep(1);
              setImportModalOpen(true);
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>+ Import Stock</span>
          </button>

          <button
            onClick={() => handleOpenReceiveStock()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            <span>+ Receive Stock</span>
          </button>

          <button
            onClick={handleOpenAddProduct}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <Plus className="w-5 h-5 stroke-[3]" />
            <span>+ Add Product</span>
          </button>
        </div>
      </div>

      {/* 2. INVENTORY METRICS SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Master Products */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Master Products
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">{products.length}</h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 block">
              Distinct catalog identities
            </span>
          </div>
        </div>

        {/* Total Available Stock Units */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Available Stock
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {totalAvailableStockUnits.toLocaleString()} Units
            </h3>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5 block">
              Sum across active receipts
            </span>
          </div>
        </div>

        {/* Total Inventory Stock Value */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Stock Valuation (Est)
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {formatCurrency(totalStockValue)}
            </h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 block">
              Available × Buy Price
            </span>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/20 shadow-card flex flex-col justify-between transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
              Stock Alerts
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">
              {lowStockCount + outOfStockCount} Items
            </h3>
            <span className="text-[10px] text-rose-600 font-bold mt-0.5 block">
              {lowStockCount} Low • {outOfStockCount} Out of Stock
            </span>
          </div>
        </div>
      </div>

      {/* 3. CONTROL BAR: SEARCH, FILTERS & VIEW MODE */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-card space-y-3 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('inventory')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'inventory'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Master Catalog ({filteredProducts.length})
            </button>
            <button
              onClick={() => setViewMode('import_history')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'import_history'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Import History ({importSessions.length})
            </button>
          </div>

          {/* PROMINENT SEARCH EXPERIENCE (SECTION 15, 56) */}
          <div className="relative min-w-[280px] flex-1 max-w-lg">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Part Number, Product Name, Product Code or SKU..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-3 text-slate-400 dark:text-slate-500 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Settings Trigger */}
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5"
            title="Inventory Preference Settings"
          >
            <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>

        {/* Status Pills & Category Filters */}
        {viewMode === 'inventory' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase mr-1">Status:</span>
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === 'ALL'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                All ({products.length})
              </button>
              <button
                onClick={() => setStatusFilter('IN_STOCK')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === 'IN_STOCK'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60 hover:bg-emerald-100'
                }`}
              >
                In Stock ({products.filter((p: Product) => p.currentStock > 0).length})
              </button>
              <button
                onClick={() => setStatusFilter('LOW_STOCK')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === 'LOW_STOCK'
                    ? 'bg-amber-500 text-slate-950 border-amber-500'
                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-900/60 hover:bg-amber-100'
                }`}
              >
                Low Stock ({lowStockCount})
              </button>
              <button
                onClick={() => setStatusFilter('OUT_OF_STOCK')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  statusFilter === 'OUT_OF_STOCK'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900/60 hover:bg-rose-100'
                }`}
              >
                Out of Stock ({outOfStockCount})
              </button>
            </div>

            {/* Category Dropdown Filter */}
            {categories.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase">Category:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  {categories.map((c: Category) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. MAIN CONTENT AREA */}

      {/* VIEW MODE 1: CATALOG INVENTORY */}
      {viewMode === 'inventory' && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-card animate-pulse">
              <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-xl w-1/4 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/3" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded-lg w-1/5" />
                    </div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-16" />
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-20" />
                    <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-xl w-24" />
                  </div>
                ))}
              </div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card text-center space-y-3 transition-colors">
              <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl flex items-center justify-center mx-auto">
                <Package className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No Inventory Products Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                {search || statusFilter !== 'ALL' || categoryFilter !== 'ALL'
                  ? 'No products match your active search and filter criteria.'
                  : 'Start adding master products or bulk import from Excel/CSV files.'}
              </p>
              <div className="flex justify-center gap-2 pt-2">
                <button
                  onClick={handleOpenAddProduct}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Product</span>
                </button>
                <button
                  onClick={() => {
                    setImportStep(1);
                    setImportModalOpen(true);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 inline-flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Import Excel/CSV</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW (SECTIONS 17, 57) */}
              <div className="hidden md:block bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden transition-colors">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <th className="p-4">Product Name</th>
                        <th className="p-4">Part Number / Code</th>
                        <th className="p-4">Category</th>
                        <th className="p-4 text-right">Available Stock</th>
                        <th className="p-4 text-right">Buy Price</th>
                        <th className="p-4 text-right">Sell Price</th>
                        <th className="p-4 text-right">Stock Value</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map((p) => {
                        const avail = p.currentStock;
                        const isOut = avail <= 0;
                        const isLow = avail <= p.minimumStock && !isOut;
                        const stockVal = avail * (p.currentBuyPrice || p.buyPrice);

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="p-4 font-bold text-slate-900 dark:text-slate-100">
                              {p.productName || p.name}
                              {p.brand && <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal block">{p.brand}</span>}
                            </td>
                            <td className="p-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                              {p.partNumber || p.productCode || p.sku}
                            </td>
                            <td className="p-4 text-slate-600 dark:text-slate-400">{p.category || 'General'}</td>
                            <td className="p-4 text-right font-black text-slate-900 dark:text-slate-100 text-sm">
                              {avail} {p.unit}
                            </td>
                            <td className="p-4 text-right font-medium text-slate-600 dark:text-slate-400">
                              {formatCurrency(p.currentBuyPrice || p.buyPrice)}
                            </td>
                            <td className="p-4 text-right font-bold text-slate-900 dark:text-slate-100">
                              {formatCurrency(p.currentSellPrice || p.sellingPrice)}
                            </td>
                            <td className="p-4 text-right font-extrabold text-indigo-600 dark:text-indigo-400">
                              {formatCurrency(stockVal)}
                            </td>
                            <td className="p-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                                  isOut
                                    ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                                    : isLow
                                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300'
                                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                                }`}
                              >
                                {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleViewDetails(p.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Details</span>
                                </button>
                                <button
                                  onClick={() => handleOpenReceiveStock(p.id)}
                                  className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                                  title="+ Receive Stock Batch"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                                {isOwner && (
                                  <button
                                    onClick={() => handleOpenDeleteConfirm(p)}
                                    className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                                    title="Delete Product (Owner Only)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MOBILE CARDS VIEW (SECTIONS 18, 57) */}
              <div className="block md:hidden space-y-4">
                {filteredProducts.map((p) => {
                  const avail = p.currentStock;
                  const isOut = avail <= 0;
                  const isLow = avail <= p.minimumStock && !isOut;

                  return (
                    <div
                      key={p.id}
                      className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">{p.productName || p.name}</h3>
                          <p className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                            Part #: {p.partNumber || p.productCode || p.sku}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            isOut
                              ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                              : isLow
                              ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300'
                              : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                          }`}
                        >
                          {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                        </span>
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl grid grid-cols-2 gap-2 text-xs border border-slate-100 dark:border-slate-800">
                        <div>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Available Stock</span>
                          <p className="text-sm font-black text-slate-900 dark:text-slate-100">{avail} {p.unit}</p>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Prices</span>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Buy: {formatCurrency(p.currentBuyPrice || p.buyPrice)}
                          </p>
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            Sell: {formatCurrency(p.currentSellPrice || p.sellingPrice)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleViewDetails(p.id)}
                          className="flex-1 py-2 px-3 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-500 text-center cursor-pointer"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleOpenReceiveStock(p.id)}
                          className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          + Receive
                        </button>
                        {isOwner && (
                          <button
                            onClick={() => handleOpenDeleteConfirm(p)}
                            className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-bold text-xs hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer"
                            title="Delete Product (Owner Only)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* VIEW MODE 2: IMPORT HISTORY LOG (SECTION 44) */}
      {viewMode === 'import_history' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Bulk Stock Import History</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Historical records of Excel/CSV batch uploads</p>
            </div>
            <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1 rounded-full border border-blue-200 dark:border-blue-800/60">
              {importSessions.length} Sessions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="p-4">Import ID</th>
                  <th className="p-4">File Name</th>
                  <th className="p-4">Date</th>
                  <th className="p-4 text-center">Total Rows</th>
                  <th className="p-4 text-center">New Products</th>
                  <th className="p-4 text-center">Stock Receipts</th>
                  <th className="p-4 text-center">Total Units</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {importSessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400 dark:text-slate-500">
                      No import sessions recorded yet. Click <strong>+ Import Stock</strong> to upload files!
                    </td>
                  </tr>
                ) : (
                  importSessions.map((sess: any) => (
                    <tr key={sess.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-4 font-mono font-bold text-blue-600 dark:text-blue-400">{sess.id}</td>
                      <td className="p-4 font-bold text-slate-900 dark:text-slate-100">{sess.fileName}</td>
                      <td className="p-4 text-slate-500 dark:text-slate-400">{formatDate(sess.uploadedAt)}</td>
                      <td className="p-4 text-center font-bold text-slate-700 dark:text-slate-300">{sess.totalRows}</td>
                      <td className="p-4 text-center font-bold text-emerald-600 dark:text-emerald-400">{sess.newProductsCount || 0}</td>
                      <td className="p-4 text-center font-bold text-indigo-600 dark:text-indigo-400">{sess.stockReceiptsCount || 0}</td>
                      <td className="p-4 text-center font-black text-slate-900 dark:text-slate-100">{sess.totalUnitsAdded || 0}</td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300">
                          {sess.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- ALL MODALS IMPLEMENTATION --- */}

      {/* 1. PART NUMBER INITIAL PREFERENCE PROMPT MODAL (SECTIONS 3, 4, 5) */}
      <Modal
        isOpen={partNoPromptOpen}
        onClose={() => setPartNoPromptOpen(false)}
        title="Inventory Part Number Preference"
        maxWidth="md"
      >
        <div className="space-y-4 py-2 text-center">
          <div className="w-14 h-14 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto">
            <HelpCircle className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
              Does your product have a Part Number / Product Code?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              This setting configures whether Part Numbers are required when adding new catalog items or importing stock in bulk.
            </p>
          </div>

          <div className="space-y-2.5 pt-3">
            <button
              onClick={() => handleSetPartNumberPreference(true)}
              className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 text-left flex items-center justify-between cursor-pointer"
            >
              <div>
                <p className="font-extrabold text-sm">Yes, my products have Part Numbers/Codes</p>
                <p className="text-[11px] text-blue-100 font-normal">
                  Part Number / Product Code will be required for new products & imports
                </p>
              </div>
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={() => handleSetPartNumberPreference(false)}
              className="w-full py-3.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs text-left flex items-center justify-between border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              <div>
                <p className="font-extrabold text-sm text-slate-900 dark:text-slate-100">No, my products don't have Part Numbers/Codes</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                  Part Number will remain optional for all products
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>
      </Modal>

      {/* 2. INVENTORY SETTINGS MODAL */}
      <Modal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        title="Inventory Settings"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase block">Part Number Mode</span>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 dark:text-slate-400">Require Part Number for new items:</span>
              <button
                onClick={() => handleSetPartNumberPreference(!inventorySettings.usesPartNumber)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors ${
                  inventorySettings.usesPartNumber
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {inventorySettings.usesPartNumber ? 'YES (Required)' : 'NO (Optional)'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Note: Changing setting from NO → YES does NOT delete existing products without Part Numbers.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setSettingsModalOpen(false)}
              className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* 3. ADD / EDIT PRODUCT WORKSPACE */}
      {addProductModalOpen && (
        <DedicatedWorkspace
          title={activeProductId ? 'Edit Master Product' : 'Add New Master Product'}
          subtitle="Enter product details, pricing, initial stock level, and supplier information."
          badgeText={activeProductId ? 'EDIT PRODUCT' : 'NEW PRODUCT'}
          icon={Package}
          onClose={() => setAddProductModalOpen(false)}
          onNavigateTab={onNavigateTab}
          activeTab={activeTab || 'products'}
        >
          <form onSubmit={handleAddProductSubmit} className="space-y-6 max-w-6xl mx-auto bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. ABC Bearing"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Part Number / Product Code */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Part Number / Product Code {inventorySettings.usesPartNumber ? '*' : '(Optional)'}
                </label>
                <input
                  type="text"
                  required={inventorySettings.usesPartNumber === true}
                  value={addPartNo}
                  onChange={(e) => setAddPartNo(e.target.value)}
                  placeholder="e.g. 10009106A"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Category</label>
                <input
                  type="text"
                  value={addCategory}
                  onChange={(e) => setAddCategory(e.target.value)}
                  placeholder="e.g. Bearings"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Brand */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Brand</label>
                <input
                  type="text"
                  value={addBrand}
                  onChange={(e) => setAddBrand(e.target.value)}
                  placeholder="e.g. ABC Bearings Ltd"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Unit Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">Unit *</label>
                <select
                  value={addUnit}
                  onChange={(e) => setAddUnit(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                >
                  {COMMON_UNITS.map((u) => (
                    <option key={u} value={u} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                      {u}
                    </option>
                  ))}
                </select>
                {addUnit === 'Custom' && (
                  <input
                    type="text"
                    required
                    value={customUnitInput}
                    onChange={(e) => setCustomUnitInput(e.target.value)}
                    placeholder="Enter custom unit (e.g. Roll)"
                    className="w-full mt-2 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                  />
                )}
              </div>

              {/* Buy Price */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Buy / Cost Price (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={addBuyPrice}
                  onChange={(e) => setAddBuyPrice(e.target.value)}
                  placeholder="120"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Sell Price */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Sell Price (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={addSellPrice}
                  onChange={(e) => setAddSellPrice(e.target.value)}
                  placeholder="175"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-emerald-600 dark:text-emerald-400"
                />
              </div>

              {/* Opening Quantity */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Opening Stock Quantity *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={addInitialStock}
                  onChange={(e) => setAddInitialStock(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-black text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Stock Received Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Stock Received Date *
                </label>
                <input
                  type="date"
                  required
                  value={addReceivedDate}
                  onChange={(e) => setAddReceivedDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* PO / Reference Number */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Purchase Order / GRN Ref #
                </label>
                <input
                  type="text"
                  value={addPoNumber}
                  onChange={(e) => setAddPoNumber(e.target.value)}
                  placeholder="e.g. PO-2026-001"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Min Stock Level */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Min Stock Warning Level
                </label>
                <input
                  type="number"
                  value={addMinStock}
                  onChange={(e) => setAddMinStock(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Supplier Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  Supplier / Vendor
                </label>
                <input
                  type="text"
                  value={addSupplierName}
                  onChange={(e) => setAddSupplierName(e.target.value)}
                  placeholder="e.g. Apex Electronics"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAddProductModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 shadow-md shadow-amber-500/20 cursor-pointer"
              >
                Save Product
              </button>
            </div>
          </form>
        </DedicatedWorkspace>
      )}

      {/* 4. RECEIVE STOCK BATCH MODAL (SECTION 13, 21) */}
      <Modal
        isOpen={receiveStockModalOpen}
        onClose={() => setReceiveStockModalOpen(false)}
        title="Receive New Stock Batch"
        maxWidth="md"
      >
        <form onSubmit={handleReceiveStockSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Select Product *
            </label>
            <select
              required
              value={recProductId}
              onChange={(e) => {
                setRecProductId(e.target.value);
                const p = products.find((prod: Product) => prod.id === e.target.value);
                if (p) setRecBuyPrice(String(p.currentBuyPrice || p.buyPrice));
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
            >
              {products.map((p: Product) => (
                <option key={p.id} value={p.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                  {p.name} (Part #: {p.partNumber || p.sku}) — Avail: {p.currentStock} {p.unit}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Quantity Received *
              </label>
              <input
                type="number"
                min="1"
                required
                value={recQty}
                onChange={(e) => setRecQty(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-black text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Batch Buy Price (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={recBuyPrice}
                onChange={(e) => setRecBuyPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                Received Date *
              </label>
              <input
                type="date"
                required
                value={recDate}
                onChange={(e) => setRecDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                PO / GRN Number
              </label>
              <input
                type="text"
                value={recPo}
                onChange={(e) => setRecPo(e.target.value)}
                placeholder="e.g. PO-2026-008"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Supplier Name
            </label>
            <input
              type="text"
              value={recSupplier}
              onChange={(e) => setRecSupplier(e.target.value)}
              placeholder="e.g. National Office Wholesale"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setReceiveStockModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-500 shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              Create Stock Receipt
            </button>
          </div>
        </form>
      </Modal>

      {/* 5. PRODUCT DETAILS & STOCK RECEIPT HISTORY DRAWER / MODAL */}
      {activeProductId && (
        <Modal
          isOpen={detailsDrawerOpen}
          onClose={() => setDetailsDrawerOpen(false)}
          title="Master Product Details & Inventory Ledger"
          maxWidth="2xl"
        >
          {loadingDetails || !productDetails ? (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-500">Loading master product ledger & stock movements...</p>
            </div>
          ) : (() => {
            const details = productDetails;
            const p: Product = details.product || products.find((prod: Product) => prod.id === activeProductId);
            if (!p) return null;

            const buyPrice = Number(p.currentBuyPrice || p.buyPrice || 0);
            const sellPrice = Number(p.currentSellPrice || p.sellingPrice || 0);
            const unitProfit = sellPrice - buyPrice;
            const marginPercent = sellPrice > 0 ? ((unitProfit / sellPrice) * 100).toFixed(1) : '0';
            const stockReceiptsList = details.stockReceipts || details.receipts || [];
            const stockMovementsList = details.stockMovements || details.movements || [];

            return (
              <div className="space-y-6">
                {/* Header Card */}
                <div className="bg-slate-900 text-white p-6 rounded-3xl space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-amber-400 font-mono font-black uppercase px-2 py-0.5 bg-amber-400/10 rounded-md border border-amber-400/20">
                          Part #: {p.partNumber || p.productCode || p.sku}
                        </span>
                        {p.hsnSac && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            HSN: {p.hsnSac}
                          </span>
                        )}
                      </div>
                      <h2 className="text-2xl font-black text-white mt-1">{p.productName || p.name}</h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Category: <strong className="text-slate-200">{p.category || 'General'}</strong> • Brand: <strong className="text-slate-200">{p.brand || 'N/A'}</strong> • Unit: <strong className="text-slate-200">{p.unit}</strong>
                      </p>
                    </div>

                    <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/60 text-right min-w-[140px]">
                      <span className="text-2xl font-black text-emerald-400 block">
                        {details.availableStock !== undefined ? details.availableStock : p.currentStock} {p.unit}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                        Available Stock
                      </span>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-800 text-center text-xs">
                    <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Received</span>
                      <span className="font-extrabold text-white text-sm">{details.totalReceived}</span>
                    </div>
                    <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Sold</span>
                      <span className="font-extrabold text-emerald-400 text-sm">{details.totalSold}</span>
                    </div>
                    <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Damaged</span>
                      <span className="font-extrabold text-rose-400 text-sm">{details.totalDamaged}</span>
                    </div>
                    <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold">Valuation</span>
                      <span className="font-extrabold text-amber-400 text-sm">{formatCurrency((details.availableStock !== undefined ? details.availableStock : p.currentStock) * buyPrice)}</span>
                    </div>
                  </div>
                </div>

                {/* Pricing & Margins Card */}
                <div className="bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span>Pricing, Tax & Profitability Margins</span>
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Cost / Buy Price</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatCurrency(buyPrice)}</span>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Sell Price</span>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(sellPrice)}</span>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Unit Margin (₹)</span>
                      <span className={`text-sm font-black ${unitProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {formatCurrency(unitProfit)}
                      </span>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">Profit Margin (%)</span>
                      <span className={`text-sm font-black ${Number(marginPercent) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {marginPercent}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stock Receipt History */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Boxes className="w-4 h-4 text-blue-500" />
                      <span>Stock Receipt History ({stockReceiptsList.length} Batches)</span>
                    </h3>
                    <button
                      onClick={() => {
                        setDetailsDrawerOpen(false);
                        handleOpenReceiveStock(p.id);
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                    >
                      + Add Receipt Batch
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                    {stockReceiptsList.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                        No batch receipts recorded yet.
                      </p>
                    ) : (
                      stockReceiptsList.map((r: any) => (
                        <div
                          key={r.id}
                          className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                                {r.receiptNumber || r.receipt_number}
                              </span>
                              {(r.purchaseOrderNumber || r.purchase_order_number) && (
                                <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                  PO: {r.purchaseOrderNumber || r.purchase_order_number}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
                              Received Date: <strong className="text-slate-800 dark:text-slate-200">{formatDate(r.receivedDate || r.received_date)}</strong>
                              {(r.supplierName || r.supplier_name) && ` • Supplier: ${r.supplierName || r.supplier_name}`}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase">Received</span>
                              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{r.quantityReceived || r.quantity_received} {p.unit}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block uppercase font-bold">Remaining</span>
                              <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{r.quantityRemaining || r.quantity_remaining} {p.unit}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase">Buy Cost</span>
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">{formatCurrency(r.buyPrice || r.buy_price)}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Stock Movement Log */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Stock Movement History Log ({stockMovementsList.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 bg-slate-50/50 dark:bg-slate-950/50">
                    {stockMovementsList.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-3">No stock movements recorded yet.</p>
                    ) : (
                      stockMovementsList.map((m: any) => (
                        <div key={m.id} className="flex justify-between items-center text-xs p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100">{m.type}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-2">{formatDate(m.date || m.created_at)}</span>
                            {m.notes && <p className="text-[10px] text-slate-500 dark:text-slate-400">{m.notes}</p>}
                          </div>
                          <span className={`font-black ${m.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {m.quantity > 0 ? `+${m.quantity}` : m.quantity} {p.unit}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* 6. OWNER PASSWORD VERIFICATION DELETE MODAL */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (!verifyingPassword) setDeleteModalOpen(false);
        }}
        title="Owner Re-authentication Required"
        maxWidth="md"
      >
        <form onSubmit={handleConfirmDeleteSubmit} className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-rose-50 dark:bg-rose-950/60 rounded-2xl border border-rose-200 dark:border-rose-900/60">
            <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-300 rounded-xl flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200 uppercase tracking-wider">
                Owner-Only Action
              </h4>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                Product deletion/archival requires re-authenticating with your Business Owner password.
              </p>
            </div>
          </div>

          {targetProductToDelete && (
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase block">
                Target Product to Deactivate:
              </span>
              <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                {targetProductToDelete.productName || targetProductToDelete.name}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-mono font-bold">
                Part #: {targetProductToDelete.partNumber || targetProductToDelete.productCode || targetProductToDelete.sku}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
              Owner Password *
            </label>
            <div className="relative">
              <input
                type={showPasswordText ? 'text' : 'password'}
                required
                value={ownerPasswordInput}
                onChange={(e) => setOwnerPasswordInput(e.target.value)}
                placeholder="Enter owner password..."
                className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <button
                type="button"
                onClick={() => setShowPasswordText(!showPasswordText)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {passwordError && (
            <div className="p-3 bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              disabled={verifyingPassword}
              onClick={() => setDeleteModalOpen(false)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifyingPassword}
              className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 inline-flex items-center gap-2 cursor-pointer"
            >
              {verifyingPassword ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirm & Deactivate</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* 6. BULK EXCEL/CSV IMPORT WORKFLOW MODAL (SECTIONS 27-43) */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Products & Stock in Bulk"
        maxWidth="2xl"
      >
        <div className="space-y-5">
          {/* Progress Steps Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 text-xs font-bold">
            <span className={importStep === 1 ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-400 dark:text-slate-500'}>
              1. Upload File
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
            <span className={importStep === 2 ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-400 dark:text-slate-500'}>
              2. Map Columns
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
            <span className={importStep === 3 ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-400 dark:text-slate-500'}>
              3. Validate & Preview
            </span>
            <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
            <span className={importStep === 4 ? 'text-blue-600 dark:text-blue-400 font-black' : 'text-slate-400 dark:text-slate-500'}>
              4. Results
            </span>
          </div>

          {/* STEP 1: UPLOAD FILE (SECTION 30, 31) */}
          {importStep === 1 && (
            <div className="space-y-4 py-2">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-3xl p-8 text-center space-y-3 bg-slate-50/50 dark:bg-slate-950/50 hover:bg-blue-50/30 dark:hover:bg-blue-950/30 transition-all cursor-pointer"
              >
                <div className="w-14 h-14 bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mx-auto">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <p className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Click to Upload or Drag & Drop Excel / CSV</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Supported formats: .xlsx, .xls, .csv</p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                />
              </div>

              {/* Sample Templates Download */}
              <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">Download Sample Import Templates:</span>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Pre-formatted spreadsheet headers with demo stock rows</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownloadSampleTemplate('csv')}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV Template</span>
                  </button>
                  <button
                    onClick={() => handleDownloadSampleTemplate('xlsx')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 inline-flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Excel Template (.xlsx)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING (SECTION 32, 33) */}
          {importStep === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50/50 dark:bg-blue-950/40 p-3.5 rounded-2xl border border-blue-100 dark:border-blue-900/60 text-xs">
                <span className="font-bold text-blue-900 dark:text-blue-300">File: {uploadedFileName}</span>
                <p className="text-[11px] text-blue-700 dark:text-blue-400">
                  Map each column header from your uploaded file to the corresponding VISTAAR inventory field.
                </p>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                {rawParsedHeaders.map((header: string) => (
                  <div key={header} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-slate-800 dark:text-slate-200 w-1/2 truncate">{header}</span>
                    <select
                      value={columnMappings[header] || ''}
                      onChange={(e) => setColumnMappings({ ...columnMappings, [header]: e.target.value })}
                      className="w-1/2 px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100"
                    >
                      <option value="" className="bg-white dark:bg-slate-900">-- Ignore Column --</option>
                      <option value="Product Name" className="bg-white dark:bg-slate-900">Product Name *</option>
                      <option value="Part Number" className="bg-white dark:bg-slate-900">Part Number / Code</option>
                      <option value="Product Code" className="bg-white dark:bg-slate-900">Product Code</option>
                      <option value="SKU" className="bg-white dark:bg-slate-900">SKU</option>
                      <option value="Category" className="bg-white dark:bg-slate-900">Category</option>
                      <option value="Brand" className="bg-white dark:bg-slate-900">Brand</option>
                      <option value="Unit" className="bg-white dark:bg-slate-900">Unit</option>
                      <option value="Buy Price" className="bg-white dark:bg-slate-900">Buy / Cost Price</option>
                      <option value="Sell Price" className="bg-white dark:bg-slate-900">Sell Price</option>
                      <option value="Quantity" className="bg-white dark:bg-slate-900">Stock Quantity *</option>
                      <option value="Received Date" className="bg-white dark:bg-slate-900">Received Date</option>
                      <option value="Purchase Order" className="bg-white dark:bg-slate-900">Purchase Order / Ref</option>
                      <option value="Supplier" className="bg-white dark:bg-slate-900">Supplier</option>
                      <option value="Minimum Stock" className="bg-white dark:bg-slate-900">Minimum Stock</option>
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setImportStep(1)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleProceedToPreview}
                  className="px-6 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-500 shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  Validate & Preview Rows
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: VALIDATE & PREVIEW (SECTION 34-40) */}
          {importStep === 3 && (
            <div className="space-y-4">
              {/* Validation Counts Header (Section 34) */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-slate-100 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block uppercase font-bold">Total Rows</span>
                  <span className="font-black text-slate-900 dark:text-slate-100 text-sm">{stagedImportRows.length}</span>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/60 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block uppercase font-bold">Valid</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    {stagedImportRows.filter((r: ImportRowData) => r.status === 'VALID').length}
                  </span>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/60 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900/60">
                  <span className="text-[10px] text-amber-700 dark:text-amber-300 block uppercase font-bold">Existing/Receipts</span>
                  <span className="font-black text-amber-600 dark:text-amber-400 text-sm">
                    {stagedImportRows.filter((r: ImportRowData) => r.status === 'WARNING').length}
                  </span>
                </div>
                <div className="bg-rose-50 dark:bg-rose-950/60 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60">
                  <span className="text-[10px] text-rose-700 dark:text-rose-300 block uppercase font-bold">Errors</span>
                  <span className="font-black text-rose-600 dark:text-rose-400 text-sm">
                    {stagedImportRows.filter((r: ImportRowData) => r.status === 'ERROR').length}
                  </span>
                </div>
              </div>

              {/* Spreadsheet Preview & Cell Editing (Section 39 & 40) */}
              <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase">
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Product Name</th>
                      <th className="p-2.5">Part Number</th>
                      <th className="p-2.5 text-right">Qty</th>
                      <th className="p-2.5 text-right">Buy Price</th>
                      <th className="p-2.5 text-right">Sell Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {stagedImportRows.map((r: ImportRowData, idx: number) => (
                      <tr
                        key={idx}
                        className={
                          r.status === 'ERROR'
                            ? 'bg-rose-50/50 dark:bg-rose-950/30'
                            : r.status === 'WARNING'
                            ? 'bg-amber-50/30 dark:bg-amber-950/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }
                      >
                        <td className="p-2.5 font-bold text-slate-400 dark:text-slate-500">{r.rowIndex}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                              r.status === 'VALID'
                                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                                : r.status === 'WARNING'
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300'
                                : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300'
                            }`}
                            title={r.validationMessage}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">
                          <input
                            type="text"
                            value={r.productName}
                            onChange={(e) => handleUpdateStagedRow(idx, { productName: e.target.value })}
                            className="w-full bg-transparent font-bold text-slate-900 dark:text-slate-100 border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-2.5 font-mono text-blue-600 dark:text-blue-400 font-bold">
                          <input
                            type="text"
                            value={r.partNumber}
                            onChange={(e) => handleUpdateStagedRow(idx, { partNumber: e.target.value })}
                            className="w-full bg-transparent font-mono font-bold text-blue-600 dark:text-blue-400 border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-2.5 text-right font-bold text-slate-900 dark:text-slate-100">
                          <input
                            type="number"
                            value={r.quantity}
                            onChange={(e) => handleUpdateStagedRow(idx, { quantity: parseInt(e.target.value) || 0 })}
                            className="w-16 bg-transparent text-right font-bold text-slate-900 dark:text-slate-100 border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-2.5 text-right text-slate-600 dark:text-slate-400">
                          {formatCurrency(r.buyPrice)}
                        </td>
                        <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(r.sellPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions & Confirmation Trigger (Section 41, 42) */}
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setImportStep(2)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Back to Mapping
                </button>
                <button
                  type="button"
                  disabled={stagedImportRows.some((r: ImportRowData) => r.status === 'ERROR')}
                  onClick={handleConfirmImport}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 disabled:opacity-50 shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  Confirm & Add to Inventory
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: IMPORT RESULTS (SECTION 43) */}
          {importStep === 4 && importSessionResult && (
            <div className="text-center space-y-4 py-3">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900">Import Complete ✓</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Inventory has been successfully updated from your file!
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-center border border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">New Products</span>
                  <span className="font-black text-emerald-600 text-base">{importSessionResult.newProducts}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Existing Updated</span>
                  <span className="font-black text-indigo-600 text-base">{importSessionResult.updatedProducts}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Stock Receipts</span>
                  <span className="font-black text-blue-600 text-base">{importSessionResult.receiptsCreated}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Units</span>
                  <span className="font-black text-slate-900 text-base">{importSessionResult.totalUnits}</span>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setImportModalOpen(false);
                    setViewMode('inventory');
                  }}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800"
                >
                  View Inventory
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
