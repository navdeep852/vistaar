const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  console.log('--- Search all invoices in all workspaces for 38573 or Stark or 1793380066266 ---');
  const res1 = await client.query(`
    SELECT id, workspace_id, invoice_number, customer_name, grand_total, paid_amount, balance_amount, status, created_at
    FROM public.invoices
    WHERE grand_total::text LIKE '%38573%'
       OR invoice_number LIKE '%1793380066266%'
       OR customer_name ILIKE '%stark%';
  `);
  console.log('Invoices match:', res1.rows);

  console.log('--- Search quotations in all workspaces ---');
  const res2 = await client.query(`
    SELECT id, workspace_id, quotation_number, customer_name, grand_total, status, created_at
    FROM public.quotations
    WHERE grand_total::text LIKE '%38573%'
       OR quotation_number LIKE '%1793380066266%'
       OR customer_name ILIKE '%stark%';
  `);
  console.log('Quotations match:', res2.rows);

  console.log('--- Search counter_sales in all workspaces ---');
  const res3 = await client.query(`
    SELECT id, workspace_id, sale_number, invoice_number, customer_name, final_total, status, created_at
    FROM public.counter_sales
    WHERE final_total::text LIKE '%38573%'
       OR customer_name ILIKE '%stark%';
  `);
  console.log('Counter sales match:', res3.rows);

  console.log('--- Search daybook_transactions for 38573 or Stark ---');
  const res4 = await client.query(`
    SELECT id, workspace_id, transaction_type, direction, amount, payment_mode, reference_type, reference_number, party_name
    FROM public.daybook_transactions
    WHERE amount::text LIKE '%38573%'
       OR party_name ILIKE '%stark%';
  `);
  console.log('Daybook match:', res4.rows);

  await client.end();
}
main().catch(console.error);

