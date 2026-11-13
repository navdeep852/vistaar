import { supabase } from '../src/lib/supabase.ts';
import { FinancialAnalyticsEngine, toPaise, fromPaise } from '../src/services/analytics/financialAnalyticsEngine.ts';
import { isRecordInBranch } from '../src/lib/branchUtils.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function main() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  const wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';
  const startDateStr = '2026-10-01';
  const endDateStr = '2026-11-12';

  // 1. Fetch Invoices with line items
  const { data: rawInvoices } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('workspace_id', wsId)
    .in('status', ['Issued', 'Partially Paid', 'Paid'])
    .gte('date', startDateStr)
    .lte('date', endDateStr);

  // 2. Fetch Counter Sales with line items
  const { data: rawCounterSales } = await supabase
    .from('counter_sales')
    .select('*, counter_sale_items(*)')
    .eq('workspace_id', wsId)
    .eq('status', 'COMPLETED')
    .gte('sale_date', startDateStr)
    .lte('sale_date', endDateStr);

  // 3. Fetch Payments
  const { data: rawPayments } = await supabase
    .from('payments')
    .select('*')
    .eq('workspace_id', wsId)
    .gte('payment_date', startDateStr)
    .lte('payment_date', endDateStr);

  // 4. Fetch Products catalog for fallback
  const { data: rawProducts } = await supabase
    .from('products')
    .select('*')
    .eq('workspace_id', wsId);

  const mainBranchId = '5c456a11-1321-40af-9c79-0fa151419922';
  const northBranchId = '4330d620-c0f8-4261-905b-7386b7e82520';
  const southBranchId = '398bd10a-903e-47ff-8c47-3261f683ef40';

  const getBranchAssignment = (record: any): 'MAIN' | 'NORTH' | 'SOUTH' | 'UNASSIGNED' => {
    const bId = record.branch_id || record.branchId || record.snapshot?.branch_id || record.snapshot?.branchId;
    const notes = record.notes || record.terms || '';
    if (isRecordInBranch(mainBranchId, bId, notes)) return 'MAIN';
    if (isRecordInBranch(northBranchId, bId, notes)) return 'NORTH';
    if (isRecordInBranch(southBranchId, bId, notes)) return 'SOUTH';
    return 'UNASSIGNED';
  };

  const categories = {
    MAIN: { name: 'Main Branch (5c456a11-1321-40af-9c79-0fa151419922)', invs: [] as any[], cs: [] as any[], pays: [] as any[] },
    NORTH: { name: 'North Branch (4330d620-c0f8-4261-905b-7386b7e82520)', invs: [] as any[], cs: [] as any[], pays: [] as any[] },
    SOUTH: { name: 'South Branch (398bd10a-903e-47ff-8c47-3261f683ef40)', invs: [] as any[], cs: [] as any[], pays: [] as any[] },
    UNASSIGNED: { name: 'Unassigned (Historical Workspace-Wide)', invs: [] as any[], cs: [] as any[], pays: [] as any[] },
  };

  (rawInvoices || []).forEach(inv => {
    const cat = getBranchAssignment(inv);
    categories[cat].invs.push(inv);
  });

  (rawCounterSales || []).forEach(cs => {
    const cat = getBranchAssignment(cs);
    categories[cat].cs.push(cs);
  });

  (rawPayments || []).forEach(p => {
    // Determine payment branch assignment
    const bId = p.branch_id || p.branchId || p.snapshot?.branch_id || p.snapshot?.branchId;
    const notes = p.notes || '';
    if (bId || notes.includes('[branch')) {
      const cat = getBranchAssignment(p);
      categories[cat].pays.push(p);
    } else {
      // Link to invoice
      const linkedInv = (rawInvoices || []).find(inv => inv.id === p.invoice_id || inv.invoice_number === p.invoice_number);
      if (linkedInv) {
        const cat = getBranchAssignment(linkedInv);
        categories[cat].pays.push(p);
      } else {
        categories.UNASSIGNED.pays.push(p);
      }
    }
  });

  console.log('========================================================================================');
  console.log('TASK 2: AUTHORITATIVE BRANCH & UNASSIGNED FINANCIAL RECONCILIATION');
  console.log('========================================================================================');

  const reportData: any[] = [];
  let sumSalesPaise = 0;
  let sumCollectionsPaise = 0;
  let sumCashPaise = 0;
  let sumUpiPaise = 0;
  let sumCogsPaise = 0;
  let sumGrossProfitPaise = 0;

  for (const [key, cat] of Object.entries(categories)) {
    const engineRes = FinancialAnalyticsEngine.calculate({
      workspaceId: wsId,
      branchId: key,
      startDateStr,
      endDateStr,
      invoices: cat.invs,
      counterSales: cat.cs,
      payments: cat.pays,
      products: rawProducts || [],
    });

    const cogs = engineRes.audit.grossProfitAudit.totalCogs;
    const kpis = engineRes.kpis;

    sumSalesPaise += toPaise(kpis.totalSales);
    sumCollectionsPaise += toPaise(kpis.collections);
    sumCashPaise += toPaise(kpis.cashCollections);
    sumUpiPaise += toPaise(kpis.upiCollections);
    sumCogsPaise += toPaise(cogs);
    sumGrossProfitPaise += toPaise(kpis.grossProfit);

    reportData.push({
      Category: cat.name,
      InvoicesCount: cat.invs.length,
      CounterSalesCount: cat.cs.length,
      TotalSales: kpis.totalSales,
      Collections: kpis.collections,
      Cash: kpis.cashCollections,
      UPI: kpis.upiCollections,
      COGS: cogs,
      GrossProfit: kpis.grossProfit,
      MarginPct: `${kpis.profitMarginPercent}%`,
    });
  }

  // Calculate Overall from all raw data together
  const overallEngineRes = FinancialAnalyticsEngine.calculate({
    workspaceId: wsId,
    branchId: 'ALL',
    startDateStr,
    endDateStr,
    invoices: rawInvoices || [],
    counterSales: rawCounterSales || [],
    payments: rawPayments || [],
    products: rawProducts || [],
  });
  const overall = overallEngineRes.kpis;
  const overallCogs = overallEngineRes.audit.grossProfitAudit.totalCogs;

  console.table(reportData);

  console.log('\n--- DETAILED RECONCILIATION AUDIT ---');
  console.log(`Sum of Categories Total Sales:    ₹${fromPaise(sumSalesPaise).toFixed(2)} | Overall Total Sales:    ₹${overall.totalSales.toFixed(2)} | Variance: ₹${(fromPaise(sumSalesPaise) - overall.totalSales).toFixed(2)}`);
  console.log(`Sum of Categories Collections:    ₹${fromPaise(sumCollectionsPaise).toFixed(2)} | Overall Collections:    ₹${overall.collections.toFixed(2)} | Variance: ₹${(fromPaise(sumCollectionsPaise) - overall.collections).toFixed(2)}`);
  console.log(`Sum of Categories Cash:           ₹${fromPaise(sumCashPaise).toFixed(2)} | Overall Cash:           ₹${overall.cashCollections.toFixed(2)} | Variance: ₹${(fromPaise(sumCashPaise) - overall.cashCollections).toFixed(2)}`);
  console.log(`Sum of Categories UPI:            ₹${fromPaise(sumUpiPaise).toFixed(2)} | Overall UPI:            ₹${overall.upiCollections.toFixed(2)} | Variance: ₹${(fromPaise(sumUpiPaise) - overall.upiCollections).toFixed(2)}`);
  console.log(`Sum of Categories COGS:           ₹${fromPaise(sumCogsPaise).toFixed(2)} | Overall COGS:           ₹${overallCogs.toFixed(2)} | Variance: ₹${(fromPaise(sumCogsPaise) - overallCogs).toFixed(2)}`);
  console.log(`Sum of Categories Gross Profit:   ₹${fromPaise(sumGrossProfitPaise).toFixed(2)} | Overall Gross Profit:   ₹${overall.grossProfit.toFixed(2)} | Variance: ₹${(fromPaise(sumGrossProfitPaise) - overall.grossProfit).toFixed(2)}`);

  console.log('\n--- UNASSIGNED INVOICES ITEMIZATION (The ₹10,70,242.30) ---');
  categories.UNASSIGNED.invs.forEach(inv => {
    console.log(`- Invoice #${inv.invoice_number} | Date: ${inv.date} | Customer: ${inv.customer_name} | Amount: ₹${inv.grand_total} | Paid: ₹${inv.paid_amount} | Status: ${inv.status}`);
  });

  const exactParity =
    fromPaise(sumSalesPaise) === overall.totalSales &&
    fromPaise(sumCollectionsPaise) === overall.collections &&
    fromPaise(sumCashPaise) === overall.cashCollections &&
    fromPaise(sumUpiPaise) === overall.upiCollections &&
    fromPaise(sumCogsPaise) === overallCogs &&
    fromPaise(sumGrossProfitPaise) === overall.grossProfit;

  console.log('\nAll categories reconcile exactly to overall figures down to ₹0.00?', exactParity);
}

main().catch(console.error);
