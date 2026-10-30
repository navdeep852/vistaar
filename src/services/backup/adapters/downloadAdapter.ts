/**
 * VISTAAR Business OS — Download / Upload Fallback Adapter
 * Fallback destination for standard web browsers (Safari, Firefox) without File System Access API.
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
import { BackupIntegrityService } from '../backupIntegrityService';

export class DownloadAdapter implements BackupDestinationAdapter {
  public async getCapabilities(): Promise<BackupCapabilities> {
    return {
      platform: 'web',
      hasDirectoryPicker: false,
      hasNativeFs: false,
      supportsDirectFolder: false,
      canOpenFolderInExplorer: false,
    };
  }

  public getDestinationLabel(): string {
    return 'Manual Browser Download / Upload';
  }

  public async disconnect(): Promise<void> {
    // No-op for manual download
  }

  public async selectFolder(): Promise<BackupDestinationResult> {
    return {
      success: true,
      folderName: 'Browser Downloads',
    };
  }

  public async verifyAccess(): Promise<BackupDestinationResult> {
    return {
      success: true,
      folderName: 'Browser Downloads',
    };
  }

  /**
   * Triggers an immediate browser download of the `.vistaarbackup` file
   */
  public async writeBackup(
    fileName: string,
    data: string | Uint8Array
  ): Promise<BackupWriteResult> {
    try {
      const blob =
        typeof data === 'string'
          ? new Blob([data], { type: 'application/json' })
          : new Blob([data as any], { type: 'application/octet-stream' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      const checksum = await BackupIntegrityService.calculateSha256(data);

      return {
        success: true,
        fileName,
        fileSizeBytes: blob.size,
        checksum,
      };
    } catch (err: any) {
      return {
        success: false,
        fileName,
        fileSizeBytes: 0,
        checksum: '',
        error: `Browser download failed: ${err.message || String(err)}`,
      };
    }
  }

  public async readBackup(_fileName: string): Promise<BackupReadResult> {
    return {
      success: false,
      error: 'Direct file reading is not supported in download-only mode. Please use file upload.',
    };
  }

  public async listBackups(): Promise<BackupFileInfo[]> {
    return [];
  }

  public async deleteBackup(fileName: string): Promise<BackupDeleteResult> {
    return {
      success: false,
      fileName,
      error: 'Cannot delete files from browser downloads directly.',
    };
  }
}

