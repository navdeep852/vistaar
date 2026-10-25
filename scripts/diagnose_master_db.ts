import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- AUTHENTICATING AS admin@vistaar.com ---');
  let authRes = await supabase.auth.signInWithPassword({
    email: 'admin@vistaar.com',
    password: 'Vistaar@2026Secure',
  });
  if (authRes.error) {
    console.warn('admin@vistaar.com failed:', authRes.error.message);
    // try test_owner_workspace@vistaar.com
    authRes = await supabase.auth.signInWithPassword({
      email: 'test_owner_workspace@vistaar.com',
      password: 'Password123!@#',
    });
    if (authRes.error) {
      console.warn('test_owner_workspace failed:', authRes.error.message);
    }
  }

  console.log('Auth user:', authRes.data?.user?.id, authRes.data?.user?.email);

  console.log('\n--- 1. WORKSPACES ---');
  const { data: workspaces, error: wsErr } = await supabase.from('workspaces').select('*');
  if (wsErr) console.error('wsErr:', wsErr);
  else console.log('Workspaces count:', workspaces?.length, workspaces);

  console.log('\n--- 2. DAYBOOK TRANSACTIONS ---');
  const { data: daybook, error: dbErr } = await supabase.from('daybook_transactions').select('*').order('created_at', { ascending: false });
  if (dbErr) console.error('dbErr:', dbErr);
  else {
    console.log('Daybook transactions count:', daybook?.length);
    daybook?.forEach((t) => {
      console.log(`[${t.transaction_date}] [${t.transaction_type}] id: ${t.id} | code: ${t.transaction_code} | refType: ${t.reference_type} | refId: ${t.reference_id} | refNum: ${t.reference_number} | amt: ${t.amount} | tot: ${t.total_amount} | rem: ${t.remaining_amount} | party: ${t.party_name} | status: ${t.status}/${t.payment_status} | ws: ${t.workspace_id} | crAt: ${t.created_at}`);
    });
  }

  console.log('\n--- 3. QUOTATIONS ---');
  const { data: quotations, error: qtErr } = await supabase.from('quotations').select('*, quotation_items(*)').order('created_at', { ascending: false });
  if (qtErr) console.error('qtErr:', qtErr);
  else {
    console.log('Quotations count:', quotations?.length);
    quotations?.forEach((q) => {
      console.log(`[${q.date}] QT: ${q.quotation_number} (id: ${q.id}) | status: ${q.status} | total: ${q.grand_total} | customer: ${q.customer_name} | converted_inv: ${q.converted_invoice_id} | ws: ${q.workspace_id} | items: ${q.quotation_items?.length} | crAt: ${q.created_at}`);
    });
  }

  console.log('\n--- 4. INVOICES ---');
  const { data: invoices, error: invErr } = await supabase.from('invoices').select('*, invoice_items(*)').order('created_at', { ascending: false });
  if (invErr) console.error('invErr:', invErr);
  else {
    console.log('Invoices count:', invoices?.length);
    invoices?.forEach((i) => {
      console.log(`[${i.date}] INV: ${i.invoice_number} (id: ${i.id}) | status: ${i.status} | total: ${i.grand_total} | paid: ${i.paid_amount} | bal: ${i.balance_amount} | customer: ${i.customer_name} | qt_id: ${i.quotation_id} | ws: ${i.workspace_id} | items: ${i.invoice_items?.length} | crAt: ${i.created_at}`);
    });
  }

  console.log('\n--- 5. PAYMENTS ---');
  const { data: payments, error: payErr } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
  if (payErr) console.error('payErr:', payErr);
  else {
    console.log('Payments count:', payments?.length);
    payments?.forEach((p) => {
      console.log(`[${p.payment_date}] PAY: ${p.payment_number} (id: ${p.id}) | amt: ${p.amount} | inv_id: ${p.invoice_id} | inv_num: ${p.invoice_number} | method: ${p.method} | customer: ${p.customer_name} | ws: ${p.workspace_id} | crAt: ${p.created_at}`);
    });
  }

  console.log('\n--- 6. COUNTER SALES ---');
  const { data: cs, error: csErr } = await supabase.from('counter_sales').select('*').order('created_at', { ascending: false });
  if (csErr) console.error('csErr:', csErr);
  else {
    console.log('Counter sales count:', cs?.length);
    cs?.forEach((c) => {
      console.log(`[${c.sale_date}] CS: ${c.sale_number} / ${c.invoice_number} (id: ${c.id}) | status: ${c.status} | tot: ${c.final_total} | rec: ${c.amount_received} | bal: ${c.balance_amount} | party: ${c.customer_name} | method: ${c.payment_method} | ws: ${c.workspace_id}`);
    });
  }

  console.log('\n--- 7. PROFILES & WORKSPACE MEMBERS ---');
  const { data: profs } = await supabase.from('profiles').select('*');
  console.log('Profiles:', profs);
  const { data: wm } = await supabase.from('workspace_members').select('*');
  console.log('Workspace members:', wm);
}

run();
