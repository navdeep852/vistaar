import React, { useEffect, useState } from 'react';
import { PurchaseOrder } from '../../types';
import { businessSettingsService } from '../../services/supabase';
import logoDarkText from '../../assets/Vistaar_Logo_With_Name.png';

interface PurchaseOrderPrintDocumentProps {
  ewayBill?: any; // fallback compatibility if embedded
  purchaseOrder: PurchaseOrder;
}

export const PurchaseOrderPrintDocument: React.FC<PurchaseOrderPrintDocumentProps> = ({ purchaseOrder }) => {
  const [business, setBusiness] = useState<any>(null);

  useEffect(() => {
    const loadBusiness = async () => {
      const res = await businessSettingsService.getBusinessSettings();
      if (res.data) {
        setBusiness(res.data);
      }
    };
    loadBusiness();
  }, []);

  const po = purchaseOrder;
  const companyName = business?.company_name || business?.name || 'VISTAAR ENTERPRISES';
  const companyAddress = business?.address || 'Main Commercial Market, City';
  const companyPhone = business?.phone || business?.mobile || '';
  const companyGstin = business?.gstin || '';
  const companyEmail = business?.email || '';

  return (
    <div className="bg-white text-slate-900 font-sans text-xs p-8 max-w-[210mm] mx-auto min-h-[297mm] flex flex-col justify-between border border-slate-200 shadow-lg print:shadow-none print:border-none print:max-w-none print:w-full print:p-0">
      <div>
        {/* Document Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
          <div>
            <img src={logoDarkText} alt="VISTAAR" className="h-10 w-auto mb-2 object-contain" />
            <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">PURCHASE ORDER</h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider uppercase">Commercial Supply Order</p>
          </div>

          <div className="text-right">
            <div className="inline-block bg-slate-900 text-white px-3 py-1 font-mono font-bold text-sm rounded mb-2">
              {po.poNumber}
            </div>
            <p className="text-slate-600 font-medium">Date: <span className="font-bold text-slate-900">{po.poDate}</span></p>
            {po.expectedDeliveryDate && (
              <p className="text-slate-600 font-medium">Expected Delivery: <span className="font-bold text-slate-900">{po.expectedDeliveryDate}</span></p>
            )}
            {po.referenceNumber && (
              <p className="text-slate-600 font-medium">Ref No: <span className="font-bold text-slate-900">{po.referenceNumber}</span></p>
            )}
            <div className="mt-1">
              <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded uppercase border border-slate-400 bg-slate-100 text-slate-800">
                STATUS: {po.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        </div>

        {/* Addresses Grid */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Buyer Details */}
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">BUYER (ORDER ISSUED BY):</p>
            <h2 className="font-bold text-sm text-slate-900">{companyName}</h2>
            <p className="text-slate-600 whitespace-pre-line mt-1">{companyAddress}</p>
            {companyPhone && <p className="text-slate-600 mt-1">Phone: {companyPhone}</p>}
            {companyEmail && <p className="text-slate-600">Email: {companyEmail}</p>}
            {companyGstin && <p className="font-mono font-bold text-slate-900 mt-1">GSTIN: {companyGstin}</p>}
          </div>

          {/* Supplier Details */}
          <div className="p-3 bg-slate-50 rounded border border-slate-200">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">SUPPLIER (VENDOR):</p>
            <h2 className="font-bold text-sm text-slate-900">{po.supplierName || 'Supplier'}</h2>
            <p className="text-slate-600 whitespace-pre-line mt-1">{po.supplierAddress || 'Address N/A'}</p>
            {po.supplierPhone && <p className="text-slate-600 mt-1">Phone: {po.supplierPhone}</p>}
            {po.supplierGstin && <p className="font-mono font-bold text-slate-900 mt-1">GSTIN: {po.supplierGstin}</p>}
            {po.paymentTerms && <p className="text-slate-600 mt-1">Terms: <span className="font-semibold text-slate-800">{po.paymentTerms}</span></p>}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mb-6 overflow-hidden rounded border border-slate-300">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Product Description</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-right">Discount</th>
                <th className="py-2.5 px-3 text-right">Tax Rate</th>
                <th className="py-2.5 px-3 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {(po.items || []).map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                  <td className="py-2.5 px-3 font-medium">
                    <p className="font-bold text-slate-900">{item.productName}</p>
                    {item.productSku && <p className="text-[10px] text-slate-500 font-mono">SKU: {item.productSku}</p>}
                    {item.description && <p className="text-[10px] text-slate-600 italic mt-0.5">{item.description}</p>}
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold font-mono">
                    {item.quantity} {item.unit || 'Pcs'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono">₹{item.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                    {item.discountAmount && item.discountAmount > 0 ? `₹${item.discountAmount.toFixed(2)}` : '-'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600">{item.taxRate || 0}%</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                    ₹{(item.lineTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown & Notes */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="space-y-3">
            {po.notes && (
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Order Notes:</p>
                <p className="text-slate-700 whitespace-pre-line text-xs">{po.notes}</p>
              </div>
            )}

            {po.termsConditions && (
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Terms & Conditions:</p>
                <p className="text-slate-700 whitespace-pre-line text-xs">{po.termsConditions}</p>
              </div>
            )}
          </div>

          {/* Financial Summary */}
          <div className="p-4 bg-slate-50 rounded border border-slate-300 space-y-2 font-mono">
            <div className="flex justify-between text-slate-600 text-xs">
              <span>Subtotal:</span>
              <span>₹{(po.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            {po.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-700 text-xs">
                <span>Discount:</span>
                <span>-₹{(po.discountAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 text-xs">
              <span>Taxable Value:</span>
              <span>₹{(po.taxableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-slate-600 text-xs">
              <span>GST Total Tax:</span>
              <span>₹{(po.taxAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="border-t border-slate-300 pt-2 flex justify-between font-black text-sm text-slate-900">
              <span>GRAND TOTAL:</span>
              <span className="text-base text-blue-900">₹{(po.grandTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Authorized Signature Footer */}
      <div className="border-t border-slate-300 pt-6 flex justify-between items-end mt-8">
        <div>
          <p className="text-[10px] text-slate-400">Computer generated Purchase Order document generated via VISTAAR ERP.</p>
          <p className="text-[10px] text-slate-400">Valid without physical signature if transmitted electronically.</p>
        </div>

        <div className="text-center w-48">
          <div className="border-b border-slate-400 h-12 mb-1" />
          <p className="font-bold text-slate-900 text-xs">{companyName}</p>
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Authorized Signatory</p>
        </div>
      </div>
    </div>
  );
};
