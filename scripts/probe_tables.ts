import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

async function probeAllTables() {
  const candidateTables = [
    'workspaces',
    'profiles',
    'workspace_members',
    'customers',
    'categories',
    'products',
    'stock_receipts',
    'stock_movements',
    'invoices',
    'invoice_items',
    'quotations',
    'quotation_items',
    'payments',
    'udhari_records',
    'udhari_payments',
    'expenses',
    'daybook_transactions',
    'daybook_entries',
    'cashbook_entries',
    'cashbook_accounts',
    'counter_sales',
    'counter_sale_items',
    'branches',
    'branch_inventory',
    'branch_stock_transfers',
    'purchase_orders',
    'purchase_order_items',
    'eway_bills',
    'employee_salaries',
    'salary_structures',
    'audit_logs',
    'business_settings',
    'backups'
  ];

  console.log('=== PROBING ALL TABLES IN SUPABASE SCHEMA CACHE ===\n');
  for (const t of candidateTables) {
    const { data, error } = await supabase.from(t).select('*').limit(0);
    if (error) {
      console.log(`❌ ${t.padEnd(25)} -> ${error.code} : ${error.message}`);
    } else {
      console.log(`✅ ${t.padEnd(25)} -> EXISTS in schema cache`);
    }
  }
}

probeAllTables();
