import { useState, useEffect, FormEvent } from 'react';
import { MapPin, Plus, Trash2, CheckCircle2, AlertCircle, X, Building2 } from 'lucide-react';
import { BusinessLocation, BusinessLocationType } from '../../types';
import { locationService } from '../../services/supabase';

interface LocationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation?: (location: BusinessLocation) => void;
}

export const LocationsModal = ({
  isOpen,
  onClose,
  onSelectLocation,
}: LocationsModalProps) => {
  const [locations, setLocations] = useState<BusinessLocation[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [locationName, setLocationName] = useState('');
  const [locationType, setLocationType] = useState<BusinessLocationType>('WAREHOUSE');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Uttar Pradesh');
  const [pincode, setPincode] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadLocations = async () => {
    setLoading(true);
    const { data } = await locationService.getLocations();
    setLocations(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadLocations();
    }
  }, [isOpen]);

  const handleAddLocation = async (e: FormEvent) => {
    e.preventDefault();
    if (!locationName.trim()) {
      setErrorMsg('Location Name is required.');
      return;
    }
    if (!address.trim()) {
      setErrorMsg('Address is required.');
      return;
    }
    if (!pincode.trim() || pincode.length !== 6) {
      setErrorMsg('A valid 6-digit Indian PIN Code is required.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const { data, error } = await locationService.createLocation({
      locationName: locationName.trim(),
      locationType,
      gstin: gstin.trim().toUpperCase(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      isDefault: locations.length === 0,
    });

    setSaving(false);

    if (error) {
      setErrorMsg(error);
    } else if (data) {
      setLocationName('');
      setGstin('');
      setAddress('');
      setCity('');
      setPincode('');
      loadLocations();
      if (onSelectLocation) {
        onSelectLocation(data);
        onClose();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this dispatch location?')) {
      await locationService.deleteLocation(id);
      loadLocations();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">Dispatch Locations Master</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage multiple business warehouses, factories, and godowns for E-Way Bill origin dispatch
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
          <form onSubmit={handleAddLocation} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Plus className="w-4 h-4 text-purple-500" />
              Add New Location
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Location Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Central Warehouse Unit 2"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Location Type *
                </label>
                <select
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value as BusinessLocationType)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-xs"
                >
                  <option value="REGISTERED">Registered Office</option>
                  <option value="WAREHOUSE">Warehouse</option>
                  <option value="GODOWN">Godown</option>
                  <option value="FACTORY">Factory</option>
                  <option value="BRANCH">Branch</option>
                  <option value="OTHER">Other Place of Business</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Address *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Plot No 45, Transport Nagar, Kanpur Road"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  State *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Uttar Pradesh"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  PIN Code *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 208001"
                  value={pincode}
                  maxLength={6}
                  onChange={(e) => setPincode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-xs font-mono"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-md shadow-purple-600/20"
              >
                <Plus className="w-4 h-4" />
                {saving ? 'Saving...' : 'Add Location'}
              </button>
            </div>
          </form>

          {/* List */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Saved Dispatch Points ({locations.length})
            </h4>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading locations...</div>
            ) : locations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No dispatch locations saved yet. Add your first location above.
              </div>
            ) : (
              <div className="space-y-2">
                {locations.map((loc) => (
                  <div
                    key={loc.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-purple-500" />
                        {loc.locationName}
                        <span className="px-2 py-0.5 text-[10px] font-semibold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          {loc.locationType}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {loc.address}, {loc.state} — <span className="font-mono">{loc.pincode}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {onSelectLocation && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectLocation(loc);
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
                        onClick={() => handleDelete(loc.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Delete Location"
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
