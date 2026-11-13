const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL successfully.');

  // 1. Invoices
  console.log('\n================================================================');
  console.log('1. ALL INVOICES IN WORKSPACE');
  console.log('================================================================');
  const invRes = await client.query(`
    SELECT id, workspace_id, invoice_number, customer_id, customer_name, status, date, grand_total, paid_amount, balance_amount, notes, created_at
    FROM public.invoices
    WHERE workspace_id = $1
    ORDER BY date ASC;
  `, [targetWsId]);
  console.table(invRes.rows.map(r => ({
    number: r.invoice_number,
    customer: r.customer_name,
    status: r.status,
    date: r.date,
    grand_total: Number(r.grand_total),
    paid_amount: Number(r.paid_amount),
    balance_amount: Number(r.balance_amount),
    notes: r.notes
  })));

  // 2. Payments
  console.log('\n================================================================');
  console.log('2. ALL PAYMENTS IN WORKSPACE');
  console.log('================================================================');
  const payRes = await client.query(`
    SELECT id, workspace_id, invoice_id, invoice_number, customer_id, customer_name, amount, payment_date, method, reference_no, notes, created_at
    FROM public.payments
    WHERE workspace_id = $1
    ORDER BY payment_date ASC;
  `, [targetWsId]);
  console.table(payRes.rows.map(r => ({
    id: r.id,
    invoice_number: r.invoice_number,
    customer: r.customer_name,
    amount: Number(r.amount),
    date: r.payment_date,
    method: r.method,
    reference_no: r.reference_no,
    notes: r.notes
  })));

  // 3. Counter Sales
  console.log('\n================================================================');
  console.log('3. ALL COUNTER SALES IN WORKSPACE');
  console.log('================================================================');
  const csRes = await client.query(`
    SELECT id, workspace_id, sale_number, invoice_number, customer_name, subtotal, final_total, amount_received, balance_amount, payment_method, status, sale_date, notes
    FROM public.counter_sales
    WHERE workspace_id = $1
    ORDER BY sale_date ASC;
  `, [targetWsId]);
  console.table(csRes.rows.map(r => ({
    sale_number: r.sale_number,
    invoice_number: r.invoice_number,
    customer: r.customer_name,
    subtotal: Number(r.subtotal),
    final_total: Number(r.final_total),
    received: Number(r.amount_received),
    balance: Number(r.balance_amount),
    method: r.payment_method,
    status: r.status,
    date: r.sale_date,
    notes: r.notes
  })));

  // 4. Udhari Records
  console.log('\n================================================================');
  console.log('4. ALL UDHARI RECORDS IN WORKSPACE');
  console.log('================================================================');
  const uRes = await client.query(`
    SELECT *
    FROM public.udhari_records
    WHERE workspace_id = $1;
  `, [targetWsId]);
  console.log('udhari_records count:', uRes.rows.length);
  if (uRes.rows.length > 0) {
    console.table(uRes.rows);
  }

  // 5. Udhari Payments
  console.log('\n================================================================');
  console.log('5. ALL UDHARI PAYMENTS IN WORKSPACE');
  console.log('================================================================');
  const upRes = await client.query(`
    SELECT *
    FROM public.udhari_payments
    WHERE workspace_id = $1;
  `, [targetWsId]);
  console.log('udhari_payments count:', upRes.rows.length);
  if (upRes.rows.length > 0) {
    console.table(upRes.rows);
  }

  // 6. Daybook Transactions
  console.log('\n================================================================');
  console.log('6. DAYBOOK TRANSACTIONS IN WORKSPACE');
  console.log('================================================================');
  const dbRes = await client.query(`
    SELECT id, reference_type, reference_number, transaction_type, direction, amount, payment_mode, party_name, transaction_date
    FROM public.daybook_transactions
    WHERE workspace_id = $1
    ORDER BY transaction_date ASC;
  `, [targetWsId]);
  console.log('daybook_transactions count:', dbRes.rows.length);
  console.table(dbRes.rows.map(r => ({
    ref_type: r.reference_type,
    ref_num: r.reference_number,
    tx_type: r.transaction_type,
    dir: r.direction,
    amount: Number(r.amount),
    total: Number(r.total_amount),
    remaining: Number(r.remaining_amount),
    status: r.payment_status,
    mode: r.payment_mode,
    party: r.party_name,
    date: r.transaction_date
  })));

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
