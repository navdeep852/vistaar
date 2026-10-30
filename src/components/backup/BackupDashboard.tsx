import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database,
  CloudUpload,
  Download,
  Upload,
  Clock,
  Lock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { backupService } from '../../services/backup/backupService';
import {
  BackupFileInfo,
  BackupCapabilities,
  BackupSettings,
  BackupProgressInfo,
} from '../../services/backup/backupTypes';
import { BackupDestinationCard } from './BackupDestinationCard';
import { BackupProgress } from './BackupProgress';
import { BackupHistory } from './BackupHistory';
import { RestoreBackupModal } from './RestoreBackupModal';
import { Modal } from '../Modal';
import { showToast } from '../Toast';
import { currentPlatform } from '../../platform/platformDetection';

export const BackupDashboard: React.FC = () => {
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [capabilities, setCapabilities] = useState<BackupCapabilities | null>(null);
  const [settings, setSettings] = useState<BackupSettings>(backupService.getSettings());
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isVerifyingDestination, setIsVerifyingDestination] = useState(false);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | undefined>(undefined);

  // Active Backup Job State
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [backupTargetMode, setBackupTargetMode] = useState<'onedrive' | 'download'>('onedrive');
  const [backupPassword, setBackupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activeProgress, setActiveProgress] = useState<BackupProgressInfo | null>(null);

  // Automatic Backup Form State
  const [autoEnabled, setAutoEnabled] = useState(settings.autoBackupEnabled);
  const [frequency, setFrequency] = useState(settings.frequency);
  const [preferredTime, setPreferredTime] = useState(settings.preferredTime || '20:00');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<BackupFileInfo | null>(null);

  // Hidden File Input for Manual Archive Upload & Restore
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Load Capabilities, Settings & Detected Backups
  const refreshBackups = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const caps = await backupService.getCapabilities();
      setCapabilities(caps);
      const list = await backupService.listBackups();
      setBackups(list);
      const currentSettings = backupService.getSettings();
      setSettings(currentSettings);
      setAutoEnabled(currentSettings.autoBackupEnabled);
      setFrequency(currentSettings.frequency);
      setPreferredTime(currentSettings.preferredTime || '20:00');
    } catch (err: any) {
      console.warn('[BackupDashboard] Failed to refresh backups:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    refreshBackups();
  }, [refreshBackups]);

  // Destination Folder Actions
  const handleSelectFolder = async () => {
    try {
      const res = await backupService.selectDestinationFolder();
      if (res.success) {
        showToast(`Connected to OneDrive folder: ${res.folderName}`, 'success');
        setLastVerifiedAt('Just now');
        refreshBackups();
      } else if (res.error && !res.error.includes('cancelled')) {
        showToast(res.error, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to select folder.', 'error');
    }
  };

  const handleVerifyDestination = async () => {
    setIsVerifyingDestination(true);
    try {
      const res = await backupService.verifyDestination();
      if (res.success) {
        showToast('Destination verified! Read and write permissions are fully active.', 'success');
        setLastVerifiedAt(new Date().toLocaleTimeString());
      } else {
        showToast(res.error || 'Destination access verification failed.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Verification failed.', 'error');
    } finally {
      setIsVerifyingDestination(false);
    }
  };

  const handleDisconnect = async () => {
    if (confirm('Disconnect the local OneDrive folder? Your backup files on disk will not be deleted.')) {
      await backupService.disconnectDestination();
      showToast('Destination folder disconnected.', 'info');
      setLastVerifiedAt(undefined);
      refreshBackups();
    }
  };

  const handleOpenExplorer = async () => {
    await backupService.openFolderInExplorer();
  };

  // Open Backup Modal for OneDrive vs Download
  const handleOpenBackupModal = (mode: 'onedrive' | 'download') => {
    if (mode === 'onedrive') {
      const isConnected = Boolean(
        settings.destinationLabel &&
          settings.destinationLabel !== 'No local folder selected' &&
          settings.destinationLabel !== 'No OneDrive folder connected'
      );
      if (!isConnected) {
        showToast('Please connect a local OneDrive folder first before backing up to OneDrive.', 'error');
        handleSelectFolder();
        return;
      }
    }
    setBackupTargetMode(mode);
    setPasswordModalOpen(true);
  };

  // Execute Backup (OneDrive or Download)
  const handleExecuteBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (backupPassword && backupPassword !== confirmPassword) {
      showToast('Passwords do not match. Please re-enter.', 'error');
      return;
    }

    setPasswordModalOpen(false);
    setIsCreatingBackup(true);
    setActiveProgress({
      stage: 'idle',
      message: 'Preparing backup engine...',
      percentage: 5,
    });

    try {
      if (backupTargetMode === 'onedrive') {
        const result = await backupService.createBackup({
          password: backupPassword || undefined,
          type: 'manual',
          onProgress: (info) => setActiveProgress(info),
        });
        showToast(`Backup successfully saved & verified: ${result.fileName}`, 'success');
      } else {
        const result = await backupService.downloadBackup({
          password: backupPassword || undefined,
          onProgress: (info) => setActiveProgress(info),
        });
        showToast(`Backup archive downloaded: ${result.fileName}`, 'success');
      }
      setBackupPassword('');
      setConfirmPassword('');
      await refreshBackups();
    } catch (err: any) {
      setActiveProgress({
        stage: 'failed',
        message: err.message || 'Backup failed.',
        percentage: 100,
      });
      showToast(err.message || 'Backup failed.', 'error');
    } finally {
      setIsCreatingBackup(false);
      setTimeout(() => setActiveProgress(null), 5000);
    }
  };

  // Save In-Page Automatic Backup Settings
  const handleSaveSchedule = async () => {
    setIsSavingSchedule(true);
    try {
      await backupService.updateSettings({
        autoBackupEnabled: autoEnabled,
        frequency,
        preferredTime,
      });
      const updated = backupService.getSettings();
      setSettings(updated);
      showToast(
        autoEnabled
          ? `Automatic backup enabled (${frequency} at ${preferredTime}).`
          : 'Automatic backup disabled.',
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to update schedule.', 'error');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Restore Handlers
  const handleRestoreFromHistory = (backup: BackupFileInfo) => {
    setSelectedBackupForRestore(backup);
    setRestoreModalOpen(true);
  };

  const handleUploadBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        const { manifest } = await backupService.previewBackup(text);
        const tempInfo: BackupFileInfo = {
          fileName: file.name,
          fileSizeBytes: file.size,
          createdAt: manifest.createdAt,
          status: 'valid',
          manifest,
          rawContent: text,
        };
        setSelectedBackupForRestore(tempInfo);
        setRestoreModalOpen(true);
      } catch (err: any) {
        showToast(err.message || 'Invalid VISTAAR backup file.', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteBackup = async (backup: BackupFileInfo) => {
    if (confirm(`Are you sure you want to delete "${backup.fileName}" from your destination folder?`)) {
      try {
        await backupService.deleteBackup(backup.fileName);
        showToast(`Deleted ${backup.fileName}`, 'info');
        refreshBackups();
      } catch (err: any) {
        showToast(err.message || 'Failed to delete file.', 'error');
      }
    }
  };

  const handleVerifyBackup = async (backup: BackupFileInfo) => {
    try {
      const content = await backupService.readBackupFile(backup.fileName);
      const { manifest } = await backupService.previewBackup(content);
      showToast(
        `Integrity Verified! Checksum matches: ${manifest.integrity.checksum.slice(0, 16)}...`,
        'success'
      );
    } catch (err: any) {
      showToast(`Integrity check failed: ${err.message}`, 'error');
    }
  };

  const isConnected = Boolean(
    settings.destinationLabel &&
      settings.destinationLabel !== 'No local folder selected' &&
      settings.destinationLabel !== 'No OneDrive folder connected'
  );

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* SECTION: Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Database className="w-7 h-7 text-blue-600 dark:text-blue-400" />
            Backup &amp; Restore Center
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Enterprise multi-tenant data protection with local OneDrive synchronization, independent manual downloads, and automated scheduling.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshBackups}
            disabled={isLoadingHistory}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* SECTION 1: Backup Destination */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            1. Backup Destination
          </h3>
        </div>
        <BackupDestinationCard
          label={settings.destinationLabel || 'No OneDrive folder connected'}
          isConnected={isConnected}
          capabilities={capabilities}
          lastVerifiedAt={lastVerifiedAt}
          onSelectFolder={handleSelectFolder}
          onDisconnect={handleDisconnect}
          onVerify={handleVerifyDestination}
          onOpenExplorer={handleOpenExplorer}
          isLoading={isVerifyingDestination}
        />
      </section>

      {/* Real-time Progress Bar */}
      {activeProgress && <BackupProgress progress={activeProgress} />}

      {/* SECTION 2: Backup Actions (All 3 Actions Visibly Provided) */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          2. Backup Actions
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Action 1: Back Up Now (To OneDrive Folder) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <CloudUpload className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Back Up Now
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Creates an encrypted <code className="text-blue-600 dark:text-blue-400 font-mono">.vistaarbackup</code> archive and saves it directly to your connected OneDrive folder.
              </p>
              {!isConnected && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" /> Connect folder first
                </span>
              )}
            </div>

            <button
              onClick={() => handleOpenBackupModal('onedrive')}
              disabled={isCreatingBackup}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <CloudUpload className="w-4 h-4" />
              Back Up Now
            </button>
          </div>

          {/* Action 2: Download Backup (Independent Manual Download) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Download className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Download Backup
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generates a fresh encrypted snapshot and downloads it directly to your computer. Works independently of OneDrive.
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Ready anytime
              </span>
            </div>

            <button
              onClick={() => handleOpenBackupModal('download')}
              disabled={isCreatingBackup}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download Backup
            </button>
          </div>

          {/* Action 3: Restore Backup (Upload & Restore) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-4 hover:border-purple-300 dark:hover:border-purple-700 transition-colors">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Restore Backup
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select an external <code className="text-purple-600 dark:text-purple-400 font-mono">.vistaarbackup</code> file from your device to restore business records with safety snapshots.
              </p>
            </div>

            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUploadBackupFile}
                accept=".vistaarbackup,.json"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800/40 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Select File to Restore
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Automatic Backup (Visible In-Page Configuration) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                3. Automatic Backup Schedule
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  autoEnabled
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {autoEnabled ? 'Schedule Active' : 'Disabled'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure automatic recurring snapshots to your connected OneDrive folder with multi-tier retention.
            </p>
          </div>

          {/* Toggle Switch */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoEnabled}
              onChange={(e) => setAutoEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
            <span className="ml-3 text-xs font-bold text-slate-700 dark:text-slate-300">
              {autoEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>

        {/* Schedule Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Frequency
            </label>
            <select
              value={frequency}
              disabled={!autoEnabled}
              onChange={(e) => setFrequency(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Preferred Time (Local)
            </label>
            <input
              type="time"
              value={preferredTime}
              disabled={!autoEnabled}
              onChange={(e) => setPreferredTime(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Last Successful Backup
            </label>
            <div className="text-xs text-slate-800 dark:text-slate-200 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 truncate">
              {settings.lastSuccessfulBackup
                ? new Date(settings.lastSuccessfulBackup).toLocaleString()
                : 'None yet'}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Next Scheduled Attempt
            </label>
            <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 p-2 rounded-xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40 truncate">
              {autoEnabled && settings.nextScheduledBackup
                ? new Date(settings.nextScheduledBackup).toLocaleString()
                : autoEnabled
                ? `${frequency === 'daily' ? 'Daily' : 'Weekly'} at ${preferredTime}`
                : 'Automatic backup disabled'}
            </div>
          </div>
        </div>

        {/* Last Failure Callout if error exists */}
        {settings.lastStatus === 'failed' && settings.lastError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <div>
              <div className="font-bold">Last Automatic Backup Encountered an Error:</div>
              <p className="font-mono text-[11px] mt-0.5">{settings.lastError}</p>
            </div>
          </div>
        )}

        {/* Runtime Disclosures */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
          <div className="font-semibold text-slate-700 dark:text-slate-300">
            Platform Scheduling Rules &amp; Disclosures:
          </div>
          {currentPlatform.isDesktop ? (
            <p>
              • <strong>Desktop:</strong> Backups run automatically when the VISTAAR Desktop app is open at the scheduled time. If the app is closed, missed backups catch up automatically on next launch.
            </p>
          ) : (
            <p>
              • <strong>Web:</strong> Automatic backups run while your browser tab is open and authenticated. Browser permissions are verified upon app launch.
            </p>
          )}
          <p>• Backups are strictly isolated and never run for an unauthenticated or mismatched workspace.</p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleSaveSchedule}
            disabled={isSavingSchedule}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition-colors cursor-pointer"
          >
            {isSavingSchedule ? 'Saving...' : 'Save Schedule Settings'}
          </button>
        </div>
      </section>

      {/* SECTION 4: Backup History */}
      <section className="space-y-3">
        <BackupHistory
          backups={backups}
          isLoading={isLoadingHistory}
          onRestore={handleRestoreFromHistory}
          onVerify={handleVerifyBackup}
          onDelete={handleDeleteBackup}
        />
      </section>

      {/* CREATE / DOWNLOAD BACKUP MODAL (PASSWORD PROMPT) */}
      <Modal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title={
          backupTargetMode === 'onedrive'
            ? 'Back Up Now to OneDrive Folder'
            : 'Download Encrypted Backup Archive'
        }
      >
        <form onSubmit={handleExecuteBackup} className="space-y-5 text-slate-800 dark:text-slate-200">
          <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 space-y-1">
            <div className="font-bold">
              {backupTargetMode === 'onedrive'
                ? 'Target: Local OneDrive Sync Destination'
                : 'Target: Direct Computer Download'}
            </div>
            <p>
              All 32 database tables will be collected, Gzip compressed, and protected using AES-256-GCM encryption.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Archive Encryption Password (Recommended)
              </label>
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Set password to protect this backup file"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {backupPassword && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setPasswordModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-colors shadow-sm cursor-pointer ${
                backupTargetMode === 'onedrive'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {backupTargetMode === 'onedrive' ? 'Start Backup to OneDrive' : 'Generate & Download File'}
            </button>
          </div>
        </form>
      </Modal>

      {/* RESTORE BACKUP MODAL */}
      <RestoreBackupModal
        isOpen={restoreModalOpen}
        onClose={() => {
          setRestoreModalOpen(false);
          setSelectedBackupForRestore(null);
        }}
        selectedBackup={selectedBackupForRestore}
        onRestoreCompleted={refreshBackups}
      />
    </div>
  );
};
