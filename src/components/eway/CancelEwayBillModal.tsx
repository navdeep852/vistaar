import React, { useState } from 'react';
import { Ban, AlertCircle, X } from 'lucide-react';
import { EwayBill } from '../../types';
import { ewayBillApiService } from '../../services/ewayBillApiService';
import { ewayBillService } from '../../services/supabase';

interface CancelEwayBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  ewayBill: EwayBill | null;
  onSuccess?: () => void;
}

export const CancelEwayBillModal: React.FC<CancelEwayBillModalProps> = ({
  isOpen,
  onClose,
  ewayBill,
  onSuccess,
}) => {
  const [cancelReasonCode, setCancelReasonCode] = useState('1'); // '1': Duplicate, '2': Order Cancelled, '3': Data Entry Mistake, '4': Others
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !ewayBill) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      // Step 1: Call API provider
      const apiRes = await ewayBillApiService.cancelEwayBill({
        ewayBillNumber: ewayBill.ewayBillNumber || '',
        cancelReasonCode,
        remarks,
      });

      if (!apiRes.success) {
        setErrorMsg(apiRes.error || 'Failed to cancel E-Way Bill with NIC system.');
        setSaving(false);
        return;
      }

      // Step 2: Update local database
      await ewayBillService.updateEwayBill(
        ewayBill.id,
        {
          status: 'CANCELLED',
          cancelledAt: apiRes.cancelledAt || new Date().toISOString(),
          cancellationReason: cancelReasonCode === '1' ? 'Duplicate Generation' : cancelReasonCode === '2' ? 'Order Cancelled' : cancelReasonCode === '3' ? 'Data Entry Mistake' : 'Others',
          cancellationRemarks: remarks,
        },
        'CANCELLED',
        `E-Way Bill Cancelled (Reason Code: ${cancelReasonCode})`
      );

      setSaving(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (e: any) {
      setSaving(false);
      setErrorMsg(e?.message || 'Error cancelling E-Way Bill.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-rose-500/5 dark:bg-rose-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base font-mono">
                Cancel E-Way Bill
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                EWB #{ewayBill.ewayBillNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs">
            Notice: E-Way Bills can only be cancelled within 24 hours of generation in accordance with GST Rules.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Cancellation Reason *
            </label>
            <select
              value={cancelReasonCode}
              onChange={(e) => setCancelReasonCode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            >
              <option value="1">Duplicate E-Way Bill Generation</option>
              <option value="2">Order / Transport Cancelled</option>
              <option value="3">Data Entry Mistake</option>
              <option value="4">Others</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Remarks
            </label>
            <input
              type="text"
              placeholder="e.g. Duplicate EWB generated by mistake"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
            >
              <Ban className="w-4 h-4" />
              {saving ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
