const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query('SELECT * FROM public.invoices WHERE workspace_id = $1 ORDER BY date ASC;', ['ddb10dc7-3671-4def-9626-526afd473c1a']);
  res.rows.forEach(r => {
    console.log(JSON.stringify(r, null, 2));
  });
  await client.end();
}

main().catch(console.error);

