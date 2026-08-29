import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ProfessionalGrid: React.FC<QuotationTemplateProps> = ({
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
  const showPan = customization?.showPan ?? true;
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
      {/* 3-Column Top Grid Header */}
      <div className="grid grid-cols-3 gap-4 border-b-2 pb-5 mb-6 border-slate-200 break-inside-avoid">
        <div className="space-y-1">
          <LogoComponent branding={branding} businessName={business.businessName} />
          <h1 className="text-base font-extrabold text-slate-900 mt-2">{business.businessName}</h1>
          <p className="text-[11px] text-slate-500">{business.address}</p>
          <p className="text-[11px] text-slate-500">{business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-[11px] font-bold text-slate-700">GSTIN: {business.gstin}</p>}
        </div>

        <div className="border-l border-r border-slate-200 px-4 space-y-1">
          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">PREPARED FOR</span>
          <h3 className="text-sm font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-[11px] text-slate-600">{customer?.address}</p>
          <p className="text-[11px] text-slate-600">Ph: {customer?.phone}</p>
          {showGstin && customer?.gstin && <p className="text-[11px] font-bold text-slate-700">GSTIN: {customer.gstin}</p>}
        </div>

        <div className="text-right space-y-1">
          <span className="text-[9px] font-extrabold uppercase px-2.5 py-1 rounded text-white tracking-wider" style={{ backgroundColor: primaryColor }}>
            QUOTATION DETAILS
          </span>
          <h2 className="text-base font-extrabold text-slate-900 mt-2">{quotation.quotationNumber}</h2>
          <p className="text-[11px] text-slate-500">Date: <strong className="text-slate-800">{formatDate(quotation.date)}</strong></p>
          <p className="text-[11px] text-slate-500">Valid Until: <strong className="text-slate-800">{formatDate(quotation.validUntil)}</strong></p>
        </div>
      </div>

      {/* Grid Table */}
      <div className="mb-6 border border-slate-200 rounded-lg overflow-hidden shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-extrabold text-[10px] uppercase border-b border-slate-200">
              <th className="p-3">#</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : ''}>
                <td className="p-3 text-slate-400 font-medium">{idx + 1}</td>
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

      {/* Grid Totals & Notes */}
      <div className="grid grid-cols-12 gap-6 mb-8 break-inside-avoid">
        <div className="col-span-7 text-xs">
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase block mb-1">TERMS & CONDITIONS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="col-span-5 text-xs">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
            {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
            <div className="flex justify-between text-slate-600"><span>Tax Amount:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
            <div className="pt-2 border-t border-slate-300 flex justify-between font-extrabold text-sm" style={{ color: primaryColor }}>
              <span>Grand Total:</span>
              <span>{formatCurrency(quotation.grandTotal, currency)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Signatures */}
      <div className="pt-4 border-t border-slate-200 flex justify-between items-end break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-44 border-t border-slate-300 ml-auto pt-1 text-xs font-bold text-slate-800">
              Authorized Representative
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
