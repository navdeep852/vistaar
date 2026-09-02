import { useState, useEffect, FormEvent } from 'react';
import { Bus, Plus, Trash2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { Vehicle, VehicleType } from '../../types';
import { vehicleService } from '../../services/supabase';

interface VehiclesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVehicle?: (vehicle: Vehicle) => void;
}

export const VehiclesModal = ({
  isOpen,
  onClose,
  onSelectVehicle,
}: VehiclesModalProps) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('REGULAR');
  const [ownerName, setOwnerName] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadVehicles = async () => {
    setLoading(true);
    const { data } = await vehicleService.getVehicles();
    setVehicles(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadVehicles();
    }
  }, [isOpen]);

  const handleAddVehicle = async (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleNumber.trim()) {
      setErrorMsg('Vehicle Registration Number is required.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const { data, error } = await vehicleService.createVehicle({
      vehicleNumber: vehicleNumber.replace(/[\s-]/g, '').toUpperCase(),
      vehicleType,
      ownerName: ownerName.trim(),
      status: 'ACTIVE',
    });

    setSaving(false);

    if (error) {
      setErrorMsg(error);
    } else if (data) {
      setVehicleNumber('');
      setOwnerName('');
      loadVehicles();
      if (onSelectVehicle) {
        onSelectVehicle(data);
        onClose();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this vehicle?')) {
      await vehicleService.deleteVehicle(id);
      loadVehicles();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Bus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">Vehicle Master</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage vehicle registration numbers and cargo types for transport updates
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

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAddVehicle} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-500" />
              Add New Vehicle
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vehicle Number *
                </label>
                <input
                  type="text"
                  placeholder="e.g. UP32AB1234"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-xs font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vehicle Type *
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-xs"
                >
                  <option value="REGULAR">Regular Cargo</option>
                  <option value="OVER_DIMENSIONAL_CARGO">Over Dimensional Cargo (ODC)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Owner / Driver Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-xs"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md shadow-blue-600/20"
              >
                <Plus className="w-4 h-4" />
                {saving ? 'Saving...' : 'Add Vehicle'}
              </button>
            </div>
          </form>

          {/* List */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Saved Vehicles ({vehicles.length})
            </h4>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading vehicles...</div>
            ) : vehicles.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No vehicles saved yet. Add your first vehicle above.
              </div>
            ) : (
              <div className="space-y-2">
                {vehicles.map((v) => (
                  <div
                    key={v.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 font-mono">
                        {v.vehicleNumber}
                        <span className="px-2 py-0.5 text-[10px] font-sans font-semibold rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          {v.vehicleType === 'OVER_DIMENSIONAL_CARGO' ? 'ODC Cargo' : 'Regular'}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {v.ownerName ? `Owner: ${v.ownerName}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {onSelectVehicle && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectVehicle(v);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Select
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(v.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Delete Vehicle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
