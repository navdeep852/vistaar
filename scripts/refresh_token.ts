import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));
const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Attempting refresh with refresh_token...');
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: authData.refresh_token,
  });

  if (error) {
    console.error('Refresh error:', error);
    return;
  }

  if (data?.session) {
    console.log('Session refreshed successfully!');
    const newAuth = {
      ...authData,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    };
    fs.writeFileSync('extracted_auth.json', JSON.stringify(newAuth, null, 2));
    console.log('Saved fresh tokens to extracted_auth.json');
  }
}

main().catch(console.error);

