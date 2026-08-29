import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const CompactBusiness: React.FC<InvoiceTemplateProps> = ({
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

  const containerStyle: React.CSSProperties = {
    fontFamily: `'${bodyFont}', sans-serif`,
    color: textColor,
    backgroundColor: '#ffffff',
    width: '100%',
    padding: isPrintMode ? '8mm' : '4mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all border border-slate-300 p-3">
      {/* Compact Header */}
      <div className="flex justify-between items-center pb-3 border-b border-slate-300 mb-3 break-inside-avoid">
        <div className="flex items-center gap-3">
          <LogoComponent branding={branding} businessName={business.businessName} />
          <div>
            <h1 className="text-base font-bold text-slate-900">{business.businessName}</h1>
            <p className="text-[11px] text-slate-500">{business.phone} | {business.email}</p>
            {showGstin && business.gstin && <p className="text-[11px] text-slate-700 font-semibold">GSTIN: {business.gstin}</p>}
          </div>
        </div>

        <div className="text-right">
          <h2 className="text-base font-black uppercase text-slate-900" style={{ color: primaryColor }}>INVOICE</h2>
          <p className="text-xs font-bold text-slate-800"># {invoice.invoiceNumber}</p>
          <p className="text-[11px] text-slate-500">Date: {formatDate(invoice.date)}</p>
          <div className="mt-1">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Recipient */}
      <div className="p-2 bg-slate-50 border border-slate-200 rounded mb-3 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[9px] font-bold text-slate-400 uppercase block">BILL TO</span>
          <h3 className="font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-[11px] text-slate-600">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-bold text-slate-400 uppercase block">DUE DATE</span>
          <p className="text-xs font-bold text-slate-900">{formatDate(invoice.dueDate)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-3 border border-slate-200">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-800 text-white font-bold uppercase text-[9px]">
              <th className="p-2">#</th>
              <th className="p-2">Item Description</th>
              <th className="p-2 text-center">Qty</th>
              <th className="p-2 text-right">Price ({currency})</th>
              <th className="p-2 text-center">Tax</th>
              <th className="p-2 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.items.map((item, idx) => (
              <tr key={idx}>
                <td className="p-2 text-slate-400">{idx + 1}</td>
                <td className="p-2 font-bold text-slate-900">{item.productName}</td>
                <td className="p-2 text-center">{item.quantity}</td>
                <td className="p-2 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-2 text-center">{item.taxPercent || 0}%</td>
                <td className="p-2 text-right font-black text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="flex justify-between items-start gap-4 mb-3 text-[11px] break-inside-avoid">
        <div className="flex-1 text-slate-500">
          {hasValue(invoice.terms) && <p className="italic">{invoice.terms}</p>}
        </div>

        <div className="w-56 p-2 bg-slate-50 border border-slate-300 rounded space-y-1 text-right">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-1 border-t border-slate-400 flex justify-between items-center font-black text-xs text-slate-900">
            <span>Total:</span>
            <span>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-2 border-t border-slate-200 flex justify-between items-end text-[11px] break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-10 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-8 object-contain ml-auto" />}
            <div className="w-32 border-t border-slate-400 ml-auto pt-0.5 font-bold text-slate-800 text-[10px]">
              Authorized Representative
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
