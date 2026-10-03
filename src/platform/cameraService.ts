import { CameraOptions, CapturedImage } from './types';
import { getPlatformInfo } from './platformDetection';

export interface CameraService {
  capturePhoto(options?: CameraOptions): Promise<CapturedImage | null>;
  pickPhoto(options?: CameraOptions): Promise<CapturedImage | null>;
}

class UniversalCameraService implements CameraService {
  public async capturePhoto(options?: CameraOptions): Promise<CapturedImage | null> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    // 1. Mobile Native via Capacitor Camera Plugin
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Camera) {
      try {
        const photo = await win.Capacitor.Plugins.Camera.getPhoto({
          quality: options?.quality ?? 90,
          allowEditing: options?.allowEditing ?? false,
          resultType: 'dataUrl',
          source: 'CAMERA',
        });

        return {
          dataUrl: photo.dataUrl,
          format: photo.format,
        };
      } catch (err: any) {
        if (err?.message?.includes('User cancelled') || err?.message?.includes('cancelled')) {
          return null;
        }
        console.warn('[CameraService] Native capture failed, falling back to file input:', err);
      }
    }

    // 2. Web & Desktop fallback using HTML5 capture input
    return this.captureViaFileInput(true);
  }

  public async pickPhoto(options?: CameraOptions): Promise<CapturedImage | null> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    // 1. Mobile Native via Capacitor Camera Plugin
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Camera) {
      try {
        const photo = await win.Capacitor.Plugins.Camera.getPhoto({
          quality: options?.quality ?? 90,
          allowEditing: options?.allowEditing ?? false,
          resultType: 'dataUrl',
          source: 'PHOTOS',
        });

        return {
          dataUrl: photo.dataUrl,
          format: photo.format,
        };
      } catch (err: any) {
        if (err?.message?.includes('User cancelled') || err?.message?.includes('cancelled')) {
          return null;
        }
        console.warn('[CameraService] Native photo picker failed, falling back to file input:', err);
      }
    }

    // 2. Web & Desktop fallback
    return this.captureViaFileInput(false);
  }

  private captureViaFileInput(isCamera: boolean): Promise<CapturedImage | null> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (isCamera) {
        input.setAttribute('capture', 'environment');
      }
      input.style.display = 'none';

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          cleanup();
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            dataUrl: reader.result as string,
            blob: file,
            format: file.type.split('/')[1] || 'jpeg',
          });
          cleanup();
        };
        reader.onerror = () => {
          resolve(null);
          cleanup();
        };
        reader.readAsDataURL(file);
      };

      input.oncancel = () => {
        resolve(null);
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

export const cameraService: CameraService = new UniversalCameraService();
