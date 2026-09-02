import React, { useState } from 'react';
import { Clock, AlertCircle, X } from 'lucide-react';
import { EwayBill } from '../../types';
import { ewayBillApiService } from '../../services/ewayBillApiService';
import { ewayBillService } from '../../services/supabase';

interface ExtendValidityModalProps {
  isOpen: boolean;
  onClose: () => void;
  ewayBill: EwayBill | null;
  onSuccess?: () => void;
}

export const ExtendValidityModal: React.FC<ExtendValidityModalProps> = ({
  isOpen,
  onClose,
  ewayBill,
  onSuccess,
}) => {
  const [currentPincode, setCurrentPincode] = useState('');
  const [currentPlace, setCurrentPlace] = useState('');
  const [remainingDistanceKm, setRemainingDistanceKm] = useState(50);
  const [reasonCode, setReasonCode] = useState('1'); // '1': Natural Calamity, '2': Law & Order, '3': Transporter Breakdown, '4': Accidental, '5': Others
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !ewayBill) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (remainingDistanceKm <= 0) {
      setErrorMsg('Remaining distance must be > 0 km.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      // Step 1: Call API provider
      const apiRes = await ewayBillApiService.extendValidity({
        ewayBillNumber: ewayBill.ewayBillNumber || '',
        currentPincode,
        currentPlace,
        remainingDistanceKm,
        reasonCode,
        remarks,
      });

      if (!apiRes.success) {
        setErrorMsg(apiRes.error || 'Failed to extend legal validity with NIC system.');
        setSaving(false);
        return;
      }

      // Step 2: Update local database
      await ewayBillService.updateEwayBill(
        ewayBill.id,
        {
          validUntil: apiRes.validUntil || ewayBill.validUntil,
        },
        'VALIDITY_EXTENDED',
        `Validity extended for ${remainingDistanceKm} km remaining distance`
      );

      setSaving(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (e: any) {
      setSaving(false);
      setErrorMsg(e?.message || 'Error extending validity.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base font-mono">
                Extend E-Way Bill Validity
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Current Location / City
              </label>
              <input
                type="text"
                placeholder="e.g. Etawah Bypass"
                value={currentPlace}
                onChange={(e) => setCurrentPlace(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Current PIN Code
              </label>
              <input
                type="text"
                placeholder="e.g. 206001"
                maxLength={6}
                value={currentPincode}
                onChange={(e) => setCurrentPincode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Remaining Distance to Destination (Km) *
            </label>
            <input
              type="number"
              value={remainingDistanceKm}
              onChange={(e) => setRemainingDistanceKm(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono font-bold"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Reason for Extension *
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            >
              <option value="1">Natural Calamity / Heavy Rain</option>
              <option value="2">Law & Order / Traffic Blockade</option>
              <option value="3">Transporter Vehicle Breakdown</option>
              <option value="4">Accidental Delay</option>
              <option value="5">Others</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Remarks
            </label>
            <input
              type="text"
              placeholder="e.g. Delayed due to highway maintenance block"
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
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
            >
              <Clock className="w-4 h-4" />
              {saving ? 'Extending...' : 'Extend Validity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
