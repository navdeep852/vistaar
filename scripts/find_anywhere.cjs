const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();

  const searchUuids = [
    'da7ec6a6-0ae0-4ecb-95bb-db2251fb1549',
    '3827ec3c-a91d-4009-8473-0428f5793081',
    'f2d3d3ef-fa48-4386-b484-fe8032ec13d8',
    '6b97db92-4f32-47da-8182-3d44d03d368e',
    'd1754402-9993-4921-9952-473d0a92d245',
    'dd4aa0f0-c5fc-4fa5-ba0d-9b6279fec151'
  ];

  const tables = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND (data_type = 'uuid' OR udt_name = 'uuid')
  `);

  console.log(`Searching ${tables.rows.length} UUID columns in public schema...`);
  for (const col of tables.rows) {
    try {
      const q = `SELECT "${col.column_name}" as found_id, '${col.table_name}' as tbl, '${col.column_name}' as col FROM public."${col.table_name}" WHERE "${col.column_name}" = ANY($1)`;
      const r = await client.query(q, [searchUuids]);
      if (r.rows.length > 0) {
        console.log('FOUND MATCH:', r.rows);
      }
    } catch (e) {
      // ignore
    }
  }

  // Also search text columns across all tables
  const textCols = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type IN ('text', 'character varying')
  `);
  console.log(`Searching ${textCols.rows.length} text columns in public schema...`);
  for (const col of textCols.rows) {
    try {
      const q = `SELECT "${col.column_name}" as found_val, '${col.table_name}' as tbl, '${col.column_name}' as col FROM public."${col.table_name}" WHERE "${col.column_name}" = ANY($1)`;
      const r = await client.query(q, [searchUuids]);
      if (r.rows.length > 0) {
        console.log('FOUND MATCH in text col:', r.rows);
      }
    } catch (e) {
      // ignore
    }
  }

  console.log('Done searching.');
  await client.end();
}
main().catch(console.error);

