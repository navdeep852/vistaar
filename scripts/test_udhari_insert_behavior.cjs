const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  console.log('Testing insert with branch_id:');
  try {
    await client.query(`
      INSERT INTO public.udhari_records (workspace_id, branch_id, udhari_code, customer_name_snapshot, phone_snapshot, original_amount, total_received, outstanding_amount, due_date, status)
      VALUES ('ddb10dc7-3671-4def-9626-526afd473c1a', '4330d620-c0f8-4261-905b-7386b7e82520', 'TEST-1', 'Test', '9999999999', 100, 0, 100, '2026-11-01', 'UNPAID');
    `);
  } catch (err) {
    console.log('Failed as expected with branch_id:', err.message, 'Code:', err.code);
  }

  console.log('\nTesting insert with invoice_id:');
  try {
    await client.query(`
      INSERT INTO public.udhari_records (workspace_id, invoice_id, udhari_code, customer_name_snapshot, phone_snapshot, original_amount, total_received, outstanding_amount, due_date, status)
      VALUES ('ddb10dc7-3671-4def-9626-526afd473c1a', '88163dc7-f09d-405b-a993-0a2655256b99', 'TEST-2', 'Test', '9999999999', 100, 0, 100, '2026-11-01', 'UNPAID');
    `);
  } catch (err) {
    console.log('Failed as expected with invoice_id:', err.message, 'Code:', err.code);
  }

  await client.end();
}

main().catch(console.error);

