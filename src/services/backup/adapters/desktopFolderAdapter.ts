/**
 * VISTAAR Business OS — Desktop OneDrive Folder Adapter (Tauri v2)
 * Manages direct local folder reading, writing, atomic verification, and explorer reveal.
 */

import { BackupDestinationAdapter } from './backupAdapter';
import {
  BackupCapabilities,
  BackupDestinationResult,
  BackupWriteResult,
  BackupReadResult,
  BackupDeleteResult,
  BackupFileInfo,
} from '../backupTypes';
import { BackupPermissionError, BackupError } from '../backupErrors';
import { BackupIntegrityService } from '../backupIntegrityService';
import { BackupSerializer } from '../backupSerializer';

const DESKTOP_FOLDER_STORAGE_KEY = 'vistaar_desktop_onedrive_folder_path';

export class DesktopFolderAdapter implements BackupDestinationAdapter {
  private configuredPath: string = '';

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        this.configuredPath = localStorage.getItem(DESKTOP_FOLDER_STORAGE_KEY) || '';
      } catch {}
    }
  }

  private isTauriAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as any;
    return Boolean(win.__TAURI__ || win.__TAURI_INTERNALS__);
  }

  public async getCapabilities(): Promise<BackupCapabilities> {
    const isTauri = this.isTauriAvailable();
    return {
      platform: 'desktop',
      hasDirectoryPicker: isTauri,
      hasNativeFs: isTauri,
      supportsDirectFolder: isTauri,
      canOpenFolderInExplorer: isTauri,
    };
  }

  public getDestinationLabel(): string {
    return this.configuredPath || 'No local folder selected';
  }

  public async disconnect(): Promise<void> {
    this.configuredPath = '';
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(DESKTOP_FOLDER_STORAGE_KEY);
      } catch {}
    }
  }

  /**
   * Prompts user with native OS folder selection dialog
   */
  public async selectFolder(): Promise<BackupDestinationResult> {
    if (!this.isTauriAvailable()) {
      return { success: false, error: 'Native desktop dialog is only available in VISTAAR Desktop.' };
    }

    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Local OneDrive Backup Folder',
      });

      if (!selected || typeof selected !== 'string') {
        return { success: false, error: 'Folder selection was cancelled.' };
      }

      this.configuredPath = selected;
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(DESKTOP_FOLDER_STORAGE_KEY, selected);
        } catch {}
      }

      // Verify immediate write access
      const verify = await this.verifyAccess();
      if (!verify.success) {
        return {
          success: false,
          folderPath: selected,
          folderName: selected.split(/[\/\\]/).pop() || selected,
          error: verify.error,
        };
      }

      return {
        success: true,
        folderPath: selected,
        folderName: selected.split(/[\/\\]/).pop() || selected,
      };
    } catch (err: any) {
      return { success: false, error: `Folder selection failed: ${err.message || String(err)}` };
    }
  }

  /**
   * Verifies that the configured folder exists and allows writing
   */
  public async verifyAccess(): Promise<BackupDestinationResult> {
    if (!this.configuredPath) {
      return { success: false, error: 'No OneDrive folder is configured. Please select a folder first.' };
    }

    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const exists = await fs.exists(this.configuredPath);
      if (!exists) {
        return {
          success: false,
          error: `The configured folder does not exist: "${this.configuredPath}". It may have been moved or deleted.`,
        };
      }

      // Test write & delete
      const testFile = `${this.configuredPath}/.vistaar_write_test_${Date.now()}.tmp`;
      await fs.writeTextFile(testFile, 'VISTAAR_TEST_WRITE');
      await fs.remove(testFile);

      return {
        success: true,
        folderPath: this.configuredPath,
        folderName: this.configuredPath.split(/[\/\\]/).pop() || this.configuredPath,
      };
    } catch (err: any) {
      return {
        success: false,
        folderPath: this.configuredPath,
        error: `Permission denied or unable to write to folder "${this.configuredPath}": ${err.message || String(err)}`,
      };
    }
  }

  /**
   * Atomically writes backup: writes to .tmp file first, checks size, then renames to final .vistaarbackup
   */
  public async writeBackup(
    fileName: string,
    data: string | Uint8Array
  ): Promise<BackupWriteResult> {
    const access = await this.verifyAccess();
    if (!access.success) {
      throw new BackupPermissionError(access.error || 'Destination folder is not accessible.');
    }

    const fs = await import('@tauri-apps/plugin-fs');
    const finalPath = `${this.configuredPath}/${fileName}`;
    const tempPath = `${this.configuredPath}/${fileName}.tmp`;

    try {
      if (typeof data === 'string') {
        await fs.writeTextFile(tempPath, data);
      } else {
        await fs.writeFile(tempPath, data);
      }

      // Verify temp file existence and size
      const exists = await fs.exists(tempPath);
      if (!exists) {
        throw new BackupError('Temporary backup file was not created.');
      }

      const fileStat = await fs.stat(tempPath);
      if (fileStat.size === 0) {
        await fs.remove(tempPath).catch(() => {});
        throw new BackupError('Created backup file is zero bytes (empty).');
      }

      // Rename temp file to final destination
      await fs.rename(tempPath, finalPath);

      const checksum = await BackupIntegrityService.calculateSha256(data);

      return {
        success: true,
        fileName,
        filePath: finalPath,
        fileSizeBytes: fileStat.size,
        checksum,
      };
    } catch (err: any) {
      // Clean up incomplete temp file
      await fs.remove(tempPath).catch(() => {});
      return {
        success: false,
        fileName,
        fileSizeBytes: 0,
        checksum: '',
        error: `Failed to write backup file: ${err.message || String(err)}`,
      };
    }
  }

  /**
   * Reads a backup file by filename from the configured folder
   */
  public async readBackup(fileName: string): Promise<BackupReadResult> {
    const access = await this.verifyAccess();
    if (!access.success) {
      return { success: false, error: access.error };
    }

    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const filePath = `${this.configuredPath}/${fileName}`;
      const bytes = await fs.readFile(filePath);
      return {
        success: true,
        data: bytes,
      };
    } catch (err: any) {
      return { success: false, error: `Failed to read backup file: ${err.message || String(err)}` };
    }
  }

  /**
   * Lists all `.vistaarbackup` files in the folder with parsed manifest preview
   */
  public async listBackups(): Promise<BackupFileInfo[]> {
    if (!this.configuredPath) return [];

    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const exists = await fs.exists(this.configuredPath);
      if (!exists) return [];

      const entries = await fs.readDir(this.configuredPath);
      const backupFiles: BackupFileInfo[] = [];

      for (const entry of entries) {
        if (!entry.isFile || !entry.name || !entry.name.endsWith('.vistaarbackup')) {
          continue;
        }

        const filePath = `${this.configuredPath}/${entry.name}`;
        try {
          const fileStat = await fs.stat(filePath);
          let manifest: any = undefined;

          // Attempt to inspect manifest for preview
          try {
            const content = await fs.readTextFile(filePath);
            manifest = BackupSerializer.inspectManifest(content);
          } catch {
            // Keep status unverified if manifest preview fails
          }

          backupFiles.push({
            fileName: entry.name,
            filePath,
            fileSizeBytes: fileStat.size,
            createdAt: manifest?.createdAt || new Date(fileStat.mtime || Date.now()).toISOString(),
            status: manifest ? 'valid' : 'unverified',
            manifest,
          });
        } catch {
          // Skip unreadable files
        }
      }

      // Sort newest first
      return backupFiles.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch (err) {
      console.warn('[DesktopFolderAdapter] Failed to list backup files:', err);
      return [];
    }
  }

  /**
   * Deletes a backup file from the local folder
   */
  public async deleteBackup(fileName: string): Promise<BackupDeleteResult> {
    if (!this.configuredPath) {
      return { success: false, fileName, error: 'No folder configured.' };
    }

    try {
      const fs = await import('@tauri-apps/plugin-fs');
      const filePath = `${this.configuredPath}/${fileName}`;
      await fs.remove(filePath);
      return { success: true, fileName };
    } catch (err: any) {
      return { success: false, fileName, error: `Failed to delete file: ${err.message || String(err)}` };
    }
  }

  /**
   * Reveals the folder in Windows File Explorer
   */
  public async openFolderInExplorer(): Promise<void> {
    if (!this.configuredPath || !this.isTauriAvailable()) return;
    try {
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(this.configuredPath);
    } catch (err) {
      console.warn('[DesktopFolderAdapter] Could not reveal folder:', err);
    }
  }
}

