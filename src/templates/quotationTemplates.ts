import { DocumentTemplate } from '../types/template';
import { QUOTATION_TEMPLATES_REGISTRY } from './quotations/registry';

export const QUOTATION_TEMPLATES: DocumentTemplate[] = QUOTATION_TEMPLATES_REGISTRY.map((t) => ({
  id: t.id,
  name: t.name,
  type: 'quotation',
  category: t.category,
  description: t.description,
  style: `${t.category} Layout`,
  previewColor: t.previewColor,
  badgeText: t.badgeText,
  layout: {
    headerStyle: 'modern',
    tableStyle: 'bordered',
    totalsStyle: 'box',
    footerStyle: 'simple',
    signaturePlacement: 'bottom-right',
  },
  defaultTheme: {
    primaryColor: t.previewColor,
    secondaryColor: t.previewColor,
    textColor: '#0f172a',
    fontFamily: 'Inter',
  },
}));
