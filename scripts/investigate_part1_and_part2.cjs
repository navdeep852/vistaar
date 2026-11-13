const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  console.log('========================================================================');
  console.log('PART 1 — AUTHORITATIVE INVOICE RECORDS FROM POSTGRESQL');
  console.log('========================================================================');

  const invQuery = `
    SELECT id, invoice_number, customer_id, customer_name, grand_total, paid_amount, balance_amount,
           status, date, due_date, notes, snapshot, created_at, updated_at
    FROM public.invoices
    WHERE workspace_id = $1
    ORDER BY date ASC, created_at ASC;
  `;
  const invRes = await client.query(invQuery, [targetWsId]);

  let sumGrandTotal = 0;
  let sumPaid = 0;
  let sumBalance = 0;

  for (const inv of invRes.rows) {
    const gt = Number(inv.grand_total);
    const pd = Number(inv.paid_amount);
    const bal = Number(inv.balance_amount);
    sumGrandTotal += gt;
    sumPaid += pd;
    sumBalance += bal;

    const branch = inv.snapshot?.branch_id || inv.snapshot?.branchId || (inv.notes && inv.notes.match(/\[branch:\s*([a-f0-9-]+)\]/i)?.[1]) || 'null (Main)';

    console.log(`\n------------------------------------------------------------------------`);
    console.log(`Invoice: ${inv.invoice_number} | ID: ${inv.id}`);
    console.log(`Customer: "${inv.customer_name}" (ID: ${inv.customer_id})`);
    console.log(`Date: ${inv.date ? inv.date.toISOString().split('T')[0] : 'null'} | Due Date: ${inv.due_date ? inv.due_date.toISOString().split('T')[0] : 'null'}`);
    console.log(`Status: ${inv.status} | Branch: ${branch}`);
    console.log(`Grand Total: ₹${gt.toFixed(2)} | Paid: ₹${pd.toFixed(2)} | Balance: ₹${bal.toFixed(2)}`);
    console.log(`Notes: ${JSON.stringify(inv.notes)}`);
    console.log(`Created At: ${inv.created_at.toISOString()} | Updated At: ${inv.updated_at.toISOString()}`);
    console.log(`Snapshot keys:`, inv.snapshot ? Object.keys(inv.snapshot) : 'null');
    if (inv.snapshot) {
      console.log(`Snapshot payment/branch fields:`, {
        branch_id: inv.snapshot.branch_id || inv.snapshot.branchId,
        payment_method: inv.snapshot.payment_method || inv.snapshot.paymentMethod,
        paid_amount: inv.snapshot.paid_amount || inv.snapshot.paidAmount,
        balance_amount: inv.snapshot.balance_amount || inv.snapshot.balanceAmount,
        source: inv.snapshot.source || inv.snapshot.conversion || inv.snapshot.counter_sale_id || inv.snapshot.counterSaleId
      });
    }

    // Line items
    const itemsRes = await client.query(`
      SELECT *
      FROM public.invoice_items
      WHERE invoice_id = $1;
    `, [inv.id]);
    console.log(`Line items count: ${itemsRes.rows.length}`);
    console.table(itemsRes.rows.map(r => ({
      id: r.id,
      product_id: r.product_id,
      product_name: r.product_name,
      quantity: r.quantity,
      price: r.price,
      total: r.total,
      buy_price: r.buy_price
    })));
  }

  console.log(`\n========================================================================`);
  console.log(`MATHEMATICAL SUM OF THE SIX INVOICES:`);
  console.log(`Sum of Grand Totals:   ₹${sumGrandTotal.toFixed(2)}`);
  console.log(`Sum of Paid Amounts:   ₹${sumPaid.toFixed(2)}`);
  console.log(`Sum of Balance Amounts: ₹${sumBalance.toFixed(2)}`);
  console.log(`Check: Paid + Balance = ₹${(sumPaid + sumBalance).toFixed(2)} (Diff from Grand Total: ₹${(sumGrandTotal - (sumPaid + sumBalance)).toFixed(2)})`);
  console.log(`========================================================================`);

  console.log(`\n========================================================================`);
  console.log(`PART 2 — INVESTIGATE COUNTER SALES AND STARK INVOICE`);
  console.log(`========================================================================`);

  const csQuery = `
    SELECT *
    FROM public.counter_sales
    WHERE workspace_id = $1
    ORDER BY sale_date ASC, created_at ASC;
  `;
  const csRes = await client.query(csQuery, [targetWsId]);
  console.log(`Counter sales count in workspace: ${csRes.rows.length}`);

  for (const cs of csRes.rows) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`Counter Sale ID: ${cs.id}`);
    console.log(`Sale Number: "${cs.sale_number}" | Invoice Number field: "${cs.invoice_number}"`);
    console.log(`Customer: "${cs.customer_name}" | Phone: "${cs.customer_phone || cs.phone}"`);
    console.log(`Sale Date: ${cs.sale_date ? cs.sale_date.toISOString().split('T')[0] : 'null'}`);
    console.log(`Subtotal: ₹${cs.subtotal} | Final Total: ₹${cs.final_total} | Amount Received: ₹${cs.amount_received} | Balance: ₹${cs.balance_amount}`);
    console.log(`Payment Method: "${cs.payment_method}" | Status: "${cs.status}"`);
    console.log(`Notes: ${JSON.stringify(cs.notes)}`);
    console.log(`Created At: ${cs.created_at.toISOString()} | Updated At: ${cs.updated_at.toISOString()}`);
    console.log(`Snapshot:`, cs.snapshot ? JSON.stringify(cs.snapshot, null, 2) : 'null');

    // Line items
    const csItemsRes = await client.query(`
      SELECT *
      FROM public.counter_sale_items
      WHERE counter_sale_id = $1;
    `, [cs.id]);
    console.log(`Line items for counter sale ${cs.sale_number}:`, csItemsRes.rows);
  }

  console.log(`\n========================================================================`);
  console.log(`DAYBOOK ENTRIES FOR COUNTER SALES AND STARK INVOICE`);
  console.log(`========================================================================`);
  const dbRes = await client.query(`
    SELECT *
    FROM public.daybook_transactions
    WHERE workspace_id = $1
      AND (
        reference_number IN ('CS-1793207348004', 'CS-1793382371526', 'INV-2026-80202', 'CMN-2001', 'INV-1793380066266')
        OR reference_id IN (SELECT id::text FROM public.counter_sales WHERE workspace_id = $1)
        OR party_name ILIKE '%stark%'
        OR party_name ILIKE '%parker%'
      )
    ORDER BY transaction_date ASC, created_at ASC;
  `, [targetWsId]);
  console.table(dbRes.rows.map(r => ({
    id: r.id,
    type: r.transaction_type,
    dir: r.direction,
    amount: Number(r.amount),
    mode: r.payment_mode,
    ref_type: r.reference_type,
    ref_num: r.reference_number,
    ref_id: r.reference_id,
    party: r.party_name,
    date: r.transaction_date ? r.transaction_date.toISOString().split('T')[0] : null,
    notes: r.notes
  })));

  await client.end();
}

main().catch(console.error);
