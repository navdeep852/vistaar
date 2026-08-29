import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ConstructionLayout: React.FC<QuotationTemplateProps> = ({
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
      {/* Construction Banner */}
      <div className="-mx-8 -mt-8 p-6 mb-6 bg-slate-900 text-white flex justify-between items-center border-b-4 border-yellow-500">
        <div className="flex items-center gap-3">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <div>
            <h1 className="text-lg font-black uppercase text-yellow-400">{business.businessName}</h1>
            <p className="text-xs text-slate-300">Civil & Structural Works</p>
            <p className="text-xs text-slate-400">Ph: {business.phone} | {business.email}</p>
          </div>
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-yellow-500 text-slate-950 font-black text-[10px] uppercase rounded">
            CONSTRUCTION BID
          </span>
          <h2 className="text-base font-bold text-white mt-1">{quotation.quotationNumber}</h2>
          <p className="text-xs text-slate-300">Date: {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Recipient */}
      <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 mb-6 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[9px] font-black uppercase text-slate-500 block mb-1">DEVELOPER / CLIENT</span>
          <h3 className="text-sm font-black text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-black uppercase text-slate-500 block mb-1">TOTAL BID VALUE</span>
          <p className="text-base font-black text-slate-900">{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden border-2 border-slate-900 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-black text-[10px] uppercase">
              <th className="p-3">#</th>
              <th className="p-3">BOQ / Work Description</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Unit Rate</th>
              <th className="p-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-3 font-bold text-slate-400">{idx + 1}</td>
                <td className="p-3 font-bold text-slate-900">{item.productName}</td>
                <td className="p-3 text-center">{item.quantity} {item.unit || 'Sq.Ft'}</td>
                <td className="p-3 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
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
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">STAGE PAYMENT TERMS</span>
              <p className="text-slate-700 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl border-2 border-slate-900 bg-slate-50 space-y-2">
          <div className="flex justify-between font-bold text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between font-bold text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between font-bold text-slate-600"><span>Tax:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-center text-sm font-black text-slate-900">
            <span>Grand Total:</span>
            <span>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-4 border-t-2 border-slate-900 flex justify-between items-end text-xs break-inside-avoid">
        <div className="text-left">
          <div className="w-40 border-t-2 border-slate-900 pt-1 font-black text-slate-900">
            Project Engineer
          </div>
        </div>

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t-2 border-slate-900 ml-auto pt-1 font-black text-slate-900">
              Chief Executive
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
