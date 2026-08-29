import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const ExecutivePro: React.FC<QuotationTemplateProps> = ({
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
  const showNotes = customization?.showNotes ?? true;

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
      {/* Top Banner */}
      <div className="-mx-8 -mt-8 p-6 mb-6 text-white flex justify-between items-center shadow-sm" style={{ backgroundColor: primaryColor }}>
        <div className="flex items-center gap-4">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <div>
            <h1 className="text-xl font-black tracking-wide uppercase">{business.businessName}</h1>
            <p className="text-xs text-white/80">{[business.address, business.city, business.state].filter(Boolean).join(', ')}</p>
            <p className="text-xs text-white/80">Phone: {business.phone || 'N/A'} {showGstin && business.gstin ? `| GSTIN: ${business.gstin}` : ''}</p>
          </div>
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-md text-[10px] font-extrabold uppercase tracking-widest text-white">
            EXECUTIVE PROPOSAL
          </span>
          <h2 className="text-lg font-black mt-1 text-white">{quotation.quotationNumber}</h2>
          <p className="text-xs text-white/80">Date: {formatDate(quotation.date)}</p>
        </div>
      </div>

      {/* Meta Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6 break-inside-avoid">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">CLIENT INFORMATION</span>
          <h3 className="text-sm font-bold text-slate-900">{customer?.name || 'Valued Client'}</h3>
          {customer?.address && <p className="text-xs text-slate-600 mt-0.5">{customer.address}</p>}
          {customer?.phone && <p className="text-xs text-slate-600">Phone: {customer.phone}</p>}
          {customer?.email && <p className="text-xs text-slate-600">Email: {customer.email}</p>}
          {showGstin && customer?.gstin && <p className="text-xs font-semibold text-slate-700">GSTIN: {customer.gstin}</p>}
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">QUOTATION SUMMARY</span>
            <div className="text-xs space-y-1">
              <p className="text-slate-600 flex justify-between"><span>Valid Until:</span> <strong className="text-slate-900">{formatDate(quotation.validUntil)}</strong></p>
              {quotation.referenceNumber && <p className="text-slate-600 flex justify-between"><span>Ref Code:</span> <strong className="text-slate-900">{quotation.referenceNumber}</strong></p>}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between items-center text-xs font-bold text-slate-900">
            <span>Est. Grand Total:</span>
            <span className="text-sm font-black" style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-wider">
              <th className="p-3">#</th>
              <th className="p-3">Deliverable / Product</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Unit Rate ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
                <td className="p-3 text-slate-400 font-semibold">{idx + 1}</td>
                <td className="p-3 font-bold text-slate-900">
                  {item.productName}
                  {item.sku && <span className="text-[10px] text-slate-400 block font-normal">SKU: {item.sku}</span>}
                </td>
                <td className="p-3 text-center font-medium">{item.quantity} {item.unit || 'Pcs'}</td>
                <td className="p-3 text-right font-medium">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3 text-center font-medium">{item.taxPercent || 0}%</td>
                <td className="p-3 text-right font-bold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Banner & Terms */}
      <div className="grid grid-cols-12 gap-6 mb-8 break-inside-avoid">
        <div className="col-span-7 space-y-3 text-xs">
          {showNotes && hasValue(quotation.notes) && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">PROJECT NOTES</span>
              <p className="text-slate-600">{quotation.notes}</p>
            </div>
          )}
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">PROPOSAL TERMS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="col-span-5 space-y-2 text-xs">
          <div className="p-4 rounded-xl text-white shadow-md space-y-2" style={{ backgroundColor: primaryColor }}>
            <div className="flex justify-between text-white/80"><span>Subtotal:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
            {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-200"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
            <div className="flex justify-between text-white/80"><span>Tax Total:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
            <div className="pt-2 border-t border-white/20 flex justify-between items-center text-base font-black">
              <span>Grand Total:</span>
              <span>{formatCurrency(quotation.grandTotal, currency)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Signature */}
      <div className="pt-6 border-t border-slate-200 flex justify-between items-end break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-20 object-contain" style={{ transform: `scale(${branding.stampScale || 1})` }} />
        ) : <div />}

        {showSignature && (
          <div className="text-right space-y-1">
            {branding.signatureUrl && (
              <img src={branding.signatureUrl} alt="Signature" className="max-h-14 object-contain ml-auto" style={{ transform: `scale(${branding.signatureScale || 1})` }} />
            )}
            <div className="w-48 border-t border-slate-400 ml-auto pt-1">
              <p className="text-xs font-extrabold text-slate-900">Authorized Officer</p>
              <p className="text-[10px] text-slate-400">{business.businessName}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
