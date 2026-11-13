const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';
const startDateStr = '2026-10-01';
const endDateStr = '2026-11-12';

async function main() {
  await client.connect();

  // Invoices with line items
  const invRes = await client.query(`
    SELECT i.*, 
           json_agg(ii.*) FILTER (WHERE ii.id IS NOT NULL) as invoice_items
    FROM public.invoices i
    LEFT JOIN public.invoice_items ii ON ii.invoice_id = i.id
    WHERE i.workspace_id = $1
    GROUP BY i.id
    ORDER BY i.date ASC, i.created_at ASC;
  `, [targetWsId]);

  // Payments
  const payRes = await client.query(`
    SELECT *
    FROM public.payments
    WHERE workspace_id = $1
    ORDER BY payment_date ASC;
  `, [targetWsId]);

  // Udhari records with udhari payments
  const udhariRes = await client.query(`
    SELECT u.*,
           json_agg(up.*) FILTER (WHERE up.id IS NOT NULL) as udhari_payments
    FROM public.udhari_records u
    LEFT JOIN public.udhari_payments up ON up.udhari_id = u.id
    WHERE u.workspace_id = $1
    GROUP BY u.id
    ORDER BY u.created_at ASC;
  `, [targetWsId]);

  // Standalone udhari payments
  const udhariPayRes = await client.query(`
    SELECT up.*
    FROM public.udhari_payments up
    JOIN public.udhari_records u ON u.id = up.udhari_id
    WHERE u.workspace_id = $1;
  `, [targetWsId]);

  // Counter sales with line items
  const csRes = await client.query(`
    SELECT cs.*,
           json_agg(csi.*) FILTER (WHERE csi.id IS NOT NULL) as counter_sale_items
    FROM public.counter_sales cs
    LEFT JOIN public.counter_sale_items csi ON csi.counter_sale_id = cs.id
    WHERE cs.workspace_id = $1
    GROUP BY cs.id
    ORDER BY cs.sale_date ASC;
  `, [targetWsId]);

  // Products
  const prodRes = await client.query(`
    SELECT *
    FROM public.products
    WHERE workspace_id = $1;
  `, [targetWsId]);

  // Expenses
  const expRes = await client.query(`
    SELECT *
    FROM public.expenses
    WHERE workspace_id = $1;
  `, [targetWsId]);

  // Daybook
  const dbRes = await client.query(`
    SELECT *
    FROM public.daybook_transactions
    WHERE workspace_id = $1
    ORDER BY transaction_date ASC;
  `, [targetWsId]);

  await client.end();

  // Format objects for FinancialAnalyticsEngine
  const invoices = invRes.rows.map(r => ({
    ...r,
    date: r.date ? r.date.toISOString().split('T')[0] : null,
    due_date: r.due_date ? r.due_date.toISOString().split('T')[0] : null,
    invoice_items: r.invoice_items || []
  }));

  const payments = payRes.rows.map(r => ({
    ...r,
    payment_date: r.payment_date ? r.payment_date.toISOString().split('T')[0] : null
  }));

  const udhariRecords = udhariRes.rows.map(r => ({
    ...r,
    created_at: r.created_at ? r.created_at.toISOString() : null,
    due_date: r.due_date ? r.due_date.toISOString().split('T')[0] : null,
    udhari_payments: r.udhari_payments || []
  }));

  const udhariPayments = udhariPayRes.rows.map(r => ({
    ...r,
    payment_date: r.payment_date ? r.payment_date.toISOString().split('T')[0] : null
  }));

  const counterSales = csRes.rows.map(r => ({
    ...r,
    sale_date: r.sale_date ? r.sale_date.toISOString().split('T')[0] : null,
    counter_sale_items: r.counter_sale_items || []
  }));

  const products = prodRes.rows;
  const expenses = expRes.rows.map(r => ({
    ...r,
    expense_date: r.expense_date ? r.expense_date.toISOString().split('T')[0] : null
  }));

  // Save as JSON fixture for engine execution
  const engineInput = {
    workspaceId: targetWsId,
    startDateStr,
    endDateStr,
    invoices,
    counterSales,
    payments,
    udhariPayments,
    udhariRecords,
    products,
    expenses
  };

  fs.writeFileSync('scripts/live_workspace_engine_input.json', JSON.stringify(engineInput, null, 2));
  console.log('Saved live workspace engine input:');
  console.log(`- Invoices: ${invoices.length}`);
  console.log(`- Counter Sales: ${counterSales.length}`);
  console.log(`- Payments: ${payments.length}`);
  console.log(`- Udhari Records: ${udhariRecords.length}`);
  console.log(`- Products: ${products.length}`);
  console.log(`- Expenses: ${expenses.length}`);
  console.log(`- Daybook: ${dbRes.rows.length}`);
}

main().catch(console.error);
