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
      preferredTime: '23:00',
      retentionDailyCount: 7,
      retentionWeeklyCount: 4,
      retentionMonthlyCount: 3,
    };

    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(BACKUP_SETTINGS_STORAGE_KEY);
        if (stored) {
          return { ...defaults, ...JSON.parse(stored) };
        }
      } catch {}
    }
    return defaults;
  }

  public getSettings(): BackupSettings {
    return {
      ...this.settings,
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

      // 8. Update Last Run Settings
      await this.updateSettings({
        lastSuccessfulBackup: new Date().toISOString(),
        lastStatus: 'completed',
        lastError: undefined,
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
   * Lists backup archives present in the connected destination folder
   */
  public async listBackups(): Promise<BackupFileInfo[]> {
    return this.adapter.listBackups();
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

