import React from 'react';
import { InvoiceData, BusinessData, CustomerData, InvoiceTemplateTheme } from './types';
import { BrandingConfig, DocumentCustomization } from '../../types/template';
import { getInvoiceTemplateById } from './registry';
import { defaultInvoiceThemes } from './themes';

export interface InvoiceTemplateEngineRendererProps {
  templateId?: string;
  invoice: InvoiceData;
  business: BusinessData;
  customer?: CustomerData;
  branding?: BrandingConfig;
  theme?: InvoiceTemplateTheme;
  customization?: DocumentCustomization;
  isPrintMode?: boolean;
}

export const InvoiceTemplateEngineRenderer: React.FC<InvoiceTemplateEngineRendererProps> = ({
  templateId,
  invoice,
  business,
  customer,
  branding = {
    logoAlignment: 'left',
    logoScale: 1,
    signatureScale: 1,
    stampScale: 1,
  },
  theme,
  customization,
  isPrintMode = false,
}) => {
  const templateDef = getInvoiceTemplateById(templateId);
  const LayoutComponent = templateDef.component;
  const activeTheme = theme || templateDef.defaultTheme || defaultInvoiceThemes['corporate-navy'];

  return (
    <LayoutComponent
      invoice={invoice}
      business={business}
      customer={customer}
      branding={branding}
      theme={activeTheme}
      customization={customization}
      isPrintMode={isPrintMode}
    />
  );
};
