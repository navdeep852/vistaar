import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://kluxsykimnjivkqxelba.supabase.co', 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x');

async function test() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'mauryanavdeep852@gmail.com',
    password: 'Password123!@#'
  });
  console.log('Login result:', error ? error.message : 'SUCCESS');
  if (data?.user) {
    console.log('User id:', data.user.id, 'Email:', data.user.email);
    const { data: ws, error: wsErr } = await supabase.from('workspaces').select('*');
    console.log('Workspaces:', ws, wsErr);
    const { data: inv, error: invErr } = await supabase.from('invoices').select('id, invoice_number, grand_total, date, workspace_id');
    console.log('Invoices count:', inv?.length, invErr);
    if (inv?.length) console.log('Invoices:', inv);
    const { data: qt, error: qtErr } = await supabase.from('quotations').select('id, quotation_number, grand_total, date, workspace_id');
    console.log('Quotations count:', qt?.length, qtErr);
    if (qt?.length) console.log('Quotations:', qt);
  }
}

test().catch(console.error);
