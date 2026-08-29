import React from 'react';
import { QuotationTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, hasValue } from '../helpers';

export const IndianBusinessClassic: React.FC<QuotationTemplateProps> = ({
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
    padding: isPrintMode ? '10mm' : '6mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all border border-slate-400 p-4 text-xs">
      {/* Statutory Header */}
      <div className="text-center border-b pb-3 mb-3 border-slate-300">
        <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight">{business.businessName}</h1>
        {business.legalName && <p className="text-[11px] text-slate-600 italic">({business.legalName})</p>}
        <p className="text-[11px] text-slate-600 mt-0.5">{[business.address, business.city, business.state, business.pincode].filter(Boolean).join(', ')}</p>
        <p className="text-[11px] text-slate-600">Mob: {business.phone} | Email: {business.email}</p>
        <div className="flex justify-center gap-4 text-[11px] font-bold text-slate-800 mt-1">
          {showGstin && business.gstin && <span>GSTIN: {business.gstin}</span>}
          {showPan && business.pan && <span>PAN: {business.pan}</span>}
          {business.state && <span>State: {business.state}</span>}
        </div>
      </div>

      {/* Document Title Bar */}
      <div className="bg-slate-800 text-white text-center py-1 font-bold text-xs uppercase tracking-wider mb-3">
        TAX QUOTATION / PROFORMA ESTIMATE
      </div>

      {/* Recipient & Metadata Grid */}
      <div className="grid grid-cols-2 gap-4 border border-slate-300 p-3 mb-3 bg-slate-50 break-inside-avoid">
        <div>
          <span className="text-[9px] font-bold text-slate-400 block uppercase">DETAILS OF BUYER / CONSIGNEE:</span>
          <h3 className="font-bold text-slate-900 text-sm">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
          <p className="text-slate-600">Mob: {customer?.phone || 'N/A'}</p>
          {showGstin && customer?.gstin && <p className="font-bold text-slate-800 mt-0.5">GSTIN: {customer.gstin}</p>}
        </div>

        <div className="text-right border-l border-slate-300 pl-3 space-y-1">
          <p>Quote No: <strong className="text-slate-900">{quotation.quotationNumber}</strong></p>
          <p>Quote Date: <strong>{formatDate(quotation.date)}</strong></p>
          <p>Valid Until: <strong>{formatDate(quotation.validUntil)}</strong></p>
          {quotation.referenceNumber && <p>Ref / PO #: <strong>{quotation.referenceNumber}</strong></p>}
        </div>
      </div>

      {/* GST Item Table */}
      <div className="mb-3 border border-slate-300">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-200 text-slate-800 font-bold border-b border-slate-300 text-[9px] uppercase">
              <th className="p-2 border-r border-slate-300">S.N.</th>
              <th className="p-2 border-r border-slate-300">Description of Goods / Services</th>
              <th className="p-2 border-r border-slate-300 text-center">HSN/SAC</th>
              <th className="p-2 border-r border-slate-300 text-center">Qty</th>
              <th className="p-2 border-r border-slate-300 text-right">Rate ({currency})</th>
              <th className="p-2 border-r border-slate-300 text-center">GST %</th>
              <th className="p-2 border-r border-slate-300 text-right">GST Amount</th>
              <th className="p-2 text-right">Total Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {quotation.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-2 border-r border-slate-200 text-slate-500">{idx + 1}</td>
                <td className="p-2 border-r border-slate-200 font-bold text-slate-900">{item.productName}</td>
                <td className="p-2 border-r border-slate-200 text-center font-mono text-[10px]">{item.sku || '9983'}</td>
                <td className="p-2 border-r border-slate-200 text-center">{item.quantity} {item.unit || 'Pcs'}</td>
                <td className="p-2 border-r border-slate-200 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-2 border-r border-slate-200 text-center">{item.taxPercent || 0}%</td>
                <td className="p-2 border-r border-slate-200 text-right">{formatCurrency(item.taxAmount || 0, currency)}</td>
                <td className="p-2 text-right font-bold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bank & Totals Split */}
      <div className="grid grid-cols-2 gap-4 mb-3 text-xs break-inside-avoid">
        {showBankDetails && business.bankDetails?.accountNo ? (
          <div className="border border-slate-300 p-2.5 bg-slate-50 rounded">
            <span className="text-[9px] font-bold text-slate-400 block uppercase">BANK ACCOUNT DETAILS FOR REMITTANCE:</span>
            <p className="font-bold text-slate-900">{business.bankDetails.bankName}</p>
            <p className="text-slate-700">Account No: <strong>{business.bankDetails.accountNo}</strong></p>
            <p className="text-slate-700">IFSC Code: <strong>{business.bankDetails.ifscCode}</strong></p>
            <p className="text-slate-700">Branch: {business.bankDetails.branch || 'Main Branch'}</p>
            {business.bankDetails.upiId && <p className="text-blue-700 font-bold">UPI ID: {business.bankDetails.upiId}</p>}
          </div>
        ) : <div />}

        <div className="border border-slate-300 p-2.5 bg-slate-50 rounded space-y-1 text-right">
          <p className="flex justify-between"><span>Sub Total (Excl. Tax):</span><span>{formatCurrency(quotation.subtotal, currency)}</span></p>
          {quotation.discountTotal > 0 && <p className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(quotation.discountTotal, currency)}</span></p>}
          <p className="flex justify-between"><span>Total Tax Amount (GST):</span><span>{formatCurrency(quotation.taxTotal, currency)}</span></p>
          <div className="pt-1 border-t border-slate-400 flex justify-between text-sm font-black text-slate-900">
            <span>Grand Total (Incl. Taxes):</span>
            <span style={{ color: primaryColor }}>{formatCurrency(quotation.grandTotal, currency)}</span>
          </div>
        </div>
      </div>

      {/* Terms */}
      {showTerms && hasValue(quotation.terms) && (
        <div className="border border-slate-300 p-2 mb-3 bg-slate-50 text-[10px] break-inside-avoid">
          <span className="font-bold text-slate-500 block uppercase">TERMS & CONDITIONS:</span>
          <p className="text-slate-700 whitespace-pre-line leading-relaxed">{quotation.terms}</p>
        </div>
      )}

      {/* Signatures */}
      <div className="pt-2 border-t border-slate-300 flex justify-between items-end text-[11px] break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-14 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-10 object-contain ml-auto mb-0.5" />}
            <div className="w-44 border-t border-slate-800 ml-auto pt-0.5 font-bold text-slate-900">
              For {business.businessName}
              <span className="block text-[9px] text-slate-500 font-normal">Authorized Signatory</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
