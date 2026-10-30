/**
 * VISTAAR Business OS — Web File System Access API Adapter
 * Connects directly to local OneDrive folder in supported Chromium browsers (Edge, Chrome)
 * with IndexedDB handle persistence and permission revalidation.
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

const IDB_NAME = 'vistaar_backup_store';
const IDB_STORE = 'handles';
const IDB_KEY = 'onedrive_folder_handle';

/**
 * Native IndexedDB helper to persist and retrieve FileSystemDirectoryHandle
 */
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandleToIdb(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    console.warn('[WebFolderAdapter] Failed to store directory handle in IndexedDB:', err);
  }
}

async function getHandleFromIdb(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function removeHandleFromIdb(): Promise<void> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch {}
}

export class WebFolderAdapter implements BackupDestinationAdapter {
  private dirHandle: FileSystemDirectoryHandle | null = null;
  private cachedFolderName: string = '';

  constructor() {
    this.hydrateHandle();
  }

  private async hydrateHandle(): Promise<void> {
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return;
    const stored = await getHandleFromIdb();
    if (stored) {
      this.dirHandle = stored;
      this.cachedFolderName = stored.name;
    }
  }

  public async getCapabilities(): Promise<BackupCapabilities> {
    const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
    return {
      platform: 'web',
      hasDirectoryPicker: supported,
      hasNativeFs: false,
      supportsDirectFolder: supported,
      canOpenFolderInExplorer: false,
    };
  }

  public getDestinationLabel(): string {
    return this.dirHandle?.name || this.cachedFolderName || 'No OneDrive folder connected';
  }

  public async disconnect(): Promise<void> {
    this.dirHandle = null;
    this.cachedFolderName = '';
    await removeHandleFromIdb();
  }

  /**
   * Prompts user with browser's native File System Access directory picker
   */
  public async selectFolder(): Promise<BackupDestinationResult> {
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      return {
        success: false,
        error:
          'Your web browser does not support the File System Access API. Please use a Chromium browser (Google Chrome or Microsoft Edge) or use the Download Backup fallback.',
      };
    }

    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });

      this.dirHandle = handle;
      this.cachedFolderName = handle.name;
      await saveHandleToIdb(handle);

      // Verify access immediately
      const verify = await this.verifyAccess();
      if (!verify.success) {
        return {
          success: false,
          folderName: handle.name,
          error: verify.error,
        };
      }

      return {
        success: true,
        folderName: handle.name,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: false, error: 'Folder selection was cancelled.' };
      }
      return { success: false, error: `Failed to connect folder: ${err.message || String(err)}` };
    }
  }

  /**
   * Checks or requests readwrite permissions on the saved handle
   */
  public async verifyAccess(): Promise<BackupDestinationResult> {
    if (!this.dirHandle) {
      await this.hydrateHandle();
    }
    if (!this.dirHandle) {
      return {
        success: false,
        error: 'No OneDrive folder is connected. Please click "Connect OneDrive Folder" first.',
      };
    }

    try {
      // 1. Check existing permission status
      const handleAny = this.dirHandle as any;
      let permission = await handleAny.queryPermission({ mode: 'readwrite' });

      // 2. Request permission if needed
      if (permission !== 'granted') {
        permission = await handleAny.requestPermission({ mode: 'readwrite' });
      }

      if (permission !== 'granted') {
        return {
          success: false,
          folderName: this.dirHandle.name,
          error: 'Read and write permission to the OneDrive folder was denied by the browser.',
        };
      }

      // 3. Test write by creating and deleting a temporary test file
      const testName = `.vistaar_test_${Date.now()}.tmp`;
      const testFileHandle = await this.dirHandle.getFileHandle(testName, { create: true });
      const writable = await (testFileHandle as any).createWritable();
      await writable.write('VISTAAR_TEST_WRITE');
      await writable.close();
      await this.dirHandle.removeEntry(testName);

      return {
        success: true,
        folderName: this.dirHandle.name,
      };
    } catch (err: any) {
      return {
        success: false,
        folderName: this.dirHandle.name,
        error: `Folder permission expired or inaccessible: ${err.message || String(err)}`,
      };
    }
  }

  /**
   * Writes backup archive directly into the connected folder
   */
  public async writeBackup(
    fileName: string,
    data: string | Uint8Array
  ): Promise<BackupWriteResult> {
    const access = await this.verifyAccess();
    if (!access.success || !this.dirHandle) {
      throw new BackupPermissionError(access.error || 'OneDrive folder is not accessible.');
    }

    try {
      const fileHandle = await this.dirHandle.getFileHandle(fileName, { create: true });
      const writable = await (fileHandle as any).createWritable();

      const blobData =
        typeof data === 'string'
          ? new Blob([data], { type: 'application/json' })
          : new Blob([data as any], { type: 'application/octet-stream' });

      await writable.write(blobData);
      await writable.close();

      const file = await fileHandle.getFile();
      if (file.size === 0) {
        throw new BackupError('Saved backup file is empty (0 bytes).');
      }

      // Read back file to verify readability and integrity
      const readBackText = await file.text();
      const readChecksum = await BackupIntegrityService.calculateSha256(readBackText);
      const computedChecksum = await BackupIntegrityService.calculateSha256(data);
      if (!BackupIntegrityService.verifyChecksum(computedChecksum, readChecksum)) {
        throw new BackupError('Read-back verification checksum mismatch on written backup file.');
      }

      return {
        success: true,
        fileName,
        fileSizeBytes: file.size,
        checksum: computedChecksum,
      };
    } catch (err: any) {
      return {
        success: false,
        fileName,
        fileSizeBytes: 0,
        checksum: '',
        error: `Failed to write backup to connected folder: ${err.message || String(err)}`,
      };
    }
  }

  /**
   * Reads a backup file by filename from the connected folder
   */
  public async readBackup(fileName: string): Promise<BackupReadResult> {
    const access = await this.verifyAccess();
    if (!access.success || !this.dirHandle) {
      return { success: false, error: access.error };
    }

    try {
      const fileHandle = await this.dirHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const buffer = await file.arrayBuffer();
      return {
        success: true,
        data: new Uint8Array(buffer),
      };
    } catch (err: any) {
      return { success: false, error: `Failed to read backup file: ${err.message || String(err)}` };
    }
  }

  /**
   * Lists all `.vistaarbackup` files in the folder with manifest preview
   */
  public async listBackups(): Promise<BackupFileInfo[]> {
    const access = await this.verifyAccess();
    if (!access.success || !this.dirHandle) return [];

    try {
      const files: BackupFileInfo[] = [];
      const dirAny = this.dirHandle as any;

      for await (const [name, handle] of dirAny.entries()) {
        if (handle.kind === 'file' && name.endsWith('.vistaarbackup')) {
          try {
            const file = await (handle as FileSystemFileHandle).getFile();
            let manifest: any = undefined;

            try {
              const text = await file.text();
              manifest = BackupSerializer.inspectManifest(text);
            } catch {}

            files.push({
              fileName: name,
              fileSizeBytes: file.size,
              createdAt: manifest?.createdAt || new Date(file.lastModified).toISOString(),
              status: manifest ? 'valid' : 'unverified',
              manifest,
            });
          } catch {}
        }
      }

      return files.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch (err) {
      console.warn('[WebFolderAdapter] Failed to list backups:', err);
      return [];
    }
  }

  /**
   * Deletes a backup file from the connected folder
   */
  public async deleteBackup(fileName: string): Promise<BackupDeleteResult> {
    const access = await this.verifyAccess();
    if (!access.success || !this.dirHandle) {
      return { success: false, fileName, error: access.error };
    }

    try {
      await this.dirHandle.removeEntry(fileName);
      return { success: true, fileName };
    } catch (err: any) {
      return { success: false, fileName, error: `Failed to delete file: ${err.message || String(err)}` };
    }
  }
}

