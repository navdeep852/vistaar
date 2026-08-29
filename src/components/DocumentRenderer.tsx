import React from 'react';
import { DocumentTemplate, BrandingConfig, ThemeConfig, DocumentCustomization } from '../types/template';
import { QuotationItem, InvoiceItem } from '../types';
import { INVOICE_TEMPLATES } from '../templates/invoiceTemplates';
import { QUOTATION_TEMPLATES } from '../templates/quotationTemplates';
import { QuotationTemplateEngineRenderer } from '../templates/quotations/renderer';
import { InvoiceTemplateEngineRenderer } from '../templates/invoices/InvoiceTemplateEngineRenderer';

export interface DocumentRendererProps {
  templateId: string;
  documentType: 'invoice' | 'quotation';
  documentNumber: string;
  date: string;
  dueDateOrValidUntil: string;
  
  // Business details
  businessName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  pan?: string;
  bankDetails?: {
    bankName?: string;
    accountNo?: string;
    ifscCode?: string;
    branch?: string;
    upiId?: string;
  };

  // Customer details
  customerName?: string;
  customerPhone?: string;
  customerWhatsapp?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerGstin?: string;

  // Items & Pricing
  items?: (QuotationItem | InvoiceItem)[];
  subtotal?: number;
  discountTotal?: number;
  taxTotal?: number;
  grandTotal?: number;
  paidAmount?: number;
  balanceAmount?: number;
  currency?: string;

  // Notes, Terms, Footer
  notes?: string;
  terms?: string;
  footerText?: string;

  // Custom Branding, Theme & Customization Panel
  branding?: BrandingConfig;
  theme?: ThemeConfig;
  customization?: DocumentCustomization;

  // Print Mode Override
  isPrintMode?: boolean;
}
export const DocumentRenderer: React.FC<DocumentRendererProps> = ({
  templateId,
  documentType,
  documentNumber,
  date,
  dueDateOrValidUntil,
  businessName = 'Business Name',
  phone = '',
  email = '',
  address = '',
  city = '',
  state = '',
  pincode = '',
  gstin = '',
  pan = '',
  bankDetails,
  customerName = 'Customer Name',
  customerPhone = '',
  customerEmail = '',
  customerAddress = '',
  customerGstin = '',
  items = [],
  subtotal = 0,
  discountTotal = 0,
  taxTotal = 0,
  grandTotal = 0,
  paidAmount = 0,
  balanceAmount = 0,
  currency = '₹',
  notes,
  terms,
  footerText = 'Thank you for doing business with us!',
  branding,
  theme,
  customization,
  isPrintMode = false,
}) => {
  // Delegate quotation documents to the modular 30-layout Quotation Template Engine
  if (documentType === 'quotation') {
    return (
      <QuotationTemplateEngineRenderer
        templateId={templateId}
        quotation={{
          id: documentNumber,
          quotationNumber: documentNumber,
          date: date,
          validUntil: dueDateOrValidUntil,
          items: (items || []) as QuotationItem[],
          subtotal: Number(subtotal || 0),
          discountTotal: Number(discountTotal || 0),
          taxTotal: Number(taxTotal || 0),
          grandTotal: Number(grandTotal || 0),
          currency: currency,
          notes: notes,
          terms: terms,
        }}
        business={{
          businessName: businessName || 'Business Name',
          phone: phone,
          email: email,
          address: address,
          city: city,
          state: state,
          pincode: pincode,
          gstin: gstin,
          pan: pan,
          bankDetails: bankDetails,
        }}
        customer={{
          name: customerName || 'Customer Name',
          phone: customerPhone,
          email: customerEmail,
          address: customerAddress,
          gstin: customerGstin,
        }}
        branding={{
          logoUrl: branding?.logoUrl,
          signatureUrl: branding?.signatureUrl,
          stampUrl: branding?.stampUrl,
          logoAlignment: branding?.logoAlignment || 'left',
          logoScale: branding?.logoScale || 1,
          signatureScale: branding?.signatureScale || 1,
          stampScale: branding?.stampScale || 1,
        }}
        theme={theme as any}
        customization={customization}
        isPrintMode={isPrintMode}
      />
    );
  }

  // Delegate invoice documents to the modular 30-layout Invoice Template Engine
  if (documentType === 'invoice') {
    const sGrand = Number(grandTotal || 0);
    const sPaid = Number(paidAmount || 0);
    const sBalance = Number(balanceAmount || (sGrand - sPaid));
    const calculatedStatus = (sPaid >= sGrand && sGrand > 0) ? 'PAID' : sPaid > 0 ? 'PARTIAL' : 'UNPAID';

    return (
      <InvoiceTemplateEngineRenderer
        templateId={templateId}
        invoice={{
          id: documentNumber,
          invoiceNumber: documentNumber,
          date: date,
          dueDate: dueDateOrValidUntil,
          items: (items || []) as InvoiceItem[],
          subtotal: Number(subtotal || 0),
          discountTotal: Number(discountTotal || 0),
          taxTotal: Number(taxTotal || 0),
          grandTotal: sGrand,
          paidAmount: sPaid,
          balanceAmount: sBalance,
          paymentStatus: calculatedStatus,
          currency: currency,
          notes: notes,
          terms: terms,
        }}
        business={{
          businessName: businessName || 'Business Name',
          phone: phone,
          email: email,
          address: address,
          city: city,
          state: state,
          pincode: pincode,
          gstin: gstin,
          pan: pan,
          bankDetails: bankDetails,
        }}
        customer={{
          name: customerName || 'Customer Name',
          phone: customerPhone,
          email: customerEmail,
          address: customerAddress,
          gstin: customerGstin,
        }}
        branding={{
          logoUrl: branding?.logoUrl,
          signatureUrl: branding?.signatureUrl,
          stampUrl: branding?.stampUrl,
          logoAlignment: branding?.logoAlignment || 'left',
          logoScale: branding?.logoScale || 1,
          signatureScale: branding?.signatureScale || 1,
          stampScale: branding?.stampScale || 1,
        }}
        theme={theme as any}
        customization={customization}
        isPrintMode={isPrintMode}
      />
    );
  }

  // Safe template definition lookup
  const allTemplates = [...INVOICE_TEMPLATES, ...QUOTATION_TEMPLATES];
  const template =
    allTemplates.find((t) => t && t.id === templateId) ||
    (documentType === 'invoice' ? INVOICE_TEMPLATES[0] : QUOTATION_TEMPLATES[0]) ||
    INVOICE_TEMPLATES[0];

  const layout = template?.layout || {
    headerStyle: 'modern',
    tableStyle: 'striped',
    totalsStyle: 'box',
    footerStyle: 'boxed',
    signaturePlacement: 'bottom-right',
  };

  const activeTheme: ThemeConfig = theme || template?.defaultTheme || {
    primaryColor: '#2563eb',
    secondaryColor: '#3b82f6',
    textColor: '#0f172a',
    fontFamily: 'Inter',
  };

  const activeBranding: BrandingConfig = branding || {
    logoAlignment: 'left',
    logoScale: 1,
    signatureScale: 1,
    stampScale: 1,
  };

  // Orientation: 'portrait' vs 'landscape'
  const orientation = customization?.orientation || 'portrait';
  const isLandscape = orientation === 'landscape';

  // Customization Defaults
  const primaryColor = customization?.primaryColor || activeTheme.primaryColor || '#2563eb';
  const textColor = customization?.textColor || activeTheme.textColor || '#0f172a';
  const bodyFont = customization?.bodyFont || customization?.fontFamily || activeTheme.fontFamily || 'Inter';
  const headingFont = customization?.headingFont || bodyFont;

  const fontScaleMultiplier =
    customization?.fontScale === 'compact'
      ? 0.9
      : customization?.fontScale === 'large'
      ? 1.1
      : 1.0;

  // Section Visibility Toggles (Defaults to true)
  const showGstin = customization?.showGstin ?? true;
  const showPan = customization?.showPan ?? true;
  const showBankDetails = customization?.showBankDetails ?? true;
  const showUpi = customization?.showUpi ?? true;
  const showSignature = customization?.showSignature ?? true;
  const showStamp = customization?.showStamp ?? true;
  const showTerms = customization?.showTerms ?? true;
  const showNotes = customization?.showNotes ?? true;
  const showDueDate = customization?.showDueDate ?? true;

  // Logo alignment style
  const logoJustifyClass = {
    left: 'justify-start text-left',
    center: 'justify-center text-center',
    right: 'justify-end text-right',
  }[activeBranding?.logoAlignment || 'left'];

  // Defensive Safe Values
  const safeBusinessName = businessName || 'Business Name';
  const businessInitial = (safeBusinessName.charAt(0) || 'B').toUpperCase();
  const safeItems = Array.isArray(items) ? items : [];
  const safeSubtotal = Number(subtotal || 0);
  const safeDiscountTotal = Number(discountTotal || 0);
  const safeTaxTotal = Number(taxTotal || 0);
  const safeGrandTotal = Number(grandTotal || 0);
  const safePaidAmount = Number(paidAmount || 0);
  const safeBalanceAmount = Number(balanceAmount || 0);

  // Dimensions
  const containerStyle: React.CSSProperties = isPrintMode
    ? {
        fontFamily: `'${bodyFont}', sans-serif`,
        color: textColor,
        width: isLandscape ? '297mm' : '210mm',
        minHeight: isLandscape ? '210mm' : '297mm',
        padding: '12mm',
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
        margin: '0 auto',
      }
    : {
        fontFamily: `'${bodyFont}', sans-serif`,
        color: textColor,
        width: '100%',
        maxWidth: isLandscape ? '297mm' : '210mm',
        minHeight: isLandscape ? '210mm' : '297mm',
        padding: '10mm',
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
        margin: '0 auto',
        transform: `scale(${fontScaleMultiplier})`,
        transformOrigin: 'top center',
      };

  return (
    <div
      className={`bg-white relative overflow-hidden transition-all ${
        isPrintMode ? '' : 'border border-slate-200 rounded-2xl shadow-2xl my-auto'
      }`}
      style={containerStyle}
    >
      {/* HEADER SECTION LAYOUT VARIATIONS */}

      {/* Variation 1: Dark Banner Header (Corporate Dark) */}
      {layout.headerStyle === 'dark-banner' && (
        <div
          className="-mx-10 -mt-10 p-8 text-white mb-6 break-inside-avoid"
          style={{ backgroundColor: primaryColor }}
        >
          <div className={`flex items-center ${logoJustifyClass} mb-4`}>
            {activeBranding.logoUrl ? (
              <img
                src={activeBranding.logoUrl}
                alt="Logo"
                className="max-h-16 object-contain"
                style={{ transform: `scale(${activeBranding.logoScale || 1})` }}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-xl text-white">
                {businessInitial}
              </div>
            )}
          </div>

          <div className="flex flex-row justify-between items-end gap-4">
            <div>
              <h1
                className="text-2xl font-black tracking-tight"
                style={{ fontFamily: `'${headingFont}', sans-serif` }}
              >
                {safeBusinessName}
              </h1>
              <p className="text-xs text-white/80 mt-1">{address}{city ? `, ${city}` : ''}{state ? `, ${state}` : ''}{pincode ? ` - ${pincode}` : ''}</p>
              <p className="text-xs text-white/80">
                Phone: {phone || 'N/A'}
                {showGstin && gstin ? ` | GSTIN: ${gstin}` : ''}
                {showPan && pan ? ` | PAN: ${pan}` : ''}
              </p>
            </div>
            <div className="text-right">
              <h2
                className="text-2xl font-black uppercase tracking-wider"
                style={{ fontFamily: `'${headingFont}', sans-serif` }}
              >
                {documentType === 'invoice' ? 'TAX INVOICE' : 'QUOTATION'}
              </h2>
              <p className="text-sm font-bold opacity-90 mt-1">{documentNumber}</p>
              <p className="text-xs opacity-80">
                Date: {date}
                {showDueDate ? ` | ${documentType === 'invoice' ? 'Due' : 'Valid'}: ${dueDateOrValidUntil}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Variation 2: Executive Banner Header (Premium) */}
      {layout.headerStyle === 'executive' && (
        <div className="border-b-4 pb-6 mb-6 border-amber-500 break-inside-avoid">
          <div className="flex flex-row justify-between items-center gap-4">
            <div className={`flex items-center gap-3 ${logoJustifyClass}`}>
              {activeBranding.logoUrl ? (
                <img
                  src={activeBranding.logoUrl}
                  alt="Logo"
                  className="max-h-16 object-contain"
                  style={{ transform: `scale(${activeBranding.logoScale || 1})` }}
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-slate-900 text-amber-400 font-bold text-xl flex items-center justify-center">
                  {businessInitial}
                </div>
              )}
              <div>
                <h1
                  className="text-2xl font-black tracking-tight"
                  style={{ color: primaryColor, fontFamily: `'${headingFont}', sans-serif` }}
                >
                  {safeBusinessName}
                </h1>
                <p className="text-xs text-slate-500">
                  {address}{city ? `, ${city}` : ''}
                  {showGstin && gstin ? ` | GSTIN: ${gstin}` : ''}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-700 text-xs font-bold uppercase rounded-md">
                OFFICIAL DOCUMENT
              </span>
              <h2
                className="text-xl font-extrabold text-slate-900 mt-2 uppercase"
                style={{ fontFamily: `'${headingFont}', sans-serif` }}
              >
                {documentType === 'invoice' ? 'INVOICE' : 'PROPOSAL QUOTATION'}
              </h2>
              <p className="text-xs font-bold text-slate-600">{documentNumber}</p>
              <p className="text-xs text-slate-500">Date: {date}</p>
            </div>
          </div>
        </div>
      )}

      {/* Variation 3: Default Classic / Modern / Minimal Header */}
      {layout.headerStyle !== 'dark-banner' && layout.headerStyle !== 'executive' && (
        <div className="flex flex-row justify-between items-center gap-4 border-b pb-6 mb-6 border-slate-200 break-inside-avoid">
          <div className="space-y-1.5">
            {activeBranding.logoUrl ? (
              <div className={`flex items-center ${logoJustifyClass} mb-2`}>
                <img
                  src={activeBranding.logoUrl}
                  alt="Logo"
                  className="max-h-16 object-contain"
                  style={{ transform: `scale(${activeBranding.logoScale || 1})` }}
                />
              </div>
            ) : null}
            <h1
              className="text-2xl font-extrabold tracking-tight"
              style={{ color: primaryColor, fontFamily: `'${headingFont}', sans-serif` }}
            >
              {safeBusinessName}
            </h1>
            <p className="text-xs text-slate-500">{address}{city ? `, ${city}` : ''}{state ? `, ${state}` : ''}{pincode ? ` - ${pincode}` : ''}</p>
            <p className="text-xs text-slate-500">Phone: {phone || 'N/A'}{email ? ` | Email: ${email}` : ''}</p>
            <div className="flex gap-3 text-xs font-semibold text-slate-600">
              {showGstin && gstin && <span>GSTIN: {gstin}</span>}
              {showPan && pan && <span>PAN: {pan}</span>}
            </div>
          </div>

          <div className="text-right">
            <h2
              className="text-2xl font-black uppercase tracking-wide"
              style={{ color: primaryColor, fontFamily: `'${headingFont}', sans-serif` }}
            >
              {documentType === 'invoice' ? 'TAX INVOICE' : 'QUOTATION'}
            </h2>
            <p className="text-sm font-bold text-slate-800 mt-1">{documentNumber}</p>
            <p className="text-xs text-slate-500 mt-0.5">Date: {date}</p>
            {showDueDate && (
              <p className="text-xs text-slate-500">
                {documentType === 'invoice' ? 'Payment Due' : 'Valid Until'}: {dueDateOrValidUntil}
              </p>
            )}
          </div>
        </div>
      )}

      {/* CUSTOMER INFORMATION CARD */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 mb-6 flex flex-row justify-between gap-4 break-inside-avoid">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {documentType === 'invoice' ? 'BILLED TO:' : 'PREPARED FOR:'}
          </span>
          <h3
            className="text-base font-bold text-slate-900 mt-0.5"
            style={{ fontFamily: `'${headingFont}', sans-serif` }}
          >
            {customerName || 'Customer Name'}
          </h3>
          {customerAddress && <p className="text-xs text-slate-600 mt-0.5">{customerAddress}</p>}
          {customerPhone && <p className="text-xs text-slate-600">Phone: {customerPhone}</p>}
          {customerEmail && <p className="text-xs text-slate-600">Email: {customerEmail}</p>}
          {showGstin && customerGstin && <p className="text-xs font-semibold text-slate-700">GSTIN: {customerGstin}</p>}
        </div>

        {showBankDetails && bankDetails && bankDetails.accountNo && (
          <div className="text-right border-l border-slate-200 pl-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PAYMENT DETAILS</span>
            <p className="text-xs font-semibold text-slate-800 mt-0.5">{bankDetails.bankName || 'Bank'}</p>
            <p className="text-xs text-slate-600">A/C: {bankDetails.accountNo}</p>
            <p className="text-xs text-slate-600">IFSC: {bankDetails.ifscCode}</p>
            {showUpi && bankDetails.upiId && (
              <p className="text-xs text-blue-600 font-semibold">UPI: {bankDetails.upiId}</p>
            )}
          </div>
        )}
      </div>

      {/* LINE ITEMS TABLE */}
      <div className="mb-6 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr
              className={`text-[10px] font-bold uppercase tracking-wider ${
                layout.tableStyle === 'accent-header'
                  ? 'text-white'
                  : 'bg-slate-100 text-slate-700 border-b border-slate-200'
              }`}
              style={
                layout.tableStyle === 'accent-header'
                  ? { backgroundColor: primaryColor }
                  : {}
              }
            >
              <th className="p-3">#</th>
              <th className="p-3">Item / Service Description</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price ({currency})</th>
              <th className="p-3 text-center">Tax %</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-slate-400 italic">
                  No line items added yet.
                </td>
              </tr>
            ) : (
              safeItems.map((item, idx) => (
                <tr
                  key={idx}
                  className={`break-inside-avoid ${
                    idx % 2 === 1 && layout.tableStyle === 'striped' ? 'bg-slate-50/60' : ''
                  }`}
                >
                  <td className="p-3 font-semibold text-slate-400">{idx + 1}</td>
                  <td className="p-3 font-bold text-slate-900">
                    {item.productName || 'Item'}
                    {item.sku && <span className="text-[10px] text-slate-400 font-normal ml-2">SKU: {item.sku}</span>}
                  </td>
                  <td className="p-3 text-center font-medium">{item.quantity || 1} {item.unit || 'Pcs'}</td>
                  <td className="p-3 text-right font-medium">{Number(item.sellingPrice || 0).toLocaleString()}</td>
                  <td className="p-3 text-center font-medium">{item.taxPercent || 0}%</td>
                  <td className="p-3 text-right font-bold text-slate-900">{(Number(item.total) || 0).toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* TOTALS & TERMS SECTION */}
      <div className="flex flex-row justify-between items-start gap-6 border-t pt-6 border-slate-200 break-inside-avoid">
        {/* Left Column: Notes & Terms */}
        <div className="flex-1 space-y-4 text-xs text-slate-600">
          {showNotes && notes && (
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Notes:</span>
              <p className="bg-slate-50 p-3 rounded-lg border border-slate-100">{notes}</p>
            </div>
          )}
          {showTerms && terms && (
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Terms & Conditions:</span>
              <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-line">{terms}</p>
            </div>
          )}
        </div>

        {/* Right Column: Pricing Totals */}
        <div className="w-64 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-semibold">{currency}{safeSubtotal.toLocaleString()}</span>
          </div>

          {safeDiscountTotal > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Total Discount:</span>
              <span className="font-semibold">- {currency}{safeDiscountTotal.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-600">
            <span>Tax Total:</span>
            <span className="font-semibold">{currency}{safeTaxTotal.toFixed(2)}</span>
          </div>

          <div
            className="flex justify-between items-center p-3 rounded-xl text-white font-extrabold text-sm shadow-md mt-2"
            style={{ backgroundColor: primaryColor }}
          >
            <span>Grand Total:</span>
            <span>{currency}{safeGrandTotal.toFixed(2)}</span>
          </div>

          {documentType === 'invoice' && (
            <>
              <div className="flex justify-between text-emerald-600 font-bold pt-1">
                <span>Paid Amount:</span>
                <span>{currency}{safePaidAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-amber-600 font-bold">
                <span>Balance Due:</span>
                <span>{currency}{safeBalanceAmount.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* SIGNATURE & STAMP PLACEMENT */}
      <div className="mt-12 pt-6 border-t border-slate-200 flex flex-row items-end justify-between break-inside-avoid">
        {/* Stamp Image (Rendered only if present) */}
        <div className="w-32 h-20 flex items-center justify-center">
          {showStamp && activeBranding.stampUrl ? (
            <img
              src={activeBranding.stampUrl}
              alt="Stamp"
              className="max-h-20 object-contain"
              style={{ transform: `scale(${activeBranding.stampScale || 1})` }}
            />
          ) : null}
        </div>

        {/* Signature Image & Signatory Text (Rendered only if present) */}
        {showSignature && (
          <div className="text-right space-y-1">
            <div className="h-16 flex items-end justify-end">
              {activeBranding.signatureUrl ? (
                <img
                  src={activeBranding.signatureUrl}
                  alt="Signature"
                  className="max-h-14 object-contain"
                  style={{ transform: `scale(${activeBranding.signatureScale || 1})` }}
                />
              ) : null}
            </div>
            <div className="w-44 border-t border-slate-300 ml-auto pt-1">
              <p className="text-xs font-bold text-slate-900">Authorized Signatory</p>
              <p className="text-[10px] text-slate-400">{safeBusinessName}</p>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER TEXT */}
      <div className="mt-8 text-center text-[10px] text-slate-400 border-t pt-4 border-slate-100 break-inside-avoid">
        {footerText}
      </div>
    </div>
  );
};
