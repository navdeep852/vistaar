const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  console.log('=== PRODUCTS TABLE COLUMNS ===');
  const pCols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products';
  `);
  console.log('Product cols:', pCols.rows.map(r => r.column_name));

  const prods = await client.query('SELECT * FROM public.products WHERE workspace_id = $1', [targetWsId]);
  console.table(prods.rows);

  console.log('=== COUNTER SALE ITEMS / DETAILS ===');
  const csCols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'counter_sales';
  `);
  console.log('Counter sales cols:', csCols.rows.map(r => r.column_name));

  // Check if counter_sales has any items column or if there is another table
  const allTbls = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name ILIKE '%counter%';
  `);
  console.log('Counter tables:', allTbls.rows.map(r => r.table_name));

  for (const t of allTbls.rows) {
    if (t.table_name !== 'counter_sales') {
      const r = await client.query(`SELECT * FROM public."${t.table_name}" LIMIT 5`);
      console.log(`Table ${t.table_name}:`, r.rows);
    }
  }

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

