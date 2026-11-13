const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('invoice_items', 'udhari_records', 'udhari_payments')
    ORDER BY table_name, ordinal_position;
  `);
  console.table(res.rows);
  await client.end();
}

main().catch(console.error);
