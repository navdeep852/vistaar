import { createClient } from '@supabase/supabase-js';
import dns from 'dns/promises';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_j5tuLPC3iQO4pQHU0BeyYQ_CH_7Ls6x';

console.log('=== VISTAAR SUPABASE AUTH DIAGNOSTIC ===');
console.log('Target URL:', supabaseUrl);
console.log('Client Key Present:', Boolean(supabaseKey));

async function runDiagnostic() {
  try {
    const parsed = new URL(supabaseUrl);
    console.log('Hostname:', parsed.hostname);
    
    try {
      const addresses = await dns.lookup(parsed.hostname);
      console.log('DNS Lookup Success:', addresses);
    } catch (dnsErr) {
      console.error('❌ DNS Lookup Failed:', dnsErr.code || dnsErr.message);
    }
  } catch (urlErr) {
    console.error('❌ Invalid URL format:', urlErr.message);
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('\nTesting Auth Endpoint (signInWithOtp)...');
  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      email: 'diagnostic-test-probe@example.com',
      options: { shouldCreateUser: false },
    });

    if (error) {
      console.log('Auth Probe Returned Error:');
      console.log('  error.name:', error.name);
      console.log('  error.code:', error.code);
      console.log('  error.status:', error.status);
      console.log('  error.message:', error.message);
    } else {
      console.log('✅ Auth Probe Succeeded:', data);
    }
  } catch (err) {
    console.error('❌ Uncaught Exception during Auth Probe:');
    console.error('  name:', err.name);
    console.error('  code:', err.code);
    console.error('  message:', err.message);
    console.error('  cause:', err.cause);
  }
}

runDiagnostic();
