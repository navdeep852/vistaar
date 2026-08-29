import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const ConstructionLayout: React.FC<InvoiceTemplateProps> = ({
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
      {/* Heavy Construction Header */}
      <div className="bg-amber-500 text-slate-950 p-6 rounded-2xl mb-6 flex justify-between items-start break-inside-avoid shadow-sm">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          <h1 className="text-2xl font-black mt-2">{business.businessName}</h1>
          <p className="text-xs font-semibold">{business.address}</p>
          <p className="text-xs font-semibold">Ph: {business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-black mt-1">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-slate-950 text-amber-400 font-black text-xs uppercase rounded tracking-wider">
            CONSTRUCTION BILLING
          </span>
          <h2 className="text-2xl font-black text-slate-950 mt-2"># {invoice.invoiceNumber}</h2>
          <p className="text-xs font-bold text-slate-900">Date: {formatDate(invoice.date)}</p>
          <p className="text-xs font-bold text-slate-900">Due: {formatDate(invoice.dueDate)}</p>
          <div className="mt-2">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Recipient */}
      <div className="p-4 rounded-xl border-2 border-amber-500 bg-amber-50/30 mb-6 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[10px] font-black text-amber-900 uppercase block">PROJECT OWNER / DEVELOPER</span>
          <h3 className="font-black text-slate-900 text-sm mt-0.5">{customer?.name}</h3>
          <p className="text-slate-700 font-medium">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black text-amber-900 uppercase block">CLAIMED AMOUNT</span>
          <p className="text-xl font-black text-slate-950">{formatCurrency(invoice.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 rounded-xl border-2 border-slate-900 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-950 text-amber-400 font-black uppercase text-[10px]">
              <th className="p-3">#</th>
              <th className="p-3">Construction Activity / Material</th>
              <th className="p-3 text-center">Qty / SqFt</th>
              <th className="p-3 text-right">Unit Rate ({currency})</th>
              <th className="p-3 text-center">Tax %</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-slate-100">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-amber-50/20' : ''}>
                <td className="p-3 font-black text-amber-700">{idx + 1}</td>
                <td className="p-3 font-black text-slate-900">{item.productName}</td>
                <td className="p-3 text-center font-bold">{item.quantity} {item.unit || ''}</td>
                <td className="p-3 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-3 text-center">{item.taxPercent || 0}%</td>
                <td className="p-3 text-right font-black text-slate-950">{formatCurrency(item.total, currency)}</td>
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
              <span className="text-[10px] font-black uppercase text-slate-500 block mb-1">CONSTRUCTION TERMS</span>
              <p className="text-slate-700 font-semibold whitespace-pre-line leading-relaxed">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-950 text-white space-y-1.5 text-right shadow-md">
          <div className="flex justify-between text-slate-300"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-400"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-300"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-700 flex justify-between items-center text-sm font-black text-amber-400">
            <span>Grand Total:</span>
            <span>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-400 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-400 font-bold border-t border-slate-800 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
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
            <div className="w-44 border-t-2 border-slate-950 ml-auto pt-1 font-black text-slate-950">
              Chief Project Engineer
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
