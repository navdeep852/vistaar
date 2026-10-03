/**
 * VISTAAR Business OS — Professional Document Printing Engine
 * 
 * Provides isolated, clean A4 printing for Quotations & Invoices:
 * - Dynamic @page orientation rule (portrait vs landscape).
 * - System print dialog with physical printer selection, copies, and page range.
 * - Margins, logos, signatures, stamps, and financial values preserved at 100% mm dimensions.
 * - Graceful error handling and DOM cleanup.
 */

import { DocumentRendererProps } from '../../components/DocumentRenderer';
import { printDocument as basePrintDocument } from '../printService';
import { NormalizedDocumentData, documentDataToRendererProps } from './documentData';
import { showToast } from '../../components/Toast';

export function printDocument(props: DocumentRendererProps): void {
  try {
    basePrintDocument(props);
  } catch (err: any) {
    console.error('[DocumentPrintService] Printing exception:', err);
    showToast('Printing could not be started. Please check your printer and try again.', 'error');
  }
}

export function printNormalizedDocument(data: NormalizedDocumentData): void {
  const props = documentDataToRendererProps(data, true);
  printDocument(props);
}
