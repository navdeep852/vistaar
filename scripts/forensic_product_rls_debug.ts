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

console.log('==================================================');
console.log('STEP 1 & STEP 2 — CLIENT ENVIRONMENT & USER IDENTITY');
console.log('==================================================');
console.log('Supabase URL:', supabaseUrl);
console.log('Client Type: Browser Anon Client (VITE_SUPABASE_ANON_KEY / Publishable Key)');
console.log('Anon Key Prefix:', supabaseAnonKey.slice(0, 20) + '...');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runForensicAudit() {
  // Step 1 & Step 2: Sign in to get real JWT session
  const email = 'mauryanavdeep852@gmail.com';
  const password = 'Password123!@#';

  console.log(`\nAttempting login for: ${email}`);
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });

  if (authErr) {
    console.error('Auth Login Error:', authErr);
    process.exit(1);
  }

  const session = authData.session;
  const user = authData.user;

  console.log('\n--- VERIFIED RESOLVED USER IDENTITY AT CALL TIME ---');
  console.log('auth.getUser().id (auth.uid()):', user?.id);
  console.log('auth.getUser().email:', user?.email);
  console.log('auth.getUser().role:', user?.role);
  console.log('Session Access Token Present:', Boolean(session?.access_token));
  console.log('Session Expires At:', session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A');
  console.log('Session Is Expired:', session?.expires_at ? Date.now() / 1000 > session.expires_at : 'UNKNOWN');

  // Decode JWT payload (claims)
  if (session?.access_token) {
    try {
      const parts = session.access_token.split('.');
      const jwtPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      console.log('JWT Claims Payload:', {
        sub: jwtPayload.sub,
        email: jwtPayload.email,
        role: jwtPayload.role,
        aal: jwtPayload.aal,
        exp: new Date(jwtPayload.exp * 1000).toISOString(),
      });
    } catch (e) {
      console.warn('Failed to parse JWT payload:', e);
    }
  }

  // Fetch profiles table for user workspace_id
  const { data: profileData, error: profileErr } = await supabase
    .from('profiles')
    .select('id, workspace_id, role, name')
    .eq('id', user.id)
    .single();

  console.log('\n--- PROFILES TABLE LINKAGE ---');
  console.log('Profile Query Error:', profileErr);
  console.log('Profile Record:', profileData);
  const workspaceId = profileData?.workspace_id;

  if (!workspaceId) {
    console.error('CRITICAL: workspace_id could not be resolved from profiles table!');
    process.exit(1);
  }

  // Step 1: Trace Exact Product Save Payload
  console.log('\n==================================================');
  console.log('STEP 1 — PRODUCT SAVE PAYLOAD & VERBATIM ERROR');
  console.log('==================================================');

  const testProductData = {
    workspace_id: workspaceId,
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

  console.log('Exact Payload Sent to products table:');
  console.dir(testProductData, { depth: null });

  // 1. Delete pre-existing test product if exists
  await supabase.from('products').delete().eq('workspace_id', workspaceId).eq('product_code', '10000778');

  // 2. Perform raw insert into products table
  console.log('\nExecuting raw Supabase INSERT into products table...');
  const prodRes = await supabase
    .from('products')
    .insert([testProductData])
    .select('*');

  console.log('\n--- PRODUCTS INSERT RESPONSE ---');
  console.log('Status / StatusText:', (prodRes as any).status, (prodRes as any).statusText);
  if (prodRes.error) {
    console.error('VERBATIM ERROR OBJECT (products INSERT):');
    console.log({
      code: prodRes.error.code,
      message: prodRes.error.message,
      details: prodRes.error.details,
      hint: prodRes.error.hint,
      status: (prodRes as any).status,
    });
  } else {
    console.log('Products Insert SUCCESS! Inserted Row:', prodRes.data);
  }

  // 3. Test Category auto-creation payload if category is inserted
  console.log('\nExecuting raw Supabase INSERT into categories table (Category auto-creation check)...');
  const catPayload = { workspace_id: workspaceId, name: 'Electronics', description: 'Auto-created category' };
  console.log('Category Payload:', catPayload);

  const catRes = await supabase.from('categories').insert([catPayload]).select('*');
  console.log('--- CATEGORIES INSERT RESPONSE ---');
  console.log('Status / StatusText:', (catRes as any).status, (catRes as any).statusText);
  if (catRes.error) {
    console.error('VERBATIM ERROR OBJECT (categories INSERT):');
    console.log({
      code: catRes.error.code,
      message: catRes.error.message,
      details: catRes.error.details,
      hint: catRes.error.hint,
      status: (catRes as any).status,
    });
  } else {
    console.log('Categories Insert SUCCESS! Inserted Row:', catRes.data);
  }

  // 4. Test Stock Receipts insert payload (Opening stock GRN creation)
  if (prodRes.data && prodRes.data.length > 0) {
    const createdProdId = prodRes.data[0].id;
    console.log('\nExecuting raw Supabase INSERT into stock_receipts table (Initial Stock GRN check)...');
    const receiptPayload = {
      workspace_id: workspaceId,
      product_id: createdProdId,
      receipt_number: `GRN-${Date.now()}`,
      received_date: '2026-09-04',
      quantity_received: 80,
      quantity_remaining: 80,
      buy_price: 600,
      notes: 'Initial Stock on Creation',
    };
    console.log('Stock Receipt Payload:', receiptPayload);

    const rcptRes = await supabase.from('stock_receipts').insert([receiptPayload]).select('*');
    console.log('--- STOCK RECEIPTS INSERT RESPONSE ---');
    console.log('Status / StatusText:', (rcptRes as any).status, (rcptRes as any).statusText);
    if (rcptRes.error) {
      console.error('VERBATIM ERROR OBJECT (stock_receipts INSERT):');
      console.log({
        code: rcptRes.error.code,
        message: rcptRes.error.message,
        details: rcptRes.error.details,
        hint: rcptRes.error.hint,
        status: (rcptRes as any).status,
      });
    } else {
      console.log('Stock Receipts Insert SUCCESS! Inserted Row:', rcptRes.data);
    }
  }

  // Step 3 — Dump database security config via rpc / query if available
  console.log('\n==================================================');
  console.log('STEP 3 — DUMPING DATABASE SECURITY CONFIG');
  console.log('==================================================');

  // Try querying pg_policies via supabase query
  const { data: policiesData, error: polErr } = await supabase
    .from('pg_policies' as any)
    .select('*')
    .in('tablename', ['products', 'categories', 'stock_receipts', 'inventory_transactions']);

  if (polErr) {
    console.log('Direct pg_policies REST query notice (RLS restricts direct pg_catalog querying over REST):', polErr.message);
  } else {
    console.log('pg_policies Data:', policiesData);
  }
}

runForensicAudit().catch((err) => {
  console.error('Forensic audit execution error:', err);
  process.exit(1);
});
