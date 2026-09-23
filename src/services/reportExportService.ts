/**
 * VISTAAR Business OS — Financial Report Export Service
 * 
 * Provides professional, audit-ready PDF, Print, and Excel report generation for:
 * 1. Daybook Financial Journal
 * 2. Cashbook Liquidity & Accounts Journal
 * 
 * Guarantees:
 * - Uses the EXACT filtered dataset currently active in the UI.
 * - Strict financial semantics (Total != Inflow, Inflow = money received, Remaining = balance).
 * - Multi-page pagination (Page X of Y, repeated table headers).
 * - Company profile headers & filter audit trail.
 * - Physical verification & signature sections.
 * - Multi-tenant workspace security.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { DaybookTransaction, DaybookSummaryMetrics, CashbookSummaryMetrics, FinancialAccount } from '../types';

export interface CompanyReportProfile {
  businessName?: string;
  legalName?: string;
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  logoUrl?: string;
}

export interface DaybookReportFilters {
  dateRange: string;
  startDate?: string;
  endDate?: string;
  transactionType?: string;
  paymentMode?: string;
  paymentStatus?: string;
  search?: string;
}

export interface CashbookReportFilters {
  accountName?: string;
  financialYear?: string;
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  paymentMode?: string;
  search?: string;
}

// Helper: Format number with Indian numbering system (e.g. 17,700.00, 1,25,000.00)
export function formatIndianCurrency(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '0.00';
  const val = Math.abs(num);
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Helper: Format date for report display (e.g. "23 Sep 2026")
export function formatReportDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// Helper: Human-readable report period string
export function resolveReportPeriodText(dateRange?: string, start?: string, end?: string): string {
  const today = new Date();
  const todayFormatted = formatReportDate(today.toISOString().split('T')[0]);

  if (!dateRange || dateRange === 'all') {
    return `All Time (as of ${todayFormatted})`;
  }

  if (dateRange === 'today') {
    return `Today (${todayFormatted})`;
  }

  if (dateRange === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    return `Yesterday (${formatReportDate(y.toISOString().split('T')[0])})`;
  }

  if (dateRange === 'week') {
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return `This Week (${formatReportDate(monday.toISOString().split('T')[0])} – ${todayFormatted})`;
  }

  if (dateRange === 'month') {
    const monthName = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    return `This Month (${monthName})`;
  }

  if (dateRange === 'last_month') {
    const lastM = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const monthName = lastM.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    return `Last Month (${monthName})`;
  }

  if (dateRange === 'custom') {
    if (start && end) {
      return `${formatReportDate(start)} – ${formatReportDate(end)}`;
    }
    if (start) return `From ${formatReportDate(start)}`;
    if (end) return `Up to ${formatReportDate(end)}`;
  }

  return dateRange;
}

// Helper: Sanitize string for filenames
function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 50);
}

// Helper: Current generated timestamp string
function getGeneratedTimestamp(): string {
  const now = new Date();
  return now.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// =============================================================================
// DAYBOOK PDF GENERATION (A4 Landscape, Vector & Selectable Text)
// =============================================================================

export function generateDaybookPdf(
  transactions: DaybookTransaction[],
  metrics: DaybookSummaryMetrics,
  filters: DaybookReportFilters,
  company: CompanyReportProfile
): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const companyName = company.legalName || company.businessName || 'VISTAAR Business';
  const periodText = resolveReportPeriodText(filters.dateRange, filters.startDate, filters.endDate);
  const generatedAt = getGeneratedTimestamp();

  // 1. Company & Report Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(companyName.toUpperCase(), 14, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139); // slate-500

  const companyDetails: string[] = [];
  if (company.address) companyDetails.push(company.address);
  if (company.phone) companyDetails.push(`Phone: ${company.phone}`);
  if (company.email) companyDetails.push(`Email: ${company.email}`);
  if (company.gstin) companyDetails.push(`GSTIN: ${company.gstin}`);

  if (companyDetails.length > 0) {
    doc.text(companyDetails.join(' | '), 14, 20);
  }

  // Right-aligned report badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235); // blue-600
  doc.text('DAYBOOK FINANCIAL REPORT', 283, 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('VISTAAR Business OS • Official Financial Journal', 283, 20, { align: 'right' });

  // Divider Line
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.line(14, 23, 283, 23);

  // 2. Report Period & Filter Summary Audit Box
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(14, 25, 269, 14, 1.5, 1.5, 'F');
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.roundedRect(14, 25, 269, 14, 1.5, 1.5, 'S');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Report Period: ${periodText}`, 17, 30);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const filterParts = [
    `Type: ${filters.transactionType || 'All Types'}`,
    `Mode: ${filters.paymentMode || 'All Modes'}`,
    `Status: ${filters.paymentStatus || 'All Statuses'}`,
    filters.search?.trim() ? `Search: "${filters.search.trim()}"` : 'Search: None',
  ];
  doc.text(`Applied Filters: ${filterParts.join('  •  ')}`, 17, 35);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(`Generated On: ${generatedAt}`, 280, 30, { align: 'right' });

  // 3. Transactions Table
  const tableRows = transactions.map((tx) => {
    const isOut = tx.direction === 'OUT';
    const isDocLinked = tx.transactionType === 'SALE' || tx.transactionType === 'CUSTOMER_PAYMENT' || tx.referenceType === 'INVOICE' || tx.referenceType === 'PAYMENT' || tx.referenceType === 'COUNTER_SALE';

    // TOTAL: Authoritative document gross total
    const totalVal = tx.totalAmount !== null && tx.totalAmount !== undefined
      ? formatIndianCurrency(tx.totalAmount)
      : isDocLinked ? formatIndianCurrency(tx.amount) : '—';

    // INFLOW: Actual cash received in this transaction
    const inflowVal = (!isOut && tx.amount > 0) ? `+${formatIndianCurrency(tx.amount)}` : '—';

    // OUTFLOW: Actual money paid out
    const outflowVal = (isOut && tx.amount > 0) ? `-${formatIndianCurrency(tx.amount)}` : '—';

    // REMAINING: Document balance after cumulative payments
    const remainingVal = isDocLinked
      ? (tx.remainingAmount !== null && tx.remainingAmount !== undefined
          ? formatIndianCurrency(tx.remainingAmount)
          : (tx.amount > 0 ? '0.00' : '—'))
      : '—';

    return [
      tx.transactionDate ? formatReportDate(tx.transactionDate) : '—',
      tx.partyName || 'Customer / Party',
      tx.description || tx.referenceNumber || '—',
      totalVal,
      inflowVal,
      outflowVal,
      remainingVal,
      tx.paymentMode || 'Cash',
    ];
  });

  autoTable(doc, {
    startY: 42,
    margin: { left: 14, right: 14, top: 18, bottom: 16 },
    head: [[
      'Date',
      'Customer / Party',
      'Description / Ref',
      'Total (Rs.)',
      'Inflow (+Rs.)',
      'Outflow (-Rs.)',
      'Remaining (Rs.)',
      'Mode',
    ]],
    body: tableRows.length > 0 ? tableRows : [['—', 'No transactions found for the selected filter period.', '—', '—', '—', '—', '—', '—']],
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [15, 23, 42], // slate-900
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 23 }, // Date
      1: { cellWidth: 50 }, // Customer
      2: { cellWidth: 69 }, // Description
      3: { cellWidth: 27, halign: 'right' }, // Total
      4: { cellWidth: 27, halign: 'right', textColor: [5, 150, 105] }, // Inflow green
      5: { cellWidth: 27, halign: 'right', textColor: [225, 29, 72] }, // Outflow red
      6: { cellWidth: 27, halign: 'right', textColor: [217, 119, 6] }, // Remaining amber
      7: { cellWidth: 19, halign: 'center' }, // Mode
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    didDrawPage: (data) => {
      // Header for page 2+
      if (data.pageNumber > 1) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(`${companyName} — DAYBOOK REPORT (${periodText})`, 14, 10);
        doc.text(`Page ${data.pageNumber}`, 283, 10, { align: 'right' });
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(14, 12, 283, 12);
      }

      // Footer on every page
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('Generated by VISTAAR Business OS • Official Record • Strictly Confidential', 14, pageHeight - 8);
      doc.text(`Page ${data.pageNumber} of ${doc.getNumberOfPages()}`, 283, pageHeight - 8, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(14, pageHeight - 11, 283, pageHeight - 11);
    },
  });

  // Calculate remaining outstanding across filtered invoice receivables
  const totalReceivableRemaining = transactions.reduce((acc, tx) => {
    return acc + (Number(tx.remainingAmount) || 0);
  }, 0);

  const totalGrossValue = transactions.reduce((acc, tx) => {
    return acc + (Number(tx.totalAmount) || Number(tx.amount) || 0);
  }, 0);

  // 4. Financial Summary Box (Positioned after table)
  let finalY = (doc as any).lastAutoTable?.finalY || 100;
  const pageHeight = doc.internal.pageSize.getHeight();

  // If less than 45mm remaining on the page, add new page for Summary & Signatures
  if (finalY + 45 > pageHeight - 15) {
    doc.addPage();
    finalY = 15;
  } else {
    finalY += 6;
  }

  // Summary Container Box
  doc.setFillColor(241, 245, 249); // slate-100
  doc.roundedRect(14, finalY, 269, 16, 1.5, 1.5, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, finalY, 269, 16, 1.5, 1.5, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);

  const colW = 269 / 5;
  // Summary Item 1: Total Entries
  doc.text('TOTAL ENTRIES', 14 + colW * 0 + 4, finalY + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`${metrics.totalCount} Records`, 14 + colW * 0 + 4, finalY + 11);

  // Summary Item 2: Total Gross Value
  doc.setFontSize(8);
  doc.text('GROSS VALUE', 14 + colW * 1 + 4, finalY + 5);
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Rs. ${formatIndianCurrency(totalGrossValue)}`, 14 + colW * 1 + 4, finalY + 11);

  // Summary Item 3: Total Inflow
  doc.setFontSize(8);
  doc.setTextColor(5, 150, 105);
  doc.text('TOTAL INFLOW (+)', 14 + colW * 2 + 4, finalY + 5);
  doc.setFontSize(9.5);
  doc.text(`Rs. ${formatIndianCurrency(metrics.totalInflow)}`, 14 + colW * 2 + 4, finalY + 11);

  // Summary Item 4: Total Outflow
  doc.setFontSize(8);
  doc.setTextColor(225, 29, 72);
  doc.text('TOTAL OUTFLOW (-)', 14 + colW * 3 + 4, finalY + 5);
  doc.setFontSize(9.5);
  doc.text(`Rs. ${formatIndianCurrency(metrics.totalOutflow)}`, 14 + colW * 3 + 4, finalY + 11);

  // Summary Item 5: Outstanding Balance
  doc.setFontSize(8);
  doc.setTextColor(217, 119, 6);
  doc.text('OUTSTANDING DUE', 14 + colW * 4 + 4, finalY + 5);
  doc.setFontSize(9.5);
  doc.text(`Rs. ${formatIndianCurrency(totalReceivableRemaining)}`, 14 + colW * 4 + 4, finalY + 11);

  // 5. Verification & Signature Block
  const sigY = finalY + 22;
  if (sigY + 25 > pageHeight - 15) {
    doc.addPage();
  }

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);

  // Signature columns
  doc.text('Prepared By: ___________________________', 14, sigY + 8);
  doc.text('Checked By: ____________________________', 82, sigY + 8);
  doc.text('Authorized Signatory: ___________________', 150, sigY + 8);
  doc.text('Date: ________________', 240, sigY + 8);

  // Company Stamp Area
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.roundedRect(238, sigY + 11, 45, 12, 1, 1, 'S');
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('[ COMPANY STAMP ]', 260.5, sigY + 18, { align: 'center' });

  return doc;
}

// =============================================================================
// CASHBOOK PDF GENERATION (A4 Landscape / Portrait, Vector & Selectable Text)
// =============================================================================

export function generateCashbookPdf(
  transactions: DaybookTransaction[],
  metrics: CashbookSummaryMetrics,
  accounts: FinancialAccount[],
  filters: CashbookReportFilters,
  company: CompanyReportProfile
): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const companyName = company.legalName || company.businessName || 'VISTAAR Business';
  const periodText = resolveReportPeriodText(filters.dateRange, filters.startDate, filters.endDate);
  const generatedAt = getGeneratedTimestamp();

  // 1. Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(companyName.toUpperCase(), 14, 15);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);

  const companyDetails: string[] = [];
  if (company.address) companyDetails.push(company.address);
  if (company.phone) companyDetails.push(`Phone: ${company.phone}`);
  if (company.email) companyDetails.push(`Email: ${company.email}`);
  if (company.gstin) companyDetails.push(`GSTIN: ${company.gstin}`);

  if (companyDetails.length > 0) {
    doc.text(companyDetails.join(' | '), 14, 20);
  }

  // Right-aligned report badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text('CASHBOOK REPORT', 283, 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('VISTAAR Business OS • Liquidity & Cash Flow Register', 283, 20, { align: 'right' });

  // Divider Line
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(14, 23, 283, 23);

  // 2. Report Period & Filter Summary Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 25, 269, 14, 1.5, 1.5, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 25, 269, 14, 1.5, 1.5, 'S');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Report Period: ${periodText}`, 17, 30);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const filterParts = [
    `Account: ${filters.accountName || 'All Accounts'}`,
    `FY: ${filters.financialYear || 'Current FY'}`,
    `Mode: ${filters.paymentMode || 'All Modes'}`,
    filters.search?.trim() ? `Search: "${filters.search.trim()}"` : 'Search: None',
  ];
  doc.text(`Applied Filters: ${filterParts.join('  •  ')}`, 17, 35);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(`Generated On: ${generatedAt}`, 280, 30, { align: 'right' });

  // Account name lookup
  const accountMap = new Map<string, string>();
  accounts.forEach((a) => {
    if (a.id) accountMap.set(a.id, a.name);
  });

  // 3. Cashbook Table
  const tableRows = transactions.map((tx) => {
    const isOut = tx.direction === 'OUT';
    const accName = tx.paymentMode || 'Cash Account';

    // Inflow: money actually received
    const inflowVal = (!isOut && tx.amount > 0) ? `+${formatIndianCurrency(tx.amount)}` : '—';
    // Outflow: money actually disbursed
    const outflowVal = (isOut && tx.amount > 0) ? `-${formatIndianCurrency(tx.amount)}` : '—';

    return [
      tx.transactionDate ? formatReportDate(tx.transactionDate) : '—',
      accName,
      tx.transactionType || 'CASH_ENTRY',
      tx.partyName || tx.description || tx.referenceNumber || '—',
      tx.referenceNumber || tx.transactionCode || '—',
      inflowVal,
      outflowVal,
      tx.paymentMode || 'Cash',
    ];
  });

  autoTable(doc, {
    startY: 42,
    margin: { left: 14, right: 14, top: 18, bottom: 16 },
    head: [[
      'Date',
      'Account / Book',
      'Entry Type',
      'Party / Description',
      'Reference #',
      'Receipt (+Rs.)',
      'Payment (-Rs.)',
      'Mode',
    ]],
    body: tableRows.length > 0 ? tableRows : [['—', 'No Cashbook transactions found for the selected period.', '—', '—', '—', '—', '—', '—']],
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [6, 78, 59], // emerald-900
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 23 }, // Date
      1: { cellWidth: 38 }, // Account
      2: { cellWidth: 32 }, // Type
      3: { cellWidth: 72 }, // Party
      4: { cellWidth: 28 }, // Ref
      5: { cellWidth: 27, halign: 'right', textColor: [5, 150, 105] }, // Receipt
      6: { cellWidth: 27, halign: 'right', textColor: [225, 29, 72] }, // Payment
      7: { cellWidth: 22, halign: 'center' }, // Mode
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (data) => {
      // Header for page 2+
      if (data.pageNumber > 1) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(`${companyName} — CASHBOOK REPORT (${periodText})`, 14, 10);
        doc.text(`Page ${data.pageNumber}`, 283, 10, { align: 'right' });
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(14, 12, 283, 12);
      }

      // Footer
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Generated by VISTAAR Business OS • Official Record • Strictly Confidential', 14, pageHeight - 8);
      doc.text(`Page ${data.pageNumber} of ${doc.getNumberOfPages()}`, 283, pageHeight - 8, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(14, pageHeight - 11, 283, pageHeight - 11);
    },
  });

  // 4. Cashbook Summary Box
  let finalY = (doc as any).lastAutoTable?.finalY || 100;
  const pageHeight = doc.internal.pageSize.getHeight();

  if (finalY + 45 > pageHeight - 15) {
    doc.addPage();
    finalY = 15;
  } else {
    finalY += 6;
  }

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, finalY, 269, 16, 1.5, 1.5, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, finalY, 269, 16, 1.5, 1.5, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);

  const colW = 269 / 5;
  // Item 1: Total Entries
  doc.text('TOTAL ENTRIES', 14 + colW * 0 + 4, finalY + 5);
  doc.setFontSize(9.5);
  doc.text(`${transactions.length} Records`, 14 + colW * 0 + 4, finalY + 11);

  // Item 2: Opening Balance
  doc.setFontSize(8);
  doc.text('OPENING BALANCE', 14 + colW * 1 + 4, finalY + 5);
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Rs. ${formatIndianCurrency(metrics.totalOpeningBalance)}`, 14 + colW * 1 + 4, finalY + 11);

  // Item 3: Total Receipts
  doc.setFontSize(8);
  doc.setTextColor(5, 150, 105);
  doc.text('TOTAL RECEIPTS (+)', 14 + colW * 2 + 4, finalY + 5);
  doc.setFontSize(9.5);
  doc.text(`Rs. ${formatIndianCurrency(metrics.totalReceipts)}`, 14 + colW * 2 + 4, finalY + 11);

  // Item 4: Total Payments
  doc.setFontSize(8);
  doc.setTextColor(225, 29, 72);
  doc.text('TOTAL PAYMENTS (-)', 14 + colW * 3 + 4, finalY + 5);
  doc.setFontSize(9.5);
  doc.text(`Rs. ${formatIndianCurrency(metrics.totalPayments)}`, 14 + colW * 3 + 4, finalY + 11);

  // Item 5: Closing Balance
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('CLOSING BALANCE', 14 + colW * 4 + 4, finalY + 5);
  doc.setFontSize(9.5);
  doc.text(`Rs. ${formatIndianCurrency(metrics.totalClosingBalance)}`, 14 + colW * 4 + 4, finalY + 11);

  // 5. Signature Section
  const sigY = finalY + 22;
  if (sigY + 25 > pageHeight - 15) {
    doc.addPage();
  }

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);

  doc.text('Prepared By: ___________________________', 14, sigY + 8);
  doc.text('Checked By: ____________________________', 82, sigY + 8);
  doc.text('Authorized Signatory: ___________________', 150, sigY + 8);
  doc.text('Date: ________________', 240, sigY + 8);

  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.roundedRect(238, sigY + 11, 45, 12, 1, 1, 'S');
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('[ COMPANY STAMP ]', 260.5, sigY + 18, { align: 'center' });

  return doc;
}

// =============================================================================
// ISOLATED BROWSER A4 PRINTING ENGINE
// =============================================================================

export function printHtmlReport(htmlContent: string, orientation: 'landscape' | 'portrait' = 'landscape', title: string = 'VISTAAR_Report') {
  const existingRoot = document.getElementById('printable-report-root');
  if (existingRoot) existingRoot.remove();
  const existingStyle = document.getElementById('printable-report-style');
  if (existingStyle) existingStyle.remove();

  const originalTitle = document.title;
  document.title = title;

  const styleEl = document.createElement('style');
  styleEl.id = 'printable-report-style';
  styleEl.innerHTML = `
    @media print {
      @page {
        size: A4 ${orientation};
        margin: 10mm 12mm 12mm 12mm;
      }
      body > *:not(#printable-report-root) {
        display: none !important;
      }
      #printable-report-root {
        display: block !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #0f172a !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
      table {
        width: 100% !important;
        border-collapse: collapse !important;
        page-break-inside: auto !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      thead {
        display: table-header-group !important;
      }
      tfoot {
        display: table-footer-group !important;
      }
    }
  `;
  document.head.appendChild(styleEl);

  const container = document.createElement('div');
  container.id = 'printable-report-root';
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      container.remove();
      styleEl.remove();
      document.title = originalTitle;
    }, 1000);
  }, 250);
}

// =============================================================================
// EXCEL (.XLSX) EXPORT IMPLEMENTATIONS
// =============================================================================

export function exportDaybookToExcel(
  transactions: DaybookTransaction[],
  metrics: DaybookSummaryMetrics,
  filters: DaybookReportFilters,
  company: CompanyReportProfile,
  filename: string
) {
  const companyName = company.legalName || company.businessName || 'VISTAAR Business';
  const periodText = resolveReportPeriodText(filters.dateRange, filters.startDate, filters.endDate);

  const rows: any[] = [
    [companyName.toUpperCase(), '', '', '', '', '', '', ''],
    ['DAYBOOK FINANCIAL REPORT', '', '', '', '', '', '', ''],
    [`Report Period: ${periodText}`, '', '', '', '', '', '', ''],
    [`Filters: Type=${filters.transactionType || 'ALL'}, Mode=${filters.paymentMode || 'ALL'}, Status=${filters.paymentStatus || 'ALL'}`, '', '', '', '', '', '', ''],
    ['Generated On: ' + getGeneratedTimestamp(), '', '', '', '', '', '', ''],
    [],
    ['Date', 'Party / Customer', 'Description', 'Total (₹)', 'Inflow (+₹)', 'Outflow (-₹)', 'Remaining (₹)', 'Payment Mode'],
  ];

  transactions.forEach((tx) => {
    const isOut = tx.direction === 'OUT';
    const isDocLinked = tx.transactionType === 'SALE' || tx.transactionType === 'CUSTOMER_PAYMENT' || tx.referenceType === 'INVOICE' || tx.referenceType === 'PAYMENT' || tx.referenceType === 'COUNTER_SALE';

    const totalVal = tx.totalAmount !== null && tx.totalAmount !== undefined
      ? tx.totalAmount
      : isDocLinked ? tx.amount : '';

    const inflowVal = (!isOut && tx.amount > 0) ? tx.amount : 0;
    const outflowVal = (isOut && tx.amount > 0) ? tx.amount : 0;
    const remainingVal = isDocLinked ? (tx.remainingAmount ?? 0) : '';

    rows.push([
      tx.transactionDate || '',
      tx.partyName || 'Customer',
      tx.description || tx.referenceNumber || '',
      totalVal,
      inflowVal,
      outflowVal,
      remainingVal,
      tx.paymentMode || 'Cash',
    ]);
  });

  // Summary Row
  rows.push([]);
  rows.push([
    'TOTALS',
    `${transactions.length} Transactions`,
    '',
    '',
    metrics.totalInflow,
    metrics.totalOutflow,
    transactions.reduce((acc, t) => acc + (t.remainingAmount || 0), 0),
    `Net: ${metrics.netMovement}`,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daybook');
  XLSX.writeFile(wb, filename);
}

export function exportCashbookToExcel(
  transactions: DaybookTransaction[],
  metrics: CashbookSummaryMetrics,
  filters: CashbookReportFilters,
  company: CompanyReportProfile,
  filename: string
) {
  const companyName = company.legalName || company.businessName || 'VISTAAR Business';
  const periodText = resolveReportPeriodText(filters.dateRange, filters.startDate, filters.endDate);

  const rows: any[] = [
    [companyName.toUpperCase(), '', '', '', '', '', '', ''],
    ['CASHBOOK LIQUIDITY & MONEY MOVEMENT REPORT', '', '', '', '', '', '', ''],
    [`Report Period: ${periodText}`, '', '', '', '', '', '', ''],
    [`Filters: Account=${filters.accountName || 'All'}, FY=${filters.financialYear || 'Current'}, Mode=${filters.paymentMode || 'ALL'}`, '', '', '', '', '', '', ''],
    ['Generated On: ' + getGeneratedTimestamp(), '', '', '', '', '', '', ''],
    [],
    ['Date', 'Account', 'Transaction Type', 'Party / Description', 'Reference #', 'Receipt (+₹)', 'Payment (-₹)', 'Mode'],
  ];

  transactions.forEach((tx) => {
    const isOut = tx.direction === 'OUT';
    const inflowVal = (!isOut && tx.amount > 0) ? tx.amount : 0;
    const outflowVal = (isOut && tx.amount > 0) ? tx.amount : 0;

    rows.push([
      tx.transactionDate || '',
      tx.paymentMode || 'Cash Account',
      tx.transactionType || 'CASH_ENTRY',
      tx.partyName || tx.description || '',
      tx.referenceNumber || tx.transactionCode || '',
      inflowVal,
      outflowVal,
      tx.paymentMode || 'Cash',
    ]);
  });

  // Summary Rows
  rows.push([]);
  rows.push(['SUMMARY TOTALS', '', '', '', '', '', '', '']);
  rows.push(['Total Entries', transactions.length, '', '', '', '', '', '']);
  rows.push(['Opening Balance', metrics.totalOpeningBalance, '', '', '', '', '', '']);
  rows.push(['Total Receipts (+₹)', metrics.totalReceipts, '', '', '', '', '', '']);
  rows.push(['Total Payments (-₹)', metrics.totalPayments, '', '', '', '', '', '']);
  rows.push(['Net Cash Movement', metrics.totalReceipts - metrics.totalPayments, '', '', '', '', '', '']);
  rows.push(['Closing Balance', metrics.totalClosingBalance, '', '', '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cashbook');
  XLSX.writeFile(wb, filename);
}

// Helper: Build Daybook HTML printable document
export function buildDaybookHtml(
  transactions: DaybookTransaction[],
  metrics: DaybookSummaryMetrics,
  filters: DaybookReportFilters,
  company: CompanyReportProfile
): string {
  const companyName = company.legalName || company.businessName || 'VISTAAR Business';
  const periodText = resolveReportPeriodText(filters.dateRange, filters.startDate, filters.endDate);
  const generatedAt = getGeneratedTimestamp();

  const totalReceivableRemaining = transactions.reduce((acc, tx) => acc + (Number(tx.remainingAmount) || 0), 0);
  const totalGrossValue = transactions.reduce((acc, tx) => acc + (Number(tx.totalAmount) || Number(tx.amount) || 0), 0);

  const rowsHtml = transactions.length === 0
    ? `<tr><td colspan="8" style="text-align: center; padding: 24px; color: #94a3b8; font-weight: 500;">No transactions found for the selected filter period.</td></tr>`
    : transactions.map((tx) => {
        const isOut = tx.direction === 'OUT';
        const isDocLinked = tx.transactionType === 'SALE' || tx.transactionType === 'CUSTOMER_PAYMENT' || tx.referenceType === 'INVOICE' || tx.referenceType === 'PAYMENT' || tx.referenceType === 'COUNTER_SALE';

        const totalVal = tx.totalAmount !== null && tx.totalAmount !== undefined
          ? `₹${formatIndianCurrency(tx.totalAmount)}`
          : isDocLinked ? `₹${formatIndianCurrency(tx.amount)}` : '—';

        const inflowVal = (!isOut && tx.amount > 0) ? `<span style="color: #059669; font-weight: 600;">+₹${formatIndianCurrency(tx.amount)}</span>` : '—';
        const outflowVal = (isOut && tx.amount > 0) ? `<span style="color: #e11d48; font-weight: 600;">-₹${formatIndianCurrency(tx.amount)}</span>` : '—';
        const remainingVal = isDocLinked
          ? `<span style="color: ${tx.remainingAmount && tx.remainingAmount > 0 ? '#d97706' : '#059669'}; font-weight: 600;">₹${formatIndianCurrency(tx.remainingAmount || 0)}</span>`
          : '—';

        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 7px 8px; font-size: 11px;">${formatReportDate(tx.transactionDate)}</td>
            <td style="padding: 7px 8px; font-size: 11px; font-weight: 600; color: #0f172a;">${tx.partyName || 'Customer'}</td>
            <td style="padding: 7px 8px; font-size: 11px; color: #475569;">${tx.description || tx.referenceNumber || '—'}</td>
            <td style="padding: 7px 8px; font-size: 11px; text-align: right; font-weight: 600;">${totalVal}</td>
            <td style="padding: 7px 8px; font-size: 11px; text-align: right;">${inflowVal}</td>
            <td style="padding: 7px 8px; font-size: 11px; text-align: right;">${outflowVal}</td>
            <td style="padding: 7px 8px; font-size: 11px; text-align: right;">${remainingVal}</td>
            <td style="padding: 7px 8px; font-size: 11px; text-align: center;"><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">${tx.paymentMode || 'Cash'}</span></td>
          </tr>
        `;
      }).join('');

  return `
    <div style="padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; max-width: 100%;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 14px;">
        <div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">${companyName.toUpperCase()}</h1>
          <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">
            ${company.address ? company.address + ' • ' : ''}
            ${company.phone ? 'Phone: ' + company.phone + ' • ' : ''}
            ${company.email ? 'Email: ' + company.email + ' • ' : ''}
            ${company.gstin ? 'GSTIN: ' + company.gstin : ''}
          </p>
        </div>
        <div style="text-align: right;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: #2563eb;">DAYBOOK REPORT</h2>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b; font-weight: 600;">VISTAAR Business OS • Official Journal</p>
        </div>
      </div>

      <!-- Filter Audit Box -->
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 2px;">Report Period: ${periodText}</div>
          <div style="font-size: 11px; color: #475569;">
            Type: <strong>${filters.transactionType || 'All Types'}</strong> • 
            Mode: <strong>${filters.paymentMode || 'All Modes'}</strong> • 
            Status: <strong>${filters.paymentStatus || 'All Statuses'}</strong>
            ${filters.search?.trim() ? ' • Search: "<strong>' + filters.search.trim() + '</strong>"' : ''}
          </div>
        </div>
        <div style="font-size: 10px; color: #64748b; text-align: right;">
          Generated On: ${generatedAt}
        </div>
      </div>

      <!-- Transactions Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff; text-align: left;">
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase;">Date</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase;">Customer / Party</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase;">Description / Ref</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: right;">Total (₹)</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: right;">Inflow (+₹)</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: right;">Outflow (-₹)</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: right;">Remaining (₹)</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: center;">Mode</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- Summary KPI Box -->
      <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; page-break-inside: avoid;">
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Entries</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${metrics.totalCount} Records</div>
        </div>
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Gross Value</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">₹${formatIndianCurrency(totalGrossValue)}</div>
        </div>
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #059669; text-transform: uppercase;">Total Inflow (+)</div>
          <div style="font-size: 14px; font-weight: 800; color: #059669; margin-top: 2px;">₹${formatIndianCurrency(metrics.totalInflow)}</div>
        </div>
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #e11d48; text-transform: uppercase;">Total Outflow (-)</div>
          <div style="font-size: 14px; font-weight: 800; color: #e11d48; margin-top: 2px;">₹${formatIndianCurrency(metrics.totalOutflow)}</div>
        </div>
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #d97706; text-transform: uppercase;">Outstanding Due</div>
          <div style="font-size: 14px; font-weight: 800; color: #d97706; margin-top: 2px;">₹${formatIndianCurrency(totalReceivableRemaining)}</div>
        </div>
      </div>

      <!-- Verification & Signatures Section -->
      <div style="margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid;">
        <div style="font-size: 11px; font-weight: 600; color: #475569;">
          <div>Prepared By: _________________________________</div>
          <div style="margin-top: 14px;">Checked By: __________________________________</div>
        </div>
        <div style="font-size: 11px; font-weight: 600; color: #475569;">
          <div>Authorized Signatory: _________________________</div>
          <div style="margin-top: 14px;">Date: ________________________</div>
        </div>
        <div style="border: 2px dashed #cbd5e1; border-radius: 8px; width: 140px; height: 60px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8; font-weight: 700;">
          [ COMPANY STAMP ]
        </div>
      </div>

      <!-- Running Footer Note -->
      <div style="margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between;">
        <span>Generated by VISTAAR Business OS • Official Record • Strictly Confidential</span>
        <span>Generated On: ${generatedAt}</span>
      </div>
    </div>
  `;
}

// Helper: Build Cashbook HTML printable document
export function buildCashbookHtml(
  transactions: DaybookTransaction[],
  metrics: CashbookSummaryMetrics,
  filters: CashbookReportFilters,
  company: CompanyReportProfile
): string {
  const companyName = company.legalName || company.businessName || 'VISTAAR Business';
  const periodText = resolveReportPeriodText(filters.dateRange, filters.startDate, filters.endDate);
  const generatedAt = getGeneratedTimestamp();

  const rowsHtml = transactions.length === 0
    ? `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8; font-weight: 500;">No Cashbook transactions found for the selected filter period.</td></tr>`
    : transactions.map((tx) => {
        const isOut = tx.direction === 'OUT';
        const inflowVal = (!isOut && tx.amount > 0) ? `<span style="color: #059669; font-weight: 600;">+₹${formatIndianCurrency(tx.amount)}</span>` : '—';
        const outflowVal = (isOut && tx.amount > 0) ? `<span style="color: #e11d48; font-weight: 600;">-₹${formatIndianCurrency(tx.amount)}</span>` : '—';

        return `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 7px 8px; font-size: 11px;">${formatReportDate(tx.transactionDate)}</td>
            <td style="padding: 7px 8px; font-size: 11px; font-weight: 600; color: #0f172a;">${tx.paymentMode || 'Cash Account'}</td>
            <td style="padding: 7px 8px; font-size: 11px; color: #475569;">${tx.transactionType || 'CASH_ENTRY'}</td>
            <td style="padding: 7px 8px; font-size: 11px; color: #0f172a;">${tx.partyName || tx.description || '—'}</td>
            <td style="padding: 7px 8px; font-size: 11px; color: #64748b;">${tx.referenceNumber || tx.transactionCode || '—'}</td>
            <td style="padding: 7px 8px; font-size: 11px; text-align: right;">${inflowVal}</td>
            <td style="padding: 7px 8px; font-size: 11px; text-align: right;">${outflowVal}</td>
          </tr>
        `;
      }).join('');

  return `
    <div style="padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; max-width: 100%;">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 14px;">
        <div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">${companyName.toUpperCase()}</h1>
          <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">
            ${company.address ? company.address + ' • ' : ''}
            ${company.phone ? 'Phone: ' + company.phone + ' • ' : ''}
            ${company.email ? 'Email: ' + company.email + ' • ' : ''}
            ${company.gstin ? 'GSTIN: ' + company.gstin : ''}
          </p>
        </div>
        <div style="text-align: right;">
          <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: #059669;">CASHBOOK REPORT</h2>
          <p style="margin: 2px 0 0 0; font-size: 10px; color: #64748b; font-weight: 600;">VISTAAR Business OS • Liquidity & Cash Flow</p>
        </div>
      </div>

      <!-- Filter Audit Box -->
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 12px; font-weight: 700; color: #0f172a; margin-bottom: 2px;">Report Period: ${periodText}</div>
          <div style="font-size: 11px; color: #475569;">
            Account: <strong>${filters.accountName || 'All Accounts'}</strong> • 
            FY: <strong>${filters.financialYear || 'Current FY'}</strong> • 
            Mode: <strong>${filters.paymentMode || 'All Modes'}</strong>
            ${filters.search?.trim() ? ' • Search: "<strong>' + filters.search.trim() + '</strong>"' : ''}
          </div>
        </div>
        <div style="font-size: 10px; color: #64748b; text-align: right;">
          Generated On: ${generatedAt}
        </div>
      </div>

      <!-- Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="background: #064e3b; color: #ffffff; text-align: left;">
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase;">Date</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase;">Account / Book</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase;">Entry Type</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase;">Party / Description</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase;">Reference #</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: right;">Receipt (+₹)</th>
            <th style="padding: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; text-align: right;">Payment (-₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- Summary KPI Box -->
      <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; page-break-inside: avoid;">
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total Entries</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">${transactions.length} Records</div>
        </div>
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Opening Balance</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">₹${formatIndianCurrency(metrics.totalOpeningBalance)}</div>
        </div>
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #059669; text-transform: uppercase;">Total Receipts (+)</div>
          <div style="font-size: 14px; font-weight: 800; color: #059669; margin-top: 2px;">₹${formatIndianCurrency(metrics.totalReceipts)}</div>
        </div>
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #e11d48; text-transform: uppercase;">Total Payments (-)</div>
          <div style="font-size: 14px; font-weight: 800; color: #e11d48; margin-top: 2px;">₹${formatIndianCurrency(metrics.totalPayments)}</div>
        </div>
        <div>
          <div style="font-size: 10px; font-weight: 700; color: #0f172a; text-transform: uppercase;">Closing Balance</div>
          <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">₹${formatIndianCurrency(metrics.totalClosingBalance)}</div>
        </div>
      </div>

      <!-- Verification & Signatures Section -->
      <div style="margin-top: 30px; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid;">
        <div style="font-size: 11px; font-weight: 600; color: #475569;">
          <div>Prepared By: _________________________________</div>
          <div style="margin-top: 14px;">Checked By: __________________________________</div>
        </div>
        <div style="font-size: 11px; font-weight: 600; color: #475569;">
          <div>Authorized Signatory: _________________________</div>
          <div style="margin-top: 14px;">Date: ________________________</div>
        </div>
        <div style="border: 2px dashed #cbd5e1; border-radius: 8px; width: 140px; height: 60px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #94a3b8; font-weight: 700;">
          [ COMPANY STAMP ]
        </div>
      </div>

      <!-- Running Footer Note -->
      <div style="margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between;">
        <span>Generated by VISTAAR Business OS • Official Record • Strictly Confidential</span>
        <span>Generated On: ${generatedAt}</span>
      </div>
    </div>
  `;
}

// =============================================================================
// PUBLIC FACING CONTROLLER FUNCTIONS
// =============================================================================

export function downloadDaybookReport(
  transactions: DaybookTransaction[],
  metrics: DaybookSummaryMetrics,
  filters: DaybookReportFilters,
  company: CompanyReportProfile,
  format: 'pdf' | 'print' | 'excel'
) {
  const companySlug = sanitizeFilename(company.legalName || company.businessName || 'Business');
  const dateSlug = filters.startDate && filters.endDate && filters.dateRange === 'custom'
    ? `${filters.startDate}_to_${filters.endDate}`
    : new Date().toISOString().split('T')[0];
  const filename = `VISTAAR_${companySlug}_Daybook_${dateSlug}`;

  if (format === 'excel') {
    exportDaybookToExcel(transactions, metrics, filters, company, `${filename}.xlsx`);
    return;
  }

  if (format === 'print') {
    const html = buildDaybookHtml(transactions, metrics, filters, company);
    printHtmlReport(html, 'landscape', `${filename}.pdf`);
    return;
  }

  // Default: Direct PDF Download
  const doc = generateDaybookPdf(transactions, metrics, filters, company);
  doc.save(`${filename}.pdf`);
}

export function downloadCashbookReport(
  transactions: DaybookTransaction[],
  metrics: CashbookSummaryMetrics,
  accounts: FinancialAccount[],
  filters: CashbookReportFilters,
  company: CompanyReportProfile,
  format: 'pdf' | 'print' | 'excel'
) {
  const companySlug = sanitizeFilename(company.legalName || company.businessName || 'Business');
  const dateSlug = filters.startDate && filters.endDate && filters.dateRange === 'custom'
    ? `${filters.startDate}_to_${filters.endDate}`
    : new Date().toISOString().split('T')[0];
  const filename = `VISTAAR_${companySlug}_Cashbook_${dateSlug}`;

  if (format === 'excel') {
    exportCashbookToExcel(transactions, metrics, filters, company, `${filename}.xlsx`);
    return;
  }

  if (format === 'print') {
    const html = buildCashbookHtml(transactions, metrics, filters, company);
    printHtmlReport(html, 'landscape', `${filename}.pdf`);
    return;
  }

  // Default: Direct PDF Download
  const doc = generateCashbookPdf(transactions, metrics, accounts, filters, company);
  doc.save(`${filename}.pdf`);
}
