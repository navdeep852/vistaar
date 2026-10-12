import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('=== DIAGNOSING PGRST204 ON INVOICE FINALIZATION ===\n');

  // 1. Test invoices table columns
  console.log('1. Testing select from invoices:');
  const { data: invData, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .limit(1);
  if (invErr) {
    console.error('invoices select error:', invErr);
  } else {
    console.log('invoices sample row columns:', invData && invData[0] ? Object.keys(invData[0]) : 'empty table');
  }

  // 2. Test invoice_items table columns
  console.log('\n2. Testing select from invoice_items:');
  const { data: itemData, error: itemErr } = await supabase
    .from('invoice_items')
    .select('*')
    .limit(1);
  if (itemErr) {
    console.error('invoice_items select error:', itemErr);
  } else {
    console.log('invoice_items sample row columns:', itemData && itemData[0] ? Object.keys(itemData[0]) : 'empty table');
  }

  // 3. Test finalize_invoice_transaction RPC
  console.log('\n3. Testing finalize_invoice_transaction RPC existence:');
  const { data: rpcData, error: rpcErr } = await supabase.rpc('finalize_invoice_transaction', {
    p_payload: {}
  });
  console.log('finalize_invoice_transaction result:', { rpcData, rpcErr });

  // 4. Test finalize_invoice_stock RPC
  console.log('\n4. Testing finalize_invoice_stock RPC existence:');
  const { data: stockData, error: stockErr } = await supabase.rpc('finalize_invoice_stock', {
    p_invoice_id: '00000000-0000-0000-0000-000000000000'
  });
  console.log('finalize_invoice_stock result:', { stockData, stockErr });

  // 5. Check what columns createInvoice tries to insert into invoices
  console.log('\n5. Testing individual columns for invoices insert:');
  const testCols = [
    'workspace_id',
    'customer_id',
    'invoice_number',
    'customer_name',
    'customer_phone',
    'customer_email',
    'quotation_id',
    'status',
    'date',
    'due_date',
    'subtotal',
    'discount_total',
    'tax_total',
    'grand_total',
    'paid_amount',
    'balance_amount',
    'branch_id',
    'is_stock_finalized',
    'notes',
    'terms',
    'footer_text',
    'template_id',
    'branding',
    'theme',
    'customization',
    'snapshot'
  ];

  for (const col of testCols) {
    const { error } = await supabase.from('invoices').select(col).limit(1);
    if (error) {
      console.log(`❌ invoices.${col} -> ERROR:`, error.code, error.message);
    } else {
      console.log(`✅ invoices.${col} exists`);
    }
  }

  // 6. Check what columns createInvoice tries to insert into invoice_items
  console.log('\n6. Testing individual columns for invoice_items insert:');
  const testItemCols = [
    'workspace_id',
    'invoice_id',
    'branch_id',
    'product_id',
    'product_name',
    'sku',
    'unit',
    'quantity',
    'buy_price',
    'selling_price',
    'tax_percent',
    'tax_amount',
    'total',
    'item_type',
    'description',
    'part_number',
    'discount_amount'
  ];

  for (const col of testItemCols) {
    const { error } = await supabase.from('invoice_items').select(col).limit(1);
    if (error) {
      console.log(`❌ invoice_items.${col} -> ERROR:`, error.code, error.message);
    } else {
      console.log(`✅ invoice_items.${col} exists`);
    }
  }
}

diagnose();
