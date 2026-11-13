import { supabase } from '../src/lib/supabase.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function test() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  const { data, error } = await supabase.from('business_settings').select('*');
  console.log('business_settings data count:', data?.length, 'error:', error);
  if (data?.length) {
    console.log('business_settings row:', Object.keys(data[0]));
    console.log(data[0]);
  }
}

test().catch(console.error);
