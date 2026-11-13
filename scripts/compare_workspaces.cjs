const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const oldWs = '6f1c2f0f-1aca-4f87-a7e1-655dbdb89b18';
const newWs = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();
  const tables = [
    'invoices',
    'invoice_items',
    'counter_sales',
    'counter_sale_items',
    'payments',
    'udhari_records',
    'udhari_payments',
    'quotations',
    'quotation_items',
    'expenses',
    'daybook_transactions',
    'customers',
    'products'
  ];

  console.log('Comparing table row counts for both workspace IDs:');
  for (const t of tables) {
    try {
      const r1 = await client.query(`SELECT count(*) FROM public.${t} WHERE workspace_id = $1`, [oldWs]);
      const r2 = await client.query(`SELECT count(*) FROM public.${t} WHERE workspace_id = $1`, [newWs]);
      console.log(`- ${t.padEnd(25)} | oldWs (6f1c2f0f): ${r1.rows[0].count.padStart(4)} | newWs (ddb10dc7): ${r2.rows[0].count.padStart(4)}`);
    } catch (e) {
      console.log(`- ${t.padEnd(25)} | error: ${e.message}`);
    }
  }

  // Check workspaces table for oldWs
  const wsRes = await client.query(`SELECT id, company_name FROM public.workspaces WHERE id IN ($1, $2)`, [oldWs, newWs]);
  console.log('\nWorkspaces table rows:');
  console.table(wsRes.rows);

  await client.end();
}

main().catch(console.error);

