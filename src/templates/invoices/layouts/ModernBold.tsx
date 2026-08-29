import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const ModernBold: React.FC<InvoiceTemplateProps> = ({
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
    borderTopColor: primaryColor,
  };

  return (
    <div style={containerStyle} className="relative transition-all border-t-8">
      {/* Bold Header */}
      <div className="flex justify-between items-start pt-2 pb-6 border-b-2 border-slate-900 mb-6">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} />
          <h1 className="text-2xl font-black tracking-tight text-slate-900 mt-2">{business.businessName}</h1>
          <p className="text-xs text-slate-600 max-w-sm">{[business.address, business.city, business.state].filter(Boolean).join(', ')}</p>
          <p className="text-xs text-slate-600">Ph: {business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-black text-indigo-700 mt-0.5">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <h2 className="text-4xl font-black tracking-tight text-slate-900 uppercase">INVOICE</h2>
          <p className="text-base font-extrabold text-indigo-600 mt-1"># {invoice.invoiceNumber}</p>
          <p className="text-xs text-slate-500">Date: {formatDate(invoice.date)}</p>
          <p className="text-xs text-slate-500">Due: {formatDate(invoice.dueDate)}</p>
          <div className="mt-2">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Recipient Details */}
      <div className="p-4 rounded-xl bg-slate-900 text-white mb-6 flex justify-between items-center break-inside-avoid">
        <div>
          <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">BILLED TO</span>
          <h3 className="text-base font-bold mt-0.5">{customer?.name}</h3>
          <p className="text-xs text-slate-300">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">TOTAL INVOICED</span>
          <p className="text-xl font-black text-white">{formatCurrency(invoice.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden border-2 border-slate-900">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-black uppercase text-[10px]">
              <th className="p-3">#</th>
              <th className="p-3">Item Description</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Price ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-slate-100">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : ''}>
                <td className="p-3 font-black text-slate-400">{idx + 1}</td>
                <td className="p-3 font-extrabold text-slate-900">{item.productName}</td>
                <td className="p-3 text-center font-bold">{item.quantity}</td>
                <td className="p-3 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3 text-center">{item.taxPercent || 0}%</td>
                <td className="p-3 text-right font-black text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(invoice.terms) && (
            <div className="p-4 rounded-xl bg-slate-50 border-2 border-slate-200">
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">TERMS & CONDITIONS</span>
              <p className="text-slate-700 font-medium whitespace-pre-line leading-relaxed">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border-2 border-slate-900 space-y-1.5 text-right">
          <div className="flex justify-between text-slate-600 font-semibold"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-600 font-bold"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600 font-semibold"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-center text-base font-black text-slate-900">
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-bold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-700 font-black border-t-2 border-slate-200 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-4 border-t-2 border-slate-900 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t-2 border-slate-900 ml-auto pt-1 font-black text-slate-900">
              Authorized Signatory
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
