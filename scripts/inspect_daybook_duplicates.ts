import { supabase, isSupabaseConfigured } from '../src/lib/supabase';

async function main() {
  if (!isSupabaseConfigured()) {
    console.log('Supabase is not configured.');
    return;
  }

  const { data: txs, error } = await supabase
    .from('daybook_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching daybook_transactions:', error);
    return;
  }

  console.log(`Fetched ${txs?.length || 0} recent daybook transactions.`);
  for (const t of txs || []) {
    console.log({
      id: t.id,
      code: t.transaction_code,
      date: t.transaction_date,
      type: t.transaction_type,
      refType: t.reference_type,
      refNo: t.reference_number,
      amount: t.amount,
      total: t.total_amount,
      remaining: t.remaining_amount,
      status: t.payment_status,
      party: t.party_name,
      desc: t.description,
      created_at: t.created_at,
    });
  }
}

main().catch(console.error);

