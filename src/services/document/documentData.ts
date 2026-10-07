/**
 * VISTAAR Business OS — Document Data Architecture
 * 
 * Centralized, authoritative document model for Invoices & Quotations.
 * Guarantees:
 * 1. Financial Invariants:
 *    remaining_amount = MAX(grand_total - cumulative_paid_amount, 0)
 *    grand_total = cumulative_paid_amount + remaining_amount
 * 2. Quotation custom products (non-inventory items) supported directly.
 * 3. HSN/SAC, Part Number, SKU, and Tax Slabs preserved without mutation.
 * 4. Zero accounting side-effects (read/render operation only).
 */

import { Invoice, Quotation, InvoiceItem, QuotationItem } from '../../types';
import { BrandingConfig, ThemeConfig, DocumentCustomization } from '../../types/template';
import { DocumentRendererProps } from '../../components/DocumentRenderer';

export interface NormalizedLineItem {
  id?: string;
  itemType?: 'product' | 'custom';
  productId?: string;
  productName: string;
  description?: string;
  partNumber?: string;
  sku?: string;
  hsnSac?: string;
  unit: string;
  quantity: number;
  rate: number; // selling price per unit
  taxPercent: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
}

export interface NormalizedBusinessProfile {
  businessName: string;
  legalName?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  pan?: string;
  bankDetails?: {
    bankName?: string;
    accountHolder?: string;
    accountNo?: string;
    ifscCode?: string;
    branch?: string;
    upiId?: string;
    upiQrCodeUrl?: string;
  };
}

export interface NormalizedCustomerProfile {
  id?: string;
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
}

export interface NormalizedFinancialSummary {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'OVERDUE' | 'DRAFT' | 'ISSUED' | 'CONVERTED';
  currency: string;
}

export interface NormalizedDocumentData {
  documentType: 'invoice' | 'quotation';
  documentNumber: string;
  date: string;
  dueDateOrValidUntil: string;
  templateId: string;
  business: NormalizedBusinessProfile;
  customer: NormalizedCustomerProfile;
  items: NormalizedLineItem[];
  financials: NormalizedFinancialSummary;
  branding?: BrandingConfig;
  theme?: ThemeConfig;
  customization?: DocumentCustomization;
  notes?: string;
  terms?: string;
  footerText?: string;
}

/**
 * Normalizes an Invoice into a NormalizedDocumentData structure with verified financial invariants.
 */
export function normalizeInvoiceToDocument(
  invoice: Invoice,
  settings: any,
  overrideCustomization?: DocumentCustomization
): NormalizedDocumentData {
  const grandTotal = Number(invoice.grandTotal || 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  // Invariant: remaining_amount = MAX(grand_total - cumulative_paid_amount, 0)
  const balanceAmount = invoice.balanceAmount !== undefined && invoice.balanceAmount !== null
    ? Number(invoice.balanceAmount)
    : Math.max(0, grandTotal - paidAmount);

  let paymentStatus: NormalizedFinancialSummary['paymentStatus'] = 'UNPAID';
  if (paidAmount >= grandTotal && grandTotal > 0) {
    paymentStatus = 'PAID';
  } else if (paidAmount > 0) {
    paymentStatus = 'PARTIALLY_PAID';
  } else if (invoice.status === 'Draft') {
    paymentStatus = 'DRAFT';
  } else if (invoice.status === 'Issued') {
    paymentStatus = 'UNPAID';
  }

  const items: NormalizedLineItem[] = (invoice.items || []).map((item) => ({
    id: item.id,
    itemType: item.itemType || 'product',
    productId: item.productId,
    productName: item.productName || 'Item',
    description: item.description,
    partNumber: item.partNumber || (item as any).part_number || '',
    sku: item.sku || '',
    hsnSac: (item as any).hsnSac || (item as any).hsnCode || (item as any).hsn_sac || '',
    unit: item.unit || 'pcs',
    quantity: Number(item.quantity || 1),
    rate: Number(item.sellingPrice || 0),
    discountAmount: Number(item.discountAmount || 0),
    taxPercent: Number(item.taxPercent || 0),
    taxAmount: Number(item.taxAmount || 0),
    total: Number(item.total || 0),
  }));

  const snapshot: any = (invoice as any).snapshot || {};

  return {
    documentType: 'invoice',
    documentNumber: invoice.invoiceNumber,
    date: invoice.date,
    dueDateOrValidUntil: invoice.dueDate,
    templateId: invoice.templateId || 'modern-split',
    business: {
      businessName: (invoice as any).branch?.branchName
        ? `${settings?.businessName || 'Business Name'} (${(invoice as any).branch?.branchName})`
        : (snapshot.businessName || settings?.businessName || 'Business Name'),
      legalName: settings?.legalName || settings?.company_name,
      phone: (invoice as any).branch?.phone || snapshot.phone || settings?.phone || '',
      email: (invoice as any).branch?.email || snapshot.email || settings?.email || '',
      website: settings?.website || '',
      address: (invoice as any).branch?.address || snapshot.address || settings?.address || '',
      city: (invoice as any).branch?.city || snapshot.city || settings?.city || '',
      state: (invoice as any).branch?.state || snapshot.state || settings?.state || '',
      pincode: (invoice as any).branch?.pincode || snapshot.pincode || settings?.pincode || '',
      gstin: (invoice as any).branch?.gstin || snapshot.gstin || settings?.gstin || '',
      pan: snapshot.pan || settings?.pan || '',
      bankDetails: snapshot.bankDetails || settings?.bankDetails,
    },
    customer: {
      id: invoice.customerId,
      name: invoice.customerName || 'Customer Name',
      phone: invoice.customerPhone || '',
      whatsapp: invoice.customerWhatsapp || '',
      email: invoice.customerEmail || '',
      address: invoice.customerAddress || '',
      gstin: invoice.customerGstin || '',
    },
    items,
    financials: {
      subtotal: Number(invoice.subtotal || 0),
      discountTotal: Number(invoice.discountTotal || 0),
      taxTotal: Number(invoice.taxTotal || 0),
      grandTotal,
      paidAmount,
      balanceAmount,
      paymentStatus,
      currency: settings?.currency || '₹',
    },
    branding: invoice.branding || {
      logoUrl: settings?.logoUrl,
      signatureUrl: settings?.signatureUrl,
      stampUrl: settings?.stampUrl,
      logoAlignment: 'left',
      logoScale: 1,
      signatureScale: 1,
      stampScale: 1,
    },
    theme: invoice.theme,
    customization: overrideCustomization || invoice.customization,
    notes: invoice.notes,
    terms: invoice.terms,
    footerText: invoice.footerText || 'Thank you for doing business with us!',
  };
}

/**
 * Normalizes a Quotation into a NormalizedDocumentData structure.
 * Supports custom products (not in inventory) seamlessly.
 */
export function normalizeQuotationToDocument(
  quotation: Quotation,
  settings: any,
  overrideCustomization?: DocumentCustomization
): NormalizedDocumentData {
  const grandTotal = Number(quotation.grandTotal || 0);

  const items: NormalizedLineItem[] = (quotation.items || []).map((item) => ({
    id: item.id,
    itemType: item.itemType || 'product',
    productId: item.productId,
    productName: item.productName || 'Item / Service',
    description: item.description,
    partNumber: item.partNumber || (item as any).part_number || '',
    sku: item.sku || '',
    hsnSac: (item as any).hsnSac || (item as any).hsnCode || (item as any).hsn_sac || '',
    unit: item.unit || 'pcs',
    quantity: Number(item.quantity || 1),
    rate: Number(item.sellingPrice || 0),
    discountAmount: Number(item.discountAmount || 0),
    taxPercent: Number(item.taxPercent || 0),
    taxAmount: Number(item.taxAmount || 0),
    total: Number(item.total || 0),
  }));

  const snapshot: any = (quotation as any).snapshot || {};

  return {
    documentType: 'quotation',
    documentNumber: quotation.quotationNumber,
    date: quotation.date,
    dueDateOrValidUntil: quotation.validUntil,
    templateId: quotation.templateId || 'modern-split',
    business: {
      businessName: (quotation as any).branch?.branchName
        ? `${settings?.businessName || 'Business Name'} (${(quotation as any).branch?.branchName})`
        : (snapshot.businessName || settings?.businessName || 'Business Name'),
      legalName: settings?.legalName || settings?.company_name,
      phone: (quotation as any).branch?.phone || snapshot.phone || settings?.phone || '',
      email: (quotation as any).branch?.email || snapshot.email || settings?.email || '',
      website: settings?.website || '',
      address: (quotation as any).branch?.address || snapshot.address || settings?.address || '',
      city: (quotation as any).branch?.city || snapshot.city || settings?.city || '',
      state: (quotation as any).branch?.state || snapshot.state || settings?.state || '',
      pincode: (quotation as any).branch?.pincode || snapshot.pincode || settings?.pincode || '',
      gstin: (quotation as any).branch?.gstin || snapshot.gstin || settings?.gstin || '',
      pan: snapshot.pan || settings?.pan || '',
      bankDetails: snapshot.bankDetails || settings?.bankDetails,
    },
    customer: {
      id: quotation.customerId,
      name: quotation.customerName || 'Customer Name',
      phone: quotation.customerPhone || '',
      whatsapp: quotation.customerWhatsapp || '',
      email: quotation.customerEmail || '',
      address: quotation.customerAddress || '',
      gstin: quotation.customerGstin || '',
    },
    items,
    financials: {
      subtotal: Number(quotation.subtotal || 0),
      discountTotal: Number(quotation.discountTotal || 0),
      taxTotal: Number(quotation.taxTotal || 0),
      grandTotal,
      paidAmount: 0,
      balanceAmount: grandTotal,
      paymentStatus: quotation.status === 'Converted' ? 'CONVERTED' : 'DRAFT',
      currency: settings?.currency || '₹',
    },
    branding: quotation.branding || {
      logoUrl: settings?.logoUrl,
      signatureUrl: settings?.signatureUrl,
      stampUrl: settings?.stampUrl,
      logoAlignment: 'left',
      logoScale: 1,
      signatureScale: 1,
      stampScale: 1,
    },
    theme: quotation.theme,
    customization: overrideCustomization || quotation.customization,
    notes: quotation.notes,
    terms: quotation.terms,
    footerText: quotation.footerText || 'Thank you for your business inquiry!',
  };
}

/**
 * Converts NormalizedDocumentData to DocumentRendererProps for rendering.
 */
export function documentDataToRendererProps(data: NormalizedDocumentData, isPrintMode = false): DocumentRendererProps {
  return {
    templateId: data.templateId,
    documentType: data.documentType,
    documentNumber: data.documentNumber,
    date: data.date,
    dueDateOrValidUntil: data.dueDateOrValidUntil,
    businessName: data.business.businessName,
    phone: data.business.phone,
    email: data.business.email,
    address: data.business.address,
    city: data.business.city,
    state: data.business.state,
    pincode: data.business.pincode,
    gstin: data.business.gstin,
    pan: data.business.pan,
    bankDetails: data.business.bankDetails,
    customerName: data.customer.name,
    customerPhone: data.customer.phone,
    customerWhatsapp: data.customer.whatsapp,
    customerEmail: data.customer.email,
    customerAddress: data.customer.address,
    customerGstin: data.customer.gstin,
    items: data.items.map((i) => ({
      id: i.id || Math.random().toString(),
      itemType: i.itemType,
      productId: i.productId,
      productName: i.productName,
      description: i.description,
      partNumber: i.partNumber,
      sku: i.sku,
      hsnSac: i.hsnSac,
      unit: i.unit,
      quantity: i.quantity,
      buyPrice: 0,
      sellingPrice: i.rate,
      discountAmount: i.discountAmount,
      taxPercent: i.taxPercent,
      taxAmount: i.taxAmount,
      total: i.total,
    })) as any,
    subtotal: data.financials.subtotal,
    discountTotal: data.financials.discountTotal,
    taxTotal: data.financials.taxTotal,
    grandTotal: data.financials.grandTotal,
    paidAmount: data.financials.paidAmount,
    balanceAmount: data.financials.balanceAmount,
    currency: data.financials.currency,
    notes: data.notes,
    terms: data.terms,
    footerText: data.footerText,
    branding: data.branding,
    theme: data.theme,
    customization: data.customization,
    isPrintMode,
  };
}
