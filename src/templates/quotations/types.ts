import { QuotationItem, InvoiceItem } from '../../types';
import { BrandingConfig, ThemeConfig, DocumentCustomization } from '../../types/template';

export type QuotationCategory =
  | 'All'
  | 'Corporate'
  | 'Modern'
  | 'Premium'
  | 'Creative'
  | 'Retail'
  | 'Service'
  | 'Industry';

export type TemplateRenderMode = 'preview' | 'print' | 'pdf';

export interface BusinessData {
  businessName: string;
  legalName?: string;
  ownerName?: string;
  phone?: string;
  alternatePhone?: string;
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
  regNumber?: string;
  bankDetails?: {
    bankName?: string;
    accountHolder?: string;
    accountNo?: string;
    ifscCode?: string;
    branch?: string;
    upiId?: string;
  };
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

export interface QuotationData {
  id?: string;
  quotationNumber: string;
  date: string;
  validUntil: string;
  referenceNumber?: string;
  currency?: string;
  items: (QuotationItem | InvoiceItem)[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  notes?: string;
  terms?: string;
  footerText?: string;
}

export interface TemplateTheme {
  id: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundColor?: string;
  cardBg?: string;
  borderColor?: string;
  fontFamily: string;
}

export interface QuotationTemplateProps {
  quotation: QuotationData;
  business: BusinessData;
  customer?: CustomerData;
  branding: BrandingConfig;
  theme: TemplateTheme;
  customization?: DocumentCustomization;
  mode?: TemplateRenderMode;
  isPrintMode?: boolean;
}

export interface QuotationTemplateMetadata {
  id: string;
  name: string;
  category: QuotationCategory;
  description: string;
  previewColor: string;
  badgeText?: string;
  component: React.ComponentType<QuotationTemplateProps>;
}
