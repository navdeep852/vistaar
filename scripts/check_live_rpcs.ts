import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRpcs() {
  console.log('=== CHECKING RPCs ON LIVE SUPABASE ===\n');

  const rpcs = [
    'finalize_invoice_transaction',
    'finalize_invoice_stock',
    'post_customer_payment_atomic',
    'record_authoritative_customer_payment',
    'atomic_deduct_product_stock',
    'atomic_invoice_payment_finalization',
    'reconcile_invoice_stock',
    'current_user_workspace_id',
    'get_customer_udhari_history'
  ];

  for (const r of rpcs) {
    const { data, error } = await supabase.rpc(r as any, { p_payload: {} });
    console.log(`RPC ${r}:`, error ? `error ${error.code} - ${error.message}` : 'EXISTS / responded');
  }
}

checkRpcs();
