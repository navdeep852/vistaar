import {
  Customer,
  Product,
  Category,
  Supplier,
  InventoryTransaction,
  Quotation,
  Invoice,
  Payment,
  Expense,
  FollowUp,
  Feedback,
  Offer,
  AppNotification,
  BusinessSettings,
  QuotationStatus,
  InvoiceStatus,
  StockMovementReason,
  UdhariStatus,
  UdhariRecord,
  UdhariPaymentRecord,
  PaymentMethod,
  StockReceipt,
  StockMovement,
  StockMovementType,
  InventorySettings,
  ImportSession,
  ImportRowData,
  CounterSale,
  CounterSaleItem,
  CounterSaleStatus,
} from '../types';
import { BrandingConfig, ThemeConfig, DocumentSnapshot } from '../types/template';
import { INVOICE_TEMPLATES } from '../templates/invoiceTemplates';
import { QUOTATION_TEMPLATES } from '../templates/quotationTemplates';

export function calculateUdhariStatus(originalAmount: number, totalReceived: number, dueDate: string): UdhariStatus {
  const outstanding = Math.max(0, originalAmount - totalReceived);
  const todayStr = new Date().toISOString().split('T')[0];
  if (outstanding <= 0) return 'PAID';
  if (dueDate < todayStr) return 'OVERDUE';
  if (totalReceived > 0) return 'PARTIALLY PAID';
  return 'UNPAID';
}

const STORAGE_KEY = 'vistaar_app_state_v2';

interface AppState {
  customers: Customer[];
  categories: Category[];
  suppliers: Supplier[];
  products: Product[];
  inventoryTransactions: InventoryTransaction[];
  quotations: Quotation[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  followUps: FollowUp[];
  feedbacks: Feedback[];
  offers: Offer[];
  notifications: AppNotification[];
  settings: BusinessSettings;
  favoriteTemplates: string[];
  lastUsedInvoiceTemplate: string;
  lastUsedQuotationTemplate: string;
  udharis: UdhariRecord[];
  udhariPayments: UdhariPaymentRecord[];
  inventorySettings: InventorySettings;
  stockReceipts: StockReceipt[];
  stockMovements: StockMovement[];
  importSessions: ImportSession[];
  counterSales: CounterSale[];
}

const initialSeedData: AppState = {
  settings: {
    businessName: 'VISTAAR Business Solutions',
    legalName: 'VISTAAR Technologies Private Limited',
    businessType: 'Private Limited',
    businessDescription: 'Wholesale Electronics & Office Hardware Supplies',
    ownerName: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    alternatePhone: '+91 98111 44455',
    email: 'contact@vistaar.in',
    website: 'https://vistaar.app',
    gstin: '27AAAAA0000A1Z5',
    pan: 'ABCDE1234F',
    regNumber: 'REG-2026-8899',
    address: 'Plot 42, Tech Park Sector 5',
    addressLine2: 'Powai Industrial Area',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400076',
    country: 'India',

    logoUrl: '',
    logoAlignment: 'left',
    logoScale: 1,

    signatureUrl: '',
    signatureAlignment: 'right',
    signatureScale: 1,

    stampUrl: '',
    stampAlignment: 'left',
    stampScale: 1,

    bankDetails: {
      bankName: 'HDFC Bank Ltd.',
      accountHolder: 'VISTAAR Technologies Pvt Ltd',
      accountNo: '50200012345678',
      ifscCode: 'HDFC0000240',
      branch: 'Powai Branch',
      upiId: 'vistaar@hdfcbank',
    },
    showBankDetailsOnInvoice: true,
    showBankDetailsOnQuotation: true,

    currency: '₹',
    defaultTaxMode: 'Exclusive',
    invoicePrefix: 'INV-',
    quotationPrefix: 'QT-',
    defaultPaymentTerms: 'Net 15',
    defaultQuotationValidity: '15 Days',
    defaultFont: 'Inter',
    defaultOrientation: 'portrait',
    defaultInvoiceTemplate: 'inv-modern-blue',
    defaultQuotationTemplate: 'qt-modern-blue',
    brandColor: '#2563eb',

    termsAndConditions: '1. Payment due within 15 days of invoice date.\n2. Goods once sold cannot be returned without prior approval.\n3. Subject to local jurisdiction.',
    defaultInvoiceTerms: '1. Payment due within 15 days of invoice date.\n2. Goods once sold cannot be returned without prior approval.\n3. Subject to local jurisdiction.',
    defaultQuotationTerms: '1. Quotation valid for 15 days from date of issue.\n2. Prices are subject to applicable GST taxes.\n3. Standard delivery terms apply.',
  },
  favoriteTemplates: ['inv-modern-blue', 'qt-modern-blue'],
  lastUsedInvoiceTemplate: 'inv-modern-blue',
  lastUsedQuotationTemplate: 'qt-modern-blue',
  categories: [
    { id: 'cat-1', name: 'Electronics', description: 'Gadgets and electronic components' },
    { id: 'cat-2', name: 'Office Supplies', description: 'Stationery and desk equipment' },
    { id: 'cat-3', name: 'Hardware & Tools', description: 'Construction and maintenance tools' },
  ],
  suppliers: [
    { id: 'sup-1', name: 'Apex Electronics Pvt Ltd', contactPerson: 'Suresh Kumar', phone: '+91 98111 22233', email: 'sales@apexelectronics.com', address: 'Nehru Place, New Delhi' },
    { id: 'sup-2', name: 'National Office Wholesale', contactPerson: 'Anil Gupta', phone: '+91 98222 33344', email: 'orders@nationaloffice.com', address: 'Crawford Market, Mumbai' },
  ],
  customers: [
    {
      id: 'cust-1',
      name: 'Rajesh Enterprise',
      phone: '9820011223',
      whatsapp: '9820011223',
      email: 'rajesh@enterprise.com',
      address: 'Shop 12, Main Market',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      gstin: '27ABCDE1234F1Z2',
      customerType: 'Wholesale',
      creditLimit: 100000,
      paymentTerms: 'Net 30',
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'cust-2',
      name: 'Priya Sharma',
      phone: '9833344455',
      whatsapp: '9833344455',
      email: 'priya.sharma@gmail.com',
      address: 'B-402, Green Acres',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      customerType: 'Retail',
      creditLimit: 25000,
      paymentTerms: 'Immediate',
      createdAt: '2026-08-05T14:30:00Z',
      updatedAt: '2026-08-05T14:30:00Z',
    },
  ],
  products: [
    {
      id: 'prod-1',
      name: 'Wireless Bluetooth Headset',
      sku: 'SKU-HEADSET-01',
      barcode: '8901234567890',
      categoryId: 'cat-1',
      unit: 'Pcs',
      buyPrice: 1200,
      sellingPrice: 1999,
      minimumStock: 10,
      currentStock: 35,
      taxPercent: 18,
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'prod-2',
      name: 'Ergonomic Desk Chair',
      productName: 'Ergonomic Desk Chair',
      partNumber: 'SKU-CHAIR-02',
      productCode: 'SKU-CHAIR-02',
      sku: 'SKU-CHAIR-02',
      barcode: '8901234567891',
      categoryId: 'cat-2',
      unit: 'Pcs',
      buyPrice: 3500,
      currentBuyPrice: 3500,
      sellingPrice: 5999,
      currentSellPrice: 5999,
      minimumStock: 5,
      minimumStockLevel: 5,
      currentStock: 4,
      taxPercent: 18,
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
      active: true,
    },
    {
      id: 'prod-3',
      name: 'ABC Bearing',
      productName: 'ABC Bearing',
      partNumber: '10009106A',
      productCode: '10009106A',
      sku: '10009106A',
      categoryId: 'cat-3',
      category: 'Hardware & Tools',
      brand: 'ABC Bearings',
      unit: 'Pcs',
      buyPrice: 120,
      currentBuyPrice: 125,
      sellingPrice: 175,
      currentSellPrice: 175,
      minimumStock: 10,
      minimumStockLevel: 10,
      currentStock: 25,
      taxPercent: 18,
      createdAt: '2026-08-10T10:00:00Z',
      updatedAt: '2026-08-18T10:00:00Z',
      active: true,
    },
  ],
  inventoryTransactions: [],
  quotations: [],
  invoices: [],
  payments: [],
  expenses: [
    {
      id: 'exp-2026-001',
      category: 'Other',
      expenseName: 'Computer Repair',
      amount: 5000,
      date: '2026-08-23',
      paidTo: 'TechCare Solutions',
      referenceNo: 'TXN-9988',
      notes: 'Repaired motherboard for office workstation',
      createdAt: '2026-08-23T07:00:00Z',
    },
    {
      id: 'exp-2026-002',
      category: 'Marketing',
      amount: 2000,
      date: '2026-08-22',
      paidTo: 'Facebook Ads',
      referenceNo: 'FB-9021',
      notes: 'Social media ad campaign',
      createdAt: '2026-08-22T10:00:00Z',
    },
    {
      id: 'exp-2026-003',
      category: 'Electricity',
      amount: 8500,
      date: '2026-08-21',
      paidTo: 'State Electricity Board',
      referenceNo: 'EB-2026-08',
      notes: 'Monthly power bill',
      createdAt: '2026-08-21T09:00:00Z',
    },
    {
      id: 'exp-2026-004',
      category: 'Rent',
      amount: 25000,
      date: '2026-08-01',
      paidTo: 'Apex Properties',
      referenceNo: 'CHQ-40291',
      notes: 'August shop rent',
      createdAt: '2026-08-01T08:00:00Z',
    },
    {
      id: 'exp-2025-001',
      category: 'Maintenance',
      amount: 3200,
      date: '2025-12-15',
      paidTo: 'City Plumbing',
      referenceNo: 'INV-4410',
      notes: 'Washroom pipe repair',
      createdAt: '2025-12-15T11:00:00Z',
    },
  ],
  followUps: [],
  feedbacks: [],
  offers: [],
  notifications: [],
  udharis: [
    {
      id: 'UD-2026-0001',
      customerId: 'cust-1',
      customerNameSnapshot: 'Rajesh Enterprise',
      phoneSnapshot: '9820011223',
      originalAmount: 10000,
      totalReceived: 4000,
      outstandingAmount: 6000,
      dueDate: '2026-08-28',
      notes: '2 bags rice & raw materials',
      status: 'PARTIALLY PAID',
      createdAt: '2026-08-15T10:00:00Z',
      updatedAt: '2026-08-18T14:00:00Z',
    },
    {
      id: 'UD-2026-0002',
      customerId: 'cust-2',
      customerNameSnapshot: 'Priya Sharma',
      phoneSnapshot: '9833344455',
      originalAmount: 5000,
      totalReceived: 0,
      outstandingAmount: 5000,
      dueDate: '2026-08-30',
      notes: 'Advance pending for furniture work',
      status: 'UNPAID',
      createdAt: '2026-08-20T09:30:00Z',
      updatedAt: '2026-08-20T09:30:00Z',
    },
    {
      id: 'UD-2026-0003',
      customerNameSnapshot: 'Amit Verma',
      phoneSnapshot: '9899988877',
      originalAmount: 8000,
      totalReceived: 0,
      outstandingAmount: 8000,
      dueDate: '2026-08-10',
      notes: 'Hardware items delivered',
      status: 'OVERDUE',
      createdAt: '2026-08-01T11:00:00Z',
      updatedAt: '2026-08-01T11:00:00Z',
    },
    {
      id: 'UD-2026-0004',
      customerNameSnapshot: 'Suresh Patel',
      phoneSnapshot: '9844455566',
      originalAmount: 15000,
      totalReceived: 15000,
      outstandingAmount: 0,
      dueDate: '2026-08-25',
      notes: 'Bulk office stationery',
      status: 'PAID',
      createdAt: '2026-08-05T12:00:00Z',
      updatedAt: '2026-08-12T16:00:00Z',
    },
  ],
  udhariPayments: [
    {
      id: 'PAY-2026-0001',
      udhariId: 'UD-2026-0001',
      customerId: 'cust-1',
      amount: 4000,
      paymentMethod: 'UPI',
      paymentDate: '2026-08-18',
      phoneNumber: '9820011223',
      reference: 'UPI/6049281039',
      notes: 'First partial payment received via Google Pay',
      createdAt: '2026-08-18T14:00:00Z',
    },
    {
      id: 'PAY-2026-0002',
      udhariId: 'UD-2026-0004',
      amount: 15000,
      paymentMethod: 'Bank Transfer',
      paymentDate: '2026-08-12',
      phoneNumber: '9844455566',
      reference: 'NEFT-HDFC-91023',
      notes: 'Full amount settled in bank account',
      createdAt: '2026-08-12T16:00:00Z',
    },
  ],
  inventorySettings: {
    usesPartNumber: true,
  },
  stockReceipts: [
    {
      id: 'rec-1',
      productId: 'prod-1',
      receiptNumber: 'GRN-0001',
      purchaseOrderNumber: 'PO-2026-001',
      receivedDate: '2026-08-01',
      quantityReceived: 20,
      quantityRemaining: 20,
      buyPrice: 1200,
      reference: 'Initial Stock Batch',
      createdAt: '2026-08-01T10:00:00Z',
      updatedAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'rec-2',
      productId: 'prod-1',
      receiptNumber: 'GRN-0002',
      purchaseOrderNumber: 'PO-2026-005',
      receivedDate: '2026-08-15',
      quantityReceived: 15,
      quantityRemaining: 15,
      buyPrice: 1250,
      reference: 'Second Stock Purchase',
      createdAt: '2026-08-15T10:00:00Z',
      updatedAt: '2026-08-15T10:00:00Z',
    },
    {
      id: 'rec-3',
      productId: 'prod-2',
      receiptNumber: 'GRN-0003',
      purchaseOrderNumber: 'PO-2026-002',
      receivedDate: '2026-08-05',
      quantityReceived: 4,
      quantityRemaining: 4,
      buyPrice: 3500,
      reference: 'Opening Office Chairs',
      createdAt: '2026-08-05T10:00:00Z',
      updatedAt: '2026-08-05T10:00:00Z',
    },
    {
      id: 'rec-4',
      productId: 'prod-3',
      receiptNumber: 'GRN-0004',
      purchaseOrderNumber: 'PO-2026-001',
      receivedDate: '2026-08-10',
      quantityReceived: 10,
      quantityRemaining: 10,
      buyPrice: 120,
      reference: 'First Batch ABC Bearings',
      createdAt: '2026-08-10T10:00:00Z',
      updatedAt: '2026-08-10T10:00:00Z',
    },
    {
      id: 'rec-5',
      productId: 'prod-3',
      receiptNumber: 'GRN-0005',
      purchaseOrderNumber: 'PO-2026-008',
      receivedDate: '2026-08-18',
      quantityReceived: 15,
      quantityRemaining: 15,
      buyPrice: 125,
      reference: 'Second Batch ABC Bearings',
      createdAt: '2026-08-18T10:00:00Z',
      updatedAt: '2026-08-18T10:00:00Z',
    },
  ],
  stockMovements: [
    {
      id: 'mov-1',
      productId: 'prod-1',
      stockReceiptId: 'rec-1',
      type: 'STOCK_RECEIVED',
      quantity: 20,
      date: '2026-08-01',
      referenceId: 'PO-2026-001',
      notes: 'Received 20 units @ ₹1,200',
      createdAt: '2026-08-01T10:00:00Z',
    },
    {
      id: 'mov-2',
      productId: 'prod-1',
      stockReceiptId: 'rec-2',
      type: 'STOCK_RECEIVED',
      quantity: 15,
      date: '2026-08-15',
      referenceId: 'PO-2026-005',
      notes: 'Received 15 units @ ₹1,250',
      createdAt: '2026-08-15T10:00:00Z',
    },
    {
      id: 'mov-3',
      productId: 'prod-2',
      stockReceiptId: 'rec-3',
      type: 'STOCK_RECEIVED',
      quantity: 4,
      date: '2026-08-05',
      referenceId: 'PO-2026-002',
      notes: 'Received 4 units @ ₹3,500',
      createdAt: '2026-08-05T10:00:00Z',
    },
    {
      id: 'mov-4',
      productId: 'prod-3',
      stockReceiptId: 'rec-4',
      type: 'STOCK_RECEIVED',
      quantity: 10,
      date: '2026-08-10',
      referenceId: 'PO-2026-001',
      notes: 'Received 10 units @ ₹120',
      createdAt: '2026-08-10T10:00:00Z',
    },
    {
      id: 'mov-5',
      productId: 'prod-3',
      stockReceiptId: 'rec-5',
      type: 'STOCK_RECEIVED',
      quantity: 15,
      date: '2026-08-18',
      referenceId: 'PO-2026-008',
      notes: 'Received 15 units @ ₹125',
      createdAt: '2026-08-18T10:00:00Z',
    },
  ],
  importSessions: [],
  counterSales: [],
};


class StoreService {
  private state: AppState;
  private listeners: Set<() => void> = new Set();
  private syncTimer: any = null;

  constructor() {
    this.state = this.loadFromStorage();
    if (typeof window !== 'undefined') {
      this.initServerSync();
    }
  }

  private initServerSync() {
    this.pushToServer().then(() => this.pullFromServer()).catch(() => {});
    this.syncTimer = setInterval(() => {
      this.pullFromServer().catch(() => {});
    }, 5000);
  }

  private async pushToServer() {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followUps: this.state.followUps,
          notifications: this.state.notifications,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        this.applyServerData(data);
      }
    } catch (e) {
      // Ignore offline sync errors
    }
  }

  private async pullFromServer() {
    try {
      const res = await fetch('/api/sync', { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        this.applyServerData(data);
      }
    } catch (e) {
      // Ignore offline sync errors
    }
  }

  private applyServerData(data: any) {
    let changed = false;

    if (Array.isArray(data.followUps)) {
      const map = new Map<string, FollowUp>();
      this.state.followUps.forEach((f) => map.set(f.id, f));
      data.followUps.forEach((sf: FollowUp) => {
        const existing = map.get(sf.id);
        if (!existing || existing.status !== sf.status || existing.errorMessage !== sf.errorMessage) {
          map.set(sf.id, sf);
          changed = true;
        }
      });
      if (changed) {
        this.state.followUps = Array.from(map.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
    }

    if (Array.isArray(data.notifications)) {
      const notifMap = new Map<string, AppNotification>();
      this.state.notifications.forEach((n) => notifMap.set(n.id, n));
      data.notifications.forEach((sn: AppNotification) => {
        if (!notifMap.has(sn.id)) {
          notifMap.set(sn.id, sn);
          changed = true;
        }
      });
      if (changed) {
        this.state.notifications = Array.from(notifMap.values());
      }
    }

    if (changed) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {
        console.error('Failed to save updated state to localStorage', e);
      }
      this.notify();
    }
  }

  private loadFromStorage(): AppState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...initialSeedData, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to load state from localStorage', e);
    }
    return initialSeedData;
  }

  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error('Failed to save state to localStorage', e);
    }
    this.notify();
    if (typeof window !== 'undefined') {
      this.pushToServer();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  public getState(): AppState {
    return this.state;
  }

  public getSettings(): BusinessSettings {
    return this.state.settings;
  }

  public getTheme(): 'light' | 'dark' {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('vistaar_theme');
      if (stored === 'dark' || stored === 'light') {
        return stored;
      }
    }
    return this.state.settings?.theme || 'light';
  }

  public setTheme(theme: 'light' | 'dark') {
    this.state.settings = { ...this.state.settings, theme };
    if (typeof window !== 'undefined') {
      localStorage.setItem('vistaar_theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    this.saveToStorage();
  }

  public updateSettings(newSettings: Partial<BusinessSettings>) {
    this.state.settings = { ...this.state.settings, ...newSettings };
    if (newSettings.theme) {
      this.setTheme(newSettings.theme);
    } else {
      this.saveToStorage();
    }
  }

  public validateAssetFile(file: File): { valid: boolean; error?: string } {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type.toLowerCase()) && !file.name.match(/\.(png|jpe?g|webp|svg)$/i)) {
      return {
        valid: false,
        error: 'File format not supported. Please upload a PNG, JPG, JPEG, WEBP, or SVG image.',
      };
    }
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        error: `File size exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please choose a smaller image.`,
      };
    }
    return { valid: true };
  }

  // Favorite & Last Used Templates
  public getFavoriteTemplates(): string[] {
    return this.state.favoriteTemplates || [];
  }

  public toggleFavoriteTemplate(templateId: string) {
    const favs = new Set(this.state.favoriteTemplates || []);
    if (favs.has(templateId)) {
      favs.delete(templateId);
    } else {
      favs.add(templateId);
    }
    this.state.favoriteTemplates = Array.from(favs);
    this.saveToStorage();
  }

  public getLastUsedTemplate(type: 'invoice' | 'quotation'): string {
    return type === 'invoice'
      ? this.state.lastUsedInvoiceTemplate || 'inv-modern-blue'
      : this.state.lastUsedQuotationTemplate || 'qt-modern-blue';
  }

  public saveLastUsedTemplate(type: 'invoice' | 'quotation', templateId: string) {
    if (type === 'invoice') {
      this.state.lastUsedInvoiceTemplate = templateId;
    } else {
      this.state.lastUsedQuotationTemplate = templateId;
    }
    this.saveToStorage();
  }

  // Historic Document Snapshot Generator
  public buildSnapshot(
    templateId: string,
    branding?: BrandingConfig,
    theme?: ThemeConfig,
    notes?: string,
    terms?: string,
    footerText?: string
  ): DocumentSnapshot {
    const s = this.state.settings;
    const defaultBranding: BrandingConfig = {
      logoUrl: s.logoUrl,
      logoAlignment: s.logoAlignment || 'left',
      logoScale: s.logoScale || 1,
      signatureUrl: s.signatureUrl,
      signatureScale: s.signatureScale || 1,
      stampUrl: s.stampUrl,
      stampScale: s.stampScale || 1,
    };

    const defaultTheme: ThemeConfig = {
      primaryColor: s.brandColor || '#2563eb',
      secondaryColor: '#3b82f6',
      textColor: '#0f172a',
      fontFamily: 'Inter',
    };

    return {
      businessName: s.businessName,
      phone: s.phone,
      email: s.email,
      address: s.address,
      city: s.city,
      state: s.state,
      pincode: s.pincode,
      gstin: s.gstin,
      currency: s.currency,
      bankDetails: { ...s.bankDetails },
      branding: branding || defaultBranding,
      theme: theme || defaultTheme,
      templateId,
      terms: terms || s.termsAndConditions,
      notes: notes || '',
      footerText: footerText || 'Thank you for your business!',
    };
  }

  // Customers
  public getCustomers(): Customer[] {
    return this.state.customers;
  }

  public addCustomer(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Customer {
    const newCustomer: Customer = {
      ...customer,
      id: `cust-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.customers.unshift(newCustomer);
    this.saveToStorage();
    return newCustomer;
  }

  public getCategories(): Category[] {
    return this.state.categories;
  }

  public getSuppliers(): Supplier[] {
    return this.state.suppliers;
  }


  public adjustStock(
    productId: string,
    type: StockMovementReason,
    quantityDelta: number,
    notes?: string,
    referenceNo?: string
  ) {
    const product = this.state.products.find((p) => p.id === productId);
    if (!product) return;

    const previousStock = product.currentStock;
    const newStock = Math.max(0, previousStock + quantityDelta);

    product.currentStock = newStock;
    product.updatedAt = new Date().toISOString();

    // 1. Update local stockReceipts FIFO if deducting
    if (quantityDelta < 0) {
      let remainingToDeduct = Math.abs(quantityDelta);
      for (const rec of this.state.stockReceipts) {
        if (rec.productId === productId && rec.quantityRemaining > 0) {
          const deduct = Math.min(rec.quantityRemaining, remainingToDeduct);
          rec.quantityRemaining -= deduct;
          rec.updatedAt = new Date().toISOString();
          remainingToDeduct -= deduct;
          if (remainingToDeduct <= 0) break;
        }
      }
    } else if (quantityDelta > 0 && type === 'Sales Return') {
      const rec = this.state.stockReceipts.find((r) => r.productId === productId);
      if (rec) {
        rec.quantityRemaining += quantityDelta;
        rec.updatedAt = new Date().toISOString();
      }
    }

    // 2. Add StockMovement record
    const movementType: StockMovementType = quantityDelta < 0 ? 'SALE' : type === 'Sales Return' ? 'RETURN' : 'ADJUSTMENT';
    const mov: StockMovement = {
      id: `mov-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId,
      type: movementType,
      quantity: quantityDelta,
      date: new Date().toISOString().split('T')[0],
      referenceId: referenceNo,
      notes: notes || `Stock Adjustment: ${type}`,
      createdAt: new Date().toISOString(),
    };
    if (!this.state.stockMovements) this.state.stockMovements = [];
    this.state.stockMovements.unshift(mov);

    const txn: InventoryTransaction = {
      id: `txn-${Date.now()}`,
      productId,
      type,
      quantityDelta,
      previousStock,
      newStock,
      notes,
      referenceNo,
      date: new Date().toISOString(),
    };
    this.state.inventoryTransactions.unshift(txn);
    this.saveToStorage();
  }

  // Quotations
  public getQuotations(): Quotation[] {
    return this.state.quotations;
  }

  public addQuotation(quotationData: Omit<Quotation, 'id' | 'quotationNumber' | 'createdAt' | 'updatedAt'>): Quotation {
    const count = this.state.quotations.length + 1;
    const year = new Date().getFullYear();
    const quotationNumber = `QT-${year}-${String(count).padStart(4, '0')}`;

    const snapshot = quotationData.snapshot || this.buildSnapshot(
      quotationData.templateId || 'qt-modern-blue',
      quotationData.branding,
      quotationData.theme,
      quotationData.notes,
      quotationData.terms,
      quotationData.footerText
    );

    const newQuotation: Quotation = {
      ...quotationData,
      id: `qt-${Date.now()}`,
      quotationNumber,
      templateId: quotationData.templateId || 'qt-modern-blue',
      snapshot,
      isSnapshotFinalized: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.saveLastUsedTemplate('quotation', newQuotation.templateId);
    this.state.quotations.unshift(newQuotation);
    this.saveToStorage();
    return newQuotation;
  }

  public updateQuotationStatus(id: string, status: QuotationStatus) {
    const qt = this.state.quotations.find((q) => q.id === id);
    if (qt) {
      qt.status = status;
      qt.updatedAt = new Date().toISOString();
      this.saveToStorage();
    }
  }

  public convertQuotationToInvoice(quotationId: string): Invoice | null {
    const qt = this.state.quotations.find((q) => q.id === quotationId);
    if (!qt || qt.status === 'Converted') return null;

    const inv = this.addInvoice({
      quotationId: qt.id,
      customerId: qt.customerId,
      customerName: qt.customerName,
      customerPhone: qt.customerPhone,
      customerWhatsapp: qt.customerWhatsapp,
      customerEmail: qt.customerEmail,
      customerAddress: qt.customerAddress,
      customerGstin: qt.customerGstin,
      status: 'Issued',
      date: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
      items: qt.items.map((i) => ({ ...i })),
      subtotal: qt.subtotal,
      discountTotal: qt.discountTotal,
      taxTotal: qt.taxTotal,
      grandTotal: qt.grandTotal,
      paidAmount: 0,
      balanceAmount: qt.grandTotal,
      notes: qt.notes,
      terms: qt.terms,
      footerText: qt.footerText,
      templateId: qt.templateId.replace('qt-', 'inv-') || 'inv-modern-blue',
      branding: qt.branding,
      theme: qt.theme,
    });

    qt.status = 'Converted';
    qt.convertedInvoiceId = inv.id;
    this.saveToStorage();
    return inv;
  }

  // Invoices
  public getInvoices(): Invoice[] {
    return this.state.invoices;
  }

  public addInvoice(invoiceData: Omit<Invoice, 'id' | 'invoiceNumber' | 'createdAt' | 'updatedAt'>): Invoice {
    const count = this.state.invoices.length + 1;
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${String(count).padStart(4, '0')}`;

    const snapshot = invoiceData.snapshot || this.buildSnapshot(
      invoiceData.templateId || 'inv-modern-blue',
      invoiceData.branding,
      invoiceData.theme,
      invoiceData.notes,
      invoiceData.terms,
      invoiceData.footerText
    );

    const newInvoice: Invoice = {
      ...invoiceData,
      id: `inv-${Date.now()}`,
      invoiceNumber,
      templateId: invoiceData.templateId || 'inv-modern-blue',
      snapshot,
      isSnapshotFinalized: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Deduct stock for linked product items
    newInvoice.items.forEach((item) => {
      if (item.productId) {
        this.adjustStock(item.productId, 'Sale', -item.quantity, `Invoice Sale ${invoiceNumber}`, invoiceNumber);
      }
    });

    this.saveLastUsedTemplate('invoice', newInvoice.templateId);
    this.state.invoices.unshift(newInvoice);
    this.saveToStorage();
    return newInvoice;
  }

  // Payments
  public getPayments(): Payment[] {
    return this.state.payments;
  }

  public recordPayment(paymentData: Omit<Payment, 'id' | 'paymentNumber' | 'createdAt'>): Payment {
    const count = this.state.payments.length + 1;
    const year = new Date().getFullYear();
    const paymentNumber = `PAY-${year}-${String(count).padStart(4, '0')}`;

    const newPayment: Payment = {
      ...paymentData,
      id: `pay-${Date.now()}`,
      paymentNumber,
      createdAt: new Date().toISOString(),
    };

    this.state.payments.unshift(newPayment);

    if (paymentData.invoiceId) {
      const inv = this.state.invoices.find((i) => i.id === paymentData.invoiceId);
      if (inv) {
        const updatedPaid = inv.paidAmount + paymentData.amount;
        const updatedBalance = Math.max(0, inv.grandTotal - updatedPaid);
        const newStatus: InvoiceStatus = updatedBalance <= 0 ? 'Paid' : 'Partially Paid';

        inv.paidAmount = updatedPaid;
        inv.balanceAmount = updatedBalance;
        inv.status = newStatus;
        inv.updatedAt = new Date().toISOString();
      }
    }

    this.saveToStorage();
    return newPayment;
  }

  // Expenses, Follow-ups, Feedbacks, Offers, Notifications
  public getExpenses(): Expense[] { return this.state.expenses; }
  public addExpense(expense: Omit<Expense, 'id' | 'createdAt'>): Expense {
    const newExp: Expense = { ...expense, id: `exp-${Date.now()}`, createdAt: new Date().toISOString() };
    this.state.expenses.unshift(newExp);
    this.saveToStorage();
    return newExp;
  }
  public updateExpense(id: string, updated: Partial<Omit<Expense, 'id' | 'createdAt'>>): Expense | null {
    const exp = this.state.expenses.find((e) => e.id === id);
    if (!exp) return null;
    Object.assign(exp, updated);
    this.saveToStorage();
    return exp;
  }
  public deleteExpense(id: string): boolean {
    const initialLen = this.state.expenses.length;
    this.state.expenses = this.state.expenses.filter((e) => e.id !== id);
    if (this.state.expenses.length !== initialLen) {
      this.saveToStorage();
      return true;
    }
    return false;
  }

  public getFollowUps(): FollowUp[] { return this.state.followUps; }
  public addFollowUp(followUp: Omit<FollowUp, 'id' | 'createdAt'>): FollowUp {
    const now = new Date().toISOString();
    const newFol: FollowUp = {
      ...followUp,
      id: `fol-${Date.now()}`,
      actionType: followUp.actionType || 'INTERNAL_REMINDER',
      actionConfig: followUp.actionConfig || {},
      attemptCount: typeof followUp.attemptCount === 'number' ? followUp.attemptCount : 0,
      maxAttempts: typeof followUp.maxAttempts === 'number' ? followUp.maxAttempts : 3,
      executionLogs: Array.isArray(followUp.executionLogs)
        ? followUp.executionLogs
        : [
            {
              timestamp: now,
              level: 'info',
              message: `Follow-up scheduled for ${followUp.dueDate} at ${followUp.dueTime} IST. Action: ${followUp.actionType || 'INTERNAL_REMINDER'}`,
            },
          ],
      createdAt: now,
    };
    this.state.followUps.unshift(newFol);
    this.saveToStorage();
    return newFol;
  }

  public updateFollowUpStatus(id: string, status: FollowUp['status']) {
    const fol = this.state.followUps.find((f) => f.id === id);
    if (fol) {
      fol.status = status;
      if (status === 'Completed') {
        fol.completedAt = new Date().toISOString();
      }
      this.saveToStorage();
    }
  }

  public updateFollowUpMessage(id: string, message: string): boolean {
    const fol = this.state.followUps.find((f) => f.id === id);
    if (!fol) return false;
    if (!fol.actionConfig) fol.actionConfig = {};
    fol.actionConfig.message = message;
    fol.notes = message;
    this.saveToStorage();
    return true;
  }

  public markWhatsAppOpened(id: string): boolean {
    const fol = this.state.followUps.find((f) => f.id === id);
    if (!fol) return false;
    if (!fol.actionConfig) fol.actionConfig = {};
    const now = new Date().toISOString();
    fol.actionConfig.wasWhatsAppOpened = true;
    fol.actionConfig.whatsappOpenedAt = now;
    if (!Array.isArray(fol.executionLogs)) fol.executionLogs = [];
    fol.executionLogs.push({
      timestamp: now,
      level: 'info',
      message: 'Opened in WhatsApp Web / App for manual user review and dispatch.',
    });
    this.saveToStorage();
    return true;
  }

  public retryFollowUp(id: string): boolean {
    const fol = this.state.followUps.find((f) => f.id === id);
    if (!fol) return false;
    const now = new Date().toISOString();
    fol.status = 'Pending';
    fol.attemptCount = 0;
    fol.errorMessage = undefined;
    fol.failedAt = undefined;
    fol.completedAt = undefined;

    if (!Array.isArray(fol.executionLogs)) {
      fol.executionLogs = [];
    }
    fol.executionLogs.push({
      timestamp: now,
      level: 'info',
      message: 'Manual retry triggered by user. Reset status to Pending.',
    });

    this.saveToStorage();
    return true;
  }

  public async testFollowUpAction(id: string): Promise<any> {
    // Sync current state to server first
    await this.pushToServer();
    try {
      const response = await fetch('/api/follow-ups/test-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpId: id }),
      });
      const data = await response.json();
      // Fetch latest server state after test action run
      await this.pullFromServer();
      return data;
    } catch (err: any) {
      console.error('[StoreService] Test action call failed:', err);
      return { success: false, error: err?.message || 'Test action request failed.' };
    }
  }

  public getFeedbacks(): Feedback[] { return this.state.feedbacks; }
  public getOffers(): Offer[] { return this.state.offers; }
  public getNotifications(): AppNotification[] { return this.state.notifications; }

  public markNotificationRead(id: string) {
    const n = this.state.notifications.find((notif) => notif.id === id);
    if (n) {
      n.read = true;
      this.saveToStorage();
    }
  }

  public markAllNotificationsRead() {
    this.state.notifications.forEach((n) => (n.read = true));
    this.saveToStorage();
  }

  // Ledger calculation
  public getCustomerLedger(customerId: string) {
    const customer = this.state.customers.find((c) => c.id === customerId);
    const invoices = this.state.invoices.filter((i) => (i.customerId === customerId || i.customerName === customer?.name) && i.status !== 'Cancelled');
    const payments = this.state.payments.filter((p) => p.customerId === customerId || p.customerName === customer?.name);

    const totalDebit = invoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
    const totalCredit = payments.reduce((acc, pay) => acc + pay.amount, 0);
    const outstanding = Math.max(0, totalDebit - totalCredit);

    return { invoices, payments, totalDebit, totalCredit, outstanding };
  }

  // P&L calculation
  public calculatePL() {
    const issuedInvoices = this.state.invoices.filter((i) => i.status !== 'Cancelled' && i.status !== 'Draft');
    const revenue = issuedInvoices.reduce((acc, inv) => acc + inv.grandTotal, 0);
    const cogs = issuedInvoices.reduce((acc, inv) => {
      const invoiceCogs = inv.items.reduce((itemAcc, item) => itemAcc + (item.quantity * (item.buyPrice || 0)), 0);
      return acc + invoiceCogs;
    }, 0);
    const grossProfit = revenue - cogs;
    const totalExpenses = this.state.expenses.reduce((acc, exp) => acc + exp.amount, 0);
    const netProfit = grossProfit - totalExpenses;

    return { revenue, cogs, grossProfit, expenses: totalExpenses, netProfit };
  }

  // --- UDHARI LEDGER METHODS ---

  public getUdharis(): UdhariRecord[] {
    if (!this.state.udharis) {
      this.state.udharis = [];
    }
    if (!this.state.udhariPayments) {
      this.state.udhariPayments = [];
    }

    // Auto-update statuses based on current date & total received
    let changed = false;
    this.state.udharis.forEach((u) => {
      const payments = this.state.udhariPayments.filter((p) => p.udhariId === u.id);
      const totalReceived = payments.reduce((acc, p) => acc + p.amount, 0);
      const outstandingAmount = Math.max(0, u.originalAmount - totalReceived);
      const newStatus = calculateUdhariStatus(u.originalAmount, totalReceived, u.dueDate);

      if (
        u.totalReceived !== totalReceived ||
        u.outstandingAmount !== outstandingAmount ||
        u.status !== newStatus
      ) {
        u.totalReceived = totalReceived;
        u.outstandingAmount = outstandingAmount;
        u.status = newStatus;
        u.updatedAt = new Date().toISOString();
        changed = true;
      }
    });

    if (changed) {
      this.saveToStorage();
    }

    return this.state.udharis;
  }

  public getUdhariPayments(): UdhariPaymentRecord[] {
    return this.state.udhariPayments || [];
  }

  public addUdhari(data: {
    customerNameSnapshot: string;
    phoneSnapshot: string;
    originalAmount: number;
    dueDate: string;
    notes?: string;
    customerId?: string;
  }): UdhariRecord {
    if (!this.state.udharis) this.state.udharis = [];
    if (data.originalAmount <= 0) {
      throw new Error('Udhari amount must be greater than zero.');
    }

    const count = this.state.udharis.length + 1;
    const year = new Date().getFullYear();
    const id = `UD-${year}-${String(count).padStart(4, '0')}`;
    const now = new Date().toISOString();

    const initialStatus = calculateUdhariStatus(data.originalAmount, 0, data.dueDate);

    const newUdhari: UdhariRecord = {
      id,
      customerId: data.customerId,
      customerNameSnapshot: data.customerNameSnapshot.trim(),
      phoneSnapshot: data.phoneSnapshot.trim(),
      originalAmount: Number(data.originalAmount),
      totalReceived: 0,
      outstandingAmount: Number(data.originalAmount),
      dueDate: data.dueDate,
      notes: data.notes?.trim() || '',
      status: initialStatus,
      createdAt: now,
      updatedAt: now,
    };

    this.state.udharis.unshift(newUdhari);
    this.saveToStorage();
    return newUdhari;
  }

  public recordUdhariPayment(data: {
    udhariId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    phoneNumber: string;
    reference?: string;
    notes?: string;
  }): { payment: UdhariPaymentRecord; udhari: UdhariRecord } {
    if (!this.state.udharis) this.state.udharis = [];
    if (!this.state.udhariPayments) this.state.udhariPayments = [];

    const udhari = this.state.udharis.find((u) => u.id === data.udhariId);
    if (!udhari) {
      throw new Error('Udhari record not found.');
    }

    const receivedAmount = Number(data.amount);
    if (isNaN(receivedAmount) || receivedAmount <= 0) {
      throw new Error('Please enter a valid received amount greater than ₹0.');
    }

    if (receivedAmount > udhari.outstandingAmount) {
      throw new Error('Amount received cannot be greater than the outstanding balance.');
    }

    const count = this.state.udhariPayments.length + 1;
    const year = new Date().getFullYear();
    const paymentId = `PAY-${year}-${String(count).padStart(4, '0')}`;
    const now = new Date().toISOString();

    const newPayment: UdhariPaymentRecord = {
      id: paymentId,
      udhariId: udhari.id,
      customerId: udhari.customerId,
      amount: receivedAmount,
      paymentMethod: data.paymentMethod,
      paymentDate: data.paymentDate || now.split('T')[0],
      phoneNumber: data.phoneNumber.trim(),
      reference: data.reference?.trim(),
      notes: data.notes?.trim(),
      createdAt: now,
    };

    this.state.udhariPayments.unshift(newPayment);

    // Recalculate Udhari stats
    const totalReceived = udhari.totalReceived + receivedAmount;
    const outstandingAmount = Math.max(0, udhari.originalAmount - totalReceived);
    const newStatus = calculateUdhariStatus(udhari.originalAmount, totalReceived, udhari.dueDate);

    udhari.totalReceived = totalReceived;
    udhari.outstandingAmount = outstandingAmount;
    udhari.status = newStatus;
    udhari.updatedAt = now;

    this.saveToStorage();
    return { payment: newPayment, udhari };
  }

  public getUdhariHistory(udhariId: string) {
    const udhari = (this.state.udharis || []).find((u) => u.id === udhariId);
    const payments = (this.state.udhariPayments || []).filter((p) => p.udhariId === udhariId);
    return { udhari, payments };
  }

  public editUdhari(
    id: string,
    data: {
      customerNameSnapshot?: string;
      phoneSnapshot?: string;
      originalAmount?: number;
      dueDate?: string;
      notes?: string;
    }
  ): UdhariRecord | null {
    const udhari = (this.state.udharis || []).find((u) => u.id === id);
    if (!udhari) return null;

    if (data.originalAmount !== undefined && data.originalAmount !== udhari.originalAmount) {
      if (udhari.totalReceived > 0) {
        throw new Error('Cannot edit original amount once payments have been recorded.');
      }
      if (data.originalAmount <= 0) {
        throw new Error('Udhari amount must be greater than zero.');
      }
      udhari.originalAmount = Number(data.originalAmount);
      udhari.outstandingAmount = Number(data.originalAmount);
    }

    if (data.customerNameSnapshot) udhari.customerNameSnapshot = data.customerNameSnapshot.trim();
    if (data.phoneSnapshot) udhari.phoneSnapshot = data.phoneSnapshot.trim();
    if (data.dueDate) udhari.dueDate = data.dueDate;
    if (data.notes !== undefined) udhari.notes = data.notes.trim();

    udhari.status = calculateUdhariStatus(udhari.originalAmount, udhari.totalReceived, udhari.dueDate);
    udhari.updatedAt = new Date().toISOString();

    this.saveToStorage();
    return udhari;
  }

  public deleteUdhari(id: string): boolean {
    const index = (this.state.udharis || []).findIndex((u) => u.id === id);
    if (index === -1) return false;

    const udhari = this.state.udharis[index];
    if (udhari.totalReceived > 0) {
      throw new Error('Cannot delete an Udhari record that has associated payment transactions.');
    }

    this.state.udharis.splice(index, 1);
    this.state.udhariPayments = (this.state.udhariPayments || []).filter((p) => p.udhariId !== id);
    this.saveToStorage();
    return true;
  }

  public getUdhariMetrics() {
    const udharis = this.getUdharis();
    const totalUdhari = udharis.reduce((acc, u) => acc + u.originalAmount, 0);
    const outstanding = udharis.reduce((acc, u) => acc + u.outstandingAmount, 0);
    const received = udharis.reduce((acc, u) => acc + u.totalReceived, 0);
    const overdue = udharis.filter((u) => u.status === 'OVERDUE').reduce((acc, u) => acc + u.outstandingAmount, 0);

    return { totalUdhari, outstanding, received, overdue };
  }

  // --- INVENTORY MANAGEMENT METHODS ---

  public getInventorySettings(): InventorySettings {
    if (!this.state.inventorySettings) {
      this.state.inventorySettings = { usesPartNumber: null };
    }
    return this.state.inventorySettings;
  }

  public updateInventorySettings(settings: Partial<InventorySettings>) {
    if (!this.state.inventorySettings) {
      this.state.inventorySettings = { usesPartNumber: null };
    }
    this.state.inventorySettings = { ...this.state.inventorySettings, ...settings };
    this.saveToStorage();
  }

  public getProductAvailableStock(productId: string): number {
    const receipts = (this.state.stockReceipts || []).filter((r) => r.productId === productId);
    return receipts.reduce((acc, r) => acc + Math.max(0, r.quantityRemaining), 0);
  }

  public getProducts(): Product[] {
    if (!this.state.products) this.state.products = [];
    if (!this.state.stockReceipts) this.state.stockReceipts = [];

    // Recalculate availableStock dynamically for every active product
    this.state.products.forEach((p) => {
      const avail = this.getProductAvailableStock(p.id);
      p.currentStock = avail;
      p.productName = p.productName || p.name;
      p.partNumber = p.partNumber || p.sku;
      p.currentBuyPrice = p.currentBuyPrice || p.buyPrice;
      p.currentSellPrice = p.currentSellPrice || p.sellingPrice;
      p.minimumStockLevel = p.minimumStockLevel !== undefined ? p.minimumStockLevel : p.minimumStock;
      p.active = p.active !== undefined ? p.active : true;
    });

    return this.state.products.filter((p) => p.active !== false);
  }

  public getStockReceipts(productId?: string): StockReceipt[] {
    const receipts = this.state.stockReceipts || [];
    if (productId) {
      return receipts.filter((r) => r.productId === productId);
    }
    return receipts;
  }

  public getStockMovements(productId?: string): StockMovement[] {
    const movements = this.state.stockMovements || [];
    if (productId) {
      return movements.filter((m) => m.productId === productId);
    }
    return movements;
  }

  public addProduct(productData: {
    name: string;
    partNumber?: string;
    productCode?: string;
    sku?: string;
    categoryId?: string;
    category?: string;
    brand?: string;
    unit?: string;
    buyPrice: number;
    sellingPrice: number;
    minimumStock?: number;
    initialStock?: number;
    receivedDate?: string;
    purchaseOrderNumber?: string;
    supplierId?: string;
    supplierName?: string;
    hsnSac?: string;
    gstRate?: number;
    description?: string;
    notes?: string;
  }): Product {
    if (!this.state.products) this.state.products = [];
    if (!this.state.stockReceipts) this.state.stockReceipts = [];
    if (!this.state.stockMovements) this.state.stockMovements = [];

    const settings = this.getInventorySettings();

    const cleanName = productData.name.trim();
    const cleanPartNo = (productData.partNumber || productData.productCode || productData.sku || '').trim();

    // SECTION 4: Validate Part Number if Part Number mode is enabled
    if (settings.usesPartNumber === true && !cleanPartNo) {
      throw new Error('Part Number / Product Code is required because Part Number mode is enabled.');
    }

    // SECTION 37 & 38: DUPLICATE MATCHING LOGIC
    // Check if an existing product already exists with the SAME Part Number or SAME Product Name
    let existingProduct: Product | undefined;
    if (cleanPartNo) {
      existingProduct = this.state.products.find(
        (p) => p.active !== false && (p.partNumber?.toLowerCase() === cleanPartNo.toLowerCase() || p.sku.toLowerCase() === cleanPartNo.toLowerCase())
      );
    }
    if (!existingProduct) {
      existingProduct = this.state.products.find(
        (p) => p.active !== false && p.name.toLowerCase() === cleanName.toLowerCase()
      );
    }

    const now = new Date().toISOString();
    const receivedDate = productData.receivedDate || now.split('T')[0];
    const initialQty = Number(productData.initialStock) || 0;

    // IF EXISTING PRODUCT IS FOUND: CREATE A NEW STOCK RECEIPT (NOT A SECOND PRODUCT!)
    if (existingProduct) {
      if (initialQty > 0) {
        const count = (this.state.stockReceipts || []).length + 1;
        const receiptNumber = `GRN-${String(count).padStart(4, '0')}`;

        const newReceipt: StockReceipt = {
          id: `rec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: existingProduct.id,
          receiptNumber,
          purchaseOrderNumber: productData.purchaseOrderNumber?.trim() || 'INITIAL',
          supplierId: productData.supplierId,
          supplierName: productData.supplierName,
          receivedDate,
          quantityReceived: initialQty,
          quantityRemaining: initialQty,
          buyPrice: Number(productData.buyPrice) || existingProduct.buyPrice,
          notes: productData.notes,
          createdAt: now,
          updatedAt: now,
        };

        this.state.stockReceipts.unshift(newReceipt);

        // Record STOCK_RECEIVED Movement
        const newMovement: StockMovement = {
          id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: existingProduct.id,
          stockReceiptId: newReceipt.id,
          type: 'STOCK_RECEIVED',
          quantity: initialQty,
          date: receivedDate,
          referenceId: newReceipt.purchaseOrderNumber || newReceipt.receiptNumber,
          notes: `Received ${initialQty} ${existingProduct.unit} @ ${existingProduct.buyPrice}`,
          createdAt: now,
        };
        this.state.stockMovements.unshift(newMovement);
      }

      // Update current prices if provided
      if (productData.buyPrice > 0) {
        existingProduct.buyPrice = Number(productData.buyPrice);
        existingProduct.currentBuyPrice = Number(productData.buyPrice);
      }
      if (productData.sellingPrice > 0) {
        existingProduct.sellingPrice = Number(productData.sellingPrice);
        existingProduct.currentSellPrice = Number(productData.sellingPrice);
      }

      existingProduct.currentStock = this.getProductAvailableStock(existingProduct.id);
      existingProduct.updatedAt = now;

      this.saveToStorage();
      return existingProduct;
    }

    // IF NEW MASTER PRODUCT:
    const newId = `prod-${Date.now()}`;
    const generatedSku = cleanPartNo || `SKU-${Math.floor(1000 + Math.random() * 9000)}`;

    const newProduct: Product = {
      id: newId,
      name: cleanName,
      productName: cleanName,
      partNumber: cleanPartNo || generatedSku,
      productCode: cleanPartNo || generatedSku,
      sku: generatedSku,
      categoryId: productData.categoryId || 'cat-1',
      category: productData.category || 'General',
      brand: productData.brand?.trim() || '',
      unit: productData.unit || 'Pcs',
      buyPrice: Number(productData.buyPrice) || 0,
      currentBuyPrice: Number(productData.buyPrice) || 0,
      sellingPrice: Number(productData.sellingPrice) || 0,
      currentSellPrice: Number(productData.sellingPrice) || 0,
      minimumStock: Number(productData.minimumStock) || 5,
      minimumStockLevel: Number(productData.minimumStock) || 5,
      currentStock: initialQty,
      taxPercent: Number(productData.gstRate) || 18,
      hsnSac: productData.hsnSac?.trim() || '',
      gstRate: Number(productData.gstRate) || 18,
      supplierId: productData.supplierId,
      description: productData.description?.trim() || '',
      notes: productData.notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
      active: true,
    };

    this.state.products.unshift(newProduct);

    if (initialQty > 0) {
      const count = (this.state.stockReceipts || []).length + 1;
      const receiptNumber = `GRN-${String(count).padStart(4, '0')}`;

      const newReceipt: StockReceipt = {
        id: `rec-${Date.now()}`,
        productId: newId,
        receiptNumber,
        purchaseOrderNumber: productData.purchaseOrderNumber?.trim() || 'PO-OPENING',
        supplierId: productData.supplierId,
        supplierName: productData.supplierName,
        receivedDate,
        quantityReceived: initialQty,
        quantityRemaining: initialQty,
        buyPrice: newProduct.buyPrice,
        notes: 'Initial opening stock receipt',
        createdAt: now,
        updatedAt: now,
      };

      this.state.stockReceipts.unshift(newReceipt);

      const newMovement: StockMovement = {
        id: `mov-${Date.now()}`,
        productId: newId,
        stockReceiptId: newReceipt.id,
        type: 'STOCK_RECEIVED',
        quantity: initialQty,
        date: receivedDate,
        referenceId: newReceipt.purchaseOrderNumber || receiptNumber,
        notes: `Stock Received ${initialQty} ${newProduct.unit}`,
        createdAt: now,
      };
      this.state.stockMovements.unshift(newMovement);
    }

    this.saveToStorage();
    return newProduct;
  }

  public addStockReceipt(data: {
    productId: string;
    quantityReceived: number;
    buyPrice?: number;
    receivedDate?: string;
    purchaseOrderNumber?: string;
    supplierId?: string;
    supplierName?: string;
    notes?: string;
  }): StockReceipt {
    if (!this.state.stockReceipts) this.state.stockReceipts = [];
    if (!this.state.stockMovements) this.state.stockMovements = [];

    const product = (this.state.products || []).find((p) => p.id === data.productId);
    if (!product) throw new Error('Product not found');

    const now = new Date().toISOString();
    const count = this.state.stockReceipts.length + 1;
    const receiptNumber = `GRN-${String(count).padStart(4, '0')}`;
    const qty = Number(data.quantityReceived);
    if (isNaN(qty) || qty <= 0) throw new Error('Quantity received must be greater than 0.');

    const receiptBuyPrice = data.buyPrice !== undefined ? Number(data.buyPrice) : product.buyPrice;

    const newReceipt: StockReceipt = {
      id: `rec-${Date.now()}`,
      productId: product.id,
      receiptNumber,
      purchaseOrderNumber: data.purchaseOrderNumber?.trim() || 'PO-DIRECT',
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      receivedDate: data.receivedDate || now.split('T')[0],
      quantityReceived: qty,
      quantityRemaining: qty,
      buyPrice: receiptBuyPrice,
      notes: data.notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
    };

    this.state.stockReceipts.unshift(newReceipt);

    const newMovement: StockMovement = {
      id: `mov-${Date.now()}`,
      productId: product.id,
      stockReceiptId: newReceipt.id,
      type: 'STOCK_RECEIVED',
      quantity: qty,
      date: newReceipt.receivedDate,
      referenceId: newReceipt.purchaseOrderNumber || receiptNumber,
      notes: `Received ${qty} ${product.unit} @ ${receiptBuyPrice}`,
      createdAt: now,
    };
    this.state.stockMovements.unshift(newMovement);

    product.currentBuyPrice = receiptBuyPrice;
    product.currentStock = this.getProductAvailableStock(product.id);
    product.updatedAt = now;

    this.saveToStorage();
    return newReceipt;
  }

  // FIFO Stock Consumption Logic (Section 25 & 26)
  public recordStockMovement(
    productId: string,
    type: StockMovementType,
    quantity: number,
    notes?: string,
    referenceId?: string
  ) {
    const product = (this.state.products || []).find((p) => p.id === productId);
    if (!product) return;

    const now = new Date().toISOString();
    const absQty = Math.abs(quantity);

    if (type === 'STOCK_RECEIVED') {
      this.addStockReceipt({
        productId,
        quantityReceived: absQty,
        notes,
        purchaseOrderNumber: referenceId,
      });
      return;
    }

    // Deduct stock using FIFO allocation across oldest stockReceipts first
    const activeReceipts = (this.state.stockReceipts || [])
      .filter((r) => r.productId === productId && r.quantityRemaining > 0)
      .sort((a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime());

    let remainingToDeduct = absQty;

    for (const receipt of activeReceipts) {
      if (remainingToDeduct <= 0) break;
      const deductFromThisReceipt = Math.min(receipt.quantityRemaining, remainingToDeduct);
      receipt.quantityRemaining -= deductFromThisReceipt;
      receipt.updatedAt = now;
      remainingToDeduct -= deductFromThisReceipt;

      const mov: StockMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId,
        stockReceiptId: receipt.id,
        type,
        quantity: -deductFromThisReceipt,
        date: now.split('T')[0],
        referenceId: referenceId || 'ADJUSTMENT',
        notes: notes || `${type} deduction of ${deductFromThisReceipt} units`,
        createdAt: now,
      };
      this.state.stockMovements.unshift(mov);
    }

    product.currentStock = this.getProductAvailableStock(productId);
    product.updatedAt = now;
    this.saveToStorage();
  }

  public getProductDetails(productId: string) {
    const product = (this.state.products || []).find((p) => p.id === productId);
    const receipts = (this.state.stockReceipts || []).filter((r) => r.productId === productId);
    const movements = (this.state.stockMovements || []).filter((m) => m.productId === productId);

    const availableStock = this.getProductAvailableStock(productId);
    const totalReceived = receipts.reduce((acc, r) => acc + r.quantityReceived, 0);
    const totalSold = movements
      .filter((m) => m.type === 'SALE')
      .reduce((acc, m) => acc + Math.abs(m.quantity), 0);
    const totalDamaged = movements
      .filter((m) => m.type === 'DAMAGE' || m.type === 'LOSS')
      .reduce((acc, m) => acc + Math.abs(m.quantity), 0);

    return {
      product,
      availableStock,
      totalReceived,
      totalSold,
      totalDamaged,
      receipts,
      movements,
    };
  }

  public deactivateProduct(productId: string): boolean {
    const product = (this.state.products || []).find((p) => p.id === productId);
    if (!product) return false;

    const receipts = (this.state.stockReceipts || []).filter((r) => r.productId === productId);
    if (receipts.length > 0) {
      product.active = false;
      product.updatedAt = new Date().toISOString();
      this.saveToStorage();
      return true;
    }

    const index = this.state.products.indexOf(product);
    if (index > -1) {
      this.state.products.splice(index, 1);
      this.saveToStorage();
      return true;
    }
    return false;
  }

  public importInventorySession(session: ImportSession): {
    newProducts: number;
    updatedProducts: number;
    receiptsCreated: number;
    totalUnits: number;
  } {
    if (!this.state.importSessions) this.state.importSessions = [];

    let newProducts = 0;
    let updatedProducts = 0;
    let receiptsCreated = 0;
    let totalUnits = 0;

    session.rows.forEach((row) => {
      if (row.status === 'ERROR') return;

      const p = this.addProduct({
        name: row.productName,
        partNumber: row.partNumber,
        productCode: row.productCode,
        sku: row.sku || row.partNumber,
        category: row.category,
        brand: row.brand,
        unit: row.unit,
        buyPrice: row.buyPrice,
        sellingPrice: row.sellPrice,
        initialStock: row.quantity,
        receivedDate: row.receivedDate,
        purchaseOrderNumber: row.purchaseOrder,
        supplierName: row.supplier,
        hsnSac: row.hsnSac,
        gstRate: row.gstRate,
        minimumStock: row.minimumStock,
        notes: row.notes,
      });

      if (row.isExistingProduct) {
        updatedProducts++;
      } else {
        newProducts++;
      }
      receiptsCreated++;
      totalUnits += row.quantity;
    });

    session.status = 'COMPLETED';
    session.completedAt = new Date().toISOString();
    session.newProductsCount = newProducts;
    session.existingProductsCount = updatedProducts;
    session.stockReceiptsCount = receiptsCreated;
    session.totalUnitsAdded = totalUnits;

    this.state.importSessions.unshift(session);
    this.saveToStorage();

    return { newProducts, updatedProducts, receiptsCreated, totalUnits };
  }

  public getImportSessions(): ImportSession[] {
    return this.state.importSessions || [];
  }

  // --- COUNTER SALE METHODS ---

  public getCounterSales(): CounterSale[] {
    if (!this.state.counterSales) this.state.counterSales = [];
    return [...this.state.counterSales].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getCounterSale(id: string): CounterSale | undefined {
    return (this.state.counterSales || []).find((s) => s.id === id);
  }

  public isInvoiceNumberUnique(invoiceNumber: string, excludeSaleId?: string): boolean {
    const cleanInv = invoiceNumber.trim().toLowerCase();
    if (!cleanInv) return false;

    // Check existing invoices array
    const invExists = (this.state.invoices || []).some(
      (inv) => inv.invoiceNumber.trim().toLowerCase() === cleanInv
    );
    if (invExists) return false;

    // Check existing counter sales array
    const saleExists = (this.state.counterSales || []).some(
      (cs) => cs.id !== excludeSaleId && cs.invoiceNumber.trim().toLowerCase() === cleanInv
    );
    if (saleExists) return false;

    return true;
  }

  public generateNextInvoiceNumber(): string {
    const allInvNums = [
      ...(this.state.invoices || []).map((i) => i.invoiceNumber),
      ...(this.state.counterSales || []).map((cs) => cs.invoiceNumber),
    ];

    let maxNum = 100;
    allInvNums.forEach((numStr) => {
      const match = numStr?.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });

    const next = maxNum + 1;
    return `INV-2026-${String(next).padStart(5, '0')}`;
  }

  public generateNextCounterSaleNumber(): string {
    const count = (this.state.counterSales || []).length + 1;
    return `CS-2026-${String(count).padStart(4, '0')}`;
  }

  public createCounterSale(data: {
    customerId?: string;
    customerName?: string;
    phoneNumber?: string;
    saleDate?: string;
    invoiceNumber?: string;
    estimateReference?: string;
    discountType?: 'fixed' | 'percentage';
    discountValue?: number;
    notes?: string;
    items: Array<{
      productId: string;
      quantity: number;
      rate: number;
    }>;
  }): CounterSale {
    if (!this.state.counterSales) this.state.counterSales = [];
    if (!this.state.stockReceipts) this.state.stockReceipts = [];
    if (!this.state.stockMovements) this.state.stockMovements = [];

    const now = new Date().toISOString();
    const todayStr = now.split('T')[0];
    const saleDate = data.saleDate || todayStr;

    // 1. Customer Name Validation
    const customerName = data.customerName?.trim() || 'Walk-in Customer';
    const phoneNumber = data.phoneNumber?.trim() || '';

    // 2. Invoice Number Generation & Unique Validation (SECTION 6 & 45)
    let invoiceNumber = data.invoiceNumber?.trim() || '';
    if (!invoiceNumber) {
      invoiceNumber = this.generateNextInvoiceNumber();
    } else {
      if (!this.isInvoiceNumberUnique(invoiceNumber)) {
        throw new Error(`Invoice number "${invoiceNumber}" already exists. Please use a different invoice number.`);
      }
    }

    // 3. Items & Quantity Validation (SECTION 13, 41, 42)
    if (!data.items || data.items.length === 0) {
      throw new Error('Please select at least one product for the counter sale.');
    }

    // Validate each item independently for positive quantity and sufficient stock
    data.items.forEach((item, idx) => {
      const p = (this.state.products || []).find((prod) => prod.id === item.productId);
      if (!p) throw new Error(`Product at line ${idx + 1} not found.`);

      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Quantity for "${p.name}" must be greater than 0.`);
      }

      const rate = Number(item.rate);
      if (isNaN(rate) || rate < 0) {
        throw new Error(`Rate for "${p.name}" cannot be negative.`);
      }

      // Check current available stock dynamically
      const availStock = this.getProductAvailableStock(p.id);
      if (qty > availStock) {
        throw new Error(
          `Insufficient stock for "${p.name}". Requested ${qty} units, but only ${availStock} units are currently available.`
        );
      }
    });

    const saleId = `cs-${Date.now()}`;
    const saleNumber = this.generateNextCounterSaleNumber();
    const saleItems: CounterSaleItem[] = [];

    let subtotal = 0;

    // 4. Atomic Stock Reduction & Movement Recording (SECTION 20, 21, 22, 43, 54, 55)
    data.items.forEach((item) => {
      const p = this.state.products.find((prod) => prod.id === item.productId)!;
      const qty = Number(item.quantity);
      const rate = Number(item.rate);
      const itemAmount = qty * rate;
      subtotal += itemAmount;

      // FIFO Allocation across active stock receipts (SECTION 22)
      const activeReceipts = (this.state.stockReceipts || [])
        .filter((r) => r.productId === p.id && r.quantityRemaining > 0)
        .sort((a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime());

      let remainingToDeduct = qty;
      let primaryReceiptId: string | undefined = activeReceipts[0]?.id;
      let primaryBuyPrice: number = activeReceipts[0]?.buyPrice || p.buyPrice;

      for (const receipt of activeReceipts) {
        if (remainingToDeduct <= 0) break;
        const deductFromThis = Math.min(receipt.quantityRemaining, remainingToDeduct);
        receipt.quantityRemaining -= deductFromThis;
        receipt.updatedAt = now;
        remainingToDeduct -= deductFromThis;

        // Record SALE Stock Movement for each batch allocation (SECTION 21 & 54)
        const mov: StockMovement = {
          id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: p.id,
          stockReceiptId: receipt.id,
          type: 'SALE',
          quantity: -deductFromThis,
          date: saleDate,
          referenceId: invoiceNumber,
          notes: `Counter Sale ${saleNumber}`,
          createdAt: now,
        };
        this.state.stockMovements.unshift(mov);
      }

      // Update Product Available Stock (SECTION 20, 38)
      p.currentStock = this.getProductAvailableStock(p.id);
      p.updatedAt = now;

      // Create CounterSaleItem with snapshots (SECTION 24, 25, 26, 73)
      const saleItem: CounterSaleItem = {
        id: `csi-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        counterSaleId: saleId,
        productId: p.id,
        stockReceiptId: primaryReceiptId,
        productNameSnapshot: p.productName || p.name,
        partNumberSnapshot: p.partNumber || p.sku,
        quantity: qty,
        rate,
        amount: itemAmount,
        buyPriceSnapshot: primaryBuyPrice,
        createdAt: now,
      };

      saleItems.push(saleItem);
    });

    // 5. Calculate Discounts & Final Total (SECTION 16 & 17)
    const discountType = data.discountType || 'fixed';
    const discountVal = Math.max(0, Number(data.discountValue) || 0);
    let discountAmount = 0;

    if (discountType === 'percentage') {
      discountAmount = (subtotal * discountVal) / 100;
    } else {
      discountAmount = discountVal;
    }

    if (discountAmount > subtotal) {
      throw new Error(`Discount amount (${discountAmount}) cannot exceed subtotal (${subtotal}).`);
    }

    const finalTotal = Math.max(0, subtotal - discountAmount);

    const newSale: CounterSale = {
      id: saleId,
      saleNumber,
      customerId: data.customerId,
      customerName,
      phoneNumber,
      saleDate,
      invoiceNumber,
      estimateReference: data.estimateReference?.trim() || '',
      subtotal,
      discountType,
      discountValue: discountVal,
      discountAmount,
      finalTotal,
      status: 'COMPLETED',
      items: saleItems,
      notes: data.notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
    };

    this.state.counterSales.unshift(newSale);
    this.saveToStorage();
    return newSale;
  }

  public cancelCounterSale(saleId: string): boolean {
    const sale = (this.state.counterSales || []).find((s) => s.id === saleId);
    if (!sale || sale.status === 'CANCELLED') return false;

    const now = new Date().toISOString();

    // Revert stock for each sale item (SECTION 36, 72)
    sale.items.forEach((item) => {
      const p = (this.state.products || []).find((prod) => prod.id === item.productId);
      if (!p) return;

      // Restore quantityRemaining on original stock receipt if available
      if (item.stockReceiptId) {
        const receipt = (this.state.stockReceipts || []).find((r) => r.id === item.stockReceiptId);
        if (receipt) {
          receipt.quantityRemaining += item.quantity;
          receipt.updatedAt = now;
        }
      }

      // Record SALE_REVERSAL Stock Movement
      const mov: StockMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId: p.id,
        stockReceiptId: item.stockReceiptId,
        type: 'RETURN',
        quantity: item.quantity,
        date: now.split('T')[0],
        referenceId: sale.invoiceNumber,
        notes: `Cancelled Counter Sale ${sale.saleNumber}`,
        createdAt: now,
      };
      this.state.stockMovements.unshift(mov);

      p.currentStock = this.getProductAvailableStock(p.id);
      p.updatedAt = now;
    });

    sale.status = 'CANCELLED';
    sale.updatedAt = now;

    this.saveToStorage();
    return true;
  }

  public getCounterSaleMetrics() {
    const sales = (this.state.counterSales || []).filter((s) => s.status === 'COMPLETED');
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonth = todayStr.substring(0, 7); // YYYY-MM

    const todaySales = sales.filter((s) => s.saleDate === todayStr);
    const monthSales = sales.filter((s) => s.saleDate.startsWith(currentMonth));

    const todayTotal = todaySales.reduce((acc, s) => acc + s.finalTotal, 0);
    const todayCount = todaySales.length;
    const monthTotal = monthSales.reduce((acc, s) => acc + s.finalTotal, 0);

    const netSales = sales.reduce((acc, s) => acc + s.finalTotal, 0);
    const totalDiscounts = sales.reduce((acc, s) => acc + s.discountAmount, 0);

    return {
      todayTotal,
      todayCount,
      monthTotal,
      netSales,
      totalDiscounts,
      totalTransactions: sales.length,
    };
  }

  public resetState() {
    this.state = {
      ...initialSeedData,
      customers: [],
      products: [],
      categories: initialSeedData.categories,
      suppliers: initialSeedData.suppliers,
      inventoryTransactions: [],
      quotations: [],
      invoices: [],
      payments: [],
      expenses: [],
      followUps: [],
      feedbacks: [],
      offers: [],
      notifications: [],
      udharis: [],
      udhariPayments: [],
      stockReceipts: [],
      stockMovements: [],
      importSessions: [],
      counterSales: [],
    };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {}
    this.notify();
  }
}

export const store = new StoreService();
