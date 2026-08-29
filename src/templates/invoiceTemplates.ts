import { DocumentTemplate, TemplateCategory } from '../types/template';
import { INVOICE_TEMPLATES as ENGINE_INVOICE_TEMPLATES } from './invoices/registry';

const categoryCapitalizeMap: Record<string, TemplateCategory> = {
  corporate: 'Corporate',
  modern: 'Modern',
  premium: 'Premium',
  creative: 'Creative',
  retail: 'Retail',
  service: 'Service',
};

const previewColorMap: Record<string, string> = {
  'inv-classic-corporate': '#1e293b',
  'inv-executive-pro': '#0f172a',
  'inv-enterprise': '#1e3a8a',
  'inv-business-standard': '#334155',
  'inv-professional-grid': '#0284c7',

  'inv-modern-split': '#2563eb',
  'inv-modern-cards': '#4f46e5',
  'inv-modern-minimal': '#475569',
  'inv-modern-grid': '#7c3aed',
  'inv-modern-bold': '#0f172a',

  'inv-premium-minimal': '#b45309',
  'inv-executive-dark': '#09090b',
  'inv-elegant-border': '#18181b',
  'inv-luxury-business': '#d97706',
  'inv-signature-layout': '#1e293b',

  'inv-creative-agency': '#7e22ce',
  'inv-studio-layout': '#27272a',
  'inv-freelancer-layout': '#0d9488',
  'inv-portfolio-layout': '#be123c',
  'inv-digital-business': '#0f172a',

  'inv-retail-pro': '#d97706',
  'inv-wholesale-layout': '#334155',
  'inv-compact-business': '#2563eb',
  'inv-product-showcase': '#059669',

  'inv-consultant-layout': '#1e293b',
  'inv-contractor-layout': '#334155',
  'inv-construction-layout': '#f59e0b',
  'inv-it-software-layout': '#4338ca',
  'inv-restaurant-catering': '#e11d48',
  'inv-indian-business-classic': '#0f172a',
};

const badgeMap: Record<string, string> = {
  'inv-classic-corporate': 'Popular',
  'inv-executive-pro': 'Executive',
  'inv-enterprise': 'B2B Trade',
  'inv-modern-split': 'Trending',
  'inv-premium-minimal': 'Luxury',
  'inv-creative-agency': 'Agency',
  'inv-retail-pro': 'Retail',
  'inv-indian-business-classic': 'GST Classic',
};

export const INVOICE_TEMPLATES: DocumentTemplate[] = ENGINE_INVOICE_TEMPLATES.map((def) => {
  const catName = categoryCapitalizeMap[def.category] || 'Corporate';
  return {
    id: def.id,
    name: def.name,
    type: 'invoice',
    category: catName,
    description: def.description,
    style: `${catName} • Professional Layout`,
    previewColor: previewColorMap[def.id] || def.defaultTheme.primaryColor || '#2563eb',
    badgeText: badgeMap[def.id],
    layout: {
      headerStyle: 'modern',
      tableStyle: 'striped',
      totalsStyle: 'box',
      footerStyle: 'boxed',
      signaturePlacement: 'bottom-right',
    },
    defaultTheme: {
      primaryColor: def.defaultTheme.primaryColor,
      secondaryColor: def.defaultTheme.secondaryColor,
      textColor: def.defaultTheme.textColor,
      fontFamily: (def.defaultTheme.fontFamily as any) || 'Inter',
    },
  };
});
