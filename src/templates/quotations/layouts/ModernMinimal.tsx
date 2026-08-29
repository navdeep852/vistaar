import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ModernMinimal: React.FC<QuotationTemplateProps> = ({
  quotation,
  business,
  customer,
  branding,
  theme,
  customization,
  isPrintMode = false,
}) => {
  const primaryColor = customization?.primaryColor || theme.primaryColor;
  const textColor = customization?.textColor || theme.textColor;
  const bodyFont = customization?.bodyFont || theme.fontFamily;
  const currency = quotation.currency || '₹';

  const showGstin = customization?.showGstin ?? true;
  const showSignature = customization?.showSignature ?? true;
  const showStamp = customization?.showStamp ?? true;
  const showTerms = customization?.showTerms ?? true;

  const containerStyle: React.CSSProperties = {
    fontFamily: `'${bodyFont}', sans-serif`,
    color: textColor,
    backgroundColor: '#ffffff',
    width: '100%',
    padding: isPrintMode ? '12mm' : '8mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all">
      {/* High Whitespace Header */}
      <div className="flex justify-between items-start mb-10 pb-6 border-b border-slate-100">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} />
          <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-3">{business.businessName}</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">{[business.address, business.city, business.state].filter(Boolean).join(', ')}</p>
          <p className="text-xs text-slate-400">{business.phone} | {business.email}</p>
        </div>

        <div className="text-right space-y-1">
          <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">ESTIMATE / QUOTATION</span>
          <h2 className="text-2xl font-light tracking-tight text-slate-900 mt-1">{quotation.quotationNumber}</h2>
          <p className="text-xs text-slate-400">Date: {formatDate(quotation.date)}</p>
          <p className="text-xs text-slate-400">Valid Until: {formatDate(quotation.validUntil)}</p>
        </div>
      </div>

      {/* Customer Info Minimal */}
      <div className="mb-10 text-xs grid grid-cols-2 gap-8 break-inside-avoid">
        <div>
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest block mb-1">PREPARED FOR</span>
          <h3 className="text-sm font-semibold text-slate-900">{customer?.name}</h3>
          <p className="text-slate-500 mt-0.5">{customer?.address}</p>
          <p className="text-slate-500">{customer?.phone}</p>
          {showGstin && customer?.gstin && <p className="text-slate-500">GSTIN: {customer.gstin}</p>}
        </div>

        {showGstin && business.gstin && (
          <div className="text-right">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest block mb-1">TAX & IDENTIFICATION</span>
            <p className="text-slate-600 font-medium">GSTIN: {business.gstin}</p>
            {business.pan && <p className="text-slate-500">PAN: {business.pan}</p>}
          </div>
        )}
      </div>

      {/* Borderless Line Table */}
      <div className="mb-8">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              <th className="py-3 pr-4">Description</th>
              <th className="py-3 px-4 text-center">Qty</th>
              <th className="py-3 px-4 text-right">Price</th>
              <th className="py-3 pl-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-4 pr-4 font-medium text-slate-900">{item.productName}</td>
                <td className="py-4 px-4 text-center text-slate-600">{item.quantity}</td>
                <td className="py-4 px-4 text-right text-slate-600">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="py-4 pl-4 text-right font-bold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      <div className="flex justify-between items-start gap-8 mb-10 text-xs break-inside-avoid">
        <div className="flex-1">
          {showTerms && hasValue(quotation.terms) && (
            <div>
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest block mb-1">TERMS</span>
              <p className="text-slate-500 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="w-56 space-y-2 border-t border-slate-200 pt-4">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-500"><span>Discount</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-500"><span>Tax</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-900">
            <span>Total</span>
            <span style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signature */}
      <div className="pt-6 border-t border-slate-100 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-36 border-t border-slate-300 ml-auto pt-1 text-slate-400">
              Signatory
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
