import { supabase } from '../src/lib/supabase.ts';
import { businessSettingsService } from '../src/services/supabase/businessSettingsService.ts';
import { branchService } from '../src/services/supabase/branchService.ts';
import { supabaseAuthService } from '../src/services/supabaseAuth.ts';
import * as fs from 'fs';

const authData = JSON.parse(fs.readFileSync('extracted_auth.json', 'utf8'));

async function main() {
  await supabase.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  const wsId = 'ddb10dc7-3671-4def-9626-526afd473c1a';
  supabaseAuthService.setAuthoritativeWorkspaceId(wsId);

  console.log('=====================================================');
  console.log('TASK 1: BRANCH SETTINGS PERSISTENCE VERIFICATION');
  console.log('=====================================================');

  // Baseline inspection
  const { data: initialBranches } = await branchService.getBranches({ activeOnly: false });
  console.log('1. Baseline Branches: count =', initialBranches?.length);
  const baselineUuids = initialBranches.map(b => ({ id: b.id, name: b.branchName, code: b.branchCode, isMain: b.isMainBranch }));
  console.log('   Baseline UUIDs:', baselineUuids);

  if (baselineUuids.length < 3) {
    throw new Error('Baseline branches count must be at least 3!');
  }

  // TEST 1: Update Business Phone Number only (empty bank payload)
  console.log('\n--- TEST 1: Update Business Phone Number (no bank details in payload) ---');
  const res1 = await businessSettingsService.updateSettings({
    phone: '9876543210',
  });
  console.log('   Update result:', res1.success);
  const { data: b1 } = await branchService.getBranches({ activeOnly: false });
  console.log('   Branches count after phone update:', b1.length);
  b1.forEach(b => console.log(`   - ${b.id} | ${b.branchName} | isMain: ${b.isMainBranch}`));
  const match1 = baselineUuids.every(base => b1.some(b => b.id === base.id && b.branchName === base.name && b.isMainBranch === base.isMain));
  console.log('   All branch UUIDs and metadata preserved?', match1);

  // TEST 2: Update GST/Tax settings (tax mode, gstin, pan)
  console.log('\n--- TEST 2: Update GST / Tax Settings ---');
  const res2 = await businessSettingsService.updateSettings({
    defaultTaxMode: 'Inclusive',
    gstin: '07AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
  });
  console.log('   Update result:', res2.success);
  const { data: b2 } = await branchService.getBranches({ activeOnly: false });
  console.log('   Branches count after GST update:', b2.length);
  const match2 = baselineUuids.every(base => b2.some(b => b.id === base.id && b.branchName === base.name && b.isMainBranch === base.isMain));
  console.log('   All branch UUIDs and metadata preserved?', match2);

  // TEST 3: Update Bank Details (bank name, account no, IFSC, but NO _branches in payload)
  console.log('\n--- TEST 3: Update Bank Details (without _branches in payload) ---');
  const res3 = await businessSettingsService.updateSettings({
    bankDetails: {
      bankName: 'HDFC Bank Ltd',
      accountHolder: 'My Business Operations',
      accountNo: '50200012345678',
      ifscCode: 'HDFC0001234',
      branch: 'Connaught Place',
      upiId: 'mybusiness@hdfcbank',
      upiQrCodeUrl: '',
    },
  });
  console.log('   Update result:', res3.success);
  const { data: b3 } = await branchService.getBranches({ activeOnly: false });
  console.log('   Branches count after Bank Details update:', b3.length);
  const match3 = baselineUuids.every(base => b3.some(b => b.id === base.id && b.branchName === base.name && b.isMainBranch === base.isMain));
  console.log('   All branch UUIDs and metadata preserved?', match3);

  // TEST 4: Update other general settings (address, email, website, currency)
  console.log('\n--- TEST 4: Update Other General Settings ---');
  const res4 = await businessSettingsService.updateSettings({
    address: 'Plot 42, Technology Park',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110001',
    email: 'contact@mybusiness.com',
    website: 'https://mybusiness.com',
    currency: '₹',
  });
  console.log('   Update result:', res4.success);
  const { data: b4 } = await branchService.getBranches({ activeOnly: false });
  console.log('   Branches count after General Settings update:', b4.length);
  const match4 = baselineUuids.every(base => b4.some(b => b.id === base.id && b.branchName === base.name && b.isMainBranch === base.isMain));
  console.log('   All branch UUIDs and metadata preserved?', match4);

  // TEST 5: Negative assertion - passing empty _branches: [] in bankDetails
  console.log('\n--- TEST 5: Negative Assertion - empty _branches: [] in form ---');
  const res5 = await businessSettingsService.updateSettings({
    bankDetails: {
      bankName: 'HDFC Bank Ltd',
      accountHolder: 'My Business Operations',
      accountNo: '50200012345678',
      ifscCode: 'HDFC0001234',
      branch: 'Connaught Place',
      upiId: 'mybusiness@hdfcbank',
      upiQrCodeUrl: '',
      _branches: [] as any, // Intentionally empty array from bad form submission
    } as any,
  });
  console.log('   Update result:', res5.success);
  const { data: b5 } = await branchService.getBranches({ activeOnly: false });
  console.log('   Branches count after empty _branches attempt:', b5.length);
  const match5 = baselineUuids.every(base => b5.some(b => b.id === base.id && b.branchName === base.name && b.isMainBranch === base.isMain));
  console.log('   All branch UUIDs protected against empty array overwrite?', match5);

  // TEST 6: Verify Supabase business_settings row directly
  console.log('\n--- TEST 6: Direct Supabase Database Verification ---');
  const { data: directBs } = await supabase.from('business_settings').select('bank_details').eq('workspace_id', wsId).single();
  const dbBranches = directBs?.bank_details?._branches;
  console.log('   Branches directly in DB column bank_details._branches: count =', dbBranches?.length);
  dbBranches?.forEach((b: any) => console.log(`   * ${b.id} | ${b.branchName} (${b.branchCode}) | isMain: ${b.isMainBranch}`));
  const directMatch = baselineUuids.every(base => dbBranches?.some((b: any) => b.id === base.id && b.branchName === base.name && b.isMainBranch === base.isMain));
  console.log('   PostgreSQL database row confirmed intact?', directMatch);

  if (match1 && match2 && match3 && match4 && match5 && directMatch) {
    console.log('\n>>> TASK 1 VERDICT: COMPLETE PASS <<<');
  } else {
    console.error('\n>>> TASK 1 VERDICT: FAILED <<<');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
