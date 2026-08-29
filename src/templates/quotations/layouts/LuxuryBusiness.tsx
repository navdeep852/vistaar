import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const LuxuryBusiness: React.FC<QuotationTemplateProps> = ({
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
    borderLeftColor: primaryColor,
  };

  return (
    <div style={containerStyle} className="relative transition-all border-l-8">
      {/* Background Accent Emblem */}
      <div className="flex justify-between items-start pb-6 mb-6 border-b border-slate-200">
        <div className="space-y-1">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="executive" />
          <h1 className="text-2xl font-black text-slate-900 mt-2">{business.businessName}</h1>
          <p className="text-xs text-slate-500">{business.address}</p>
          <p className="text-xs text-slate-500">{business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-amber-700">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <span className="text-[10px] font-black tracking-widest text-amber-600 uppercase border border-amber-400 px-3 py-1 rounded-full">
            LUXURY B2B QUOTATION
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-3">{quotation.quotationNumber}</h2>
          <p className="text-xs text-slate-500">Date: {formatDate(quotation.date)}</p>
          <p className="text-xs text-slate-500">Valid: {formatDate(quotation.validUntil)}</p>
        </div>
      </div>

      {/* Recipient Details */}
      <div className="p-4 rounded-xl bg-slate-900 text-white mb-6 flex justify-between items-center break-inside-avoid">
        <div>
          <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">PREPARED FOR</span>
          <h3 className="text-base font-bold text-white mt-0.5">{customer?.name}</h3>
          <p className="text-xs text-slate-300">{customer?.address}</p>
          <p className="text-xs text-slate-300">Ph: {customer?.phone}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">PROPOSAL VALUE</span>
          <p className="text-xl font-bold text-white">{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-800 text-[10px] font-bold uppercase">
              <th className="p-3">#</th>
              <th className="p-3">Product / Service</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-3 font-bold text-slate-400">{idx + 1}</td>
                <td className="p-3 font-bold text-slate-900">{item.productName}</td>
                <td className="p-3 text-center">{item.quantity}</td>
                <td className="p-3 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3 text-center">{item.taxPercent || 0}%</td>
                <td className="p-3 text-right font-black text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">TERMS & CONDITIONS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-300 flex justify-between items-center text-sm font-black" style={{ color: primaryColor }}>
            <span>Grand Total:</span>
            <span>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-4 border-t border-slate-200 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t border-slate-300 ml-auto pt-1 font-bold text-slate-800">
              Managing Partner
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
