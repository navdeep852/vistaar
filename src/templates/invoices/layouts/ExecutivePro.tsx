import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const ExecutivePro: React.FC<InvoiceTemplateProps> = ({
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
      {/* Dark Executive Header */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl mb-6 flex justify-between items-start break-inside-avoid shadow-lg">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="executive" />
          <h1 className="text-xl font-bold mt-2 text-amber-400">{business.businessName}</h1>
          <p className="text-xs text-slate-300 max-w-md">{[business.address, business.city, business.state].filter(Boolean).join(', ')}</p>
          <p className="text-xs text-slate-400">Ph: {business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-semibold text-amber-400/90 mt-1">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[10px] font-black uppercase rounded-full tracking-wider">
            OFFICIAL B2B INVOICE
          </span>
          <h2 className="text-2xl font-black text-white mt-2"># {invoice.invoiceNumber}</h2>
          <p className="text-xs text-slate-300">Date: {formatDate(invoice.date)}</p>
          <p className="text-xs text-slate-300">Due: {formatDate(invoice.dueDate)}</p>
          <div className="mt-2">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Recipient & Payment Box */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">CLIENT BILLING DETAILS:</span>
          <h3 className="font-bold text-slate-900 text-base">{customer?.name}</h3>
          <p className="text-slate-600 mt-0.5">{customer?.address}</p>
          <p className="text-slate-600">Phone: {customer?.phone}</p>
          {showGstin && customer?.gstin && <p className="font-semibold text-slate-800">GSTIN: {customer.gstin}</p>}
        </div>

        {showBankDetails && business.bankDetails?.accountNo && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-right">
            <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">WIRE TRANSFER / NEFT:</span>
            <p className="font-bold text-slate-900">{business.bankDetails.bankName}</p>
            <p className="text-slate-700">Account No: <strong>{business.bankDetails.accountNo}</strong></p>
            <p className="text-slate-700">IFSC Code: <strong>{business.bankDetails.ifscCode}</strong></p>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold uppercase text-[10px]">
              <th className="p-3">#</th>
              <th className="p-3">Deliverable / Product</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Rate ({currency})</th>
              <th className="p-3 text-center">Tax %</th>
              <th className="p-3 text-right">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : ''}>
                <td className="p-3 font-bold text-slate-400">{idx + 1}</td>
                <td className="p-3 font-bold text-slate-900">{item.productName}</td>
                <td className="p-3 text-center">{item.quantity}</td>
                <td className="p-3 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3 text-center">{item.taxPercent || 0}%</td>
                <td className="p-3 text-right font-bold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Financial Callout */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(invoice.terms) && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">INVOICE TERMS:</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2 text-right shadow-md">
          <div className="flex justify-between text-slate-300"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-400"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-300"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-700 flex justify-between items-center text-base font-extrabold text-amber-400">
            <span>Grand Total:</span>
            <span>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-400 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-400 font-bold border-t border-slate-800 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
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
            <div className="w-44 border-t border-slate-900 ml-auto pt-1 font-bold text-slate-900">
              Authorized Signatory
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
