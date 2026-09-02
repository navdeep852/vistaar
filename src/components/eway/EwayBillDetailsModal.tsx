import React from 'react';
import {
  FileText,
  Truck,
  MapPin,
  Clock,
  Printer,
  X,
  History,
  AlertTriangle,
  Calendar,
  Building2,
  RefreshCw,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { EwayBill } from '../../types';

interface EwayBillDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  ewayBill: EwayBill | null;
  onPrint?: (ewb: EwayBill) => void;
  onUpdateVehicle?: (ewb: EwayBill) => void;
  onExtendValidity?: (ewb: EwayBill) => void;
  onCancel?: (ewb: EwayBill) => void;
}

export const EwayBillDetailsModal: React.FC<EwayBillDetailsModalProps> = ({
  isOpen,
  onClose,
  ewayBill,
  onPrint,
  onUpdateVehicle,
  onExtendValidity,
  onCancel,
}) => {
  if (!isOpen || !ewayBill) return null;

  const isCancelled = ewayBill.status === 'CANCELLED';
  const isExpired = ewayBill.status === 'EXPIRED';
  const isActive = ewayBill.status === 'ACTIVE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-lg font-mono">
                  {ewayBill.ewayBillNumber ? `EWB #${ewayBill.ewayBillNumber}` : `Draft EWB`}
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : isCancelled
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      : isExpired
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20'
                  }`}
                >
                  {ewayBill.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Document Ref: #{ewayBill.documentNumber} ({ewayBill.documentDate})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onPrint && (
              <button
                onClick={() => onPrint(ewayBill)}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Print / Download
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Action Toolbar for Active EWBs */}
          {isActive && (
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-500" />
                Legal Validity: {ewayBill.validUntil ? new Date(ewayBill.validUntil).toLocaleString('en-IN') : 'N/A'}
              </span>

              <div className="flex items-center gap-2">
                {onUpdateVehicle && (
                  <button
                    onClick={() => onUpdateVehicle(ewayBill)}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-blue-500" />
                    Update Vehicle
                  </button>
                )}
                {onExtendValidity && (
                  <button
                    onClick={() => onExtendValidity(ewayBill)}
                    className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    Extend Validity
                  </button>
                )}
                {onCancel && (
                  <button
                    onClick={() => onCancel(ewayBill)}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Cancel EWB
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Grid: Origin vs Destination */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-blue-500" />
                Dispatch From (Origin)
              </h4>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{ewayBill.fromTradeName}</p>
              {ewayBill.fromGstin && (
                <p className="text-xs font-mono text-slate-600 dark:text-slate-400">GSTIN: {ewayBill.fromGstin}</p>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-400">{ewayBill.fromAddress}</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {ewayBill.fromState} — <span className="font-mono">{ewayBill.fromPincode}</span>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-emerald-500" />
                Delivery Destination (To)
              </h4>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{ewayBill.toTradeName}</p>
              {ewayBill.toGstin && (
                <p className="text-xs font-mono text-slate-600 dark:text-slate-400">GSTIN: {ewayBill.toGstin}</p>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-400">{ewayBill.toAddress}</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {ewayBill.toState} — <span className="font-mono">{ewayBill.toPincode}</span>
              </p>
            </div>
          </div>

          {/* Transport & Distance */}
          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Transport Mode</span>
              <span className="font-bold text-slate-900 dark:text-white">{ewayBill.transportMode}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Vehicle Number</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white uppercase">
                {ewayBill.vehicleNumber || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Cargo Type</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {ewayBill.vehicleType === 'OVER_DIMENSIONAL_CARGO' ? 'ODC Cargo' : 'Regular'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Approx Distance</span>
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                {ewayBill.approxDistanceKm} Km
              </span>
            </div>
          </div>

          {/* Goods Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Consignment Goods Line Items ({ewayBill.items?.length || 0})
            </h4>
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-3 py-2">Item Description</th>
                    <th className="px-3 py-2 font-mono">HSN Code</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                    <th className="px-3 py-2 text-right font-mono">Taxable Value</th>
                    <th className="px-3 py-2 text-right font-mono">GST Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(ewayBill.items || []).map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/50">
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{it.productName}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">{it.hsnCode}</td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium">
                        ₹{it.taxableValue?.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-blue-600 dark:text-blue-400">
                        ₹{((it.cgstAmount || 0) + (it.sgstAmount || 0) + (it.igstAmount || 0)).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Event Timeline */}
          {ewayBill.events && ewayBill.events.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                <History className="w-4 h-4 text-purple-500" />
                Compliance Lifecycle Audit Log
              </h4>
              <div className="space-y-2 text-xs">
                {ewayBill.events.map((evt, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{evt.eventType}</span> —{' '}
                      <span className="text-slate-600 dark:text-slate-400">{evt.remarks}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(evt.eventTime).toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
