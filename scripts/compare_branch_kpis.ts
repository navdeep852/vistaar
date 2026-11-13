import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { resolveDateRange } from '../src/lib/dateRange.ts';
import { financialAnalyticsRepository } from '../src/services/analytics/financialAnalyticsRepository.ts';
import { supabase } from '../src/lib/supabase.ts';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function main() {
  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  const range = resolveDateRange('custom', '2026-10-01', '2026-11-12');
  console.log('Resolved Range:', range.startDateStr, 'to', range.endDateStr);

  const wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

  const branchTests = [
    { name: 'ALL BRANCHES', id: 'ALL' },
    { name: 'UNDEFINED (ALL)', id: undefined },
    { name: 'DESKTOP ACTIVE BRANCH (5c456a11)', id: '5c456a11-1321-40af-9c79-0fa151419922' },
    { name: 'BRANCH 4330d620', id: '4330d620-c0f8-4261-905b-7386b7e82520' },
    { name: 'BRANCH 398bd10a', id: '398bd10a-903e-47ff-8c47-3261f683ef40' },
  ];

  for (const b of branchTests) {
    financialAnalyticsRepository.invalidateCache();
    const res = await financialAnalyticsRepository.getAuthoritativeFinancials({
      dateRange: range,
      branchId: b.id,
      forceFresh: true,
      explicitWsId: wsId,
    });

    console.log(`\n=== RESULT FOR: ${b.name} (${b.id}) ===`);
    console.log(`Total Sales:         ₹${res.kpis.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`Collections:         ₹${res.kpis.collections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`Cash Collections:    ₹${res.kpis.cashCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`UPI Collections:     ₹${res.kpis.upiCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`Gross Profit:        ₹${res.kpis.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`Outstanding Udhari:  ₹${res.kpis.outstandingUdhari.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    console.log(`Audit: Invoices=${res.audit.invoices.eligible}/${res.audit.invoices.fetched}, CS=${res.audit.counterSales.eligible}/${res.audit.counterSales.fetched}, Payments=${res.audit.payments.eligible}/${res.audit.payments.fetched}`);
    if (res.audit.queryErrors.length) console.log('Query Errors:', res.audit.queryErrors);
  }
}

main().catch(console.error);
