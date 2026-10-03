import { PlatformInfo, PlatformType } from './types';

/**
 * Universal runtime platform detection.
 * Safe to execute in standard browser, Capacitor WebViews, Electron, and Tauri.
 * Does not depend on direct static imports of native packages.
 */
export function getPlatformInfo(): PlatformInfo {
  if (typeof window === 'undefined') {
    return {
      platform: 'web',
      isWeb: true,
      isAndroid: false,
      isIOS: false,
      isDesktop: false,
      isNativeMobile: false,
      hasTouch: false,
    };
  }

  const win = window as any;
  const userAgent = navigator.userAgent || '';

  // 1. Desktop runtime check (Electron, Tauri, or desktop wrapper)
  const isTauri = Boolean(win.__TAURI__ || win.__TAURI_INTERNALS__);
  const isElectron = Boolean(win.process?.versions?.electron || /electron/i.test(userAgent));
  if (isTauri || isElectron) {
    return {
      platform: 'desktop',
      isWeb: false,
      isAndroid: false,
      isIOS: false,
      isDesktop: true,
      isNativeMobile: false,
      hasTouch: 'ontouchstart' in win || navigator.maxTouchPoints > 0,
    };
  }

  // 2. Capacitor native check
  const cap = win.Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    const capPlatform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : '';
    if (capPlatform === 'android' || /android/i.test(userAgent)) {
      return {
        platform: 'android',
        isWeb: false,
        isAndroid: true,
        isIOS: false,
        isDesktop: false,
        isNativeMobile: true,
        hasTouch: true,
      };
    }
    if (capPlatform === 'ios' || /iphone|ipad|ipod/i.test(userAgent)) {
      return {
        platform: 'ios',
        isWeb: false,
        isAndroid: false,
        isIOS: true,
        isDesktop: false,
        isNativeMobile: true,
        hasTouch: true,
      };
    }
  }

  // 3. Web target (default browser environment)
  const hasTouch = 'ontouchstart' in win || navigator.maxTouchPoints > 0;
  return {
    platform: 'web',
    isWeb: true,
    isAndroid: false,
    isIOS: false,
    isDesktop: false,
    isNativeMobile: false,
    hasTouch,
  };
}

export const currentPlatform = getPlatformInfo();

export const isWeb = currentPlatform.isWeb;
export const isAndroid = currentPlatform.isAndroid;
export const isIOS = currentPlatform.isIOS;
export const isDesktop = currentPlatform.isDesktop;
export const isNativeMobile = currentPlatform.isNativeMobile;
