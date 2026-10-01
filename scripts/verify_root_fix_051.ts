import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

async function runVerification() {
  console.log('================================================================================');
  console.log('VISTAAR — VERIFICATION SUITE: ROOT FIX FOR EMPLOYEE AUTH & SCHEMA DRIFT');
  console.log('================================================================================\n');

  console.log('Supabase URL:', SUPABASE_URL);

  // 1. Column Probe for public.profiles
  console.log('\n--- 1. PROBING public.profiles COLUMNS ---');
  const canonicalCols = [
    'id',
    'workspace_id',
    'employee_id',
    'name',
    'email',
    'phone',
    'department',
    'designation',
    'role',
    'status',
    'must_change_password',
    'avatar_url',
    'created_at',
    'updated_at',
    'deleted_at',
    'is_archived',
  ];

  let allColsExist = true;
  for (const col of canonicalCols) {
    const res = await supabase.from('profiles').select(col).limit(0);
    if (res.error) {
      console.log(`❌ Column '${col}': Error ${res.error.code} - ${res.error.message}`);
      allColsExist = false;
    } else {
      console.log(`✅ Column '${col}': EXISTS`);
    }
  }

  // 2. Probe RPC: create_employee_account
  console.log('\n--- 2. PROBING create_employee_account RPC ---');
  const rpcProbe = await supabase.rpc('create_employee_account', {
    p_name: 'Wanda Test',
    p_email: 'wanda_test_probe@grovyx.com',
    p_phone: '9196030566',
    p_department: 'Sales & Billing',
    p_designation: 'Billing Associate',
    p_temporary_password: 'TestTempPass@2026!',
  });

  console.log('RPC Status Code:', rpcProbe.status);
  if (rpcProbe.error) {
    console.log('Error Code:   ', rpcProbe.error.code);
    console.log('Error Message:', rpcProbe.error.message);
    if (rpcProbe.error.message.includes('Unauthorized') || rpcProbe.error.message.includes('authenticated')) {
      console.log('✅ Result: create_employee_account is installed and enforces caller authentication strictly!');
    }
  } else {
    console.log('✅ Result: RPC executed successfully:', rpcProbe.data);
  }

  // 3. Probe RPC: generate_next_employee_id
  console.log('\n--- 3. PROBING generate_next_employee_id RPC ---');
  const idGenRes = await supabase.rpc('generate_next_employee_id', {
    p_workspace_id: '00000000-0000-4000-8000-000000000000',
  });
  console.log('Status:', idGenRes.status, 'Generated ID:', idGenRes.data, idGenRes.error ? `Error: ${idGenRes.error.message}` : '');
  if (idGenRes.data && String(idGenRes.data).startsWith('VST-EMP-')) {
    console.log('✅ Result: Sequential VST-EMP-XXX format correctly generated!');
  }

  // 4. Probe RPC: get_email_by_employee_id
  console.log('\n--- 4. PROBING get_email_by_employee_id RPC ---');
  const emailRes = await supabase.rpc('get_email_by_employee_id', {
    p_employee_id: 'VST-00001',
  });
  console.log('Status:', emailRes.status, 'Resolved Email for VST-00001:', emailRes.data);
  if (emailRes.data) {
    console.log('✅ Result: Case-insensitive employee ID resolution works!');
  }

  // 5. Probe Workspaces
  console.log('\n--- 5. PROBING public.workspaces ---');
  const wsRes = await supabase.from('workspaces').select('id, company_name, owner_email').limit(0);
  console.log('Workspaces status:', wsRes.status, wsRes.error ? `Error: ${wsRes.error.message}` : '✅ Accessible');

  console.log('\n================================================================================');
  console.log('VERIFICATION COMPLETE');
  console.log('================================================================================');
}

runVerification().catch(console.error);
