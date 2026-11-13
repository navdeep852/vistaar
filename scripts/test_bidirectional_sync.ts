import { supabase } from '../src/lib/supabase.ts';
import { quotationService } from '../src/services/supabase/quotationService.ts';
import { invoiceService } from '../src/services/supabase/invoiceService.ts';
import { supabaseAuthService } from '../src/services/supabaseAuth.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function testBidirectionalSync() {
  await supabase.auth.setSession({ access_token: authData.access_token, refresh_token: authData.refresh_token });
  const wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';
  (supabaseAuthService as any).currentCompanyId = wsId;

  console.log('=== TEST 1: SIMULATE MOBILE CREATING A TEST QUOTATION ===');
  // Generate test quotation
  const testQtNumber = `QT-TEST-${Date.now().toString().slice(-4)}`;
  const testQt = {
    quotationNumber: testQtNumber,
    customerId: null,
    customerName: 'Mobile Parity Test Customer',
    customerPhone: '9876543210',
    date: '2026-11-13',
    validUntil: '2026-11-28',
    status: 'Sent' as const,
    subtotal: 1000,
    taxTotal: 180,
    grandTotal: 1180,
    items: [
      {
        id: 'item-1',
        name: 'Test Mobile Service Item',
        quantity: 1,
        rate: 1000,
        taxRate: 18,
        taxAmount: 180,
        amount: 1180,
      }
    ],
    notes: '[branch: 5c456a11-1321-40af-9c79-0fa151419922]',
  };

  const createQtRes = await quotationService.createQuotation(testQt as any);
  console.log('Mobile Quotation Create Result:', createQtRes.success, createQtRes.quotation?.id, createQtRes.quotation?.quotationNumber);

  console.log('\n=== TEST 2: SIMULATE DESKTOP FETCHING THE QUOTATION ===');
  const desktopFetch = await quotationService.getQuotations(wsId, { branchId: 'ALL' });
  const foundQtOnDesktop = desktopFetch.data.find(q => q.quotationNumber === testQtNumber);
  console.log('Desktop found quotation created on Mobile?', !!foundQtOnDesktop, foundQtOnDesktop?.id, foundQtOnDesktop?.grandTotal);

  console.log('\n=== TEST 3: SIMULATE DESKTOP CREATING A TEST INVOICE ===');
  const testInvNumber = `INV-TEST-${Date.now().toString().slice(-4)}`;
  const testInvItems = [
    {
      id: 'item-2',
      name: 'Test Desktop Service Item',
      quantity: 1,
      rate: 2000,
      taxRate: 18,
      taxAmount: 360,
      amount: 2360,
    }
  ];
  const testInv = {
    invoiceNumber: testInvNumber,
    customerId: null,
    customerName: 'Desktop Parity Test Customer',
    customerPhone: '9876543210',
    date: '2026-11-13',
    dueDate: '2026-11-20',
    status: 'Issued' as const,
    subtotal: 2000,
    taxTotal: 360,
    grandTotal: 2360,
    paidAmount: 0,
    notes: '[branch: 5c456a11-1321-40af-9c79-0fa151419922]',
  };

  const createInvRes = await invoiceService.createInvoice(testInv as any, testInvItems);
  console.log('Desktop Invoice Create Result: invoiceId =', createInvRes.invoiceId, 'error =', createInvRes.error);

  console.log('\n=== TEST 4: SIMULATE MOBILE FETCHING THE INVOICE ===');
  const mobileFetch = await invoiceService.getInvoices({ workspaceId: wsId, branchId: 'ALL' });
  const foundInvOnMobile = mobileFetch.data.find(i => i.invoiceNumber === testInvNumber);
  console.log('Mobile found invoice created on Desktop?', !!foundInvOnMobile, foundInvOnMobile?.id, foundInvOnMobile?.grandTotal);

  console.log('\n=== CLEANUP TEST RECORDS (Preserving Real Records) ===');
  if (createQtRes.quotation?.id) {
    const { error: delQtErr } = await supabase.from('quotations').delete().eq('id', createQtRes.quotation.id);
    console.log('Cleaned up test quotation:', !delQtErr);
  }
  if (createInvRes.invoiceId) {
    const { error: delInvErr } = await supabase.from('invoices').delete().eq('id', createInvRes.invoiceId);
    console.log('Cleaned up test invoice:', !delInvErr);
  }
  // Also clean up any orphan invoice created in earlier failed step if any
  const { data: orphanInvs } = await supabase.from('invoices').select('id, invoice_number').like('invoice_number', 'INV-TEST-%');
  if (orphanInvs && orphanInvs.length > 0) {
    for (const oi of orphanInvs) {
      await supabase.from('invoices').delete().eq('id', oi.id);
      console.log('Cleaned up orphan test invoice:', oi.invoice_number);
    }
  }
  const { data: orphanQts } = await supabase.from('quotations').select('id, quotation_number').like('quotation_number', 'QT-TEST-%');
  if (orphanQts && orphanQts.length > 0) {
    for (const oq of orphanQts) {
      await supabase.from('quotations').delete().eq('id', oq.id);
      console.log('Cleaned up orphan test quotation:', oq.quotation_number);
    }
  }
}

testBidirectionalSync().catch(console.error);
