import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const ClassicCorporate: React.FC<InvoiceTemplateProps> = ({
  invoice,
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
  const currency = invoice.currency || '₹';

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
    <div style={containerStyle} className="relative transition-all border-2 border-slate-300 p-4">
      {/* Header */}
      <div className="flex justify-between items-start pb-6 border-b-2 border-slate-800 mb-6">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} />
          <h1 className="text-xl font-bold mt-2 text-slate-900">{business.businessName}</h1>
          {business.legalName && <p className="text-xs text-slate-500 italic">({business.legalName})</p>}
          <p className="text-xs text-slate-600 mt-1 max-w-sm">
            {[business.address, business.city, business.state, business.pincode].filter(Boolean).join(', ')}
          </p>
          <p className="text-xs text-slate-600">Ph: {business.phone} | {business.email}</p>
          <div className="flex gap-4 text-xs font-semibold text-slate-700 mt-1">
            {showGstin && business.gstin && <span>GSTIN: {business.gstin}</span>}
            {showPan && business.pan && <span>PAN: {business.pan}</span>}
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-2xl font-black uppercase tracking-wide text-slate-900" style={{ color: primaryColor }}>
            TAX INVOICE
          </h2>
          <p className="text-sm font-bold text-slate-800 mt-1"># {invoice.invoiceNumber}</p>
          <p className="text-xs text-slate-500">Date: {formatDate(invoice.date)}</p>
          <p className="text-xs text-slate-500">Due Date: {formatDate(invoice.dueDate)}</p>
          <div className="mt-2">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Customer Info */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div className="p-3 border border-slate-200 rounded bg-slate-50">
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">BILLED TO:</span>
          <h3 className="font-bold text-slate-900 text-sm">{customer?.name}</h3>
          <p className="text-slate-600 mt-0.5">{customer?.address}</p>
          <p className="text-slate-600">Ph: {customer?.phone || 'N/A'}</p>
          {showGstin && customer?.gstin && <p className="font-semibold text-slate-700 mt-0.5">GSTIN: {customer.gstin}</p>}
        </div>

        {showBankDetails && business.bankDetails?.accountNo && (
          <div className="p-3 border border-slate-200 rounded bg-slate-50 text-right">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">REMITTANCE BANK DETAILS:</span>
            <p className="font-bold text-slate-900">{business.bankDetails.bankName}</p>
            <p className="text-slate-600">A/C: {business.bankDetails.accountNo}</p>
            <p className="text-slate-600">IFSC: {business.bankDetails.ifscCode}</p>
            {business.bankDetails.branch && <p className="text-slate-500">Branch: {business.bankDetails.branch}</p>}
          </div>
        )}
      </div>

      {/* Item Table */}
      <div className="mb-6 overflow-hidden border border-slate-300">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-bold uppercase text-[10px]">
              <th className="p-2.5">#</th>
              <th className="p-2.5">Item Description</th>
              <th className="p-2.5 text-center">Qty</th>
              <th className="p-2.5 text-right">Rate ({currency})</th>
              <th className="p-2.5 text-center">Tax %</th>
              <th className="p-2.5 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : ''}>
                <td className="p-2.5 text-slate-500">{idx + 1}</td>
                <td className="p-2.5 font-bold text-slate-900">{item.productName}</td>
                <td className="p-2.5 text-center">{item.quantity} {item.unit || ''}</td>
                <td className="p-2.5 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-2.5 text-center">{item.taxPercent || 0}%</td>
                <td className="p-2.5 text-right font-bold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals & Payment Summary */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(invoice.terms) && (
            <div className="p-3 border border-slate-200 rounded bg-slate-50">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">TERMS & CONDITIONS:</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 border border-slate-300 rounded bg-slate-50 space-y-1.5 text-right">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-300 flex justify-between items-center text-sm font-black text-slate-900">
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-4 border-t border-slate-300 flex justify-between items-end text-xs break-inside-avoid">
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
