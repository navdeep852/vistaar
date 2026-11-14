const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
async function main() {
  await client.connect();
  const r = await client.query(`
    SELECT id, transaction_code, transaction_date, transaction_type, direction,
           amount, payment_mode, party_name, reference_type, reference_id,
           reference_number, description, status, created_at
    FROM public.daybook_transactions
    WHERE workspace_id = $1
    ORDER BY created_at ASC;
  `, ['ddb10dc7-3671-4def-9626-526afd473c1a']);
  console.log('Total daybook rows:', r.rows.length);
  for (const row of r.rows) {
    console.log(`[${row.id}] Date: ${row.transaction_date.toISOString().split('T')[0]} | Type: ${row.transaction_type} | Dir: ${row.direction} | Amount: ₹${row.amount} | Mode: ${row.payment_mode} | Party: "${row.party_name}" | RefType: ${row.reference_type} | RefNum: ${row.reference_number} | RefId: ${row.reference_id} | Desc: "${row.description}"`);
  }
  await client.end();
}
main().catch(console.error);

