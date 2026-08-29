import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ElegantBorder: React.FC<QuotationTemplateProps> = ({
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
      {/* Outer Double Frame Container */}
      <div className="border-4 border-double border-slate-800 p-6 rounded-lg">
        {/* Centered Business Header */}
        <div className="text-center pb-6 border-b border-slate-300 mb-6">
          <div className="flex justify-center mb-2">
            <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="executive" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-slate-900 tracking-wide uppercase">{business.businessName}</h1>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">{[business.address, business.city, business.state].filter(Boolean).join(', ')}</p>
          <p className="text-xs text-slate-500">Ph: {business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-slate-700 mt-1">GSTIN: {business.gstin}</p>}
        </div>

        {/* Certificate Style Subheader */}
        <div className="flex justify-between items-center mb-6 text-xs border-b border-slate-200 pb-4 break-inside-avoid">
          <div>
            <span className="text-[10px] font-serif uppercase tracking-widest text-slate-400 block">PREPARED FOR</span>
            <h3 className="text-sm font-bold text-slate-900">{customer?.name}</h3>
            <p className="text-slate-600">{customer?.address}</p>
          </div>

          <div className="text-right">
            <span className="text-xs font-serif font-bold uppercase tracking-widest text-amber-700 block">OFFICIAL QUOTATION</span>
            <h2 className="text-base font-bold text-slate-900">{quotation.quotationNumber}</h2>
            <p className="text-slate-500">Date: {formatDate(quotation.date)}</p>
          </div>
        </div>

        {/* Table */}
        <div className="mb-6 border border-slate-300">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800 text-white font-serif text-[10px] uppercase tracking-wider">
                <th className="p-2.5 border-r border-slate-700">#</th>
                <th className="p-2.5 border-r border-slate-700">Item Description</th>
                <th className="p-2.5 text-center border-r border-slate-700">Qty</th>
                <th className="p-2.5 text-right border-r border-slate-700">Rate</th>
                <th className="p-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {quotation.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="p-2.5 border-r border-slate-200 text-slate-400">{idx + 1}</td>
                  <td className="p-2.5 border-r border-slate-200 font-semibold text-slate-900">{item.productName}</td>
                  <td className="p-2.5 border-r border-slate-200 text-center">{item.quantity}</td>
                  <td className="p-2.5 border-r border-slate-200 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                  <td className="p-2.5 text-right font-bold">{formatCurrency(item.total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-between items-start gap-4 mb-6 text-xs break-inside-avoid">
          <div className="flex-1">
            {showTerms && hasValue(quotation.terms) && (
              <div className="p-3 border border-slate-200 bg-slate-50">
                <span className="font-serif font-bold text-slate-400 uppercase text-[9px] block mb-1">TERMS:</span>
                <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
              </div>
            )}
          </div>

          <div className="w-56 border-2 border-slate-800 p-3 bg-slate-50 space-y-1.5 font-serif">
            <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
            {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
            <div className="flex justify-between text-slate-600"><span>Tax:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
            <div className="pt-1.5 border-t-2 border-slate-800 flex justify-between font-bold text-sm text-slate-900">
              <span>Grand Total:</span>
              <span>{formatCurrency(quotation.grandTotal, currency)}</span>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="pt-4 border-t border-slate-300 flex justify-between items-end text-xs break-inside-avoid">
          {showStamp && branding.stampUrl ? (
            <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
          ) : <div />}

          {showSignature && (
            <div className="text-right font-serif">
              {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
              <div className="w-40 border-t border-slate-800 ml-auto pt-1 font-bold text-slate-900">
                Authorized Signatory
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
