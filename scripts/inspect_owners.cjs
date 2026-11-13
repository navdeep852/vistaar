const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const ws = await client.query(`SELECT * FROM public.workspaces;`);
  console.log('Workspaces:');
  console.table(ws.rows);

  const prof = await client.query(`SELECT id, email, workspace_id, role, created_at FROM public.profiles;`);
  console.log('Profiles:');
  console.table(prof.rows);

  await client.end();
}

main().catch(console.error);
