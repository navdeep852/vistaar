import { supabase } from '../src/lib/supabase.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function test() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  
  // Test a series of table names
  const candidateTables = [
    'workspaces',
    'workspace_memberships',
    'profiles',
    'business_settings',
    'invoices',
    'invoice_items',
    'quotations',
    'quotation_items',
    'counter_sales',
    'counter_sale_items',
    'payments',
    'udhari_records',
    'udhari_payments',
    'products',
    'categories',
    'suppliers',
    'customers',
    'expenses',
    'stock_receipts',
    'stock_movements',
    'stock_transfers',
    'branches',
    'user_branch_access',
    'branch_inventory',
    'app_notifications',
    'audit_logs',
    'daybook_transactions',
    'enterprise_branches',
    'company_branches'
  ];

  console.log('Testing accessible tables in Supabase:');
  for (const t of candidateTables) {
    const { data, error } = await supabase.from(t).select('id').limit(1);
    if (!error) {
      console.log(`  [EXISTS] ${t}`);
    } else {
      console.log(`  [MISSING] ${t}: ${error.code} - ${error.message}`);
    }
  }
}

test().catch(console.error);
