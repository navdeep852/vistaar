import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const CreativeAgency: React.FC<InvoiceTemplateProps> = ({
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
  };

  return (
    <div style={containerStyle} className="relative transition-all">
      {/* Creative Gradient Header */}
      <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white p-6 rounded-2xl mb-6 flex justify-between items-start break-inside-avoid shadow-md">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <h1 className="text-xl font-bold mt-2">{business.businessName}</h1>
          <p className="text-xs text-purple-200">{business.address}</p>
          <p className="text-xs text-purple-200">{business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-semibold text-purple-300 mt-1">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-white/20 text-white text-[10px] font-black uppercase rounded-full tracking-wider">
            CREATIVE AGENCY INVOICE
          </span>
          <h2 className="text-2xl font-black text-white mt-2"># {invoice.invoiceNumber}</h2>
          <p className="text-xs text-purple-200">Date: {formatDate(invoice.date)}</p>
          <p className="text-xs text-purple-200">Due: {formatDate(invoice.dueDate)}</p>
          <div className="mt-2">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Recipient Details */}
      <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-100 mb-6 flex justify-between items-center break-inside-avoid text-xs">
        <div>
          <span className="text-[10px] font-bold uppercase text-purple-700 block">CLIENT DELIVERABLE RECEIVER</span>
          <h3 className="font-bold text-slate-900 text-sm mt-0.5">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
          <p className="text-slate-600">Ph: {customer?.phone}</p>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-bold uppercase text-purple-700 block">INVOICED TOTAL</span>
          <p className="text-xl font-black text-purple-900" style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 overflow-hidden rounded-xl border border-purple-100 shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-purple-950 text-purple-300 font-bold uppercase text-[10px]">
              <th className="p-3">#</th>
              <th className="p-3">Creative Service / Asset</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Rate ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-50">
            {invoice.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-3 font-bold text-purple-600">{idx + 1}</td>
                <td className="p-3 font-bold text-slate-900">{item.productName}</td>
                <td className="p-3 text-center">{item.quantity}</td>
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
            <div className="p-4 rounded-xl bg-purple-50/40 border border-purple-100">
              <span className="text-[10px] font-bold text-purple-700 uppercase block mb-1">AGENCY TERMS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-900 text-white space-y-1.5 text-right shadow-md">
          <div className="flex justify-between text-slate-300"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-400"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-300"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-700 flex justify-between items-center text-sm font-black text-purple-400">
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
            <div className="w-40 border-t border-slate-300 ml-auto pt-1 font-bold text-slate-800">
              Creative Director
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
