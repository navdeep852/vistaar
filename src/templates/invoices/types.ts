import React from 'react';
import { BrandingConfig, DocumentCustomization } from '../../types/template';

export type InvoiceTemplateCategory =
  | 'corporate'
  | 'modern'
  | 'premium'
  | 'creative'
  | 'retail'
  | 'service';

export interface InvoiceTemplateDefinition {
  id: string;
  name: string;
  category: InvoiceTemplateCategory;
  description: string;
  component: React.FC<InvoiceTemplateProps>;
  defaultTheme: InvoiceTemplateTheme;
}

export type InvoiceCategory = InvoiceTemplateCategory;
export type InvoiceTemplateMetadata = InvoiceTemplateDefinition;

export type PaymentStatus = 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'OVERDUE';

export interface InvoiceItemData {
  id?: string;
  productName: string;
  sku?: string;
  unit?: string;
  quantity: number;
  sellingPrice: number;
  buyPrice?: number;
  discountAmount?: number;
  taxPercent?: number;
  taxAmount?: number;
  total: number;
}

export interface BusinessBankDetails {
  bankName?: string;
  accountHolder?: string;
  accountNo?: string;
  ifscCode?: string;
  branch?: string;
  upiId?: string;
}

export interface BusinessData {
  businessName: string;
  legalName?: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
  pan?: string;
  bankDetails?: BusinessBankDetails;
}

export interface CustomerData {
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

export interface InvoiceData {
  id?: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  referenceNumber?: string;
  paymentStatus?: PaymentStatus | string;
  items: InvoiceItemData[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  currency?: string;
  notes?: string;
  terms?: string;
  footerText?: string;
}

export interface InvoiceTemplateTheme {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;
}

export interface InvoiceTemplateProps {
  invoice: InvoiceData;
  business: BusinessData;
  customer?: CustomerData;
  branding: BrandingConfig;
  theme: InvoiceTemplateTheme;
  customization?: DocumentCustomization;
  mode?: 'preview' | 'print' | 'pdf';
  isPrintMode?: boolean;
}
