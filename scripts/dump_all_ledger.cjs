const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  // Financial Accounts
  console.log('\n--- FINANCIAL ACCOUNTS ---');
  const faRes = await client.query(`
    SELECT id, name, account_type, account_number, is_default, is_active
    FROM public.financial_accounts
    WHERE workspace_id = $1;
  `, [targetWsId]);
  console.log('Count:', faRes.rows.length);
  if (faRes.rows.length > 0) {
    console.table(faRes.rows);
  }

  // All Udhari Records
  console.log('\n--- UDHARI RECORDS (ALL WORKSPACES) ---');
  const allU = await client.query(`SELECT id, workspace_id, customer_name_snapshot, original_amount, total_received, outstanding_amount, status FROM public.udhari_records;`);
  console.log('Total across all workspaces:', allU.rows.length);
  if (allU.rows.length > 0) {
    console.table(allU.rows);
  }

  // All Payments
  console.log('\n--- PAYMENTS (ALL WORKSPACES) ---');
  const allP = await client.query(`SELECT id, workspace_id, invoice_number, amount, payment_date, method FROM public.payments;`);
  console.log('Total across all workspaces:', allP.rows.length);
  if (allP.rows.length > 0) {
    console.table(allP.rows);
  }

  await client.end();
}

main().catch(console.error);
