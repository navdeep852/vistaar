import { supabase } from '../src/lib/supabase.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function test() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  const { data, error } = await supabase.from('workspaces').select('*').limit(1);
  if (data && data.length > 0) {
    console.log('workspaces columns:', Object.keys(data[0]));
    console.log('workspaces row:', data[0]);
  } else {
    console.log('No workspace data, error:', error);
  }
}

test().catch(console.error);
