const { Client } = require('d:/Project/vistaar-main/super_admin/node_modules/pg');
const client = new Client({
  connectionString: 'postgresql://postgres.kluxsykimnjivkqxelba:Navdeep0789@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetWsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

async function main() {
  await client.connect();

  const iiRes = await client.query(`
    SELECT ii.*, i.invoice_number, i.customer_name, i.grand_total as inv_grand_total
    FROM public.invoice_items ii
    JOIN public.invoices i ON ii.invoice_id = i.id
    WHERE i.workspace_id = $1
    ORDER BY i.created_at, ii.id;
  `, [targetWsId]);

  const csiRes = await client.query(`
    SELECT csi.*, cs.sale_number, cs.customer_name, cs.final_total as cs_final_total, cs.discount_amount
    FROM public.counter_sale_items csi
    JOIN public.counter_sales cs ON csi.counter_sale_id = cs.id
    WHERE cs.workspace_id = $1
    ORDER BY cs.created_at, csi.id;
  `, [targetWsId]);

  console.log('=== LINE-BY-LINE COGS & PROFIT ANALYSIS ===');
  let totalInvoiceRevenueGross = 0; // with tax
  let totalInvoiceRevenueNet = 0;   // without tax
  let totalInvoiceCOGS = 0;

  console.log('\n--- INVOICE ITEMS ---');
  for (const item of iiRes.rows) {
    const qty = Number(item.quantity);
    const sellPrice = Number(item.selling_price);
    const buyPrice = Number(item.buy_price);
    const taxAmt = Number(item.tax_amount);
    const itemTotalGross = Number(item.total); // includes tax
    const itemTotalNet = (qty * sellPrice) - Number(item.discount_amount);
    const itemCOGS = qty * buyPrice;
    const profitNet = itemTotalNet - itemCOGS;
    const profitGross = itemTotalGross - itemCOGS;

    totalInvoiceRevenueGross += itemTotalGross;
    totalInvoiceRevenueNet += itemTotalNet;
    totalInvoiceCOGS += itemCOGS;

    console.log(`${item.invoice_number} | ${item.product_name} | Qty: ${qty} | Sell: ${sellPrice} | Buy: ${buyPrice} | NetRev: ${itemTotalNet.toFixed(2)} | GrossRev: ${itemTotalGross.toFixed(2)} | COGS: ${itemCOGS.toFixed(2)} | NetProfit: ${profitNet.toFixed(2)} | GrossProfit: ${profitGross.toFixed(2)}`);
  }

  console.log('\n--- COUNTER SALE ITEMS ---');
  let totalCSRevenue = 0;
  let totalCSCOGS = 0;
  for (const csi of csiRes.rows) {
    const qty = Number(csi.quantity);
    const rate = Number(csi.rate);
    const buyPrice = Number(csi.buy_price_snapshot);
    const csRev = Number(csi.cs_final_total); // after discount
    const csCOGS = qty * buyPrice;
    const csProfit = csRev - csCOGS;

    totalCSRevenue += csRev;
    totalCSCOGS += csCOGS;

    console.log(`${csi.sale_number} | ${csi.product_name_snapshot} | Qty: ${qty} | Rate: ${rate} | Buy: ${buyPrice} | Rev: ${csRev.toFixed(2)} | COGS: ${csCOGS.toFixed(2)} | Profit: ${csProfit.toFixed(2)}`);
  }

  const grandTotalSalesGross = totalInvoiceRevenueGross + totalCSRevenue;
  const grandTotalSalesNet = totalInvoiceRevenueNet + totalCSRevenue;
  const grandTotalCOGS = totalInvoiceCOGS + totalCSCOGS;

  const grossProfit_OnGrossSales = grandTotalSalesGross - grandTotalCOGS;
  const grossProfit_OnNetSales = grandTotalSalesNet - grandTotalCOGS;

  console.log('\n======================================================');
  console.log('SUMMARY CALCULATIONS:');
  console.log('======================================================');
  console.log('Total Invoice Revenue (Gross / Incl Tax):', totalInvoiceRevenueGross.toFixed(2));
  console.log('Total Invoice Revenue (Net / Excl Tax):  ', totalInvoiceRevenueNet.toFixed(2));
  console.log('Total Counter Sale Revenue:              ', totalCSRevenue.toFixed(2));
  console.log('Total COGS (Invoice + CS):               ', grandTotalCOGS.toFixed(2));
  console.log('------------------------------------------------------');
  console.log('1. If Gross Profit = Gross Sales (Incl Tax) - COGS:');
  console.log(`   ${grandTotalSalesGross.toFixed(2)} - ${grandTotalCOGS.toFixed(2)} = ₹${grossProfit_OnGrossSales.toFixed(2)}`);
  console.log('2. If Gross Profit = Net Sales (Excl Tax) - COGS:');
  console.log(`   ${grandTotalSalesNet.toFixed(2)} - ${grandTotalCOGS.toFixed(2)} = ₹${grossProfit_OnNetSales.toFixed(2)}`);
  console.log('======================================================');

  // Let's check where 7,06,315.60 and 2,88,892.60 come from!
  console.log('\n--- INVESTIGATING ₹7,06,315.60 vs ₹2,88,892.60 ---');
  console.log('Difference: 706315.60 - 288892.60 =', (706315.60 - 288892.60).toFixed(2));
  console.log('Total Invoice Tax Amount:', (totalInvoiceRevenueGross - totalInvoiceRevenueNet).toFixed(2));

  // Let's check how financialAnalyticsEngine.ts calculates gross profit!
  await client.end();
}

main().catch(console.error);

