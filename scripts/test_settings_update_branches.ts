import { supabase } from '../src/lib/supabase.ts';
import { businessSettingsService } from '../src/services/supabase/businessSettingsService.ts';
import { supabaseAuthService } from '../src/services/supabaseAuth.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function main() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  const wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';
  (supabaseAuthService as any).currentCompanyId = wsId;

  // 1. Fetch current settings from DB
  const { data: before } = await supabase.from('business_settings').select('bank_details').eq('workspace_id', wsId).single();
  console.log('Before branches count:', before?.bank_details?._branches?.length);
  console.log('Before branches:', before?.bank_details?._branches?.map((b: any) => b.branchName));

  // Let's check how mapAppSettingsToDb works if bankDetails doesn't contain _branches
  const mapped = (await businessSettingsService.getSettings()).data;
  console.log('Mapped bankDetails in getSettings:', mapped?.bankDetails);
}

main().catch(console.error);

