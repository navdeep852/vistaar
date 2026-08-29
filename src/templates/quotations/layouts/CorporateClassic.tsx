import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const CorporateClassic: React.FC<QuotationTemplateProps> = ({
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
      {/* Header Section */}
      <div className="flex flex-row justify-between items-start border-b-2 pb-6 mb-6" style={{ borderColor: primaryColor }}>
        <div className="space-y-2 max-w-sm">
          <LogoComponent branding={branding} businessName={business.businessName} />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight" style={{ color: primaryColor }}>
              {business.businessName}
            </h1>
            {business.legalName && business.legalName !== business.businessName && (
              <p className="text-xs text-slate-500 italic">{business.legalName}</p>
            )}
            <p className="text-xs text-slate-600 mt-1">
              {[business.address, business.city, business.state, business.pincode ? `- ${business.pincode}` : ''].filter(Boolean).join(', ')}
            </p>
            <div className="text-xs text-slate-500 mt-0.5 space-x-2">
              {business.phone && <span>Phone: {business.phone}</span>}
              {business.email && <span>Email: {business.email}</span>}
            </div>
            <div className="text-xs font-semibold text-slate-700 mt-1 flex flex-wrap gap-2">
              {showGstin && business.gstin && <span>GSTIN: {business.gstin}</span>}
              {showPan && business.pan && <span>PAN: {business.pan}</span>}
            </div>
          </div>
        </div>

        <div className="text-right space-y-1">
          <span className="px-3 py-1 text-xs font-extrabold uppercase rounded-full text-white tracking-wide" style={{ backgroundColor: primaryColor }}>
            QUOTATION
          </span>
          <h2 className="text-lg font-bold text-slate-900 mt-2">{quotation.quotationNumber}</h2>
          <p className="text-xs text-slate-500">Date: <strong className="text-slate-800">{formatDate(quotation.date)}</strong></p>
          <p className="text-xs text-slate-500">Valid Until: <strong className="text-slate-800">{formatDate(quotation.validUntil)}</strong></p>
          {quotation.referenceNumber && (
            <p className="text-xs text-slate-500">Ref #: <span className="font-semibold text-slate-700">{quotation.referenceNumber}</span></p>
          )}
        </div>
      </div>

      {/* Customer Info Card */}
      {customer && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-6 flex justify-between gap-4 break-inside-avoid">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">PREPARED FOR</span>
            <h3 className="text-sm font-bold text-slate-900">{customer.name}</h3>
            {customer.address && <p className="text-xs text-slate-600">{customer.address}{customer.city ? `, ${customer.city}` : ''}</p>}
            {customer.phone && <p className="text-xs text-slate-600">Phone: {customer.phone}</p>}
            {customer.email && <p className="text-xs text-slate-600">Email: {customer.email}</p>}
            {showGstin && customer.gstin && <p className="text-xs font-semibold text-slate-700">GSTIN: {customer.gstin}</p>}
          </div>

          {showBankDetails && business.bankDetails?.accountNo && (
            <div className="text-right border-l border-slate-200 pl-4 space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">BANK DETAILS</span>
              <p className="text-xs font-bold text-slate-800">{business.bankDetails.bankName}</p>
              <p className="text-xs text-slate-600">A/C: {business.bankDetails.accountNo}</p>
              <p className="text-xs text-slate-600">IFSC: {business.bankDetails.ifscCode}</p>
              {business.bankDetails.upiId && <p className="text-xs font-semibold text-blue-600">UPI: {business.bankDetails.upiId}</p>}
            </div>
          )}
        </div>
      )}

      {/* Line Items Table */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="text-white text-[10px] font-extrabold uppercase tracking-wider" style={{ backgroundColor: primaryColor }}>
              <th className="p-3">#</th>
              <th className="p-3">Item / Service Description</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Rate ({currency})</th>
              <th className="p-3 text-center">Tax %</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quotation.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/60' : ''}>
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

      {/* Totals & Notes Section */}
      <div className="flex flex-row justify-between items-start gap-6 mb-8 break-inside-avoid">
        <div className="flex-1 space-y-3 text-xs">
          {showNotes && hasValue(quotation.notes) && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">NOTES</span>
              <p className="text-slate-600">{quotation.notes}</p>
            </div>
          )}
          {showTerms && hasValue(quotation.terms) && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">TERMS & CONDITIONS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
            </div>
          )}
        </div>

        <div className="w-64 space-y-2 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-semibold">{formatCurrency(quotation.subtotal, currency)}</span>
          </div>
          {quotation.discountTotal > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Discount:</span>
              <span className="font-semibold">- {formatCurrency(quotation.discountTotal, currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>Tax Amount:</span>
            <span className="font-semibold">{formatCurrency(quotation.taxTotal, currency)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-200 text-sm font-extrabold" style={{ color: primaryColor }}>
            <span>Grand Total:</span>
            <span>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Signature & Stamp Block */}
      <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between items-end break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-20 object-contain" style={{ transform: `scale(${branding.stampScale || 1})` }} />
        ) : (
          <div />
        )}

        {showSignature && (
          <div className="text-right space-y-1">
            {branding.signatureUrl && (
              <img src={branding.signatureUrl} alt="Signature" className="max-h-14 object-contain ml-auto" style={{ transform: `scale(${branding.signatureScale || 1})` }} />
            )}
            <div className="w-44 border-t border-slate-300 ml-auto pt-1">
              <p className="text-xs font-bold text-slate-900">Authorized Signatory</p>
              <p className="text-[10px] text-slate-400">{business.businessName}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {quotation.footerText && (
        <p className="mt-6 text-center text-[10px] text-slate-400 border-t pt-3 border-slate-100">{quotation.footerText}</p>
      )}
    </div>
  );
};
