import { FileSaveOptions, FilePickOptions } from './types';
import { getPlatformInfo } from './platformDetection';

export interface FileService {
  saveFile(options: FileSaveOptions): Promise<{ success: boolean; uri?: string; error?: string }>;
  pickFile(options?: FilePickOptions): Promise<File | null>;
  pickFiles(options?: FilePickOptions): Promise<File[]>;
}

class UniversalFileService implements FileService {
  public async saveFile(options: FileSaveOptions): Promise<{ success: boolean; uri?: string; error?: string }> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;
    const { fileName, data, mimeType = 'application/octet-stream' } = options;

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
        blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: mimeType });
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

  public async pickFile(options?: FilePickOptions): Promise<File | null> {
    const files = await this.pickFiles({ ...options, multiple: false });
    return files.length > 0 ? files[0] : null;
  }

  public async pickFiles(options?: FilePickOptions): Promise<File[]> {
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
}

export const fileService: FileService = new UniversalFileService();
