import { supabase } from '../src/lib/supabase.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

const testBranches = [
  {
    id: '5c456a11-1321-40af-9c79-0fa151419922',
    workspaceId: 'ddb10dc7-3671-4def-9626-526afd473c1a',
    branchCode: 'MAIN',
    branchName: 'My Business (Main Branch)',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: true,
    country: 'India',
    createdAt: '2026-10-30T08:35:47.418Z',
    updatedAt: '2026-10-30T08:35:47.418Z'
  },
  {
    id: '4330d620-c0f8-4261-905b-7386b7e82520',
    workspaceId: 'ddb10dc7-3671-4def-9626-526afd473c1a',
    branchCode: 'BR-4330',
    branchName: 'North Branch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: false,
    country: 'India',
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z'
  },
  {
    id: '398bd10a-903e-47ff-8c47-3261f683ef40',
    workspaceId: 'ddb10dc7-3671-4def-9626-526afd473c1a',
    branchCode: 'BR-398B',
    branchName: 'South Branch',
    branchType: 'Store',
    status: 'Active',
    isMainBranch: false,
    country: 'India',
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T10:00:00.000Z'
  }
];

async function test() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  const wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

  // Read current bank_details
  const { data: curr, error: readErr } = await supabase
    .from('business_settings')
    .select('bank_details')
    .eq('workspace_id', wsId)
    .single();

  console.log('Current bank_details:', curr, 'readErr:', readErr);

  const existingBank = curr?.bank_details || {};
  const updatedBank = {
    ...existingBank,
    _branches: testBranches
  };

  const { data: updateRes, error: updateErr } = await supabase
    .from('business_settings')
    .update({ bank_details: updatedBank })
    .eq('workspace_id', wsId)
    .select();

  console.log('Update result:', updateRes, 'updateErr:', updateErr);
}

test().catch(console.error);
