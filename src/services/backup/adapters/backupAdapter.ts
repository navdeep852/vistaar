/**
 * VISTAAR Business OS — Backup Destination Adapter Interface
 * Universal interface for platform-specific storage destinations (Local OneDrive folder, browser folder picker, manual downloads)
 */

import {
  BackupCapabilities,
  BackupDestinationResult,
  BackupWriteResult,
  BackupReadResult,
  BackupDeleteResult,
  BackupFileInfo,
} from '../backupTypes';

export interface BackupDestinationAdapter {
  /**
   * Returns capabilities of this destination adapter under the current runtime environment.
   */
  getCapabilities(): Promise<BackupCapabilities>;

  /**
   * Prompts user to select or connect a backup destination folder.
   */
  selectFolder(): Promise<BackupDestinationResult>;

  /**
   * Verifies that the currently configured destination exists and has read/write permissions.
   */
  verifyAccess(): Promise<BackupDestinationResult>;

  /**
   * Writes a backup archive to the destination.
   * Implementation should use temporary atomic write where supported.
   */
  writeBackup(
    fileName: string,
    data: string | Uint8Array
  ): Promise<BackupWriteResult>;

  /**
   * Reads a backup archive from the destination.
   */
  readBackup(fileName: string): Promise<BackupReadResult>;

  /**
   * Lists all `.vistaarbackup` files in the destination folder.
   */
  listBackups(): Promise<BackupFileInfo[]>;

  /**
   * Deletes a backup archive from the destination folder.
   */
  deleteBackup(fileName: string): Promise<BackupDeleteResult>;

  /**
   * Retrieves the currently configured folder path or display name.
   */
  getDestinationLabel(): string;

  /**
   * Disconnects or resets the current destination preference.
   */
  disconnect(): Promise<void>;

  /**
   * Reveals the folder in the native file explorer (desktop only).
   */
  openFolderInExplorer?(): Promise<void>;
}

