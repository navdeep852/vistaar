import { recoveryService } from '../src/services/recoveryService';
import { invoiceService } from '../src/services/supabase/invoiceService';
import { store } from '../src/services/store';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { registerCurrentUserResolver } from '../src/lib/permissions';

async function testSoldierRecovery() {
  console.log('\n=============================================================');
  console.log('       VISTAAR SOLDIER INVOICE RECOVERY VERIFICATION         ');
  console.log('=============================================================\n');

  const wsId = 'a0000000-0000-4000-8000-000000000001';
  const ownerId = 'b0000000-0000-4000-8000-000000000001';

  registerCurrentUserResolver(() => ({
    id: ownerId,
    role: 'owner',
    status: 'Active',
    workspaceId: wsId,
  } as any));

  (supabaseAuthService as any).currentProfile = {
    id: ownerId,
    companyId: wsId,
    role: 'owner',
    name: 'Owner',
    email: 'admin@vistaar.com',
    employeeId: 'VST-0001',
    status: 'Active',
  };
  (supabaseAuthService as any).authoritativeWorkspaceId = wsId;
  supabaseAuthService.isAuthenticated = () => true;
  supabaseAuthService.getUser = () => (supabaseAuthService as any).currentProfile;
  supabaseAuthService.getCurrentCompanyId = () => wsId;
  supabaseAuthService.getAuthoritativeWorkspaceId = async () => wsId;

  // Step 1: Scan for existing candidates
  console.log('Step 1: Deep scanning for candidate Soldier records...');
  const initialScan = await recoveryService.scanForSoldierCandidates();
  console.log(`Scan found: ${initialScan.matchingInvoices.length} matching invoices, ${initialScan.matchingPayments.length} matching payments.`);

  // Step 2: Run Reconcile & Recover
  console.log('\nStep 2: Executing idempotent Soldier recovery...');
  const recoverRes = await recoveryService.reconcileAndRecoverSoldierInvoice({
    customerName: 'Soldier',
    customerPhone: '9876543210',
    grandTotal: 87000,
    paidAmount: 87000,
    paymentMethod: 'Cash',
    notes: 'Reconciliation recovery of Soldier invoice ₹87,000'
  });

  if (!recoverRes.success) {
    console.error('❌ Recovery failed:', recoverRes.error);
    process.exit(1);
  }

  console.log(`✅ Recovery result: success=${recoverRes.success}, alreadyExisted=${recoverRes.alreadyExisted}`);
  const inv = recoverRes.invoice;
  console.log(`Recovered Invoice: #${inv?.invoiceNumber || (inv as any)?.invoice_number}, Total: ₹${inv?.grandTotal ?? (inv as any)?.grand_total}, Paid: ₹${inv?.paidAmount ?? (inv as any)?.paid_amount}`);

  // Step 3: Run Second Recovery (Idempotency check)
  console.log('\nStep 3: Testing recovery idempotency (running second time)...');
  const recoverRes2 = await recoveryService.reconcileAndRecoverSoldierInvoice({
    customerName: 'Soldier',
    grandTotal: 87000,
    paidAmount: 87000,
  });

  if (recoverRes2.alreadyExisted) {
    console.log('✅ [PASS] Idempotency confirmed: second recovery detected existing invoice and prevented duplication.');
  } else {
    console.error('❌ [FAIL] Idempotency failed: second recovery created duplicate invoice!');
    process.exit(1);
  }

  // Step 4: Verify search in Invoice Records
  console.log('\nStep 4: Querying Invoice Records with search "Soldier"...');
  const searchRes = await invoiceService.getInvoices({ search: 'Soldier' });
  const soldierInvs = searchRes.data?.filter(i => (i.customerName || '').toLowerCase().includes('soldier'));
  console.log(`Found ${soldierInvs?.length || 0} invoice(s) matching "Soldier" in Invoice Records.`);

  if ((soldierInvs?.length || 0) > 0) {
    console.log('✅ [PASS] Soldier invoice is present and searchable in Invoice Records.');
  } else {
    console.error('❌ [FAIL] Soldier invoice missing from Invoice Records!');
    process.exit(1);
  }

  console.log('\n🎉 SOLDIER RECOVERY VERIFICATION COMPLETED SUCCESSFULLY!\n');
}

testSoldierRecovery().catch(err => {
  console.error('Error during soldier recovery test:', err);
  process.exit(1);
});
