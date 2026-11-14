import * as fs from 'fs';
import { FinancialAnalyticsEngine } from '../src/services/analytics/financialAnalyticsEngine.ts';

const input = JSON.parse(fs.readFileSync('scripts/live_workspace_engine_input.json', 'utf8'));
const result = FinancialAnalyticsEngine.calculate(input);

console.log('=== AUTHORITATIVE FINANCIAL ANALYTICS RESULT ===');
console.log('Workspace ID:       ', result.audit.workspaceId);
console.log('Reporting Period:   ', result.audit.reportingPeriod.startDateStr, 'to', result.audit.reportingPeriod.endDateStr);
console.log('\n--- KEY PERFORMANCE INDICATORS ---');
console.log('Total Sales:         ₹' + result.kpis.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
console.log('  - Invoice Sales:   ₹' + result.kpis.invoiceSales.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
console.log('  - Counter Sales:   ₹' + result.kpis.counterSales.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
console.log('Collections:         ₹' + result.kpis.collections.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
console.log('  - Cash:            ₹' + result.kpis.cashCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
console.log('  - UPI:             ₹' + result.kpis.upiCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
console.log('Gross Profit:        ₹' + result.kpis.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
console.log('Profit Margin:       ' + result.kpis.profitMarginPercent + '%');
console.log('Outstanding Udhari:  ₹' + result.kpis.outstandingUdhari.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
console.log('Overdue Udhari:      ₹' + result.kpis.overdueUdhari.toLocaleString('en-IN', { minimumFractionDigits: 2 }));
console.log('Total Transactions:  ' + result.kpis.totalTransactions);
console.log('  - Invoices:        ' + result.kpis.invoiceCount);
console.log('  - Counter Sales:   ' + result.kpis.counterSaleCount);

console.log('\n--- PAYMENT METHOD BREAKDOWN ---');
console.table(result.paymentBreakdown);

console.log('\n--- CHANNEL BREAKDOWN ---');
console.table(result.channelBreakdown);

console.log('\n--- AUDIT DETAILS ---');
console.log('Invoices:     ', result.audit.invoices);
console.log('Counter Sales:', result.audit.counterSales);
console.log('Payments:     ', result.audit.payments);
console.log('Udhari:       ', result.audit.udhariAudit);
console.log('Gross Profit: ', result.audit.grossProfitAudit);

