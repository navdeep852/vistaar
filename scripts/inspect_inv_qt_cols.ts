import { supabase } from '../src/lib/supabase.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function test() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  const { data: inv } = await supabase.from('invoices').select('*').limit(1);
  console.log('invoices columns:', Object.keys(inv[0]));
  const { data: qt } = await supabase.from('quotations').select('*').limit(1);
  console.log('quotations columns:', Object.keys(qt[0]));
}

test().catch(console.error);
