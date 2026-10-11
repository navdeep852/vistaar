import React from 'react';
import { InvoiceData } from './types';
import { formatCurrency, formatDate } from './helpers';

interface InvoicePaymentHistoryProps {
  invoice: InvoiceData;
  currency?: string;
  className?: string;
}

export const InvoicePaymentHistory: React.FC<InvoicePaymentHistoryProps> = ({
  invoice,
  currency = '₹',
  className = '',
}) => {
  const payments = invoice.payments || [];
  const grandTotal = Number(invoice.grandTotal || 0);
  const paidAmount = Number(invoice.paidAmount || 0);
  const balanceAmount = Number(invoice.balanceAmount || 0);
  const isPaid = balanceAmount <= 0.01 && grandTotal > 0;
  const isPartial = paidAmount > 0 && !isPaid;

  // If there are no payments recorded and nothing was paid, hide payment history table
  if (payments.length === 0 && paidAmount <= 0) {
    return null;
  }

  return (
    <div
      className={`invoice-payment-history-block mx-6 my-4 p-5 rounded-2xl border border-slate-200 bg-slate-50/70 text-slate-800 ${className}`}
      style={{ pageBreakInside: 'avoid' }}
    >
      {/* SECTION HEADER */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
            Payment Summary & Transaction History
          </h4>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
            isPaid
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              : isPartial
              ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
              : 'bg-amber-100 text-amber-900 border border-amber-300'
          }`}
        >
          {isPaid ? 'PAID ✓' : isPartial ? 'PARTIALLY PAID' : 'UNPAID'}
        </span>
      </div>

      {/* PAYMENT TRANSACTIONS TABLE */}
      {payments.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2 px-1">#</th>
                <th className="py-2 px-2">Payment Date</th>
                <th className="py-2 px-2">Payment / Reference</th>
                <th className="py-2 px-2">Payment Method</th>
                <th className="py-2 px-1 text-right">Amount Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {payments.map((p, idx) => (
                <tr key={p.id || idx} className="hover:bg-slate-100/50 transition-colors">
                  <td className="py-2 px-1 text-slate-400 text-[11px] font-mono">
                    {idx + 1}
                  </td>
                  <td className="py-2 px-2 text-slate-900 font-semibold">
                    {formatDate(p.date)}
                  </td>
                  <td className="py-2 px-2 text-slate-600">
                    <span className="font-mono text-[11px] font-semibold text-slate-700">
                      {p.paymentNumber || p.id || `Payment #${idx + 1}`}
                    </span>
                    {p.reference && (
                      <span className="ml-1.5 text-[10px] text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded">
                        Ref: {p.reference}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-700 font-medium">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-semibold">
                      {p.method || 'Cash'}
                    </span>
                  </td>
                  <td className="py-2 px-1 text-right font-black text-emerald-700 font-mono text-xs">
                    {formatCurrency(p.amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Fallback if paid amount exists but discrete payment rows were not captured */
        <div className="text-xs py-2 text-slate-600 flex justify-between">
          <span>Initial recorded payment on purchase date:</span>
          <span className="font-bold text-emerald-700 font-mono">{formatCurrency(paidAmount, currency)}</span>
        </div>
      )}

      {/* SUMMARY FOOTER (ORIGINAL TOTAL, TOTAL PAID, OUTSTANDING) */}
      <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
          <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Invoice</span>
          <span className="font-extrabold text-slate-900 font-mono text-sm">
            {formatCurrency(grandTotal, currency)}
          </span>
        </div>
        <div className="bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200">
          <span className="text-[10px] uppercase font-bold text-emerald-700 block">Total Paid</span>
          <span className="font-black text-emerald-700 font-mono text-sm">
            {formatCurrency(paidAmount, currency)}
          </span>
        </div>
        <div className={`p-2.5 rounded-xl border ${isPaid ? 'bg-emerald-50/40 border-emerald-200' : 'bg-amber-50/70 border-amber-200'}`}>
          <span className={`text-[10px] uppercase font-bold block ${isPaid ? 'text-emerald-700' : 'text-amber-800'}`}>
            Outstanding
          </span>
          <span className={`font-black font-mono text-sm ${isPaid ? 'text-emerald-700' : 'text-amber-800'}`}>
            {formatCurrency(balanceAmount, currency)}
          </span>
        </div>
      </div>
    </div>
  );
};
