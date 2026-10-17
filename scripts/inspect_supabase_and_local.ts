import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Inspecting Supabase counter_sales...');
  const { data: allSales, error: allErr } = await supabase.from('counter_sales').select('*');
  console.log('All counter_sales:', allSales?.length, 'error:', allErr);
  if (allSales && allSales.length > 0) {
    console.log(JSON.stringify(allSales, null, 2));
  }

  // Check columns by querying individual candidate columns
  const candidateCols = ['id', 'workspace_id', 'branch_id', 'customer_id', 'sale_number', 'invoice_number', 'customer_name', 'phone_number', 'sale_date', 'subtotal', 'discount_type', 'discount_value', 'discount_amount', 'final_total', 'status', 'payment_method', 'amount_received', 'balance_amount', 'payment_reference', 'payment_notes', 'notes', 'created_by', 'created_at', 'updated_at'];
  for (const col of candidateCols) {
    const { error } = await supabase.from('counter_sales').select(col).limit(1);
    console.log(`Column ${col}: ${error ? 'MISSING (' + error.message + ')' : 'EXISTS'}`);
  }

  // Check counter_sale_items columns
  console.log('\nInspecting counter_sale_items...');
  const { data: allItems, error: itemsErr } = await supabase.from('counter_sale_items').select('*');
  console.log('All counter_sale_items:', allItems?.length, 'error:', itemsErr);

  const candidateItemCols = ['id', 'workspace_id', 'counter_sale_id', 'product_id', 'branch_id', 'product_name_snapshot', 'part_number_snapshot', 'quantity', 'rate', 'amount', 'buy_price_snapshot', 'created_at'];
  for (const col of candidateItemCols) {
    const { error } = await supabase.from('counter_sale_items').select(col).limit(1);
    console.log(`Item Column ${col}: ${error ? 'MISSING (' + error.message + ')' : 'EXISTS'}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
