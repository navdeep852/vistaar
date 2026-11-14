const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
async function main() {
  await client.connect();
  const r = await client.query('SELECT * FROM public.counter_sale_items WHERE workspace_id = $1', ['ddb10dc7-3671-4def-9626-526afd473c1a']);
  console.log('CS items for ddb10dc7 count:', r.rows.length);
  console.table(r.rows);
  await client.end();
}
main().catch(console.error);

