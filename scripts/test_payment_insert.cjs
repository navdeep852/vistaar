const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  console.log('Testing insert into payments without payment_number:');
  try {
    await client.query(`
      INSERT INTO public.payments (workspace_id, customer_name, amount, payment_date, method)
      VALUES ('ddb10dc7-3671-4def-9626-526afd473c1a', 'Test', 100, '2026-10-26', 'Cash');
    `);
  } catch (err) {
    console.log('Failed as expected:', err.message, 'Code:', err.code);
  }

  await client.end();
}

main().catch(console.error);

