import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES_TO_AUDIT = [
  'workspaces',
  'business_settings',
  'inventory_settings',
  'branches',
  'user_branch_access',
  'profiles',
  'categories',
  'suppliers',
  'customers',
  'products',
  'branch_inventory',
  'stock_receipts',
  'stock_movements',
  'stock_transfers',
  'stock_transfer_items',
  'quotations',
  'quotation_items',
  'invoices',
  'invoice_items',
  'payments',
  'payment_transactions',
  'counter_sales',
  'counter_sale_items',
  'udhari_records',
  'udhari_payments',
  'expenses',
  'daybook_transactions',
  'cashbook_entries',
  'financial_accounts',
  'purchase_orders',
  'purchase_order_items',
  'purchase_order_receipts',
  'purchase_order_receipt_items',
  'supplier_catalogue_files',
  'supplier_catalogue_items',
  'supplier_catalogue_mappings',
  'eway_bills',
  'eway_bill_items',
  'vehicles',
  'transporters',
  'salary_structures',
  'salary_payments',
  'salary_payment_items',
  'follow_ups',
  'notifications',
  'feedbacks',
  'offers',
];

async function audit() {
  console.log('Auditing Supabase tables for Backup & Restore...\n');

  for (const table of TABLES_TO_AUDIT) {
    // 1. Test basic select
    const { data, error: selectErr } = await supabase.from(table).select('*').limit(1);
    if (selectErr) {
      console.log(`❌ TABLE [${table}]: SELECT * FAILED -> ${selectErr.code}: ${selectErr.message}`);
      continue;
    }

    // 2. Test order('id')
    const { error: idErr } = await supabase.from(table).select('*').order('id', { ascending: true }).limit(1);
    const hasId = !idErr;

    // 3. Test eq('workspace_id')
    const { error: wsErr } = await supabase.from(table).select('*').eq('workspace_id', '00000000-0000-0000-0000-000000000000').limit(1);
    const hasWorkspaceId = !wsErr;

    // 4. Test order('created_at')
    const { error: catErr } = await supabase.from(table).select('*').order('created_at', { ascending: true }).limit(1);
    const hasCreatedAt = !catErr;

    // 5. Inspect columns if row returned
    let sampleCols = '';
    if (data && data.length > 0) {
      sampleCols = Object.keys(data[0]).slice(0, 8).join(', ');
    }

    console.log(
      `✅ [${table.padEnd(30)}] | has 'id': ${hasId ? 'YES' : 'NO (' + idErr?.message + ')'} | has 'workspace_id': ${hasWorkspaceId ? 'YES' : 'NO'} | has 'created_at': ${hasCreatedAt ? 'YES' : 'NO'}`
    );
  }
}

audit().catch(console.error);

