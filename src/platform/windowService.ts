import { getPlatformInfo } from './platformDetection';

export interface WindowService {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  setTitle(title: string): Promise<void>;
}

class UniversalWindowService implements WindowService {
  public async minimize(): Promise<void> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().minimize();
      } catch (err) {
        console.warn('[WindowService] Tauri minimize failed:', err);
      }
    }
  }

  public async toggleMaximize(): Promise<void> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().toggleMaximize();
      } catch (err) {
        console.warn('[WindowService] Tauri toggleMaximize failed:', err);
      }
    }
  }

  public async close(): Promise<void> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      } catch (err) {
        console.warn('[WindowService] Tauri close failed:', err);
      }
    }
  }

  public async isMaximized(): Promise<boolean> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        return await getCurrentWindow().isMaximized();
      } catch (err) {
        console.warn('[WindowService] Tauri isMaximized failed:', err);
      }
    }
    return false;
  }

  public async setTitle(title: string): Promise<void> {
    if (typeof document !== 'undefined') {
      document.title = title;
    }
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().setTitle(title);
      } catch (err) {
        console.warn('[WindowService] Tauri setTitle failed:', err);
      }
    }
  }
}

export const windowService: WindowService = new UniversalWindowService();
