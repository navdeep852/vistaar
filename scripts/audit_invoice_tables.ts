import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testColumns() {
  console.log('=== TESTING INVOICES COLUMNS ===\n');
  const candidateInvoiceCols = [
    'id', 'workspace_id', 'branch_id', 'customer_id', 'invoice_number',
    'customer_name', 'customer_phone', 'customer_whatsapp', 'customer_email',
    'customer_address', 'customer_gstin', 'quotation_id', 'status', 'date',
    'due_date', 'subtotal', 'discount_total', 'tax_total', 'grand_total',
    'paid_amount', 'balance_amount', 'is_stock_finalized', 'is_snapshot_finalized',
    'payment_mode', 'payment_reference', 'payment_notes', 'payment_method',
    'notes', 'terms', 'footer_text', 'template_id', 'branding', 'theme',
    'customization', 'snapshot', 'created_at', 'updated_at'
  ];

  const existingInvCols: string[] = [];
  const missingInvCols: string[] = [];

  for (const c of candidateInvoiceCols) {
    const { error } = await supabase.from('invoices').select(c).limit(1);
    if (error) {
      missingInvCols.push(c);
    } else {
      existingInvCols.push(c);
    }
  }

  console.log('EXISTING invoices columns (' + existingInvCols.length + '):', existingInvCols.join(', '));
  console.log('MISSING invoices columns (' + missingInvCols.length + '):', missingInvCols.join(', '));

  console.log('\n=== TESTING INVOICE_ITEMS COLUMNS ===\n');
  const candidateItemCols = [
    'id', 'workspace_id', 'invoice_id', 'branch_id', 'product_id',
    'product_name', 'sku', 'part_number', 'unit', 'quantity', 'buy_price',
    'selling_price', 'price', 'rate', 'discount_amount', 'tax_percent',
    'tax_amount', 'total', 'item_type', 'description', 'created_at', 'updated_at'
  ];

  const existingItemCols: string[] = [];
  const missingItemCols: string[] = [];

  for (const c of candidateItemCols) {
    const { error } = await supabase.from('invoice_items').select(c).limit(1);
    if (error) {
      missingItemCols.push(c);
    } else {
      existingItemCols.push(c);
    }
  }

  console.log('EXISTING invoice_items columns (' + existingItemCols.length + '):', existingItemCols.join(', '));
  console.log('MISSING invoice_items columns (' + missingItemCols.length + '):', missingItemCols.join(', '));
}

testColumns();
