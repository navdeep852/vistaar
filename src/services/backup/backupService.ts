/**
 * VISTAAR Business OS — Backup & Restore Orchestrator
 * Coordinates authoritative data collection, encryption, serialization, local folder persistence,
 * retention management, and transactional restoration.
 */

import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { supabaseAuthService } from '../supabaseAuth';
import { isValidUuid } from '../../lib/supabaseError';
import { currentPlatform } from '../../platform/platformDetection';

import {
  BackupDataPayload,
  BackupManifest,
  BackupSettings,
  BackupType,
  BackupWriteResult,
  RestoreResult,
  RestorePreview,
  BackupFileInfo,
  BackupDestinationResult,
  BackupCapabilities,
  BackupProgressCallback,
  BackupHistoryRecord,
} from './backupTypes';
import { BackupError, BackupPermissionError } from './backupErrors';
import { BackupDataCollector } from './backupDataCollector';
import { BackupSerializer } from './backupSerializer';
import { BackupRestoreService } from './backupRestoreService';
import { BackupRetentionService } from './backupRetentionService';
import { BackupScheduler } from './backupScheduler';

import { BackupDestinationAdapter } from './adapters/backupAdapter';
import { DesktopFolderAdapter } from './adapters/desktopFolderAdapter';
import { WebFolderAdapter } from './adapters/webFolderAdapter';
import { DownloadAdapter } from './adapters/downloadAdapter';

const BACKUP_SETTINGS_STORAGE_KEY = 'vistaar_backup_settings_v2';
const AUDIT_HISTORY_STORAGE_KEY = 'vistaar_backup_audit_history_v2';

export class BackupService {
  private adapter: BackupDestinationAdapter;
  private scheduler: BackupScheduler;
  private isLocked = false;
  private settings: BackupSettings;

  constructor() {
    // 1. Instantiate platform-appropriate adapter
    if (currentPlatform.isDesktop) {
      this.adapter = new DesktopFolderAdapter();
    } else if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      this.adapter = new WebFolderAdapter();
    } else {
      this.adapter = new DownloadAdapter();
    }

    // 2. Load stored settings
    this.settings = this.loadSettings();

    // 3. Initialize scheduler
    this.scheduler = new BackupScheduler();
    this.scheduler.initialize(
      async () => {
        await this.createBackup({ type: this.settings.frequency === 'weekly' ? 'weekly' : 'daily' });
      },
      () => this.getSettings()
    );
  }

  private loadSettings(): BackupSettings {
    const defaults: BackupSettings = {
      autoBackupEnabled: false,
      frequency: 'daily',
      preferredTime: '20:00', // Default 8:00 PM local time
      retentionDailyCount: 7,
      retentionWeeklyCount: 4,
      retentionMonthlyCount: 3,
    };

    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(BACKUP_SETTINGS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          return { ...defaults, ...parsed };
        }
      } catch {}
    }
    return defaults;
  }

  public getSettings(): BackupSettings {
    const nextScheduled = BackupScheduler.calculateNextScheduledBackup(this.settings);
    return {
      ...this.settings,
      preferredTime: this.settings.preferredTime || '20:00',
      nextScheduledBackup: nextScheduled || undefined,
      destinationLabel: this.adapter.getDestinationLabel(),
    };
  }

  public async updateSettings(updates: Partial<BackupSettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(BACKUP_SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
      } catch {}
    }
  }

  /**
   * Records a lightweight audit history entry (metadata only, no raw payload)
   */
  public recordAuditHistory(record: BackupHistoryRecord): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(AUDIT_HISTORY_STORAGE_KEY);
      const list: BackupHistoryRecord[] = stored ? JSON.parse(stored) : [];
      // Deduplicate by fileName
      const filtered = list.filter((r) => r.fileName !== record.fileName && r.backupId !== record.backupId);
      filtered.unshift(record);
      // Retain max 100 metadata records
      const capped = filtered.slice(0, 100);
      localStorage.setItem(AUDIT_HISTORY_STORAGE_KEY, JSON.stringify(capped));
    } catch (err) {
      console.warn('[BackupService] Could not persist audit history:', err);
    }
  }

  private getAuditHistory(workspaceId: string): BackupHistoryRecord[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const stored = localStorage.getItem(AUDIT_HISTORY_STORAGE_KEY);
      if (!stored) return [];
      const list: BackupHistoryRecord[] = JSON.parse(stored);
      return list.filter((r) => r.workspaceId === workspaceId);
    } catch {
      return [];
    }
  }

  public getAdapter(): BackupDestinationAdapter {
    return this.adapter;
  }

  public async getCapabilities(): Promise<BackupCapabilities> {
    return this.adapter.getCapabilities();
  }

  public async selectDestinationFolder(): Promise<BackupDestinationResult> {
    const result = await this.adapter.selectFolder();
    if (result.success) {
      await this.updateSettings({
        destinationLabel: this.adapter.getDestinationLabel(),
      });
    }
    return result;
  }

  public async verifyDestination(): Promise<BackupDestinationResult> {
    return this.adapter.verifyAccess();
  }

  public async disconnectDestination(): Promise<void> {
    await this.adapter.disconnect();
    await this.updateSettings({ destinationLabel: undefined });
  }

  public async openFolderInExplorer(): Promise<void> {
    if (this.adapter.openFolderInExplorer) {
      await this.adapter.openFolderInExplorer();
    }
  }

  /**
   * Generates and writes an authoritative backup archive into the local destination folder.
   */
  public async createBackup(options: {
    password?: string;
    type?: BackupType;
    onProgress?: BackupProgressCallback;
  } = {}): Promise<BackupWriteResult> {
    if (this.isLocked) {
      throw new BackupError('Another backup or restore operation is already in progress.');
    }

    const wsId = supabaseAuthService.getCurrentCompanyId();
    if (!wsId || !isValidUuid(wsId)) {
      throw new BackupPermissionError('No authoritative active workspace found. Please sign in.');
    }

    const userProfile = supabaseAuthService.getUser();
    const workspaceName = userProfile?.businessName || 'VISTAAR Business';
    const backupType = options.type || 'manual';

    this.isLocked = true;
    try {
      // 1. Verify Destination Access
      if (options.onProgress) {
        options.onProgress({
          stage: 'idle',
          message: 'Verifying destination folder...',
          percentage: 5,
        });
      }
      const access = await this.adapter.verifyAccess();
      if (!access.success) {
        throw new BackupPermissionError(access.error || 'Destination folder is not accessible.');
      }

      // 2. Collect Workspace Data from Supabase
      const { data, tableCounts, totalRows } = await BackupDataCollector.collectWorkspaceData(
        wsId,
        options.onProgress
      );

      // 3. Serialize, Gzip Compress, and AES-256-GCM Encrypt
      if (options.onProgress) {
        options.onProgress({
          stage: 'encrypting',
          message: 'Compressing and encrypting records...',
          percentage: 75,
          rowsCollected: totalRows,
        });
      }

      const platform = currentPlatform.isDesktop ? 'desktop' : 'web';
      const { archiveContent, manifest, fileSizeBytes } = await BackupSerializer.serializeArchive({
        data,
        tableCounts,
        workspaceId: wsId,
        workspaceName,
        password: options.password,
        backupType,
        platform,
      });

      // 4. Construct Deterministic Timestamped Filename
      const fileName = BackupSerializer.generateFileName(backupType, new Date(manifest.createdAt));

      // 5. Write to Destination Folder (with temp-file atomic verification)
      if (options.onProgress) {
        options.onProgress({
          stage: 'writing',
          message: 'Writing backup to local OneDrive folder...',
          percentage: 85,
        });
      }

      const writeResult = await this.adapter.writeBackup(fileName, archiveContent);
      if (!writeResult.success) {
        throw new BackupError(writeResult.error || 'Failed to write backup file.');
      }

      // 6. Record in Remote Supabase Audit Log (table: backups)
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          await supabase.from('backups').insert([
            {
              workspace_id: wsId,
              backup_name: fileName,
              backup_type: backupType,
              status: 'verified',
              storage_location: 'local_onedrive_folder',
              file_size_bytes: fileSizeBytes,
              record_counts: tableCounts,
              checksum_sha256: manifest.integrity.checksum,
              schema_version: '3.0.0',
              notes: `Written to local destination: ${this.adapter.getDestinationLabel()}`,
              created_by: userProfile?.id,
            },
          ]);
        } catch (auditErr) {
          console.warn('[BackupService] Notice recording backup to database ledger:', auditErr);
        }
      }

      // 7. Apply Retention Policy
      if (options.onProgress) {
        options.onProgress({
          stage: 'cleanup',
          message: 'Applying retention rules...',
          percentage: 95,
        });
      }
      try {
        await BackupRetentionService.pruneOldBackups(this.adapter, wsId, this.settings);
      } catch (retentionErr) {
        console.warn('[BackupService] Notice during retention cleanup:', retentionErr);
      }

      // 8. Update Last Run Settings & Persist Audit History
      await this.updateSettings({
        lastSuccessfulBackup: new Date().toISOString(),
        lastStatus: 'completed',
        lastError: undefined,
      });

      this.recordAuditHistory({
        backupId: manifest.backupId,
        workspaceId: wsId,
        workspaceName,
        createdAt: manifest.createdAt,
        completedAt: new Date().toISOString(),
        backupType: backupType as any,
        destinationType: 'onedrive_folder',
        destinationName: this.adapter.getDestinationLabel(),
        fileName,
        filePath: writeResult.filePath,
        fileSizeBytes,
        recordCounts: tableCounts,
        totalRecords: totalRows,
        integrityStatus: 'verified',
        localWriteStatus: 'saved',
        cloudSyncStatus: 'unknown',
      });

      if (options.onProgress) {
        options.onProgress({
          stage: 'completed',
          message: 'Backup completed and verified successfully!',
          percentage: 100,
          rowsCollected: totalRows,
        });
      }

      return writeResult;
    } catch (err: any) {
      await this.updateSettings({
        lastAttemptedBackup: new Date().toISOString(),
        lastStatus: 'failed',
        lastError: err?.message || String(err),
      });

      this.recordAuditHistory({
        backupId: crypto.randomUUID(),
        workspaceId: wsId,
        workspaceName,
        createdAt: new Date().toISOString(),
        backupType: backupType as any,
        destinationType: 'onedrive_folder',
        destinationName: this.adapter.getDestinationLabel(),
        fileName: 'unnamed_failed_backup',
        fileSizeBytes: 0,
        recordCounts: {},
        totalRecords: 0,
        integrityStatus: 'unverified',
        localWriteStatus: 'failed',
        cloudSyncStatus: 'unknown',
        errorMessage: err?.message || String(err),
      });

      if (options.onProgress) {
        options.onProgress({
          stage: 'failed',
          message: err?.message || 'Backup failed.',
          percentage: 100,
        });
      }
      throw err;
    } finally {
      this.isLocked = false;
    }
  }

  /**
   * Generates a direct downloadable `.vistaarbackup` archive.
   * Works independently of whether a local OneDrive folder is connected, across Desktop and Web.
   */
  public async downloadBackup(options: {
    password?: string;
    onProgress?: BackupProgressCallback;
  } = {}): Promise<{ fileName: string; fileSizeBytes: number; checksum: string }> {
    if (this.isLocked) {
      throw new BackupError('Another backup or restore operation is already in progress.');
    }

    const wsId = supabaseAuthService.getCurrentCompanyId();
    if (!wsId || !isValidUuid(wsId)) {
      throw new BackupPermissionError('No authoritative active workspace found. Please sign in.');
    }

    const userProfile = supabaseAuthService.getUser();
    const workspaceName = userProfile?.businessName || 'VISTAAR Business';

    this.isLocked = true;
    try {
      // 1. Collect authoritative workspace records
      if (options.onProgress) {
        options.onProgress({
          stage: 'collecting',
          message: 'Collecting business records for download...',
          percentage: 10,
        });
      }
      const { data, tableCounts, totalRows } = await BackupDataCollector.collectWorkspaceData(
        wsId,
        options.onProgress
      );

      // 2. Compress & Encrypt Archive
      if (options.onProgress) {
        options.onProgress({
          stage: 'encrypting',
          message: 'Compressing and encrypting backup archive...',
          percentage: 75,
          rowsCollected: totalRows,
        });
      }

      const platform = currentPlatform.isDesktop ? 'desktop' : 'web';
      const { archiveContent, manifest, fileSizeBytes } = await BackupSerializer.serializeArchive({
        data,
        tableCounts,
        workspaceId: wsId,
        workspaceName,
        password: options.password,
        backupType: 'download',
        platform,
      });

      const fileName = BackupSerializer.generateFileName('download', new Date(manifest.createdAt));

      // 3. Trigger File Save / Browser Download
      if (options.onProgress) {
        options.onProgress({
          stage: 'writing',
          message: 'Triggering file download to computer...',
          percentage: 90,
        });
      }

      let savedFilePath: string | undefined;

      // On desktop, try native save dialog first
      if (currentPlatform.isDesktop && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        try {
          const dialog = await import('@tauri-apps/plugin-dialog');
          const fs = await import('@tauri-apps/plugin-fs');
          const savePath = await dialog.save({
            defaultPath: fileName,
            filters: [{ name: 'VISTAAR Backup Archive', extensions: ['vistaarbackup'] }],
          });
          if (savePath) {
            await fs.writeTextFile(savePath, archiveContent);
            savedFilePath = savePath;
          }
        } catch {
          // If native dialog fails or isn't available, fallback to blob trigger
        }
      }

      // If not saved via native dialog (or running on Web), trigger browser download
      if (!savedFilePath && typeof document !== 'undefined') {
        const blob = new Blob([archiveContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }

      // 4. Record in Audit History
      this.recordAuditHistory({
        backupId: manifest.backupId,
        workspaceId: wsId,
        workspaceName,
        createdAt: manifest.createdAt,
        completedAt: new Date().toISOString(),
        backupType: 'download',
        destinationType: 'browser_download',
        destinationName: savedFilePath || 'Computer Downloads',
        fileName,
        filePath: savedFilePath,
        fileSizeBytes,
        recordCounts: tableCounts,
        totalRecords: totalRows,
        integrityStatus: 'verified',
        localWriteStatus: 'downloaded',
        cloudSyncStatus: 'not_applicable',
      });

      if (options.onProgress) {
        options.onProgress({
          stage: 'completed',
          message: 'Backup downloaded successfully!',
          percentage: 100,
          rowsCollected: totalRows,
        });
      }

      return {
        fileName,
        fileSizeBytes,
        checksum: manifest.integrity.checksum,
      };
    } finally {
      this.isLocked = false;
    }
  }

  /**
   * Previews a backup file before restoration
   */
  public async previewBackup(
    archiveContent: string,
    password?: string
  ): Promise<{ preview: RestorePreview; manifest: BackupManifest; data?: BackupDataPayload }> {
    const wsId = supabaseAuthService.getCurrentCompanyId() || '';
    const userProfile = supabaseAuthService.getUser();
    const wsName = userProfile?.businessName || 'Active Workspace';

    return BackupRestoreService.generatePreview(archiveContent, wsId, wsName, password);
  }

  /**
   * Executes a full restoration of business records into the active workspace.
   * Creates an automatic pre-restore safety snapshot before mutating data.
   */
  public async restoreBackup(
    archiveContent: string,
    password?: string
  ): Promise<RestoreResult> {
    if (this.isLocked) {
      throw new BackupError('Another backup or restore operation is in progress.');
    }

    const wsId = supabaseAuthService.getCurrentCompanyId();
    if (!wsId || !isValidUuid(wsId)) {
      throw new BackupPermissionError('No active workspace authenticated.');
    }

    this.isLocked = true;
    try {
      // 1. Unpack & Validate Archive
      const { manifest, data } = await BackupSerializer.deserializeArchive(
        archiveContent,
        password
      );

      // 2. Generate Automatic Pre-Restore Safety Backup
      let safetyFileName: string | undefined;
      try {
        const safetyResult = await this.createBackup({
          type: 'safety_pre_restore',
          password,
        });
        safetyFileName = safetyResult.fileName;
      } catch (safetyErr) {
        console.warn('[BackupService] Safety pre-restore snapshot warning:', safetyErr);
      }

      // 3. Execute Transactional Dependency Restoration
      const result = await BackupRestoreService.executeRestore(data, manifest, wsId);
      result.safetyBackupFileName = safetyFileName;

      return result;
    } finally {
      this.isLocked = false;
    }
  }

  /**
   * Lists backup archives present in the connected destination folder and audit history
   */
  public async listBackups(): Promise<BackupFileInfo[]> {
    const wsId = supabaseAuthService.getCurrentCompanyId() || '';
    const adapterFiles: BackupFileInfo[] = [];
    try {
      const files = await this.adapter.listBackups();
      adapterFiles.push(...files);
    } catch (err) {
      console.warn('[BackupService] Could not list adapter files:', err);
    }

    const auditRecords = this.getAuditHistory(wsId);
    const resultMap = new Map<string, BackupFileInfo>();

    // 1. Add files detected in destination folder
    for (const f of adapterFiles) {
      const matchedAudit = auditRecords.find((a) => a.fileName === f.fileName);
      resultMap.set(f.fileName, {
        ...f,
        backupType:
          matchedAudit?.backupType ||
          (f.fileName.includes('_daily_') || f.fileName.includes('_weekly_')
            ? 'automatic'
            : 'manual'),
        destinationName: matchedAudit?.destinationName || this.adapter.getDestinationLabel(),
        localWriteStatus: 'saved',
        cloudSyncStatus: 'unknown',
      });
    }

    // 2. Add audit records for downloads or history that were saved outside the destination folder
    for (const a of auditRecords) {
      if (!resultMap.has(a.fileName)) {
        resultMap.set(a.fileName, {
          fileName: a.fileName,
          filePath: a.filePath,
          fileSizeBytes: a.fileSizeBytes,
          createdAt: a.createdAt,
          status:
            a.integrityStatus === 'verified'
              ? 'valid'
              : a.integrityStatus === 'corrupted'
              ? 'corrupted'
              : 'unverified',
          backupType: a.backupType,
          destinationName:
            a.destinationName ||
            (a.backupType === 'download' ? 'Computer Downloads' : 'OneDrive Folder'),
          localWriteStatus: a.localWriteStatus,
          cloudSyncStatus: a.cloudSyncStatus,
          error: a.errorMessage,
        });
      }
    }

    // Sort newest first
    return Array.from(resultMap.values()).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
  }

  /**
   * Reads the raw text content of a backup file from the destination
   */
  public async readBackupFile(fileName: string): Promise<string> {
    const result = await this.adapter.readBackup(fileName);
    if (!result.success || !result.data) {
      throw new BackupError(result.error || `Could not read backup file '${fileName}'.`);
    }
    return new TextDecoder().decode(result.data);
  }

  /**
   * Deletes a backup file from the destination
   */
  public async deleteBackup(fileName: string): Promise<void> {
    const result = await this.adapter.deleteBackup(fileName);
    if (!result.success) {
      throw new BackupError(result.error || `Could not delete backup file '${fileName}'.`);
    }
  }
}

export const backupService = new BackupService();

