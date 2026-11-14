const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  console.log('=== 1. COUNTER SALES (SELECT *) ===');
  const csRes = await client.query(`
    SELECT *
    FROM public.counter_sales
    WHERE workspace_id = $1
    ORDER BY created_at ASC;
  `, [targetWsId]);
  console.table(csRes.rows);

  console.log('=== 2. UDHARI RECORDS (SELECT *) ===');
  const udRes = await client.query(`
    SELECT *
    FROM public.udhari_records
    WHERE workspace_id = $1
    ORDER BY created_at ASC;
  `, [targetWsId]);
  console.table(udRes.rows);

  console.log('=== 3. DAYBOOK TRANSACTIONS (SELECT *) ===');
  const dbRes = await client.query(`
    SELECT *
    FROM public.daybook_transactions
    WHERE workspace_id = $1
    ORDER BY created_at ASC;
  `, [targetWsId]);
  console.table(dbRes.rows);

  console.log('=== 4. INVOICE ITEMS (SELECT *) ===');
  const itemsRes = await client.query(`
    SELECT ii.*, i.invoice_number
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE i.workspace_id = $1
    ORDER BY i.created_at, ii.created_at;
  `);
  console.table(itemsRes.rows);

  console.log('=== 5. CHECK IF counter_sale_items or counter_sales.items EXISTS ===');
  const csCols = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'counter_sales';
  `);
  console.table(csCols.rows);

  console.log('=== 6. PRODUCTS CATALOG ===');
  const prodRes = await client.query(`
    SELECT id, name, sku, purchase_price, selling_price, mrp, created_at, updated_at
    FROM public.products
    WHERE workspace_id = $1;
  `, [targetWsId]);
  console.table(prodRes.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
