import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabase() {
  console.log('Testing Supabase tables...');
  try {
    const { data: prods, error: pErr } = await supabase.from('products').select('id, name, current_stock, sku, part_number').limit(5);
    console.log('Products:', { count: prods?.length, pErr, sample: prods?.[0] });

    const { data: branches, error: bErr } = await supabase.from('branches').select('*').limit(5);
    console.log('Branches:', { count: branches?.length, bErr, sample: branches?.[0] });

    const { data: bInv, error: biErr } = await supabase.from('branch_inventory').select('*').limit(5);
    console.log('Branch Inventory:', { count: bInv?.length, biErr, sample: bInv?.[0] });

    const { data: receipts, error: rErr } = await supabase.from('stock_receipts').select('id, product_id, branch_id, quantity_remaining').limit(5);
    console.log('Stock Receipts:', { count: receipts?.length, rErr, sample: receipts?.[0] });
  } catch (err) {
    console.error('Test error:', err);
  }
}

testSupabase();
