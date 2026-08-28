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
} from '../../types';

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
  return {
    id: row.id,
    name: row.name,
    productName: row.name,
    partNumber: row.part_number,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.category_id || '',
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

  return {
    workspace_id: workspaceId,
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
  } as any;
}
