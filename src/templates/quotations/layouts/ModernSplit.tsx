import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ModernSplit: React.FC<QuotationTemplateProps> = ({
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
      {/* 50/50 Split Header */}
      <div className="grid grid-cols-2 gap-6 pb-6 mb-6 border-b border-slate-100">
        <div className="space-y-2">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <h1 className="text-xl font-black tracking-tight" style={{ color: primaryColor }}>{business.businessName}</h1>
          <p className="text-xs text-slate-500">{business.address}{business.city ? `, ${business.city}` : ''}</p>
          <p className="text-xs text-slate-500">{business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-slate-700">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right space-y-2 flex flex-col justify-between">
          <div>
            <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-black tracking-widest text-slate-700 uppercase">
              QUOTATION
            </span>
            <h2 className="text-xl font-black text-slate-900 mt-2">{quotation.quotationNumber}</h2>
          </div>
          <div className="text-xs text-slate-500 space-y-0.5">
            <p>Issued: <strong className="text-slate-900">{formatDate(quotation.date)}</strong></p>
            <p>Valid Until: <strong className="text-slate-900">{formatDate(quotation.validUntil)}</strong></p>
          </div>
        </div>
      </div>

      {/* Customer Card Split */}
      <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-100 mb-6 flex justify-between items-center gap-4 break-inside-avoid">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">PREPARED FOR</span>
          <h3 className="text-base font-extrabold text-slate-900 mt-0.5">{customer?.name}</h3>
          <p className="text-xs text-slate-600">{customer?.address}</p>
          <p className="text-xs text-slate-600">Ph: {customer?.phone} | Email: {customer?.email}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">QUOTATION TOTAL</span>
          <p className="text-lg font-black" style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Modern Table */}
      <div className="mb-6 rounded-2xl border border-slate-100 overflow-hidden shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-wider">
              <th className="p-3.5">#</th>
              <th className="p-3.5">Product / Service</th>
              <th className="p-3.5 text-center">Qty</th>
              <th className="p-3.5 text-right">Price ({currency})</th>
              <th className="p-3.5 text-center">Tax</th>
              <th className="p-3.5 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                <td className="p-3.5 font-bold text-slate-400">{idx + 1}</td>
                <td className="p-3.5 font-extrabold text-slate-900">{item.productName}</td>
                <td className="p-3.5 text-center font-medium">{item.quantity} {item.unit || 'Pcs'}</td>
                <td className="p-3.5 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3.5 text-center">{item.taxPercent || 0}%</td>
                <td className="p-3.5 text-right font-black text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary & Terms */}
      <div className="grid grid-cols-2 gap-6 mb-8 break-inside-avoid">
        <div className="text-xs">
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">TERMS & CONDITIONS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="text-xs space-y-2 p-4 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Amount:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-base font-black text-slate-900">
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Footer Signatures */}
      <div className="pt-4 border-t border-slate-100 flex justify-between items-end break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t border-slate-300 ml-auto pt-1 text-xs font-bold text-slate-800">
              Authorized Officer
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
