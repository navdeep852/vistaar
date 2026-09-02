import React, { useRef } from 'react';
import { Printer, Download, X, QrCode, ShieldCheck } from 'lucide-react';
import { EwayBill } from '../../types';

interface EwayBillPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  ewayBill: EwayBill | null;
}

export const EwayBillPrintModal: React.FC<EwayBillPrintModalProps> = ({
  isOpen,
  onClose,
  ewayBill,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !ewayBill) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden print:max-w-none print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Modal Controls (Hidden in Print) */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950 print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              GST E-Way Bill Official Document
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer shadow-md shadow-blue-600/20"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div ref={printRef} className="p-8 overflow-y-auto flex-1 bg-white text-slate-900 font-sans text-xs space-y-6">
          {/* Header & Barcode Section */}
          <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-extrabold uppercase tracking-wider text-slate-900">
                e-Way Bill System
              </h1>
              <p className="text-[11px] font-semibold text-slate-600">Government of India — GST Compliance</p>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                NIC GSP Verification Reference: {ewayBill.governmentReference || 'NIC-EWB-OK-2026'}
              </p>
            </div>

            <div className="text-right flex flex-col items-end">
              {/* Barcode & QR Graphic */}
              <div className="p-2 bg-slate-100 rounded-lg border border-slate-300 flex items-center gap-3 mb-1">
                <QrCode className="w-12 h-12 text-slate-900" />
                <div className="text-left font-mono">
                  <p className="text-[10px] text-slate-500 uppercase">EWB Barcode</p>
                  <p className="font-extrabold text-sm text-slate-900 tracking-widest">
                    {ewayBill.ewayBillNumber || 'DRAFT-EWB'}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-xs">
                STATUS: {ewayBill.status}
              </span>
            </div>
          </div>

          {/* Section 1: EWB Key Details */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 border border-slate-300 rounded-lg">
            <div>
              <p className="text-slate-500">e-Way Bill No:</p>
              <p className="font-mono font-bold text-sm text-slate-900">{ewayBill.ewayBillNumber || 'N/A'}</p>
              <p className="text-slate-500 mt-2">Generated Date & Time:</p>
              <p className="font-semibold">{ewayBill.generatedAt ? new Date(ewayBill.generatedAt).toLocaleString('en-IN') : 'N/A'}</p>
            </div>
            <div>
              <p className="text-slate-500">Valid From:</p>
              <p className="font-semibold">{ewayBill.validFrom ? new Date(ewayBill.validFrom).toLocaleString('en-IN') : 'N/A'}</p>
              <p className="text-slate-500 mt-2">Valid Until:</p>
              <p className="font-bold text-emerald-700">{ewayBill.validUntil ? new Date(ewayBill.validUntil).toLocaleString('en-IN') : 'N/A'}</p>
            </div>
          </div>

          {/* Section 2: Part A — Goods & Address Details */}
          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-1.5 font-bold uppercase tracking-wider text-[11px] border-b border-slate-300">
              PART - A: Consignment & Address Details
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-300 p-3 text-xs">
              <div className="pr-3 space-y-1">
                <p className="font-bold text-slate-700">1. From (Origin / Dispatch)</p>
                <p className="font-bold text-slate-900">{ewayBill.fromTradeName}</p>
                <p className="font-mono text-slate-700">GSTIN: {ewayBill.fromGstin || 'URP (Unregistered)'}</p>
                <p className="text-slate-600">{ewayBill.fromAddress}</p>
                <p className="font-semibold">State: {ewayBill.fromState} — PIN: {ewayBill.fromPincode}</p>
              </div>

              <div className="pl-3 space-y-1">
                <p className="font-bold text-slate-700">2. To (Destination / Delivery)</p>
                <p className="font-bold text-slate-900">{ewayBill.toTradeName}</p>
                <p className="font-mono text-slate-700">GSTIN: {ewayBill.toGstin || 'URP (Unregistered)'}</p>
                <p className="text-slate-600">{ewayBill.toAddress}</p>
                <p className="font-semibold">State: {ewayBill.toState} — PIN: {ewayBill.toPincode}</p>
              </div>
            </div>

            <div className="border-t border-slate-300 p-3 grid grid-cols-3 gap-2 bg-slate-50 text-[11px]">
              <div>
                <span className="text-slate-500 block">Document Type & No:</span>
                <span className="font-semibold">{ewayBill.documentType} #{ewayBill.documentNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Document Date:</span>
                <span className="font-semibold">{ewayBill.documentDate}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Total Consignment Value:</span>
                <span className="font-mono font-bold text-slate-900">₹{ewayBill.totalInvoiceValue?.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Itemized Goods Table */}
          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold">
                  <th className="p-2 border-r border-slate-300">HSN</th>
                  <th className="p-2 border-r border-slate-300">Goods Description</th>
                  <th className="p-2 border-r border-slate-300 text-right">Quantity</th>
                  <th className="p-2 border-r border-slate-300 text-right">Taxable Value</th>
                  <th className="p-2 text-right">Tax Rates (C+S+I)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(ewayBill.items || []).map((it, idx) => (
                  <tr key={idx}>
                    <td className="p-2 border-r border-slate-300 font-mono">{it.hsnCode}</td>
                    <td className="p-2 border-r border-slate-300 font-medium">{it.productName}</td>
                    <td className="p-2 border-r border-slate-300 text-right">{it.quantity} {it.unit}</td>
                    <td className="p-2 border-r border-slate-300 text-right font-mono">₹{it.taxableValue?.toLocaleString('en-IN')}</td>
                    <td className="p-2 text-right font-mono">{(it.cgstRate || 0) + (it.sgstRate || 0) + (it.igstRate || 0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section 4: Part B — Transportation Details */}
          <div className="border border-slate-300 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-1.5 font-bold uppercase tracking-wider text-[11px] border-b border-slate-300">
              PART - B: Transportation & Vehicle Details
            </div>
            <div className="p-3 grid grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block">Mode of Transport:</span>
                <span className="font-bold">{ewayBill.transportMode}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Vehicle Number:</span>
                <span className="font-mono font-bold uppercase">{ewayBill.vehicleNumber || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Transporter Name:</span>
                <span className="font-semibold">{ewayBill.transporterName || 'Self / Local Transport'}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Approx Distance:</span>
                <span className="font-mono font-bold">{ewayBill.approxDistanceKm} Km</span>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="border-t border-slate-300 pt-4 flex items-center justify-between text-[10px] text-slate-500">
            <p>Generated by VISTAAR Business OS Compliance Engine • Indian GST System</p>
            <p>Page 1 of 1</p>
          </div>
        </div>
      </div>
    </div>
  );
};
