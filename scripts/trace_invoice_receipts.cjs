const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  console.log('=== 1. CHECK ALL PUBLIC TABLES IN DATABASE ===');
  const tablesRes = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  console.log('Public tables:', tablesRes.rows.map(r => r.table_name).join(', '));

  console.log('\n=== 2. ALL INVOICES WITH SNAPSHOT AND CUSTOMIZATION ===');
  const invRes = await client.query(`
    SELECT id, invoice_number, customer_id, customer_name, status, date, due_date,
           subtotal, discount_total, tax_total, grand_total, paid_amount, balance_amount,
           notes, snapshot, customization, created_at, updated_at
    FROM public.invoices
    WHERE workspace_id = $1
    ORDER BY date ASC, created_at ASC;
  `, [targetWsId]);
  
  for (const inv of invRes.rows) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Invoice: ${inv.invoice_number} | ID: ${inv.id}`);
    console.log(`Customer: ${inv.customer_name} | Status: ${inv.status} | Date: ${inv.date.toISOString().split('T')[0]}`);
    console.log(`Grand Total: ${inv.grand_total} | Paid: ${inv.paid_amount} | Balance: ${inv.balance_amount}`);
    console.log(`Notes: ${inv.notes}`);
    console.log(`Created: ${inv.created_at.toISOString()} | Updated: ${inv.updated_at.toISOString()}`);
    console.log(`Snapshot keys:`, inv.snapshot ? Object.keys(inv.snapshot) : null);
    if (inv.snapshot) {
      console.log(`Snapshot payment details:`, {
        payment_method: inv.snapshot.payment_method || inv.snapshot.paymentMethod,
        payment_status: inv.snapshot.payment_status || inv.snapshot.paymentStatus,
        paid_amount: inv.snapshot.paid_amount || inv.snapshot.paidAmount,
        balance_amount: inv.snapshot.balance_amount || inv.snapshot.balanceAmount,
        payments: inv.snapshot.payments,
        initial_payment: inv.snapshot.initial_payment || inv.snapshot.initialPayment,
        branch_id: inv.snapshot.branch_id || inv.snapshot.branchId,
      });
    }
    if (inv.customization) {
      console.log(`Customization:`, JSON.stringify(inv.customization));
    }
  }

  console.log('\n=== 3. ALL DAYBOOK TRANSACTIONS IN TARGET WORKSPACE ===');
  const dbRes = await client.query(`
    SELECT *
    FROM public.daybook_transactions
    WHERE workspace_id = $1
    ORDER BY transaction_date ASC, created_at ASC;
  `, [targetWsId]);
  console.log(`Count of daybook_transactions: ${dbRes.rows.length}`);
  console.table(dbRes.rows.map(r => ({
    id: r.id,
    type: r.transaction_type,
    direction: r.direction,
    amount: Number(r.amount),
    mode: r.payment_mode,
    ref_type: r.reference_type,
    ref_num: r.reference_number,
    ref_id: r.reference_id,
    party: r.party_name,
    date: r.transaction_date ? r.transaction_date.toISOString().split('T')[0] : null,
    notes: r.notes,
    created_at: r.created_at ? r.created_at.toISOString() : null
  })));

  console.log('\n=== 4. ALL PAYMENTS IN TARGET WORKSPACE ===');
  const payRes = await client.query(`
    SELECT *
    FROM public.payments
    WHERE workspace_id = $1
    ORDER BY payment_date ASC;
  `, [targetWsId]);
  console.log(`Count of payments: ${payRes.rows.length}`);
  console.table(payRes.rows.map(r => ({
    id: r.id,
    inv_id: r.invoice_id,
    inv_num: r.invoice_number,
    customer: r.customer_name,
    amount: Number(r.amount),
    method: r.method,
    date: r.payment_date ? r.payment_date.toISOString().split('T')[0] : null,
    ref: r.reference_no,
    notes: r.notes,
    created_at: r.created_at ? r.created_at.toISOString() : null
  })));

  await client.end();
}

main().catch(console.error);
