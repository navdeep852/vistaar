const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const oldWs = '6f1c2f0f-1aca-4f87-a7e1-655dbdb89b18';

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT id, udhari_code, customer_name_snapshot, phone_snapshot, original_amount, total_received, outstanding_amount, due_date, status, notes
    FROM public.udhari_records
    WHERE workspace_id = $1
    LIMIT 5;
  `, [oldWs]);
  console.table(res.rows);
  await client.end();
}

main().catch(console.error);

