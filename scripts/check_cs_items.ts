import { supabase } from '../src/lib/supabase.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function main() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  
  const { data: csItems } = await supabase.from('counter_sale_items').select('*');
  console.log('=== COUNTER SALE ITEMS ===');
  console.log(csItems);

  const { data: cs } = await supabase.from('counter_sales').select('*');
  console.log('=== COUNTER SALES ===');
  console.log(cs);
}

main().catch(console.error);

