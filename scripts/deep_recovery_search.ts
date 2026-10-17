import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

async function deepSearch() {
  console.log('====================================================');
  console.log('   DEEP FORENSIC SEARCH FOR SOLDIER & ₹87,000 DATA  ');
  console.log('====================================================\n');

  // 1. Search all JSON files in the project
  console.log('--- 1. Searching local JSON & Log files ---');
  const filesToScan = [
    'data/store.json',
    'data/backups/store.json.bak',
    'data/backups/local_storage_backup.json',
    'test_results.log',
  ];

  for (const f of filesToScan) {
    const fullPath = path.resolve(process.cwd(), f);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const hasSoldier = content.toLowerCase().includes('soldier');
      const has87 = content.includes('87000') || content.includes('87,000');
      console.log(`File: ${f} -> Contains "soldier": ${hasSoldier}, Contains "87000": ${has87}`);
      if (hasSoldier || has87) {
        console.log(`[MATCH FOUND IN ${f}]`);
      }
    }
  }

  // 2. Search Supabase invoices (all records, no workspace filter)
  console.log('\n--- 2. Direct Supabase Query: Invoices ---');
  const { data: allInvoices, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`Total invoices in DB: ${allInvoices?.length || 0}`, invErr ? `Error: ${invErr.message}` : '');
  if (allInvoices && allInvoices.length > 0) {
    for (const inv of allInvoices) {
      console.log(`Invoice #${inv.invoice_number}: ${inv.customer_name} | Total: ${inv.grand_total} | Paid: ${inv.paid_amount} | Date: ${inv.date} | Status: ${inv.status} | WS: ${inv.workspace_id}`);
    }
  }

  // 3. Search Supabase payments (all records)
  console.log('\n--- 3. Direct Supabase Query: Payments ---');
  const { data: allPayments, error: payErr } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`Total payments in DB: ${allPayments?.length || 0}`, payErr ? `Error: ${payErr.message}` : '');
  if (allPayments && allPayments.length > 0) {
    for (const p of allPayments) {
      console.log(`Payment #${p.payment_number || p.id}: ${p.customer_name} | Amount: ${p.amount} | Date: ${p.payment_date} | Method: ${p.method} | WS: ${p.workspace_id}`);
    }
  }

  // 4. Search Supabase customers
  console.log('\n--- 4. Direct Supabase Query: Customers ---');
  const { data: allCustomers, error: custErr } = await supabase
    .from('customers')
    .select('*');

  console.log(`Total customers in DB: ${allCustomers?.length || 0}`, custErr ? `Error: ${custErr.message}` : '');
  if (allCustomers && allCustomers.length > 0) {
    for (const c of allCustomers) {
      console.log(`Customer: "${c.name}" | Phone: ${c.phone} | Balance: ${c.balance} | WS: ${c.workspace_id}`);
    }
  }

  // 5. Search Supabase daybook_transactions
  console.log('\n--- 5. Direct Supabase Query: Daybook Transactions ---');
  const { data: allDaybook, error: dbErr } = await supabase
    .from('daybook_transactions')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`Total daybook transactions in DB: ${allDaybook?.length || 0}`, dbErr ? `Error: ${dbErr.message}` : '');
  if (allDaybook && allDaybook.length > 0) {
    for (const d of allDaybook) {
      console.log(`Daybook ${d.transaction_type}: ${d.party_name} | Inflow: ${d.amount} | Total: ${d.total_amount} | Date: ${d.transaction_date}`);
    }
  }

  // 6. Search Supabase quotations
  console.log('\n--- 6. Direct Supabase Query: Quotations ---');
  const { data: allQuotations, error: qErr } = await supabase
    .from('quotations')
    .select('*');

  console.log(`Total quotations in DB: ${allQuotations?.length || 0}`, qErr ? `Error: ${qErr.message}` : '');
  if (allQuotations && allQuotations.length > 0) {
    for (const q of allQuotations) {
      console.log(`Quotation #${q.quotation_number}: ${q.customer_name} | Total: ${q.grand_total} | Status: ${q.status}`);
    }
  }
}

deepSearch();
