import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));
const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      Authorization: `Bearer ${authData.access_token}`,
    },
  },
});

async function main() {
  console.log('=== AUTHENTICATED SUPABASE QUERY AS', authData.user?.email, '===');
  console.log('User ID:', authData.user?.id);

  // Set session on auth
  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  console.log('supabase.auth.getUser():', userRes?.user?.id, userRes?.user?.email, uErr?.message);

  const wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

  // 1. Workspaces
  const { data: ws, error: wsErr } = await supabase.from('workspaces').select('*');
  console.log('\n[1] Accessible Workspaces:', ws, wsErr?.message);

  // 2. Profiles
  const { data: profiles, error: pErr } = await supabase.from('profiles').select('*');
  console.log('\n[2] Profiles:', profiles, pErr?.message);

  // 3. Quotations
  const { data: quotations, error: qErr } = await supabase
    .from('quotations')
    .select('*, quotation_items(*)')
    .order('created_at', { ascending: false });
  console.log(`\n[3] Quotations in Supabase: count = ${quotations?.length || 0}`, qErr?.message || '');
  if (quotations && quotations.length > 0) {
    quotations.forEach(q => {
      console.log(`  - QT: ${q.quotation_number} | ID: ${q.id} | ₹${q.grand_total} | Status: ${q.status} | Date: ${q.date} | Cust: ${q.customer_name} | WS: ${q.workspace_id}`);
    });
  }

  // 4. Invoices
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .order('created_at', { ascending: false });
  console.log(`\n[4] Invoices in Supabase: count = ${invoices?.length || 0}`, invErr?.message || '');
  if (invoices && invoices.length > 0) {
    invoices.forEach(i => {
      console.log(`  - INV: ${i.invoice_number} | ID: ${i.id} | ₹${i.grand_total} (paid: ₹${i.paid_amount}, bal: ₹${i.balance_amount}) | Status: ${i.status} | Date: ${i.date} | Cust: ${i.customer_name} | WS: ${i.workspace_id}`);
    });
  }

  // 5. Counter Sales
  const { data: cs, error: csErr } = await supabase
    .from('counter_sales')
    .select('*, counter_sale_items(*)')
    .order('created_at', { ascending: false });
  console.log(`\n[5] Counter Sales in Supabase: count = ${cs?.length || 0}`, csErr?.message || '');
  if (cs && cs.length > 0) {
    cs.forEach(s => {
      console.log(`  - CS: ${s.sale_number} (Inv: ${s.invoice_number}) | ID: ${s.id} | ₹${s.final_total} (rcvd: ₹${s.amount_received}) | Method: ${s.payment_method} | Status: ${s.status} | Date: ${s.sale_date} | WS: ${s.workspace_id}`);
    });
  }

  // 6. Payments
  const { data: payments, error: payErr } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });
  console.log(`\n[6] Payments in Supabase: count = ${payments?.length || 0}`, payErr?.message || '');
  if (payments && payments.length > 0) {
    payments.forEach(p => {
      console.log(`  - Payment ID: ${p.id} | ₹${p.amount} | Method: ${p.method} | Inv: ${p.invoice_number} | Date: ${p.payment_date} | WS: ${p.workspace_id} | Notes: ${p.notes}`);
    });
  }

  // 7. Udhari
  const { data: udhari, error: uErr2 } = await supabase.from('udhari_records').select('*');
  console.log(`\n[7] Udhari Records in Supabase: count = ${udhari?.length || 0}`, uErr2?.message || '');
  const { data: udhariPay, error: upErr } = await supabase.from('udhari_payments').select('*');
  console.log(`\n[8] Udhari Payments in Supabase: count = ${udhariPay?.length || 0}`, upErr?.message || '');
}

main().catch(console.error);
