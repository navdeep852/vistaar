import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read .env.local if present
let url = process.env.VITE_SUPABASE_URL;
let key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  try {
    const envPath = path.resolve(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim();
            if (k === 'VITE_SUPABASE_URL' && !url) url = v;
            if ((k === 'VITE_SUPABASE_PUBLISHABLE_KEY' || k === 'VITE_SUPABASE_ANON_KEY') && !key) key = v;
          }
        }
      });
    }
  } catch (e) {
    // ignore
  }
}

console.log('=== VISTAAR AUTH OTP FLOW DIAGNOSTIC ===');
console.log('Target URL:', url || 'NOT_SET');
console.log('Key Present:', Boolean(key));

if (!url || !key) {
  console.error('Environment variables missing.');
  process.exit(1);
}

const supabase = createClient(url, key);

async function testOtp() {
  console.log('\n--- 1. Testing signInWithOtp ---');
  try {
    const testEmail = 'probe-test-' + Date.now() + '@example.com';
    const { data, error } = await supabase.auth.signInWithOtp({
      email: testEmail,
      options: { shouldCreateUser: true },
    });

    if (error) {
      console.log('AUTH REQUEST CREATED: YES');
      console.log('AUTH REQUEST RESULT: FAILED');
      console.log('HTTP STATUS:', error.status || 'N/A');
      console.log('SUPABASE ERROR CODE:', error.code || 'N/A');
      console.log('SUPABASE ERROR MESSAGE:', error.message);
    } else {
      console.log('AUTH REQUEST CREATED: YES');
      console.log('AUTH REQUEST RESULT: SUCCESS');
      console.log('HTTP STATUS: 200');
      console.log('SUPABASE RESPONSE:', JSON.stringify(data));
    }

    console.log('\n--- 2. Testing verifyOtp (with invalid 6-digit code) ---');
    const { data: vData, error: vError } = await supabase.auth.verifyOtp({
      email: testEmail,
      token: '000000',
      type: 'email',
    });

    if (vError) {
      console.log('INVALID OTP REJECTION: PASS');
      console.log('HTTP STATUS:', vError.status || 'N/A');
      console.log('SUPABASE ERROR MESSAGE:', vError.message);
    } else {
      console.log('INVALID OTP REJECTION: FAIL (Unexpectedly accepted invalid token)');
    }
  } catch (err) {
    console.error('EXCEPTION:', err.message || String(err));
  }
}

testOtp();
