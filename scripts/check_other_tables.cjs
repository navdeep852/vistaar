const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  console.log('=== FINANCIAL ACCOUNTS ===');
  const faRes = await client.query(`SELECT * FROM public.financial_accounts WHERE workspace_id = $1`, [targetWsId]);
  console.table(faRes.rows);

  console.log('=== ALL PAYMENTS IN WORKSPACE (ANY WORKSPACE) ===');
  const allPay = await client.query(`SELECT id, workspace_id, invoice_number, customer_name, amount, method, payment_date FROM public.payments WHERE invoice_number IN ('INV-1793121391634', 'INV-1793121731629', 'INV-1793156334257', 'INV-1793207161478', 'INV-1793379764932', 'INV-1793382157122')`);
  console.table(allPay.rows);

  console.log('=== ALL UDHARI IN WORKSPACE (ANY WORKSPACE) FOR THESE INVOICES ===');
  const allUd = await client.query(`SELECT id, workspace_id, udhari_code, customer_name_snapshot, original_amount, total_received, outstanding_amount, status FROM public.udhari_records WHERE udhari_code LIKE '%1793%'`);
  console.table(allUd.rows);

  console.log('=== ALL UDHARI PAYMENTS IN WORKSPACE (ANY WORKSPACE) ===');
  const allUp = await client.query(`SELECT * FROM public.udhari_payments WHERE udhari_id IN (SELECT id FROM public.udhari_records WHERE workspace_id = $1)`, [targetWsId]);
  console.table(allUp.rows);

  await client.end();
}

main().catch(console.error);

