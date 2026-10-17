import React from 'react';
import { StockTransfer, Branch } from '../../types';

export interface StockTransferPrintDocumentProps {
  transfer: StockTransfer;
  sourceBranch?: Branch | null;
  destBranch?: Branch | null;
  settings?: any;
  isPrintMode?: boolean;
}

export const StockTransferPrintDocument: React.FC<StockTransferPrintDocumentProps> = ({
  transfer,
  sourceBranch,
  destBranch,
  settings,
  isPrintMode = false,
}) => {
  const businessName = settings?.businessName || settings?.companyName || 'VISTAAR ENTERPRISES';
  const legalName = settings?.legalName || businessName;
  const logo = settings?.logo || '';
  const currency = settings?.currency || '₹';

  // Format transfer date & time
  const formattedDate = transfer.transferDate
    ? new Date(transfer.transferDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN');

  const formattedDateTime = transfer.createdAt
    ? new Date(transfer.createdAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : formattedDate;

  // Source Branch Details
  const srcName = transfer.sourceBranchName || sourceBranch?.branchName || 'Source Branch';
  const srcCode = transfer.sourceBranchCode || sourceBranch?.branchCode || '';
  const srcAddr = transfer.sourceBranchAddress || sourceBranch?.address || settings?.address || 'Primary Facility';
  const srcCity = transfer.sourceBranchCity || sourceBranch?.city || settings?.city || '';
  const srcState = transfer.sourceBranchState || sourceBranch?.state || settings?.state || '';
  const srcPin = transfer.sourceBranchPincode || sourceBranch?.pincode || settings?.pincode || '';
  const srcPhone = transfer.sourceBranchPhone || sourceBranch?.phone || settings?.phone || '';
  const srcGstin = transfer.sourceBranchGstin || sourceBranch?.gstin || settings?.gstin || '';

  // Destination Branch Details
  const dstName = transfer.destinationBranchName || destBranch?.branchName || 'Destination Branch';
  const dstCode = transfer.destinationBranchCode || destBranch?.branchCode || '';
  const dstAddr = transfer.destinationBranchAddress || destBranch?.address || 'Destination Facility';
  const dstCity = transfer.destinationBranchCity || destBranch?.city || '';
  const dstState = transfer.destinationBranchState || destBranch?.state || '';
  const dstPin = transfer.destinationBranchPincode || destBranch?.pincode || '';
  const dstPhone = transfer.destinationBranchPhone || destBranch?.phone || '';
  const dstGstin = transfer.destinationBranchGstin || destBranch?.gstin || '';

  const items = transfer.items || [];
  const totalQty = transfer.totalQuantity ?? items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const totalItemsCount = transfer.totalLineItems ?? items.length;
  const totalValuation = transfer.totalTransferValue ?? items.reduce((acc, it) => {
    const cost = Number(it.unitCost) || 0;
    const qty = Number(it.quantity) || 0;
    return acc + (cost * qty);
  }, 0);

  return (
    <div
      className={`stn-document bg-white text-slate-900 font-sans mx-auto ${
        isPrintMode
          ? 'w-full p-0 shadow-none'
          : 'w-full max-w-[210mm] min-h-[297mm] p-8 shadow-xl rounded-xl border border-slate-200'
      }`}
      style={{
        boxSizing: 'border-box',
        color: '#0f172a',
        backgroundColor: '#ffffff',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Print Styles */}
      <style>{`
        .stn-document {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #0f172a !important;
          background-color: #ffffff !important;
          line-height: 1.4;
        }
        .stn-document * {
          box-sizing: border-box;
        }
        .stn-table th {
          background-color: #f1f5f9 !important;
          color: #1e293b !important;
          font-weight: 700;
          font-size: 8pt;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 2px solid #cbd5e1;
          padding: 6px 8px;
        }
        .stn-table td {
          padding: 7px 8px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 8.5pt;
          vertical-align: middle;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .stn-document {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .stn-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* TOP HEADER: Organization Branding & Document Identity */}
      <div className="border-b-2 border-slate-900 pb-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {logo ? (
              <img
                src={logo}
                alt="Logo"
                className="w-14 h-14 object-contain rounded-lg border border-slate-200 p-1"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xl tracking-wider shadow-sm">
                {businessName.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none">
                {businessName}
              </h1>
              {legalName && legalName !== businessName && (
                <p className="text-[9pt] text-slate-500 font-medium mt-0.5">{legalName}</p>
              )}
              <p className="text-[8pt] text-slate-500 mt-1">
                {[settings?.address, settings?.city, settings?.state, settings?.pincode].filter(Boolean).join(', ')}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 text-[7.5pt] text-slate-600 mt-0.5">
                {settings?.gstin && <span><strong>GSTIN:</strong> {settings.gstin}</span>}
                {settings?.phone && <span><strong>Phone:</strong> {settings.phone}</span>}
                {settings?.email && <span><strong>Email:</strong> {settings.email}</span>}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="inline-block px-3 py-1 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-[8pt] font-black uppercase tracking-wider mb-1">
              Internal Movement Note
            </span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              STOCK TRANSFER NOTE
            </h2>
            <div className="text-[9pt] font-mono font-black text-blue-600 mt-0.5">
              #{transfer.transferNumber}
            </div>
            <div className="text-[8pt] text-slate-500 mt-0.5">
              Date: <strong>{formattedDateTime}</strong>
            </div>
            <div className="mt-1">
              <span
                className={`inline-block px-2 py-0.5 text-[7pt] font-extrabold uppercase rounded-full border ${
                  transfer.status === 'Completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : transfer.status === 'In Transit'
                    ? 'bg-amber-50 text-amber-700 border-amber-300'
                    : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                Status: {transfer.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ORIGIN & DESTINATION BRANCH CARDS */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Source Branch (Dispatched From) */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
            <span className="text-[7.5pt] font-black uppercase tracking-wider text-rose-700">
              ◀ DISPATCHED FROM (SOURCE)
            </span>
            {srcCode && (
              <span className="text-[7pt] font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                Code: {srcCode}
              </span>
            )}
          </div>
          <div className="text-[9.5pt] font-bold text-slate-900">{srcName}</div>
          <div className="text-[8pt] text-slate-600 mt-0.5 leading-relaxed">
            {[srcAddr, srcCity, srcState, srcPin].filter(Boolean).join(', ')}
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-200/60 grid grid-cols-2 gap-1 text-[7.5pt] text-slate-600">
            {srcGstin && <div><strong>GSTIN:</strong> {srcGstin}</div>}
            {srcPhone && <div><strong>Phone:</strong> {srcPhone}</div>}
          </div>
        </div>

        {/* Destination Branch (Delivered To) */}
        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2">
            <span className="text-[7.5pt] font-black uppercase tracking-wider text-emerald-700">
              ▶ DELIVERED TO (DESTINATION)
            </span>
            {dstCode && (
              <span className="text-[7pt] font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                Code: {dstCode}
              </span>
            )}
          </div>
          <div className="text-[9.5pt] font-bold text-slate-900">{dstName}</div>
          <div className="text-[8pt] text-slate-600 mt-0.5 leading-relaxed">
            {[dstAddr, dstCity, dstState, dstPin].filter(Boolean).join(', ')}
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-200/60 grid grid-cols-2 gap-1 text-[7.5pt] text-slate-600">
            {dstGstin && <div><strong>GSTIN:</strong> {dstGstin}</div>}
            {dstPhone && <div><strong>Phone:</strong> {dstPhone}</div>}
          </div>
        </div>
      </div>

      {/* DISPATCH / GATE PASS METADATA BAR */}
      <div className="bg-slate-100 rounded-lg p-2.5 mb-4 grid grid-cols-3 gap-3 text-[8pt] text-slate-700 border border-slate-200">
        <div>
          <span className="block text-[7pt] uppercase font-bold text-slate-400">Authorized / Initiated By</span>
          <span className="font-bold text-slate-800">{transfer.requestedBy || transfer.approvedBy || 'Authorized Officer'}</span>
        </div>
        <div>
          <span className="block text-[7pt] uppercase font-bold text-slate-400">Transfer Purpose / Notes</span>
          <span className="font-semibold text-slate-800 truncate block">
            {transfer.notes || 'Inter-Branch Stock Replenishment'}
          </span>
        </div>
        <div>
          <span className="block text-[7pt] uppercase font-bold text-slate-400">Movement Classification</span>
          <span className="font-bold text-indigo-700">Non-Taxable Internal Transfer</span>
        </div>
      </div>

      {/* ITEMIZED LINE ITEMS TABLE */}
      <div className="mb-4 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left border-collapse stn-table">
          <thead>
            <tr>
              <th style={{ width: '4%' }} className="text-center">#</th>
              <th style={{ width: '16%' }}>Part # / SKU</th>
              <th style={{ width: '28%' }}>Product Name</th>
              <th style={{ width: '10%' }}>HSN/SAC</th>
              <th style={{ width: '10%' }} className="text-right">Qty</th>
              <th style={{ width: '8%' }} className="text-center">Unit</th>
              <th style={{ width: '12%' }} className="text-center">Source Stock</th>
              <th style={{ width: '12%' }} className="text-right">Internal Valuation</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-6 text-slate-400 text-xs">
                  No line items recorded for this transfer.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const qty = Number(item.quantity) || 0;
                const cost = Number(item.unitCost) || 0;
                const lineVal = item.transferValue ?? (cost * qty);
                const hasStockBeforeAfter = item.sourceStockBefore !== undefined && item.sourceStockAfter !== undefined;

                return (
                  <tr key={item.id || idx} className="hover:bg-slate-50/50">
                    <td className="text-center font-mono text-slate-400 text-[8pt]">{idx + 1}</td>
                    <td className="font-mono font-medium text-slate-600 text-[8pt]">
                      {item.partNumber || item.sku || '—'}
                    </td>
                    <td>
                      <div className="font-bold text-slate-900">{item.productName || 'Product Item'}</div>
                      {item.notes && <div className="text-[7pt] text-slate-400 italic">{item.notes}</div>}
                    </td>
                    <td className="font-mono text-slate-500 text-[8pt]">{item.hsnCode || '—'}</td>
                    <td className="text-right font-black text-slate-900 text-[9pt]">
                      {qty.toLocaleString()}
                    </td>
                    <td className="text-center text-slate-600 text-[8pt]">
                      {item.unit || 'PCS'}
                    </td>
                    <td className="text-center text-[7.5pt] text-slate-500 font-mono">
                      {hasStockBeforeAfter ? (
                        <span>
                          {item.sourceStockBefore} → <strong className="text-slate-800">{item.sourceStockAfter}</strong>
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                    <td className="text-right font-bold text-slate-800 text-[8.5pt]">
                      {cost > 0 ? (
                        <span>{currency}{lineVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* SUMMARY TOTALS & DECLARATION */}
      <div className="grid grid-cols-12 gap-4 mb-6 items-start">
        {/* Left: Statutory Non-Taxable Declaration */}
        <div className="col-span-7 bg-slate-50 rounded-xl p-3 border border-slate-200 text-[7.5pt] text-slate-600 space-y-1.5">
          <div className="font-bold text-slate-800 uppercase tracking-wider text-[7pt]">
            Statutory Internal Movement Declaration
          </div>
          <p className="leading-relaxed">
            This document is an internal <strong>Stock Transfer Note</strong> recording the non-commercial relocation of goods
            between branches of the same entity. This movement does not constitute a sale, attracts no customer invoice GST,
            and creates no commercial receivable or revenue.
          </p>
          <div className="pt-1 border-t border-slate-200/80 text-[7pt] text-slate-500">
            Physical stock verified and synchronized in VISTAAR Business OS.
          </div>
        </div>

        {/* Right: Summary Metrics */}
        <div className="col-span-5 bg-slate-100 rounded-xl p-3 border border-slate-200 space-y-1.5">
          <div className="flex justify-between text-[8pt] text-slate-600">
            <span>Total Line Items:</span>
            <span className="font-bold text-slate-900">{totalItemsCount}</span>
          </div>
          <div className="flex justify-between text-[8.5pt] text-slate-800 border-t border-slate-200 pt-1">
            <span>Total Quantity Transferred:</span>
            <span className="font-black text-slate-900 text-[10pt]">{totalQty.toLocaleString()} Units</span>
          </div>
          {totalValuation > 0 && (
            <div className="flex justify-between text-[8pt] text-slate-700 border-t border-slate-200 pt-1">
              <span>Internal Inventory Valuation:</span>
              <span className="font-bold text-slate-900">{currency}{totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="text-[6.5pt] text-slate-400 text-right uppercase tracking-wider font-semibold">
            * Internal Costing • Not Sales Revenue
          </div>
        </div>
      </div>

      {/* AUTHORIZATION & SIGNATURE SECTION */}
      <div className="grid grid-cols-3 gap-6 pt-6 border-t-2 border-slate-900 mt-auto">
        {/* Source Branch Dispatcher */}
        <div className="text-center">
          <div className="h-12 flex items-end justify-center pb-1">
            <span className="font-script text-slate-400 italic text-[10pt]">{transfer.dispatchedBy || transfer.requestedBy || 'Dispatched'}</span>
          </div>
          <div className="border-t border-slate-400 pt-1 text-[7.5pt]">
            <div className="font-bold text-slate-800 uppercase">Prepared & Dispatched By</div>
            <div className="text-slate-500 text-[7pt]">Source Branch Representative</div>
          </div>
        </div>

        {/* Central Authorization */}
        <div className="text-center">
          <div className="h-12 flex items-end justify-center pb-1">
            <span className="font-script text-slate-400 italic text-[10pt]">{transfer.approvedBy || 'Authorized'}</span>
          </div>
          <div className="border-t border-slate-400 pt-1 text-[7.5pt]">
            <div className="font-bold text-slate-800 uppercase">Authorized Officer</div>
            <div className="text-slate-500 text-[7pt]">Operations / Inventory Control</div>
          </div>
        </div>

        {/* Destination Branch Receiver */}
        <div className="text-center">
          <div className="h-12 flex items-end justify-center pb-1">
            <span className="font-script text-slate-400 italic text-[10pt]">{transfer.receivedBy || 'Pending Receipt'}</span>
          </div>
          <div className="border-t border-slate-400 pt-1 text-[7.5pt]">
            <div className="font-bold text-slate-800 uppercase">Received & Acknowledged By</div>
            <div className="text-slate-500 text-[7pt]">Destination Branch Incharge</div>
          </div>
        </div>
      </div>

      {/* DOCUMENT FOOTER */}
      <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[6.5pt] text-slate-400">
        <div>
          VISTAAR Business OS • Document ID: <strong className="font-mono text-slate-500">{transfer.id || transfer.transferNumber}</strong>
        </div>
        <div>
          Official Stock Transfer Record • Generated: {new Date().toLocaleString('en-IN')}
        </div>
      </div>
    </div>
  );
};
