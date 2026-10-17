import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPaymentColumns() {
  console.log('=== TESTING PAYMENTS COLUMNS ===\n');
  const candidatePaymentCols = [
    'id', 'workspace_id', 'branch_id', 'invoice_id', 'invoice_number',
    'customer_id', 'customer_name', 'amount', 'cash_amount', 'upi_amount',
    'payment_date', 'date', 'payment_method', 'payment_mode', 'method',
    'reference_number', 'reference', 'reference_no', 'notes',
    'counter_sale_id', 'created_at', 'updated_at'
  ];

  const existingCols: string[] = [];
  const missingCols: string[] = [];

  for (const c of candidatePaymentCols) {
    const { error } = await supabase.from('payments').select(c).limit(1);
    if (error) {
      missingCols.push(c);
    } else {
      existingCols.push(c);
    }
  }

  console.log('EXISTING payments columns (' + existingCols.length + '):', existingCols.join(', '));
  console.log('MISSING payments columns (' + missingCols.length + '):', missingCols.join(', '));
}

checkPaymentColumns();
