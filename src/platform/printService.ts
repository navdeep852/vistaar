import { getPlatformInfo } from './platformDetection';
import { printDocument as webPrintDocument, printEwayBill as webPrintEwayBill } from '../services/printService';
import { DocumentRendererProps } from '../components/DocumentRenderer';

export interface PrintService {
  printDocument(props: DocumentRendererProps): Promise<void>;
  printEwayBill(ewayBill: any): Promise<void>;
}

class UniversalPrintService implements PrintService {
  public async printDocument(props: DocumentRendererProps): Promise<void> {
    const platform = getPlatformInfo();
    const win = typeof window !== 'undefined' ? (window as any) : null;

    // 1. Mobile Native via Capacitor Printer Plugin if installed
    if (platform.isNativeMobile && win?.Capacitor?.Plugins?.Printer) {
      try {
        // Future printer plugin bridge
        await win.Capacitor.Plugins.Printer.print({
          name: `${props.documentType || 'Document'}_${props.documentNumber || ''}`,
        });
        return;
      } catch (err) {
        console.warn('[PrintService] Native printer plugin failed, falling back to web print:', err);
      }
    }

    // 2. Web & Desktop execution
    webPrintDocument(props);
  }

  public async printEwayBill(ewayBill: any): Promise<void> {
    webPrintEwayBill(ewayBill);
  }
}

export const platformPrintService: PrintService = new UniversalPrintService();
