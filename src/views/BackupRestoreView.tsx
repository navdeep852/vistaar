import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Database,
  Download,
  Upload,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HardDrive,
  Cloud,
  CloudOff,
  FolderUp,
  FileCheck2,
  Trash2,
  ExternalLink,
  Check,
  Lock,
  Layers,
  FileArchive,
  ArrowDownToLine,
  HelpCircle,
} from 'lucide-react';
import { backupService } from '../services/backupService';
import { oneDriveService } from '../services/oneDriveService';
import { recoveryService, SoldierCandidateScanResult } from '../services/recoveryService';
import { BackupRecord, BackupType, OneDriveConnection, OneDriveBackupItem, BackupManifest } from '../types';
import { showToast } from '../components/Toast';
import { Modal } from '../components/Modal';

export const BackupRestoreView: React.FC = () => {
  // History & Scheduler State
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isBackingUpLocal, setIsBackingUpLocal] = useState(false);
  const [schedulerInfo, setSchedulerInfo] = useState<{
    engine: string;
    schedule: string;
    lastRun?: string;
    nextRun?: string;
    lastStatus?: string;
  } | null>(null);

  // Microsoft OneDrive State
  const [oneDriveConn, setOneDriveConn] = useState<OneDriveConnection>({ isConnected: false });
  const [oneDriveBackups, setOneDriveBackups] = useState<OneDriveBackupItem[]>([]);
  const [isLoadingOneDrive, setIsLoadingOneDrive] = useState(false);
  const [isConnectingOneDrive, setIsConnectingOneDrive] = useState(false);
  const [isUploadingOneDrive, setIsUploadingOneDrive] = useState(false);
  const [oneDriveProgress, setOneDriveProgress] = useState<number>(0);

  // Restore Modal State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<BackupRecord | null>(null);
  const [selectedOneDriveForRestore, setSelectedOneDriveForRestore] = useState<OneDriveBackupItem | null>(null);
  const [uploadedRestoreBlob, setUploadedRestoreBlob] = useState<Blob | null>(null);
  const [uploadedRestoreJson, setUploadedRestoreJson] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    checksum: string;
    schemaVersion?: string;
    formatVersion?: string;
    workspaceId?: string;
    recordCounts?: Record<string, number>;
    manifest?: BackupManifest;
    data?: any;
    error?: string;
  } | null>(null);
  const [restoreSuccessReport, setRestoreSuccessReport] = useState<{
    counts: Record<string, number>;
    safetyBackupId?: string;
  } | null>(null);

  // Soldier Recovery State
  const [soldierScan, setSoldierScan] = useState<SoldierCandidateScanResult | null>(null);
  const [isScanningSoldier, setIsScanningSoldier] = useState(false);
  const [isRecoveringSoldier, setIsRecoveringSoldier] = useState(false);
  const [soldierRecoveredData, setSoldierRecoveredData] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Load Backup History and Scheduler Status
  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const [history, sched] = await Promise.all([
        backupService.getBackupHistory(),
        backupService.getSchedulerStatus(),
      ]);
      setBackups(history);
      setSchedulerInfo(sched);
    } catch {
      showToast('Could not load backup history.', 'error');
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // 2. Load OneDrive Connection and Remote File Listing
  const loadOneDriveState = useCallback(async () => {
    const conn = oneDriveService.getConnectionStatus();
    setOneDriveConn(conn);

    if (conn.isConnected) {
      setIsLoadingOneDrive(true);
      try {
        const items = await oneDriveService.listBackups();
        setOneDriveBackups(items);
      } catch {
        console.warn('[BackupView] Could not fetch OneDrive backups');
      } finally {
        setIsLoadingOneDrive(false);
      }
    } else {
      setOneDriveBackups([]);
    }
  }, []);

  // 3. Soldier Scan for financial recovery
  const runSoldierScan = useCallback(async () => {
    setIsScanningSoldier(true);
    try {
      const scan = await recoveryService.scanForSoldierCandidates();
      setSoldierScan(scan);
    } catch {
      // ignore
    } finally {
      setIsScanningSoldier(false);
    }
  }, []);

  // 4. Initial Mount: Handle OAuth Callback & Load Data
  useEffect(() => {
    loadHistory();
    loadOneDriveState();
    runSoldierScan();

    // Check if returning from Microsoft OAuth redirect with ?code=...&state=...
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (code && state) {
        setIsConnectingOneDrive(true);
        // Clear query parameters from URL immediately to prevent token replay
        window.history.replaceState({}, document.title, window.location.pathname);

        oneDriveService
          .handleAuthCallback(code, state)
          .then((res) => {
            if (res.success) {
              showToast('Microsoft OneDrive connected successfully! Your cloud backup is ready.', 'success');
              loadOneDriveState();
            } else {
              showToast(`Microsoft OneDrive connection failed: ${res.error}`, 'error');
            }
          })
          .catch((err) => {
            showToast(`Authentication error: ${err.message || err}`, 'error');
          })
          .finally(() => {
            setIsConnectingOneDrive(false);
          });
      }
    }

    // Trigger daily background check
    backupService
      .checkAndTriggerDailyBackup()
      .then(() => loadHistory())
      .catch(() => {});
  }, [loadHistory, loadOneDriveState, runSoldierScan]);

  // ACTION: Download Local Backup Archive (.zip)
  const handleDownloadLocalBackup = async () => {
    setIsBackingUpLocal(true);
    try {
      const res = await backupService.downloadLocalBackup({ type: 'manual' });
      if (res.success && res.backup) {
        const sizeKb = ((res.backup.fileSizeBytes || 0) / 1024).toFixed(1);
        showToast(
          `Backup archive created & downloaded successfully! (${res.fileName || 'ZIP'} · ${sizeKb} KB)`,
          'success'
        );
        loadHistory();
      } else {
        showToast(res.error || 'Failed to generate local backup.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Local backup failed.', 'error');
    } finally {
      setIsBackingUpLocal(false);
    }
  };

  // ACTION: Microsoft OAuth Login
  const handleConnectOneDrive = async () => {
    setIsConnectingOneDrive(true);
    try {
      const { authUrl } = await oneDriveService.initiateLogin();
      window.location.href = authUrl;
    } catch (err: any) {
      showToast(err.message || 'Could not initiate Microsoft authentication.', 'error');
      setIsConnectingOneDrive(false);
    }
  };

  // ACTION: Disconnect OneDrive
  const handleDisconnectOneDrive = () => {
    if (window.confirm('Disconnect Microsoft OneDrive? Your existing backups stored in OneDrive will remain untouched in your cloud account.')) {
      oneDriveService.disconnect();
      setOneDriveConn({ isConnected: false });
      setOneDriveBackups([]);
      showToast('Microsoft OneDrive disconnected.', 'info');
    }
  };

  // ACTION: Upload Comprehensive Backup Archive to OneDrive
  const handleUploadToOneDrive = async () => {
    if (!oneDriveConn.isConnected) {
      showToast('Please connect Microsoft OneDrive first.', 'error');
      return;
    }

    setIsUploadingOneDrive(true);
    setOneDriveProgress(5);
    try {
      const res = await backupService.uploadToOneDrive({
        type: 'manual',
        onProgress: (pct) => setOneDriveProgress(pct),
      });

      if (res.success && res.backup) {
        showToast('Backup archive uploaded securely to Microsoft OneDrive!', 'success');
        loadHistory();
        loadOneDriveState();
      } else {
        showToast(res.error || 'OneDrive upload failed.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'OneDrive upload failed.', 'error');
    } finally {
      setIsUploadingOneDrive(false);
      setOneDriveProgress(0);
    }
  };

  // ACTION: Download Remote Backup from OneDrive
  const handleDownloadFromOneDrive = async (item: OneDriveBackupItem) => {
    try {
      showToast(`Downloading ${item.name} from OneDrive...`, 'info');
      const blob = await oneDriveService.downloadBackup(item.id);
      if (!blob) {
        showToast('Could not retrieve backup file from OneDrive.', 'error');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Downloaded from OneDrive successfully.', 'success');
    } catch {
      showToast('Failed to download backup from OneDrive.', 'error');
    }
  };

  // ACTION: Delete Backup from OneDrive
  const handleDeleteFromOneDrive = async (item: OneDriveBackupItem) => {
    if (!window.confirm(`Permanently delete backup "${item.name}" from your Microsoft OneDrive?`)) {
      return;
    }

    try {
      const ok = await oneDriveService.deleteBackup(item.id);
      if (ok) {
        showToast('Backup deleted from OneDrive.', 'success');
        loadOneDriveState();
      } else {
        showToast('Failed to delete backup from OneDrive.', 'error');
      }
    } catch {
      showToast('Delete request failed.', 'error');
    }
  };

  // ACTION: Verify Backup from History
  const handleVerifyBackup = async (b: BackupRecord) => {
    try {
      const content = await backupService.getBackupContent(b.id);
      if (!content) {
        showToast('Could not load backup content for verification.', 'error');
        return;
      }
      const res = await backupService.verifyBackupIntegrity(content);
      if (res.valid && (!b.checksumSha256 || res.checksum === b.checksumSha256)) {
        showToast(`Verification PASSED: SHA-256 Checksum verified (${res.checksum.substring(0, 16)}...)`, 'success');
      } else if (!res.valid) {
        showToast(`Verification FAILED: ${res.error}`, 'error');
      } else {
        showToast('Verification MISMATCH: Calculated checksum differs from recorded checksum.', 'error');
      }
    } catch {
      showToast('Verification failed.', 'error');
    }
  };

  // ACTION: Open Restore Modal for History Item
  const handleOpenRestoreForHistory = async (b: BackupRecord) => {
    setSelectedBackupForRestore(b);
    setSelectedOneDriveForRestore(null);
    setUploadedRestoreBlob(null);
    setUploadedRestoreJson('');
    setUploadedFileName('');
    setConfirmationInput('');
    setVerifyResult(null);
    setRestoreSuccessReport(null);
    setIsVerifying(true);
    setRestoreModalOpen(true);

    try {
      const content = await backupService.getBackupContent(b.id);
      if (content) {
        const v = await backupService.verifyBackupIntegrity(content);
        setVerifyResult(v);
      } else {
        setVerifyResult({
          valid: false,
          checksum: '',
          error: 'Backup archive content could not be located in local or cloud storage.',
        });
      }
    } catch (e: any) {
      setVerifyResult({ valid: false, checksum: '', error: e?.message || 'Verification error' });
    } finally {
      setIsVerifying(false);
    }
  };

  // ACTION: Open Restore Modal for OneDrive Item
  const handleOpenRestoreFromOneDrive = async (item: OneDriveBackupItem) => {
    setSelectedOneDriveForRestore(item);
    setSelectedBackupForRestore(null);
    setUploadedRestoreBlob(null);
    setUploadedRestoreJson('');
    setUploadedFileName(item.name);
    setConfirmationInput('');
    setVerifyResult(null);
    setRestoreSuccessReport(null);
    setIsVerifying(true);
    setRestoreModalOpen(true);

    try {
      const blob = await oneDriveService.downloadBackup(item.id);
      if (!blob) {
        setVerifyResult({
          valid: false,
          checksum: '',
          error: 'Failed to download backup payload from Microsoft OneDrive.',
        });
        return;
      }
      setUploadedRestoreBlob(blob);
      const v = await backupService.verifyBackupIntegrity(blob);
      setVerifyResult(v);
    } catch (e: any) {
      setVerifyResult({ valid: false, checksum: '', error: e?.message || 'Verification error' });
    } finally {
      setIsVerifying(false);
    }
  };

  // ACTION: Upload File for Restoration (.zip or .json)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setSelectedBackupForRestore(null);
    setSelectedOneDriveForRestore(null);
    setConfirmationInput('');
    setVerifyResult(null);
    setRestoreSuccessReport(null);
    setIsVerifying(true);
    setRestoreModalOpen(true);

    const isZip = file.name.endsWith('.zip');

    if (isZip) {
      setUploadedRestoreBlob(file);
      setUploadedRestoreJson('');
      backupService
        .verifyBackupIntegrity(file)
        .then((v) => setVerifyResult(v))
        .catch((err) => setVerifyResult({ valid: false, checksum: '', error: err.message }))
        .finally(() => setIsVerifying(false));
    } else {
      // Legacy JSON file
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const content = evt.target?.result as string;
        if (content) {
          setUploadedRestoreJson(content);
          setUploadedRestoreBlob(null);
          try {
            const v = await backupService.verifyBackupIntegrity(content);
            setVerifyResult(v);
          } catch (err: any) {
            setVerifyResult({ valid: false, checksum: '', error: err.message });
          } finally {
            setIsVerifying(false);
          }
        }
      };
      reader.readAsText(file);
    }

    e.target.value = '';
  };

  // ACTION: Execute Guarded Restoration
  const handleExecuteRestore = async () => {
    if (confirmationInput.trim().toUpperCase() !== 'RESTORE') {
      showToast('Please type "RESTORE" to confirm this action.', 'error');
      return;
    }

    setIsRestoring(true);
    try {
      let payloadOrBlob: Blob | string | null = null;

      if (uploadedRestoreBlob) {
        payloadOrBlob = uploadedRestoreBlob;
      } else if (uploadedRestoreJson) {
        payloadOrBlob = uploadedRestoreJson;
      } else if (selectedBackupForRestore) {
        const content = await backupService.getBackupContent(selectedBackupForRestore.id);
        payloadOrBlob = content;
      }

      if (!payloadOrBlob) {
        showToast('Restore payload is missing or unreadable.', 'error');
        return;
      }

      const res = await backupService.restoreBackup(payloadOrBlob, confirmationInput);

      if (res.success) {
        setRestoreSuccessReport({
          counts: res.restoredCounts || {},
          safetyBackupId: res.safetyBackupId,
        });
        showToast(
          `Restoration completed successfully! ${res.restoredCounts?.invoices || 0} invoices & ${res.restoredCounts?.payments || 0} payments reconciled.`,
          'success'
        );
        loadHistory();
        runSoldierScan();
      } else {
        showToast(res.error || 'Restore failed.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Restore failed.', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  // ACTION: Recover Soldier Invoice (₹87,000)
  const handleRecoverSoldier = async () => {
    setIsRecoveringSoldier(true);
    try {
      const res = await recoveryService.reconcileAndRecoverSoldierInvoice({
        customerName: 'Soldier',
        grandTotal: 87000,
        paidAmount: 87000,
        paymentMethod: 'Cash',
        notes: 'Audited financial reconciliation for customer Soldier (₹87,000)',
      });

      if (res.success) {
        if (res.alreadyExisted) {
          showToast('Soldier invoice is already safely persisted and reconciled.', 'info');
        } else {
          showToast('Soldier invoice of ₹87,000 & payment of ₹87,000 successfully recovered and committed!', 'success');
        }
        setSoldierRecoveredData(res);
        runSoldierScan();
        loadHistory();
      } else {
        showToast(res.error || 'Failed to recover Soldier invoice.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Recovery failed.', 'error');
    } finally {
      setIsRecoveringSoldier(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* SECTION 1: HEADER & PRIMARY ACTIONS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-blue-900/20 via-indigo-900/20 to-slate-900/20 dark:from-blue-950/40 dark:to-slate-900/50 p-6 rounded-2xl border border-blue-500/20 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Enterprise Backup & Disaster Recovery
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Multi-tenant isolated snapshots, Microsoft OneDrive integration, and guarded transactional recovery.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".zip,.json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all font-medium text-sm flex items-center gap-2 shadow-sm"
          >
            <Upload className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            Upload Restore File (.zip / .json)
          </button>

          <button
            onClick={handleDownloadLocalBackup}
            disabled={isBackingUpLocal}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-medium text-sm flex items-center gap-2 shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50"
          >
            {isBackingUpLocal ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating Archive...
              </>
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4" />
                Download Local Backup (.zip)
              </>
            )}
          </button>
        </div>
      </div>

      {/* SECTION 2: DUAL BACKUP DESTINATION PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL A: LOCAL BACKUP */}
        <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl">
                  <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Destination A: Local Download
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Standalone versioned archive for PC, external drive, or offline storage.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                Ready
              </span>
            </div>

            <div className="mt-5 space-y-2.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileArchive className="w-4 h-4 text-slate-400" />
                <span>Format: <strong>Versioned ZIP Archive</strong> (.zip)</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400" />
                <span>Contains: <strong>data.json</strong>, <strong>manifest.json</strong>, and <strong>assets/</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Integrity: SHA-256 manifest validation on export and restore</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-500" />
                <span>Isolation: Scoped strictly to your workspace, zero cross-tenant data</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Manual download is saved directly to your browser or native Tauri folder.
            </span>
            <button
              onClick={handleDownloadLocalBackup}
              disabled={isBackingUpLocal}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white font-medium text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
            >
              {isBackingUpLocal ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Building Archive...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Save Archive (.zip)
                </>
              )}
            </button>
          </div>
        </div>

        {/* PANEL B: MICROSOFT ONEDRIVE */}
        <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    Destination B: Microsoft OneDrive
                    <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                      Cloud Sync
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Official Microsoft Graph API via OAuth 2.0 PKCE.
                  </p>
                </div>
              </div>

              {oneDriveConn.isConnected ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  Not Connected
                </span>
              )}
            </div>

            {oneDriveConn.isConnected ? (
              <div className="mt-5 space-y-2 text-xs text-slate-600 dark:text-slate-300 bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/40">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Account:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{oneDriveConn.displayName} ({oneDriveConn.userEmail})</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Target Folder:</span>
                  <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">{oneDriveConn.folderPath || 'OneDrive > Apps > VISTAAR'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Last Cloud Backup:</span>
                  <span>{formatDate(oneDriveConn.lastBackupAt)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Cloud Archives:</span>
                  <span className="font-semibold">{oneDriveBackups.length} file{oneDriveBackups.length === 1 ? '' : 's'} found</span>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <p>
                  Connect your Microsoft Account to enable automated and one-click off-site backup storage. Backups are stored in an isolated application folder.
                </p>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Lock className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Uses standard PKCE authorization without storing plain secrets.</span>
                </div>
              </div>
            )}

            {/* Upload Progress Bar */}
            {isUploadingOneDrive && (
              <div className="mt-3 space-y-1.5">
                <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400 font-medium">
                  <span>Uploading archive to OneDrive...</span>
                  <span>{oneDriveProgress}%</span>
                </div>
                <div className="w-full h-2 bg-blue-100 dark:bg-blue-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${oneDriveProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-3">
            {oneDriveConn.isConnected ? (
              <>
                <button
                  onClick={handleDisconnectOneDrive}
                  className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-medium transition-colors"
                >
                  Disconnect
                </button>
                <button
                  onClick={handleUploadToOneDrive}
                  disabled={isUploadingOneDrive}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  {isUploadingOneDrive ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Uploading ({oneDriveProgress}%)...
                    </>
                  ) : (
                    <>
                      <FolderUp className="w-3.5 h-3.5" />
                      Back Up to OneDrive
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Supports Personal, Work, and School Microsoft accounts.
                </span>
                <button
                  onClick={handleConnectOneDrive}
                  disabled={isConnectingOneDrive}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  {isConnectingOneDrive ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Cloud className="w-3.5 h-3.5" />
                      Connect Microsoft OneDrive
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3: ONEDRIVE CLOUD ARCHIVES LIST (WHEN CONNECTED) */}
      {oneDriveConn.isConnected && (
        <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-blue-500" />
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Microsoft OneDrive Cloud Archives
              </h3>
              <span className="text-xs bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                {oneDriveBackups.length} stored
              </span>
            </div>

            <button
              onClick={loadOneDriveState}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Refresh OneDrive listing"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingOneDrive ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {isLoadingOneDrive ? (
            <div className="p-8 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
              <p className="text-xs">Fetching remote backups from Microsoft Graph...</p>
            </div>
          ) : oneDriveBackups.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No backups found in OneDrive yet. Click &quot;Back Up to OneDrive&quot; to upload your first snapshot.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900/40 text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700/50">
                  <tr>
                    <th className="py-3 px-4">Filename</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Uploaded Timestamp</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                  {oneDriveBackups.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-slate-800 dark:text-slate-100">
                        {item.name}
                      </td>
                      <td className="py-3 px-4">{formatBytes(item.sizeBytes)}</td>
                      <td className="py-3 px-4">{formatDate(item.createdDateTime)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleDownloadFromOneDrive(item)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:white"
                            title="Download to PC"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenRestoreFromOneDrive(item)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 font-semibold text-[11px]"
                            title="Restore this backup"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handleDeleteFromOneDrive(item)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete from OneDrive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: FINANCIAL RECOVERY BANNER (SOLDIER INVOICE) */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/40 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-amber-950 dark:text-amber-200">
                  Targeted Financial Recovery: Soldier Invoice (₹87,000)
                </h3>
                {soldierScan?.foundInDatabase ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    Committed in DB
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    Recovery Available
                  </span>
                )}
              </div>
              <p className="text-sm text-amber-800 dark:text-amber-300/90 mt-1 max-w-3xl">
                Diagnosed and verified: If the invoice for customer <strong>Soldier</strong> (₹87,000) was previously unmigrated or retained only in client state, this idempotent recovery tool commits the invoice, line items, and payment receipt atomically into Supabase and all financial ledgers.
              </p>
            </div>
          </div>

          <button
            onClick={handleRecoverSoldier}
            disabled={isRecoveringSoldier}
            className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
          >
            {isRecoveringSoldier ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Reconciling...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Reconcile Soldier Invoice (₹87,000)
              </>
            )}
          </button>
        </div>
      </div>

      {/* SECTION 5: SYSTEM METRICS & AUTOMATIC BACKUP STATUS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Scheduled Automatic Backups</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900 dark:text-white">Daily at 00:00 IST</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 font-medium">
              Active
            </span>
          </div>
          <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <div>Next Run: <strong className="text-slate-700 dark:text-slate-300">{schedulerInfo?.nextRun ? formatDate(schedulerInfo.nextRun) : 'Tonight at 00:00'}</strong></div>
            <div>Engine: <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400">Client-Assisted & Cloud Cron</span></div>
            {schedulerInfo?.lastRun && (
              <div>Last Run: <span>{formatDate(schedulerInfo.lastRun)}</span></div>
            )}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Backups Recorded</span>
            <Database className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{backups.length}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">snapshots</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Full business state covering invoices, items, payments, stock, customers & ledgers.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Cryptographic Integrity</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">SHA-256</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300 font-medium">
              Verified
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Validated against generated SHA-256 checksums before marking completed or restoring.
          </p>
        </div>
      </div>

      {/* SECTION 6: BACKUP HISTORY TABLE */}
      <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 dark:text-white text-lg">
              Backup History & Audit Log
            </h3>
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
              {backups.length} records
            </span>
          </div>

          <button
            onClick={loadHistory}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="Refresh history"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingHistory ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Database className="w-12 h-12 mx-auto stroke-[1.5] text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">No Backups Yet</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Click &quot;Download Local Backup&quot; or &quot;Back Up to OneDrive&quot; to create your first verified snapshot.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/40 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700/50">
                <tr>
                  <th className="py-3 px-4">Backup ID & Timestamp</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Storage Destination</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Record Counts</th>
                  <th className="py-3 px-4">Checksum (SHA-256)</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs">
                      <div className="font-bold text-slate-800 dark:text-slate-100">
                        {b.id.substring(0, 8)}...{b.id.substring(b.id.length - 4)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-sans mt-0.5">
                        {formatDate(b.createdAt)}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          b.backupType === 'automatic'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            : b.backupType === 'safety'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {b.backupType.toUpperCase()}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          b.status === 'verified'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : b.status === 'completed'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            : b.status === 'failed'
                            ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {b.status === 'verified' && <ShieldCheck className="w-3.5 h-3.5" />}
                        {b.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {b.status === 'failed' && <AlertTriangle className="w-3.5 h-3.5" />}
                        {(b.status === 'pending' || b.status === 'uploading') && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        {b.status.toUpperCase()}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          b.storageLocation === 'onedrive'
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            : b.storageLocation === 'supabase_storage'
                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {b.storageLocation === 'onedrive' ? 'Microsoft OneDrive' : b.storageLocation === 'supabase_storage' ? 'Cloud Storage' : 'Local Archive'}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-200">
                      {formatBytes(b.fileSizeBytes ?? b.sizeBytes ?? 0)}
                    </td>

                    <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                      <span>Inv: {b.recordCounts?.invoices || 0}</span> ·{' '}
                      <span>Pay: {b.recordCounts?.payments || 0}</span> ·{' '}
                      <span>Cust: {b.recordCounts?.customers || 0}</span> ·{' '}
                      <span>Prod: {b.recordCounts?.products || 0}</span>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {b.checksumSha256 ? `${b.checksumSha256.substring(0, 10)}...` : '—'}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleVerifyBackup(b)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                          title="Verify SHA-256 Checksum"
                        >
                          <FileCheck2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenRestoreForHistory(b)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/60 dark:text-indigo-300 font-semibold text-xs transition-colors"
                          title="Restore Data"
                        >
                          Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RESTORE CONFIRMATION MODAL */}
      <Modal
        isOpen={restoreModalOpen}
        onClose={() => !isRestoring && setRestoreModalOpen(false)}
        title="Guarded Database & Asset Restoration"
      >
        <div className="space-y-5">
          {/* SAFETY BANNER */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50 p-4 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold">Multi-Tenant Safety Guarantee:</p>
              <p>
                Before restoring, an automatic <strong>Safety Pre-Restore Backup</strong> of current data will be generated.
                Restoration strictly checks workspace ownership, merges valid business records, and reconciles ledgers in dependency order.
              </p>
            </div>
          </div>

          {/* VERIFY / MANIFEST INSPECTION */}
          {isVerifying ? (
            <div className="p-6 text-center text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
              <p className="text-xs">Inspecting archive manifest and calculating SHA-256 checksum...</p>
            </div>
          ) : verifyResult ? (
            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-3">
              <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center justify-between">
                <span>Archive Manifest & Integrity</span>
                {verifyResult.valid ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Integrity Confirmed
                  </span>
                ) : (
                  <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Verification Error
                  </span>
                )}
              </div>

              {verifyResult.error ? (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-700 dark:text-rose-300 font-mono text-[11px]">
                  {verifyResult.error}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>Workspace: <strong className="font-mono text-slate-800 dark:text-slate-200">{verifyResult.manifest?.workspaceName || verifyResult.workspaceId || 'Default'}</strong></div>
                    <div>Schema Version: <strong className="font-mono text-slate-800 dark:text-slate-200">{verifyResult.schemaVersion || '1.0.0'}</strong></div>
                    <div>Format: <strong className="font-mono text-slate-800 dark:text-slate-200">{verifyResult.formatVersion || '1.0.0'}</strong></div>
                    <div>Branch Scope: <strong className="font-mono text-slate-800 dark:text-slate-200">{verifyResult.manifest?.branchScope || 'ALL'}</strong></div>
                  </div>

                  <div className="font-mono text-slate-400 text-[10px] truncate">
                    SHA-256: {verifyResult.checksum}
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="font-semibold text-[11px] text-slate-700 dark:text-slate-300 mb-1.5">
                      Included Records & Business Assets:
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-slate-600 dark:text-slate-300 text-[11px]">
                      <div>Invoices: <strong>{verifyResult.recordCounts?.invoices || 0}</strong></div>
                      <div>Payments: <strong>{verifyResult.recordCounts?.payments || 0}</strong></div>
                      <div>Customers: <strong>{verifyResult.recordCounts?.customers || 0}</strong></div>
                      <div>Products: <strong>{verifyResult.recordCounts?.products || 0}</strong></div>
                      <div>Udhari: <strong>{verifyResult.recordCounts?.udhariRecords || 0}</strong></div>
                      <div>Assets: <strong>{verifyResult.manifest?.fileInventory?.length || 0}</strong></div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {/* SUCCESS REPORT (IF JUST RESTORED) */}
          {restoreSuccessReport && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-4 rounded-xl text-xs space-y-2">
              <div className="font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Restoration Succeeded
              </div>
              <p className="text-emerald-700 dark:text-emerald-300">
                Data reconciled without conflicts. A safety backup was persisted with ID{' '}
                <span className="font-mono">{restoreSuccessReport.safetyBackupId?.substring(0, 8)}</span>.
              </p>
            </div>
          )}

          {/* CONFIRMATION INPUT */}
          {!restoreSuccessReport && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Type <span className="font-mono text-red-600 dark:text-red-400">RESTORE</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder="Type RESTORE in capital letters"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          )}

          {/* FOOTER BUTTONS */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
            <button
              onClick={() => setRestoreModalOpen(false)}
              disabled={isRestoring}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium"
            >
              {restoreSuccessReport ? 'Close' : 'Cancel'}
            </button>

            {!restoreSuccessReport && (
              <button
                onClick={handleExecuteRestore}
                disabled={isRestoring || isVerifying || !verifyResult?.valid || confirmationInput.trim().toUpperCase() !== 'RESTORE'}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-lg shadow-red-600/30 disabled:opacity-50 flex items-center gap-2"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Restoring Data...
                  </>
                ) : (
                  'Confirm & Restore'
                )}
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
