const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  const invs = await client.query(`
    SELECT id, invoice_number, customer_name, customer_phone, status, date, due_date, grand_total, paid_amount, balance_amount, notes, snapshot
    FROM public.invoices
    WHERE workspace_id = $1
    ORDER BY date ASC;
  `, [targetWsId]);

  for (const inv of invs.rows) {
    console.log(`\n======================================================`);
    console.log(`INVOICE: ${inv.invoice_number} | Status: ${inv.status} | Customer: ${inv.customer_name}`);
    console.log(`Total: ${inv.grand_total} | Paid: ${inv.paid_amount} | Balance: ${inv.balance_amount}`);
    console.log(`Date: ${inv.date.toISOString().split('T')[0]} | Due: ${inv.due_date ? inv.due_date.toISOString().split('T')[0] : null}`);
    console.log(`Notes: ${inv.notes}`);
    console.log(`Snapshot branch:`, inv.snapshot?.branchId || inv.snapshot?.branch_id || 'NONE');

    // Payments for this invoice
    const p = await client.query(`SELECT * FROM public.payments WHERE invoice_id = $1 OR invoice_number = $2;`, [inv.id, inv.invoice_number]);
    console.log(`Payments in public.payments (${p.rows.length}):`, p.rows.map(x => ({ id: x.id, amount: Number(x.amount), date: x.payment_date, method: x.method })));

    // Daybook transactions for this invoice
    const db = await client.query(`SELECT * FROM public.daybook_transactions WHERE reference_number = $1 OR reference_id = $2;`, [inv.invoice_number, inv.id]);
    console.log(`Daybook entries (${db.rows.length}):`, db.rows.map(x => ({ code: x.transaction_code, type: x.transaction_type, amount: Number(x.amount), mode: x.payment_mode, date: x.transaction_date })));

    // Udhari records for this invoice
    const u = await client.query(`SELECT * FROM public.udhari_records WHERE invoice_id = $1;`, [inv.id]);
    console.log(`Udhari records (${u.rows.length}):`, u.rows);
  }

  await client.end();
}

main().catch(console.error);

