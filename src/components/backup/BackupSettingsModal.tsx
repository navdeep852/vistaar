import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Trash2,
  Lock,
  Save,
  Check,
} from 'lucide-react';
import { Modal } from '../Modal';
import { BackupSettings } from '../../services/backup/backupTypes';

interface BackupSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BackupSettings;
  onSave: (updated: Partial<BackupSettings>) => Promise<void>;
}

export const BackupSettingsModal: React.FC<BackupSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(settings.autoBackupEnabled);
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>(
    settings.frequency === 'weekly' ? 'weekly' : 'daily'
  );
  const [preferredTime, setPreferredTime] = useState(settings.preferredTime || '23:00');
  const [retentionDailyCount, setRetentionDailyCount] = useState(settings.retentionDailyCount || 7);
  const [retentionWeeklyCount, setRetentionWeeklyCount] = useState(settings.retentionWeeklyCount || 4);
  const [retentionMonthlyCount, setRetentionMonthlyCount] = useState(settings.retentionMonthlyCount || 3);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        autoBackupEnabled,
        frequency,
        preferredTime,
        retentionDailyCount: Number(retentionDailyCount),
        retentionWeeklyCount: Number(retentionWeeklyCount),
        retentionMonthlyCount: Number(retentionMonthlyCount),
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Automatic Backup & Retention Settings">
      <form onSubmit={handleSubmit} className="space-y-6 text-slate-800 dark:text-slate-200">
        {/* Toggle Automatic Backup */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Enable Scheduled Automated Backups
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              VISTAAR will generate backups and save them to your connected local OneDrive folder.
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoBackupEnabled}
              onChange={(e) => setAutoBackupEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600" />
          </label>
        </div>

        {/* Frequency & Time */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Backup Frequency
            </label>
            <select
              value={frequency}
              disabled={!autoBackupEnabled}
              onChange={(e) => setFrequency(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="daily">Daily Snapshot (Every 24 Hours)</option>
              <option value="weekly">Weekly Snapshot (Every 7 Days)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Target Scheduled Time
            </label>
            <input
              type="time"
              value={preferredTime}
              disabled={!autoBackupEnabled}
              onChange={(e) => setPreferredTime(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Retention Policy */}
        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            Retention &amp; Pruning Rules
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Automatically prune older backup files to conserve disk space. VISTAAR will never delete
            the only valid backup.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Daily Archives
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={retentionDailyCount}
                onChange={(e) => setRetentionDailyCount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Weekly Archives
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={retentionWeeklyCount}
                onChange={(e) => setRetentionWeeklyCount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Monthly Archives
              </label>
              <input
                type="number"
                min="1"
                max="12"
                value={retentionMonthlyCount}
                onChange={(e) => setRetentionMonthlyCount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            Save Configuration
          </button>
        </div>
      </form>
    </Modal>
  );
};

