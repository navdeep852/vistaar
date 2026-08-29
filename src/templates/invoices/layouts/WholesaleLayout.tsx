import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const WholesaleLayout: React.FC<InvoiceTemplateProps> = ({
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
    padding: isPrintMode ? '10mm' : '6mm',
    boxSizing: 'border-box',
  };

  return (
    <div style={containerStyle} className="relative transition-all">
      {/* High Density Wholesale Header */}
      <div className="flex justify-between items-start pb-4 border-b-2 border-slate-900 mb-4 break-inside-avoid">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} />
          <h1 className="text-xl font-black text-slate-900 mt-1">{business.businessName}</h1>
          <p className="text-xs text-slate-600">{business.address}</p>
          <p className="text-xs text-slate-600 font-bold">Ph: {business.phone} | GSTIN: {business.gstin || 'N/A'}</p>
        </div>

        <div className="text-right">
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">WHOLESALE TAX INVOICE</h2>
          <p className="text-xs font-bold text-slate-800"># {invoice.invoiceNumber}</p>
          <p className="text-xs text-slate-500">Date: {formatDate(invoice.date)}</p>
          <p className="text-xs text-slate-500">Due: {formatDate(invoice.dueDate)}</p>
          <div className="mt-1">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Recipient */}
      <div className="p-2.5 bg-slate-100 border border-slate-300 rounded mb-4 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[9px] font-bold text-slate-500 block uppercase">BUYER FIRM:</span>
          <h3 className="font-bold text-slate-900">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
        </div>
        <div className="text-right">
          {showGstin && customer?.gstin && <p className="font-bold text-slate-800">BUYER GSTIN: {customer.gstin}</p>}
        </div>
      </div>

      {/* High Density Item Table */}
      <div className="mb-4 overflow-hidden border border-slate-900 rounded">
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-900 text-white font-bold uppercase text-[9px]">
              <th className="p-2 border-r border-slate-700">#</th>
              <th className="p-2 border-r border-slate-700">Code/SKU</th>
              <th className="p-2 border-r border-slate-700">Product Particulars</th>
              <th className="p-2 text-center border-r border-slate-700">Qty</th>
              <th className="p-2 text-right border-r border-slate-700">Bulk Rate ({currency})</th>
              <th className="p-2 text-center border-r border-slate-700">Tax</th>
              <th className="p-2 text-right">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : ''}>
                <td className="p-2 border-r border-slate-200 text-slate-500 font-bold">{idx + 1}</td>
                <td className="p-2 border-r border-slate-200 font-mono text-[10px]">{item.sku || 'N/A'}</td>
                <td className="p-2 border-r border-slate-200 font-bold text-slate-900">{item.productName}</td>
                <td className="p-2 text-center border-r border-slate-200 font-bold">{item.quantity} {item.unit || ''}</td>
                <td className="p-2 text-right border-r border-slate-200">{Number(item.sellingPrice).toLocaleString()}</td>
                <td className="p-2 text-center border-r border-slate-200">{item.taxPercent || 0}%</td>
                <td className="p-2 text-right font-black text-slate-900">{formatCurrency(item.total, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-xs break-inside-avoid">
        <div>
          {showTerms && hasValue(invoice.terms) && (
            <div className="p-2.5 border border-slate-300 bg-slate-50 rounded">
              <span className="text-[9px] font-bold text-slate-500 uppercase block mb-1">WHOLESALE TERMS</span>
              <p className="text-slate-700 whitespace-pre-line leading-snug">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="p-3 border-2 border-slate-900 bg-slate-50 space-y-1 text-right rounded">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-1.5 border-t border-slate-900 flex justify-between items-center text-sm font-black text-slate-900">
            <span>Net Payable:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
        </div>
      </div>

      {/* Signatures */}
      <div className="pt-2 border-t border-slate-300 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <img src={branding.stampUrl} alt="Stamp" className="max-h-12 object-contain" />
        ) : <div />}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-10 object-contain ml-auto mb-1" />}
            <div className="w-36 border-t border-slate-800 ml-auto pt-1 font-bold text-slate-900 text-[11px]">
              For {business.businessName}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
