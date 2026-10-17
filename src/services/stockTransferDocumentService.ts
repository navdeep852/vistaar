import React from 'react';
import { createRoot } from 'react-dom/client';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { StockTransfer, Branch } from '../types';
import { fileService, getPlatformInfo } from '../platform';
import { showToast } from '../components/Toast';
import { StockTransferPrintDocument } from '../components/stock/StockTransferPrintDocument';

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
}

export function buildStockTransferFilename(transferNumber: string): string {
  const cleanNum = sanitizeFilename(transferNumber || 'DRAFT');
  return `VISTAAR-StockTransfer-${cleanNum}.pdf`;
}

/**
 * Generates an authoritative sequential Stock Transfer Note document number
 * Format: STN-YYYY-0001, STN-YYYY-0002, etc.
 */
export function generateStockTransferNumber(existingTransfers: StockTransfer[] = []): string {
  const year = new Date().getFullYear();
  const prefix = `STN-${year}-`;

  let maxSeq = 0;
  for (const t of existingTransfers) {
    if (t.transferNumber && t.transferNumber.startsWith(prefix)) {
      const numPart = parseInt(t.transferNumber.substring(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    } else if (t.transferNumber && t.transferNumber.startsWith(`TRF-${year}-`)) {
      // Backwards compatibility with older TRF format
      const numPart = parseInt(t.transferNumber.substring(`TRF-${year}-`.length), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  }

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

export interface GeneratedStockTransferPdfResult {
  doc: jsPDF;
  filename: string;
  blob: Blob;
  dataUri: string;
}

export interface StockTransferDocumentOptions {
  transfer: StockTransfer;
  sourceBranch?: Branch | null;
  destBranch?: Branch | null;
  settings?: any;
}

/**
 * Compiles a pixel-perfect, high-resolution A4 Stock Transfer Note PDF.
 */
export async function generateStockTransferPdf(
  options: StockTransferDocumentOptions
): Promise<GeneratedStockTransferPdfResult> {
  const { transfer, sourceBranch, destBranch, settings } = options;

  if (!transfer || !transfer.transferNumber) {
    throw new Error('Invalid transfer data: missing transfer number.');
  }

  const targetWidthPx = 794; // Standard 96-DPI CSS width for A4
  const pageWidthMm = 210;
  const pageHeightMm = 297;

  // 1. Clean up lingering offscreen root
  const existingRoot = document.getElementById('stock-transfer-pdf-offscreen-root');
  if (existingRoot) {
    existingRoot.remove();
  }

  // 2. Create offscreen container
  const container = document.createElement('div');
  container.id = 'stock-transfer-pdf-offscreen-root';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = `${targetWidthPx}px`;
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#0f172a';
  container.style.zIndex = '-9999';
  container.style.opacity = '0.01';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  const root = createRoot(container);

  try {
    // 3. Mount StockTransferPrintDocument
    root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          'div',
          { style: { width: `${targetWidthPx}px`, background: '#ffffff' } },
          React.createElement(StockTransferPrintDocument, {
            transfer,
            sourceBranch,
            destBranch,
            settings,
            isPrintMode: true,
          })
        )
      )
    );

    // 4. Wait for fonts & images to settle
    if (typeof document !== 'undefined' && (document as any).fonts && (document as any).fonts.ready) {
      try {
        await (document as any).fonts.ready;
      } catch {}
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
    const images = Array.from(container.querySelectorAll('img'));
    if (images.length > 0) {
      await Promise.all(
        images.map(
          (img) =>
            new Promise<void>((res) => {
              if (img.complete) {
                res();
              } else {
                img.onload = () => res();
                img.onerror = () => res();
              }
            })
        )
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 150));

    // 5. High-resolution canvas capture
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: targetWidthPx,
      onclone: (clonedDoc) => {
        const el = clonedDoc.getElementById('stock-transfer-pdf-offscreen-root');
        if (el) {
          el.style.position = 'static';
          el.style.left = '0';
          el.style.top = '0';
          el.style.opacity = '1';
          el.style.visibility = 'visible';
        }
      },
    });

    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      throw new Error(`HTML2Canvas produced an empty canvas (${canvas?.width || 0}x${canvas?.height || 0}).`);
    }

    // 6. jsPDF instance
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const scaledWidth = canvas.width;
    const scaledHeight = canvas.height;
    const pxPerPage = (pageHeightMm / pageWidthMm) * scaledWidth;
    const totalPages = Math.max(1, Math.ceil(scaledHeight / pxPerPage));

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) {
        doc.addPage('a4', 'portrait');
      }

      const sourceY = page * pxPerPage;
      const sourceHeight = Math.min(pxPerPage, scaledHeight - sourceY);

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = scaledWidth;
      pageCanvas.height = pxPerPage;
      const ctx = pageCanvas.getContext('2d');

      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

        ctx.drawImage(
          canvas,
          0,
          sourceY,
          scaledWidth,
          sourceHeight,
          0,
          0,
          scaledWidth,
          sourceHeight
        );

        const pageDataUrl = pageCanvas.toDataURL('image/jpeg', 0.95);
        doc.addImage(pageDataUrl, 'JPEG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');
      }
    }

    const filename = buildStockTransferFilename(transfer.transferNumber);
    const arrayBuffer = doc.output('arraybuffer');

    if (!arrayBuffer || arrayBuffer.byteLength < 100) {
      throw new Error('Generated PDF byte buffer is empty or corrupted.');
    }

    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const dataUri = doc.output('datauristring');

    return {
      doc,
      filename,
      blob,
      dataUri,
    };
  } finally {
    setTimeout(() => {
      try {
        root.unmount();
        container.remove();
      } catch (e) {}
    }, 100);
  }
}

/**
 * Generates and downloads the Stock Transfer Note PDF to the user's filesystem.
 */
export async function saveStockTransferPdf(
  options: StockTransferDocumentOptions
): Promise<{ success: boolean; uri?: string; filename: string; blob?: Blob; error?: string }> {
  const fallbackFilename = buildStockTransferFilename(options.transfer?.transferNumber || 'DRAFT');

  try {
    const { doc, filename, blob } = await generateStockTransferPdf(options);
    const res = await fileService.saveJsPdf(
      doc,
      filename,
      `Stock Transfer Note #${options.transfer.transferNumber}`
    );

    if (res.success) {
      const platform = getPlatformInfo();
      if (!platform.isDesktop) {
        showToast('Stock Transfer Note downloaded successfully!', 'success');
      }
      return {
        success: true,
        uri: res.uri,
        filename,
        blob,
      };
    } else {
      showToast('Unable to save PDF file. Please try again.', 'error');
      return { success: false, filename: fallbackFilename, error: 'File save cancelled or failed.' };
    }
  } catch (err: any) {
    console.error('[stockTransferDocumentService] PDF generation failed:', err);
    showToast('Failed to generate Stock Transfer PDF.', 'error');
    return { success: false, filename: fallbackFilename, error: err?.message || 'PDF generation error' };
  }
}

/**
 * Triggers isolated A4 portrait printing for Stock Transfer Note.
 */
export function printStockTransferNote(options: StockTransferDocumentOptions): void {
  const { transfer, sourceBranch, destBranch, settings } = options;

  // 1. Remove existing print containers
  const existingRoot = document.getElementById('printable-document-root');
  if (existingRoot) existingRoot.remove();
  const existingStyle = document.getElementById('printable-document-style');
  if (existingStyle) existingStyle.remove();

  // 2. Inject print CSS
  const styleEl = document.createElement('style');
  styleEl.id = 'printable-document-style';
  styleEl.innerHTML = `
    @media print {
      @page {
        size: A4 portrait;
        margin: 8mm;
      }
      body > *:not(#printable-document-root) {
        display: none !important;
      }
      #printable-document-root {
        display: block !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #000000 !important;
        box-shadow: none !important;
      }
    }
  `;
  document.head.appendChild(styleEl);

  // 3. Mount in printContainer
  const printContainer = document.createElement('div');
  printContainer.id = 'printable-document-root';
  document.body.appendChild(printContainer);

  const root = createRoot(printContainer);
  root.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(StockTransferPrintDocument, {
        transfer,
        sourceBranch,
        destBranch,
        settings,
        isPrintMode: true,
      })
    )
  );

  // 4. Trigger print
  setTimeout(() => {
    window.print();
    setTimeout(() => {
      try {
        root.unmount();
        printContainer.remove();
        styleEl.remove();
      } catch (e) {}
    }, 1000);
  }, 300);
}
