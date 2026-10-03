import { ShareOptions } from './types';
import { getPlatformInfo } from './platformDetection';
import { clipboardService } from './clipboardService';
import { toWhatsAppNumber } from '../lib/phoneUtils';

export interface ShareService {
  share(options: ShareOptions): Promise<boolean>;
  shareToWhatsApp(phone: string, message: string): Promise<boolean>;
  openExternalUrl(url: string): Promise<boolean>;
  canShare(): boolean;
}

class UniversalShareService implements ShareService {
  public canShare(): boolean {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Share) {
      return true;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      return true;
    }
    return false;
  }

  public async share(options: ShareOptions): Promise<boolean> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    // 1. Mobile Native via Capacitor Share Plugin
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Share) {
      try {
        await win.Capacitor.Plugins.Share.share({
          title: options.title,
          text: options.text,
          url: options.url,
          dialogTitle: options.dialogTitle || 'Share via',
        });
        return true;
      } catch (err: any) {
        // User cancelling share is not a system failure
        if (err?.message?.includes('canceled') || err?.message?.includes('cancelled')) {
          return false;
        }
        console.warn('[ShareService] Native share failed, falling back to Web Share:', err);
      }
    }

    // 2. Web Share API
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        const shareData: any = {};
        if (options.title) shareData.title = options.title;
        if (options.text) shareData.text = options.text;
        if (options.url) shareData.url = options.url;
        if (options.files && options.files.length > 0 && navigator.canShare && navigator.canShare({ files: options.files })) {
          shareData.files = options.files;
        }

        await navigator.share(shareData);
        return true;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return false; // User cancelled
        }
        console.warn('[ShareService] Web Share API failed:', err);
      }
    }

    // 3. Fallback: Copy link / text to clipboard
    const textToCopy = [options.title, options.text, options.url].filter(Boolean).join('\n');
    if (textToCopy) {
      return await clipboardService.writeText(textToCopy);
    }

    return false;
  }

  public async openExternalUrl(url: string): Promise<boolean> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    // 1. Desktop Native via Tauri 2 Opener Plugin
    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
        return true;
      } catch (err) {
        console.warn('[ShareService] Tauri opener plugin failed, falling back:', err);
      }
    }

    // 2. Browser / WebView fallback
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    }

    return false;
  }

  public async shareToWhatsApp(phone: string, message: string): Promise<boolean> {
    const cleanPhone = toWhatsAppNumber(phone);
    const encodedText = encodeURIComponent(message);
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    const webWhatsAppUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;

    // 1. Desktop Native: open external WhatsApp Web URL via default system browser using @tauri-apps/plugin-opener
    if (platform.isDesktop && (win?.__TAURI__ || win?.__TAURI_INTERNALS__)) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(webWhatsAppUrl);
        return true;
      } catch (err) {
        console.warn('[ShareService] Tauri opener failed for WhatsApp, falling back:', err);
      }
    }

    // 2. Mobile Native devices: direct app scheme or Web intent
    if (platform.isNativeMobile) {
      const nativeScheme = cleanPhone
        ? `whatsapp://send?phone=${cleanPhone}&text=${encodedText}`
        : `whatsapp://send?text=${encodedText}`;

      try {
        // Try opening with window.open or location.href for custom scheme
        if (win && win.location) {
          win.location.href = nativeScheme;
          return true;
        }
      } catch (err) {
        console.warn('[ShareService] Direct WhatsApp scheme failed, falling back to wa.me link:', err);
      }
    }

    // 3. Standard web browser fallback
    if (typeof window !== 'undefined') {
      window.open(webWhatsAppUrl, '_blank', 'noopener,noreferrer');
      return true;
    }

    return false;
  }
}

export const shareService: ShareService = new UniversalShareService();
