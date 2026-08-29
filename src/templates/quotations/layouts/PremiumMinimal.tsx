import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const PremiumMinimal: React.FC<QuotationTemplateProps> = ({
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
    padding: isPrintMode ? '14mm' : '10mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all">
      {/* Hairline Luxury Header */}
      <div className="flex justify-between items-start mb-8 pb-6 border-b border-amber-500/40">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="executive" />
          <h1 className="text-xl font-bold tracking-widest text-slate-900 uppercase mt-3">{business.businessName}</h1>
          <p className="text-[11px] text-slate-500 font-light mt-1 max-w-sm">{[business.address, business.city, business.state].filter(Boolean).join(', ')}</p>
          <p className="text-[11px] text-slate-500 font-light">{business.phone} | {business.email}</p>
        </div>

        <div className="text-right space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700">LUXURY PROPOSAL</span>
          <h2 className="text-xl font-light text-slate-900 tracking-wider mt-1">{quotation.quotationNumber}</h2>
          <p className="text-[11px] text-slate-500 font-light">Date: {formatDate(quotation.date)}</p>
          <p className="text-[11px] text-slate-500 font-light">Valid: {formatDate(quotation.validUntil)}</p>
        </div>
      </div>

      {/* Recipient Box */}
      <div className="mb-8 p-4 rounded-xl border border-slate-200/80 bg-amber-500/5 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">PREPARED FOR</span>
          <h3 className="text-sm font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600 font-light">{customer?.address}</p>
          <p className="text-slate-600 font-light">{customer?.phone}</p>
          {showGstin && customer?.gstin && <p className="text-slate-700 font-medium">GSTIN: {customer.gstin}</p>}
        </div>

        <div className="text-right">
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 block mb-1">TOTAL ESTIMATE</span>
          <p className="text-lg font-light text-slate-900" style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-8">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-amber-500/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
              <th className="py-3">#</th>
              <th className="py-3">Specification</th>
              <th className="py-3 text-center">Qty</th>
              <th className="py-3 text-right">Unit Price</th>
              <th className="py-3 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-3.5 text-slate-400 font-light">{idx + 1}</td>
                <td className="py-3.5 font-semibold text-slate-900">{item.productName}</td>
                <td className="py-3.5 text-center text-slate-600 font-light">{item.quantity}</td>
                <td className="py-3.5 text-right text-slate-600 font-light">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="py-3.5 text-right font-bold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-between items-start gap-8 mb-10 text-xs break-inside-avoid">
        <div className="flex-1">
          {showTerms && hasValue(quotation.terms) && (
            <div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">PROPOSAL CONDITIONS</span>
              <p className="text-slate-600 font-light whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="w-60 border-t border-b border-amber-500/40 py-3 space-y-1.5">
          <div className="flex justify-between text-slate-600 font-light"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600 font-light"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600 font-light"><span>Tax:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-6 border-t border-slate-200 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t border-slate-400 ml-auto pt-1 font-semibold text-slate-800">
              Executive Officer
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
