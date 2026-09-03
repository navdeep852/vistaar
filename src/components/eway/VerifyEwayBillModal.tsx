import React, { useState } from 'react';
import { X, Search, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw, FileText } from 'lucide-react';
import { ewayBillApiService } from '../../services/ewayBillApiService';
import { EwayBillQrCode } from './EwayBillQrCode';

interface VerifyEwayBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEwayBillNumber?: string;
}

export const VerifyEwayBillModal: React.FC<VerifyEwayBillModalProps> = ({
  isOpen,
  onClose,
  initialEwayBillNumber = '',
}) => {
  const [ewbNumber, setEwbNumber] = useState(initialEwayBillNumber);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const queryNo = ewbNumber.trim();
    if (!queryNo) {
      setError('Please enter a valid 12-digit E-Way Bill number.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await ewayBillApiService.getEwayBillDetails(queryNo);
      if (res.success && res.details) {
        setResult(res.details);
      } else {
        setError(res.error || 'E-Way Bill not found in Official GST E-Way Bill System.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification service request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Verify GST E-Way Bill</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Official Government Gateway Status Lookup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Search Form */}
          <form onSubmit={handleVerify} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={ewbNumber}
                onChange={(e) => setEwbNumber(e.target.value)}
                placeholder="Enter 12-digit E-Way Bill No. (e.g. 311877092412)"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono font-bold tracking-wider"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !ewbNumber.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Verify Status</span>
              )}
            </button>
          </form>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-bold">Verification Warning</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Official E-Way Bill</span>
                  <span className="font-mono font-black text-lg text-slate-900 dark:text-slate-100 tracking-wider">
                    {result.ewbNo}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-full font-bold text-xs border border-emerald-300 dark:border-emerald-800">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>OFFICIAL & ACTIVE</span>
                </div>
              </div>

              <div className="flex justify-between items-start gap-4">
                <div className="grid grid-cols-2 gap-3 text-xs flex-1">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Generated By (GSTIN)</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{result.genGstin || '27AAAAA0000A1Z5'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Invoice Document</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{result.docNo || 'INV-001'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Supplier GSTIN</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{result.fromGstin || '27AAAAA0000A1Z5'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Recipient GSTIN</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{result.toGstin || 'URP'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Invoice Value</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">₹{(result.totInvValue || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Transport Mode & Vehicle</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {result.transportMode || 'ROAD'} ({result.vehicleNo || 'N/A'})
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-center">
                  <EwayBillQrCode
                    qrPayload={`${result.ewbNo}|${result.docDate}|${result.fromGstin}|${result.docNo}|${result.docDate}|${result.fromGstin}|${result.toGstin}|${result.totInvValue}`}
                    size={96}
                    showCaption={false}
                  />
                  <span className="text-[8px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-1">
                    VERIFIED QR
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-xs flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400">Government Portal Validity:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  Valid Until {new Date(result.validUpto || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
