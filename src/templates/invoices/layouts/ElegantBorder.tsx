import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const ElegantBorder: React.FC<InvoiceTemplateProps> = ({
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
    fontFamily: `'${bodyFont}', serif`,
    color: textColor,
    backgroundColor: '#ffffff',
    width: '100%',
    padding: isPrintMode ? '12mm' : '8mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all border-4 border-double border-slate-800 p-6">
      {/* Double Frame Inner */}
      <div className="border border-slate-300 p-4">
        {/* Header */}
        <div className="text-center border-b-2 border-slate-800 pb-6 mb-6">
          <LogoComponent branding={branding} businessName={business.businessName} className="justify-center mb-2" fallbackStyle="executive" />
          <h1 className="text-2xl font-bold tracking-widest text-slate-900 uppercase">{business.businessName}</h1>
          <p className="text-xs text-slate-600 mt-1 max-w-lg mx-auto">{[business.address, business.city, business.state].filter(Boolean).join(', ')}</p>
          <p className="text-xs text-slate-600">Ph: {business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-slate-800 mt-0.5">GSTIN: {business.gstin}</p>}
        </div>

        {/* Invoice Title */}
        <div className="flex justify-between items-center mb-6 text-xs border-b border-slate-200 pb-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">CUSTOMER</span>
            <h3 className="font-bold text-slate-900 text-sm mt-0.5">{customer?.name}</h3>
            <p className="text-slate-600">{customer?.address}</p>
          </div>

          <div className="text-right space-y-1">
            <h2 className="text-xl font-bold tracking-wider text-slate-900 uppercase" style={{ color: primaryColor }}>OFFICIAL INVOICE</h2>
            <p className="font-bold text-slate-800"># {invoice.invoiceNumber}</p>
            <p className="text-slate-500">Date: {formatDate(invoice.date)}</p>
            <div className="mt-1">
              <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mb-6 border border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-bold uppercase text-[10px] tracking-wider">
                <th className="p-3 border-r border-slate-700">#</th>
                <th className="p-3 border-r border-slate-700">Particulars</th>
                <th className="p-3 text-center border-r border-slate-700">Qty</th>
                <th className="p-3 text-right border-r border-slate-700">Rate ({currency})</th>
                <th className="p-3 text-center border-r border-slate-700">Tax</th>
                <th className="p-3 text-right">Amount ({currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {invoice.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="p-3 border-r border-slate-200 font-bold text-slate-500">{idx + 1}</td>
                  <td className="p-3 border-r border-slate-200 font-bold text-slate-900">{item.productName}</td>
                  <td className="p-3 text-center border-r border-slate-200">{item.quantity}</td>
                  <td className="p-3 text-right border-r border-slate-200">{Number(item.sellingPrice).toLocaleString()}</td>
                  <td className="p-3 text-center border-r border-slate-200">{item.taxPercent || 0}%</td>
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
              <div className="p-3 border border-slate-300 bg-slate-50">
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">TERMS OF SALE</span>
                <p className="text-slate-700 whitespace-pre-line leading-relaxed">{invoice.terms}</p>
              </div>
            )}
          </div>

          <div className="p-4 border border-slate-800 bg-slate-50 space-y-1.5 text-right">
            <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
            {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
            <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
            <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-center text-sm font-bold text-slate-900">
              <span>Grand Total:</span>
              <span style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</span>
            </div>
            <div className="flex justify-between text-emerald-700 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
            <div className="flex justify-between text-rose-700 font-bold border-t border-slate-300 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
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
              <div className="w-40 border-t border-slate-800 ml-auto pt-1 font-bold text-slate-900">
                Authorized Signatory
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
