import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const ModernMinimal: React.FC<InvoiceTemplateProps> = ({
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
      {/* Minimal Header */}
      <div className="flex justify-between items-start pb-8 mb-8 border-b border-slate-100 break-inside-avoid">
        <div className="space-y-1">
          <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="minimal" />
          <h1 className="text-xl font-medium tracking-wide text-slate-900 mt-3">{business.businessName}</h1>
          <p className="text-xs text-slate-400 font-light">{business.address}</p>
          <p className="text-xs text-slate-400 font-light">{business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs text-slate-500 font-medium">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right space-y-1">
          <h2 className="text-3xl font-extralight tracking-widest text-slate-400 uppercase">INVOICE</h2>
          <p className="text-sm font-semibold text-slate-800"># {invoice.invoiceNumber}</p>
          <p className="text-xs text-slate-400">Date: {formatDate(invoice.date)}</p>
          <p className="text-xs text-slate-400">Due: {formatDate(invoice.dueDate)}</p>
          <div className="mt-2">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Minimal Recipient Details */}
      <div className="mb-8 flex justify-between items-start text-xs break-inside-avoid">
        <div>
          <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">PREPARED FOR</span>
          <h3 className="text-base font-semibold text-slate-900 mt-1">{customer?.name}</h3>
          <p className="text-slate-500 font-light max-w-xs">{customer?.address}</p>
          <p className="text-slate-500 font-light">{customer?.phone}</p>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">PAYABLE TOTAL</span>
          <p className="text-2xl font-light text-slate-900 mt-1" style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Minimal Line Table */}
      <div className="mb-8">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400 font-semibold text-[9px] tracking-widest uppercase">
              <th className="py-2">Item</th>
              <th className="py-2 text-center">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-center">Tax</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.map((item, idx) => (
              <tr key={idx}>
                <td className="py-3 font-medium text-slate-800">{item.productName}</td>
                <td className="py-3 text-center text-slate-500 font-light">{item.quantity}</td>
                <td className="py-3 text-right text-slate-500 font-light">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="py-3 text-center text-slate-500 font-light">{item.taxPercent || 0}%</td>
                <td className="py-3 text-right font-semibold text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-8 mb-8 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(invoice.terms) && (
            <div>
              <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase block mb-1">TERMS & NOTES</span>
              <p className="text-slate-500 font-light whitespace-pre-line leading-relaxed">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="space-y-2 text-right border-t border-slate-100 pt-4">
          <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-500"><span>Discount</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-400"><span>Tax</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-base font-normal text-slate-900">
            <span>Grand Total</span>
            <span style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-600 font-light pt-1"><span>Amount Paid</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-600 font-medium border-t border-slate-100 pt-1"><span>Balance Due</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-6 border-t border-slate-100 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-16 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
            <div className="w-36 border-t border-slate-300 ml-auto pt-1 text-slate-600 font-light text-[11px]">
              Authorized Representative
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
