import { getPlatformInfo } from './platformDetection';

export interface QrScannerService {
  startScan(prompt?: string): Promise<string | null>;
  stopScan(): Promise<void>;
  isSupported(): boolean;
}

class UniversalQrScannerService implements QrScannerService {
  public isSupported(): boolean {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.BarcodeScanner) {
      return true;
    }
    // Web BarcodeDetector API (Chrome / Android Web)
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      return true;
    }
    return false;
  }

  public async startScan(prompt?: string): Promise<string | null> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    // 1. Mobile Native via Capacitor BarcodeScanner Plugin
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.BarcodeScanner) {
      try {
        const scanner = win.Capacitor.Plugins.BarcodeScanner;
        await scanner.checkPermission({ force: true });
        await scanner.hideBackground();
        const result = await scanner.startScan();
        if (result.hasContent) {
          return result.content;
        }
      } catch (err) {
        console.warn('[QrScannerService] Native barcode scan failed:', err);
      } finally {
        try {
          await win.Capacitor.Plugins.BarcodeScanner.showBackground();
          await win.Capacitor.Plugins.BarcodeScanner.stopScan();
        } catch (e) {}
      }
    }

    console.info('[QrScannerService] Scanner interface ready for hardware scanning integration.', prompt);
    return null;
  }

  public async stopScan(): Promise<void> {
    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (win?.Capacitor?.Plugins?.BarcodeScanner) {
      try {
        await win.Capacitor.Plugins.BarcodeScanner.showBackground();
        await win.Capacitor.Plugins.BarcodeScanner.stopScan();
      } catch (e) {}
    }
  }
}

export const qrScannerService: QrScannerService = new UniversalQrScannerService();
