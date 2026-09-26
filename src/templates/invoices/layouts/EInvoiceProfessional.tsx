import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, formatFullAddress, LogoComponent, PaymentStatusBadge, hasValue } from '../helpers';
import { DocumentPaymentQr } from '../../../components/DocumentPaymentQr';

export const EInvoiceProfessional: React.FC<InvoiceTemplateProps> = ({
  invoice,
  business,
  customer,
  branding,
  theme,
  customization,
  isPrintMode = false,
}) => {
  const primaryColor = customization?.primaryColor || theme.primaryColor || '#1e3a8a';
  const textColor = customization?.textColor || theme.textColor || '#0f172a';
  const bodyFont = customization?.bodyFont || theme.fontFamily || 'Inter';
  const currency = invoice.currency || '₹';

  const showGstin = customization?.showGstin ?? true;
  const showPan = customization?.showPan ?? true;
  const showBankDetails = customization?.showBankDetails ?? true;
  const showUpiId = customization?.showUpi ?? true;
  const showQrCode = Boolean(customization?.showQrCode ?? customization?.showUpiQr ?? false);
  const showSignature = customization?.showSignature ?? true;
  const showStamp = customization?.showStamp ?? true;
  const showTerms = customization?.showTerms ?? true;
  const showNotes = customization?.showNotes ?? true;
  const showDueDate = customization?.showDueDate ?? true;

  const fullBusinessAddress = formatFullAddress(
    business.address,
    business.addressLine2,
    business.city,
    business.state,
    business.pincode
  );

  const fullCustomerAddress = formatFullAddress(
    customer?.address,
    undefined,
    customer?.city,
    customer?.state,
    customer?.pincode
  );

  const bank = business.bankDetails || {};
  const hasBankData = Boolean(bank.bankName || bank.accountNo || bank.ifscCode || bank.upiId);
  const upiQrUrl = bank.upiQrCodeUrl || business.upiQrCodeUrl;

  const containerStyle: React.CSSProperties = {
    fontFamily: `'${bodyFont}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
    color: textColor,
    backgroundColor: '#ffffff',
    width: '100%',
    padding: isPrintMode ? '12mm' : '8mm',
    boxSizing: 'border-box',
  };

  const anyItemHasDiscount = (invoice.items || []).some((item) => Number(item.discountAmount || 0) > 0);
  const anyItemHasSku = (invoice.items || []).some((item) => Boolean(item.sku || (item as any).partNumber));

  return (
    <div style={containerStyle} className="relative transition-all bg-white border border-slate-200 shadow-sm print:border-none print:shadow-none p-6 text-slate-800">
      {/* Top Header Row */}
      <div className="flex justify-between items-start pb-6 border-b border-slate-200 mb-6 gap-6 break-inside-avoid">
        {/* Business Identity */}
        <div className="flex-1 max-w-[60%]">
          <div className="mb-3">
            <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="badge" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-snug">
            {business.businessName}
          </h1>
          {business.legalName && business.legalName !== business.businessName && (
            <p className="text-xs text-slate-500 font-medium">({business.legalName})</p>
          )}

          {fullBusinessAddress && (
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed max-w-md">
              {fullBusinessAddress}
            </p>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600 mt-1">
            {business.phone && <span><strong className="text-slate-700">Phone:</strong> {business.phone}</span>}
            {business.email && <span><strong className="text-slate-700">Email:</strong> {business.email}</span>}
            {business.website && <span><strong className="text-slate-700">Web:</strong> {business.website}</span>}
          </div>

          <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-700 mt-2">
            {showGstin && business.gstin && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200/80 text-[11px]">
                <strong className="mr-1">GSTIN:</strong> {business.gstin}
              </span>
            )}
            {showPan && business.pan && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 text-[11px]">
                <strong className="mr-1">PAN:</strong> {business.pan}
              </span>
            )}
          </div>
        </div>

        {/* Invoice Metadata Block */}
        <div className="text-right flex flex-col items-end">
          <div
            className="text-2xl font-black uppercase tracking-wider mb-2"
            style={{ color: primaryColor }}
          >
            TAX INVOICE
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5 min-w-[210px] text-right">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 font-medium">Invoice No:</span>
              <span className="font-bold text-slate-900">#{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 font-medium">Invoice Date:</span>
              <span className="font-semibold text-slate-800">{formatDate(invoice.date)}</span>
            </div>
            {showDueDate && invoice.dueDate && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 font-medium">Due Date:</span>
                <span className="font-semibold text-slate-800">{formatDate(invoice.dueDate)}</span>
              </div>
            )}
            {invoice.referenceNumber && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 font-medium">Ref / PO #:</span>
                <span className="font-semibold text-slate-800">{invoice.referenceNumber}</span>
              </div>
            )}
          </div>

          <div className="mt-2.5">
            <PaymentStatusBadge
              status={invoice.paymentStatus}
              paidAmount={invoice.paidAmount}
              grandTotal={invoice.grandTotal}
            />
          </div>
        </div>
      </div>

      {/* Client Billing / Shipping Info Block */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-xs break-inside-avoid">
        {/* Billed To */}
        <div className="p-3.5 border border-slate-200 rounded-lg bg-slate-50/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            BILLED TO:
          </span>
          <h2 className="font-bold text-slate-900 text-sm">{customer?.name || 'Valued Customer'}</h2>
          {fullCustomerAddress && (
            <p className="text-slate-600 mt-1 leading-relaxed">{fullCustomerAddress}</p>
          )}
          <div className="mt-1.5 space-y-0.5 text-slate-600">
            {customer?.phone && <p><strong>Phone:</strong> {customer.phone}</p>}
            {customer?.email && <p><strong>Email:</strong> {customer.email}</p>}
            {showGstin && customer?.gstin && (
              <p className="font-bold text-slate-800 mt-1">
                <span className="text-slate-500">GSTIN:</span> {customer.gstin}
              </p>
            )}
          </div>
        </div>

        {/* Place of Supply / Shipping Details / Order Context */}
        <div className="p-3.5 border border-slate-200 rounded-lg bg-slate-50/50 flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              DISPATCH & SUPPLY DETAILS:
            </span>
            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-500">Place of Supply:</span>
                <span className="font-semibold text-slate-800">
                  {customer?.state || business.state || 'Intra-State'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Supply Type:</span>
                <span className="font-semibold text-slate-800">
                  {customer?.gstin ? 'B2B Regular Taxable' : 'B2C Retail Supply'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reverse Charge:</span>
                <span className="font-semibold text-slate-800">No</span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 italic mt-2 border-t border-slate-200 pt-1.5">
            Issued under eInvoice electronic documentation standards.
          </p>
        </div>
      </div>

      {/* Line Item Table */}
      <div className="mb-6 border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr
              className="text-white font-bold uppercase text-[10px] tracking-wider"
              style={{ backgroundColor: primaryColor }}
            >
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              {anyItemHasSku && <th className="py-2.5 px-3 w-28">Part / SKU</th>}
              <th className="py-2.5 px-3">Item Description</th>
              <th className="py-2.5 px-3 text-center w-20">Qty</th>
              <th className="py-2.5 px-3 text-right w-24">Rate ({currency})</th>
              {anyItemHasDiscount && <th className="py-2.5 px-3 text-right w-20">Discount</th>}
              <th className="py-2.5 px-3 text-center w-16">Tax %</th>
              <th className="py-2.5 px-3 text-right w-28">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {invoice.items.map((item, idx) => (
              <tr key={item.id || idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                <td className="py-2.5 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                {anyItemHasSku && (
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                    {item.sku || (item as any).partNumber || '-'}
                  </td>
                )}
                <td className="py-2.5 px-3">
                  <div className="font-bold text-slate-900">{item.productName}</div>
                  {(item as any).description && (
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {(item as any).description}
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center text-slate-700 whitespace-nowrap">
                  <span className="font-semibold">{item.quantity}</span>{' '}
                  <span className="text-[11px] text-slate-500">{item.unit || 'Pcs'}</span>
                </td>
                <td className="py-2.5 px-3 text-right text-slate-700 font-medium">
                  {Number(item.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                {anyItemHasDiscount && (
                  <td className="py-2.5 px-3 text-right text-rose-600 font-medium">
                    {Number(item.discountAmount || 0) > 0 ? formatCurrency(item.discountAmount, currency) : '-'}
                  </td>
                )}
                <td className="py-2.5 px-3 text-center text-slate-600 font-medium">
                  {item.taxPercent || 0}%
                </td>
                <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                  {formatCurrency(item.total, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Middle Financial Summary & Payment Preferences Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        {/* Left Column: Dedicated Payment Preferences & UPI QR Code */}
        <div className="space-y-4">
          {showBankDetails && hasBankData && (
            <div className="p-3.5 border border-slate-200 rounded-lg bg-slate-50/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                PAYMENT PREFERENCES & REMITTANCE
              </span>

              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
                <div className="space-y-1 text-slate-700 flex-1">
                  {bank.bankName && <p><strong>Bank Name:</strong> {bank.bankName}</p>}
                  {bank.accountHolder && <p><strong>A/C Holder:</strong> {bank.accountHolder}</p>}
                  {bank.accountNo && (
                    <p>
                      <strong>Account No:</strong> <span className="font-mono font-bold text-slate-900">{bank.accountNo}</span>
                    </p>
                  )}
                  {bank.ifscCode && (
                    <p>
                      <strong>IFSC Code:</strong> <span className="font-mono font-bold text-slate-900">{bank.ifscCode}</span>
                    </p>
                  )}
                  {bank.branch && <p><strong>Branch:</strong> {bank.branch}</p>}
                  {showUpiId && bank.upiId && (
                    <p className="pt-1 text-blue-900">
                      <strong>UPI ID:</strong> <span className="font-mono font-bold">{bank.upiId}</span>
                    </p>
                  )}
                </div>

                {/* QR Code Presentation */}
                {showQrCode && (
                  <div className="sm:ml-auto flex-shrink-0">
                    <DocumentPaymentQr
                      upiQrCodeUrl={upiQrUrl}
                      upiId={bank.upiId}
                      showQrCode={showQrCode}
                      showUpiId={showUpiId}
                      className="border border-slate-200 bg-white p-2 rounded-lg shadow-xs"
                    />
                  </div>
                )}
              </div>

              {/* Payment Instructions */}
              <div className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] text-slate-500 space-y-0.5">
                <p className="font-semibold text-slate-700">Payment Instructions:</p>
                <p>• Accepted Methods: Bank Transfer (NEFT / RTGS / IMPS), UPI, Card, or Cash.</p>
                <p>• Please quote Invoice <strong className="text-slate-800">#{invoice.invoiceNumber}</strong> in transaction narration.</p>
              </div>
            </div>
          )}

          {/* Notes Section (rendered only when present & enabled) */}
          {showNotes && hasValue(invoice.notes) && (
            <div className="p-3 border border-slate-200 rounded-lg bg-slate-50 text-[11px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                SPECIAL INVOICE NOTES:
              </span>
              <p className="text-slate-700 whitespace-pre-line leading-relaxed">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Right Column: Authoritative Financial Totals Card */}
        <div className="p-4 border border-slate-200 rounded-lg bg-slate-50 space-y-2 text-right self-start">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal (Taxable Value):</span>
            <span className="font-medium text-slate-800">{formatCurrency(invoice.subtotal, currency)}</span>
          </div>

          {invoice.discountTotal > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Total Discount:</span>
              <span className="font-semibold">- {formatCurrency(invoice.discountTotal, currency)}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-600">
            <span>Applicable GST / Taxes:</span>
            <span className="font-medium text-slate-800">{formatCurrency(invoice.taxTotal, currency)}</span>
          </div>

          <div
            className="pt-2.5 pb-2 border-t-2 border-slate-300 flex justify-between items-center text-base font-black text-slate-900"
          >
            <span>Grand Total:</span>
            <span style={{ color: primaryColor }} className="text-lg">
              {formatCurrency(invoice.grandTotal, currency)}
            </span>
          </div>

          <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-slate-200">
            <span>Amount Paid:</span>
            <span>{formatCurrency(invoice.paidAmount, currency)}</span>
          </div>

          <div className="flex justify-between text-rose-700 font-bold border-t border-slate-200 pt-1">
            <span>Balance Due:</span>
            <span className="text-sm">{formatCurrency(invoice.balanceAmount, currency)}</span>
          </div>
        </div>
      </div>

      {/* Terms & Conditions Block */}
      {showTerms && hasValue(invoice.terms) && (
        <div className="mb-6 p-3.5 border border-slate-200 rounded-lg bg-slate-50 text-xs break-inside-avoid">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            TERMS & CONDITIONS:
          </span>
          <p className="text-slate-600 text-[11px] whitespace-pre-line leading-relaxed">{invoice.terms}</p>
        </div>
      )}

      {/* Bottom Signatures & Stamp */}
      <div className="pt-4 border-t border-slate-200 flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <div className="text-center">
            <img src={branding.stampUrl} alt="Company Stamp" className="max-h-16 object-contain" />
            <span className="text-[10px] text-slate-400 block mt-1 uppercase font-semibold">Official Seal</span>
          </div>
        ) : (
          <div className="text-[11px] text-slate-400">
            This is a computer-generated tax invoice.
          </div>
        )}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && (
              <img
                src={branding.signatureUrl}
                alt="Signature"
                className="max-h-12 object-contain ml-auto mb-1.5"
              />
            )}
            <div className="w-48 border-t border-slate-400 ml-auto pt-1 font-bold text-slate-800 text-xs">
              Authorized Signatory
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium">For {business.businessName}</p>
          </div>
        )}
      </div>
    </div>
  );
};
