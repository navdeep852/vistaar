import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const DigitalBusiness: React.FC<QuotationTemplateProps> = ({
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
    <div style={containerStyle} className="relative transition-all font-mono text-xs">
      {/* Tech / Digital Header */}
      <div className="flex justify-between items-start pb-6 mb-6 border-b border-slate-300">
        <div className="space-y-1">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <h1 className="text-base font-bold text-slate-900 mt-2">&lt;{business.businessName}/&gt;</h1>
          <p className="text-slate-500">{business.address}</p>
          <p className="text-slate-500">{business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="font-bold text-slate-700">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right space-y-1">
          <span className="px-2.5 py-1 bg-slate-900 text-green-400 font-bold text-[10px] rounded tracking-wider">
            // DIGITAL_BID
          </span>
          <h2 className="text-sm font-bold text-slate-900 mt-2">{quotation.quotationNumber}</h2>
          <p className="text-slate-500">Date: {formatDate(quotation.date)}</p>
          <p className="text-slate-500">Valid: {formatDate(quotation.validUntil)}</p>
        </div>
      </div>

      {/* Recipient */}
      <div className="p-3 bg-slate-100 rounded border border-slate-300 mb-6 flex justify-between items-center break-inside-avoid">
        <div>
          <span className="text-[9px] text-slate-500 block">// CLIENT_SPEC</span>
          <h3 className="font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] text-slate-500 block">// VALUATION</span>
          <p className="font-bold text-slate-900" style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 border border-slate-300 rounded overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white text-[10px]">
              <th className="p-2.5">#</th>
              <th className="p-2.5">MODULE / ITEM</th>
              <th className="p-2.5 text-center">QTY</th>
              <th className="p-2.5 text-right">RATE</th>
              <th className="p-2.5 text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-2.5 text-slate-400">{idx + 1}</td>
                <td className="p-2.5 font-bold text-slate-900">{item.productName}</td>
                <td className="p-2.5 text-center">{item.quantity}</td>
                <td className="p-2.5 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-2.5 text-right font-bold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6 break-inside-avoid">
        <div>
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 bg-slate-100 rounded border border-slate-300">
              <span className="text-[9px] text-slate-500 block mb-1">// TERMS</span>
              <p className="text-slate-700 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-100 rounded border border-slate-300 space-y-1">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-1.5 border-t border-slate-300 flex justify-between font-bold text-slate-900">
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-4 border-t border-slate-300 flex justify-between items-end break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t border-slate-900 ml-auto pt-1 font-bold text-slate-900">
              // AUTH_SIGN
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
