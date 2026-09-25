import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { SalaryPayment } from '../types/payroll';

export function formatInr(val: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(val || 0);
}

/**
 * Generates an audit-ready, professional corporate Payslip PDF
 */
export function downloadPayslipPdf(payment: SalaryPayment, businessSettings?: any): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const companyName = businessSettings?.legalName || businessSettings?.company_name || 'VISTAAR BUSINESS OS';
  const companyAddress = [
    businessSettings?.address,
    businessSettings?.city,
    businessSettings?.state ? `${businessSettings.state} - ${businessSettings.pincode || ''}` : '',
  ].filter(Boolean).join(', ');
  const companyPhone = businessSettings?.phone ? `Phone: ${businessSettings.phone}` : '';
  const companyEmail = businessSettings?.email ? `Email: ${businessSettings.email}` : '';
  const gstin = businessSettings?.gstin ? `GSTIN: ${businessSettings.gstin}` : '';

  // 1. Company Header
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(companyName.toUpperCase(), 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225); // slate-300
  const headerSub = [companyAddress, [companyPhone, companyEmail, gstin].filter(Boolean).join(' | ')].filter(Boolean).join('\n');
  if (headerSub) {
    doc.text(headerSub, 14, 18);
  }

  // 2. Payslip Title Bar
  doc.setFillColor(241, 245, 249); // slate-100
  doc.rect(14, 34, pageWidth - 28, 12, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, 34, pageWidth - 28, 12, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`PAYSLIP FOR ${payment.salaryPeriodLabel.toUpperCase()}`, 18, 41.5);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Ref: ${payment.referenceNo}`, pageWidth - 18, 41.5, { align: 'right' });

  // 3. Employee & Payment Information Grid
  autoTable(doc, {
    startY: 50,
    margin: { left: 14, right: 14 },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    body: [
      [
        { content: 'Employee Name:', styles: { fontStyle: 'bold', textColor: [100, 116, 139] } },
        { content: payment.employeeName, styles: { fontStyle: 'bold', textColor: [15, 23, 42] } },
        { content: 'Payment Date:', styles: { fontStyle: 'bold', textColor: [100, 116, 139] } },
        { content: payment.paymentDate, styles: { fontStyle: 'bold' } },
      ],
      [
        { content: 'Employee ID:', styles: { fontStyle: 'bold', textColor: [100, 116, 139] } },
        { content: payment.employeeCode, styles: { fontStyle: 'bold' } },
        { content: 'Payment Mode:', styles: { fontStyle: 'bold', textColor: [100, 116, 139] } },
        { content: payment.paymentMode },
      ],
      [
        { content: 'Department:', styles: { fontStyle: 'bold', textColor: [100, 116, 139] } },
        { content: payment.department || 'General' },
        { content: 'Salary Period:', styles: { fontStyle: 'bold', textColor: [100, 116, 139] } },
        { content: `${payment.salaryPeriodStart} to ${payment.salaryPeriodEnd}` },
      ],
      [
        { content: 'Designation:', styles: { fontStyle: 'bold', textColor: [100, 116, 139] } },
        { content: payment.designation || 'Staff' },
        { content: 'Payment Status:', styles: { fontStyle: 'bold', textColor: [100, 116, 139] } },
        {
          content: payment.status,
          styles: {
            fontStyle: 'bold',
            textColor: payment.status === 'PAID' ? [22, 101, 52] : [180, 83, 9],
          },
        },
      ],
    ],
  });

  const employeeGridBottom = (doc as any).lastAutoTable.finalY + 6;

  // 4. Earnings & Deductions Breakdown Table
  const earningsItems = (payment.items || []).filter((it) => it.itemType === 'EARNING');
  const deductionItems = (payment.items || []).filter((it) => it.itemType === 'DEDUCTION');

  // Fallback defaults if no itemized records exist
  const finalEarnings =
    earningsItems.length > 0
      ? earningsItems.map((e) => [e.itemName, formatInr(e.amount)])
      : [['Base Salary & Allowances', formatInr(payment.grossAmount)]];

  const finalDeductions =
    deductionItems.length > 0
      ? deductionItems.map((d) => [d.itemName, formatInr(d.amount)])
      : payment.deductionAmount > 0
      ? [['Deductions & Adjustments', formatInr(payment.deductionAmount)]]
      : [['Nil Deductions', '₹0.00']];

  // Align rows count for 2-column table
  const maxRows = Math.max(finalEarnings.length, finalDeductions.length);
  const tableBody: any[] = [];

  for (let i = 0; i < maxRows; i++) {
    const earn = finalEarnings[i] || ['', ''];
    const ded = finalDeductions[i] || ['', ''];
    tableBody.push([earn[0], earn[1], ded[0], ded[1]]);
  }

  // Add Totals row
  tableBody.push([
    { content: 'Total Gross Earnings', styles: { fontStyle: 'bold' } },
    { content: formatInr(payment.grossAmount), styles: { fontStyle: 'bold', textColor: [15, 23, 42] } },
    { content: 'Total Deductions', styles: { fontStyle: 'bold' } },
    { content: formatInr(payment.deductionAmount), styles: { fontStyle: 'bold', textColor: [225, 29, 72] } },
  ]);

  autoTable(doc, {
    startY: employeeGridBottom,
    margin: { left: 14, right: 14 },
    head: [['EARNINGS', 'AMOUNT', 'DEDUCTIONS', 'AMOUNT']],
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59], // slate-800
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 35, halign: 'right' },
      2: { cellWidth: 55 },
      3: { cellWidth: 35, halign: 'right' },
    },
  });

  const breakdownBottom = (doc as any).lastAutoTable.finalY + 6;

  // 5. Net Pay Highlight Box
  doc.setFillColor(248, 250, 252);
  doc.rect(14, breakdownBottom, pageWidth - 28, 20, 'F');
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.8);
  doc.rect(14, breakdownBottom, pageWidth - 28, 20, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text('NET SALARY PAYABLE / DISBURSED', 20, breakdownBottom + 8);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text('Take-Home Pay disbursed to employee account', 20, breakdownBottom + 14);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(22, 101, 52); // emerald-700
  doc.text(formatInr(payment.netAmount), pageWidth - 20, breakdownBottom + 12, { align: 'right' });

  // 6. Signature & Audit Footer
  const footerY = breakdownBottom + 38;

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(20, footerY, 70, footerY);
  doc.line(pageWidth - 70, footerY, pageWidth - 20, footerY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Employee Signature', 45, footerY + 5, { align: 'center' });
  doc.text('Authorized Signatory', pageWidth - 45, footerY + 5, { align: 'center' });

  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `This is a system-generated document issued by ${companyName}. Generated on ${new Date().toLocaleDateString('en-IN')}.`,
    pageWidth / 2,
    footerY + 16,
    { align: 'center' }
  );

  doc.save(`Payslip_${payment.employeeCode}_${payment.salaryPeriodLabel.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Exports complete Payroll Register to PDF
 */
export function downloadPayrollReportPdf(
  payments: SalaryPayment[],
  periodLabel: string,
  businessSettings?: any
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const companyName = businessSettings?.legalName || businessSettings?.company_name || 'VISTAAR BUSINESS OS';

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(companyName.toUpperCase(), 14, 10);

  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`PAYROLL DISBURSEMENT REPORT — ${periodLabel.toUpperCase()}`, 14, 16);

  const totalGross = payments.reduce((sum, p) => sum + p.grossAmount, 0);
  const totalDeductions = payments.reduce((sum, p) => sum + p.deductionAmount, 0);
  const totalNet = payments.reduce((sum, p) => sum + p.netAmount, 0);

  const bodyData = payments.map((p, idx) => [
    idx + 1,
    p.employeeCode,
    p.employeeName,
    p.department || '—',
    p.salaryPeriodLabel,
    formatInr(p.grossAmount),
    formatInr(p.deductionAmount),
    formatInr(p.netAmount),
    p.paymentDate,
    p.paymentMode,
    p.referenceNo,
    p.status,
  ]);

  autoTable(doc, {
    startY: 28,
    margin: { left: 14, right: 14 },
    head: [
      [
        '#',
        'Emp ID',
        'Employee Name',
        'Dept',
        'Period',
        'Gross (₹)',
        'Deductions (₹)',
        'Net Pay (₹)',
        'Date',
        'Mode',
        'Ref No',
        'Status',
      ],
    ],
    body: bodyData,
    foot: [
      [
        '',
        '',
        `Total (${payments.length} Employees)`,
        '',
        '',
        formatInr(totalGross),
        formatInr(totalDeductions),
        formatInr(totalNet),
        '',
        '',
        '',
        '',
      ],
    ],
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      fontSize: 8,
      fontStyle: 'bold',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontSize: 8,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
    },
    columnStyles: {
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
  });

  doc.save(`Payroll_Report_${periodLabel.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Exports complete Payroll Register to Excel XLSX
 */
export function downloadPayrollReportExcel(payments: SalaryPayment[], periodLabel: string): void {
  const wb = XLSX.utils.book_new();

  const dataRows = payments.map((p, idx) => ({
    'Sl No': idx + 1,
    'Employee ID': p.employeeCode,
    'Employee Name': p.employeeName,
    Department: p.department || '—',
    Designation: p.designation || '—',
    'Salary Period': p.salaryPeriodLabel,
    'Gross Pay (INR)': p.grossAmount,
    'Deductions (INR)': p.deductionAmount,
    'Net Pay (INR)': p.netAmount,
    'Payment Date': p.paymentDate,
    'Payment Mode': p.paymentMode,
    'Reference No': p.referenceNo,
    Status: p.status,
    'Transaction Type': p.transactionType,
    Notes: p.notes || '',
  }));

  const totalGross = payments.reduce((sum, p) => sum + p.grossAmount, 0);
  const totalDeductions = payments.reduce((sum, p) => sum + p.deductionAmount, 0);
  const totalNet = payments.reduce((sum, p) => sum + p.netAmount, 0);

  // Summary Row
  dataRows.push({
    'Sl No': '' as any,
    'Employee ID': '',
    'Employee Name': 'TOTAL',
    Department: '',
    Designation: '',
    'Salary Period': `${payments.length} records`,
    'Gross Pay (INR)': totalGross,
    'Deductions (INR)': totalDeductions,
    'Net Pay (INR)': totalNet,
    'Payment Date': '',
    'Payment Mode': '',
    'Reference No': '',
    Status: '' as any,
    'Transaction Type': '' as any,
    Notes: '',
  });

  const ws = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Payroll Register');

  XLSX.writeFile(wb, `Payroll_Register_${periodLabel.replace(/\s+/g, '_')}.xlsx`);
}

/**
 * Downloads a sample pre-formatted Excel template for Bulk Employee Import
 */
export function downloadEmployeeImportTemplate(): void {
  const wb = XLSX.utils.book_new();

  const templateRows = [
    {
      'Employee ID': 'VST-EMP-001',
      'Full Name': 'Rahul Sharma',
      Phone: '9820011223',
      Email: 'rahul@example.com',
      Department: 'Sales',
      Designation: 'Sales Executive',
      'Joining Date': '2026-01-15',
      'Employment Type': 'Full Time',
      'Employment Status': 'Active',
      'Base Salary': 30000,
    },
    {
      'Employee ID': 'VST-EMP-002',
      'Full Name': 'Priya Patel',
      Phone: '9820099887',
      Email: 'priya@example.com',
      Department: 'Accounts',
      Designation: 'Executive Accountant',
      'Joining Date': '2026-02-01',
      'Employment Type': 'Full Time',
      'Employment Status': 'Active',
      'Base Salary': 28000,
    },
    {
      'Employee ID': 'VST-EMP-003',
      'Full Name': 'Amit Verma',
      Phone: '9876543210',
      Email: '',
      Department: 'Operations',
      Designation: 'Operations Executive',
      'Joining Date': '2026-03-01',
      'Employment Type': 'Full Time',
      'Employment Status': 'Active',
      'Base Salary': 25000,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateRows);
  // Column widths
  ws['!cols'] = [
    { wch: 15 },
    { wch: 22 },
    { wch: 16 },
    { wch: 25 },
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Employees Template');
  XLSX.writeFile(wb, 'VISTAAR_Employee_Import_Template.xlsx');
}

/**
 * Downloads a spreadsheet of failed/invalid employee import rows with specific error notes
 */
export function downloadEmployeeErrorReport(
  errors: { row: number; employeeId: string; name: string; error: string; data?: any }[]
): void {
  const wb = XLSX.utils.book_new();

  const dataRows = errors.map((e) => ({
    'Row #': e.row,
    'Employee ID': e.employeeId || '—',
    'Full Name': e.name || '—',
    'Error Reason': e.error,
    Phone: e.data?.phone || '',
    Email: e.data?.email || '',
    Department: e.data?.department || '',
    Designation: e.data?.designation || '',
  }));

  const ws = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Import Errors');
  XLSX.writeFile(wb, `Employee_Import_Error_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Exports complete Employee Directory to Excel
 */
export function downloadEmployeeDirectoryExcel(
  employees: any[],
  salaryMap: Map<string, any>
): void {
  const wb = XLSX.utils.book_new();

  const dataRows = employees.map((emp, idx) => {
    const s = salaryMap.get(emp.id);
    return {
      'Sl No': idx + 1,
      'Employee ID': emp.employeeId,
      'Full Name': emp.name,
      Phone: emp.phone || '—',
      Email: emp.email || '—',
      Department: emp.department || '—',
      Designation: emp.designation || '—',
      'Employment Type': emp.employmentType || 'Full Time',
      Status: emp.status || 'Active',
      'Joining Date': emp.joiningDate || '—',
      'Current Monthly Salary (INR)': s ? s.baseSalary + (s.hraAllowance || 0) + (s.otherAllowances || 0) : 'Not Configured',
      'Payment Mode': s?.paymentMode || '—',
      'Bank Account': s?.bankAccountNo ? `••••${s.bankAccountNo.slice(-4)}` : (s?.upiId || '—'),
      Archived: emp.isArchived ? 'Yes' : 'No',
    };
  });

  const ws = XLSX.utils.json_to_sheet(dataRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Employee Directory');
  XLSX.writeFile(wb, `Employee_Directory_${new Date().toISOString().split('T')[0]}.xlsx`);
}

