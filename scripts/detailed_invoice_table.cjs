const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT id, invoice_number, customer_name, status, date, due_date, subtotal, tax_total, grand_total, paid_amount, balance_amount, created_at, updated_at
    FROM public.invoices
    WHERE workspace_id = $1
    ORDER BY date ASC;
  `, [targetWsId]);

  console.table(res.rows.map(r => ({
    id: r.id,
    number: r.invoice_number,
    customer: r.customer_name,
    status: r.status,
    date: r.date.toISOString().split('T')[0],
    due: r.due_date ? r.due_date.toISOString().split('T')[0] : null,
    grandTotal: Number(r.grand_total),
    paidAmount: Number(r.paid_amount),
    balanceAmount: Number(r.balance_amount),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString()
  })));

  await client.end();
}

main().catch(console.error);

