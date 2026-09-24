import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ComprehensivePLReport } from './financialStatementService';
import { CompanyReportProfile, formatIndianCurrency, formatReportDate } from './reportExportService';

function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 50);
}

/**
 * Professional PDF Export for Profit & Loss Statement
 */
export function exportProfitLossPdf(
  report: ComprehensivePLReport,
  company: CompanyReportProfile
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generatedAt = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const companyName = company.legalName || company.businessName || 'VISTAAR Business Solutions';
  const periodText = report.current.range.periodBadge;
  const comparisonText = report.comparison ? report.comparison.range.periodBadge : 'None';

  // 1. Header Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(companyName.toUpperCase(), 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // slate-600

  let headerY = 23;
  if (company.address) {
    doc.text(company.address, 14, headerY);
    headerY += 4.5;
  }
  const taxIdText = [
    company.gstin ? `GSTIN: ${company.gstin}` : '',
    company.phone ? `Phone: ${company.phone}` : '',
    company.email ? `Email: ${company.email}` : '',
  ].filter(Boolean).join('  |  ');

  if (taxIdText) {
    doc.text(taxIdText, 14, headerY);
    headerY += 5;
  }

  // Accent Line
  doc.setDrawColor(37, 99, 235); // blue-600
  doc.setLineWidth(0.8);
  doc.line(14, headerY, pageWidth - 14, headerY);

  // Title Box
  const titleY = headerY + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text('STATEMENT OF PROFIT & LOSS', 14, titleY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Reporting Period: ${periodText}    |    Comparison Baseline: ${comparisonText}`, 14, titleY + 5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(`Generated On: ${generatedAt}`, pageWidth - 14, titleY, { align: 'right' });

  // 2. Summary KPI Cards
  const kpiY = titleY + 9;
  const colW = (pageWidth - 28 - 9) / 4;
  const kpiH = 14;

  const kpiData = [
    {
      title: 'NET REVENUE',
      value: `Rs. ${formatIndianCurrency(report.current.revenue.netRevenue)}`,
      sub: report.drivers.revenueDeltaPercent !== null
        ? `${report.drivers.revenueDeltaPercent >= 0 ? '+' : ''}${report.drivers.revenueDeltaPercent}% vs baseline`
        : 'Gross: Rs. ' + formatIndianCurrency(report.current.revenue.grossSales),
      valColor: [15, 23, 42],
    },
    {
      title: 'GROSS PROFIT',
      value: `Rs. ${formatIndianCurrency(report.current.grossProfit.grossProfit)}`,
      sub: `${report.current.grossProfit.grossMarginPercent}% Margin`,
      valColor: report.current.grossProfit.isLoss ? [225, 29, 72] : [37, 99, 235],
    },
    {
      title: 'OPERATING EXPENSES',
      value: `Rs. ${formatIndianCurrency(report.current.operatingExpenses.totalExpenses)}`,
      sub: `${report.current.operatingExpenses.expenseToRevenuePercent}% of Net Rev`,
      valColor: [225, 29, 72],
    },
    {
      title: report.current.netProfit.isLoss ? 'NET LOSS' : 'NET PROFIT',
      value: `Rs. ${formatIndianCurrency(report.current.netProfit.netProfit)}`,
      sub: `${report.current.netProfit.netMarginPercent}% Net Margin`,
      valColor: report.current.netProfit.isLoss ? [225, 29, 72] : [5, 150, 105],
    },
  ];

  kpiData.forEach((kpi, idx) => {
    const x = 14 + idx * (colW + 3);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, kpiY, colW, kpiH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.title, x + 3, kpiY + 4);

    doc.setFontSize(9);
    doc.setTextColor(kpi.valColor[0], kpi.valColor[1], kpi.valColor[2]);
    doc.text(kpi.value, x + 3, kpiY + 8.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text(kpi.sub, x + 3, kpiY + 12);
  });

  // 3. Profit Drivers Summary Note (if comparison exists)
  let tableStartY = kpiY + kpiH + 5;
  if (report.drivers.hasComparison) {
    doc.setFillColor(239, 246, 255); // blue-50
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(14, tableStartY, pageWidth - 28, 8, 1, 1, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 64, 175);
    doc.text('Profit Drivers:', 18, tableStartY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 58, 138);
    const shortNarrative = report.drivers.primaryDriverText.slice(0, 120);
    doc.text(shortNarrative, 37, tableStartY + 5);

    tableStartY += 12;
  }

  // 4. Detailed P&L Accounting Statement Table
  const tableRows = report.statementRows.map((row) => {
    const isLevel0 = row.level === 0;
    const indent = row.level === 1 ? '    ' : '';
    const prefix = row.isNegative ? '-' : '';

    const curFormatted = `${prefix}Rs. ${formatIndianCurrency(Math.abs(row.currentAmount))}`;
    const prevFormatted = row.previousAmount !== undefined
      ? `${row.isNegative ? '-' : ''}Rs. ${formatIndianCurrency(Math.abs(row.previousAmount))}`
      : '—';

    const changeFormatted = row.changePercent !== null && row.changePercent !== undefined
      ? `${row.changePercent >= 0 ? '+' : ''}${row.changePercent}%`
      : '—';

    return [
      `${indent}${row.particular}${row.note ? ` (${row.note})` : ''}`,
      curFormatted,
      prevFormatted,
      changeFormatted,
      isLevel0 ? 'bold' : 'normal',
      row.isNegative ? 'negative' : row.id.includes('np-total') && !row.isNegative ? 'positive' : 'normal',
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: 14, right: 14, top: 18, bottom: 18 },
    head: [[
      'Financial Particulars',
      `Current (${periodText})`,
      `Previous (${comparisonText})`,
      'Variance (%)',
    ]],
    body: tableRows.map((r) => [r[0], r[1], r[2], r[3]]),
    styles: {
      fontSize: 8,
      cellPadding: 2,
      font: 'helvetica',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 92 },
      1: { cellWidth: 32, halign: 'right' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 26, halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rowIndex = data.row.index;
        const meta = tableRows[rowIndex];
        if (meta) {
          if (meta[4] === 'bold') {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [248, 250, 252];
          }
          if (data.column.index === 1 || data.column.index === 2) {
            if (meta[5] === 'negative') {
              data.cell.styles.textColor = [225, 29, 72]; // rose-600
            } else if (meta[5] === 'positive') {
              data.cell.styles.textColor = [5, 150, 105]; // emerald-600
            }
          }
          if (data.column.index === 3) {
            const txt = String(data.cell.raw);
            if (txt.startsWith('+')) {
              data.cell.styles.textColor = [5, 150, 105];
            } else if (txt.startsWith('-')) {
              data.cell.styles.textColor = [225, 29, 72];
            }
          }
        }
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(`${companyName} — PROFIT & LOSS STATEMENT (${periodText})`, 14, 10);
        doc.text(`Page ${data.pageNumber}`, pageWidth - 14, 10, { align: 'right' });
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(14, 12, pageWidth - 14, 12);
      }

      // Footer
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('Generated by VISTAAR Business OS • Authoritative Financial Statement • Strictly Confidential', 14, pageHeight - 8);
      doc.text(`Page ${data.pageNumber} of ${doc.getNumberOfPages()}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(14, pageHeight - 11, pageWidth - 14, pageHeight - 11);
    },
  });

  // 5. Signature Section
  const finalY = (doc as any).lastAutoTable?.finalY || 200;
  let sigY = finalY + 12;
  if (sigY + 28 > pageHeight - 15) {
    doc.addPage();
    sigY = 24;
  }

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);

  doc.text('Prepared By: _____________________', 14, sigY + 6);
  doc.text('Reviewed By: ____________________', 74, sigY + 6);
  doc.text('Authorized Signatory: _____________', 134, sigY + 6);

  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.roundedRect(134, sigY + 10, 48, 12, 1, 1, 'S');
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('[ COMPANY STAMP / SEAL ]', 158, sigY + 17, { align: 'center' });

  const companySlug = sanitizeFilename(companyName);
  const dateSlug = `${report.current.range.startDateStr}_to_${report.current.range.endDateStr}`;
  doc.save(`VISTAAR_${companySlug}_ProfitLoss_${dateSlug}.pdf`);
}

/**
 * Professional Multi-Tab Excel Export for Profit & Loss Statement
 */
export function exportProfitLossExcel(
  report: ComprehensivePLReport,
  company: CompanyReportProfile
) {
  const companyName = company.legalName || company.businessName || 'VISTAAR Business Solutions';
  const wb = XLSX.utils.book_new();

  // SHEET 1: Profit & Loss Statement
  const statementAoa: any[][] = [
    [companyName.toUpperCase()],
    ['STATEMENT OF PROFIT & LOSS'],
    [`Reporting Period: ${report.current.range.periodBadge}`],
    [`Comparison Baseline: ${report.comparison ? report.comparison.range.periodBadge : 'None'}`],
    [`Generated On: ${new Date().toLocaleString('en-IN')}`],
    [],
    ['KEY PERFORMANCE INDICATORS'],
    ['Metric', 'Amount (INR)', 'Margin / Ratio', 'Comparison Change (%)'],
    [
      'Net Operating Revenue',
      report.current.revenue.netRevenue,
      '100.0%',
      report.drivers.revenueDeltaPercent !== null ? `${report.drivers.revenueDeltaPercent}%` : 'N/A',
    ],
    [
      'Cost of Goods Sold (COGS)',
      report.current.cogs.totalCogs,
      `${report.current.cogs.cogsPercent}% of Net Rev`,
      report.drivers.cogsDeltaPercent !== null ? `${report.drivers.cogsDeltaPercent}%` : 'N/A',
    ],
    [
      'Gross Profit',
      report.current.grossProfit.grossProfit,
      `${report.current.grossProfit.grossMarginPercent}% Gross Margin`,
      report.drivers.grossProfitDeltaPercent !== null ? `${report.drivers.grossProfitDeltaPercent}%` : 'N/A',
    ],
    [
      'Total Operating Expenses',
      report.current.operatingExpenses.totalExpenses,
      `${report.current.operatingExpenses.expenseToRevenuePercent}% of Net Rev`,
      report.drivers.expensesDeltaPercent !== null ? `${report.drivers.expensesDeltaPercent}%` : 'N/A',
    ],
    [
      report.current.netProfit.isLoss ? 'Net Operating Loss' : 'Net Operating Profit',
      report.current.netProfit.netProfit,
      `${report.current.netProfit.netMarginPercent}% Net Margin`,
      report.drivers.netProfitDeltaPercent !== null ? `${report.drivers.netProfitDeltaPercent}%` : 'N/A',
    ],
    [],
    ['DETAILED ACCOUNTING STATEMENT'],
    ['Particulars', 'Current Period (INR)', 'Previous Period (INR)', 'Variance (%)', 'Classification'],
  ];

  report.statementRows.forEach((row) => {
    const indent = row.level === 1 ? '  - ' : '';
    statementAoa.push([
      `${indent}${row.particular}`,
      row.currentAmount,
      row.previousAmount !== undefined ? row.previousAmount : '—',
      row.changePercent !== null && row.changePercent !== undefined ? `${row.changePercent}%` : '—',
      row.isHeader ? 'Header' : row.isTotal ? 'Subtotal/Total' : 'Detail Line',
    ]);
  });

  const wsStatement = XLSX.utils.aoa_to_sheet(statementAoa);
  XLSX.utils.book_append_sheet(wb, wsStatement, 'Profit & Loss Statement');

  // SHEET 2: Operating Expense Breakdown
  const expenseAoa: any[][] = [
    [companyName.toUpperCase()],
    ['OPERATING EXPENSE ANALYSIS BY CATEGORY'],
    [`Period: ${report.current.range.periodBadge}`],
    [],
    ['Category', 'Amount (INR)', '% of Operating Expenses', 'Entry Count'],
  ];

  report.current.operatingExpenses.categories.forEach((cat) => {
    expenseAoa.push([
      cat.category,
      cat.amount,
      `${cat.percentage}%`,
      cat.count,
    ]);
  });

  expenseAoa.push([
    'TOTAL OPERATING EXPENSES',
    report.current.operatingExpenses.totalExpenses,
    '100.0%',
    report.current.operatingExpenses.categories.reduce((s, c) => s + c.count, 0),
  ]);

  const wsExpense = XLSX.utils.aoa_to_sheet(expenseAoa);
  XLSX.utils.book_append_sheet(wb, wsExpense, 'Expense Breakdown');

  // SHEET 3: COGS Analysis (Products Sold)
  const cogsAoa: any[][] = [
    [companyName.toUpperCase()],
    ['COGS ANALYSIS — PRODUCTS ACTUALLY SOLD'],
    [`Period: ${report.current.range.periodBadge}`],
    [],
    ['Product Name', 'SKU / Part Number', 'Quantity Sold', 'Unit Cost (INR)', 'Total COGS (INR)', 'Sales Value (INR)', 'Realized Gross Profit (INR)'],
  ];

  report.current.cogs.topContributingProducts.forEach((prod) => {
    cogsAoa.push([
      prod.productName,
      prod.sku || 'N/A',
      prod.quantitySold,
      prod.unitCost,
      prod.totalCost,
      prod.salesValue,
      prod.profit,
    ]);
  });

  cogsAoa.push([
    'TOTAL COGS SUMMARY',
    '—',
    report.current.cogs.topContributingProducts.reduce((s, p) => s + p.quantitySold, 0),
    '—',
    report.current.cogs.totalCogs,
    report.current.cogs.topContributingProducts.reduce((s, p) => s + p.salesValue, 0),
    report.current.grossProfit.grossProfit,
  ]);

  const wsCogs = XLSX.utils.aoa_to_sheet(cogsAoa);
  XLSX.utils.book_append_sheet(wb, wsCogs, 'COGS Analysis');

  const companySlug = sanitizeFilename(companyName);
  const dateSlug = `${report.current.range.startDateStr}_to_${report.current.range.endDateStr}`;
  XLSX.writeFile(wb, `VISTAAR_${companySlug}_ProfitLoss_${dateSlug}.xlsx`);
}
