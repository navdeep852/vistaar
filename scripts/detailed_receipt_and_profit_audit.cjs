const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  console.log('=== 1. INVOICE ITEMS & COGS ===');
  const items = await client.query(`
    SELECT ii.id, ii.invoice_id, i.invoice_number, i.customer_name, ii.product_name,
           ii.product_id, ii.quantity, ii.buy_price, ii.selling_price, ii.discount_amount,
           ii.tax_percent, ii.tax_amount, ii.total
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE i.workspace_id = $1
    ORDER BY i.created_at, ii.id;
  `, [targetWsId]);
  console.log('Total invoice items:', items.rows.length);
  console.table(items.rows);

  console.log('\n=== 2. COUNTER SALES ===');
  const csSample = await client.query('SELECT * FROM public.counter_sales WHERE workspace_id = $1', [targetWsId]);
  console.table(csSample.rows);

  console.log('\n=== 3. PRODUCTS CATALOG (Purchase vs Selling Prices) ===');
  const prods = await client.query('SELECT id, name, sku, purchase_price, selling_price, mrp, created_at FROM public.products WHERE workspace_id = $1', [targetWsId]);
  console.table(prods.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
