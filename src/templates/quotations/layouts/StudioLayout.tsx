import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const StudioLayout: React.FC<QuotationTemplateProps> = ({
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
      {/* Editorial Headline Header */}
      <div className="border-b border-slate-900 pb-8 mb-8">
        <div className="flex justify-between items-start">
          <LogoComponent branding={branding} businessName={business.businessName} />
          <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">STUDIO PROPOSAL</span>
        </div>
        <h1 className="text-3xl font-serif font-black tracking-tight text-slate-900 mt-4">{business.businessName}</h1>
        <div className="flex justify-between items-end mt-4 text-xs text-slate-500 font-light">
          <p>{business.address} | {business.phone} | {business.email}</p>
          <p className="font-bold text-slate-900">{quotation.quotationNumber} — {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Editorial Client Grid */}
      <div className="grid grid-cols-2 gap-8 mb-8 text-xs break-inside-avoid">
        <div>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">CLIENT COMMISSION</span>
          <h3 className="text-base font-serif font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600 font-light mt-0.5">{customer?.address}</p>
          <p className="text-slate-600 font-light">{customer?.phone}</p>
        </div>

        <div className="text-right">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">TOTAL VALUATION</span>
          <p className="text-2xl font-serif font-black text-slate-900" style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Editorial Table */}
      <div className="mb-8">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b-2 border-slate-900 text-[10px] uppercase font-black tracking-wider text-slate-900">
              <th className="py-3">Deliverable</th>
              <th className="py-3 text-center">Units</th>
              <th className="py-3 text-right">Fee</th>
              <th className="py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-3.5 font-serif font-bold text-slate-900">{item.productName}</td>
                <td className="py-3.5 text-center text-slate-600 font-light">{item.quantity}</td>
                <td className="py-3.5 text-right text-slate-600 font-light">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="py-3.5 text-right font-bold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-8 mb-8 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(quotation.terms) && (
            <div>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">AGREEMENT TERMS</span>
              <p className="text-slate-600 font-light whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="border-t-2 border-slate-900 pt-4 space-y-1.5 font-serif">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-base text-slate-900">
            <span>Grand Total:</span>
            <span>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-6 border-t border-slate-200 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right font-serif">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t border-slate-900 ml-auto pt-1 font-bold text-slate-900">
              Studio Principal
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
