import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));
const supabase = createClient('https://kluxsykimnjivkqxelba.supabase.co', 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x');

async function main() {
  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  const { data, error } = await supabase.from('branches').select('*');
  console.log('branches query result:', data, 'error:', error);
}

main();
