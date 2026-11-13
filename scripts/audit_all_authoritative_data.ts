import { supabase } from '../src/lib/supabase.ts';
import { financialAnalyticsRepository } from '../src/services/analytics/financialAnalyticsRepository.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function main() {
  const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });
  if (sessionErr) {
    console.error('Session error:', sessionErr);
    return;
  }
  const user = sessionData.user;
  console.log('=== AUTHENTICATED USER ===');
  console.log('User ID:', user?.id);
  console.log('User Email:', user?.email);

  // 1. Workspaces
  const { data: workspaces, error: wsErr } = await supabase.from('workspaces').select('*');
  console.log('\n=== WORKSPACES IN DB ===');
  console.log('Total workspaces:', workspaces?.length);
  workspaces?.forEach(w => console.log(`- ID: ${w.id}, Name: ${w.name}, Owner: ${w.owner_id}, Created: ${w.created_at}`));

  // Check if 6f1c2f0f-1aca-4f87-a7e1-655dbdb89b18 exists
  const syntheticCheck = workspaces?.find(w => w.id === '6f1c2f0f-1aca-4f87-a7e1-655dbdb89b18');
  console.log('Does 6f1c2f0f-1aca-4f87-a7e1-655dbdb89b18 exist in DB?', !!syntheticCheck);

  const wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

  // 2. Business Settings & Branches
  const { data: settings } = await supabase.from('business_settings').select('*').eq('workspace_id', wsId);
  console.log('\n=== BUSINESS SETTINGS ===');
  if (settings && settings[0]) {
    const s = settings[0];
    console.log('Company Name:', s.company_name);
    console.log('Bank Details Raw:', JSON.stringify(s.bank_details));
    if (s.bank_details?._branches) {
      console.log('Stored Branches in bank_details._branches:');
      s.bank_details._branches.forEach((b: any) => console.log(`  * ${b.id} | ${b.name} | ${b.code} | isDefault: ${b.isDefault}`));
    }
  }

  // 3. Invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: true });
  console.log('\n=== INVOICES (' + invoices?.length + ') ===');
  invoices?.forEach(inv => {
    const branchTag = inv.notes?.match(/\[branch: ([^\]]+)\]/)?.[1] || inv.snapshot?.branch_id || 'unassigned';
    console.log(`- ID: ${inv.id} | No: ${inv.invoice_number} | Date: ${inv.date} | Total: ₹${inv.grand_total} | Paid: ₹${inv.paid_amount} | Status: ${inv.status} | Branch: ${branchTag} | Items: ${inv.invoice_items?.length}`);
  });

  // 4. Quotations
  const { data: quotations } = await supabase
    .from('quotations')
    .select('*, quotation_items(*)')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: true });
  console.log('\n=== QUOTATIONS (' + quotations?.length + ') ===');
  quotations?.forEach(q => {
    const branchTag = q.notes?.match(/\[branch: ([^\]]+)\]/)?.[1] || q.snapshot?.branch_id || 'unassigned';
    console.log(`- ID: ${q.id} | No: ${q.quotation_number} | Date: ${q.date} | Total: ₹${q.grand_total} | Status: ${q.status} | Branch: ${branchTag} | Items: ${q.quotation_items?.length}`);
  });

  // 5. Counter Sales
  const { data: counterSales } = await supabase
    .from('counter_sales')
    .select('*, counter_sale_items(*)')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: true });
  console.log('\n=== COUNTER SALES (' + counterSales?.length + ') ===');
  counterSales?.forEach(cs => {
    const branchTag = cs.notes?.match(/\[branch: ([^\]]+)\]/)?.[1] || cs.snapshot?.branch_id || 'unassigned';
    console.log(`- ID: ${cs.id} | Sale No: ${cs.sale_number} | Inv No: ${cs.invoice_number} | Customer: ${cs.customer_name} | Date: ${cs.sale_date} | Total: ₹${cs.final_total} | Recv: ₹${cs.amount_received} | Method: ${cs.payment_method} | Branch: ${branchTag}`);
  });

  // 6. Payments
  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: true });
  console.log('\n=== PAYMENTS (' + payments?.length + ') ===');
  payments?.forEach(p => {
    console.log(`- ID: ${p.id} | No: ${p.payment_number} | Inv ID: ${p.invoice_id} | Inv No: ${p.invoice_number} | Date: ${p.payment_date} | Amount: ₹${p.amount} | Method: ${p.payment_method || p.method} | Status: ${p.status} | Ref: ${p.reference_no}`);
  });

  // 7. Calculate Financials using financialAnalyticsRepository
  const dateRange = {
    startDateStr: '2026-10-01',
    endDateStr: '2026-11-12',
    mode: 'custom' as const,
    label: '01/10/2026 - 12/11/2026',
    timezone: 'Asia/Kolkata',
  };

  console.log('\n======================================================');
  console.log('AUTHORITATIVE FINANCIAL ANALYTICS (2026-10-01 to 2026-11-12)');
  console.log('======================================================');

  const branchesToTest = [
    { label: 'ALL BRANCHES', branchId: undefined },
    { label: 'MAIN BRANCH (5c456a11-1321-40af-9c79-0fa151419922)', branchId: '5c456a11-1321-40af-9c79-0fa151419922' },
    { label: 'NORTH BRANCH (4330d620-c0f8-4261-905b-7386b7e82520)', branchId: '4330d620-c0f8-4261-905b-7386b7e82520' },
    { label: 'SOUTH BRANCH (398bd10a-903e-47ff-8c47-3261f683ef40)', branchId: '398bd10a-903e-47ff-8c47-3261f683ef40' },
  ];

  for (const b of branchesToTest) {
    financialAnalyticsRepository.invalidateCache();
    const res = await financialAnalyticsRepository.getAuthoritativeFinancials({
      dateRange,
      branchId: b.branchId,
      explicitWsId: wsId,
      forceFresh: true,
    });

    console.log(`\n--- ${b.label} ---`);
    console.log(`Total Sales:         ₹${res.kpis.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Inv: ₹${res.kpis.invoiceSales.toLocaleString('en-IN')}, CS: ₹${res.kpis.counterSales.toLocaleString('en-IN')})`);
    console.log(`Collections:         ₹${res.kpis.collections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`Cash Collections:    ₹${res.kpis.cashCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`UPI Collections:     ₹${res.kpis.upiCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`Gross Profit:        ₹${res.kpis.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Margin: ${res.kpis.profitMarginPercent}%)`);
    console.log(`Outstanding Udhari:  ₹${res.kpis.outstandingUdhari.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`Total Transactions:  ${res.kpis.totalTransactions} (Inv: ${res.kpis.invoiceCount}, CS: ${res.kpis.counterSaleCount})`);
    console.log(`Query Errors:        ${res.audit.queryErrors?.length || 0}`);
  }
}

main().catch(console.error);

