import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { quotationService } from '../src/services/supabase/quotationService.ts';
import { invoiceService } from '../src/services/supabase/invoiceService.ts';
import { supabase } from '../src/lib/supabase.ts';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function main() {
  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  const wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';

  console.log('=== TEST QUOTATIONS RETRIEVAL ===');
  for (const bId of [undefined, 'ALL', '5c456a11-1321-40af-9c79-0fa151419922', 'MAIN']) {
    const res = await quotationService.getQuotations(wsId, { branchId: bId });
    console.log(`Branch [${bId}]: count = ${res.data?.length}`, res.data?.map(q => ({ num: q.quotationNumber, total: q.grandTotal, branchId: q.branchId })));
  }

  console.log('\n=== TEST INVOICES RETRIEVAL ===');
  for (const bId of [undefined, 'ALL', '5c456a11-1321-40af-9c79-0fa151419922', 'MAIN']) {
    const res = await invoiceService.getInvoices({ workspaceId: wsId, branchId: bId });
    console.log(`Branch [${bId}]: count = ${res.data?.length}`, res.data?.map(i => ({ num: i.invoiceNumber, total: i.grandTotal, branchId: i.branchId })));
  }
}

main().catch(console.error);
