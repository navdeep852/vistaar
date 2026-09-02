import React from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentRenderer, DocumentRendererProps } from '../components/DocumentRenderer';

/**
 * Triggers isolated A4 printing for Quotations & Invoices.
 * 
 * 1. Creates/clears a dedicated #printable-document-root on body.
 * 2. Injects dynamic @page CSS rule for orientation ('portrait' vs 'landscape').
 * 3. Mounts DocumentRenderer with target props into the isolated container.
 * 4. Invokes window.print() after rendering.
 * 5. Cleans up mount target and style rules after printing.
 */
export function printDocument(props: DocumentRendererProps) {
  const orientation = props.customization?.orientation || 'portrait';

  // 1. Remove any existing print mount root & style tag
  const existingRoot = document.getElementById('printable-document-root');
  if (existingRoot) {
    existingRoot.remove();
  }
  const existingStyle = document.getElementById('printable-document-style');
  if (existingStyle) {
    existingStyle.remove();
  }

  // 2. Inject dynamic @page style rule for orientation
  const styleEl = document.createElement('style');
  styleEl.id = 'printable-document-style';
  styleEl.innerHTML = `
    @media print {
      @page {
        size: A4 ${orientation};
        margin: 0;
      }
      body > *:not(#printable-document-root) {
        display: none !important;
      }
      #printable-document-root {
        display: block !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: ${orientation === 'landscape' ? '297mm' : '210mm'} !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        box-shadow: none !important;
      }
    }
  `;
  document.head.appendChild(styleEl);

  // 3. Create isolated container element
  const printContainer = document.createElement('div');
  printContainer.id = 'printable-document-root';
  document.body.appendChild(printContainer);

  // 4. Mount DocumentRenderer inside isolated container
  const root = createRoot(printContainer);

  // Pass printMode=true to DocumentRenderer so it renders at 100% mm dimensions without preview scaling/margins
  root.render(
    <React.StrictMode>
      <DocumentRenderer {...props} isPrintMode={true} />
    </React.StrictMode>
  );

  // 5. Allow DOM & images to settle before triggering print
  setTimeout(() => {
    window.print();

    // Clean up after print dialog closes
    setTimeout(() => {
      try {
        root.unmount();
        printContainer.remove();
        styleEl.remove();
      } catch (e) {
        // Ignore cleanup errors if already removed
      }
    }, 1000);
  }, 250);
}

/**
 * Triggers isolated A4 Landscape printing for GST E-Way Bills.
 */
export function printEwayBill(ewayBill: any) {
  // 1. Remove any existing print mount root & style tag
  const existingRoot = document.getElementById('printable-document-root');
  if (existingRoot) existingRoot.remove();
  const existingStyle = document.getElementById('printable-document-style');
  if (existingStyle) existingStyle.remove();

  // 2. Inject dynamic @page CSS for strict A4 Landscape
  const styleEl = document.createElement('style');
  styleEl.id = 'printable-document-style';
  styleEl.innerHTML = `
    @media print {
      @page {
        size: A4 landscape;
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

  // 3. Create isolated container element
  const printContainer = document.createElement('div');
  printContainer.id = 'printable-document-root';
  document.body.appendChild(printContainer);

  // 4. Import & Mount EwayBillPrintDocument inside isolated container
  import('../components/eway/EwayBillPrintDocument').then(({ EwayBillPrintDocument }) => {
    const root = createRoot(printContainer);
    root.render(
      <React.StrictMode>
        <EwayBillPrintDocument ewayBill={ewayBill} isPrintMode={true} />
      </React.StrictMode>
    );

    // 5. Trigger browser print after rendering
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        try {
          root.unmount();
          printContainer.remove();
          styleEl.remove();
        } catch (e) {}
      }, 1000);
    }, 250);
  });
}

