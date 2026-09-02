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
import { safeGetTenantItem, safeSaveTenantItem, clearTenantStorage } from './supabase/safeStorage';


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
  categories: [],
  suppliers: [],
  customers: [],
  products: [],
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
  inventorySettings: {
    usesPartNumber: true,
  },
  stockReceipts: [],
  stockMovements: [],
  importSessions: [],
  counterSales: [],
};


class StoreService {
  private state: AppState;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.state = this.loadFromStorage();
  }

  private loadFromStorage(): AppState {
    try {
      return safeGetTenantItem<AppState>(STORAGE_KEY, initialSeedData);
    } catch (e) {
      console.error('Failed to load state from tenant storage', e);
    }
    return initialSeedData;
  }

  private saveToStorage() {
    try {
      safeSaveTenantItem<AppState>(STORAGE_KEY, this.state);
    } catch (e) {
      console.error('Failed to save state to tenant storage', e);
    }
    this.notify();
  }

  public reloadTenantState() {
    this.state = this.loadFromStorage();
    this.notify();
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
    return (this.state.settings?.theme === 'dark' || this.state.settings?.theme === 'light')
      ? this.state.settings.theme
      : 'light';
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
      window.dispatchEvent(new CustomEvent('vistaar-theme-changed', { detail: theme }));
    }
    this.saveToStorage();
  }

  public updateSettings(newSettings: Partial<BusinessSettings>) {
    // Preserve existing theme unless explicitly provided as dark or light
    const currentTheme = this.getTheme();
    const themeToKeep = (newSettings.theme === 'dark' || newSettings.theme === 'light')
      ? newSettings.theme
      : currentTheme;

    this.state.settings = {
      ...this.state.settings,
      ...newSettings,
      theme: themeToKeep,
    };

    if (newSettings.theme === 'dark' || newSettings.theme === 'light') {
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
      : this.state.lastUsedQuotationTemplate || 'modern-split';
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

    const paidAmount = Math.max(0, Number(invoiceData.paidAmount) || 0);
    const grandTotal = Math.max(0, Number(invoiceData.grandTotal) || 0);
    const balanceAmount = Math.max(0, Number((grandTotal - paidAmount).toFixed(2)));

    let status: InvoiceStatus = invoiceData.status || 'Issued';
    if (status !== 'Cancelled' && status !== 'Draft') {
      if (paidAmount >= grandTotal && grandTotal > 0) {
        status = 'Paid';
      } else if (paidAmount > 0) {
        status = 'Partially Paid';
      } else {
        status = 'Issued';
      }
    }

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
      paidAmount,
      balanceAmount,
      status,
      templateId: invoiceData.templateId || 'inv-modern-blue',
      snapshot,
      isSnapshotFinalized: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Deduct stock for linked product items ONLY if invoice is finalized (Issued / Paid / Partially Paid)
    const isFinalized = newInvoice.status === 'Issued' || newInvoice.status === 'Paid' || newInvoice.status === 'Partially Paid';
    if (isFinalized) {
      // Validate stock for ALL items before deducting stock for any item
      for (const item of newInvoice.items) {
        if (item.productId) {
          const avail = this.getProductAvailableStock(item.productId);
          if (avail < item.quantity) {
            const prod = (this.state.products || []).find((p) => p.id === item.productId);
            const pName = prod ? prod.name : item.productName || 'Product';
            throw new Error(`Insufficient stock for "${pName}". Requested ${item.quantity}, but only ${avail} units are available.`);
          }
        }
      }

      newInvoice.items.forEach((item) => {
        if (item.productId) {
          this.adjustStock(item.productId, 'Sale', -item.quantity, `Invoice Sale ${invoiceNumber}`, invoiceNumber);
        }
      });
    }

    this.saveLastUsedTemplate('invoice', newInvoice.templateId);
    this.state.invoices.unshift(newInvoice);
    this.saveToStorage();
    return newInvoice;
  }

  public updateInvoice(id: string, updatedData: Partial<Invoice>): Invoice | null {
    const invIndex = this.state.invoices.findIndex((i) => i.id === id);
    if (invIndex === -1) return null;

    const existing = this.state.invoices[invIndex];
    const paidAmount = updatedData.paidAmount !== undefined ? updatedData.paidAmount : existing.paidAmount;
    const grandTotal = updatedData.grandTotal !== undefined ? updatedData.grandTotal : existing.grandTotal;
    const balanceAmount = Math.max(0, Number((grandTotal - paidAmount).toFixed(2)));

    let status = updatedData.status || existing.status;
    if (status !== 'Cancelled' && status !== 'Draft') {
      if (paidAmount >= grandTotal && grandTotal > 0) {
        status = 'Paid';
      } else if (paidAmount > 0) {
        status = 'Partially Paid';
      } else {
        status = 'Issued';
      }
    }

    const updatedInvoice: Invoice = {
      ...existing,
      ...updatedData,
      id: existing.id,
      invoiceNumber: existing.invoiceNumber,
      paidAmount,
      balanceAmount,
      status,
      updatedAt: new Date().toISOString(),
    };

    const wasFinalized = existing.status === 'Issued' || existing.status === 'Paid' || existing.status === 'Partially Paid';
    const isFinalized = updatedInvoice.status === 'Issued' || updatedInvoice.status === 'Paid' || updatedInvoice.status === 'Partially Paid';

    if (isFinalized && !wasFinalized) {
      for (const item of updatedInvoice.items) {
        if (item.productId) {
          const avail = this.getProductAvailableStock(item.productId);
          if (avail < item.quantity) {
            const prod = (this.state.products || []).find((p) => p.id === item.productId);
            const pName = prod ? prod.name : item.productName || 'Product';
            throw new Error(`Insufficient stock for "${pName}". Requested ${item.quantity}, but only ${avail} units are available.`);
          }
        }
      }

      updatedInvoice.items.forEach((item) => {
        if (item.productId) {
          this.adjustStock(item.productId, 'Sale', -item.quantity, `Invoice Sale ${updatedInvoice.invoiceNumber}`, updatedInvoice.invoiceNumber);
        }
      });
    }

    this.state.invoices[invIndex] = updatedInvoice;
    this.saveToStorage();
    return updatedInvoice;
  }

  public finalizeDraftInvoice(invoiceId: string): boolean {
    const inv = this.state.invoices.find((i) => i.id === invoiceId);
    if (!inv) return false;
    if (inv.status === 'Issued' || inv.status === 'Paid' || inv.status === 'Partially Paid') return true;

    // Validate stock for all items first
    for (const item of inv.items) {
      if (item.productId) {
        const prod = this.state.products.find((p) => p.id === item.productId);
        const avail = prod ? prod.currentStock : 0;
        if (avail < item.quantity) {
          throw new Error(`Insufficient stock for "${item.productName}". Requested ${item.quantity}, available ${avail}.`);
        }
      }
    }

    // Deduct stock for linked items
    inv.items.forEach((item) => {
      if (item.productId) {
        this.adjustStock(item.productId, 'Sale', -item.quantity, `Invoice Sale ${inv.invoiceNumber}`, inv.invoiceNumber);
      }
    });

    inv.status = inv.paidAmount >= inv.grandTotal ? 'Paid' : inv.paidAmount > 0 ? 'Partially Paid' : 'Issued';
    inv.balanceAmount = Math.max(0, Number((inv.grandTotal - inv.paidAmount).toFixed(2)));
    inv.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return true;
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
        const updatedPaid = Number((inv.paidAmount + paymentData.amount).toFixed(2));
        const updatedBalance = Math.max(0, Number((inv.grandTotal - updatedPaid).toFixed(2)));
        const newStatus: InvoiceStatus = updatedBalance <= 0 ? 'Paid' : updatedPaid > 0 ? 'Partially Paid' : inv.status;

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
    if (receipts.length > 0) {
      return receipts.reduce((acc, r) => acc + Math.max(0, r.quantityRemaining), 0);
    }
    const prod = (this.state.products || []).find((p) => p.id === productId);
    return prod ? Math.max(0, Number(prod.currentStock) || 0) : 0;
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

    const newId = `prod-${Date.now()}`;
    const generatedSku = (productData.sku || cleanPartNo || `SKU-${Math.floor(1000 + Math.random() * 9000)}`).trim();


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

    if (activeReceipts.length === 0) {
      product.currentStock = Math.max(0, (Number(product.currentStock) || 0) - absQty);
      const mov: StockMovement = {
        id: `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        productId,
        type,
        quantity: -absQty,
        date: now.split('T')[0],
        referenceId: referenceId || 'ADJUSTMENT',
        notes: notes || `${type} deduction of ${absQty} units`,
        createdAt: now,
      };
      if (!this.state.stockMovements) this.state.stockMovements = [];
      this.state.stockMovements.unshift(mov);
    } else {
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
        if (!this.state.stockMovements) this.state.stockMovements = [];
        this.state.stockMovements.unshift(mov);
      }
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
      categories: [],
      suppliers: [],
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
      clearTenantStorage();
    } catch (e) {}
    this.notify();
  }
}

export const store = new StoreService();
