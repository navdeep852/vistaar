import { supabase } from '../src/lib/supabase.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function testWorkspaceIsolation() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  
  const validWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';
  const foreignWsId = '11111111-2222-3333-4444-555555555555';

  console.log('=== TEST 1: READ OWN WORKSPACE SETTINGS ===');
  const { data: ownSettings, error: ownErr } = await supabase
    .from('business_settings')
    .select('workspace_id, bank_details')
    .eq('workspace_id', validWsId);
  console.log('Own settings retrieved:', ownSettings?.length, 'Error:', ownErr?.message);

  console.log('\n=== TEST 2: READ FOREIGN WORKSPACE SETTINGS (RLS Isolation) ===');
  const { data: foreignSettings, error: foreignErr } = await supabase
    .from('business_settings')
    .select('workspace_id, bank_details')
    .eq('workspace_id', foreignWsId);
  console.log('Foreign settings rows returned:', foreignSettings?.length, 'Error:', foreignErr?.message);

  console.log('\n=== TEST 3: ATTEMPT TO WRITE FOREIGN WORKSPACE SETTINGS (RLS Isolation) ===');
  const { data: writeRes, error: writeErr } = await supabase
    .from('business_settings')
    .insert({
      workspace_id: foreignWsId,
      legal_name: 'Hacked Foreign Workspace',
      bank_details: { test: true },
    })
    .select();
  console.log('Foreign settings write allowed?', !!writeRes && writeRes.length > 0, 'Error:', writeErr?.message);
}

testWorkspaceIsolation().catch(console.error);

