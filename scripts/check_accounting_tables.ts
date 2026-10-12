import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDaybookAndPayments() {
  console.log('=== CHECKING DAYBOOK & PAYMENTS & STOCK MOVEMENTS COLUMNS ===\n');

  // daybook_transactions
  const dtCols = [
    'id', 'workspace_id', 'branch_id', 'transaction_number', 'transaction_date',
    'transaction_type', 'direction', 'amount', 'total_amount', 'remaining_amount',
    'payment_status', 'payment_mode', 'party_type', 'party_id', 'party_name',
    'reference_type', 'reference_id', 'reference_number', 'description', 'notes',
    'status', 'created_at', 'updated_at'
  ];
  const exDt = [];
  for (const c of dtCols) {
    const { error } = await supabase.from('daybook_transactions').select(c).limit(1);
    if (!error) exDt.push(c);
  }
  console.log('daybook_transactions columns:', exDt.join(', '));

  // payments
  const payCols = [
    'id', 'workspace_id', 'branch_id', 'customer_id', 'invoice_id',
    'invoice_number', 'payment_number', 'amount', 'payment_method',
    'payment_date', 'reference_number', 'notes', 'created_at'
  ];
  const exPay = [];
  for (const c of payCols) {
    const { error } = await supabase.from('payments').select(c).limit(1);
    if (!error) exPay.push(c);
  }
  console.log('payments columns:', exPay.join(', '));

  // stock_movements
  const smCols = [
    'id', 'workspace_id', 'branch_id', 'product_id', 'movement_type',
    'quantity', 'reference_type', 'reference_id', 'reference_number',
    'notes', 'created_at'
  ];
  const exSm = [];
  for (const c of smCols) {
    const { error } = await supabase.from('stock_movements').select(c).limit(1);
    if (!error) exSm.push(c);
  }
  console.log('stock_movements columns:', exSm.join(', '));

  // products
  const pCols = [
    'id', 'workspace_id', 'name', 'sku', 'current_stock', 'buy_price',
    'selling_price', 'created_at', 'updated_at'
  ];
  const exP = [];
  for (const c of pCols) {
    const { error } = await supabase.from('products').select(c).limit(1);
    if (!error) exP.push(c);
  }
  console.log('products columns:', exP.join(', '));
}

checkDaybookAndPayments();
