const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  const iiRes = await client.query(`
    SELECT ii.id as item_id, ii.invoice_id, i.invoice_number, i.customer_name,
           ii.product_name, ii.product_id, ii.quantity, ii.buy_price, ii.selling_price,
           ii.discount_amount, ii.tax_percent, ii.tax_amount, ii.total
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE i.workspace_id = $1
    ORDER BY i.created_at, ii.id;
  `, [targetWsId]);

  const csiRes = await client.query(`
    SELECT csi.id as item_id, csi.counter_sale_id, cs.sale_number, cs.customer_name,
           csi.product_name_snapshot, csi.product_id, csi.quantity, csi.buy_price_snapshot,
           csi.rate, cs.discount_amount, cs.final_total
    FROM public.counter_sale_items csi
    JOIN public.counter_sales cs ON csi.counter_sale_id = cs.id
    WHERE cs.workspace_id = $1
    ORDER BY cs.created_at, csi.id;
  `, [targetWsId]);

  console.log('| # | Document | Item / Product | Qty | Unit Sell (₹) | Recognized Gross (₹) | Recognized Net (₹) | Historical Buy (₹) | COGS (₹) | Gross Profit (Gross-COGS) (₹) | Gross Profit (Net-COGS) (₹) |');
  console.log('|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');

  let idx = 1;
  let totGross = 0;
  let totNet = 0;
  let totCogs = 0;
  let totGPGross = 0;
  let totGPNet = 0;

  for (const r of iiRes.rows) {
    const qty = Number(r.quantity);
    const sell = Number(r.selling_price);
    const gross = Number(r.total);
    const net = (qty * sell) - Number(r.discount_amount);
    const buy = Number(r.buy_price);
    const cogs = qty * buy;
    const gpGross = gross - cogs;
    const gpNet = net - cogs;

    totGross += gross;
    totNet += net;
    totCogs += cogs;
    totGPGross += gpGross;
    totGPNet += gpNet;

    console.log(`| ${idx++} | \`${r.invoice_number}\` | ${r.product_name} | ${qty.toFixed(2)} | ${sell.toFixed(2)} | ${gross.toFixed(2)} | ${net.toFixed(2)} | ${buy.toFixed(2)} | ${cogs.toFixed(2)} | ${gpGross.toFixed(2)} | ${gpNet.toFixed(2)} |`);
  }

  for (const r of csiRes.rows) {
    const qty = Number(r.quantity);
    const sell = Number(r.rate);
    const gross = Number(r.final_total);
    const net = Number(r.final_total);
    const buy = Number(r.buy_price_snapshot);
    const cogs = qty * buy;
    const gpGross = gross - cogs;
    const gpNet = net - cogs;

    totGross += gross;
    totNet += net;
    totCogs += cogs;
    totGPGross += gpGross;
    totGPNet += gpNet;

    console.log(`| ${idx++} | \`${r.sale_number}\` | ${r.product_name_snapshot} | ${qty.toFixed(2)} | ${sell.toFixed(2)} | ${gross.toFixed(2)} | ${net.toFixed(2)} | ${buy.toFixed(2)} | ${cogs.toFixed(2)} | ${gpGross.toFixed(2)} | ${gpNet.toFixed(2)} |`);
  }

  console.log(`| **TOTAL** | **8 Inv + 2 CS** | | | | **${totGross.toFixed(2)}** | **${totNet.toFixed(2)}** | | **${totCogs.toFixed(2)}** | **${totGPGross.toFixed(2)}** | **${totGPNet.toFixed(2)}** |`);

  await client.end();
}
main().catch(console.error);

