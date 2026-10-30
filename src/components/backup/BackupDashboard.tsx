import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database,
  PlusCircle,
  RotateCcw,
  Upload,
  Settings as SettingsIcon,
  ShieldCheck,
  CheckCircle2,
  HardDrive,
  Lock,
  Download,
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
import { BackupSettingsModal } from './BackupSettingsModal';
import { Modal } from '../Modal';
import { showToast } from '../Toast';

export const BackupDashboard: React.FC = () => {
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [capabilities, setCapabilities] = useState<BackupCapabilities | null>(null);
  const [settings, setSettings] = useState<BackupSettings>(backupService.getSettings());
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isVerifyingDestination, setIsVerifyingDestination] = useState(false);

  // Active Backup Job State
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [createBackupModalOpen, setCreateBackupModalOpen] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activeProgress, setActiveProgress] = useState<BackupProgressInfo | null>(null);

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<BackupFileInfo | null>(null);

  // Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Hidden File Input for Manual Archive Upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Load Capabilities, Settings & Detected Backups
  const refreshBackups = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const caps = await backupService.getCapabilities();
      setCapabilities(caps);
      const list = await backupService.listBackups();
      setBackups(list);
      setSettings(backupService.getSettings());
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
      refreshBackups();
    }
  };

  const handleOpenExplorer = async () => {
    await backupService.openFolderInExplorer();
  };

  // Create Backup Flow
  const handleStartBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (backupPassword && backupPassword !== confirmPassword) {
      showToast('Passwords do not match. Please re-enter.', 'error');
      return;
    }

    setCreateBackupModalOpen(false);
    setIsCreatingBackup(true);
    setActiveProgress({
      stage: 'idle',
      message: 'Initializing authoritative workspace snapshot...',
      percentage: 5,
    });

    try {
      const result = await backupService.createBackup({
        password: backupPassword || undefined,
        type: 'manual',
        onProgress: (info) => setActiveProgress(info),
      });

      showToast(`Backup created and verified: ${result.fileName}`, 'success');
      setBackupPassword('');
      setConfirmPassword('');
      await refreshBackups();
    } catch (err: any) {
      showToast(err.message || 'Backup failed.', 'error');
    } finally {
      setIsCreatingBackup(false);
      setTimeout(() => setActiveProgress(null), 3000);
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
        // Verify format and open restore modal
        const { manifest } = await backupService.previewBackup(text);
        const tempInfo: BackupFileInfo = {
          fileName: file.name,
          fileSizeBytes: file.size,
          createdAt: manifest.createdAt,
          status: 'valid',
          manifest,
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
    if (confirm(`Are you sure you want to delete "${backup.fileName}" from your OneDrive folder?`)) {
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
    <div className="space-y-6 max-w-6xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Local OneDrive Backup &amp; Restore
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Zero-cloud-dependency enterprise backup system writing encrypted snapshots into your local
            OneDrive folder.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors cursor-pointer"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            Schedule &amp; Retention
          </button>

          <button
            onClick={() => setCreateBackupModalOpen(true)}
            disabled={isCreatingBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Create Backup Now
          </button>
        </div>
      </div>

      {/* Destination Status Card */}
      <BackupDestinationCard
        label={settings.destinationLabel || 'No OneDrive folder connected'}
        isConnected={isConnected}
        capabilities={capabilities}
        onSelectFolder={handleSelectFolder}
        onDisconnect={handleDisconnect}
        onVerify={handleVerifyDestination}
        onOpenExplorer={handleOpenExplorer}
        isLoading={isVerifyingDestination}
      />

      {/* Progress Indicator */}
      {activeProgress && <BackupProgress progress={activeProgress} />}

      {/* Manual Upload Bar */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs">
        <div className="text-slate-600 dark:text-slate-400">
          Want to restore an external backup file from another machine?
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload &amp; Restore File
          </button>
        </div>
      </div>

      {/* Backup History Table */}
      <BackupHistory
        backups={backups}
        isLoading={isLoadingHistory}
        onRestore={handleRestoreFromHistory}
        onVerify={handleVerifyBackup}
        onDelete={handleDeleteBackup}
      />

      {/* CREATE BACKUP MODAL */}
      <Modal
        isOpen={createBackupModalOpen}
        onClose={() => setCreateBackupModalOpen(false)}
        title="Create Encrypted Workspace Backup"
      >
        <form onSubmit={handleStartBackup} className="space-y-5 text-slate-800 dark:text-slate-200">
          <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/40 text-xs text-blue-900 dark:text-blue-200 space-y-1">
            <div className="font-bold">Authoritative Multi-Table Snapshot</div>
            <p>
              VISTAAR will collect all live database records (invoices, payments, products, customers,
              daybook, stock movements, etc.), compress them, and encrypt them with AES-256-GCM.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                Encryption Password (Recommended)
              </label>
              <input
                type="password"
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Set a password to encrypt this backup archive"
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
                  placeholder="Re-type password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCreateBackupModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
            >
              Start Snapshot &amp; Write Backup
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

      {/* SETTINGS MODAL */}
      <BackupSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        settings={settings}
        onSave={async (updated) => {
          await backupService.updateSettings(updated);
          setSettings(backupService.getSettings());
          showToast('Backup configuration updated.', 'success');
        }}
      />
    </div>
  );
};

