import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const StudioLayout: React.FC<InvoiceTemplateProps> = ({
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
    fontFamily: `'${bodyFont}', serif`,
    color: textColor,
    backgroundColor: '#ffffff',
    width: '100%',
    padding: isPrintMode ? '12mm' : '8mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all">
      {/* Studio Header */}
      <div className="pb-6 mb-6 border-b border-slate-900 break-inside-avoid">
        <div className="flex justify-between items-start">
          <div>
            <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="minimal" />
            <h1 className="text-3xl font-normal tracking-tight text-slate-900 mt-2">{business.businessName}</h1>
            <p className="text-xs text-slate-500 font-sans">{business.address}</p>
            <p className="text-xs text-slate-500 font-sans">{business.phone} | {business.email}</p>
            {showGstin && business.gstin && <p className="text-xs text-slate-700 font-sans font-bold">GSTIN: {business.gstin}</p>}
          </div>

          <div className="text-right">
            <h2 className="text-3xl font-extralight tracking-widest text-slate-400 uppercase">INVOICE</h2>
            <p className="text-sm font-bold font-sans text-slate-900 mt-1"># {invoice.invoiceNumber}</p>
            <p className="text-xs text-slate-500 font-sans">Date: {formatDate(invoice.date)}</p>
            <p className="text-xs text-slate-500 font-sans">Due: {formatDate(invoice.dueDate)}</p>
            <div className="mt-2">
              <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
            </div>
          </div>
        </div>
      </div>

      {/* Studio Recipient */}
      <div className="mb-6 flex justify-between items-start text-xs font-sans break-inside-avoid">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">STUDIO CLIENT</span>
          <h3 className="font-bold text-slate-900 text-sm mt-0.5">{customer?.name}</h3>
          <p className="text-slate-600 max-w-xs">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">PAYABLE TOTAL</span>
          <p className="text-xl font-bold text-slate-900" style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 font-sans">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-slate-900 text-slate-900 font-black uppercase text-[10px]">
              <th className="py-2.5">#</th>
              <th className="py-2.5">Production Asset / Service</th>
              <th className="py-2.5 text-center">Qty</th>
              <th className="py-2.5 text-right">Price ({currency})</th>
              <th className="py-2.5 text-center">Tax</th>
              <th className="py-2.5 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-3 font-bold text-slate-400">{idx + 1}</td>
                <td className="py-3 font-bold text-slate-900">{item.productName}</td>
                <td className="py-3 text-center">{item.quantity}</td>
                <td className="py-3 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="py-3 text-center">{item.taxPercent || 0}%</td>
                <td className="py-3 text-right font-black text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs font-sans break-inside-avoid">
        <div>
          {showTerms && hasValue(invoice.terms) && (
            <div className="p-3 border border-slate-200 rounded-lg bg-slate-50">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">STUDIO POLICY</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-right">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-center text-sm font-black text-slate-900">
            <span>Grand Total:</span>
            <span>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-4 border-t border-slate-900 flex justify-between items-end text-xs font-sans break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-40 border-t border-slate-900 ml-auto pt-1 font-bold text-slate-900">
              Studio Principal
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
