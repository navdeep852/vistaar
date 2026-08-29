import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ModernCards: React.FC<QuotationTemplateProps> = ({
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
    <div style={containerStyle} className="relative transition-all space-y-4">
      {/* Card 1: Header */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white shadow-xs flex justify-between items-center">
        <div className="flex items-center gap-3">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <div>
            <h1 className="text-lg font-black tracking-tight" style={{ color: primaryColor }}>{business.businessName}</h1>
            <p className="text-xs text-slate-500">{business.address}{business.city ? `, ${business.city}` : ''}</p>
            <p className="text-xs text-slate-500">{business.phone} | {business.email}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="px-3 py-1 bg-blue-50 text-blue-600 font-extrabold text-[10px] uppercase rounded-lg tracking-wider">
            QUOTATION CARD
          </span>
          <h2 className="text-base font-black text-slate-900 mt-1">{quotation.quotationNumber}</h2>
          <p className="text-[11px] text-slate-400">Date: {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Card 2: Details Split */}
      <div className="grid grid-cols-2 gap-4 break-inside-avoid">
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60">
          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">CLIENT DETAILS</span>
          <h3 className="text-sm font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-xs text-slate-600">{customer?.address}</p>
          <p className="text-xs text-slate-600">Ph: {customer?.phone}</p>
          {showGstin && customer?.gstin && <p className="text-xs font-semibold text-slate-700">GSTIN: {customer.gstin}</p>}
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between">
          <div>
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">VALIDITY & TERMS</span>
            <p className="text-xs text-slate-600">Valid Until: <strong className="text-slate-900">{formatDate(quotation.validUntil)}</strong></p>
            {showGstin && business.gstin && <p className="text-xs text-slate-600">GSTIN: <strong className="text-slate-900">{business.gstin}</strong></p>}
          </div>
          <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs font-black">
            <span>Estimated Total:</span>
            <span className="text-sm font-black" style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Card 3: Items Table Card */}
      <div className="p-1 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-extrabold text-[10px] uppercase">
              <th className="p-3">#</th>
              <th className="p-3">Item Description</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-3 font-bold text-slate-400">{idx + 1}</td>
                <td className="p-3 font-bold text-slate-900">{item.productName}</td>
                <td className="p-3 text-center">{item.quantity} {item.unit || 'Pcs'}</td>
                <td className="p-3 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3 text-center">{item.taxPercent || 0}%</td>
                <td className="p-3 text-right font-extrabold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Card 4: Totals & Terms */}
      <div className="grid grid-cols-2 gap-4 break-inside-avoid">
        {showTerms && hasValue(quotation.terms) ? (
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 text-xs">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase block mb-1">TERMS</span>
            <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
          </div>
        ) : <div />}

        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 text-xs space-y-1.5">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Amount:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-300 flex justify-between font-black text-sm text-slate-900">
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-4 border-t border-slate-200 flex justify-between items-end break-inside-avoid text-xs">
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
