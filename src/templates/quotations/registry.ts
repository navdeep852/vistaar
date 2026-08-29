import React from 'react';
import { QuotationTemplateMetadata } from './types';

import { CorporateClassic } from './layouts/CorporateClassic';
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

export const QUOTATION_TEMPLATES_REGISTRY: QuotationTemplateMetadata[] = [
  // CORPORATE
  {
    id: 'corporate-classic',
    name: 'Corporate Classic',
    category: 'Corporate',
    description: 'Traditional corporate document design with top left branding and right metadata.',
    previewColor: '#2563eb',
    component: CorporateClassic,
  },
  {
    id: 'executive-pro',
    name: 'Executive Pro',
    category: 'Corporate',
    description: 'Executive dark banner header with bold contrast callout cards and dual signatures.',
    previewColor: '#0f172a',
    badgeText: 'Popular',
    component: ExecutivePro,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    category: 'Corporate',
    description: 'High data-density enterprise layout for B2B procurement bids.',
    previewColor: '#1e293b',
    component: Enterprise,
  },
  {
    id: 'business-standard',
    name: 'Business Standard',
    category: 'Corporate',
    description: 'Standardized conservative corporate format with high readability.',
    previewColor: '#334155',
    component: BusinessStandard,
  },
  {
    id: 'professional-grid',
    name: 'Professional Grid',
    category: 'Corporate',
    description: '3-column structured metadata grid header with clean table divides.',
    previewColor: '#0284c7',
    component: ProfessionalGrid,
  },

  // MODERN
  {
    id: 'modern-split',
    name: 'Modern Split',
    category: 'Modern',
    description: 'Asymmetric 50/50 split header with rounded cards and highlight totals.',
    previewColor: '#2563eb',
    badgeText: 'Default',
    component: ModernSplit,
  },
  {
    id: 'modern-cards',
    name: 'Modern Cards',
    category: 'Modern',
    description: 'Card-based UI structure for company, client, and item sections.',
    previewColor: '#3b82f6',
    component: ModernCards,
  },
  {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    category: 'Modern',
    description: 'Spacious layout with generous whitespace and delicate line table.',
    previewColor: '#64748b',
    component: ModernMinimal,
  },
  {
    id: 'modern-grid',
    name: 'Modern Grid',
    category: 'Modern',
    description: 'Dark quote banner badge with floating highlight total container.',
    previewColor: '#0f172a',
    component: ModernGrid,
  },
  {
    id: 'modern-bold',
    name: 'Modern Bold',
    category: 'Modern',
    description: 'High contrast bold typography and thick accent borders.',
    previewColor: '#d97706',
    component: ModernBold,
  },

  // PREMIUM
  {
    id: 'premium-minimal',
    name: 'Premium Minimal',
    category: 'Premium',
    description: 'Luxury minimal layout with gold hairline accents and elegant spacing.',
    previewColor: '#b45309',
    badgeText: 'Premium',
    component: PremiumMinimal,
  },
  {
    id: 'executive-dark',
    name: 'Executive Dark',
    category: 'Premium',
    description: 'Deep navy/amber dark top header banner with high-contrast body.',
    previewColor: '#090d16',
    component: ExecutiveDark,
  },
  {
    id: 'elegant-border',
    name: 'Elegant Border',
    category: 'Premium',
    description: 'Formal certificate style layout with double outer framing border.',
    previewColor: '#78350f',
    component: ElegantBorder,
  },
  {
    id: 'luxury-business',
    name: 'Luxury Business',
    category: 'Premium',
    description: 'Luxury slate & gold palette with left accent bar and executive card.',
    previewColor: '#1e1b4b',
    component: LuxuryBusiness,
  },
  {
    id: 'signature',
    name: 'Signature',
    category: 'Premium',
    description: 'Prominent verification box with top branding badge and dual signatures.',
    previewColor: '#0f172a',
    component: SignatureLayout,
  },

  // CREATIVE
  {
    id: 'creative-agency',
    name: 'Creative Agency',
    category: 'Creative',
    description: 'Gradient top banner header with purple accents and rounded pill badges.',
    previewColor: '#7c3aed',
    component: CreativeAgency,
  },
  {
    id: 'studio',
    name: 'Studio',
    category: 'Creative',
    description: 'Editorial design layout with serif headline typography.',
    previewColor: '#18181b',
    component: StudioLayout,
  },
  {
    id: 'freelancer',
    name: 'Freelancer',
    category: 'Creative',
    description: 'Friendly personal branding quote template for independent pros.',
    previewColor: '#059669',
    component: FreelancerLayout,
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    category: 'Creative',
    description: 'Agency deliverable proposal with project scope header.',
    previewColor: '#4f46e5',
    component: PortfolioLayout,
  },
  {
    id: 'digital-business',
    name: 'Digital Business',
    category: 'Creative',
    description: 'Tech & developer aesthetic with monospace typography.',
    previewColor: '#16a34a',
    component: DigitalBusiness,
  },

  // RETAIL / PRODUCT
  {
    id: 'retail-pro',
    name: 'Retail Pro',
    category: 'Retail',
    description: 'Product-focused table featuring SKU, Part Number, and Tax columns.',
    previewColor: '#059669',
    component: RetailPro,
  },
  {
    id: 'wholesale',
    name: 'Wholesale',
    category: 'Retail',
    description: 'High-density multi-item layout optimized for 20+ bulk items.',
    previewColor: '#1e293b',
    component: WholesaleLayout,
  },
  {
    id: 'compact-business',
    name: 'Compact Business',
    category: 'Retail',
    description: 'Maximum data density with minimal padding for multi-page printing.',
    previewColor: '#475569',
    component: CompactBusiness,
  },
  {
    id: 'product-showcase',
    name: 'Product Showcase',
    category: 'Retail',
    description: 'Line item catalog cards with room for specs and SKU codes.',
    previewColor: '#4338ca',
    component: ProductShowcase,
  },

  // SERVICE / INDUSTRY
  {
    id: 'consultant',
    name: 'Consultant',
    category: 'Service',
    description: 'Milestone & scope advisory proposal with retainer terms.',
    previewColor: '#0f766e',
    component: ConsultantLayout,
  },
  {
    id: 'contractor',
    name: 'Contractor',
    category: 'Industry',
    description: 'Site & project scope header with dual client/contractor sign-off.',
    previewColor: '#d97706',
    component: ContractorLayout,
  },
  {
    id: 'construction',
    name: 'Construction',
    category: 'Industry',
    description: 'Civil BOQ estimate template with stage breakdown terms.',
    previewColor: '#0f172a',
    component: ConstructionLayout,
  },
  {
    id: 'it-software',
    name: 'IT / Software',
    category: 'Service',
    description: 'Software module proposal with cloud retainership SLA notes.',
    previewColor: '#2563eb',
    component: ITSoftwareLayout,
  },
  {
    id: 'restaurant-catering',
    name: 'Restaurant & Catering',
    category: 'Service',
    description: 'Event quote format with menu items, guest count, and deposit terms.',
    previewColor: '#e11d48',
    component: RestaurantCatering,
  },
  {
    id: 'indian-business-classic',
    name: 'Indian Business Classic',
    category: 'Industry',
    description: 'Indian statutory B2B layout with explicit GSTIN, PAN, HSN/SAC, and Bank details.',
    previewColor: '#1e293b',
    badgeText: 'GST B2B',
    component: IndianBusinessClassic,
  },
];

// Legacy ID mapping for backward compatibility with database historical records
export const LEGACY_TEMPLATE_MAP: Record<string, string> = {
  'qt-classic': 'corporate-classic',
  'qt-minimal': 'modern-minimal',
  'qt-modern-blue': 'modern-split',
  'qt-modern-emerald': 'modern-cards',
  'qt-modern-purple': 'creative-agency',
  'qt-corporate-navy': 'executive-pro',
  'qt-corporate-charcoal': 'enterprise',
  'qt-creative-amber': 'studio',
  'qt-compact': 'compact-business',
  'qt-premium': 'executive-pro',
};

export function getQuotationTemplateById(templateId: string): QuotationTemplateMetadata {
  const resolvedId = LEGACY_TEMPLATE_MAP[templateId] || templateId;
  const found = QUOTATION_TEMPLATES_REGISTRY.find((t) => t.id === resolvedId);
  return found || QUOTATION_TEMPLATES_REGISTRY[0];
}
