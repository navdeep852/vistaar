import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value.trim();
    }
  });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kluxsykimnjivkqxelba.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runForensicAudit() {
  console.log('==================================================');
  console.log('STEP 1 & STEP 2 — CLIENT & SESSION IDENTIFICATION');
  console.log('==================================================');
  console.log('Client Instance: Browser Supabase JS Client (supabase-js v2)');
  console.log('Client Auth Key: Anon Key / Publishable Key (Client-side authenticated context)');
  console.log('Invocation Environment: Web Browser (Vite SPA frontend)');

  // Obtain active session or sign up/in test user
  const email = 'test_owner_workspace@vistaar.com';
  const password = 'Password123!@#';

  let session: any = null;
  let user: any = null;

  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    console.log(`Test user login notice (${signInErr.message}). Creating fresh test workspace owner...`);
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: 'Test Owner',
          company_name: 'Forensic Test Workspace',
        },
      },
    });
    if (signUpErr || !signUpData.session) {
      console.error('Sign up failed:', signUpErr);
      process.exit(1);
    }
    session = signUpData.session;
    user = signUpData.user;
  } else {
    session = signInData.session;
    user = signInData.user;
  }

  console.log('\n--- STEP 1: RESOLVED IDENTITY AT CALL TIME ---');
  console.log('auth.getUser().id (auth.uid()):', user.id);
  console.log('auth.getUser().email:', user.email);
  console.log('auth.getUser().role:', user.role);
  console.log('Session Access Token Present:', Boolean(session.access_token));
  console.log('Session Token Expiration:', new Date(session.expires_at * 1000).toISOString());
  console.log('Session Is Valid / Unexpired:', Date.now() / 1000 < session.expires_at);

  // Decode JWT Claims
  const jwtParts = session.access_token.split('.');
  const jwtClaims = JSON.parse(Buffer.from(jwtParts[1], 'base64').toString('utf8'));
  console.log('Raw JWT Claims:', {
    sub: jwtClaims.sub,
    email: jwtClaims.email,
    role: jwtClaims.role,
    aud: jwtClaims.aud,
    exp: jwtClaims.exp,
  });

  // Query profiles for workspace_id
  const { data: profileRow } = await supabase.from('profiles').select('id, workspace_id, role').eq('id', user.id).single();
  console.log('\nProfiles DB Row:', profileRow);

  const targetWorkspaceId = profileRow?.workspace_id;

  console.log('\n--- STEP 1: EXACT PAYLOAD SENT TO PRODUCTS TABLE ---');
  const payload = {
    workspace_id: targetWorkspaceId,
    name: 'Headphone',
    product_code: '10000778',
    sku: '10000778',
    brand: 'Boat',
    unit: 'Piece',
    buy_price: 600,
    selling_price: 999,
    current_stock: 80,
    minimum_stock_level: 5,
    is_active: true,
  };
  console.dir(payload, { depth: null });

  console.log('\n--- STEP 1: VERBATIM ERROR OBJECT ON PRODUCT INSERT ---');
  const { data: insertData, error: insertError, status, statusText } = await supabase
    .from('products')
    .insert([payload])
    .select('*');

  console.log('HTTP Status Code:', status);
  console.log('HTTP Status Text:', statusText);

  if (insertError) {
    console.error('VERBATIM SUPABASE ERROR OBJECT:');
    console.log({
      code: insertError.code,
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
      status: status,
    });
  } else {
    console.log('INSERT SUCCESS! Inserted Row:', insertData);
  }

  // Test Stock Receipts Insert
  if (insertData && insertData.length > 0) {
    console.log('\n--- STEP 1: VERBATIM ERROR OBJECT ON STOCK RECEIPTS INSERT ---');
    const receiptPayload = {
      workspace_id: targetWorkspaceId,
      product_id: insertData[0].id,
      receipt_number: `GRN-${Date.now()}`,
      received_date: '2026-09-04',
      quantity_received: 80,
      quantity_remaining: 80,
      buy_price: 600,
      notes: 'Initial Stock on Creation',
    };
    const rcptRes = await supabase.from('stock_receipts').insert([receiptPayload]).select('*');
    if (rcptRes.error) {
      console.error('VERBATIM STOCK_RECEIPTS ERROR OBJECT:');
      console.log({
        code: rcptRes.error.code,
        message: rcptRes.error.message,
        details: rcptRes.error.details,
        hint: rcptRes.error.hint,
        status: (rcptRes as any).status,
      });
    } else {
      console.log('STOCK RECEIPTS INSERT SUCCESS! Inserted Row:', rcptRes.data);
    }
  }

  console.log('\n==================================================');
  console.log('STEP 3 & STEP 4 — SECURITY DUMP & SQL REPRODUCTION');
  console.log('==================================================');
  console.log('SQL Reproduction Template for authenticated role:');
  console.log(`
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"${user.id}","role":"authenticated"}', true);

-- Step 4 Test Query:
INSERT INTO public.products (
  workspace_id, name, product_code, sku, brand, unit, buy_price, selling_price, current_stock, minimum_stock_level, is_active
) VALUES (
  '${targetWorkspaceId}', 'Headphone', '10000778', '10000778', 'Boat', 'Piece', 600, 999, 80, 5, true
);

ROLLBACK;
  `);
}

runForensicAudit().catch((err) => {
  console.error('Forensic execution error:', err);
  process.exit(1);
});
