import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const Enterprise: React.FC<QuotationTemplateProps> = ({
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
    borderTopColor: primaryColor,
  };

  return (
    <div style={containerStyle} className="relative transition-all border-t-8">
      {/* Enterprise Header */}
      <div className="flex justify-between items-start pt-2 pb-6 border-b border-slate-200 mb-6">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} />
          <h1 className="text-2xl font-black mt-2 tracking-tight text-slate-900">{business.businessName}</h1>
          <p className="text-xs text-slate-500 max-w-md">{[business.address, business.city, business.state, business.pincode].filter(Boolean).join(', ')}</p>
          <p className="text-xs text-slate-500">Contact: {business.phone} | {business.email}</p>
          <div className="flex gap-3 text-xs font-bold text-slate-700 mt-1">
            {showGstin && business.gstin && <span>GSTIN: {business.gstin}</span>}
            {showPan && business.pan && <span>PAN: {business.pan}</span>}
          </div>
        </div>

        <div className="text-right space-y-1">
          <div className="inline-block bg-slate-900 text-white font-extrabold text-xs px-4 py-1.5 rounded-md uppercase tracking-wider">
            COMMERCIAL PROPOSAL
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-2">{quotation.quotationNumber}</h2>
          <table className="text-xs text-right ml-auto mt-2 text-slate-600">
            <tbody>
              <tr><td className="pr-3 text-slate-400">Issue Date:</td><td className="font-bold text-slate-900">{formatDate(quotation.date)}</td></tr>
              <tr><td className="pr-3 text-slate-400">Validity:</td><td className="font-bold text-slate-900">{formatDate(quotation.validUntil)}</td></tr>
              {quotation.referenceNumber && <tr><td className="pr-3 text-slate-400">Ref Code:</td><td className="font-bold text-slate-900">{quotation.referenceNumber}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer & Enterprise Metadata Grid */}
      <div className="grid grid-cols-3 gap-4 mb-6 text-xs break-inside-avoid">
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">CLIENT CORPORATE ENTITY</span>
          <h3 className="font-bold text-slate-900 text-sm">{customer?.name}</h3>
          <p className="text-slate-600 mt-0.5">{customer?.address}</p>
          <p className="text-slate-600">Phone: {customer?.phone || 'N/A'}</p>
          {showGstin && customer?.gstin && <p className="font-semibold text-slate-800">GSTIN: {customer.gstin}</p>}
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">PROPOSAL METRICS</span>
          <p className="text-slate-600">Items Count: <strong className="text-slate-900">{quotation.items.length}</strong></p>
          <p className="text-slate-600">Currency: <strong className="text-slate-900">{currency} (INR)</strong></p>
          <p className="text-slate-600">Status: <strong className="text-emerald-700">Official B2B Bid</strong></p>
        </div>

        {showBankDetails && business.bankDetails?.accountNo && (
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">BANK REMITTANCE</span>
            <p className="font-bold text-slate-900">{business.bankDetails.bankName}</p>
            <p className="text-slate-600">A/C: {business.bankDetails.accountNo}</p>
            <p className="text-slate-600">IFSC: {business.bankDetails.ifscCode}</p>
          </div>
        )}
      </div>

      {/* Enterprise Items Table */}
      <div className="mb-6 overflow-hidden border border-slate-300 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-extrabold uppercase text-[10px]">
              <th className="p-3">#</th>
              <th className="p-3">Item Specification</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Unit Rate ({currency})</th>
              <th className="p-3 text-center">Tax %</th>
              <th className="p-3 text-right">Net Amount ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/60' : ''}>
                <td className="p-3 text-slate-400 font-bold">{idx + 1}</td>
                <td className="p-3 font-bold text-slate-900">
                  {item.productName}
                  {item.sku && <span className="text-[10px] text-slate-500 font-normal block">Part #: {item.sku}</span>}
                </td>
                <td className="p-3 text-center">{item.quantity} {item.unit || 'Units'}</td>
                <td className="p-3 text-right font-semibold">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3 text-center">{item.taxPercent || 0}%</td>
                <td className="p-3 text-right font-extrabold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Breakdown */}
      <div className="flex justify-between items-start gap-6 mb-8 break-inside-avoid">
        <div className="flex-1 space-y-3 text-xs">
          {showNotes && hasValue(quotation.notes) && (
            <div className="p-3 border border-slate-200 rounded-xl bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 block mb-1">NOTES / REVISION HISTORY</span>
              <p className="text-slate-600">{quotation.notes}</p>
            </div>
          )}
          {showTerms && hasValue(quotation.terms) && (
            <div className="p-3 border border-slate-200 rounded-xl bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 block mb-1">ENTERPRISE TERMS & CONDITIONS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="w-72 border border-slate-300 rounded-xl p-4 bg-slate-50 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600"><span>Subtotal Excl. Tax:</span><span>{formatCurrency(quotation.subtotal, currency)}</span></div>
          {quotation.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Total Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Applicable Tax:</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-center text-sm font-black text-slate-900">
            <span>Total Payable:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Formal Signatures */}
      <div className="pt-6 border-t border-slate-200 flex justify-between items-end break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-20 object-contain" style={{ transform: `scale(${branding.stampScale || 1})` }} />
        ) : <div />}

        {showSignature && (
          <div className="text-right space-y-1">
            {branding.signatureUrl && (
              <img src={branding.signatureUrl} alt="Signature" className="max-h-14 object-contain ml-auto" style={{ transform: `scale(${branding.signatureScale || 1})` }} />
            )}
            <div className="w-52 border-t border-slate-900 ml-auto pt-1 text-center">
              <p className="text-xs font-bold text-slate-900">Commercial Operations Manager</p>
              <p className="text-[10px] text-slate-500">{business.businessName}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
