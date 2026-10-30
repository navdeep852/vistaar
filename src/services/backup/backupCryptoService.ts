/**
 * VISTAAR Business OS — Backup Cryptography Service
 * Standard Web Crypto API implementation of AES-256-GCM + PBKDF2-SHA-256
 *
 * Characteristics:
 * - 16-byte cryptographically secure random salt
 * - 12-byte cryptographically secure random IV
 * - 100,000 iterations PBKDF2 key derivation with SHA-256
 * - AES-GCM 128-bit authentication tag verification
 * - Zero plaintext storage of passwords or raw keys
 */

import { BackupCryptoError } from './backupErrors';
import { BackupEncryptionInfo } from './backupTypes';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(uint8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new BackupCryptoError('Invalid hex string length for cryptographic parameter.');
  }
  const array = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    array[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return array;
}

export class BackupCryptoService {
  /**
   * Derive a 256-bit AES-GCM key from password and salt using PBKDF2-SHA-256
   */
  private static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    if (!password || password.trim().length === 0) {
      throw new BackupCryptoError('A non-empty password is required for backup encryption.');
    }

    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as any,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts plaintext string or byte buffer using AES-256-GCM.
   * Returns encrypted bytes + complete encryption metadata (salt, IV).
   */
  public static async encrypt(
    data: string | Uint8Array,
    password: string
  ): Promise<{ ciphertext: Uint8Array; encryptionInfo: BackupEncryptionInfo }> {
    try {
      const salt = new Uint8Array(SALT_BYTE_LENGTH);
      crypto.getRandomValues(salt);

      const iv = new Uint8Array(IV_BYTE_LENGTH);
      crypto.getRandomValues(iv);

      const key = await this.deriveKey(password, salt);

      const plaintextBuffer =
        typeof data === 'string' ? new TextEncoder().encode(data) : data;

      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv as any,
        },
        key,
        plaintextBuffer as any
      );

      const encryptionInfo: BackupEncryptionInfo = {
        enabled: true,
        algorithm: 'AES-256-GCM',
        kdf: 'PBKDF2',
        kdfHash: 'SHA-256',
        iterations: PBKDF2_ITERATIONS,
        saltHex: bufferToHex(salt),
        ivHex: bufferToHex(iv),
      };

      return {
        ciphertext: new Uint8Array(encryptedBuffer),
        encryptionInfo,
      };
    } catch (err: any) {
      throw new BackupCryptoError(`Encryption failed: ${err.message || String(err)}`);
    }
  }

  /**
   * Decrypts AES-256-GCM ciphertext using password and metadata.
   * Throws BackupCryptoError on invalid password, tampered data, or corrupted IV/salt.
   */
  public static async decrypt(
    ciphertext: Uint8Array,
    password: string,
    encryptionInfo: BackupEncryptionInfo
  ): Promise<Uint8Array> {
    try {
      if (!encryptionInfo.enabled) {
        return ciphertext;
      }

      if (encryptionInfo.algorithm !== 'AES-256-GCM') {
        throw new BackupCryptoError(`Unsupported encryption algorithm: ${encryptionInfo.algorithm}`);
      }

      const salt = hexToUint8Array(encryptionInfo.saltHex);
      const iv = hexToUint8Array(encryptionInfo.ivHex);

      const key = await this.deriveKey(password, salt);

      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv as any,
        },
        key,
        ciphertext as any
      );

      return new Uint8Array(decryptedBuffer);
    } catch (err: any) {
      if (err.name === 'OperationError' || String(err.message).includes('operation')) {
        throw new BackupCryptoError(
          'Incorrect backup password or corrupted archive payload. Decryption failed.'
        );
      }
      throw new BackupCryptoError(`Decryption failed: ${err.message || String(err)}`);
    }
  }
}

