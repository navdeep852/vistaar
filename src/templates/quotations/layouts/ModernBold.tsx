import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ModernBold: React.FC<QuotationTemplateProps> = ({
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
      {/* Bold Header Header */}
      <div className="flex justify-between items-end border-b-4 pb-6 mb-6" style={{ borderColor: primaryColor }}>
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <h1 className="text-2xl font-black tracking-tight text-slate-900 mt-2">{business.businessName}</h1>
          <p className="text-xs text-slate-600 font-semibold">{business.address}</p>
          <p className="text-xs text-slate-500">{business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-slate-800">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <h2 className="text-3xl font-black tracking-tighter" style={{ color: primaryColor }}>QUOTATION</h2>
          <p className="text-sm font-black text-slate-900">{quotation.quotationNumber}</p>
          <p className="text-xs text-slate-500 font-bold">Date: {formatDate(quotation.date)}</p>
          <p className="text-xs text-slate-500 font-bold">Valid Until: {formatDate(quotation.validUntil)}</p>
        </div>
      </div>

      {/* Customer Bar */}
      <div className="p-4 rounded-xl bg-slate-900 text-white mb-6 flex justify-between items-center break-inside-avoid">
        <div>
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">PREPARED FOR</span>
          <h3 className="text-base font-black text-white">{customer?.name}</h3>
          <p className="text-xs text-slate-300">{customer?.address}</p>
          <p className="text-xs text-slate-300">Ph: {customer?.phone}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">GRAND TOTAL</span>
          <p className="text-xl font-black text-amber-400">{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden border-2 border-slate-900 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-black text-[10px] uppercase tracking-wider">
              <th className="p-3">#</th>
              <th className="p-3">Item / Description</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : ''}>
                <td className="p-3 font-black text-slate-400">{idx + 1}</td>
                <td className="p-3 font-extrabold text-slate-900">{item.productName}</td>
                <td className="p-3 text-center font-bold">{item.quantity}</td>
                <td className="p-3 text-right font-bold">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3 text-center font-bold">{item.taxPercent || 0}%</td>
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
            <div className="p-3 rounded-xl border-2 border-slate-200 bg-slate-50">
              <span className="text-[10px] font-black text-slate-400 uppercase block mb-1">TERMS & CONDITIONS</span>
              <p className="text-slate-700 font-semibold whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border-2 border-slate-900 bg-slate-50 space-y-2">
          <div className="flex justify-between font-bold text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between font-bold text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between font-bold text-slate-600"><span>Tax Total:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-center text-lg font-black text-slate-900">
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-4 border-t-2 border-slate-900 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-44 border-t-2 border-slate-900 ml-auto pt-1 font-black text-slate-900">
              Authorized Signatory
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
