import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== VISTAAR FORENSIC AUDIT — SUPABASE DATA SOURCE ===');

  // 1. Workspaces
  const { data: workspaces, error: wsErr } = await supabase.from('workspaces').select('*');
  console.log('\n[1] Workspaces in DB:');
  if (wsErr) console.error('Error fetching workspaces:', wsErr.message);
  else console.log(workspaces);

  // 2. Workspace Memberships
  const { data: memberships, error: memErr } = await supabase.from('workspace_memberships').select('*');
  console.log('\n[2] Workspace Memberships:');
  if (memErr) console.error('Error fetching memberships:', memErr.message);
  else console.log(memberships);

  // 3. Invoices
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, workspace_id, invoice_number, customer_name, status, date, grand_total, paid_amount, balance_amount, created_at, notes, terms')
    .order('created_at', { ascending: false });
  console.log(`\n[3] Invoices total count: ${invoices?.length || 0}`);
  if (invErr) console.error('Error fetching invoices:', invErr.message);
  else {
    invoices?.forEach(inv => {
      console.log(`  - [${inv.status}] ${inv.invoice_number} | ₹${inv.grand_total} (paid ₹${inv.paid_amount}, bal ₹${inv.balance_amount}) | Date: ${inv.date} | Created: ${inv.created_at} | WS: ${inv.workspace_id} | ID: ${inv.id}`);
    });
  }

  // 4. Quotations
  const { data: quotations, error: qtErr } = await supabase
    .from('quotations')
    .select('id, workspace_id, quotation_number, customer_name, status, date, valid_until, grand_total, converted_invoice_id, created_at')
    .order('created_at', { ascending: false });
  console.log(`\n[4] Quotations total count: ${quotations?.length || 0}`);
  if (qtErr) console.error('Error fetching quotations:', qtErr.message);
  else {
    quotations?.forEach(qt => {
      console.log(`  - [${qt.status}] ${qt.quotation_number} | ₹${qt.grand_total} | Date: ${qt.date} | Converted: ${qt.converted_invoice_id} | Created: ${qt.created_at} | WS: ${qt.workspace_id} | ID: ${qt.id}`);
    });
  }

  // 5. Counter Sales
  const { data: counterSales, error: csErr } = await supabase
    .from('counter_sales')
    .select('id, workspace_id, sale_number, invoice_number, sale_date, final_total, amount_received, balance_amount, payment_method, status, created_at')
    .order('created_at', { ascending: false });
  console.log(`\n[5] Counter Sales total count: ${counterSales?.length || 0}`);
  if (csErr) console.error('Error fetching counter sales:', csErr.message);
  else {
    counterSales?.forEach(cs => {
      console.log(`  - [${cs.status}] ${cs.sale_number} (Inv: ${cs.invoice_number}) | ₹${cs.final_total} (rcvd ₹${cs.amount_received}) | Method: ${cs.payment_method} | Date: ${cs.sale_date} | Created: ${cs.created_at} | WS: ${cs.workspace_id} | ID: ${cs.id}`);
    });
  }

  // 6. Payments
  const { data: payments, error: payErr } = await supabase
    .from('payments')
    .select('id, workspace_id, invoice_id, invoice_number, customer_name, amount, payment_date, method, reference_no, notes, created_at')
    .order('created_at', { ascending: false });
  console.log(`\n[6] Payments total count: ${payments?.length || 0}`);
  if (payErr) console.error('Error fetching payments:', payErr.message);
  else {
    payments?.forEach(p => {
      console.log(`  - Payment ${p.id} | ₹${p.amount} | Method: ${p.method} | Inv: ${p.invoice_number} (id: ${p.invoice_id}) | Date: ${p.payment_date} | Created: ${p.created_at} | WS: ${p.workspace_id} | Notes: ${p.notes}`);
    });
  }

  // 7. Udhari Records & Payments
  const { data: udhari, error: udhErr } = await supabase.from('udhari_records').select('*');
  console.log(`\n[7] Udhari Records count: ${udhari?.length || 0}`);
  const { data: udhariPay, error: udhPayErr } = await supabase.from('udhari_payments').select('*');
  console.log(`[8] Udhari Payments count: ${udhariPay?.length || 0}`);
  if (udhariPay?.length) {
    udhariPay.forEach(up => {
      console.log(`  - Udhari Payment ${up.id} | ₹${up.amount} | Method: ${up.payment_method} | Date: ${up.payment_date} | WS: ${up.workspace_id}`);
    });
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error in forensic audit:', err);
  process.exit(1);
});
