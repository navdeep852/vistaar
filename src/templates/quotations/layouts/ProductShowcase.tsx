import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ProductShowcase: React.FC<QuotationTemplateProps> = ({
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
      {/* Product Showcase Header */}
      <div className="flex justify-between items-start pb-6 mb-6 border-b-2 border-indigo-600">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <h1 className="text-xl font-black text-slate-900 mt-2">{business.businessName}</h1>
          <p className="text-xs text-slate-500">{business.address}</p>
          <p className="text-xs text-slate-500">{business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-indigo-700">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-indigo-600 text-white font-black text-[10px] uppercase rounded-full tracking-wider">
            PRODUCT CATALOG PROPOSAL
          </span>
          <h2 className="text-lg font-black text-slate-900 mt-2">{quotation.quotationNumber}</h2>
          <p className="text-xs text-slate-500 font-bold">Date: {formatDate(quotation.date)}</p>
          <p className="text-xs text-slate-500 font-bold">Valid: {formatDate(quotation.validUntil)}</p>
        </div>
      </div>

      {/* Recipient */}
      <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 mb-6 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[9px] font-extrabold uppercase text-indigo-400 block mb-1">PROPOSAL FOR</span>
          <h3 className="text-sm font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-extrabold uppercase text-indigo-400 block mb-1">ESTIMATED TOTAL</span>
          <p className="text-lg font-black text-indigo-900">{formatCurrency(quotation.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Product Cards Layout */}
      <div className="space-y-3 mb-6">
        {quotation.items.map((item, idx) => (
          <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex justify-between items-center text-xs break-inside-avoid">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                <h4 className="text-sm font-bold text-slate-900">{item.productName}</h4>
              </div>
              {item.sku && <p className="text-[11px] text-slate-500 pl-7">Part/SKU Code: {item.sku}</p>}
            </div>

            <div className="text-right space-y-0.5">
              <p className="text-slate-600">{item.quantity} {item.unit || 'Pcs'} @ {Number(item.sellingPrice).toLocaleString()} / unit</p>
              <p className="text-sm font-black text-slate-900">{formatCurrency(item.total, currency)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">TERMS & CONDITIONS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-300 flex justify-between items-center text-sm font-black text-indigo-900">
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
            <div className="w-40 border-t border-slate-300 ml-auto pt-1 font-bold text-slate-800">
              Product Specialist
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
