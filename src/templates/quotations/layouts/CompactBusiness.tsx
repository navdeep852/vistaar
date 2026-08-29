import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const CompactBusiness: React.FC<QuotationTemplateProps> = ({
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
    padding: isPrintMode ? '8mm' : '5mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all text-xs leading-tight">
      {/* Compact Header */}
      <div className="flex justify-between items-center border-b pb-2 mb-3 border-slate-300">
        <div className="flex items-center gap-2">
          <LogoComponent branding={branding} businessName={business.businessName} />
          <div>
            <h1 className="text-sm font-bold text-slate-900">{business.businessName}</h1>
            <p className="text-[10px] text-slate-500">{business.address} | Ph: {business.phone}</p>
          </div>
        </div>

        <div className="text-right">
          <span className="font-bold text-slate-900 text-xs">QUOTATION: {quotation.quotationNumber}</span>
          <p className="text-[10px] text-slate-500">Date: {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="flex justify-between items-center p-2 rounded bg-slate-100 mb-3 text-[11px] break-inside-avoid">
        <div>
          <strong>Client:</strong> {customer?.name} ({customer?.phone || 'N/A'})
        </div>
        <div>
          <strong>Valid Until:</strong> {formatDate(quotation.validUntil)}
        </div>
      </div>

      {/* Table */}
      <div className="mb-3 border border-slate-300">
        <table className="w-full text-left border-collapse text-[10px]">
          <thead>
            <tr className="bg-slate-200 text-slate-800 font-bold uppercase">
              <th className="p-1.5">#</th>
              <th className="p-1.5">Item</th>
              <th className="p-1.5 text-center">Qty</th>
              <th className="p-1.5 text-right">Price</th>
              <th className="p-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-1.5 text-slate-400">{idx + 1}</td>
                <td className="p-1.5 font-bold text-slate-900">{item.productName}</td>
                <td className="p-1.5 text-center">{item.quantity}</td>
                <td className="p-1.5 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-1.5 text-right font-bold">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex justify-between items-center p-2 bg-slate-50 border border-slate-200 rounded mb-3 break-inside-avoid">
        <div className="text-[10px] text-slate-600">
          Subtotal: {formatCurrency(quotation.subtotal, currency)} | Tax: {formatCurrency(quotation.taxTotal, currency)}
        </div>
        <div className="font-bold text-xs text-slate-900" style={{ color: primaryColor }}>
          Grand Total: {formatCurrency(quotation.grandTotal, currency)}
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-2 border-t border-slate-200 flex justify-between items-end text-[10px] break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-10 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-8 object-contain ml-auto mb-0.5" />}
            <div className="w-32 border-t border-slate-300 ml-auto pt-0.5 font-bold text-slate-700">
              Signatory
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
