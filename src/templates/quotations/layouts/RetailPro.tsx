import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const RetailPro: React.FC<QuotationTemplateProps> = ({
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
      {/* Retail Pro Header */}
      <div className="flex justify-between items-start pb-4 mb-4 border-b-2 border-emerald-600">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} />
          <h1 className="text-xl font-black text-slate-900 mt-2">{business.businessName}</h1>
          <p className="text-xs text-slate-500">{business.address}</p>
          <p className="text-xs text-slate-500">Ph: {business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-emerald-700">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-emerald-600 text-white font-black text-[10px] uppercase rounded-md tracking-wider">
            RETAIL QUOTATION
          </span>
          <h2 className="text-base font-bold text-slate-900 mt-2">{quotation.quotationNumber}</h2>
          <p className="text-xs text-slate-500">Date: {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Recipient */}
      <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 mb-4 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[9px] font-bold uppercase text-slate-400 block mb-0.5">CUSTOMER</span>
          <h3 className="text-sm font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address} {customer?.phone ? `| Ph: ${customer.phone}` : ''}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-bold uppercase text-slate-400 block mb-0.5">NET TOTAL</span>
          <p className="text-base font-black text-emerald-700">{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Retail Multi-Column Product Table */}
      <div className="mb-4 border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-emerald-700 text-white text-[10px] font-bold uppercase">
              <th className="p-2.5">#</th>
              <th className="p-2.5">Product Name</th>
              <th className="p-2.5">SKU / Code</th>
              <th className="p-2.5 text-center">Qty</th>
              <th className="p-2.5 text-right">MRP / Price</th>
              <th className="p-2.5 text-center">Tax</th>
              <th className="p-2.5 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : ''}>
                <td className="p-2.5 text-slate-400 font-bold">{idx + 1}</td>
                <td className="p-2.5 font-bold text-slate-900">{item.productName}</td>
                <td className="p-2.5 text-slate-500 font-mono text-[11px]">{item.sku || '-'}</td>
                <td className="p-2.5 text-center font-semibold">{item.quantity} {item.unit || 'Pcs'}</td>
                <td className="p-2.5 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-2.5 text-center">{item.taxPercent || 0}%</td>
                <td className="p-2.5 text-right font-black text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-1">RETAIL POLICIES</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Total Savings:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Amount:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-1.5 border-t border-slate-300 flex justify-between items-center text-sm font-black text-emerald-700">
            <span>Net Payable:</span>
            <span>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-3 border-t border-slate-200 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-14 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t border-slate-300 ml-auto pt-1 font-bold text-slate-800">
              Store Manager
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
