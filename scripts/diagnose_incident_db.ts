import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Testing counter_sales columns...');
  const { data: cs, error: csErr } = await supabase.from('counter_sales').select('id, workspace_id, status, final_total, sale_number, invoice_number, payment_method, amount_received, balance_amount, sale_date, created_at').limit(5);
  console.log('counter_sales test:', csErr ? csErr.message : 'SUCCESS', 'count:', cs?.length);

  const { error: bErr } = await supabase.from('counter_sales').select('branch_id').limit(1);
  console.log('counter_sales branch_id col exists?', bErr ? 'NO (' + bErr.message + ')' : 'YES');

  const { error: csiBErr } = await supabase.from('counter_sale_items').select('branch_id').limit(1);
  console.log('counter_sale_items branch_id col exists?', csiBErr ? 'NO (' + csiBErr.message + ')' : 'YES');

  const { error: invBErr } = await supabase.from('invoices').select('branch_id').limit(1);
  console.log('invoices branch_id col exists?', invBErr ? 'NO (' + invBErr.message + ')' : 'YES');

  const { error: invStkErr } = await supabase.from('invoices').select('is_stock_finalized').limit(1);
  console.log('invoices is_stock_finalized col exists?', invStkErr ? 'NO (' + invStkErr.message + ')' : 'YES');

  const { error: invItmBErr } = await supabase.from('invoice_items').select('branch_id').limit(1);
  console.log('invoice_items branch_id col exists?', invItmBErr ? 'NO (' + invItmBErr.message + ')' : 'YES');

  const { error: payBErr } = await supabase.from('payments').select('branch_id').limit(1);
  console.log('payments branch_id col exists?', payBErr ? 'NO (' + payBErr.message + ')' : 'YES');

  const { error: payCsErr } = await supabase.from('payments').select('counter_sale_id').limit(1);
  console.log('payments counter_sale_id col exists?', payCsErr ? 'NO (' + payCsErr.message + ')' : 'YES');

  const { error: smBErr } = await supabase.from('stock_movements').select('branch_id').limit(1);
  console.log('stock_movements branch_id col exists?', smBErr ? 'NO (' + smBErr.message + ')' : 'YES');

  const { error: dtBErr } = await supabase.from('daybook_transactions').select('branch_id').limit(1);
  console.log('daybook_transactions branch_id col exists?', dtBErr ? 'NO (' + dtBErr.message + ')' : 'YES');

  // Check RPCs
  const { error: rpcCsErr } = await supabase.rpc('finalize_counter_sale', { p_sale: {} });
  console.log('RPC finalize_counter_sale status:', rpcCsErr ? rpcCsErr.code + ' - ' + rpcCsErr.message : 'EXISTS');

  const { error: rpcInvErr } = await supabase.rpc('finalize_invoice_transaction', { p_payload: {} });
  console.log('RPC finalize_invoice_transaction status:', rpcInvErr ? rpcInvErr.code + ' - ' + rpcInvErr.message : 'EXISTS');

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
