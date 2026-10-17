import { supabaseAuthService } from '../src/services/supabaseAuth';
import { supabase } from '../src/lib/supabase';

async function testAuthAndQuery() {
  console.log('=== SIGNING UP / SIGNING IN TEST USER ===');
  const testEmail = 'persistence_audit@vistaar.com';
  const testPassword = 'Password@2026Secure';
  
  let loginRes = await supabaseAuthService.login(testEmail, testPassword);
  if (!loginRes.success) {
    console.log('User does not exist, creating new company...');
    const regRes = await supabaseAuthService.signUpCompany(
      'Vistaar Persistence Corp',
      'Auditor',
      testEmail,
      '9876543210',
      testPassword
    );
    console.log('Registration result:', regRes.success, regRes.error);
    loginRes = await supabaseAuthService.login(testEmail, testPassword);
  }
  console.log('Login result:', loginRes.success, loginRes.error);
  
  const user = supabaseAuthService.getUser();
  console.log('Authenticated user:', user?.email, user?.companyId);
  const wsId = await supabaseAuthService.getAuthoritativeWorkspaceId();
  console.log('Authoritative workspace ID:', wsId);

  // Now query invoices as authenticated user
  const { data: invs, error: invErr } = await supabase.from('invoices').select('*');
  console.log('Invoices query with auth:', invs?.length, invErr);

  // Query payments with auth
  const { data: pays, error: payErr } = await supabase.from('payments').select('*');
  console.log('Payments query with auth:', pays?.length, payErr);

  // Query customers with auth
  const { data: custs, error: custErr } = await supabase.from('customers').select('*');
  console.log('Customers query with auth:', custs?.length, custErr);

  // Query workspaces with auth
  const { data: ws, error: wsErr } = await supabase.from('workspaces').select('*');
  console.log('Workspaces query with auth:', ws, wsErr);
}

testAuthAndQuery();
