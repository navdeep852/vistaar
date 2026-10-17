import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log('=== CHECKING WORKSPACES ===');
  const { data: ws, error: wsErr } = await supabase.from('workspaces').select('*');
  console.log('Workspaces:', ws, wsErr);

  console.log('\n=== CHECKING INVOICES FOR TODAY (2026-10-17) ===');
  const { data: invs, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, grand_total, paid_amount, balance_amount, status, created_at')
    .gte('date', '2026-10-17')
    .lte('date', '2026-10-17');
  console.log('Invoices today count:', invs?.length, 'error:', invErr);
  if (invs && invs.length > 0) {
    console.log('Invoices sample:', invs);
    const sumTotal = invs.reduce((acc, i) => acc + Number(i.grand_total || 0), 0);
    const sumPaid = invs.reduce((acc, i) => acc + Number(i.paid_amount || 0), 0);
    console.log('Total grand_total sum:', sumTotal, 'paid_amount sum:', sumPaid);
  }

  console.log('\n=== CHECKING ALL INVOICES (RECENT 10) ===');
  const { data: allInvs, error: allInvErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, date, grand_total, paid_amount, balance_amount, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent invoices:', allInvs);

  console.log('\n=== CHECKING COUNTER SALES ===');
  const { data: cs, error: csErr } = await supabase
    .from('counter_sales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent counter sales:', cs, csErr);

  console.log('\n=== CHECKING PAYMENTS FOR TODAY ===');
  const { data: pays, error: payErr } = await supabase
    .from('payments')
    .select('*')
    .gte('payment_date', '2026-10-17')
    .lte('payment_date', '2026-10-17');
  console.log('Payments today:', pays, payErr);

  console.log('\n=== CHECKING ALL PAYMENTS (RECENT 10) ===');
  const { data: allPays, error: allPayErr } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Recent payments:', allPays, allPayErr);
}

checkData().catch(console.error);
