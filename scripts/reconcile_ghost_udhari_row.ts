import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));
const supabaseUrl = 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${authData.access_token}` } },
});

const WS_ID = 'ddb10dc7-3671-4def-9626-526afd473c1a';
const GHOST_ROW_ID = '0ade0f93-d111-459f-a98d-09757b4e56e5';

async function main() {
  const { data: before, error: bErr } = await supabase
    .from('udhari_records')
    .select('*')
    .eq('id', GHOST_ROW_ID)
    .single();

  console.log('BEFORE:', before, bErr);

  const { data: updated, error } = await supabase
    .from('udhari_records')
    .update({
      total_received: 595,
      outstanding_amount: 0,
      status: 'PAID',
      updated_at: new Date().toISOString(),
    })
    .eq('id', GHOST_ROW_ID)
    .select('*')
    .single();

  if (error) {
    console.error('Update error:', error);
  } else {
    console.log('AFTER UPDATE:', updated);
  }
}

main().catch(console.error);
