import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const CreativeAgency: React.FC<QuotationTemplateProps> = ({
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
      {/* Creative Gradient Header */}
      <div className="-mx-8 -mt-8 p-6 mb-6 text-white flex justify-between items-center bg-gradient-to-r from-purple-600 to-indigo-600 rounded-b-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <div>
            <h1 className="text-xl font-black tracking-tight">{business.businessName}</h1>
            <p className="text-xs text-purple-100">{business.address}</p>
            <p className="text-xs text-purple-100">{business.phone} | {business.email}</p>
          </div>
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-wider">
            CREATIVE PROPOSAL
          </span>
          <h2 className="text-lg font-black mt-1">{quotation.quotationNumber}</h2>
          <p className="text-xs text-purple-100">Date: {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Client Box */}
      <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100 mb-6 flex justify-between items-center break-inside-avoid">
        <div>
          <span className="text-[9px] font-extrabold uppercase text-purple-400 block mb-1">CLIENT PROJECT</span>
          <h3 className="text-sm font-black text-slate-900">{customer?.name}</h3>
          <p className="text-xs text-slate-600">{customer?.address}</p>
          <p className="text-xs text-slate-600">Ph: {customer?.phone}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-extrabold uppercase text-purple-400 block mb-1">PROJECT ESTIMATE</span>
          <p className="text-lg font-black text-purple-700">{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-purple-100 shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-purple-900 text-white text-[10px] font-black uppercase">
              <th className="p-3">#</th>
              <th className="p-3">Creative Deliverable</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-50">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-purple-50/30' : ''}>
                <td className="p-3 font-bold text-purple-300">{idx + 1}</td>
                <td className="p-3 font-extrabold text-slate-900">{item.productName}</td>
                <td className="p-3 text-center"><span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-bold text-[10px]">{item.quantity} {item.unit || 'Units'}</span></td>
                <td className="p-3 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3 text-center">{item.taxPercent || 0}%</td>
                <td className="p-3 text-right font-black text-purple-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 rounded-2xl bg-purple-50/40 border border-purple-100">
              <span className="text-[10px] font-bold text-purple-400 uppercase block mb-1">PROPOSAL SCOPE & TERMS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-purple-50/40 border border-purple-100 space-y-2">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-purple-200 flex justify-between items-center text-sm font-black text-purple-900">
            <span>Grand Total:</span>
            <span>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-4 border-t border-purple-100 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t border-purple-300 ml-auto pt-1 font-bold text-slate-800">
              Creative Director
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
