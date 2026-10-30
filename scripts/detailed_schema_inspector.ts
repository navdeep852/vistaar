import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

const candidateTables = [
  'workspaces',
  'business_settings',
  'inventory_settings',
  'profiles',
  'categories',
  'suppliers',
  'customers',
  'products',
  'stock_receipts',
  'stock_movements',
  'quotations',
  'quotation_items',
  'invoices',
  'invoice_items',
  'payments',
  'counter_sales',
  'counter_sale_items',
  'udhari_records',
  'udhari_payments',
  'expenses',
  'daybook_transactions',
  'financial_accounts',
  'purchase_orders',
  'purchase_order_items',
  'supplier_catalogue_files',
  'supplier_catalogue_items',
  'supplier_catalogue_mappings',
  'follow_ups',
  'notifications',
  'feedbacks',
  'offers',
  'id_mappings',
];

async function inspectColumns() {
  console.log('--- DETAILED TABLE COLUMN INSPECTION ---\n');

  for (const table of candidateTables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`❌ [${table}]: ERROR ${error.code} - ${error.message}`);
      continue;
    }

    if (data && data.length > 0) {
      const cols = Object.keys(data[0]);
      console.log(`✅ [${table}] (${cols.length} columns):`);
      console.log(`   Columns: ${cols.join(', ')}`);
    } else {
      // If 0 rows, let's probe specific columns or check error messages
      console.log(`⚠️ [${table}]: Table exists but 0 rows returned.`);
    }
  }
}

inspectColumns().catch(console.error);

