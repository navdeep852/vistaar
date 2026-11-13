import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));
const supabase = createClient('https://kluxsykimnjivkqxelba.supabase.co', 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${authData.access_token}` } },
});

async function main() {
  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  const { data: cs } = await supabase.from('counter_sales').select('*');
  console.log('--- Counter Sales Details ---');
  cs?.forEach(c => {
    console.log({
      id: c.id,
      sale_number: c.sale_number,
      invoice_number: c.invoice_number,
      final_total: c.final_total,
      amount_received: c.amount_received,
      payment_method: c.payment_method,
      status: c.status,
      sale_date: c.sale_date,
      created_at: c.created_at,
      branch_id: c.branch_id,
      notes: c.notes,
    });
  });
}

main().catch(console.error);
