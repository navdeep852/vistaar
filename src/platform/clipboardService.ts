import { getPlatformInfo } from './platformDetection';

export interface ClipboardService {
  writeText(text: string): Promise<boolean>;
  readText(): Promise<string>;
}

class UniversalClipboardService implements ClipboardService {
  public async writeText(text: string): Promise<boolean> {
    const platform = getPlatformInfo();

    // 1. Mobile Native via Capacitor Plugins if present
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Clipboard) {
      try {
        await win.Capacitor.Plugins.Clipboard.write({ string: text });
        return true;
      } catch (err) {
        console.warn('[ClipboardService] Native clipboard write failed, falling back to browser API:', err);
      }
    }

    // 2. Standard Web Clipboard API (Secure Context)
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('[ClipboardService] navigator.clipboard.writeText failed, using execCommand fallback:', err);
      }
    }

    // 3. Document execCommand fallback (Insecure contexts or legacy browsers)
    if (typeof document !== 'undefined') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        textarea.setAttribute('readonly', '');
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
      } catch (err) {
        console.error('[ClipboardService] execCommand copy failed:', err);
        return false;
      }
    }

    return false;
  }

  public async readText(): Promise<string> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Clipboard) {
      try {
        const result = await win.Capacitor.Plugins.Clipboard.read();
        return result.value || '';
      } catch (err) {
        console.warn('[ClipboardService] Native clipboard read failed:', err);
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        return await navigator.clipboard.readText();
      } catch (err) {
        console.warn('[ClipboardService] navigator.clipboard.readText failed:', err);
      }
    }

    return '';
  }
}

export const clipboardService: ClipboardService = new UniversalClipboardService();
