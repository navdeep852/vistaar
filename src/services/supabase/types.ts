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
import { calculateInvoiceFinancials } from '../financialCalculationService';
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
  legal_name?: string | null;
  business_type?: string | null;
  business_description?: string | null;
  owner_name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  website?: string | null;
  gstin?: string | null;
  pan?: string | null;
  reg_number?: string | null;
  address?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  logo_url?: string | null;
  logo_alignment?: string | null;
  logo_scale?: number | null;
  signature_url?: string | null;
  signature_alignment?: string | null;
  signature_scale?: number | null;
  stamp_url?: string | null;
  stamp_alignment?: string | null;
  stamp_scale?: number | null;
  bank_details?: any;
  show_bank_on_invoice?: boolean | null;
  show_bank_on_quotation?: boolean | null;
  currency?: string | null;
  default_tax_mode?: string | null;
  invoice_prefix?: string | null;
  quotation_prefix?: string | null;
  default_payment_terms?: string | null;
  default_quotation_validity?: string | null;
  default_font?: string | null;
  default_orientation?: string | null;
  default_invoice_template?: string | null;
  default_quotation_template?: string | null;
  brand_color?: string | null;
  theme?: string | null;
  terms_and_conditions?: string | null;
  default_invoice_terms?: string | null;
  default_quotation_terms?: string | null;
  upi_qr_url?: string | null;
  show_upi_qr_on_quotation?: boolean | null;
  created_at?: string;
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
  location?: string;
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
  invoice_id?: string | null;
  status: string;
  created_at?: string;
}

export interface DbExpense {
  id: string;
  workspace_id: string;
  category: string;
  expense_name?: string | null;
  amount: number;
  expense_date?: string;
  date?: string;
  payment_mode?: string | null;
  paid_to?: string | null;
  reference_no?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface DbFollowUp {
  id: string;
  workspace_id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone: string;
  invoice_id?: string | null;
  udhari_id?: string | null;
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
    location: row.location,
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
    location: prod.location ? prod.location.trim() : undefined,
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
  total_amount?: number | null;
  remaining_amount?: number | null;
  payment_status?: string | null;
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
    referenceNumber: row.reference_number || (row.reference_id && row.reference_type === 'INVOICE' ? `INV-${row.reference_id.substring(0, 8)}` : (row.reference_number || undefined)),
    description: (() => {
      const refNum = row.reference_number || (row.reference_id && row.reference_type === 'INVOICE' ? `INV-${row.reference_id.substring(0, 8)}` : (row.transaction_code || ''));
      let d = row.description;
      if (d && (d.includes('undefined') || d.includes('null'))) {
        d = d.replace(/#undefined/g, `#${refNum}`).replace(/undefined/g, refNum).replace(/#null/g, `#${refNum}`).replace(/null/g, refNum);
      }
      if (!d || d.trim() === '' || d.trim() === 'Invoice #' || d.trim() === 'Invoice') {
        d = `${row.reference_type || 'Transaction'} #${refNum}`.trim();
      }
      return d;
    })(),
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
    totalAmount: row.total_amount !== undefined && row.total_amount !== null ? Number(row.total_amount) : null,
    remainingAmount: row.remaining_amount !== undefined && row.remaining_amount !== null ? Number(row.remaining_amount) : null,
    paymentStatus: (row.payment_status as any) || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
  };
}

export function fromDbInvoice(row: any): Invoice {
  const { grandTotal, paidAmount, balanceAmount } = calculateInvoiceFinancials(
    row.grand_total ?? row.grandTotal,
    row.paid_amount ?? row.paidAmount
  );
  const items: InvoiceItem[] = (row.invoice_items || row.items || []).map((it: any) => ({
    id: it.id,
    itemType: it.item_type || it.itemType || 'product',
    productId: it.product_id || it.productId,
    productName: it.product_name || it.productName || '',
    description: it.description || '',
    partNumber: it.part_number || it.partNumber,
    sku: it.sku,
    unit: it.unit || 'pcs',
    quantity: Number(it.quantity) || 0,
    buyPrice: Number(it.buy_price ?? it.buyPrice) || 0,
    sellingPrice: Number(it.selling_price ?? it.sellingPrice ?? it.unit_price ?? it.unitPrice) || 0,
    discountAmount: Number(it.discount_amount ?? it.discountAmount) || 0,
    taxPercent: Number(it.tax_percent ?? it.taxPercent) || 0,
    taxAmount: Number(it.tax_amount ?? it.taxAmount) || 0,
    total: Number(it.total) || 0,
  }));

  let status = row.status;
  if (status !== 'Draft' && status !== 'Cancelled') {
    if (balanceAmount <= 0.01) {
      status = 'Paid';
    } else if (paidAmount > 0) {
      status = 'Partially Paid';
    } else {
      status = 'Issued';
    }
  }

  return {
    id: row.id,
    invoiceNumber: row.invoice_number || row.invoiceNumber,
    quotationId: row.quotation_id || row.quotationId,
    customerId: row.customer_id || row.customerId,
    customerName: row.customer_name || row.customerName || 'Customer',
    customerPhone: row.customer_phone || row.customerPhone || '',
    customerWhatsapp: row.customer_whatsapp || row.customerWhatsapp,
    customerEmail: row.customer_email || row.customerEmail,
    customerAddress: row.customer_address || row.customerAddress,
    customerGstin: row.customer_gstin || row.customerGstin,
    status: status,
    date: row.date || row.invoice_date || (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    dueDate: row.due_date || row.dueDate || row.date,
    items,
    subtotal: Number(row.subtotal) || 0,
    discountTotal: Number(row.discount_total ?? row.discountTotal) || 0,
    taxTotal: Number(row.tax_total ?? row.taxTotal) || 0,
    grandTotal,
    paidAmount,
    balanceAmount,
    notes: row.notes,
    terms: row.terms,
    footerText: row.footer_text || row.footerText,
    templateId: row.template_id || row.templateId || 'modern',
    branding: row.branding,
    theme: row.theme,
    customization: row.customization,
    snapshot: row.snapshot,
    isSnapshotFinalized: row.is_snapshot_finalized ?? row.isSnapshotFinalized,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  };
}

export function fromDbCounterSaleItem(row: any): CounterSaleItem {
  return {
    id: row.id,
    counterSaleId: row.counter_sale_id || row.counterSaleId || '',
    productId: row.product_id || row.productId || '',
    stockReceiptId: row.stock_receipt_id || row.stockReceiptId || undefined,
    productNameSnapshot: row.product_name_snapshot || row.productNameSnapshot || row.product_name || row.productName || 'Product',
    partNumberSnapshot: row.part_number_snapshot || row.partNumberSnapshot || row.part_number || row.partNumber || '',
    quantity: Number(row.quantity) || 0,
    rate: Number(row.rate) || 0,
    amount: Number(row.amount) || (Number(row.quantity) || 0) * (Number(row.rate) || 0),
    buyPriceSnapshot: row.buy_price_snapshot !== undefined ? Number(row.buy_price_snapshot) : undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function fromDbCounterSale(row: any): CounterSale {
  const rawItems = row.counter_sale_items || row.items || [];
  const mappedItems = Array.isArray(rawItems) ? rawItems.map((item: any) => fromDbCounterSaleItem(item)) : [];

  return {
    id: row.id,
    saleNumber: row.sale_number || row.saleNumber || `CS-${row.id}`,
    customerId: row.customer_id || row.customerId || undefined,
    customerName: row.customer_name || row.customerName || 'Walk-in Customer',
    phoneNumber: row.phone_number || row.phoneNumber || '',
    saleDate: row.sale_date || row.saleDate || (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    invoiceNumber: row.invoice_number || row.invoiceNumber || row.sale_number || row.saleNumber || '',
    estimateReference: row.estimate_reference || row.estimateReference || '',
    subtotal: Number(row.subtotal) || 0,
    discountType: (row.discount_type || row.discountType || 'fixed') as any,
    discountValue: Number(row.discount_value || row.discountValue) || 0,
    discountAmount: Number(row.discount_amount || row.discountAmount) || 0,
    finalTotal: Number(row.final_total || row.finalTotal) || Number(row.subtotal) || 0,
    status: (row.status as any) || 'COMPLETED',
    items: mappedItems,
    notes: row.notes || undefined,
    paymentMethod: row.payment_method || row.paymentMethod || 'Cash',
    amountReceived: row.amount_received !== undefined ? Number(row.amount_received) : (row.amountReceived !== undefined ? Number(row.amountReceived) : undefined),
    balanceAmount: row.balance_amount !== undefined ? Number(row.balance_amount) : (row.balanceAmount !== undefined ? Number(row.balanceAmount) : undefined),
    paymentReference: row.payment_reference || row.paymentReference || undefined,
    paymentNotes: row.payment_notes || row.paymentNotes || undefined,
    createdBy: row.created_by || row.createdBy || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

export function fromDbAccountingEntry(row: any): any {
  return {
    id: row.id,
    workspaceId: row.workspace_id || row.workspaceId,
    entryDate: row.entry_date || row.entryDate || new Date().toISOString().split('T')[0],
    entryNumber: row.entry_number || row.entryNumber || '',
    entryType: row.entry_type || row.entryType || 'SALE',
    sourceType: row.source_type || row.sourceType || 'MANUAL',
    sourceId: row.source_id || row.sourceId || undefined,
    referenceNumber: row.reference_number || row.referenceNumber || '',
    description: row.description || '',
    customerId: row.customer_id || row.customerId || undefined,
    supplierId: row.supplier_id || row.supplierId || undefined,
    debitAccount: row.debit_account || row.debitAccount || undefined,
    creditAccount: row.credit_account || row.creditAccount || undefined,
    amount: Number(row.amount) || 0,
    paymentMethod: row.payment_method || row.paymentMethod || undefined,
    notes: row.notes || undefined,
    createdBy: row.created_by || row.createdBy || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function fromDbCashbookEntry(row: any): any {
  return {
    id: row.id,
    workspaceId: row.workspace_id || row.workspaceId,
    entryDate: row.entry_date || row.entryDate || new Date().toISOString().split('T')[0],
    entryNumber: row.entry_number || row.entryNumber || '',
    direction: row.direction || 'IN',
    amount: Number(row.amount) || 0,
    paymentMethod: row.payment_method || row.paymentMethod || 'Cash',
    accountName: row.account_name || row.accountName || 'Cash Account',
    sourceType: row.source_type || row.sourceType || 'MANUAL',
    sourceId: row.source_id || row.sourceId || undefined,
    referenceNumber: row.reference_number || row.referenceNumber || '',
    partyName: row.party_name || row.partyName || '',
    description: row.description || '',
    notes: row.notes || undefined,
    createdBy: row.created_by || row.createdBy || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function fromDbExpense(row: any): Expense {
  return {
    id: row.id,
    category: row.category,
    expenseName: row.expense_name || undefined,
    amount: Number(row.amount) || 0,
    date: row.expense_date || row.date || (row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    paymentMode: row.payment_mode || 'Cash',
    paidTo: row.paid_to || undefined,
    referenceNo: row.reference_no || undefined,
    notes: row.notes || undefined,
    sourceType: row.source_type || undefined,
    sourceId: row.source_id || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}
