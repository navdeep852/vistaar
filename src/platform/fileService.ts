import { FileSaveOptions, FilePickOptions } from './types';
import { getPlatformInfo } from './platformDetection';
import { showToast } from '../components/Toast';

export interface FileService {
  saveFile(options: FileSaveOptions): Promise<{ success: boolean; uri?: string; error?: string }>;
  openFile(filePathOrUrl: string): Promise<boolean>;
  pickFile(options?: FilePickOptions): Promise<File | null>;
  pickFiles(options?: FilePickOptions): Promise<File[]>;
  saveJsPdf(doc: any, defaultFileName: string, title?: string): Promise<{ success: boolean; uri?: string }>;
  saveWorkbook(XLSX: any, workbook: any, defaultFileName: string, title?: string): Promise<{ success: boolean; uri?: string }>;
}

class UniversalFileService implements FileService {
  public async saveFile(options: FileSaveOptions): Promise<{ success: boolean; uri?: string; error?: string }> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;
    const { fileName, data, mimeType = 'application/octet-stream' } = options;

    // 1. Desktop Native via Tauri 2 save dialog & filesystem
    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const { writeFile } = await import('@tauri-apps/plugin-fs');

        const ext = fileName.split('.').pop() || '';
        const selectedPath = await save({
          defaultPath: fileName,
          filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
        });

        // If user cancelled the save dialog, return cleanly without throwing error
        if (!selectedPath) {
          return { success: false, error: 'User cancelled save dialog.' };
        }

        let bytes: Uint8Array;
        if (data instanceof Uint8Array) {
          bytes = data;
        } else if (data instanceof ArrayBuffer) {
          bytes = new Uint8Array(data);
        } else if (data instanceof Blob) {
          const arrayBuffer = await data.arrayBuffer();
          bytes = new Uint8Array(arrayBuffer);
        } else if (typeof data === 'string') {
          if (data.startsWith('data:')) {
            const base64 = data.split(',')[1];
            const binary = atob(base64);
            bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
          } else {
            const encoder = new TextEncoder();
            bytes = encoder.encode(data);
          }
        } else {
          bytes = new Uint8Array();
        }

        await writeFile(selectedPath, bytes);
        return { success: true, uri: selectedPath };
      } catch (err: any) {
        console.warn('[FileService] Tauri native save dialog failed, falling back to browser download:', err);
      }
    }

    // 1. Mobile Native via Capacitor Filesystem & Share
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Filesystem) {
      try {
        const fs = win.Capacitor.Plugins.Filesystem;
        let base64Data = '';

        if (typeof data === 'string') {
          if (data.startsWith('data:')) {
            base64Data = data.split(',')[1];
          } else {
            base64Data = btoa(unescape(encodeURIComponent(data)));
          }
        } else if (data instanceof Blob) {
          base64Data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(data);
          });
        } else if (data instanceof ArrayBuffer) {
          const uint8 = new Uint8Array(data);
          let binary = '';
          for (let i = 0; i < uint8.byteLength; i++) {
            binary += String.fromCharCode(uint8[i]);
          }
          base64Data = btoa(binary);
        } else if (data instanceof Uint8Array) {
          let binary = '';
          const len = data.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(data[i]);
          }
          base64Data = btoa(binary);
        }

        // Write to Cache / Documents directory
        const writeResult = await fs.writeFile({
          path: fileName,
          data: base64Data,
          directory: 'CACHE', // 'CACHE' or 'DOCUMENTS'
          recursive: true,
        });

        // Trigger native share sheet so user can save or send the file
        if (win?.Capacitor?.Plugins?.Share) {
          await win.Capacitor.Plugins.Share.share({
            title: fileName,
            url: writeResult.uri,
            dialogTitle: `Save or Share ${fileName}`,
          });
        }

        return { success: true, uri: writeResult.uri };
      } catch (err: any) {
        console.warn('[FileService] Native file save failed, falling back to browser download:', err);
      }
    }

    // 2. Web & Desktop browser fallback (Blob download)
    try {
      if (typeof window === 'undefined') {
        return { success: false, error: 'Window environment not available.' };
      }

      let blob: Blob;
      if (data instanceof Blob) {
        blob = data;
      } else if (typeof data === 'string') {
        blob = new Blob([data], { type: mimeType });
      } else {
        blob = new Blob([data as any], { type: mimeType });
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        try {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        } catch (e) {}
      }, 500);

      return { success: true, uri: url };
    } catch (err: any) {
      console.error('[FileService] Web file download failed:', err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  public async openFile(filePathOrUrl: string): Promise<boolean> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { openPath, openUrl } = await import('@tauri-apps/plugin-opener');
        if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
          await openUrl(filePathOrUrl);
        } else {
          await openPath(filePathOrUrl);
        }
        return true;
      } catch (err) {
        console.warn('[FileService] Tauri openPath failed, falling back:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.open(filePathOrUrl, '_blank', 'noopener,noreferrer');
      return true;
    }

    return false;
  }

  public async pickFile(options?: FilePickOptions): Promise<File | null> {
    const files = await this.pickFiles({ ...options, multiple: false });
    return files.length > 0 ? files[0] : null;
  }

  public async pickFiles(options?: FilePickOptions): Promise<File[]> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    // 1. Desktop Native via Tauri 2 Dialog & Filesystem
    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readFile } = await import('@tauri-apps/plugin-fs');

        let filters: { name: string; extensions: string[] }[] | undefined = undefined;
        if (options?.accept) {
          const tokens = options.accept.split(',').map((t) => t.trim().toLowerCase());
          const exts: string[] = [];
          for (const token of tokens) {
            if (token.startsWith('.')) {
              exts.push(token.slice(1));
            } else if (token === 'image/*') {
              exts.push('png', 'jpg', 'jpeg', 'webp', 'gif');
            } else if (token === 'application/pdf') {
              exts.push('pdf');
            }
          }
          if (exts.length > 0) {
            filters = [{ name: 'Allowed Files', extensions: exts }];
          }
        }

        const selected = await open({
          multiple: options?.multiple ?? false,
          directory: false,
          filters,
        });

        // Cancelled by user
        if (!selected) {
          return [];
        }

        const filePaths = Array.isArray(selected) ? selected : [selected];
        const files: File[] = [];

        for (const filePath of filePaths) {
          const bytes = await readFile(filePath);
          const normalizedPath = filePath.replace(/\\/g, '/');
          const fileName = normalizedPath.split('/').pop() || 'file';
          const ext = fileName.split('.').pop()?.toLowerCase() || '';

          let mimeType = 'application/octet-stream';
          if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
          else if (ext === 'png') mimeType = 'image/png';
          else if (ext === 'webp') mimeType = 'image/webp';
          else if (ext === 'pdf') mimeType = 'application/pdf';
          else if (ext === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          else if (ext === 'csv') mimeType = 'text/csv';

          const file = new File([bytes], fileName, { type: mimeType });
          files.push(file);
        }

        return files;
      } catch (err) {
        console.warn('[FileService] Tauri file picker failed, falling back to HTML input:', err);
      }
    }

    // 2. Browser & Mobile HTML5 File Input fallback
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve([]);
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      if (options?.accept) input.accept = options.accept;
      if (options?.multiple) input.multiple = true;

      input.onchange = () => {
        const fileList = input.files;
        if (!fileList || fileList.length === 0) {
          resolve([]);
        } else {
          resolve(Array.from(fileList));
        }
        cleanup();
      };

      input.oncancel = () => {
        resolve([]);
        cleanup();
      };

      const cleanup = () => {
        try {
          document.body.removeChild(input);
        } catch (e) {}
      };

      document.body.appendChild(input);
      input.click();
    });
  }

  public async saveJsPdf(doc: any, defaultFileName: string, title = 'Document'): Promise<{ success: boolean; uri?: string }> {
    const platform = getPlatformInfo();
    if (platform.isDesktop) {
      try {
        const pdfBytes = doc.output('arraybuffer');
        const res = await this.saveFile({
          fileName: defaultFileName,
          data: pdfBytes,
          mimeType: 'application/pdf',
        });
        if (res.success && res.uri) {
          const shortName = res.uri.replace(/\\/g, '/').split('/').pop() || defaultFileName;
          showToast(`${title} saved`, 'success', `Saved as ${shortName}`, {
            label: 'Open File',
            onClick: () => this.openFile(res.uri!),
          }, 7000);
        }
        return res;
      } catch (err: any) {
        console.warn('[FileService] Desktop PDF save failed, using fallback:', err);
      }
    }
    doc.save(defaultFileName);
    return { success: true };
  }

  public async saveWorkbook(XLSX: any, workbook: any, defaultFileName: string, title = 'Spreadsheet'): Promise<{ success: boolean; uri?: string }> {
    const platform = getPlatformInfo();
    if (platform.isDesktop) {
      try {
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const res = await this.saveFile({
          fileName: defaultFileName,
          data: wbout,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        if (res.success && res.uri) {
          const shortName = res.uri.replace(/\\/g, '/').split('/').pop() || defaultFileName;
          showToast(`${title} saved`, 'success', `Saved as ${shortName}`, {
            label: 'Open File',
            onClick: () => this.openFile(res.uri!),
          }, 7000);
        }
        return res;
      } catch (err: any) {
        console.warn('[FileService] Desktop Workbook save failed, using fallback:', err);
      }
    }
    XLSX.writeFile(workbook, defaultFileName);
    return { success: true };
  }
}

export const fileService: FileService = new UniversalFileService();
