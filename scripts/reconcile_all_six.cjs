const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  console.log('=== 1. SIX INVOICES IN WORKSPACE ddb10dc7-3671-4def-9626-526afd473c1a ===');
  const invRes = await client.query(`
    SELECT id, invoice_number, customer_id, customer_name, status, date, due_date,
           subtotal, discount_total, tax_total, grand_total, paid_amount, balance_amount,
           snapshot->>'branch_id' as branch_id, snapshot->>'payment_method' as payment_method,
           notes, created_at, updated_at
    FROM public.invoices
    WHERE workspace_id = $1
    ORDER BY date ASC;
  `, [targetWsId]);

  console.table(invRes.rows.map(r => ({
    id: r.id,
    number: r.invoice_number,
    customer_id: r.customer_id,
    customer: r.customer_name,
    status: r.status,
    date: r.date.toISOString().split('T')[0],
    due: r.due_date ? r.due_date.toISOString().split('T')[0] : null,
    subtotal: Number(r.subtotal),
    discount: Number(r.discount_total),
    tax: Number(r.tax_total),
    grandTotal: Number(r.grand_total),
    paidAmount: Number(r.paid_amount),
    balanceAmount: Number(r.balance_amount),
    branchId: r.branch_id,
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString()
  })));

  console.log('\n=== 2. INVOICE ITEMS FOR THE SIX INVOICES ===');
  const itemsRes = await client.query(`
    SELECT ii.invoice_id, i.invoice_number, ii.product_name, ii.quantity, ii.selling_price, ii.total, ii.buy_price
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.workspace_id = $1
    ORDER BY i.date ASC;
  `, [targetWsId]);
  console.table(itemsRes.rows.map(r => ({
    inv: r.invoice_number,
    item: r.product_name,
    qty: Number(r.quantity),
    rate: Number(r.selling_price),
    total: Number(r.total),
    cogs: Number(r.buy_price)
  })));

  console.log('\n=== 3. PAYMENTS TABLE RECORDS ===');
  const payRes = await client.query(`
    SELECT id, invoice_id, invoice_number, customer_id, customer_name, amount, payment_date, method, reference_no, created_at
    FROM public.payments
    WHERE workspace_id = $1
    ORDER BY payment_date ASC;
  `, [targetWsId]);
  console.table(payRes.rows.map(r => ({
    id: r.id,
    inv_id: r.invoice_id,
    inv_num: r.invoice_number,
    customer: r.customer_name,
    amount: Number(r.amount),
    date: r.payment_date.toISOString().split('T')[0],
    method: r.method,
    ref: r.reference_no,
    createdAt: r.created_at.toISOString()
  })));

  console.log('\n=== 4. UDHARI RECORDS (CUSTOMER CREDIT LEDGER) ===');
  const udRes = await client.query(`
    SELECT * FROM public.udhari_records WHERE workspace_id = $1;
  `, [targetWsId]);
  console.log('udhari_records count:', udRes.rows.length);
  if (udRes.rows.length > 0) {
    console.table(udRes.rows);
  }

  console.log('\n=== 5. UDHARI PAYMENTS ===');
  const upRes = await client.query(`
    SELECT * FROM public.udhari_payments WHERE workspace_id = $1;
  `, [targetWsId]);
  console.log('udhari_payments count:', upRes.rows.length);
  if (upRes.rows.length > 0) {
    console.table(upRes.rows);
  }

  console.log('\n=== 6. COUNTER SALES ===');
  const csRes = await client.query(`
    SELECT id, sale_number, invoice_number, customer_name, subtotal, final_total, amount_received, balance_amount, payment_method, status, sale_date
    FROM public.counter_sales
    WHERE workspace_id = $1
    ORDER BY sale_date ASC;
  `, [targetWsId]);
  console.table(csRes.rows.map(r => ({
    sale_num: r.sale_number,
    inv_num: r.invoice_number,
    customer: r.customer_name,
    total: Number(r.final_total),
    received: Number(r.amount_received),
    balance: Number(r.balance_amount),
    method: r.payment_method,
    status: r.status,
    date: r.sale_date.toISOString().split('T')[0]
  })));

  console.log('\n=== 7. DAYBOOK TRANSACTIONS FOR INVOICES ===');
  const dbRes = await client.query(`
    SELECT id, reference_type, reference_number, transaction_type, direction, amount, payment_mode, party_name, transaction_date
    FROM public.daybook_transactions
    WHERE workspace_id = $1
    ORDER BY transaction_date ASC;
  `, [targetWsId]);
  console.table(dbRes.rows.map(r => ({
    ref_type: r.reference_type,
    ref_num: r.reference_number,
    tx_type: r.transaction_type,
    dir: r.direction,
    amount: Number(r.amount),
    mode: r.payment_mode,
    party: r.party_name,
    date: r.transaction_date.toISOString().split('T')[0]
  })));

  await client.end();
}

main().catch(console.error);
