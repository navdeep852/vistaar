export type TemplateCategory =
  | 'All'
  | 'Minimal'
  | 'Corporate'
  | 'Modern'
  | 'Classic'
  | 'Creative'
  | 'Retail'
  | 'Service'
  | 'Premium';

export type DocumentType = 'invoice' | 'quotation';
export type LogoAlignment = 'left' | 'center' | 'right';
export type ElementAlignment = 'left' | 'center' | 'right';

export type FontFamily =
  | 'Inter'
  | 'Roboto'
  | 'Poppins'
  | 'Montserrat'
  | 'Open Sans'
  | 'Lato'
  | 'Nunito Sans'
  | 'Source Sans 3'
  | 'Merriweather'
  | 'Playfair Display';

export const DOCUMENT_FONTS: FontFamily[] = [
  'Inter',
  'Roboto',
  'Poppins',
  'Montserrat',
  'Open Sans',
  'Lato',
  'Nunito Sans',
  'Source Sans 3',
  'Merriweather',
  'Playfair Display',
];

export interface BrandingConfig {
  logoUrl?: string;
  logoAlignment: LogoAlignment;
  logoScale: number; // 0.5 to 1.5
  logoSource?: 'saved' | 'override' | 'none';

  signatureUrl?: string;
  signatureScale: number;
  signatureSource?: 'saved' | 'override' | 'none';

  stampUrl?: string;
  stampScale: number;
  stampSource?: 'saved' | 'override' | 'none';
}

export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  fontFamily: FontFamily;
}

export interface DocumentCustomization {
  fontFamily: FontFamily;
  headingFont: FontFamily;
  bodyFont: FontFamily;
  fontScale: 'compact' | 'standard' | 'large';

  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;

  // Section Toggles
  showGstin: boolean;
  showPan: boolean;
  showHsnSac: boolean;
  showBankDetails: boolean;
  showUpi: boolean;
  showSignature: boolean;
  showStamp: boolean;
  showTerms: boolean;
  showNotes: boolean;
  showDueDate: boolean;

  // Element Alignments
  businessAlignment: ElementAlignment;
  titleAlignment: ElementAlignment;

  // Print & Page Setup
  orientation?: 'portrait' | 'landscape';
}

export interface DocumentTemplate {
  id: string;
  name: string;
  type: DocumentType;
  category: TemplateCategory;
  description: string;
  style: string;
  previewColor: string;
  badgeText?: string;

  layout: {
    headerStyle: 'classic' | 'modern' | 'dark-banner' | 'clean' | 'split' | 'minimal' | 'executive';
    tableStyle: 'striped' | 'bordered' | 'clean' | 'compact' | 'accent-header';
    totalsStyle: 'box' | 'subtle' | 'bold-banner' | 'right-aligned';
    footerStyle: 'simple' | 'boxed' | 'executive';
    signaturePlacement: 'bottom-right' | 'bottom-split' | 'bottom-center';
  };

  defaultTheme: ThemeConfig;
}

export interface DocumentSnapshot {
  businessName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  currency: string;
  bankDetails: {
    bankName: string;
    accountNo: string;
    ifscCode: string;
    branch: string;
    upiId: string;
  };
  branding: BrandingConfig;
  theme: ThemeConfig;
  customization?: DocumentCustomization;
  templateId: string;
  terms: string;
  notes: string;
  footerText: string;
}
