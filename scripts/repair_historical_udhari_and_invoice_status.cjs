const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL successfully.');

  // =========================================================================
  // PART C: Controlled Repair of Missing Historical Udhari Record
  // =========================================================================
  console.log('\n--- PART C: REPAIR HISTORICAL UDHARI RECORD ---');
  
  // 1. Fetch authoritative invoice INV-1793207161478
  const invRes = await client.query(`
    SELECT id, workspace_id, customer_id, customer_name, customer_phone, invoice_number,
           grand_total, paid_amount, balance_amount, date, due_date, status, snapshot, created_at, updated_at
    FROM public.invoices
    WHERE workspace_id = $1 AND invoice_number = 'INV-1793207161478';
  `, [targetWsId]);

  if (invRes.rows.length === 0) {
    throw new Error('Invoice INV-1793207161478 not found in workspace ' + targetWsId);
  }

  const inv = invRes.rows[0];
  console.log('Found authoritative invoice:', {
    number: inv.invoice_number,
    customer: inv.customer_name,
    phone: inv.customer_phone,
    grand_total: inv.grand_total,
    paid_amount: inv.paid_amount,
    balance_amount: inv.balance_amount,
    status: inv.status
  });

  const branchId = inv.snapshot?.branch_id || inv.snapshot?.branchId || '4330d620-c0f8-4261-905b-7386b7e82520';
  const udhariNotes = `[branch: ${branchId}]`;
  const udhariCode = `UD-${inv.invoice_number}`;

  // 2. Insert Udhari record idempotently
  const insertUdhariRes = await client.query(`
    INSERT INTO public.udhari_records (
      workspace_id,
      customer_id,
      udhari_code,
      customer_name_snapshot,
      phone_snapshot,
      original_amount,
      total_received,
      outstanding_amount,
      due_date,
      status,
      notes,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (workspace_id, udhari_code) 
    DO UPDATE SET
      customer_name_snapshot = EXCLUDED.customer_name_snapshot,
      phone_snapshot = EXCLUDED.phone_snapshot,
      original_amount = EXCLUDED.original_amount,
      total_received = EXCLUDED.total_received,
      outstanding_amount = EXCLUDED.outstanding_amount,
      due_date = EXCLUDED.due_date,
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    RETURNING id, udhari_code, customer_name_snapshot, original_amount, total_received, outstanding_amount, status, notes;
  `, [
    targetWsId,
    inv.customer_id, // null
    udhariCode,
    inv.customer_name || 'Chris',
    inv.customer_phone || '9907656354',
    Number(inv.grand_total),
    Number(inv.paid_amount),
    Number(inv.balance_amount),
    inv.due_date ? inv.due_date.toISOString().split('T')[0] : '2026-11-12',
    'PARTIALLY PAID',
    udhariNotes,
    inv.created_at,
    inv.updated_at
  ]);

  console.log('Udhari record successfully created/verified:');
  console.table(insertUdhariRes.rows);

  // =========================================================================
  // PART D: Correct Invoice Status for INV-1793156334257
  // =========================================================================
  console.log('\n--- PART D: CORRECT INVOICE STATUS FOR INV-1793156334257 ---');
  
  const invDRes = await client.query(`
    SELECT id, invoice_number, customer_name, status, grand_total, paid_amount, balance_amount
    FROM public.invoices
    WHERE workspace_id = $1 AND invoice_number = 'INV-1793156334257';
  `, [targetWsId]);

  console.log('Before update:');
  console.table(invDRes.rows);

  if (invDRes.rows.length > 0 && Number(invDRes.rows[0].balance_amount) <= 0.01) {
    const updateStatusRes = await client.query(`
      UPDATE public.invoices
      SET status = 'Paid', updated_at = NOW()
      WHERE workspace_id = $1 AND invoice_number = 'INV-1793156334257' AND status != 'Paid'
      RETURNING id, invoice_number, customer_name, status, grand_total, paid_amount, balance_amount, updated_at;
    `, [targetWsId]);

    console.log('After update:');
    if (updateStatusRes.rows.length > 0) {
      console.table(updateStatusRes.rows);
    } else {
      console.log('Status was already Paid or not eligible for update.');
    }
  }

  // =========================================================================
  // Verification: Audit All Six Invoices & Udhari Records
  // =========================================================================
  console.log('\n--- VERIFICATION OF POST-REPAIR STATE ---');
  const allInv = await client.query(`
    SELECT invoice_number, customer_name, status, grand_total, paid_amount, balance_amount
    FROM public.invoices
    WHERE workspace_id = $1
    ORDER BY date ASC;
  `, [targetWsId]);
  console.table(allInv.rows);

  const allUd = await client.query(`
    SELECT udhari_code, customer_name_snapshot, status, original_amount, total_received, outstanding_amount, notes
    FROM public.udhari_records
    WHERE workspace_id = $1;
  `, [targetWsId]);
  console.log('Udhari records count:', allUd.rows.length);
  console.table(allUd.rows);

  await client.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

