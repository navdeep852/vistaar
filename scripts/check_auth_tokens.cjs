const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const res = await client.query('SELECT id, email, created_at, last_sign_in_at FROM auth.users WHERE email = $1;', ['navdeep@vistaarone.com']);
  console.log('User in auth.users:', res.rows);
  if (res.rows.length > 0) {
    const rtk = await client.query('SELECT id, token, created_at, revoked FROM auth.refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5;', [res.rows[0].id]);
    console.log('Refresh tokens:', rtk.rows);
  }
  await client.end();
}

main().catch(console.error);
