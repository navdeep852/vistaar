const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  console.log('--- 1. TRIGGERS ON auth.users ---');
  const trg = await client.query(`
    SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing
    FROM information_schema.triggers 
    WHERE (event_object_schema = 'auth' AND event_object_table = 'users')
       OR (event_object_schema = 'public' AND event_object_table IN ('profiles', 'workspaces'));
  `);
  console.log(trg.rows);

  console.log('\n--- 2. FUNCTION public.handle_new_user DEFINITION ---');
  const fn = await client.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';
  `);
  if (fn.rows.length > 0) {
    console.log(fn.rows[0].def);
  } else {
    console.log('handle_new_user not found');
  }

  console.log('\n--- 3. CONSTRAINTS ON public.workspaces & public.profiles ---');
  const constraints = await client.query(`
    SELECT conname, contype, pg_get_constraintdef(oid) as def, conrelid::regclass as tbl
    FROM pg_constraint
    WHERE conrelid IN ('public.workspaces'::regclass, 'public.profiles'::regclass, 'public.business_settings'::regclass);
  `);
  console.log(constraints.rows);

  console.log('\n--- 4. WORKSPACES SUMMARY ---');
  const ws = await client.query(`
    SELECT id, company_name, owner_name, owner_email, created_at
    FROM public.workspaces
    ORDER BY created_at DESC LIMIT 10;
  `);
  console.log(ws.rows);

  console.log('\n--- 5. PROFILES SUMMARY ---');
  const prof = await client.query(`
    SELECT id, workspace_id, employee_id, name, email, role, status, created_at
    FROM public.profiles
    ORDER BY created_at DESC LIMIT 10;
  `);
  console.log(prof.rows);

  console.log('\n--- 6. RECENT AUDIT LOGS IN auth ---');
  try {
    const logs = await client.query(`
      SELECT id, payload, created_at
      FROM auth.audit_log_entries
      ORDER BY created_at DESC LIMIT 5;
    `);
    console.log(logs.rows);
  } catch (e) {
    console.log('Error reading audit logs:', e.message);
  }

  console.log('\n--- 8. current_user_workspace_id DEFINITION ---');
  const wsFn = await client.query(`
    SELECT pg_get_functiondef(oid) as def FROM pg_proc WHERE proname = 'current_user_workspace_id';
  `);
  if (wsFn.rows.length > 0) {
    console.log(wsFn.rows[0].def);
  }

  console.log('\n--- 9. BUSINESS SETTINGS & INVENTORY SETTINGS COLS ---');
  const bsCols = await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'business_settings';`);
  console.log('business_settings cols:', bsCols.rows);
  const invCols = await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'inventory_settings';`);
  console.log('inventory_settings cols:', invCols.rows);

  await client.end();
}

main().catch(err => {
  console.error('Error in inspect_auth_schema:', err);
  process.exit(1);
});
