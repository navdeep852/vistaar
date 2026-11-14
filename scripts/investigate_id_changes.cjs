const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  const oldIds = [
    'ec203807-080b-4043-8f4e-61579835ef1a',
    'bff6d1b8-a3bb-463e-8f9b-f28d1ce8de0a',
    'cafbc992-feb8-4452-989d-33367a1d80ce',
    '88163dc7-f09d-405b-a993-0a2655256b99',
    '097946a0-6e5b-40ca-a7de-6b46e76459aa',
    'de539f79-1906-49ee-b3fb-ccfc28333ca6'
  ];

  const newIds = [
    'da7ec6a6-0ae0-4ecb-95bb-db2251fb1549',
    '3827ec3c-a91d-4009-8473-0428f5793081',
    'f2d3d3ef-fa48-4386-b484-fe8032ec13d8',
    '6b97db92-4f32-47da-8182-3d44d03d368e',
    'd1754402-9993-4921-9952-473d0a92d245',
    'de539f79-1906-49ee-b3fb-ccfc28333ca6'
  ];

  const invNumbers = [
    'INV-1793121391634',
    'INV-1793121731629',
    'INV-1793156334257',
    'INV-1793207161478',
    'INV-1793379764932',
    'INV-1793382157122'
  ];

  console.log('=== 1. Checking old IDs across ALL workspaces in public.invoices ===');
  const resOld = await client.query('SELECT id, workspace_id, invoice_number, customer_name, grand_total, status, created_at, updated_at FROM public.invoices WHERE id = ANY($1)', [oldIds]);
  console.log('Old IDs found count:', resOld.rows.length);
  console.table(resOld.rows);

  console.log('=== 2. Checking new IDs across ALL workspaces in public.invoices ===');
  const resNew = await client.query('SELECT id, workspace_id, invoice_number, customer_name, grand_total, status, created_at, updated_at FROM public.invoices WHERE id = ANY($1)', [newIds]);
  console.log('New IDs found count:', resNew.rows.length);
  console.table(resNew.rows);

  console.log('=== 3. Checking all rows matching the 6 invoice numbers across ALL workspaces ===');
  const resNumbers = await client.query('SELECT id, workspace_id, invoice_number, customer_name, grand_total, status, created_at, updated_at FROM public.invoices WHERE invoice_number = ANY($1) ORDER BY invoice_number, created_at', [invNumbers]);
  console.log('Invoice numbers found count:', resNumbers.rows.length);
  console.table(resNumbers.rows);

  console.log('=== 4. Checking old payment ID dd4aa0f0-ee06-461e-9eff-46e1c143afb5 vs new payment ID dd4aa0f0-c5fc-4fa5-ba0d-9b6279fec151 ===');
  const resPay = await client.query('SELECT id, workspace_id, invoice_id, amount, payment_mode, payment_date, created_at FROM public.payments WHERE id IN ($1, $2) OR invoice_id = ANY($3)', [
    'dd4aa0f0-ee06-461e-9eff-46e1c143afb5',
    'dd4aa0f0-c5fc-4fa5-ba0d-9b6279fec151',
    [...oldIds, ...newIds]
  ]);
  console.table(resPay.rows);

  console.log('=== 5. Checking all workspaces in public.invoices ===');
  const resWs = await client.query('SELECT workspace_id, COUNT(*) as cnt FROM public.invoices GROUP BY workspace_id');
  console.table(resWs.rows);

  console.log('=== 6. Checking audit logs / record history or deleted records if available ===');
  // Check if there are any audit tables or activity logs
  const tablesRes = await client.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND (table_name ILIKE '%audit%' OR table_name ILIKE '%log%' OR table_name ILIKE '%history%');
  `);
  console.log('Audit/log/history tables:', tablesRes.rows);

  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

