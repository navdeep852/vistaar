import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const ContractorLayout: React.FC<InvoiceTemplateProps> = ({
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
      {/* Contractor Top Header */}
      <div className="flex justify-between items-start pb-6 mb-6 border-b-2 border-slate-800 break-inside-avoid">
        <div>
          <LogoComponent branding={branding} businessName={business.businessName} />
          <h1 className="text-xl font-black text-slate-900 mt-2">{business.businessName}</h1>
          <p className="text-xs text-slate-600">{business.address}</p>
          <p className="text-xs text-slate-600">Ph: {business.phone} | {business.email}</p>
          {showGstin && business.gstin && <p className="text-xs font-bold text-slate-800">GSTIN: {business.gstin}</p>}
        </div>

        <div className="text-right">
          <span className="px-3 py-1 bg-slate-900 text-white font-black text-xs uppercase rounded tracking-wider">
            CONTRACTOR TAX INVOICE
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-2"># {invoice.invoiceNumber}</h2>
          <p className="text-xs text-slate-500">Date: {formatDate(invoice.date)}</p>
          <p className="text-xs text-slate-500">Due: {formatDate(invoice.dueDate)}</p>
          <div className="mt-2">
            <PaymentStatusBadge status={invoice.paymentStatus} paidAmount={invoice.paidAmount} grandTotal={invoice.grandTotal} />
          </div>
        </div>
      </div>

      {/* Site / Project Info */}
      <div className="p-4 rounded-xl border border-slate-300 bg-slate-50 mb-6 flex justify-between items-center text-xs break-inside-avoid">
        <div>
          <span className="text-[10px] font-bold text-slate-500 uppercase block">PROJECT CLIENT / OWNER</span>
          <h3 className="font-bold text-slate-900 text-sm mt-0.5">{customer?.name}</h3>
          <p className="text-slate-600">{customer?.address}</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-bold text-slate-500 uppercase block">CONTRACT VALUE</span>
          <p className="text-xl font-black text-slate-900" style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="mb-6 rounded-xl border border-slate-300 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-bold uppercase text-[10px]">
              <th className="p-3">#</th>
              <th className="p-3">Work Package / Materials</th>
              <th className="p-3 text-center">Qty</th>
              <th className="p-3 text-right">Contract Rate ({currency})</th>
              <th className="p-3 text-center">Tax</th>
              <th className="p-3 text-right">Total ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : ''}>
                <td className="p-3 font-bold text-slate-500">{idx + 1}</td>
                <td className="p-3 font-bold text-slate-900">{item.productName}</td>
                <td className="p-3 text-center">{item.quantity} {item.unit || ''}</td>
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
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-300">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">CONTRACT CONDITIONS</span>
              <p className="text-slate-600 whitespace-pre-line leading-relaxed">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border-2 border-slate-900 space-y-1.5 text-right">
          <div className="flex justify-between text-slate-600"><span>Subtotal:</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-600"><span>Tax Total:</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-center text-sm font-black text-slate-900">
            <span>Grand Total:</span>
            <span>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-700 font-bold border-t border-slate-300 pt-1"><span>Balance Due:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
        </div>
      </div>

      {/* Dual Contractor & Client Signatures */}
      <div className="pt-6 border-t border-slate-300 grid grid-cols-2 gap-6 text-xs break-inside-avoid">
        <div className="text-left">
          <div className="w-40 border-t border-slate-400 pt-1 font-bold text-slate-700">
            Client / Site Supervisor
          </div>
        </div>

        <div className="text-right">
          {branding.signatureUrl && <img src={branding.signatureUrl} alt="Signature" className="max-h-12 object-contain ml-auto mb-1" />}
          <div className="w-40 border-t border-slate-900 ml-auto pt-1 font-bold text-slate-900">
            Authorized Contractor
          </div>
        </div>
      </div>
    </div>
  );
};
