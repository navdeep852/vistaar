import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log('================================================================================');
  console.log(' VISTAAR — SUPABASE create_employee_account RPC INSPECTION & VERIFICATION');
  console.log('================================================================================\n');

  console.log('Connected Project URL:', SUPABASE_URL);

  // 1. Check if public.create_employee_account exists in PostgREST schema cache
  console.log('\n--- 1. PROBING public.create_employee_account IN SCHEMA CACHE ---');
  const probeRes = await supabase.rpc('create_employee_account', {
    p_department: 'Sales & Billing',
    p_designation: 'Billing Associate',
    p_email: 'wanda07@grovyx.com',
    p_name: 'Wanda',
    p_phone: '9196030566',
    p_temporary_password: 'TestTempPass@2026!',
  });

  console.log('HTTP Status:', probeRes.status);
  if (probeRes.error) {
    console.log('PostgREST Error Code:', probeRes.error.code);
    console.log('Error Message:       ', probeRes.error.message);
    console.log('Error Details:       ', probeRes.error.details);
    console.log('Error Hint:          ', probeRes.error.hint);

    if (probeRes.error.code === 'PGRST202') {
      console.log('\n❌ RESULT: Function NOT FOUND in PostgREST schema cache.');
      console.log('👉 ACTION REQUIRED: Migration 050 must be executed in Supabase SQL editor.');
      return;
    }

    if (probeRes.error.message?.includes('Unauthorized') || probeRes.error.message?.includes('authenticated')) {
      console.log('\n✅ RESULT: Function EXISTS in schema cache and correctly rejected unauthenticated caller!');
      console.log('The function signature is recognized by PostgREST.');
    } else if (probeRes.error.message?.includes('Only workspace owners')) {
      console.log('\n✅ RESULT: Function EXISTS and Owner authorization is strictly enforced!');
    }
  } else {
    console.log('RPC Response:', probeRes.data);
    console.log('\n✅ RESULT: Function EXISTS and returned data!');
  }

  // 2. Check generate_next_employee_id
  console.log('\n--- 2. PROBING generate_next_employee_id RPC ---');
  const nextIdRes = await supabase.rpc('generate_next_employee_id', {
    p_workspace_id: '00000000-0000-0000-0000-000000000000',
  });
  console.log('generate_next_employee_id status:', nextIdRes.status, 'data:', nextIdRes.data, 'error:', nextIdRes.error?.message);

  // 3. Check get_email_by_employee_id
  console.log('\n--- 3. PROBING get_email_by_employee_id RPC ---');
  const getEmailRes = await supabase.rpc('get_email_by_employee_id', {
    p_employee_id: 'VST-EMP-001',
  });
  console.log('get_email_by_employee_id status:', getEmailRes.status, 'data:', getEmailRes.data, 'error:', getEmailRes.error?.message);
}

main().catch(console.error);
