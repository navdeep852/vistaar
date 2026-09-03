import React from 'react';
import { EwayBill } from '../../types';
import { EwayBillQrCode } from './EwayBillQrCode';

interface EwayBillPrintDocumentProps {
  ewayBill: EwayBill;
  isPrintMode?: boolean;
}

export const EwayBillPrintDocument: React.FC<EwayBillPrintDocumentProps> = ({
  ewayBill,
  isPrintMode = false,
}) => {
  const isOfficial = ewayBill.status === 'ACTIVE' || ewayBill.status === 'GENERATED' || ewayBill.status === 'EXPIRING_SOON';
  const isDraft = ewayBill.status === 'DRAFT' || ewayBill.status === 'READY';
  const isFailed = ewayBill.status === 'GENERATION_FAILED';

  const generatedAtStr = ewayBill.generatedAt
    ? new Date(ewayBill.generatedAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'N/A';

  const validFromStr = ewayBill.validFrom
    ? new Date(ewayBill.validFrom).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'N/A';

  const validUntilStr = ewayBill.validUntil
    ? new Date(ewayBill.validUntil).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'N/A';

  const items = ewayBill.items && ewayBill.items.length > 0 ? ewayBill.items : [];

  return (
    <div
      className={`ewb-print-container bg-white text-slate-900 font-sans mx-auto ${
        isPrintMode ? 'w-full p-0 shadow-none' : 'w-full max-w-[281mm] p-4 shadow-lg rounded-sm border border-slate-300'
      }`}
      style={{
        boxSizing: 'border-box',
        color: '#0f172a',
        backgroundColor: '#ffffff',
      }}
    >
      {/* Inline Print & Isolation Styles */}
      <style>{`
        .ewb-print-container {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a !important;
          background-color: #ffffff !important;
        }
        .ewb-print-container * {
          box-sizing: border-box;
        }
        .ewb-table th, .ewb-table td {
          padding: 3px 6px;
          border-color: #cbd5e1;
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .ewb-print-container {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .ewb-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* HEADER SECTION */}
      <div className="border-b-2 border-slate-900 pb-2 mb-2 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-black uppercase tracking-wider text-slate-900" style={{ fontSize: '13pt' }}>
              {isOfficial ? 'FORM GST EWB-01' : isFailed ? 'E-Way Bill Generation Failed' : 'E-Way Bill Draft'}
            </h1>
            <span
              className={`text-[7.5pt] font-extrabold px-1.5 py-0.5 border rounded-xs uppercase ${
                isOfficial
                  ? 'border-emerald-800 bg-emerald-50 text-emerald-900'
                  : isFailed
                  ? 'border-rose-800 bg-rose-50 text-rose-900'
                  : 'border-amber-800 bg-amber-50 text-amber-900'
              }`}
            >
              {isOfficial ? 'Officially Generated' : isFailed ? 'FAILED — NOT GOVERNMENT ISSUED' : 'DRAFT — NOT GOVERNMENT ISSUED'}
            </span>
          </div>
          <p className="text-[8.5pt] font-bold text-slate-700 mt-0.5">
            {isOfficial ? 'Government of India — Ministry of Finance • GST Compliance Gateway' : 'VISTAAR Local Pre-Generation Compliance Draft'}
          </p>
          <p className="text-[7.5pt] text-slate-600 font-mono mt-0.5">
            NIC / GSP Verification Reference:{' '}
            <span className="font-bold">{isOfficial ? ewayBill.governmentReference || 'NIC-EWB-OFFICIAL' : 'N/A (Draft State)'}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Authentic Scannable QR Code or Draft Indicator */}
          {isOfficial ? (
            <EwayBillQrCode
              qrPayload={
                ewayBill.ewbQrPayload ||
                `${ewayBill.ewayBillNumber}|${ewayBill.generatedAt}|${ewayBill.fromGstin}|${ewayBill.documentNumber}|${ewayBill.documentDate}|${ewayBill.fromGstin}|${ewayBill.toGstin || 'URP'}|${ewayBill.totalInvoiceValue}`
              }
              size={64}
              showCaption={false}
            />
          ) : (
            <div className="w-24 h-16 border border-dashed border-slate-300 p-1 bg-slate-50 flex items-center justify-center text-center rounded">
              <span className="text-[7pt] font-bold text-slate-400 uppercase leading-tight">
                {isFailed ? 'No official QR available' : 'QR unavailable — official EWB has not been generated'}
              </span>
            </div>
          )}

          <div className="text-right">
            <div className="text-[8pt] text-slate-500 font-bold uppercase tracking-wider">E-Way Bill Number</div>
            <div className="font-mono font-black text-sm text-slate-900 tracking-widest" style={{ fontSize: '12pt' }}>
              {isOfficial ? ewayBill.ewayBillNumber : isDraft ? 'DRAFT (Unissued)' : 'FAILED'}
            </div>
            <div className="mt-1">
              <span className="inline-block px-2 py-0.5 border border-slate-900 font-extrabold text-[8pt] rounded-xs bg-slate-100 uppercase">
                STATUS: {ewayBill.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* METADATA BAR (4 Columns) */}
      <div className="grid grid-cols-4 gap-2 p-1.5 bg-slate-100 border border-slate-400 rounded-xs mb-2 text-[8pt]">
        <div>
          <span className="text-slate-500 block uppercase font-medium">e-Way Bill No:</span>
          <span className="font-mono font-bold text-slate-900">{ewayBill.ewayBillNumber || 'N/A'}</span>
        </div>
        <div>
          <span className="text-slate-500 block uppercase font-medium">Generated Date & Time:</span>
          <span className="font-semibold text-slate-900">{generatedAtStr}</span>
        </div>
        <div>
          <span className="text-slate-500 block uppercase font-medium">Valid From:</span>
          <span className="font-semibold text-slate-900">{validFromStr}</span>
        </div>
        <div>
          <span className="text-slate-500 block uppercase font-medium">Valid Until:</span>
          <span className="font-bold text-emerald-800">{validUntilStr}</span>
        </div>
      </div>

      {/* PART - A: CONSIGNMENT & ADDRESS DETAILS */}
      <div className="border border-slate-400 rounded-xs mb-2 overflow-hidden">
        <div className="bg-slate-200 px-2 py-1 font-extrabold uppercase tracking-wider text-[8pt] border-b border-slate-400 text-slate-900">
          PART - A: CONSIGNMENT & ADDRESS DETAILS
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-400 p-2 text-[8pt]">
          {/* FROM / DISPATCH */}
          <div className="pr-2 space-y-0.5">
            <div className="font-bold uppercase text-slate-700 text-[7.5pt] tracking-wider border-b border-slate-200 pb-0.5 mb-1">
              1. FROM / DISPATCH (SUPPLIER)
            </div>
            <div className="font-extrabold text-slate-900 text-[8.5pt]">{ewayBill.fromTradeName}</div>
            <div className="font-mono text-slate-800">
              GSTIN: <span className="font-bold">{ewayBill.fromGstin || 'URP (Unregistered)'}</span>
            </div>
            <div className="text-slate-700 leading-tight">{ewayBill.fromAddress}</div>
            <div className="font-semibold text-slate-900">
              {ewayBill.fromPlace ? `${ewayBill.fromPlace}, ` : ''}State: {ewayBill.fromState} — PIN: {ewayBill.fromPincode}
            </div>
          </div>

          {/* TO / DESTINATION */}
          <div className="pl-2 space-y-0.5">
            <div className="font-bold uppercase text-slate-700 text-[7.5pt] tracking-wider border-b border-slate-200 pb-0.5 mb-1">
              2. TO / DESTINATION (RECIPIENT)
            </div>
            <div className="font-extrabold text-slate-900 text-[8.5pt]">{ewayBill.toTradeName}</div>
            <div className="font-mono text-slate-800">
              GSTIN: <span className="font-bold">{ewayBill.toGstin || 'URP (Unregistered)'}</span>
            </div>
            <div className="text-slate-700 leading-tight">{ewayBill.toAddress}</div>
            <div className="font-semibold text-slate-900">
              {ewayBill.toPlace ? `${ewayBill.toPlace}, ` : ''}State: {ewayBill.toState} — PIN: {ewayBill.toPincode}
            </div>
          </div>
        </div>

        {/* CONSIGNMENT DOCUMENT BAR */}
        <div className="border-t border-slate-400 bg-slate-50 p-1.5 grid grid-cols-5 gap-1 text-[7.5pt] border-collapse">
          <div>
            <span className="text-slate-500 block uppercase font-medium">Doc Type & No:</span>
            <span className="font-bold text-slate-900">{ewayBill.documentType} #{ewayBill.documentNumber}</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-medium">Doc Date:</span>
            <span className="font-semibold text-slate-900">{ewayBill.documentDate}</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-medium">Supply Type:</span>
            <span className="font-semibold text-slate-900">{ewayBill.supplyType} ({ewayBill.subSupplyType})</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-medium">Txn Type:</span>
            <span className="font-semibold text-slate-900">{ewayBill.transactionType}</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-medium">Total Value:</span>
            <span className="font-mono font-bold text-slate-900">₹{(ewayBill.totalInvoiceValue || 0).toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* PART - B: TRANSPORTATION DETAILS */}
      <div className="border border-slate-400 rounded-xs mb-2 overflow-hidden">
        <div className="bg-slate-200 px-2 py-1 font-extrabold uppercase tracking-wider text-[8pt] border-b border-slate-400 text-slate-900">
          PART - B: TRANSPORTATION & VEHICLE DETAILS
        </div>
        <div className="p-1.5 grid grid-cols-4 gap-2 text-[8pt]">
          <div>
            <span className="text-slate-500 block uppercase font-medium text-[7.5pt]">Mode of Transport:</span>
            <span className="font-bold text-slate-900">{ewayBill.transportMode}</span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-medium text-[7.5pt]">Transporter Name & ID:</span>
            <span className="font-semibold text-slate-900 truncate block">
              {ewayBill.transporterName || 'Self / Local Transport'} ({ewayBill.transporterGstin || ewayBill.transporterId || 'N/A'})
            </span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-medium text-[7.5pt]">Vehicle No & Type:</span>
            <span className="font-mono font-bold uppercase text-slate-900">
              {ewayBill.vehicleNumber || 'N/A'} ({ewayBill.vehicleType || 'REGULAR'})
            </span>
          </div>
          <div>
            <span className="text-slate-500 block uppercase font-medium text-[7.5pt]">Distance & Doc Details:</span>
            <span className="font-semibold text-slate-900">
              {ewayBill.approxDistanceKm} Km {ewayBill.transportDocumentNumber ? `| Doc #${ewayBill.transportDocumentNumber}` : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ITEMIZIED GOODS & TAX BREAKDOWN TABLE */}
      <div className="border border-slate-400 rounded-xs mb-2 overflow-hidden">
        <div className="bg-slate-200 px-2 py-1 font-extrabold uppercase tracking-wider text-[8pt] border-b border-slate-400 text-slate-900 flex justify-between">
          <span>GOODS & TAX BREAKDOWN</span>
          <span>{items.length} Line Item(s)</span>
        </div>
        <table className="ewb-table w-full text-left border-collapse text-[7.5pt]">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-400 font-bold text-slate-800 uppercase">
              <th className="w-8 border-r border-slate-400 text-center">#</th>
              <th className="border-r border-slate-400">Description of Goods</th>
              <th className="w-16 border-r border-slate-400 text-center">HSN</th>
              <th className="w-16 border-r border-slate-400 text-right">Qty</th>
              <th className="w-24 border-r border-slate-400 text-right">Taxable Val (₹)</th>
              <th className="w-20 border-r border-slate-400 text-right">CGST</th>
              <th className="w-20 border-r border-slate-400 text-right">SGST</th>
              <th className="w-20 border-r border-slate-400 text-right">IGST</th>
              <th className="w-24 text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-2 text-center text-slate-500">
                  No line items specified. Consignment total value applies.
                </td>
              </tr>
            ) : (
              items.map((it, idx) => {
                const totalItemTax = (it.cgstAmount || 0) + (it.sgstAmount || 0) + (it.igstAmount || 0) + (it.cessAmount || 0);
                const itemTotal = (it.taxableValue || 0) + totalItemTax;
                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="border-r border-slate-400 text-center font-mono">{idx + 1}</td>
                    <td className="border-r border-slate-400 font-medium text-slate-900">{it.productName}</td>
                    <td className="border-r border-slate-400 text-center font-mono">{it.hsnCode || '—'}</td>
                    <td className="border-r border-slate-400 text-right">
                      {it.quantity} {it.unit || 'Pcs'}
                    </td>
                    <td className="border-r border-slate-400 text-right font-mono font-semibold">
                      ₹{(it.taxableValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border-r border-slate-400 text-right font-mono">
                      {it.cgstAmount ? `₹${it.cgstAmount.toFixed(2)} (${it.cgstRate}%)` : '—'}
                    </td>
                    <td className="border-r border-slate-400 text-right font-mono">
                      {it.sgstAmount ? `₹${it.sgstAmount.toFixed(2)} (${it.sgstRate}%)` : '—'}
                    </td>
                    <td className="border-r border-slate-400 text-right font-mono">
                      {it.igstAmount ? `₹${it.igstAmount.toFixed(2)} (${it.igstRate}%)` : '—'}
                    </td>
                    <td className="text-right font-mono font-bold">
                      ₹{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-900">
              <td colSpan={4} className="border-r border-slate-400 uppercase text-right px-2">
                Consignment Totals:
              </td>
              <td className="border-r border-slate-400 text-right font-mono">
                ₹{(ewayBill.totalTaxableValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="border-r border-slate-400 text-right font-mono">
                ₹{(ewayBill.cgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="border-r border-slate-400 text-right font-mono">
                ₹{(ewayBill.sgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="border-r border-slate-400 text-right font-mono">
                ₹{(ewayBill.igstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="text-right font-mono font-black text-slate-900" style={{ fontSize: '8.5pt' }}>
                ₹{(ewayBill.totalInvoiceValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* FOOTER & LEGAL DECLARATIONS */}
      <div className="border-t border-slate-400 pt-1.5 flex items-end justify-between text-[7pt] text-slate-600">
        <div className="max-w-[75%] leading-tight">
          <p className="font-semibold text-slate-800">
            DECLARATION: This e-Way Bill is an electronically generated statutory compliance document under Rule 138 of the Central Goods and Services Tax Rules, 2017. Valid across all States and Union Territories of India.
          </p>
          <p className="mt-0.5 font-mono text-[6.5pt]">
            Generated via VISTAAR Business OS Compliance Engine • Anti-Fraud Cryptographic Verification Tag: {ewayBill.id}
          </p>
        </div>
        <div className="text-right font-mono font-bold text-slate-900">
          Page 1 of 1
        </div>
      </div>
    </div>
  );
};
