const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  const res = await client.query(`
    SELECT id, invoice_number, customer_name, status, date, grand_total, paid_amount, balance_amount, notes, snapshot
    FROM public.invoices
    WHERE workspace_id = $1
    ORDER BY date ASC;
  `, [targetWsId]);

  for (const r of res.rows) {
    console.log(`\n=== INVOICE: ${r.invoice_number} (${r.customer_name}) ===`);
    console.log(`Date: ${r.date.toISOString().split('T')[0]} | Status: ${r.status}`);
    console.log(`Grand Total: ${r.grand_total} | Paid: ${r.paid_amount} | Balance: ${r.balance_amount}`);
    console.log(`Notes: ${r.notes}`);
    console.log(`Snapshot:`, JSON.stringify(r.snapshot));
  }

  await client.end();
}

main().catch(console.error);
