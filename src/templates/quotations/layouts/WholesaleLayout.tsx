import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const WholesaleLayout: React.FC<QuotationTemplateProps> = ({
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

  const containerStyle: React.CSSProperties = {
    fontFamily: `'${bodyFont}', sans-serif`,
    color: textColor,
    backgroundColor: '#ffffff',
    width: '100%',
    padding: isPrintMode ? '10mm' : '6mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all text-xs">
      {/* Dense Wholesale Header */}
      <div className="flex justify-between items-center border-b pb-3 mb-3 border-slate-300">
        <div className="flex items-center gap-3">
          <LogoComponent branding={branding} businessName={business.businessName} />
          <div>
            <h1 className="text-base font-bold text-slate-900">{business.businessName} (WHOLESALE DIVISION)</h1>
            <p className="text-[11px] text-slate-500">{business.address} | Ph: {business.phone}</p>
            {showGstin && business.gstin && <p className="text-[11px] font-bold text-slate-700">GSTIN: {business.gstin}</p>}
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-base font-black tracking-tight" style={{ color: primaryColor }}>BULK QUOTATION</h2>
          <p className="text-xs font-bold text-slate-800">{quotation.quotationNumber}</p>
          <p className="text-[11px] text-slate-500">Date: {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Customer Info */}
      <div className="grid grid-cols-2 gap-4 mb-3 border p-2 rounded bg-slate-50 break-inside-avoid">
        <div>
          <span className="text-[9px] font-bold text-slate-400 block">BUYER / DEALER:</span>
          <h3 className="font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600 text-[11px]">{customer?.address}</p>
          {showGstin && customer?.gstin && <p className="font-bold text-[11px]">GSTIN: {customer.gstin}</p>}
        </div>
        <div className="text-right">
          <span className="text-[9px] font-bold text-slate-400 block">VALIDITY:</span>
          <p className="font-bold text-slate-800 text-[11px]">{formatDate(quotation.validUntil)}</p>
          <p className="text-slate-500 text-[11px]">Total Items: <strong>{quotation.items.length}</strong></p>
        </div>
      </div>

      {/* High Density Table */}
      <div className="mb-3 border border-slate-300">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-800 text-white font-bold text-[9px] uppercase">
              <th className="p-1.5 border-r border-slate-700">#</th>
              <th className="p-1.5 border-r border-slate-700">Item Description</th>
              <th className="p-1.5 border-r border-slate-700">SKU</th>
              <th className="p-1.5 text-center border-r border-slate-700">Bulk Qty</th>
              <th className="p-1.5 text-right border-r border-slate-700">Wholesale Rate</th>
              <th className="p-1.5 text-center border-r border-slate-700">Tax</th>
              <th className="p-1.5 text-right">Net Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : ''}>
                <td className="p-1.5 border-r border-slate-200 text-slate-400">{idx + 1}</td>
                <td className="p-1.5 border-r border-slate-200 font-bold text-slate-900">{item.productName}</td>
                <td className="p-1.5 border-r border-slate-200 text-slate-500">{item.sku || '-'}</td>
                <td className="p-1.5 border-r border-slate-200 text-center font-bold">{item.quantity} {item.unit || 'Pcs'}</td>
                <td className="p-1.5 border-r border-slate-200 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-1.5 border-r border-slate-200 text-center">{item.taxPercent || 0}%</td>
                <td className="p-1.5 text-right font-black">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Footer Bar */}
      <div className="flex justify-between items-center p-3 border border-slate-900 bg-slate-900 text-white rounded mb-3 break-inside-avoid">
        <div className="text-[11px] space-x-4">
          <span>Subtotal: <strong>{formatCurrency(quotation.subtotal, currency)}</strong></span>
          <span>Tax: <strong>{formatCurrency(quotation.taxTotal, currency)}</strong></span>
        </div>
        <div className="text-sm font-black text-amber-400">
          Grand Total: {formatCurrency(quotation.grandTotal, currency)}
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-2 border-t border-slate-300 flex justify-between items-end break-inside-avoid text-[11px]">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-12 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-10 object-contain ml-auto mb-1" />}
            <div className="w-36 border-t border-slate-400 ml-auto pt-0.5 font-bold">
              Wholesale Dispatch Desk
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
