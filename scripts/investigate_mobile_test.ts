import { supabase } from '../src/lib/supabase';
import * as fs from 'fs';

const WS_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));
  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  console.log('=== 1. ALL INVOICES FOR TODAY (2026-11-15) ===');
  const { data: invs, error: invErr } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('workspace_id', WS_ID)
    .order('created_at', { ascending: false })
    .limit(10);

  if (invErr) console.error('Invoice error:', invErr);
  console.log(`Found ${invs?.length} invoices:`);
  invs?.forEach(i => {
    console.log({
      id: i.id,
      number: i.invoice_number,
      customer: i.customer_name,
      grand_total: i.grand_total,
      paid_amount: i.paid_amount,
      balance_amount: i.balance_amount,
      status: i.status,
      date: i.date,
      created_at: i.created_at,
      notes: i.notes,
      terms: i.terms,
      snapshot_branch: i.snapshot?.branch_id || i.snapshot?.branchId,
      items_count: i.invoice_items?.length,
      items: i.invoice_items?.map((it: any) => ({
        product_id: it.product_id,
        name: it.product_name,
        qty: it.quantity,
        buy_price: it.buy_price_snapshot || it.buy_price,
        selling_price: it.selling_price,
        total: it.total
      }))
    });
  });

  console.log('\n=== 2. ALL PAYMENTS FOR TODAY ===');
  const { data: pays, error: payErr } = await supabase
    .from('payments')
    .select('*')
    .eq('workspace_id', WS_ID)
    .order('created_at', { ascending: false })
    .limit(10);
  if (payErr) console.error('Payment error:', payErr);
  console.log(`Found ${pays?.length} payments:`);
  pays?.forEach(p => console.log(p));

  console.log('\n=== 3. ALL UDHARI RECORDS ===');
  const { data: udharis, error: uErr } = await supabase
    .from('udhari_records')
    .select('*, udhari_payments(*)')
    .eq('workspace_id', WS_ID)
    .order('created_at', { ascending: false })
    .limit(10);
  if (uErr) console.error('Udhari error:', uErr);
  console.log(`Found ${udharis?.length} udhari records:`);
  udharis?.forEach(u => console.log(u));

  console.log('\n=== 4. STOCK MOVEMENTS ===');
  const { data: sm, error: smErr } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('workspace_id', WS_ID)
    .order('created_at', { ascending: false })
    .limit(10);
  if (smErr) console.error('Stock movements error:', smErr);
  console.log(`Found ${sm?.length} stock movements:`);
  sm?.forEach(m => console.log(m));

  console.log('\n=== 5. STOCK RECEIPTS ===');
  const { data: sr, error: srErr } = await supabase
    .from('stock_receipts')
    .select('*')
    .eq('workspace_id', WS_ID)
    .order('created_at', { ascending: false })
    .limit(10);
  if (srErr) console.error('Stock receipts error:', srErr);
  console.log(`Found ${sr?.length} stock receipts:`);
  sr?.forEach(r => console.log(r));

  console.log('\n=== 6. PRODUCTS (CHECK 100-UNIT TEST PRODUCT) ===');
  const { data: prods, error: pErr } = await supabase
    .from('products')
    .select('id, name, sku, current_stock, minimum_stock, buy_price, selling_price, updated_at')
    .eq('workspace_id', WS_ID)
    .order('updated_at', { ascending: false })
    .limit(10);
  if (pErr) console.error('Product error:', pErr);
  console.log(`Recently updated products:`);
  prods?.forEach(p => console.log(p));
}

main().catch(console.error);
