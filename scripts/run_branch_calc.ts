import * as fs from 'fs';
import { FinancialAnalyticsEngine } from '../src/services/analytics/financialAnalyticsEngine.ts';

const input = JSON.parse(fs.readFileSync('scripts/live_workspace_engine_input.json', 'utf8'));

function isRecordInBranch(targetBranchId: string, recordBranchId?: string, notes?: string): boolean {
  if (!targetBranchId || targetBranchId === 'ALL') return true;
  if (recordBranchId && recordBranchId.toLowerCase().trim() === targetBranchId.toLowerCase().trim()) return true;
  if (notes) {
    const match = notes.match(/\[branch:\s*([a-f0-9-]+)\]/i);
    if (match && match[1].toLowerCase().trim() === targetBranchId.toLowerCase().trim()) return true;
  }
  return false;
}

const branches = [
  { name: 'ALL BRANCHES', id: 'ALL' },
  { name: 'North Branch (4330d620)', id: '4330d620-c0f8-4261-905b-7386b7e82520' },
  { name: 'Branch 398bd10a', id: '398bd10a-903e-47ff-8c47-3261f683ef40' },
  { name: 'Main Branch (unassigned / null)', id: 'null' },
];

for (const b of branches) {
  let invoices = input.invoices;
  let counterSales = input.counterSales;
  let payments = input.payments;
  let udhariRecords = input.udhariRecords;
  let udhariPayments = input.udhariPayments;
  let expenses = input.expenses;

  if (b.id !== 'ALL') {
    if (b.id === 'null') {
      // Main branch represents records with null branch_id and no branch note
      invoices = invoices.filter((r: any) => !r.branch_id && !r.snapshot?.branch_id && !String(r.notes || '').includes('[branch:'));
      counterSales = counterSales.filter((r: any) => !r.branch_id && !r.snapshot?.branch_id && !String(r.notes || '').includes('[branch:'));
      payments = payments.filter((r: any) => !r.branch_id && !r.snapshot?.branch_id && !String(r.notes || '').includes('[branch:'));
      udhariRecords = udhariRecords.filter((r: any) => !r.branch_id && !r.snapshot?.branch_id && !String(r.notes || '').includes('[branch:'));
      expenses = expenses.filter((r: any) => !r.branch_id && !r.snapshot?.branch_id && !String(r.notes || '').includes('[branch:'));
    } else {
      invoices = invoices.filter((r: any) => isRecordInBranch(b.id, r.branch_id || r.snapshot?.branch_id, r.notes));
      counterSales = counterSales.filter((r: any) => isRecordInBranch(b.id, r.branch_id || r.snapshot?.branch_id, r.notes));
      payments = payments.filter((r: any) => isRecordInBranch(b.id, r.branch_id || r.snapshot?.branch_id, r.notes));
      udhariRecords = udhariRecords.filter((r: any) => isRecordInBranch(b.id, r.branch_id || r.snapshot?.branch_id, r.notes));
      expenses = expenses.filter((r: any) => isRecordInBranch(b.id, r.branch_id || r.snapshot?.branch_id, r.notes));
    }
  }

  const res = FinancialAnalyticsEngine.calculate({
    ...input,
    branchId: b.id,
    invoices,
    counterSales,
    payments,
    udhariRecords,
    udhariPayments,
    expenses
  });

  console.log('\n=== ' + b.name + ' ===');
  console.log('Total Sales:         ₹' + res.kpis.totalSales.toFixed(2));
  console.log('Collections:         ₹' + res.kpis.collections.toFixed(2));
  console.log('Cash Collections:    ₹' + res.kpis.cashCollections.toFixed(2));
  console.log('UPI Collections:     ₹' + res.kpis.upiCollections.toFixed(2));
  console.log('Gross Profit:        ₹' + res.kpis.grossProfit.toFixed(2));
  console.log('Outstanding Udhari:  ₹' + res.kpis.outstandingUdhari.toFixed(2));
  console.log('Invoices Count:      ' + res.kpis.invoiceCount);
  console.log('Counter Sales Count: ' + res.kpis.counterSaleCount);
}
