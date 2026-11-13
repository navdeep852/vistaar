const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query(`SELECT * FROM public.invoices WHERE invoice_number = 'INV-1793207161478';`);
  console.log(JSON.stringify(res.rows[0], null, 2));

  // Check if any udhari record has invoice_number or code matching INV-1793207161478
  const u = await client.query(`SELECT * FROM public.udhari_records WHERE udhari_code LIKE '%1793207161478%';`);
  console.log('Matching udhari records:', u.rows);

  await client.end();
}

main().catch(console.error);

