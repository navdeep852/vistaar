/**
 * VISTAAR Business OS — Backup Integrity & Checksum Service
 * Verifies SHA-256 hashes, manifest formats, and archive completeness.
 */

import { BackupValidationError } from './backupErrors';
import { BackupManifest, StoredBackupFile } from './backupTypes';

export class BackupIntegrityService {
  /**
   * Calculates the standard 64-character lowercase SHA-256 checksum for a buffer or string.
   */
  public static async calculateSha256(data: string | Uint8Array | ArrayBuffer): Promise<string> {
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as any);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validates the top-level format of a stored backup file.
   */
  public static validateContainerFormat(file: any): file is StoredBackupFile {
    if (!file || typeof file !== 'object') {
      throw new BackupValidationError('Corrupted backup file: Not a valid JSON object.');
    }
    if (file.format !== 'VISTAAR_BACKUP') {
      throw new BackupValidationError(
        `Invalid backup format '${file.format}'. Expected 'VISTAAR_BACKUP'.`
      );
    }
    if (file.version !== 1) {
      throw new BackupValidationError(
        `Unsupported backup container version '${file.version}'. Supported version is 1.`
      );
    }
    if (!file.manifest || typeof file.manifest !== 'object') {
      throw new BackupValidationError('Corrupted backup file: Missing manifest.');
    }
    if (typeof file.payload !== 'string' || file.payload.length === 0) {
      throw new BackupValidationError('Corrupted backup file: Missing or empty payload.');
    }
    return true;
  }

  /**
   * Validates the integrity of the manifest fields.
   */
  public static validateManifest(manifest: BackupManifest): void {
    if (!manifest.backupId) {
      throw new BackupValidationError('Manifest missing backup ID.');
    }
    if (!manifest.workspaceId) {
      throw new BackupValidationError('Manifest missing workspace ID.');
    }
    if (!manifest.createdAt || isNaN(Date.parse(manifest.createdAt))) {
      throw new BackupValidationError('Manifest contains invalid creation timestamp.');
    }
    if (!manifest.integrity || !manifest.integrity.checksum) {
      throw new BackupValidationError('Manifest missing integrity checksum.');
    }
    if (manifest.integrity.checksum.length !== 64) {
      throw new BackupValidationError(
        `Invalid SHA-256 checksum length (${manifest.integrity.checksum.length}). Expected 64 hex characters.`
      );
    }
  }

  /**
   * Compares an expected SHA-256 hash against a computed hash.
   */
  public static verifyChecksum(expected: string, actual: string): boolean {
    if (!expected || !actual) return false;
    return expected.toLowerCase() === actual.toLowerCase();
  }
}

