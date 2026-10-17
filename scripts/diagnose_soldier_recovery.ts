import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

import { supabaseAuthService } from '../src/services/supabaseAuth';

async function diagnose() {
  console.log('=== INVESTIGATING SOLDIER INVOICE & PERSISTED DATA ===\n');

  // Authenticate first
  const loginRes = await supabaseAuthService.login('admin@vistaar.com', 'Vistaar@2026Secure');
  console.log('Admin login result:', loginRes.success, loginRes.error, loginRes.userProfile?.email);
  const wsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
  console.log('Authoritative workspace ID:', wsId);

  console.log('--- 1. Searching Customers ---');
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('*')
    .ilike('name', '%soldier%');
  console.log('Customer search (soldier):', customers, custErr);

  // All customers
  const { data: allCusts } = await supabase.from('customers').select('id, name, phone, balance, workspace_id').limit(20);
  console.log('Sample all customers:', allCusts);

  // 2. Search invoices
  console.log('\n--- 2. Searching Invoices for Soldier or ~87,000 ---');
  const { data: invSoldier, error: invErr1 } = await supabase
    .from('invoices')
    .select('*')
    .ilike('customer_name', '%soldier%');
  console.log('Invoices customer_name like Soldier:', invSoldier, invErr1);

  const { data: invAmount, error: invErr2 } = await supabase
    .from('invoices')
    .select('*')
    .gte('grand_total', 80000)
    .lte('grand_total', 95000);
  console.log('Invoices grand_total ~87,000:', invAmount, invErr2);

  // Recent invoices
  const { data: recentInvoices, error: recErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, customer_name, grand_total, paid_amount, balance_amount, status, created_at, workspace_id')
    .order('created_at', { ascending: false })
    .limit(15);
  console.log('Recent 15 Invoices in DB:', recentInvoices, recErr);

  // 3. Search payments
  console.log('\n--- 3. Searching Payments ---');
  const { data: payments, error: payErr } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(15);
  console.log('Recent 15 Payments:', payments, payErr);

  // Search payments ~87,000
  const { data: paymentsAmount, error: payAmtErr } = await supabase
    .from('payments')
    .select('*')
    .gte('amount', 80000)
    .lte('amount', 95000);
  console.log('Payments ~87,000:', paymentsAmount, payAmtErr);

  // 4. Search counter sales
  console.log('\n--- 4. Searching Counter Sales ---');
  const { data: counterSales, error: csErr } = await supabase
    .from('counter_sales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent Counter Sales:', counterSales, csErr);

  // 5. Search daybook entries
  console.log('\n--- 5. Searching Daybook Entries ---');
  const { data: daybook, error: dbErr } = await supabase
    .from('daybook_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent Daybook entries:', daybook, dbErr);

  // 6. Search cashbook entries
  console.log('\n--- 6. Searching Cashbook Entries ---');
  const { data: cashbook, error: cbErr } = await supabase
    .from('cashbook_entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent Cashbook entries:', cashbook, cbErr);

  // 7. Search udhari records & payments
  console.log('\n--- 7. Searching Udhari records ---');
  const { data: udhari, error: udErr } = await supabase
    .from('udhari_records')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent Udhari records:', udhari, udErr);

  // 8. Search quotations
  console.log('\n--- 8. Searching Quotations ---');
  const { data: quotes, error: qErr } = await supabase
    .from('quotations')
    .select('*')
    .ilike('customer_name', '%soldier%');
  console.log('Quotations for soldier:', quotes, qErr);

  // 9. Workspaces and branches
  console.log('\n--- 9. Workspaces & Branches ---');
  const { data: workspaces } = await supabase.from('workspaces').select('*');
  console.log('Workspaces:', workspaces);

  const { data: branches } = await supabase.from('branches').select('*');
  console.log('Branches:', branches);
}

diagnose();
