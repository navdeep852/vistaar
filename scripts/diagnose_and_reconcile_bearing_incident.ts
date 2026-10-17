import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== INCIDENT FORENSIC AUDIT: 100SS / BEARING (₹7,600, 20 units, testbranch) ===\n');

  // 1. Search products for Bearing or 100SS
  console.log('1. Searching Products for "Bearing" or "100SS"...');
  const { data: prods, error: prodErr } = await supabase
    .from('products')
    .select('id, name, sku, part_number, current_stock, buy_price, selling_price, workspace_id')
    .or('name.ilike.%bearing%,name.ilike.%100SS%,part_number.ilike.%100SS%,sku.ilike.%100SS%');

  if (prodErr) {
    console.error('Products query error:', prodErr.message);
  } else {
    console.log(`Found ${prods?.length || 0} matching product(s):`);
    console.table(prods);
  }

  // 2. Search Counter Sales
  console.log('\n2. Searching Counter Sales for ₹7,600 or "100SS"...');
  const { data: csList, error: csErr } = await supabase
    .from('counter_sales')
    .select('id, sale_number, invoice_number, customer_name, final_total, amount_received, balance_amount, status, sale_date, created_at, workspace_id')
    .or('final_total.eq.7600,customer_name.ilike.%100SS%,invoice_number.ilike.%100SS%,sale_number.ilike.%100SS%');

  if (csErr) {
    console.error('Counter sales query error:', csErr.message);
  } else {
    console.log(`Found ${csList?.length || 0} counter sale(s):`);
    console.table(csList);
  }

  // 3. Search Invoices
  console.log('\n3. Searching Invoices for ₹7,600 or "100SS"...');
  const { data: invList, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, customer_name, grand_total, paid_amount, balance_amount, status, date, created_at, workspace_id')
    .or('grand_total.eq.7600,customer_name.ilike.%100SS%,invoice_number.ilike.%100SS%');

  if (invErr) {
    console.error('Invoices query error:', invErr.message);
  } else {
    console.log(`Found ${invList?.length || 0} invoice(s):`);
    console.table(invList);
  }

  // 4. Search Stock Movements for quantity 20
  console.log('\n4. Searching Stock Movements for quantity 20 or Bearing product...');
  const { data: smList, error: smErr } = await supabase
    .from('stock_movements')
    .select('id, product_id, movement_type, quantity, notes, created_at, workspace_id')
    .order('created_at', { ascending: false })
    .limit(20);

  if (smErr) {
    console.error('Stock movements query error:', smErr.message);
  } else {
    console.log(`Found ${smList?.length || 0} recent stock movement(s):`);
    console.table(smList);
  }

  // 5. Search Payments
  console.log('\n5. Searching Payments for ₹7,600...');
  const { data: payList, error: payErr } = await supabase
    .from('payments')
    .select('id, customer_name, amount, payment_date, method, reference_no, notes, created_at, workspace_id')
    .eq('amount', 7600);

  if (payErr) {
    console.error('Payments query error:', payErr.message);
  } else {
    console.log(`Found ${payList?.length || 0} payment(s):`);
    console.table(payList);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
