import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('Testing connection to live Supabase project...');
  
  const tables = ['workspaces', 'profiles', 'customers', 'products', 'invoices', 'quotations', 'stock_receipts', 'follow_ups'];
  let successCount = 0;

  for (const table of tables) {
    const { data, error, status } = await supabase.from(table).select('*', { head: true, count: 'exact' });
    if (error) {
      console.error(`❌ Error querying table '${table}':`, error.message);
    } else {
      console.log(`✅ Table '${table}' exists and is accessible (HTTP ${status}).`);
      successCount++;
    }
  }

  if (successCount === tables.length) {
    console.log('\n🎉 ALL TABLES VERIFIED SUCCESSFULLY IN SUPABASE!');
  } else {
    console.log(`\nVerified ${successCount}/${tables.length} tables.`);
  }
}

testConnection();
