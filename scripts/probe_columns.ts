import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

async function probeColumns() {
  const tableCols: Record<string, string[]> = {
    quotations: ['id', 'workspace_id', 'branch_id', 'quotation_number', 'customer_name', 'status', 'date', 'grand_total', 'converted_invoice_id', 'converted_at', 'snapshot', 'created_at'],
    quotation_items: ['id', 'workspace_id', 'quotation_id', 'product_id', 'product_name', 'quantity', 'selling_price', 'total', 'item_type', 'part_number', 'description', 'branch_id'],
    invoices: ['id', 'workspace_id', 'branch_id', 'invoice_number', 'customer_name', 'status', 'date', 'grand_total', 'paid_amount', 'balance_amount', 'quotation_id', 'is_stock_finalized', 'snapshot', 'created_at'],
    invoice_items: ['id', 'workspace_id', 'invoice_id', 'product_id', 'product_name', 'quantity', 'selling_price', 'total', 'item_type', 'part_number', 'description', 'branch_id'],
    counter_sales: ['id', 'workspace_id', 'branch_id', 'sale_number', 'invoice_number', 'customer_name', 'status', 'sale_date', 'final_total', 'amount_received', 'balance_amount', 'payment_method', 'cash_amount', 'upi_amount', 'created_at'],
    counter_sale_items: ['id', 'workspace_id', 'counter_sale_id', 'product_id', 'product_name', 'quantity', 'rate', 'amount', 'item_type', 'branch_id'],
    daybook_transactions: ['id', 'workspace_id', 'branch_id', 'transaction_code', 'transaction_date', 'transaction_type', 'direction', 'amount', 'total_amount', 'remaining_amount', 'payment_status', 'payment_mode', 'reference_type', 'reference_id', 'reference_number', 'created_at'],
    payments: ['id', 'workspace_id', 'payment_number', 'invoice_id', 'invoice_number', 'counter_sale_id', 'amount', 'method', 'payment_date', 'status', 'created_at'],
    expenses: ['id', 'workspace_id', 'branch_id', 'title', 'amount', 'category', 'payment_method', 'date', 'created_at'],
    products: ['id', 'workspace_id', 'name', 'product_code', 'sku', 'part_number', 'buy_price', 'selling_price', 'current_stock', 'created_at'],
  };

  console.log('=== PROBING COLUMNS ON LIVE TABLES ===\n');

  for (const [table, cols] of Object.entries(tableCols)) {
    console.log(`\n--- Table: ${table} ---`);
    for (const c of cols) {
      const { error } = await supabase.from(table).select(c).limit(0);
      if (error) {
        console.log(`  ❌ ${c.padEnd(25)} -> NOT FOUND (${error.code})`);
      } else {
        console.log(`  ✅ ${c.padEnd(25)} -> OK`);
      }
    }
  }
}

probeColumns();
