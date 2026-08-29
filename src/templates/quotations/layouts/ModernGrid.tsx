import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ModernGrid: React.FC<QuotationTemplateProps> = ({
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
      {/* Header Grid */}
      <div className="grid grid-cols-12 gap-4 pb-6 mb-6 border-b border-slate-200 break-inside-avoid">
        <div className="col-span-7 space-y-1">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <h1 className="text-xl font-black text-slate-900 mt-2">{business.businessName}</h1>
          <p className="text-xs text-slate-500">{business.address}</p>
          <p className="text-xs text-slate-500">{business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-slate-700">GSTIN: {business.gstin}</p>}
        </div>

        <div className="col-span-5 bg-slate-900 text-white p-4 rounded-2xl flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">QUOTATION</span>
            <h2 className="text-lg font-black">{quotation.quotationNumber}</h2>
          </div>
          <div className="text-xs text-slate-300 space-y-0.5 pt-2 border-t border-slate-800">
            <p className="flex justify-between"><span>Date:</span> <strong className="text-white">{formatDate(quotation.date)}</strong></p>
            <p className="flex justify-between"><span>Valid:</span> <strong className="text-white">{formatDate(quotation.validUntil)}</strong></p>
          </div>
        </div>
      </div>

      {/* Customer Bar */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 mb-6 text-xs break-inside-avoid">
        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">RECIPIENT DETAILS</span>
        <h3 className="text-sm font-bold text-slate-900">{customer?.name}</h3>
        <p className="text-slate-600">{customer?.address}</p>
        <p className="text-slate-600">Ph: {customer?.phone}</p>
        {showGstin && customer?.gstin && <p className="font-semibold text-slate-700">GSTIN: {customer.gstin}</p>}
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
              <th className="p-3">#</th>
              <th className="p-3">Product Description</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-3 text-slate-400 font-bold">{idx + 1}</td>
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
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">TERMS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
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
              Authorized Signatory
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
