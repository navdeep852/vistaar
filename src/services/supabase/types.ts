import type {
  Customer,
  Category,
  Supplier,
  Product,
  StockReceipt,
  StockMovement,
  CounterSale,
  CounterSaleItem,
  Quotation,
  QuotationItem,
  Invoice,
  InvoiceItem,
  Payment,
  UdhariRecord,
  UdhariPaymentRecord,
  Expense,
  FollowUp,
  AppNotification,
  BusinessSettings,
  FinancialAccount,
  FinancialAccountType,
  DaybookTransaction,
} from '../../types';
import { isValidUuid } from '../../lib/supabaseError';


export interface DbWorkspace {
  id: string;
  company_name: string;
  owner_name: string;
  owner_email: string;
  owner_phone?: string;
  created_at: string;
  updated_at: string;
}

export interface DbProfile {
  id: string;
  workspace_id: string;
  employee_id: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  designation?: string;
  role: string;
  status: string;
  avatar_url?: string;
  must_change_password?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbBusinessSettings {
  workspace_id: string;
  legal_name?: string;
  business_type?: string;
  owner_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  currency?: string;
  gstin?: string;
  pan?: string;
  logo_url?: string;
  signature_url?: string;
  stamp_url?: string;
  bank_details?: any;
  terms_and_conditions?: string;
  updated_at?: string;
}

export interface DbCategory {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  created_at?: string;
}

export interface DbSupplier {
  id: string;
  workspace_id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  created_at?: string;
}

export interface DbCustomer {
  id: string;
  workspace_id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  customer_type: string;
  credit_limit: number;
  payment_terms?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbProduct {
  id: string;
  workspace_id: string;
  category_id?: string;
  supplier_id?: string;
  name: string;
  part_number?: string;
  sku: string;
  barcode?: string;
  unit: string;
  buy_price: number;
  selling_price: number;
  minimum_stock: number;
  tax_percent: number;
  hsn_sac?: string;
  description?: string;
  categories?: { name: string } | { name: string }[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface DbStockReceipt {
  id: string;
  workspace_id: string;
  product_id: string;
  supplier_id?: string;
  receipt_number: string;
  purchase_order_number?: string;
  received_date: string;
  quantity_received: number;
  quantity_remaining: number;
  buy_price: number;
  notes?: string;
  created_at?: string;
}

export interface DbCounterSale {
  id: string;
  workspace_id: string;
  customer_id?: string;
  sale_number: string;
  invoice_number?: string;
  customer_name: string;
  phone_number?: string;
  sale_date: string;
  subtotal: number;
  discount_type: string;
  discount_value: number;
  discount_amount: number;
  final_total: number;
  status: string;
  created_at?: string;
}

export interface DbQuotation {
  id: string;
  workspace_id: string;
  customer_id?: string;
  quotation_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  status: string;
  valid_until: string;
  date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  notes?: string;
  created_at?: string;
}

export interface DbInvoice {
  id: string;
  workspace_id: string;
  customer_id?: string;
  invoice_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  status: string;
  date: string;
  due_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  paid_amount: number;
  balance_amount: number;
  created_at?: string;
}

export interface DbUdhariRecord {
  id: string;
  workspace_id: string;
  customer_id?: string;
  udhari_code: string;
  customer_name_snapshot: string;
  phone_snapshot: string;
  original_amount: number;
  total_received: number;
  outstanding_amount: number;
  due_date: string;
  status: string;
  created_at?: string;
}

export interface DbExpense {
  id: string;
  workspace_id: string;
  category: string;
  expense_name?: string;
  amount: number;
  date: string;
  paid_to?: string;
  created_at?: string;
}

export interface DbFollowUp {
  id: string;
  workspace_id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  title: string;
  due_date: string;
  due_time: string;
  priority: string;
  status: string;
  action_type: string;
  attempt_count: number;
  max_attempts: number;
  execution_logs?: any;
  created_at?: string;
}

export interface DbNotification {
  id: string;
  workspace_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  link_route?: string;
  created_at?: string;
}

// Adapters: Db ↔ Legacy Domain Types
export function fromDbCustomer(row: DbCustomer): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    whatsapp: row.whatsapp || row.phone || '',
    email: row.email || '',
    address: row.address || '',
    city: row.city || '',
    state: row.state || '',
    pincode: row.pincode || '',
    gstin: row.gstin,
    customerType: (row.customer_type as any) || 'Retail',
    creditLimit: Number(row.credit_limit) || 0,
    paymentTerms: row.payment_terms || 'Net 15',
    notes: row.notes,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function toDbCustomer(cust: Partial<Customer>, workspaceId: string): Partial<DbCustomer> {
  return {
    workspace_id: workspaceId,
    name: cust.name,
    phone: cust.phone,
    whatsapp: cust.whatsapp,
    email: cust.email,
    address: cust.address,
    city: cust.city,
    state: cust.state,
    pincode: cust.pincode,
    gstin: cust.gstin,
    customer_type: cust.customerType || 'Retail',
    credit_limit: cust.creditLimit || 0,
    payment_terms: cust.paymentTerms,
    notes: cust.notes,
  };
}

export function fromDbProduct(row: DbProduct): Product {
  let catName = '';
  const rawCats = (row as any).categories;
  if (rawCats) {
    if (Array.isArray(rawCats)) {
      catName = rawCats[0]?.name || '';
    } else if (typeof rawCats === 'object') {
      catName = rawCats.name || '';
    }
  }

  return {
    id: row.id,
    name: row.name,
    productName: row.name,
    partNumber: row.part_number,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.category_id || '',
    category: catName,
    unit: row.unit || 'Pcs',
    buyPrice: Number(row.buy_price) || 0,
    sellingPrice: Number(row.selling_price) || 0,
    minimumStock: Number(row.minimum_stock) || 0,
    currentStock: Number((row as any).current_stock ?? 0),
    taxPercent: Number(row.tax_percent) || 0,
    hsnSac: row.hsn_sac,
    description: row.description,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function toDbProduct(prod: Partial<Product>, workspaceId: string): Partial<DbProduct> {
  const name = (prod.name || prod.productName || 'Untitled Product').trim();
  const partNumber = (prod.partNumber || prod.productCode || '').trim();
  const sku = (prod.sku || partNumber || `SKU-${Date.now()}`).trim();

  const payload: any = {
    name,
    part_number: partNumber || undefined,
    sku,
    barcode: prod.barcode || undefined,
    category_id: prod.categoryId || undefined,
    supplier_id: prod.supplierId || undefined,
    unit: prod.unit || 'Piece',
    buy_price: Number(prod.buyPrice) || 0,
    selling_price: Number(prod.sellingPrice) || Number(prod.buyPrice) || 0,
    minimum_stock: Number(prod.minimumStock) || 0,
    current_stock: Number(prod.currentStock) || 0,
    tax_percent: Number(prod.taxPercent) || Number(prod.gstRate) || 0,
    hsn_sac: prod.hsnSac || undefined,
    description: prod.description || prod.notes || undefined,
  };

  if (isValidUuid(workspaceId)) {
    payload.workspace_id = workspaceId;
  }

  return payload;
}

export interface DbFinancialAccount {
  id: string;
  workspace_id: string;
  name: string;
  account_type: string;
  account_number?: string | null;
  ifsc_code?: string | null;
  opening_balance: number;
  opening_balance_date: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function fromDbFinancialAccount(db: DbFinancialAccount): FinancialAccount {
  return {
    id: db.id,
    workspaceId: db.workspace_id,
    name: db.name,
    accountType: db.account_type as FinancialAccountType,
    accountNumber: db.account_number || undefined,
    ifscCode: db.ifsc_code || undefined,
    openingBalance: Number(db.opening_balance) || 0,
    openingBalanceDate: db.opening_balance_date,
    isDefault: db.is_default,
    isActive: db.is_active,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export interface DbDaybookTransaction {
  id: string;
  workspace_id: string;
  transaction_code: string;
  transaction_date: string;
  transaction_time?: string;
  transaction_type: string;
  direction: string;
  amount: number;
  payment_mode?: string;
  financial_account_id?: string;
  transfer_target_account_id?: string;
  party_type?: string;
  party_id?: string;
  party_name?: string;
  reference_type: string;
  reference_id?: string;
  reference_number?: string;
  description?: string;
  notes?: string;
  status: string;
  gst_applicable?: boolean;
  gst_registration_status?: string;
  gstin?: string;
  place_of_supply?: string;
  taxable_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  utgst_amount?: number;
  cess_amount?: number;
  total_tax_amount?: number;
  hsn_sac_code?: string;
  is_reverse_charge?: boolean;
  tax_category?: string;
  tds_tcs_amount?: number;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

export function fromDbDaybookTransaction(row: DbDaybookTransaction): DaybookTransaction {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    transactionCode: row.transaction_code,
    transactionDate: row.transaction_date,
    transactionTime: row.transaction_time,
    transactionType: row.transaction_type as any,
    direction: row.direction as any,
    amount: Number(row.amount) || 0,
    paymentMode: (row.payment_mode || 'Cash') as any,
    financialAccountId: row.financial_account_id || undefined,
    transferTargetAccountId: row.transfer_target_account_id || undefined,
    partyType: row.party_type as any,
    partyId: row.party_id || undefined,
    partyName: row.party_name || undefined,
    referenceType: row.reference_type as any,
    referenceId: row.reference_id || undefined,
    referenceNumber: row.reference_number || undefined,
    description: row.description || undefined,
    notes: row.notes || undefined,
    status: (row.status || 'COMPLETED') as any,
    gstApplicable: Boolean(row.gst_applicable),
    gstRegistrationStatus: row.gst_registration_status || undefined,
    gstin: row.gstin || undefined,
    placeOfSupply: row.place_of_supply || undefined,
    taxableAmount: Number(row.taxable_amount) || 0,
    cgstAmount: Number(row.cgst_amount) || 0,
    sgstAmount: Number(row.sgst_amount) || 0,
    igstAmount: Number(row.igst_amount) || 0,
    utgstAmount: Number(row.utgst_amount) || 0,
    cessAmount: Number(row.cess_amount) || 0,
    totalTaxAmount: Number(row.total_tax_amount) || 0,
    hsnSacCode: row.hsn_sac_code || undefined,
    isReverseCharge: Boolean(row.is_reverse_charge),
    taxCategory: (row.tax_category || 'TAXABLE') as any,
    tdsTcsAmount: Number(row.tds_tcs_amount) || 0,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
  };
}


