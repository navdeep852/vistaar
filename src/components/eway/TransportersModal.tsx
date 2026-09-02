import React, { useState, useEffect } from 'react';
import { Truck, Plus, Trash2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { Transporter } from '../../types';
import { transporterService } from '../../services/supabase';

interface TransportersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTransporter?: (transporter: Transporter) => void;
}

export const TransportersModal: React.FC<TransportersModalProps> = ({
  isOpen,
  onClose,
  onSelectTransporter,
}) => {
  const [transporters, setTransporters] = useState<Transporter[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [name, setName] = useState('');
  const [gstinTransporterId, setGstinTransporterId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('Uttar Pradesh');
  const [pincode, setPincode] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadTransporters = async () => {
    setLoading(true);
    const { data } = await transporterService.getTransporters();
    setTransporters(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadTransporters();
    }
  }, [isOpen]);

  const handleAddTransporter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Transporter Name is required.');
      return;
    }
    if (!gstinTransporterId.trim()) {
      setErrorMsg('GSTIN or Transporter ID is required.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const { data, error } = await transporterService.createTransporter({
      name: name.trim(),
      gstinTransporterId: gstinTransporterId.trim().toUpperCase(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      status: 'ACTIVE',
    });

    setSaving(false);

    if (error) {
      setErrorMsg(error);
    } else if (data) {
      setName('');
      setGstinTransporterId('');
      setPhone('');
      setEmail('');
      setAddress('');
      setPincode('');
      loadTransporters();
      if (onSelectTransporter) {
        onSelectTransporter(data);
        onClose();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this transporter?')) {
      await transporterService.deleteTransporter(id);
      loadTransporters();
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
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">Transporter Master</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage transporters and GSTIN Transporter IDs for E-Way Bills
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
          <form onSubmit={handleAddTransporter} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-500" />
              Add New Transporter
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Transporter Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. VRL Logistics Ltd."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  GSTIN / Transporter ID *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 29AABCV1234F1Z5"
                  value={gstinTransporterId}
                  onChange={(e) => setGstinTransporterId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-xs font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. +91 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  State
                </label>
                <input
                  type="text"
                  placeholder="e.g. Uttar Pradesh"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
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
                {saving ? 'Saving...' : 'Add Transporter'}
              </button>
            </div>
          </form>

          {/* List */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Saved Transporters ({transporters.length})
            </h4>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading transporters...</div>
            ) : transporters.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No transporters saved yet. Add your first transporter above.
              </div>
            ) : (
              <div className="space-y-2">
                {transporters.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {t.name}
                        <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          {t.gstinTransporterId}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {t.phone ? `Phone: ${t.phone}` : ''} {t.state ? `• State: ${t.state}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {onSelectTransporter && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectTransporter(t);
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
                        onClick={() => handleDelete(t.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Delete Transporter"
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
