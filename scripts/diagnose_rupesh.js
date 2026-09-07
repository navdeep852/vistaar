const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectRupesh() {
  console.log('--- INVOICES matching Rupesh or INV-2026-0009 ---');
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .or('customer_name.ilike.%Rupesh%,invoice_number.ilike.%INV-2026-0009%');
  console.log('Invoices:', invoices, 'Err:', invErr);

  console.log('\n--- PAYMENTS matching Rupesh or INV-2026-0009 ---');
  const { data: payments, error: payErr } = await supabase
    .from('payments')
    .select('*')
    .or('customer_name.ilike.%Rupesh%,invoice_number.ilike.%INV-2026-0009%');
  console.log('Payments:', payments, 'Err:', payErr);

  console.log('\n--- UDHARI RECORDS matching Rupesh or 0009 ---');
  const { data: udhari, error: udhErr } = await supabase
    .from('udhari_records')
    .select('*')
    .or('customer_name_snapshot.ilike.%Rupesh%,udhari_code.ilike.%0009%');
  console.log('Udhari:', udhari, 'Err:', udhErr);

  console.log('\n--- DAYBOOK TRANSACTIONS matching Rupesh or 0009 ---');
  const { data: daybook, error: dayErr } = await supabase
    .from('daybook_transactions')
    .select('*')
    .or('party_name.ilike.%Rupesh%,reference_number.ilike.%INV-2026-0009%');
  console.log('Daybook:', daybook, 'Err:', dayErr);

  console.log('\n--- FOLLOW UPS matching Rupesh or 0009 ---');
  const { data: followups, error: folErr } = await supabase
    .from('follow_ups')
    .select('*')
    .or('customer_name.ilike.%Rupesh%,invoice_number.ilike.%INV-2026-0009%');
  console.log('Followups:', followups, 'Err:', folErr);
}

inspectRupesh();
