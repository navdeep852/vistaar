import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ExecutiveDark: React.FC<QuotationTemplateProps> = ({
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
      {/* Dark Theme Header Block */}
      <div className="-mx-8 -mt-8 p-6 mb-6 bg-slate-950 text-white flex justify-between items-center border-b-4 border-amber-500">
        <div className="flex items-center gap-4">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="executive" />
          <div>
            <h1 className="text-xl font-extrabold tracking-wide text-amber-400 uppercase">{business.businessName}</h1>
            <p className="text-xs text-slate-300">{business.address}</p>
            <p className="text-xs text-slate-400">Ph: {business.phone} | {business.email}</p>
            {showGstin && business.gstin && <p className="text-xs font-bold text-slate-300">GSTIN: {business.gstin}</p>}
          </div>
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-amber-500 text-slate-950 font-black text-[10px] uppercase rounded tracking-wider">
            EXECUTIVE PROPOSAL
          </span>
          <h2 className="text-lg font-bold text-white mt-1">{quotation.quotationNumber}</h2>
          <p className="text-xs text-slate-300">Date: {formatDate(quotation.date)}</p>
          <p className="text-xs text-slate-300">Valid: {formatDate(quotation.validUntil)}</p>
        </div>
      </div>

      {/* Recipient Card */}
      <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 mb-6 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[9px] font-black uppercase text-slate-500 block mb-1">CLIENT ORGANIZATION</span>
          <h3 className="text-sm font-black text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
          <p className="text-slate-600">Ph: {customer?.phone}</p>
          {showGstin && customer?.gstin && <p className="font-bold text-slate-800">GSTIN: {customer.gstin}</p>}
        </div>
        <div className="text-right">
          <span className="text-[9px] font-black uppercase text-slate-500 block mb-1">ESTIMATED VALUATION</span>
          <p className="text-lg font-black text-slate-950">{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden border border-slate-900 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-black text-[10px] uppercase">
              <th className="p-3">#</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : ''}>
                <td className="p-3 font-bold text-slate-400">{idx + 1}</td>
                <td className="p-3 font-extrabold text-slate-900">{item.productName}</td>
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
            <div className="p-3 rounded-xl border border-slate-300 bg-slate-50">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">TERMS & CONDITIONS</span>
              <p className="text-slate-700 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border-2 border-slate-900 bg-slate-900 text-white space-y-2">
          <div className="flex justify-between text-slate-300"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-300"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-300"><span>Tax Amount:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-700 flex justify-between items-center text-sm font-black text-amber-400">
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
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-44 border-t border-slate-900 ml-auto pt-1 font-bold text-slate-900">
              Managing Director
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
