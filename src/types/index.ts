import type { BrandingConfig, ThemeConfig, DocumentSnapshot, DocumentCustomization } from './template.ts';

export type UserRole = 'owner' | 'admin' | 'manager' | 'employee' | 'staff';
export type EmployeeStatus = 'Pending' | 'Active' | 'Inactive' | 'Suspended';

export interface CompanyWorkspace {
  id: string; // e.g. ws-1001
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserAccount {
  id: string; // e.g. usr-1001
  companyId: string;
  employeeId: string; // e.g. VST-00001
  name: string;
  email: string;
  phone: string;
  department?: string;
  designation?: string;
  role: UserRole;
  status: EmployeeStatus;
  avatarUrl?: string;
  passwordHash: string;
  isTemporaryPassword?: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface UserSession {
  sessionId: string;
  userId: string;
  companyId: string;
  deviceInfo: string;
  ipAddress?: string;
  createdAt: string;
  expiresAt: string;
  lastActive: string;
}

export interface PasswordResetToken {
  token: string;
  email: string;
  userId: string;
  companyId: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
}

export interface LoginActivity {
  id: string;
  userId: string;
  companyId: string;
  emailOrEmployeeId: string;
  device: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILED';
  reason?: string;
}

export interface UserProfile {
  id: string;
  companyId: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  department?: string;
  designation?: string;
  role: UserRole;
  status: EmployeeStatus;
  avatarUrl?: string;
  businessName: string;
  mustChangePassword?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin?: string;
  customerType: 'Retail' | 'Wholesale' | 'Corporate';
  creditLimit: number;
  paymentTerms: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  gstin?: string;
}

export interface Product {
  id: string;
  name: string;
  productName?: string;
  partNumber?: string;
  productCode?: string;
  sku: string;
  barcode?: string;
  categoryId: string;
  category?: string;
  brand?: string;
  unit: string;
  buyPrice: number;
  currentBuyPrice?: number;
  sellingPrice: number;
  currentSellPrice?: number;
  minimumStock: number;
  minimumStockLevel?: number;
  currentStock: number; // Derived dynamically from active StockReceipt records
  taxPercent: number;
  hsnSac?: string;
  gstRate?: number;
  supplierId?: string;
  supplier?: string;
  description?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  active?: boolean;
}

export interface StockReceipt {
  id: string; // e.g. rec-2026-0001
  productId: string;
  receiptNumber: string; // e.g. GRN-0001
  purchaseOrderNumber?: string; // e.g. PO-2026-001 / GRN / Supplier Ref
  supplierId?: string;
  supplierName?: string;
  receivedDate: string; // YYYY-MM-DD
  quantityReceived: number;
  quantityRemaining: number;
  buyPrice: number; // Cost price for this batch
  reference?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type StockMovementType =
  | 'STOCK_RECEIVED'
  | 'SALE'
  | 'RETURN'
  | 'DAMAGE'
  | 'LOSS'
  | 'ADJUSTMENT';

export interface StockMovement {
  id: string; // e.g. mov-2026-0001
  productId: string;
  stockReceiptId?: string;
  type: StockMovementType;
  quantity: number; // Delta (+ for received, - for sale/damage)
  date: string;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export interface InventorySettings {
  usesPartNumber: boolean | null; // null if prompt hasn't been answered yet
}

export type ImportSessionStatus = 'DRAFT' | 'REVIEW' | 'CONFIRMED' | 'COMPLETED' | 'FAILED';

export interface ImportRowData {
  rowIndex: number;
  productName: string;
  partNumber: string;
  productCode: string;
  sku: string;
  category: string;
  brand: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  receivedDate: string;
  purchaseOrder: string;
  supplier: string;
  hsnSac: string;
  gstRate: number;
  minimumStock: number;
  notes: string;

  // Validation & Duplicate Staging Flags
  status: 'VALID' | 'WARNING' | 'ERROR';
  validationMessage?: string;
  isExistingProduct?: boolean;
  matchedProductId?: string;
  actionChoice?: 'ADD_STOCK' | 'UPDATE_PRODUCT' | 'SKIP';
}

export interface ImportSession {
  id: string; // IMP-2026-0001
  fileName: string;
  uploadedAt: string;
  uploadedBy?: string;
  status: ImportSessionStatus;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  completedAt?: string;
  newProductsCount?: number;
  existingProductsCount?: number;
  stockReceiptsCount?: number;
  totalUnitsAdded?: number;
  rows: ImportRowData[];
  columnMappings: Record<string, string>;
}

export type CounterSaleStatus = 'COMPLETED' | 'CANCELLED';

export interface CounterSaleItem {
  id: string;
  counterSaleId: string;
  productId: string;
  stockReceiptId?: string;
  productNameSnapshot: string;
  partNumberSnapshot: string;
  quantity: number;
  rate: number;
  amount: number;
  buyPriceSnapshot?: number;
  createdAt: string;
}

export interface CounterSale {
  id: string;
  saleNumber: string;
  customerId?: string;
  customerName: string;
  phoneNumber?: string;
  saleDate: string;
  invoiceNumber: string;
  estimateReference?: string;
  subtotal: number;
  discountType: 'fixed' | 'percentage';
  discountValue: number;
  discountAmount: number;
  finalTotal: number;
  status: CounterSaleStatus;
  items: CounterSaleItem[];
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}


export type StockMovementReason =
  | 'Opening Stock'
  | 'Purchase'
  | 'Sale'
  | 'Sales Return'
  | 'Purchase Return'
  | 'Damage'
  | 'Adjustment';

export interface InventoryTransaction {
  id: string;
  productId: string;
  type: StockMovementReason;
  quantityDelta: number;
  previousStock: number;
  newStock: number;
  referenceNo?: string;
  notes?: string;
  date: string;
}


export type QuotationStatus =
  | 'Draft'
  | 'Sent'
  | 'Viewed'
  | 'Accepted'
  | 'Rejected'
  | 'Expired'
  | 'Converted';

export interface QuotationItem {
  id: string;
  productId?: string;
  productName: string;
  sku?: string;
  unit: string;
  quantity: number;
  buyPrice: number; // Internal only, NEVER exposed in PDF/Preview/WhatsApp
  sellingPrice: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
}

export interface Quotation {
  id: string;
  quotationNumber: string; // e.g. QT-2026-0001
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerGstin?: string;
  status: QuotationStatus;
  validUntil: string;
  date: string;
  items: QuotationItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  notes?: string;
  terms?: string;
  footerText?: string;
  convertedInvoiceId?: string;
  
  // Template & Branding Customizations
  templateId: string;
  branding?: BrandingConfig;
  theme?: ThemeConfig;
  customization?: DocumentCustomization;
  snapshot?: DocumentSnapshot;
  isSnapshotFinalized?: boolean;

  createdAt: string;
  updatedAt: string;
}

export type InvoiceStatus =
  | 'Draft'
  | 'Issued'
  | 'Partially Paid'
  | 'Paid'
  | 'Cancelled';

export interface InvoiceItem {
  id: string;
  productId?: string;
  productName: string;
  sku?: string;
  unit: string;
  quantity: number;
  buyPrice: number; // Internal only
  sellingPrice: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. INV-2026-0001
  quotationId?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerGstin?: string;
  status: InvoiceStatus;
  date: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  notes?: string;
  terms?: string;
  footerText?: string;

  // Template & Branding Customizations
  templateId: string;
  branding?: BrandingConfig;
  theme?: ThemeConfig;
  customization?: DocumentCustomization;
  snapshot?: DocumentSnapshot;
  isSnapshotFinalized?: boolean;

  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod =
  | 'Cash'
  | 'UPI'
  | 'Bank Transfer'
  | 'Card'
  | 'Cheque'
  | 'Other';

export interface Payment {
  id: string;
  paymentNumber: string;
  customerId: string;
  customerName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  referenceNo?: string;
  notes?: string;
  createdAt: string;
}

export type UdhariStatus = 'UNPAID' | 'PARTIALLY PAID' | 'PAID' | 'OVERDUE';

export interface UdhariRecord {
  id: string; // e.g. UD-2026-0001
  customerId?: string;
  customerNameSnapshot: string;
  phoneSnapshot: string;
  originalAmount: number;
  totalReceived: number;
  outstandingAmount: number;
  dueDate: string; // YYYY-MM-DD
  notes?: string;
  status: UdhariStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface UdhariPaymentRecord {
  id: string; // e.g. PAY-2026-0001
  udhariId: string;
  customerId?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string; // YYYY-MM-DD
  phoneNumber: string;
  reference?: string;
  notes?: string;
  createdAt: string;
}


export type ExpenseCategory =
  | 'Rent'
  | 'Salary'
  | 'Electricity'
  | 'Internet'
  | 'Transport'
  | 'Marketing'
  | 'Software'
  | 'Office'
  | 'Maintenance'
  | 'Other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  expenseName?: string;
  amount: number;
  date: string;
  paidTo?: string;
  referenceNo?: string;
  notes?: string;
  createdAt: string;
}

export type FollowUpStatus = 'Pending' | 'Due' | 'Completed' | 'Cancelled' | 'Rescheduled' | 'Failed';
export type FollowUpPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type FollowUpActionType =
  | 'WHATSAPP_MESSAGE'
  | 'INTERNAL_REMINDER'
  | 'EMAIL'
  | 'CALL_REMINDER'
  | 'SEND_QUOTATION'
  | 'SEND_INVOICE';

export interface FollowUpActionConfig {
  topic?: string;
  message?: string;
  tone?: 'Natural' | 'Friendly' | 'Professional' | 'Short & Direct';
  sendVia?: 'WhatsApp' | 'Internal Reminder';
  wasWhatsAppOpened?: boolean;
  whatsappOpenedAt?: string;
  templateId?: string;
  subject?: string;
  reminderMessage?: string;
  callNotes?: string;
  quotationId?: string;
  invoiceId?: string;
}

export interface FollowUpExecutionLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface FollowUp {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerWhatsapp?: string;
  quotationId?: string;
  quotationNumber?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  assignedTo: string;
  title: string;
  notes?: string;
  dueDate: string;
  dueTime: string;
  priority: FollowUpPriority;
  status: FollowUpStatus;
  
  // Extended Action Engine Fields
  actionType: FollowUpActionType;
  actionConfig?: FollowUpActionConfig;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt?: string;
  completedAt?: string;
  failedAt?: string;
  errorMessage?: string;
  providerMessageId?: string;
  deliveryStatus?: string;
  executionLogs?: FollowUpExecutionLog[];

  createdAt: string;
  updatedAt?: string;
}

export interface Feedback {
  id: string;
  customerId: string;
  customerName: string;
  invoiceId?: string;
  invoiceNumber?: string;
  rating: number;
  comment: string;
  date: string;
}

export interface Offer {
  id: string;
  name: string;
  description: string;
  discountType: 'Percentage' | 'Fixed Amount';
  discountValue: number;
  minimumOrder: number;
  startDate: string;
  endDate: string;
  status: 'Active' | 'Inactive';
  code: string;
}

export interface AppNotification {
  id: string;
  type: 'low_stock' | 'overdue_invoice' | 'followup_due' | 'payment_received' | 'quotation_expired';
  title: string;
  message: string;
  date: string;
  read: boolean;
  linkRoute?: string;
}

export interface BusinessSettings {
  // 1. Business Information
  businessName: string;
  legalName?: string;
  businessType?: string;
  businessDescription?: string;
  ownerName?: string;
  phone: string;
  alternatePhone?: string;
  email: string;
  website?: string;
  gstin: string;
  pan?: string;
  regNumber?: string;
  address: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;

  // 2. Global Branding Assets & Placement
  logoUrl?: string;
  logoAlignment?: 'left' | 'center' | 'right';
  logoScale?: number;

  signatureUrl?: string;
  signatureAlignment?: 'left' | 'center' | 'right';
  signatureScale?: number;

  stampUrl?: string;
  stampAlignment?: 'left' | 'center' | 'right';
  stampScale?: number;

  // 3. Bank & Payment Details
  bankDetails: {
    bankName: string;
    accountHolder?: string;
    accountNo: string;
    ifscCode: string;
    branch: string;
    upiId: string;
  };
  showBankDetailsOnInvoice?: boolean;
  showBankDetailsOnQuotation?: boolean;

  // 4. Default Document Settings
  currency: string;
  defaultTaxMode?: 'Inclusive' | 'Exclusive' | 'No Tax';
  invoicePrefix?: string;
  quotationPrefix?: string;
  defaultPaymentTerms?: string;
  defaultQuotationValidity?: string;
  defaultFont?: string;
  defaultOrientation?: 'portrait' | 'landscape';
  defaultInvoiceTemplate: string;
  defaultQuotationTemplate: string;
  brandColor: string;
  theme?: 'light' | 'dark';

  // 5. Default Terms & Conditions
  termsAndConditions: string;
  defaultInvoiceTerms?: string;
  defaultQuotationTerms?: string;
}

// Daybook Financial Journal Interfaces
export type DaybookTransactionType =
  | 'SALE'
  | 'CUSTOMER_PAYMENT'
  | 'SUPPLIER_PAYMENT'
  | 'EXPENSE'
  | 'REFUND'
  | 'OTHER_INCOME'
  | 'OTHER_PAYMENT'
  | 'ADJUSTMENT'
  | 'TRANSFER';

export type DaybookDirection = 'IN' | 'OUT' | 'NON_CASH';

export interface DaybookTransaction {
  id: string;
  workspaceId: string;
  transactionCode: string;
  transactionDate: string;
  transactionTime?: string;
  transactionType: DaybookTransactionType;
  direction: DaybookDirection;
  amount: number;
  paymentMode: PaymentMethod;
  financialAccountId?: string;
  transferTargetAccountId?: string;
  partyType?: 'customer' | 'supplier' | 'other';
  partyId?: string;
  partyName?: string;
  referenceType: 'COUNTER_SALE' | 'PAYMENT' | 'EXPENSE' | 'UDHARI_PAYMENT' | 'INVOICE' | 'MANUAL';
  referenceId?: string;
  referenceNumber?: string;
  description?: string;
  notes?: string;
  status: 'COMPLETED' | 'VOID' | 'REVERSED';
  // Indian GST & Tax Metadata
  gstApplicable?: boolean;
  gstRegistrationStatus?: string;
  gstin?: string;
  placeOfSupply?: string;
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  utgstAmount?: number;
  cessAmount?: number;
  totalTaxAmount?: number;
  hsnSacCode?: string;
  isReverseCharge?: boolean;
  taxCategory?: 'TAXABLE' | 'EXEMPT' | 'NIL_RATED' | 'NON_GST';
  tdsTcsAmount?: number;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DaybookFilterOptions {
  dateRange?: 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';
  startDate?: string;
  endDate?: string;
  transactionType?: string;
  paymentMode?: string;
  partyType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface DaybookSummaryMetrics {
  totalInflow: number;
  totalOutflow: number;
  netMovement: number;
  totalCount: number;
  modeBreakdown: Record<string, number>;
}

// Financial Account & Cashbook Interfaces
export type FinancialAccountType = 'CASH' | 'BANK' | 'UPI' | 'CARD' | 'OTHER';

export interface FinancialAccount {
  id: string;
  workspaceId: string;
  name: string;
  accountType: FinancialAccountType;
  accountNumber?: string;
  ifscCode?: string;
  openingBalance: number;
  openingBalanceDate: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  currentBalance?: number;
}

export interface CashbookFilterOptions {
  financialAccountId?: string; // 'ALL' or account UUID
  accountType?: FinancialAccountType | 'ALL';
  financialYear?: string; // e.g. 'FY_2026_27', 'FY_2025_26', 'ALL', 'CUSTOM'
  dateRange?: 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'fy' | 'custom' | 'all';
  startDate?: string;
  endDate?: string;
  transactionType?: string;
  paymentMode?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AccountBalanceSummary {
  account: FinancialAccount;
  openingBalance: number;
  totalReceipts: number;
  totalPayments: number;
  totalTransfersIn: number;
  totalTransfersOut: number;
  closingBalance: number;
}

export interface CashbookSummaryMetrics {
  totalOpeningBalance: number;
  totalReceipts: number;
  totalPayments: number;
  totalTransfers: number;
  totalClosingBalance: number;
  accountSummaries: AccountBalanceSummary[];
}

// =============================================================================
// E-WAY BILL COMPLIANCE MODULE INTERFACES
// =============================================================================
export type EwayBillDocumentType = 'INV' | 'BIL' | 'BOE' | 'OTH';
export type SupplyType = 'OUTWARD' | 'INWARD';
export type SubSupplyType = 'SUPPLY' | 'IMPORT' | 'EXPORT' | 'JOB_WORK' | 'FOR_OWN_USE' | 'OTHERS';
export type TransactionType = 'REGULAR' | 'BILL_TO_SHIP_TO' | 'BILL_FROM_DISPATCH_FROM' | 'BOTH';
export type TransportMode = 'ROAD' | 'RAIL' | 'AIR' | 'SHIP';
export type VehicleType = 'REGULAR' | 'OVER_DIMENSIONAL_CARGO';
export type EwayBillStatus =
  | 'DRAFT'
  | 'READY'
  | 'GENERATING'
  | 'GENERATION_PENDING'
  | 'GENERATED'
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'GENERATION_FAILED';

export interface Transporter {
  id: string;
  workspaceId: string;
  name: string;
  gstinTransporterId: string;
  phone?: string;
  email?: string;
  address?: string;
  state?: string;
  pincode?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  workspaceId: string;
  vehicleNumber: string;
  vehicleType: VehicleType;
  transporterId?: string;
  transporterName?: string;
  ownerName?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export type BusinessLocationType = 'REGISTERED' | 'BRANCH' | 'WAREHOUSE' | 'GODOWN' | 'FACTORY' | 'OTHER';

export interface BusinessLocation {
  id: string;
  workspaceId: string;
  locationType: BusinessLocationType;
  locationName: string;
  gstin?: string;
  tradeName?: string;
  address: string;
  city?: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EwayBillItem {
  id: string;
  workspaceId: string;
  ewayBillId: string;
  invoiceItemId?: string;
  productId?: string;
  productName: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  taxableValue: number;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  cessRate?: number;
  cessAmount?: number;
  createdAt?: string;
}

export interface EwayBillEvent {
  id: string;
  workspaceId: string;
  ewayBillId: string;
  eventType:
    | 'CREATED'
    | 'VALIDATED'
    | 'GENERATION_REQUESTED'
    | 'GENERATED'
    | 'GENERATION_FAILED'
    | 'VEHICLE_UPDATED'
    | 'VALIDITY_EXTENDED'
    | 'CANCEL_REQUESTED'
    | 'CANCELLED'
    | 'EXPIRED';
  oldStatus?: string;
  newStatus: string;
  performedBy?: string;
  eventTime: string;
  remarks?: string;
  metadata?: Record<string, any>;
}

export interface EwayBill {
  id: string;
  workspaceId: string;
  invoiceId?: string;
  ewayBillNumber?: string;
  documentType: EwayBillDocumentType;
  documentNumber: string;
  documentDate: string;
  supplyType: SupplyType;
  subSupplyType: SubSupplyType;
  transactionType: TransactionType;

  // Origin / Dispatch From
  fromGstin?: string;
  fromTradeName: string;
  fromAddress: string;
  fromPlace?: string;
  fromState: string;
  fromPincode: string;

  // Destination / Bill To & Ship To
  toGstin?: string;
  toTradeName: string;
  toAddress: string;
  toPlace?: string;
  toState: string;
  toPincode: string;
  billToGstin?: string;
  shipToGstin?: string;

  // Values
  totalTaxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalInvoiceValue: number;

  // Transportation
  transportMode: TransportMode;
  transporterId?: string;
  transporterName?: string;
  transporterGstin?: string;
  vehicleNumber?: string;
  vehicleType?: VehicleType;
  transportDocumentNumber?: string;
  transportDocumentDate?: string;
  approxDistanceKm: number;

  // Timestamps & Status
  generatedAt?: string;
  validFrom?: string;
  validUntil?: string;
  status: EwayBillStatus;

  cancelledAt?: string;
  cancellationReason?: string;
  cancellationRemarks?: string;

  governmentReference?: string;
  ewbTransactionId?: string;
  ewbOfficialResponse?: Record<string, any>;
  ewbQrPayload?: string;
  ewbEnvironment?: 'SANDBOX' | 'PRODUCTION';
  ewbErrorCode?: string;
  ewbErrorMessage?: string;
  lastApiStatus?: string;
  lastApiErrorCode?: string;
  lastApiErrorMessage?: string;

  items?: EwayBillItem[];
  events?: EwayBillEvent[];

  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EwayBillEligibilityResult {
  required: boolean;
  reason: string;
  warnings: string[];
  blockingErrors: string[];
  approxDistanceKm?: number;
  suggestedValidityHours?: number;
}

export interface EwayBillFilterOptions {
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  transportMode?: string;
  page?: number;
  pageSize?: number;
}

// ============================================================================
// PURCHASE ORDER MODULE TYPES
// ============================================================================
export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SENT'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'FULLY_RECEIVED'
  | 'CLOSED'
  | 'CANCELLED';

export interface PurchaseOrderItem {
  id?: string;
  purchaseOrderId?: string;
  productId?: string | null;
  supplierCatalogueItemId?: string | null;
  productName?: string;
  itemName?: string;
  isCustomItem?: boolean;
  productSku?: string;
  description?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountValue?: number;
  discountAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  lineSubtotal?: number;
  lineTotal?: number;
  receivedQuantity?: number;
  pendingQuantity?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PurchaseOrderStatusHistory {
  id?: string;
  purchaseOrderId: string;
  oldStatus?: string | null;
  newStatus: PurchaseOrderStatus;
  changedBy?: string | null;
  notes?: string | null;
  createdAt?: string;
}

export interface PurchaseOrderReceiptItem {
  id?: string;
  receiptId?: string;
  purchaseOrderItemId: string;
  productId?: string | null;
  productName?: string;
  orderedQuantity: number;
  previouslyReceivedQuantity: number;
  receivedQuantity: number;
  createdAt?: string;
}

export interface PurchaseOrderReceipt {
  id?: string;
  workspaceId?: string;
  purchaseOrderId: string;
  receiptNumber: string;
  receiptDate: string;
  receivedBy?: string;
  notes?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  items?: PurchaseOrderReceiptItem[];
}

export interface PurchaseOrder {
  id?: string;
  workspaceId?: string;
  supplierId: string;
  supplierName?: string;
  supplierPhone?: string;
  supplierGstin?: string;
  supplierAddress?: string;
  poNumber: string;
  poDate: string;
  expectedDeliveryDate?: string | null;
  referenceNumber?: string | null;
  status: PurchaseOrderStatus;
  paymentTerms?: string | null;
  deliveryLocationId?: string | null;

  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  grandTotal: number;

  notes?: string | null;
  termsConditions?: string | null;
  internalNotes?: string | null;

  createdBy?: string;
  sentAt?: string | null;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  closedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;

  items?: PurchaseOrderItem[];
  statusHistory?: PurchaseOrderStatusHistory[];
  receipts?: PurchaseOrderReceipt[];
}

export interface PurchaseOrderFilterOptions {
  search?: string;
  status?: string;
  supplierId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'newest' | 'oldest' | 'highest_value' | 'lowest_value';
  page?: number;
  pageSize?: number;
}

export type CatalogueImportStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'PREVIEW_READY'
  | 'IMPORTED'
  | 'PARTIALLY_IMPORTED'
  | 'FAILED';

export interface SupplierCatalogueFile {
  id: string;
  workspaceId: string;
  supplierId: string;
  supplierName?: string;
  fileName: string;
  storagePath: string;
  fileType: string;
  fileSize?: number;
  importStatus: CatalogueImportStatus;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  uploadedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierCatalogueMapping {
  id?: string;
  workspaceId?: string;
  supplierId: string;
  mappingConfig: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierCatalogueItem {
  id: string;
  workspaceId: string;
  supplierId: string;
  supplierName?: string;
  catalogueFileId?: string | null;
  productId?: string | null;
  productName: string;
  supplierProductCode?: string | null;
  partNumber?: string | null;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  purchasePrice?: number | null;
  currency?: string;
  uom?: string;
  gstRate?: number;
  hsnSac?: string | null;
  mrp?: number | null;
  minimumOrderQuantity?: number;
  packSize?: string | null;
  barcode?: string | null;
  leadTimeDays?: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  priceHistory?: SupplierCataloguePriceHistory[];
}

export interface SupplierCataloguePriceHistory {
  id: string;
  workspaceId: string;
  supplierCatalogueItemId: string;
  supplierId: string;
  purchasePrice: number;
  effectiveDate: string;
  sourceFileId?: string | null;
  createdAt?: string;
}

export interface ImportPreviewRow {
  rowNumber: number;
  productName: string;
  supplierProductCode?: string;
  partNumber?: string;
  purchasePrice?: number;
  uom?: string;
  gstRate?: number;
  hsnSac?: string;
  brand?: string;
  category?: string;
  description?: string;
  mrp?: number;
  barcode?: string;
  status: 'VALID' | 'WARNING' | 'ERROR';
  errorMessage?: string;
  matchedCatalogueItemId?: string;
  matchedProductId?: string;
  matchedProductName?: string;
  action: 'NEW' | 'UPDATE' | 'MATCH' | 'ERROR';
  rawData: Record<string, any>;
}





