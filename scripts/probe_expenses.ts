import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';
const supabase = createClient(supabaseUrl, supabaseKey);

async function probeExpenses() {
  const candidateExpenseCols = [
    'id', 'workspace_id', 'expense_number', 'description', 'notes', 'amount', 'category', 'expense_date', 'date', 'payment_mode', 'payment_method', 'receipt_url', 'created_by', 'created_at', 'updated_at'
  ];

  console.log('=== PROBING EXPENSES COLUMNS ===\n');
  for (const c of candidateExpenseCols) {
    const { error } = await supabase.from('expenses').select(c).limit(0);
    if (!error) console.log(`  ✅ expenses.${c}`);
    else console.log(`  ❌ expenses.${c} (${error.code})`);
  }
}

probeExpenses();
