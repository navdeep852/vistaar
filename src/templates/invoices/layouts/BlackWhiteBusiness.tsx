import React from 'react';
import { InvoiceTemplateProps } from '../types';
import { formatCurrency, formatDate, formatFullAddress, LogoComponent, hasValue } from '../helpers';
import { DocumentPaymentQr } from '../../../components/DocumentPaymentQr';

export const BlackWhiteBusiness: React.FC<InvoiceTemplateProps> = ({
  invoice,
  business,
  customer,
  branding,
  customization,
  isPrintMode = false,
}) => {
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
    fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
    color: '#000000',
    backgroundColor: '#ffffff',
    width: '100%',
    padding: isPrintMode ? '12mm' : '8mm',
    boxSizing: 'border-box',
  };

  const safePaid = Number(invoice.paidAmount || 0);
  const safeTotal = Number(invoice.grandTotal || 0);
  let statusText = 'UNPAID';
  if (safePaid >= safeTotal && safeTotal > 0) {
    statusText = 'PAID IN FULL';
  } else if (safePaid > 0) {
    statusText = 'PARTIALLY PAID';
  } else if (String(invoice.paymentStatus).toUpperCase() === 'OVERDUE') {
    statusText = 'OVERDUE';
  }

  const anyItemHasDiscount = (invoice.items || []).some((item) => Number(item.discountAmount || 0) > 0);

  return (
    <div style={containerStyle} className="relative transition-all bg-white border-2 border-black p-6 text-black print:border-none print:p-0">
      {/* Top Header Row */}
      <div className="flex justify-between items-start pb-6 border-b-2 border-black mb-6 gap-6 break-inside-avoid">
        {/* Left: Business Info */}
        <div className="flex-1 max-w-[62%]">
          <div className="mb-2 grayscale">
            <LogoComponent branding={branding} businessName={business.businessName} fallbackStyle="minimal" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-black leading-none">
            {business.businessName}
          </h1>
          {business.legalName && business.legalName !== business.businessName && (
            <p className="text-xs text-zinc-600 font-medium mt-0.5">({business.legalName})</p>
          )}

          {fullBusinessAddress && (
            <p className="text-xs text-zinc-700 mt-2 leading-relaxed max-w-sm font-normal">
              {fullBusinessAddress}
            </p>
          )}

          <div className="text-xs text-zinc-700 mt-1.5 space-y-0.5">
            {business.phone && <p><strong>TEL:</strong> {business.phone}</p>}
            {business.email && <p><strong>EMAIL:</strong> {business.email}</p>}
            {business.website && <p><strong>WEB:</strong> {business.website}</p>}
          </div>

          <div className="flex flex-wrap gap-4 text-xs font-bold text-black mt-2 pt-1 border-t border-zinc-300">
            {showGstin && business.gstin && <span>GSTIN: {business.gstin}</span>}
            {showPan && business.pan && <span>PAN: {business.pan}</span>}
          </div>
        </div>

        {/* Right: Stark INVOICE Title & Metadata */}
        <div className="text-right flex flex-col items-end">
          <div className="text-4xl font-black tracking-[0.2em] uppercase text-black mb-4">
            INVOICE
          </div>

          <div className="border border-black text-xs min-w-[220px] divide-y divide-black">
            <div className="flex justify-between p-2">
              <span className="font-bold text-zinc-600 uppercase text-[10px]">INVOICE NO:</span>
              <span className="font-black text-black">#{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between p-2">
              <span className="font-bold text-zinc-600 uppercase text-[10px]">DATE:</span>
              <span className="font-bold text-black">{formatDate(invoice.date)}</span>
            </div>
            {showDueDate && invoice.dueDate && (
              <div className="flex justify-between p-2">
                <span className="font-bold text-zinc-600 uppercase text-[10px]">DUE DATE:</span>
                <span className="font-bold text-black">{formatDate(invoice.dueDate)}</span>
              </div>
            )}
            <div className="flex justify-between p-2 bg-zinc-100">
              <span className="font-bold text-zinc-600 uppercase text-[10px]">STATUS:</span>
              <span className="font-black tracking-wider uppercase text-[11px] text-black">
                [ {statusText} ]
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bill To & Reference Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        {/* Bill To */}
        <div className="border border-black p-3.5">
          <div className="bg-black text-white font-black text-[10px] tracking-widest uppercase px-2 py-0.5 inline-block mb-2">
            BILL TO
          </div>
          <h2 className="font-black text-black text-sm uppercase">{customer?.name || 'VALUED CUSTOMER'}</h2>
          {fullCustomerAddress && (
            <p className="text-zinc-700 mt-1 leading-relaxed">{fullCustomerAddress}</p>
          )}
          <div className="mt-2 space-y-0.5 text-zinc-800">
            {customer?.phone && <p><strong>PHONE:</strong> {customer.phone}</p>}
            {customer?.email && <p><strong>EMAIL:</strong> {customer.email}</p>}
            {showGstin && customer?.gstin && (
              <p className="font-bold text-black mt-1">
                <strong>GSTIN:</strong> {customer.gstin}
              </p>
            )}
          </div>
        </div>

        {/* Invoice Notes / Order Reference */}
        <div className="border border-black p-3.5 flex flex-col justify-between">
          <div>
            <div className="bg-zinc-200 text-black font-black text-[10px] tracking-widest uppercase px-2 py-0.5 inline-block mb-2">
              DOCUMENT METADATA
            </div>
            <div className="space-y-1 text-zinc-700">
              <div className="flex justify-between">
                <span>Place of Supply:</span>
                <span className="font-bold text-black">{customer?.state || business.state || 'N/A'}</span>
              </div>
              {invoice.referenceNumber && (
                <div className="flex justify-between">
                  <span>Reference / P.O. #:</span>
                  <span className="font-bold text-black">{invoice.referenceNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tax System:</span>
                <span className="font-bold text-black">Indian GST Compliant</span>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-zinc-500 uppercase tracking-wider pt-2 border-t border-zinc-200">
            Monochrome Business Commercial Record
          </p>
        </div>
      </div>

      {/* Line Item Table */}
      <div className="mb-6 border-2 border-black overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-black text-white font-black uppercase text-[10px] tracking-widest">
              <th className="py-2.5 px-3 w-10 text-center border-r border-zinc-800">#</th>
              <th className="py-2.5 px-3 border-r border-zinc-800">DESCRIPTION</th>
              <th className="py-2.5 px-3 text-center w-20 border-r border-zinc-800">QTY</th>
              <th className="py-2.5 px-3 text-right w-24 border-r border-zinc-800">RATE ({currency})</th>
              {anyItemHasDiscount && (
                <th className="py-2.5 px-3 text-right w-20 border-r border-zinc-800">DISCOUNT</th>
              )}
              <th className="py-2.5 px-3 text-center w-16 border-r border-zinc-800">TAX</th>
              <th className="py-2.5 px-3 text-right w-28">AMOUNT ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-300">
            {invoice.items.map((item, idx) => (
              <tr key={item.id || idx} className="bg-white">
                <td className="py-2.5 px-3 text-center font-bold text-zinc-500 border-r border-zinc-200">
                  {idx + 1}
                </td>
                <td className="py-2.5 px-3 border-r border-zinc-200">
                  <div className="font-bold text-black">{item.productName}</div>
                  {item.sku && (
                    <div className="font-mono text-[10px] text-zinc-500 mt-0.5">
                      SKU: {item.sku}
                    </div>
                  )}
                  {(item as any).description && (
                    <div className="text-[11px] text-zinc-600 mt-0.5 leading-snug">
                      {(item as any).description}
                    </div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center font-medium border-r border-zinc-200">
                  {item.quantity} {item.unit || ''}
                </td>
                <td className="py-2.5 px-3 text-right font-medium border-r border-zinc-200">
                  {Number(item.sellingPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                {anyItemHasDiscount && (
                  <td className="py-2.5 px-3 text-right font-medium border-r border-zinc-200">
                    {Number(item.discountAmount || 0) > 0 ? formatCurrency(item.discountAmount, currency) : '-'}
                  </td>
                )}
                <td className="py-2.5 px-3 text-center font-medium border-r border-zinc-200">
                  {item.taxPercent || 0}%
                </td>
                <td className="py-2.5 px-3 text-right font-black text-black">
                  {formatCurrency(item.total, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals & Payment Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 text-xs break-inside-avoid">
        {/* Left: Payment Method & QR */}
        <div className="space-y-4">
          {showBankDetails && hasBankData && (
            <div className="border border-black p-3.5">
              <div className="bg-black text-white font-black text-[10px] tracking-widest uppercase px-2 py-0.5 inline-block mb-2">
                PAYMENT INFORMATION
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
                <div className="space-y-1 text-zinc-800 flex-1">
                  {bank.bankName && <p><strong>BANK:</strong> {bank.bankName}</p>}
                  {bank.accountHolder && <p><strong>BENEFICIARY:</strong> {bank.accountHolder}</p>}
                  {bank.accountNo && (
                    <p>
                      <strong>ACCOUNT NO:</strong> <span className="font-mono font-bold text-black">{bank.accountNo}</span>
                    </p>
                  )}
                  {bank.ifscCode && (
                    <p>
                      <strong>IFSC:</strong> <span className="font-mono font-bold text-black">{bank.ifscCode}</span>
                    </p>
                  )}
                  {bank.branch && <p><strong>BRANCH:</strong> {bank.branch}</p>}
                  {showUpiId && bank.upiId && (
                    <p className="pt-1">
                      <strong>UPI ID:</strong> <span className="font-mono font-bold text-black">{bank.upiId}</span>
                    </p>
                  )}
                </div>

                {/* Monochrome QR presentation */}
                {showQrCode && (
                  <div className="sm:ml-auto flex-shrink-0">
                    <DocumentPaymentQr
                      upiQrCodeUrl={upiQrUrl}
                      upiId={bank.upiId}
                      showQrCode={showQrCode}
                      showUpiId={showUpiId}
                      className="border border-black p-2 bg-white"
                    />
                  </div>
                )}
              </div>

              <div className="mt-2.5 pt-2 border-t border-zinc-200 text-[10px] text-zinc-500 uppercase">
                Direct remittance via NEFT/RTGS/IMPS or UPI accepted.
              </div>
            </div>
          )}

          {/* Notes */}
          {showNotes && hasValue(invoice.notes) && (
            <div className="border border-zinc-400 p-3 text-[11px]">
              <span className="font-black uppercase text-[10px] tracking-wider block mb-1">
                NOTES:
              </span>
              <p className="text-zinc-700 whitespace-pre-line leading-relaxed">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Right: Monochrome Totals Summary */}
        <div className="border-2 border-black p-4 space-y-2 text-right self-start">
          <div className="flex justify-between text-zinc-700 font-medium">
            <span>SUBTOTAL:</span>
            <span className="font-bold text-black">{formatCurrency(invoice.subtotal, currency)}</span>
          </div>

          {invoice.discountTotal > 0 && (
            <div className="flex justify-between text-zinc-700 font-medium">
              <span>DISCOUNT:</span>
              <span className="font-bold text-black">- {formatCurrency(invoice.discountTotal, currency)}</span>
            </div>
          )}

          <div className="flex justify-between text-zinc-700 font-medium">
            <span>TAX TOTAL:</span>
            <span className="font-bold text-black">{formatCurrency(invoice.taxTotal, currency)}</span>
          </div>

          <div className="pt-2 pb-1 border-t-2 border-black flex justify-between items-center text-base font-black text-black">
            <span>TOTAL:</span>
            <span className="text-lg">{formatCurrency(invoice.grandTotal, currency)}</span>
          </div>

          <div className="flex justify-between text-zinc-800 font-medium pt-1 border-t border-zinc-300">
            <span>AMOUNT PAID:</span>
            <span className="font-bold text-black">{formatCurrency(invoice.paidAmount, currency)}</span>
          </div>

          <div className="flex justify-between text-black font-black border-t border-zinc-300 pt-1 text-sm">
            <span>BALANCE DUE:</span>
            <span>{formatCurrency(invoice.balanceAmount, currency)}</span>
          </div>
        </div>
      </div>

      {/* Terms & Conditions */}
      {showTerms && hasValue(invoice.terms) && (
        <div className="mb-6 border border-black p-3.5 text-xs break-inside-avoid">
          <span className="font-black text-[10px] tracking-widest uppercase block mb-1">
            TERMS & CONDITIONS
          </span>
          <p className="text-zinc-700 text-[11px] whitespace-pre-line leading-relaxed">{invoice.terms}</p>
        </div>
      )}

      {/* Bottom Signatures & Stamp */}
      <div className="pt-4 border-t-2 border-black flex justify-between items-end text-xs break-inside-avoid">
        {showStamp && branding.stampUrl ? (
          <div className="text-center">
            <img src={branding.stampUrl} alt="Company Stamp" className="max-h-16 object-contain grayscale" />
            <span className="text-[10px] text-zinc-500 block mt-1 uppercase font-bold tracking-wider">OFFICIAL STAMP</span>
          </div>
        ) : (
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Official Commercial Invoice • Authorized Business Copy
          </div>
        )}

        {showSignature && (
          <div className="text-right">
            {branding.signatureUrl && (
              <img
                src={branding.signatureUrl}
                alt="Signature"
                className="max-h-12 object-contain ml-auto mb-1.5 grayscale"
              />
            )}
            <div className="w-48 border-t-2 border-black ml-auto pt-1 font-black text-black text-xs uppercase tracking-wider">
              AUTHORIZED SIGNATURE
            </div>
            <p className="text-[10px] text-zinc-600 mt-0.5 font-bold uppercase">{business.businessName}</p>
          </div>
        )}
      </div>
    </div>
  );
};
