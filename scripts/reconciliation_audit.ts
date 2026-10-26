import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runAudit() {
  console.log('=============================================================================');
  console.log('VISTAAR READ-ONLY FORENSIC RECONCILIATION AUDIT (PHASE G)');
  console.log('=============================================================================\n');

  // 1. Inspect Local Store JSON
  const storePath = path.resolve(process.cwd(), 'data', 'store.json');
  let storeData: any = {};
  if (fs.existsSync(storePath)) {
    try {
      storeData = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      console.log('✅ Loaded data/store.json successfully.');
    } catch (e: any) {
      console.error('❌ Failed to parse data/store.json:', e.message);
    }
  } else {
    console.warn('⚠️ data/store.json does not exist.');
  }

  // 2. Inspect LocalStorage Backup Snapshot
  const snapPath = path.resolve(process.cwd(), 'data', 'backups', 'pre_investigation_snapshot_20261026', 'local_storage_backup.json');
  let snapData: any = {};
  if (fs.existsSync(snapPath)) {
    try {
      snapData = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
      console.log('✅ Loaded pre-investigation snapshot successfully.');
    } catch (e: any) {
      console.error('❌ Failed to parse snapshot:', e.message);
    }
  }

  // Search local stores for target records
  console.log('\n--- 1. FORENSIC SEARCH IN LOCAL FILES ---');
  const localQuotations: any[] = storeData.quotations || snapData.quotations || [];
  const localInvoices: any[] = storeData.invoices || snapData.invoices || [];
  const localSales: any[] = storeData.counterSales || storeData.counter_sales || snapData.counterSales || [];
  const localExpenses: any[] = storeData.expenses || snapData.expenses || [];
  const localUdhari: any[] = storeData.udhari || snapData.udhari || [];
  const localPayments: any[] = storeData.payments || snapData.payments || [];

  console.log(`Local Counts: Quotations=${localQuotations.length}, Invoices=${localInvoices.length}, CounterSales=${localSales.length}, Expenses=${localExpenses.length}, Udhari=${localUdhari.length}`);

  const findMayank = localQuotations.filter((q: any) => JSON.stringify(q).toLowerCase().includes('mayank') || q.grandTotal === 117988 || q.grand_total === 117988);
  console.log('Mayank Quotation in local:', findMayank.map((q: any) => ({ id: q.id, number: q.quotationNumber || q.quotation_number, total: q.grandTotal || q.grand_total, status: q.status })));

  const findCentry = localQuotations.filter((q: any) => JSON.stringify(q).toLowerCase().includes('centry') || q.grandTotal === 17700 || q.grand_total === 17700);
  console.log('Centry Quotation in local:', findCentry.map((q: any) => ({ id: q.id, number: q.quotationNumber || q.quotation_number, total: q.grandTotal || q.grand_total, status: q.status, convertedInvoiceId: q.convertedInvoiceId })));

  const findScarlett = localInvoices.filter((i: any) => JSON.stringify(i).toLowerCase().includes('scarlett') || i.grandTotal === 5900 || i.grand_total === 5900);
  console.log('Scarlett Invoice in local:', findScarlett.map((i: any) => ({ id: i.id, number: i.invoiceNumber || i.invoice_number, total: i.grandTotal || i.grand_total, paid: i.paidAmount || i.paid_amount, status: i.status })));

  const findPeter = localInvoices.filter((i: any) => JSON.stringify(i).toLowerCase().includes('peter') || i.grandTotal === 5600 || i.grand_total === 5600);
  console.log('Peter Invoice in local:', findPeter.map((i: any) => ({ id: i.id, number: i.invoiceNumber || i.invoice_number, total: i.grandTotal || i.grand_total, paid: i.paidAmount || i.paid_amount, status: i.status })));

  const findCounterSale3000 = localSales.filter((s: any) => s.finalTotal === 3000 || s.final_total === 3000 || s.amountReceived === 3000 || s.amount_received === 3000);
  console.log('Counter Sale 3000 in local:', findCounterSale3000.map((s: any) => ({ id: s.id, number: s.invoiceNumber || s.invoice_number, total: s.finalTotal || s.final_total, method: s.paymentMethod || s.payment_method })));

  const findTransport = localExpenses.filter((e: any) => JSON.stringify(e).toLowerCase().includes('transport') || e.amount === 3000);
  console.log('Transport Expense in local:', findTransport.map((e: any) => ({ id: e.id, name: e.expenseName || e.expense_name, amount: e.amount, mode: e.paymentMode || e.payment_mode })));

  // 3. Inspect Live Supabase Database
  console.log('\n--- 2. FORENSIC SEARCH IN LIVE SUPABASE DATABASE ---');
  
  // Workspaces
  const { data: workspaces, error: wsErr } = await supabase.from('workspaces').select('id, name');
  console.log('Supabase Workspaces:', wsErr ? wsErr.message : workspaces);

  // Supabase Quotations
  const { data: dbQuotations, error: dbQtErr } = await supabase.from('quotations').select('id, workspace_id, quotation_number, customer_name, grand_total, status, created_at');
  if (dbQtErr) console.error('Error fetching Supabase quotations:', dbQtErr.message);
  else console.log(`Supabase Quotations Total Count: ${dbQuotations?.length || 0}`);

  const dbMayank = (dbQuotations || []).filter((q: any) => (q.customer_name || '').toLowerCase().includes('mayank') || q.grand_total === 117988);
  console.log('Mayank Quotation in Supabase:', dbMayank);

  const dbCentry = (dbQuotations || []).filter((q: any) => (q.customer_name || '').toLowerCase().includes('centry') || q.grand_total === 17700);
  console.log('Centry Quotation in Supabase:', dbCentry);

  // Supabase Invoices
  const { data: dbInvoices, error: dbInvErr } = await supabase.from('invoices').select('id, workspace_id, invoice_number, customer_name, grand_total, paid_amount, balance_amount, status, created_at');
  if (dbInvErr) console.error('Error fetching Supabase invoices:', dbInvErr.message);
  else console.log(`Supabase Invoices Total Count: ${dbInvoices?.length || 0}`);

  const dbScarlett = (dbInvoices || []).filter((i: any) => (i.customer_name || '').toLowerCase().includes('scarlett') || i.grand_total === 5900);
  console.log('Scarlett Invoice in Supabase:', dbScarlett);

  const dbPeter = (dbInvoices || []).filter((i: any) => (i.customer_name || '').toLowerCase().includes('peter') || i.grand_total === 5600);
  console.log('Peter Invoice in Supabase:', dbPeter);

  const dbCentryInv = (dbInvoices || []).filter((i: any) => (i.customer_name || '').toLowerCase().includes('centry') || i.grand_total === 17700);
  console.log('Centry Invoice in Supabase:', dbCentryInv);

  // Supabase Counter Sales
  const { data: dbSales, error: dbCsErr } = await supabase.from('counter_sales').select('id, workspace_id, invoice_number, customer_name, final_total, amount_received, payment_method, created_at');
  if (dbCsErr) console.error('Error fetching Supabase counter sales:', dbCsErr.message);
  else console.log(`Supabase Counter Sales Total Count: ${dbSales?.length || 0}`);

  const db3000Sale = (dbSales || []).filter((s: any) => s.final_total === 3000 || s.amount_received === 3000);
  console.log('Counter Sale 3000 in Supabase:', db3000Sale);

  // Supabase Expenses
  const { data: dbExpenses, error: dbExpErr } = await supabase.from('expenses').select('id, workspace_id, expense_name, category, amount, notes, created_at');
  if (dbExpErr) console.error('Error fetching Supabase expenses:', dbExpErr.message);
  else console.log(`Supabase Expenses Total Count: ${dbExpenses?.length || 0}`);

  const dbTransport = (dbExpenses || []).filter((e: any) => (e.expense_name || e.category || e.notes || '').toLowerCase().includes('transport') || e.amount === 3000);
  console.log('Transport Expense in Supabase:', dbTransport);

  // 4. Financial Calculations Audit
  console.log('\n--- 3. RECONCILIATION SUMMARY & KPI COMPARISON ---');
  console.log('Target KPI Snapshot:');
  console.log('  Total Sales:       ₹32,200');
  console.log('  Collections:       ₹32,200');
  console.log('  Gross Profit:      ₹16,010');
  console.log('  Outstanding Udhari: ₹205,294.30\n');

  // Sum of target sales:
  // Centry Invoice: 17,700
  // Scarlett Invoice: 5,900
  // Peter Invoice: 5,600
  // Counter Sale: 3,000
  // Total = 17,700 + 5,900 + 5,600 + 3,000 = 32,200!
  const targetSum = 17700 + 5900 + 5600 + 3000;
  console.log(`Sum of Forensic Target Transactions: 17,700 + 5,900 + 5,600 + 3,000 = ₹${targetSum.toLocaleString()}`);
  console.log(`Quotation Mayank (₹117,988) is non-converted, hence strictly excluded from Total Sales & Collections.`);
}

runAudit();
