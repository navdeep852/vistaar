/**
 * VISTAAR Business OS — Backup Serializer & Packaging Service
 * Compresses (gzip), encrypts (AES-256-GCM), and packages archives into `.vistaarbackup` files.
 */

import { BackupCryptoService } from './backupCryptoService';
import { BackupIntegrityService } from './backupIntegrityService';
import { BackupValidationError } from './backupErrors';
import {
  BackupDataPayload,
  BackupManifest,
  StoredBackupFile,
  BackupType,
  BackupPlatform,
} from './backupTypes';

function uint8ToBase64(uint8: Uint8Array): string {
  let binary = '';
  const len = uint8.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = uint8.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Gzip compression using standard browser / WebView2 CompressionStream
 */
async function compressGzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([data as any]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const response = new Response(compressedStream);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }
  return data; // uncompressed fallback
}

/**
 * Gzip decompression using standard browser / WebView2 DecompressionStream
 */
async function decompressGzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const stream = new Blob([data as any]).stream();
      const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
      const response = new Response(decompressedStream);
      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      // If data was not gzipped, return original
      return data;
    }
  }
  return data;
}

export class BackupSerializer {
  /**
   * Packages workspace data into a complete, encrypted, integrity-checked `.vistaarbackup` string.
   */
  public static async serializeArchive(params: {
    data: BackupDataPayload;
    tableCounts: Record<string, number>;
    workspaceId: string;
    workspaceName: string;
    password?: string;
    backupType?: BackupType;
    platform: BackupPlatform;
    applicationVersion?: string;
  }): Promise<{ archiveContent: string; manifest: BackupManifest; fileSizeBytes: number }> {
    const {
      data,
      tableCounts,
      workspaceId,
      workspaceName,
      password,
      backupType = 'manual',
      platform,
      applicationVersion = '1.0.0',
    } = params;

    const backupId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    // 1. Serialize Data Payload to JSON
    const jsonString = JSON.stringify(data);
    const rawBytes = new TextEncoder().encode(jsonString);
    const uncompressedSizeBytes = rawBytes.byteLength;

    // 2. Compress via Gzip
    const compressedBytes = await compressGzip(rawBytes);

    // 3. Encrypt via AES-256-GCM (if password provided)
    let payloadBytes: Uint8Array;
    let encryptionInfo: any;

    if (password && password.trim().length > 0) {
      const encResult = await BackupCryptoService.encrypt(compressedBytes, password);
      payloadBytes = encResult.ciphertext;
      encryptionInfo = encResult.encryptionInfo;
    } else {
      payloadBytes = compressedBytes;
      encryptionInfo = {
        enabled: false,
        algorithm: 'none',
      };
    }

    // 4. Calculate Integrity Checksum on Final Payload Bytes
    const checksum = await BackupIntegrityService.calculateSha256(payloadBytes);

    // 5. Construct Table Summary
    const tablesSummary: Record<string, { rowCount: number }> = {};
    for (const [tName, count] of Object.entries(tableCounts)) {
      tablesSummary[tName] = { rowCount: count };
    }

    // 6. Build Manifest
    const manifest: BackupManifest = {
      format: 'VISTAAR_BACKUP',
      formatVersion: 1,
      application: 'VISTAAR',
      backupId,
      workspaceId,
      workspaceName: workspaceName || 'My Business',
      createdAt,
      backupType,
      schemaVersion: '3.0.0',
      applicationVersion,
      platform,
      encryption: encryptionInfo,
      tables: tablesSummary,
      integrity: {
        algorithm: 'SHA-256',
        checksum,
        uncompressedSizeBytes,
        archiveSizeBytes: payloadBytes.byteLength,
      },
    };

    // 7. Assemble Complete Stored File Structure
    const storedFile: StoredBackupFile = {
      format: 'VISTAAR_BACKUP',
      version: 1,
      manifest,
      encrypted: encryptionInfo.enabled,
      payload: uint8ToBase64(payloadBytes),
    };

    const archiveContent = JSON.stringify(storedFile, null, 2);
    const fileSizeBytes = new TextEncoder().encode(archiveContent).byteLength;

    return {
      archiveContent,
      manifest,
      fileSizeBytes,
    };
  }

  /**
   * Reads, verifies, decrypts, and unpacks a `.vistaarbackup` file content.
   */
  public static async deserializeArchive(
    archiveContent: string,
    password?: string
  ): Promise<{ manifest: BackupManifest; data: BackupDataPayload }> {
    let parsed: any;
    try {
      parsed = JSON.parse(archiveContent);
    } catch {
      throw new BackupValidationError('Invalid backup file: Not a valid JSON document.');
    }

    // 1. Validate Container & Manifest Structure
    BackupIntegrityService.validateContainerFormat(parsed);
    const manifest = parsed.manifest as BackupManifest;
    BackupIntegrityService.validateManifest(manifest);

    // 2. Decode Payload
    const payloadBytes = base64ToUint8(parsed.payload);

    // 3. Verify Checksum
    const actualChecksum = await BackupIntegrityService.calculateSha256(payloadBytes);
    if (!BackupIntegrityService.verifyChecksum(manifest.integrity.checksum, actualChecksum)) {
      throw new BackupValidationError(
        `Integrity Checksum Mismatch! File appears corrupted or tampered with.\nExpected: ${manifest.integrity.checksum}\nComputed: ${actualChecksum}`
      );
    }

    // 4. Decrypt (if encrypted)
    let decryptedBytes: Uint8Array;
    if (manifest.encryption.enabled) {
      if (!password || password.trim().length === 0) {
        throw new BackupValidationError('This backup archive is encrypted. Please provide the backup password.');
      }
      decryptedBytes = await BackupCryptoService.decrypt(
        payloadBytes,
        password,
        manifest.encryption
      );
    } else {
      decryptedBytes = payloadBytes;
    }

    // 5. Decompress Gzip
    const decompressedBytes = await decompressGzip(decryptedBytes);
    const jsonString = new TextDecoder().decode(decompressedBytes);

    // 6. Parse Data Payload
    let data: BackupDataPayload;
    try {
      data = JSON.parse(jsonString);
    } catch {
      throw new BackupValidationError('Failed to parse decompressed business records payload.');
    }

    return { manifest, data };
  }

  /**
   * Inspects the manifest of a `.vistaarbackup` file without requiring the decryption password.
   * Useful for showing file preview, creation date, workspace name, record counts, and size.
   */
  public static inspectManifest(archiveContent: string): BackupManifest {
    let parsed: any;
    try {
      parsed = JSON.parse(archiveContent);
    } catch {
      throw new BackupValidationError('Invalid backup file: Not a valid JSON document.');
    }
    BackupIntegrityService.validateContainerFormat(parsed);
    BackupIntegrityService.validateManifest(parsed.manifest);
    return parsed.manifest as BackupManifest;
  }

  /**
   * Generates a standard timestamped `.vistaarbackup` filename.
   */
  public static generateFileName(type: string = 'manual', date: Date = new Date()): string {
    const datePart = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `VISTAAR_Backup_${type}_${datePart}.vistaarbackup`;
  }
}


