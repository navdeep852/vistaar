import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const PortfolioLayout: React.FC<QuotationTemplateProps> = ({
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
      {/* Portfolio Header */}
      <div className="flex justify-between items-start pb-6 mb-6 border-b-2 border-slate-900">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <h1 className="text-xl font-black text-slate-900 mt-2">{business.businessName}</h1>
          <p className="text-xs text-slate-500">{business.address}</p>
          <p className="text-xs text-slate-500">{business.phone} | {business.email}</p>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-black uppercase px-3 py-1 bg-slate-900 text-white rounded-full tracking-wider">
            AGENCY PROPOSAL
          </span>
          <h2 className="text-base font-black text-slate-900 mt-2">{quotation.quotationNumber}</h2>
          <p className="text-xs text-slate-500 font-bold">Date: {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Scope Header */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-6 flex justify-between items-center break-inside-avoid">
        <div>
          <span className="text-[9px] font-extrabold uppercase text-slate-400 block mb-1">PROPOSAL SCOPE FOR</span>
          <h3 className="text-sm font-black text-slate-900">{customer?.name}</h3>
          <p className="text-xs text-slate-600">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-extrabold uppercase text-slate-400 block mb-1">TOTAL ESTIMATE</span>
          <p className="text-base font-black text-slate-900" style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white text-[10px] font-black uppercase">
              <th className="p-3">#</th>
              <th className="p-3">Deliverable Item</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price ({currency})</th>
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
                <td className="p-3 text-right font-black text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Terms & Totals */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">PROPOSAL TERMS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-300 flex justify-between items-center text-sm font-black text-slate-900">
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
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
              Agency Lead
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
