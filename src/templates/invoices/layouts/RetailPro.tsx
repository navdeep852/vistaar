import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const RetailPro: React.FC<InvoiceTemplateProps> = ({
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
    padding: isPrintMode ? '12mm' : '8mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all">
      {/* Retail Pro Header */}
      <div className="flex justify-between items-start pb-6 mb-6 border-b-2 border-amber-500 break-inside-avoid">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} />
          <h1 className="text-2xl font-black text-amber-900 mt-2">{business.businessName}</h1>
          <p className="text-xs text-slate-600 max-w-sm">{[business.address, business.city, business.state].filter(Boolean).join(', ')}</p>
          <p className="text-xs text-slate-600">Ph: {business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-amber-800">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-amber-500 text-white font-black text-xs uppercase rounded-md tracking-wider">
            RETAIL TAX INVOICE
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-2"># {invoice.invoiceNumber}</h2>
          <p className="text-xs text-slate-500">Date: {formatDate(invoice.date)}</p>
          <p className="text-xs text-slate-500">Due: {formatDate(invoice.dueDate)}</p>
          <div className="mt-2">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Recipient Details */}
      <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200 mb-6 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[10px] font-bold text-amber-800 uppercase block">CUSTOMER DETAILS</span>
          <h3 className="font-bold text-slate-900 text-sm mt-0.5">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-amber-800 uppercase block">NET BILL AMOUNT</span>
          <p className="text-lg font-black text-amber-950" style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Retail Itemized Table with SKU Column */}
      <div className="mb-6 overflow-hidden border border-slate-300 rounded-lg">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-amber-900 text-white font-bold uppercase text-[10px]">
              <th className="p-2.5">#</th>
              <th className="p-2.5">SKU / Code</th>
              <th className="p-2.5">Product Name</th>
              <th className="p-2.5 text-center">Qty</th>
              <th className="p-2.5 text-right">Unit Rate ({currency})</th>
              <th className="p-2.5 text-center">Tax %</th>
              <th className="p-2.5 text-right">Line Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-amber-50/30' : ''}>
                <td className="p-2.5 text-slate-500 font-bold">{idx + 1}</td>
                <td className="p-2.5 font-mono text-[11px] text-amber-900 font-semibold">{item.sku || 'N/A'}</td>
                <td className="p-2.5 font-bold text-slate-900">{item.productName}</td>
                <td className="p-2.5 text-center font-bold">{item.quantity} {item.unit || ''}</td>
                <td className="p-2.5 text-right">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-2.5 text-center">{item.taxPercent || 0}%</td>
                <td className="p-2.5 text-right font-black text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase block">RETAIL SUMMARY</span>
          <p className="text-slate-600">Total Items: <strong>{invoice.items.length}</strong></p>
          <p className="text-slate-600">Total Qty: <strong>{invoice.items.reduce((acc, i) => acc + (i.quantity || 0), 0)}</strong></p>
        </div>

        <div className="p-4 rounded-lg bg-amber-50/50 border border-amber-200 space-y-1.5 text-right">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t border-amber-300 flex justify-between items-center text-sm font-black text-amber-950">
            <span>Grand Total:</span>
            <span>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-700 font-bold border-t border-amber-200 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
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
              Cashier / Manager
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
