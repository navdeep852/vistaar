import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const BusinessStandard: React.FC<QuotationTemplateProps> = ({
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
  const showBankDetails = customization?.showBankDetails ?? true;
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
      {/* Header */}
      <div className="flex justify-between items-center border-b pb-4 mb-6 border-slate-300">
        <div className="flex items-center gap-3">
          <LogoComponent branding={branding} businessName={business.businessName} />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{business.businessName}</h1>
            <p className="text-xs text-slate-500">{business.address}{business.city ? `, ${business.city}` : ''}</p>
            <p className="text-xs text-slate-500">Ph: {business.phone} | {business.email}</p>
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-xl font-black tracking-tight" style={{ color: primaryColor }}>QUOTATION</h2>
          <p className="text-xs font-bold text-slate-800">{quotation.quotationNumber}</p>
          <p className="text-[11px] text-slate-500">Date: {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Addresses */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div className="border border-slate-200 p-3 rounded-lg bg-slate-50">
          <span className="font-bold text-slate-400 uppercase text-[9px] block mb-1">TO:</span>
          <h3 className="font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
          <p className="text-slate-600">Ph: {customer?.phone}</p>
          {showGstin && customer?.gstin && <p className="font-semibold text-slate-700">GSTIN: {customer.gstin}</p>}
        </div>

        <div className="border border-slate-200 p-3 rounded-lg bg-slate-50 space-y-1">
          <span className="font-bold text-slate-400 uppercase text-[9px] block mb-1">VALIDITY & TERMS:</span>
          <p className="flex justify-between"><span>Valid Until:</span> <strong className="text-slate-800">{formatDate(quotation.validUntil)}</strong></p>
          {showGstin && business.gstin && <p className="flex justify-between"><span>GSTIN:</span> <strong>{business.gstin}</strong></p>}
          {showPan && business.pan && <p className="flex justify-between"><span>PAN:</span> <strong>{business.pan}</strong></p>}
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 border border-slate-300">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-800 text-white font-bold text-[10px] uppercase">
              <th className="p-2.5 border-r border-slate-700">#</th>
              <th className="p-2.5 border-r border-slate-700">Description</th>
              <th className="p-2.5 text-center border-r border-slate-700">Qty</th>
              <th className="p-2.5 text-right border-r border-slate-700">Rate</th>
              <th className="p-2.5 text-center border-r border-slate-700">Tax</th>
              <th className="p-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-2.5 border-r border-slate-200 text-slate-400">{idx + 1}</td>
                <td className="p-2.5 border-r border-slate-200 font-semibold text-slate-900">{item.productName}</td>
                <td className="p-2.5 border-r border-slate-200 text-center">{item.quantity}</td>
                <td className="p-2.5 border-r border-slate-200 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-2.5 border-r border-slate-200 text-center">{item.taxPercent || 0}%</td>
                <td className="p-2.5 text-right font-bold">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-between items-start gap-4 mb-6 text-xs break-inside-avoid">
        <div className="flex-1">
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 border border-slate-200 rounded-md bg-slate-50">
              <span className="font-bold text-slate-400 uppercase text-[9px] block mb-1">TERMS:</span>
              <p className="text-slate-600 whitespace-pre-line leading-snug">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="w-60 border border-slate-300 rounded-md p-3 bg-slate-50 space-y-1.5">
          <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between"><span>Tax:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-1.5 border-t border-slate-300 flex justify-between font-extrabold text-sm" style={{ color: primaryColor }}>
            <span>Grand Total:</span>
            <span>{formatCurrency(quotation.grandTotal, currency)}</span>
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
            <div className="w-40 border-t border-slate-400 ml-auto pt-1 font-bold text-slate-800">
              Authorized Signatory
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
