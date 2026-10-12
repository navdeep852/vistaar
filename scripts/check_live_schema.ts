import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  console.log('=== CHECKING EXISTING TABLES & COLUMNS ON LIVE SUPABASE ===\n');

  const tables = [
    'workspaces',
    'branches',
    'invoices',
    'invoice_items',
    'products',
    'branch_inventory',
    'stock_receipts',
    'stock_movements',
    'quotations',
    'quotation_items',
    'customers',
    'payments',
    'udhari_records',
    'udhari_payments',
    'daybook_entries',
    'daybook_transactions',
    'cashbook_entries',
    'counter_sales',
    'counter_sale_items'
  ];

  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`❌ Table ${t} -> ERROR: ${error.code} - ${error.message}`);
    } else {
      console.log(`✅ Table ${t} exists. Columns:`, data && data[0] ? Object.keys(data[0]) : '(empty table)');
    }
  }
}

checkTables();
