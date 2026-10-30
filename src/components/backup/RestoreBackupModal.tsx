import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Lock,
  FileArchive,
  Layers,
  ArrowRight,
  ShieldAlert,
  Loader2,
  HardDrive,
} from 'lucide-react';
import { Modal } from '../Modal';
import { backupService } from '../../services/backup/backupService';
import {
  BackupFileInfo,
  RestorePreview,
  RestoreResult,
} from '../../services/backup/backupTypes';
import { showToast } from '../Toast';

interface RestoreBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBackup: BackupFileInfo | null;
  onRestoreCompleted: () => void;
}

export const RestoreBackupModal: React.FC<RestoreBackupModalProps> = ({
  isOpen,
  onClose,
  selectedBackup,
  onRestoreCompleted,
}) => {
  const [step, setStep] = useState<'preview' | 'confirm' | 'restoring' | 'success'>('preview');
  const [password, setPassword] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [previewData, setPreviewData] = useState<RestorePreview | null>(null);
  const [rawContent, setRawContent] = useState<string>('');
  const [confirmationText, setConfirmationText] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize or load preview when modal opens
  useEffect(() => {
    if (isOpen && selectedBackup) {
      setStep('preview');
      setPassword('');
      setConfirmationText('');
      setErrorMessage(null);
      setRestoreResult(null);
      loadBackupContent(selectedBackup.fileName);
    }
  }, [isOpen, selectedBackup]);

  const loadBackupContent = async (fileName: string) => {
    setIsVerifyingPassword(true);
    setErrorMessage(null);
    try {
      const content = await backupService.readBackupFile(fileName);
      setRawContent(content);

      // Inspect without password first to populate preview
      const { preview, manifest } = await backupService.previewBackup(content);
      setPreviewData(preview);

      if (!manifest.encryption.enabled) {
        // Not encrypted: immediately verify
        const full = await backupService.previewBackup(content, '');
        setPreviewData(full.preview);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to read backup file.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handleTestPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMessage('Please enter the backup encryption password.');
      return;
    }

    setIsVerifyingPassword(true);
    setErrorMessage(null);
    try {
      const full = await backupService.previewBackup(rawContent, password);
      setPreviewData(full.preview);
      setStep('confirm');
    } catch (err: any) {
      setErrorMessage(err.message || 'Incorrect password or corrupted archive.');
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const handleProceedToConfirm = () => {
    if (previewData && !previewData.warnings.length) {
      setStep('confirm');
    } else {
      setStep('confirm');
    }
  };

  const handleExecuteRestore = async () => {
    if (confirmationText.trim().toUpperCase() !== 'RESTORE') {
      showToast('Please type "RESTORE" to confirm.', 'error');
      return;
    }

    setIsRestoring(true);
    setStep('restoring');
    setErrorMessage(null);

    try {
      const result = await backupService.restoreBackup(rawContent, password);
      setRestoreResult(result);
      setStep('success');
      showToast('Workspace successfully restored from backup!', 'success');
      onRestoreCompleted();
    } catch (err: any) {
      setErrorMessage(err.message || 'Restoration failed.');
      setStep('confirm');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isRestoring ? () => {} : onClose}
      title="Restore Business Workspace"
    >
      <div className="space-y-6 text-slate-800 dark:text-slate-200">
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <div>{errorMessage}</div>
          </div>
        )}

        {/* STEP 1: PREVIEW & PASSWORD PROMPT */}
        {step === 'preview' && (
          <div className="space-y-5">
            {previewData ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Archive Created</span>
                    <span className="font-semibold">{new Date(previewData.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Source Workspace</span>
                    <span className="font-semibold">{previewData.sourceWorkspaceName}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Active Workspace</span>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                      {previewData.currentWorkspaceName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">Total Records</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {previewData.totalRecords.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Cross-workspace warnings */}
                {previewData.warnings.map((w, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>{w}</div>
                  </div>
                ))}

                {/* Password input for encrypted archives */}
                <form onSubmit={handleTestPassword} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      Backup Encryption Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password used when creating this backup"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

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
                      disabled={isVerifyingPassword}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {isVerifyingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Verify Password & Preview
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                Reading and verifying archive structure...
              </div>
            )}
          </div>
        )}

        {/* STEP 2: CONFIRMATION & ENTITY BREAKDOWN */}
        {step === 'confirm' && previewData && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-300">
                <ShieldAlert className="w-5 h-5" />
                Safety Guarantee & Pre-Restore Snapshot
              </div>
              <p>
                Before restoring, VISTAAR will automatically take a verified snapshot of your current
                workspace records so you can safely undo this operation if needed.
              </p>
            </div>

            {/* Entity Summary */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 max-h-48 overflow-y-auto space-y-1.5 text-xs font-mono">
              <div className="font-sans font-bold text-slate-700 dark:text-slate-300 mb-2">
                Records Scheduled for Restoration:
              </div>
              {Object.entries(previewData.tableCounts).map(([tbl, count]) => {
                if (count === 0) return null;
                return (
                  <div key={tbl} className="flex items-center justify-between py-0.5">
                    <span className="text-slate-600 dark:text-slate-400">{tbl}</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Type RESTORE to confirm */}
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Type <span className="font-mono text-rose-600">RESTORE</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder="RESTORE"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-500 uppercase"
              />
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStep('preview')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                &larr; Back
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={confirmationText.trim().toUpperCase() !== 'RESTORE' || isRestoring}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-colors shadow-sm disabled:opacity-40 cursor-pointer"
              >
                {isRestoring && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm &amp; Restore Workspace
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RESTORING IN PROGRESS */}
        {step === 'restoring' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
            <div className="space-y-1">
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Restoring Business Data...
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Executing dependency-aware upsert into PostgreSQL tables. Please do not close the application.
              </p>
            </div>
          </div>
        )}

        {/* STEP 4: RESTORE SUCCESS */}
        {step === 'success' && restoreResult && (
          <div className="space-y-5 text-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Restoration Complete &amp; Verified!
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {restoreResult.totalRestored.toLocaleString()} business records were successfully
                reconciled and restored in {(restoreResult.durationMs / 1000).toFixed(1)}s.
              </p>
            </div>

            {restoreResult.safetyBackupFileName && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 font-mono">
                Safety Snapshot Saved: <span className="font-bold">{restoreResult.safetyBackupFileName}</span>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-center">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
              >
                Close &amp; Return to Business OS
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

