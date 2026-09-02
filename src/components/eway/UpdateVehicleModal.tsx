import React, { useState } from 'react';
import { Bus, RefreshCw, AlertCircle, X } from 'lucide-react';
import { EwayBill, VehicleType } from '../../types';
import { ewayBillApiService } from '../../services/ewayBillApiService';
import { ewayBillService } from '../../services/supabase';

interface UpdateVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  ewayBill: EwayBill | null;
  onSuccess?: () => void;
}

export const UpdateVehicleModal: React.FC<UpdateVehicleModalProps> = ({
  isOpen,
  onClose,
  ewayBill,
  onSuccess,
}) => {
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('REGULAR');
  const [reasonCode, setReasonCode] = useState('1'); // '1': Breakdown, '2': Transporter Change, '3': Others
  const [remarks, setRemarks] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !ewayBill) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleNumber.trim()) {
      setErrorMsg('Vehicle Registration Number is required.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const cleanVeh = vehicleNumber.replace(/[\s-]/g, '').toUpperCase();

    try {
      // Step 1: Call API provider
      const apiRes = await ewayBillApiService.updateVehicle({
        ewayBillNumber: ewayBill.ewayBillNumber || '',
        vehicleNumber: cleanVeh,
        vehicleType,
        fromPlace: ewayBill.fromPlace || ewayBill.fromState,
        fromState: ewayBill.fromState,
        reasonCode,
        remarks,
      });

      if (!apiRes.success) {
        setErrorMsg(apiRes.error || 'Failed to update vehicle details with NIC system.');
        setSaving(false);
        return;
      }

      // Step 2: Update local database
      await ewayBillService.updateEwayBill(
        ewayBill.id,
        {
          vehicleNumber: cleanVeh,
          vehicleType,
          validUntil: apiRes.validUntil || ewayBill.validUntil,
        },
        'VEHICLE_UPDATED',
        `Vehicle updated to ${cleanVeh} (Reason: ${reasonCode === '1' ? 'Breakdown' : reasonCode === '2' ? 'Transporter Change' : 'Others'})`
      );

      setSaving(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (e: any) {
      setSaving(false);
      setErrorMsg(e?.message || 'Error updating vehicle information.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Bus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base font-mono">
                Update Vehicle Details
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

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              New Vehicle Number *
            </label>
            <input
              type="text"
              placeholder="e.g. UP32XY9999"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-mono uppercase"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Cargo Type *
            </label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            >
              <option value="REGULAR">Regular Cargo</option>
              <option value="OVER_DIMENSIONAL_CARGO">Over Dimensional Cargo (ODC)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Reason for Update *
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white"
            >
              <option value="1">Transporter / Vehicle Breakdown</option>
              <option value="2">Transporter Change</option>
              <option value="3">First Time Vehicle Entry</option>
              <option value="4">Others</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Remarks
            </label>
            <input
              type="text"
              placeholder="e.g. Engine breakdown near Kanpur bypass"
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
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md"
            >
              <RefreshCw className="w-4 h-4" />
              {saving ? 'Updating...' : 'Update Vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
