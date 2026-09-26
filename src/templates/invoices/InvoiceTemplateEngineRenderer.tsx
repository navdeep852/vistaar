import React from 'react';
import { InvoiceData, BusinessData, CustomerData, InvoiceTemplateTheme } from './types';
import { BrandingConfig, DocumentCustomization } from '../../types/template';
import { getInvoiceTemplateById } from './registry';
import { defaultInvoiceThemes } from './themes';
import { PaymentQrProvider, EnginePaymentQrSlot } from '../../components/DocumentPaymentQr';

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

  const showQrCode = Boolean(customization?.showQrCode ?? customization?.showUpiQr ?? false);
  const showUpiId = Boolean(customization?.showUpi ?? true);
  const upiQrCodeUrl = business.bankDetails?.upiQrCodeUrl || business.upiQrCodeUrl;
  const upiId = business.bankDetails?.upiId;

  return (
    <PaymentQrProvider>
      <div className="invoice-engine-container relative">
        <LayoutComponent
          invoice={invoice}
          business={business}
          customer={customer}
          branding={branding}
          theme={activeTheme}
          customization={customization}
          isPrintMode={isPrintMode}
        />
        <EnginePaymentQrSlot
          upiQrCodeUrl={upiQrCodeUrl}
          upiId={upiId}
          showQrCode={showQrCode}
          showUpiId={showUpiId}
          className="px-6"
        />
      </div>
    </PaymentQrProvider>
  );
};
