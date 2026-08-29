import React from 'react';
import { InvoiceTemplateDefinition, InvoiceTemplateCategory } from './types';
import { defaultInvoiceThemes } from './themes';

// Layout Imports (01-30)
import { ClassicCorporate } from './layouts/ClassicCorporate';
import { ExecutivePro } from './layouts/ExecutivePro';
import { Enterprise } from './layouts/Enterprise';
import { BusinessStandard } from './layouts/BusinessStandard';
import { ProfessionalGrid } from './layouts/ProfessionalGrid';

import { ModernSplit } from './layouts/ModernSplit';
import { ModernCards } from './layouts/ModernCards';
import { ModernMinimal } from './layouts/ModernMinimal';
import { ModernGrid } from './layouts/ModernGrid';
import { ModernBold } from './layouts/ModernBold';

import { PremiumMinimal } from './layouts/PremiumMinimal';
import { ExecutiveDark } from './layouts/ExecutiveDark';
import { ElegantBorder } from './layouts/ElegantBorder';
import { LuxuryBusiness } from './layouts/LuxuryBusiness';
import { SignatureLayout } from './layouts/SignatureLayout';

import { CreativeAgency } from './layouts/CreativeAgency';
import { StudioLayout } from './layouts/StudioLayout';
import { FreelancerLayout } from './layouts/FreelancerLayout';
import { PortfolioLayout } from './layouts/PortfolioLayout';
import { DigitalBusiness } from './layouts/DigitalBusiness';

import { RetailPro } from './layouts/RetailPro';
import { WholesaleLayout } from './layouts/WholesaleLayout';
import { CompactBusiness } from './layouts/CompactBusiness';
import { ProductShowcase } from './layouts/ProductShowcase';

import { ConsultantLayout } from './layouts/ConsultantLayout';
import { ContractorLayout } from './layouts/ContractorLayout';
import { ConstructionLayout } from './layouts/ConstructionLayout';
import { ITSoftwareLayout } from './layouts/ITSoftwareLayout';
import { RestaurantCatering } from './layouts/RestaurantCatering';
import { IndianBusinessClassic } from './layouts/IndianBusinessClassic';

export const INVOICE_TEMPLATES: InvoiceTemplateDefinition[] = [
  // CATEGORY: CORPORATE (01-05)
  {
    id: 'inv-classic-corporate',
    name: 'Classic Corporate',
    category: 'corporate',
    description: 'Traditional formal corporate invoice layout with blue accents and detailed header.',
    component: ClassicCorporate,
    defaultTheme: defaultInvoiceThemes['corporate-navy'],
  },
  {
    id: 'inv-executive-pro',
    name: 'Executive Pro',
    category: 'corporate',
    description: 'Executive dark header block with amber badge and clean structured data.',
    component: ExecutivePro,
    defaultTheme: defaultInvoiceThemes['slate-dark'],
  },
  {
    id: 'inv-enterprise',
    name: 'Enterprise Commercial',
    category: 'corporate',
    description: 'Full-width commercial invoice with PO numbers, line item specs, and direct remittance details.',
    component: Enterprise,
    defaultTheme: defaultInvoiceThemes['corporate-navy'],
  },
  {
    id: 'inv-business-standard',
    name: 'Business Standard',
    category: 'corporate',
    description: 'Standard business format ideal for everyday corporate transactions and B2B billing.',
    component: BusinessStandard,
    defaultTheme: defaultInvoiceThemes['modern-blue'],
  },
  {
    id: 'inv-professional-grid',
    name: 'Professional Grid',
    category: 'corporate',
    description: 'Structured 3-column top grid with clear division of business, client, and invoice metadata.',
    component: ProfessionalGrid,
    defaultTheme: defaultInvoiceThemes['modern-blue'],
  },

  // CATEGORY: MODERN (06-10)
  {
    id: 'inv-modern-split',
    name: 'Modern Split',
    category: 'modern',
    description: 'Contemporary 50/50 header split with soft rounded card container and bold accenting.',
    component: ModernSplit,
    defaultTheme: defaultInvoiceThemes['modern-blue'],
  },
  {
    id: 'inv-modern-cards',
    name: 'Modern Cards',
    category: 'modern',
    description: 'Modular card-based section layout presenting metadata in rounded containers.',
    component: ModernCards,
    defaultTheme: defaultInvoiceThemes['violet-premium'],
  },
  {
    id: 'inv-modern-minimal',
    name: 'Modern Minimal',
    category: 'modern',
    description: 'Ultra-clean minimalist typography layout focused on content legibility and high contrast.',
    component: ModernMinimal,
    defaultTheme: defaultInvoiceThemes['minimal-dark'],
  },
  {
    id: 'inv-modern-grid',
    name: 'Modern Grid',
    category: 'modern',
    description: 'Asymmetric grid layout utilizing rich violet accents and modern badge highlights.',
    component: ModernGrid,
    defaultTheme: defaultInvoiceThemes['violet-premium'],
  },
  {
    id: 'inv-modern-bold',
    name: 'Modern Bold',
    category: 'modern',
    description: 'High-contrast bold header bar with strong borders and prominent financial totals.',
    component: ModernBold,
    defaultTheme: defaultInvoiceThemes['corporate-navy'],
  },

  // CATEGORY: PREMIUM (11-15)
  {
    id: 'inv-premium-minimal',
    name: 'Premium Minimal',
    category: 'premium',
    description: 'Luxury understated invoice layout featuring gold hairline accents and refined typography.',
    component: PremiumMinimal,
    defaultTheme: defaultInvoiceThemes['gold-luxury'],
  },
  {
    id: 'inv-executive-dark',
    name: 'Executive Dark',
    category: 'premium',
    description: 'Dark-themed executive invoice with gold/amber highlights for luxury B2B services.',
    component: ExecutiveDark,
    defaultTheme: defaultInvoiceThemes['slate-dark'],
  },
  {
    id: 'inv-elegant-border',
    name: 'Elegant Border',
    category: 'premium',
    description: 'Classic double-border framed document suited for legal, advisory, and premium consulting.',
    component: ElegantBorder,
    defaultTheme: defaultInvoiceThemes['monochrome'],
  },
  {
    id: 'inv-luxury-business',
    name: 'Luxury Business',
    category: 'premium',
    description: 'Sleek left-border accent layout with contrast dark client highlight card.',
    component: LuxuryBusiness,
    defaultTheme: defaultInvoiceThemes['gold-luxury'],
  },
  {
    id: 'inv-signature-layout',
    name: 'Signature Verified',
    category: 'premium',
    description: 'Features a dedicated audit & verification stamp bar for high-value contracts.',
    component: SignatureLayout,
    defaultTheme: defaultInvoiceThemes['corporate-navy'],
  },

  // CATEGORY: CREATIVE / AGENCY (16-20)
  {
    id: 'inv-creative-agency',
    name: 'Creative Agency',
    category: 'creative',
    description: 'Vibrant gradient banner design crafted for design agencies and media studios.',
    component: CreativeAgency,
    defaultTheme: defaultInvoiceThemes['rose-creative'],
  },
  {
    id: 'inv-studio-layout',
    name: 'Studio Serif',
    category: 'creative',
    description: 'Editorial serif typography layout tailored for photography, design, and production studios.',
    component: StudioLayout,
    defaultTheme: defaultInvoiceThemes['monochrome'],
  },
  {
    id: 'inv-freelancer-layout',
    name: 'Freelancer Pro',
    category: 'creative',
    description: 'Clean teal-accented invoice optimized for independent consultants, developers, and designers.',
    component: FreelancerLayout,
    defaultTheme: defaultInvoiceThemes['emerald-pro'],
  },
  {
    id: 'inv-portfolio-layout',
    name: 'Portfolio Showcase',
    category: 'creative',
    description: 'High-impact dark top banner layout designed for project-based deliverables.',
    component: PortfolioLayout,
    defaultTheme: defaultInvoiceThemes['rose-creative'],
  },
  {
    id: 'inv-digital-business',
    name: 'Digital Monospace',
    category: 'creative',
    description: 'Tech-inspired monospace layout tailored for software engineering, APIs, and IT services.',
    component: DigitalBusiness,
    defaultTheme: defaultInvoiceThemes['minimal-dark'],
  },

  // CATEGORY: RETAIL / PRODUCT (21-24)
  {
    id: 'inv-retail-pro',
    name: 'Retail Pro',
    category: 'retail',
    description: 'Retail invoice with dedicated SKU/code columns and warm amber accents.',
    component: RetailPro,
    defaultTheme: defaultInvoiceThemes['amber-retail'],
  },
  {
    id: 'inv-wholesale-layout',
    name: 'Wholesale High-Density',
    category: 'retail',
    description: 'Compact high-density item list optimized for wholesale, bulk orders, and trade supply.',
    component: WholesaleLayout,
    defaultTheme: defaultInvoiceThemes['monochrome'],
  },
  {
    id: 'inv-compact-business',
    name: 'Compact Business',
    category: 'retail',
    description: 'Space-saving compact layout ideal for single-page quick printouts.',
    component: CompactBusiness,
    defaultTheme: defaultInvoiceThemes['modern-blue'],
  },
  {
    id: 'inv-product-showcase',
    name: 'Product Showcase',
    category: 'retail',
    description: 'Presents line items as individual product cards with SKU and unit pricing.',
    component: ProductShowcase,
    defaultTheme: defaultInvoiceThemes['emerald-pro'],
  },

  // CATEGORY: SERVICE / INDUSTRY (25-30)
  {
    id: 'inv-consultant-layout',
    name: 'Consultant Advisory',
    category: 'service',
    description: 'Professional layout for hourly billing, advisory milestones, and retainer fees.',
    component: ConsultantLayout,
    defaultTheme: defaultInvoiceThemes['corporate-navy'],
  },
  {
    id: 'inv-contractor-layout',
    name: 'Contractor Trade',
    category: 'service',
    description: 'Dual-signature contractor layout featuring work package breakdown and terms.',
    component: ContractorLayout,
    defaultTheme: defaultInvoiceThemes['monochrome'],
  },
  {
    id: 'inv-construction-layout',
    name: 'Construction Heavy',
    category: 'service',
    description: 'Robust high-visibility amber/black billing template for civil and construction projects.',
    component: ConstructionLayout,
    defaultTheme: defaultInvoiceThemes['amber-retail'],
  },
  {
    id: 'inv-it-software-layout',
    name: 'IT Software & SaaS',
    category: 'service',
    description: 'Dedicated layout for software subscriptions, cloud licenses, and SLA agreements.',
    component: ITSoftwareLayout,
    defaultTheme: defaultInvoiceThemes['violet-premium'],
  },
  {
    id: 'inv-restaurant-catering',
    name: 'Restaurant & Catering',
    category: 'service',
    description: 'Hospitality invoice tailored for catering orders, banquet bookings, and event dining.',
    component: RestaurantCatering,
    defaultTheme: defaultInvoiceThemes['rose-creative'],
  },
  {
    id: 'inv-indian-business-classic',
    name: 'Indian Business Classic (GST)',
    category: 'service',
    description: 'Traditional Indian GST Tax Invoice with HSN/SAC, CGST/SGST/IGST breakdown, and auspicious header.',
    component: IndianBusinessClassic,
    defaultTheme: defaultInvoiceThemes['corporate-navy'],
  },
];

// Helper to look up template by ID (with fallback to classic corporate)
export const getInvoiceTemplateById = (id?: string): InvoiceTemplateDefinition => {
  if (!id) return INVOICE_TEMPLATES[0];

  // Map legacy template IDs for backwards compatibility
  const legacyMap: Record<string, string> = {
    'inv-classic': 'inv-classic-corporate',
    'inv-modern': 'inv-modern-split',
    'inv-minimal': 'inv-modern-minimal',
    'inv-corporate': 'inv-executive-pro',
    'inv-creative': 'inv-creative-agency',
    'classic': 'inv-classic-corporate',
    'modern': 'inv-modern-split',
    'minimal': 'inv-modern-minimal',
    'corporate': 'inv-executive-pro',
    'creative': 'inv-creative-agency',
  };

  const resolvedId = legacyMap[id] || id;
  const found = INVOICE_TEMPLATES.find((t) => t.id === resolvedId);
  return found || INVOICE_TEMPLATES[0];
};

// Filter templates by category
export const getInvoiceTemplatesByCategory = (category: InvoiceTemplateCategory | 'all'): InvoiceTemplateDefinition[] => {
  if (category === 'all') return INVOICE_TEMPLATES;
  return INVOICE_TEMPLATES.filter((t) => t.category === category);
};
