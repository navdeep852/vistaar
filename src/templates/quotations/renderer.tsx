import React from 'react';
import { QuotationTemplateProps, TemplateTheme } from './types';
import { getQuotationTemplateById } from './registry';
import { QUOTATION_THEMES, DEFAULT_THEME } from './themes';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class QuotationRendererErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Quotation Template Render Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs text-center space-y-2">
          <p className="font-bold text-sm">Template Rendering Exception</p>
          <p className="text-rose-600">{this.state.error?.message || 'An unexpected rendering error occurred.'}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface QuotationTemplateEngineRendererProps extends QuotationTemplateProps {
  templateId?: string;
}

export const QuotationTemplateEngineRenderer: React.FC<QuotationTemplateEngineRendererProps> = ({
  templateId = 'modern-split',
  quotation,
  business,
  customer,
  branding,
  theme,
  customization,
  mode = 'preview',
  isPrintMode = false,
}) => {
  const metadata = getQuotationTemplateById(templateId);
  const TemplateComponent = metadata.component;

  const resolvedTheme: TemplateTheme =
    (theme && theme.primaryColor ? (theme as any) : null) ||
    (customization?.primaryColor
      ? { ...DEFAULT_THEME, primaryColor: customization.primaryColor }
      : DEFAULT_THEME);

  return (
    <QuotationRendererErrorBoundary>
      <TemplateComponent
        quotation={quotation}
        business={business}
        customer={customer}
        branding={branding}
        theme={resolvedTheme}
        customization={customization}
        mode={mode}
        isPrintMode={isPrintMode}
      />
    </QuotationRendererErrorBoundary>
  );
};
