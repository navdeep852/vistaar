const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  const invRes = await client.query(`
    SELECT i.id, i.invoice_number, i.customer_name, i.grand_total, i.paid_amount, i.balance_amount, i.date,
           p.amount as pay_amount, p.method as pay_method, p.payment_date as pay_date,
           d.amount as db_amount, d.payment_mode as db_mode, d.transaction_date as db_date
    FROM public.invoices i
    LEFT JOIN public.payments p ON p.invoice_id = i.id OR p.invoice_number = i.invoice_number
    LEFT JOIN public.daybook_transactions d ON d.reference_id = i.id::text OR d.reference_number = i.invoice_number
    WHERE i.workspace_id = $1
    ORDER BY i.date ASC;
  `, [targetWsId]);

  console.table(invRes.rows);

  await client.end();
}

main().catch(console.error);
