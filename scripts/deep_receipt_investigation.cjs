const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  console.log('=== 1. ALL TABLES IN POSTGRESQL ===');
  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);
  console.log(tables.rows.map(r => r.table_name));

  console.log('\n=== 2. ALL ROWS IN public.payments ===');
  const pay = await client.query('SELECT * FROM public.payments WHERE workspace_id = $1', [targetWsId]);
  console.table(pay.rows);

  console.log('\n=== 3. ALL ROWS IN public.udhari_payments ===');
  const udp = await client.query('SELECT * FROM public.udhari_payments WHERE workspace_id = $1', [targetWsId]);
  console.log('udhari_payments count:', udp.rows.length);
  console.table(udp.rows);

  console.log('\n=== 4. ALL ROWS IN public.counter_sales ===');
  const cs = await client.query('SELECT * FROM public.counter_sales WHERE workspace_id = $1', [targetWsId]);
  console.table(cs.rows);

  console.log('\n=== 5. ALL ROWS IN public.daybook_transactions ===');
  const db = await client.query('SELECT * FROM public.daybook_transactions WHERE workspace_id = $1 ORDER BY created_at ASC', [targetWsId]);
  console.table(db.rows);

  console.log('\n=== 6. CHECK FOR OTHER TRANSACTION / CASHBOOK TABLES ===');
  for (const t of tables.rows) {
    const tname = t.table_name;
    if (tname.includes('cash') || tname.includes('receipt') || tname.includes('transaction') || tname.includes('entry') || tname.includes('journal') || tname.includes('ledger') || tname.includes('settlement')) {
      try {
        const cnt = await client.query(`SELECT COUNT(*) as c FROM public."${tname}" WHERE workspace_id = $1`, [targetWsId]);
        console.log(`Table ${tname} count in workspace:`, cnt.rows[0].c);
        if (Number(cnt.rows[0].c) > 0) {
          const sample = await client.query(`SELECT * FROM public."${tname}" WHERE workspace_id = $1 LIMIT 5`, [targetWsId]);
          console.table(sample.rows);
        }
      } catch (e) {
        console.log(`Table ${tname} error or no workspace_id column:`, e.message);
      }
    }
  }

  await client.end();
}
main().catch(console.error);

