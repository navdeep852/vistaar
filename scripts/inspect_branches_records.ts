import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));
const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${authData.access_token}` } },
});

async function main() {
  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  const { data: qts } = await supabase.from('quotations').select('*');
  console.log('--- Quotations in Supabase ---');
  qts?.forEach(q => {
    console.log({
      id: q.id,
      number: q.quotation_number,
      customer: q.customer_name,
      status: q.status,
      date: q.date,
      grand_total: q.grand_total,
      branch_id: q.branch_id,
      snapshot_branch: q.snapshot?.branch_id || q.snapshot?.branchId,
      created_by: q.created_by,
      workspace_id: q.workspace_id,
    });
  });

  const { data: invs } = await supabase.from('invoices').select('*');
  console.log('\n--- Invoices in Supabase ---');
  invs?.forEach(i => {
    console.log({
      id: i.id,
      number: i.invoice_number,
      customer: i.customer_name,
      status: i.status,
      date: i.date,
      grand_total: i.grand_total,
      paid_amount: i.paid_amount,
      balance_amount: i.balance_amount,
      branch_id: (i as any).branch_id,
      snapshot_branch: (i as any).snapshot?.branch_id,
      created_by: (i as any).created_by,
      workspace_id: i.workspace_id,
      notes: i.notes,
    });
  });

  const { data: branches } = await supabase.from('branches').select('*');
  console.log('\n--- Branches in Supabase ---');
  console.log(branches);
}

main().catch(console.error);
