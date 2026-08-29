import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';

export const IndianBusinessClassic: React.FC<InvoiceTemplateProps> = ({
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
  const showPan = customization?.showPan ?? true;
  const showBankDetails = customization?.showBankDetails ?? true;
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
    <div style={containerStyle} className="relative transition-all border-2 border-slate-900 p-4">
      {/* Traditional Indian Business Header */}
      <div className="text-center border-b-2 border-slate-900 pb-4 mb-4 break-inside-avoid">
        <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-1">|| SHREE GANESHAY NAMAH ||</p>
        <LogoComponent branding={branding} businessName={business.businessName} className="justify-center mb-1" fallbackStyle="badge" />
        <h1 className="text-2xl font-black text-slate-900 uppercase">{business.businessName}</h1>
        <p className="text-xs text-slate-600">{[business.address, business.city, business.state, business.pincode].filter(Boolean).join(', ')}</p>
        <p className="text-xs text-slate-600 font-bold">Ph: {business.phone} | Email: {business.email}</p>
        
        <div className="flex justify-center gap-4 text-xs font-black text-slate-800 mt-1">
          {showGstin && business.gstin && <span className="bg-slate-100 px-2 py-0.5 border border-slate-300 rounded">GSTIN: {business.gstin}</span>}
          {showPan && business.pan && <span className="bg-slate-100 px-2 py-0.5 border border-slate-300 rounded">PAN: {business.pan}</span>}
        </div>
      </div>

      {/* Tax Invoice Banner & Number */}
      <div className="flex justify-between items-center bg-slate-900 text-white p-2 rounded mb-4 text-xs font-bold break-inside-avoid">
        <span>TAX INVOICE / BILL OF SUPPLY</span>
        <span>INVOICE NO: #{invoice.invoiceNumber}</span>
        <span>DATE: {formatDate(invoice.date)}</span>
      </div>

      {/* Details Box */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-xs break-inside-avoid">
        <div className="p-3 border border-slate-900 rounded bg-slate-50">
          <span className="text-[10px] font-bold text-slate-500 block uppercase">DETAILS OF BUYER / PARTY:</span>
          <h3 className="font-bold text-slate-900 text-sm mt-0.5">{customer?.name}</h3>
          <p className="text-slate-700">{customer?.address}</p>
          <p className="text-slate-700 font-bold">Ph: {customer?.phone}</p>
          {showGstin && customer?.gstin && <p className="font-black text-slate-900">BUYER GSTIN: {customer.gstin}</p>}
        </div>

        {showBankDetails && business.bankDetails?.accountNo && (
          <div className="p-3 border border-slate-900 rounded bg-slate-50 text-right">
            <span className="text-[10px] font-bold text-slate-500 block uppercase">BANK ACCOUNT FOR RTGS / NEFT:</span>
            <p className="font-bold text-slate-900">{business.bankDetails.bankName}</p>
            <p className="text-slate-700">A/C NO: <strong>{business.bankDetails.accountNo}</strong></p>
            <p className="text-slate-700">IFSC CODE: <strong>{business.bankDetails.ifscCode}</strong></p>
            {business.bankDetails.branch && <p className="text-slate-700">BRANCH: {business.bankDetails.branch}</p>}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="mb-4 border border-slate-900 rounded overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-900 text-white font-bold uppercase text-[10px]">
              <th className="p-2 border-r border-slate-700">S.N.</th>
              <th className="p-2 border-r border-slate-700">HSN/SAC</th>
              <th className="p-2 border-r border-slate-700">Description of Goods / Services</th>
              <th className="p-2 text-center border-r border-slate-700">Qty</th>
              <th className="p-2 text-right border-r border-slate-700">Rate ({currency})</th>
              <th className="p-2 text-center border-r border-slate-700">GST %</th>
              <th className="p-2 text-right">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {invoice.items.map((item, idx) => (
              <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50' : ''}>
                <td className="p-2 border-r border-slate-200 font-bold text-slate-500">{idx + 1}</td>
                <td className="p-2 border-r border-slate-200 font-mono text-[11px]">{(item as any).hsnCode || item.sku || '-'}</td>
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
            <div className="p-3 border border-slate-300 bg-slate-50 rounded">
              <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">TERMS & CONDITIONS:</span>
              <p className="text-slate-700 whitespace-pre-line leading-relaxed text-[11px]">{invoice.terms}</p>
            </div>
          )}
        </div>

        <div className="p-3 border-2 border-slate-900 bg-slate-50 space-y-1 text-right rounded">
          <div className="flex justify-between text-slate-700"><span>Sub Total (Before Tax):</span><span>{formatCurrency(invoice.subtotal, currency)}</span></div>
          {invoice.discountTotal > 0 && <div className="flex justify-between text-rose-600 font-bold"><span>Total Discount:</span><span>- {formatCurrency(invoice.discountTotal, currency)}</span></div>}
          <div className="flex justify-between text-slate-700"><span>Total Tax (CGST+SGST/IGST):</span><span>{formatCurrency(invoice.taxTotal, currency)}</span></div>
          <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-center text-sm font-black text-slate-900">
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }}>{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-700 font-semibold pt-1"><span>Amount Paid:</span><span>{formatCurrency(invoice.paidAmount, currency)}</span></div>
          <div className="flex justify-between text-rose-700 font-bold border-t border-slate-300 pt-1"><span>Balance Amount Payable:</span><span>{formatCurrency(invoice.balanceAmount, currency)}</span></div>
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
            <div className="w-48 border-t border-slate-900 ml-auto pt-1 font-bold text-slate-900">
              For {business.businessName}
              <p className="text-[10px] text-slate-500 font-normal">Authorized Signatory</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
