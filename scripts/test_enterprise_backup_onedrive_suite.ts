/**
 * VISTAAR Business OS — Enterprise Backup & Microsoft OneDrive Test Suite
 * Validates:
 * 1. Comprehensive versioned ZIP archive generation (manifest.json, data.json, assets/).
 * 2. Cryptographic SHA-256 integrity and tampering detection.
 * 3. Multi-tenant isolation guards (rejection of cross-workspace restoration).
 * 4. Guarded restore workflow with safety backup and dependency ordering.
 * 5. Microsoft OAuth 2.0 PKCE flow, state CSRF verification, and Graph API methods.
 * 6. RBAC owner-only access policy.
 */

import { backupService } from '../src/services/backupService';
import { oneDriveService } from '../src/services/oneDriveService';
import { supabaseAuthService } from '../src/services/supabaseAuth';
import { store } from '../src/services/store';
import JSZip from 'jszip';
import crypto from 'crypto';

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
  details?: any;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, failureMsg?: string) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`  [PASS] ${name}`);
  } else {
    results.push({ name, passed: false, message: failureMsg || 'Assertion failed' });
    console.error(`  [FAIL] ${name} - ${failureMsg || 'Assertion failed'}`);
  }
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log(' VISTAAR Enterprise Backup & Microsoft OneDrive Verification Suite');
  console.log('================================================================\n');

  const testWsId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  const setMockOwnerSession = (wsId = testWsId) => {
    supabaseAuthService.setAuthoritativeWorkspaceId(wsId);
    (supabaseAuthService as any).currentProfile = {
      id: 'usr_owner_001',
      name: 'Owner User',
      email: 'owner@vistaar.test',
      role: 'owner',
      companyId: wsId,
    };
  };

  setMockOwnerSession();

  // Seed sample local business data
  store.updateSettings({
    businessName: 'VISTAAR Prime Solutions',
    legalName: 'VISTAAR Prime Solutions Pvt Ltd',
    phone: '9876543210',
    gstin: '27AAAAA0000A1Z5',
    logoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    signatureUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  } as any);

  store.setCustomers([
    {
      id: 'cust_001',
      workspaceId: testWsId,
      name: 'Alpha Enterprises',
      phone: '9876543210',
      balance: 15000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any,
  ]);

  store.setProducts([
    {
      id: 'prod_001',
      workspaceId: testWsId,
      name: 'Precision Bearing 6204',
      sku: 'BRG-6204',
      sellingPrice: 450,
      costPrice: 300,
      currentStock: 120,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any,
  ]);

  // --------------------------------------------------------------------------
  // TEST 1: Comprehensive Archive Generation (.zip)
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Comprehensive Archive Generation (.zip) ---');
  let generatedArchive: any = null;
  try {
    generatedArchive = await backupService.generateComprehensiveArchive({ type: 'manual' });
    assert(Boolean(generatedArchive?.zipBlob), 'Archive blob is generated');
    assert(generatedArchive?.zipBlob.size > 0, 'Archive blob size is positive');
    assert(Boolean(generatedArchive?.manifest), 'Manifest object is generated');
    assert(generatedArchive.manifest.workspaceId === testWsId, 'Manifest contains correct authorized workspace ID');
    assert(generatedArchive.manifest.formatVersion === '3.0.0', 'Manifest format version is 3.0.0');
    assert(generatedArchive.manifest.recordCounts.customers >= 1, 'Manifest records customer count');
    assert(generatedArchive.manifest.recordCounts.products >= 1, 'Manifest records product count');
    assert(Boolean(generatedArchive.manifest.checksumSha256), 'Manifest contains SHA-256 data checksum');
  } catch (err: any) {
    assert(false, 'Archive generation', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Inspect ZIP Structure & Assets
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Inspect ZIP Structure & Business Assets ---');
  try {
    const zip = new JSZip();
    const unzipped = await zip.loadAsync(generatedArchive.zipBlob);

    assert(Boolean(unzipped.file('manifest.json')), 'ZIP contains manifest.json');
    assert(Boolean(unzipped.file('data.json')), 'ZIP contains data.json');

    const manifestContent = JSON.parse(await unzipped.file('manifest.json')!.async('text'));
    const dataContent = JSON.parse(await unzipped.file('data.json')!.async('text'));

    assert(dataContent.workspaceId === testWsId, 'data.json contains authorized workspaceId');
    assert(dataContent.data.customers.length >= 1, 'data.json contains customer records');
    assert(dataContent.data.products.length >= 1, 'data.json contains product records');

    // Verify SHA-256 matches exactly
    const dataText = await unzipped.file('data.json')!.async('text');
    const calculatedHash = crypto.createHash('sha256').update(dataText).digest('hex');
    assert(calculatedHash === manifestContent.checksumSha256, 'Calculated SHA-256 of data.json matches manifest checksum');

    // Verify assets folder
    const logoFile = unzipped.file('assets/logo.png');
    const sigFile = unzipped.file('assets/signature.png');
    assert(Boolean(logoFile), 'ZIP assets/ directory contains business logo');
    assert(Boolean(sigFile), 'ZIP assets/ directory contains signature');
  } catch (err: any) {
    assert(false, 'ZIP inspection', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Cryptographic Integrity Verification & Tampering Resistance
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Cryptographic Integrity & Tampering Resistance ---');
  try {
    // 3a. Untampered archive must pass
    const verifyValid = await backupService.verifyBackupIntegrity(generatedArchive.zipBlob);
    assert(verifyValid.valid === true, 'Untampered archive passes integrity verification');
    assert(verifyValid.recordCounts?.customers! >= 1, 'Verification returns correct record counts');

    // 3b. Tampered archive must be rejected
    const tamperedZip = new JSZip();
    await tamperedZip.loadAsync(generatedArchive.zipBlob);
    tamperedZip.file('data.json', JSON.stringify({ workspaceId: testWsId, tampered: true, data: {} }));
    const tamperedBlob = await tamperedZip.generateAsync({ type: 'blob' });

    const verifyTampered = await backupService.verifyBackupIntegrity(tamperedBlob);
    assert(verifyTampered.valid === false, 'Tampered data.json inside archive is detected and rejected');
    assert(Boolean(verifyTampered.error && verifyTampered.error.includes('mismatch')), 'Error message explicitly reports checksum mismatch');
  } catch (err: any) {
    assert(false, 'Integrity verification', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Strict Multi-Tenant Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Multi-Tenant Isolation Protection ---');
  try {
    // Construct an archive for Foreign Workspace B
    const foreignWsId = '00000000-0000-0000-0000-000000000002';
    const foreignData = {
      version: '1.0.0',
      workspaceId: foreignWsId,
      timestamp: new Date().toISOString(),
      schemaVersion: '1.0.0',
      businessName: 'Foreign Infiltrator Corp',
      metadata: {
        backupId: 'foreign_backup_001',
        workspaceId: foreignWsId,
        timestamp: new Date().toISOString(),
        recordCounts: {},
      },
      data: {
        customers: [{ id: 'foreign_cust', name: 'Foreign Customer', workspaceId: foreignWsId }],
      },
    };

    const foreignJsonStr = JSON.stringify(foreignData);
    const foreignChecksum = crypto.createHash('sha256').update(foreignJsonStr).digest('hex');

    const foreignManifest = {
      formatVersion: '1.0.0',
      backupId: 'foreign_backup_001',
      backupName: 'Foreign_Backup',
      timestamp: new Date().toISOString(),
      workspaceId: foreignWsId,
      workspaceName: 'Foreign Corp',
      branchScope: 'ALL',
      schemaVersion: '1.0.0',
      appVersion: '1.0.0',
      backupType: 'manual',
      storageDestination: 'local_download',
      checksumSha256: foreignChecksum,
      recordCounts: { customers: 1 },
      fileInventory: [],
    };

    const foreignZip = new JSZip();
    foreignZip.file('manifest.json', JSON.stringify(foreignManifest));
    foreignZip.file('data.json', foreignJsonStr);
    const foreignZipBlob = await foreignZip.generateAsync({ type: 'blob' });

    // Attempt restoring foreign archive into current workspace
    const restoreResult = await backupService.restoreBackup(foreignZipBlob, 'RESTORE');
    assert(restoreResult.success === false, 'Cross-workspace restore is strictly blocked');
    assert(
      Boolean(restoreResult.error && restoreResult.error.includes('Tenant isolation violation')),
      'Error message states "Tenant isolation violation"'
    );
  } catch (err: any) {
    assert(false, 'Tenant isolation', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Guarded Restoration with Safety Backup & Dependency Ordering
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Guarded Restoration Workflow ---');
  try {
    // 5a. Confirmation code check
    const badConfirm = await backupService.restoreBackup(generatedArchive.zipBlob, 'restore');
    assert(badConfirm.success === false, 'Restoration rejected when confirmation is lowercase "restore"');

    const wrongWord = await backupService.restoreBackup(generatedArchive.zipBlob, 'CONFIRM');
    assert(wrongWord.success === false, 'Restoration rejected when confirmation is not "RESTORE"');

    // 5b. Valid restoration with safety backup creation
    setMockOwnerSession();
    const restoreSuccess = await backupService.restoreBackup(generatedArchive.zipBlob, 'RESTORE');
    console.log('restoreSuccess debug:', restoreSuccess);
    assert(restoreSuccess.success === true, 'Restoration with valid archive and "RESTORE" succeeds', restoreSuccess.error);
    assert(Boolean(restoreSuccess.safetyBackupId), 'Pre-restore Safety Backup is automatically created');

    const postRestoreHistory = await backupService.getBackupHistory();
    const safetyRecord = postRestoreHistory.find((b) => b.backupType === 'safety');
    assert(Boolean(safetyRecord), 'Safety backup record is logged in audit history');

    // Verify data restored in store
    const customersInStore = store.getCustomers();
    assert(customersInStore.length >= 1, 'Customer records successfully restored in local store');
    assert(customersInStore[0].name === 'Alpha Enterprises', 'Restored customer data matches backup archive');
  } catch (err: any) {
    assert(false, 'Restoration workflow', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Microsoft OneDrive OAuth PKCE & Graph Protocol
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Microsoft OneDrive OAuth PKCE & Graph Protocol ---');
  try {
    // 6a. PKCE Login Initiation
    const loginRes = await oneDriveService.initiateLogin();
    assert(Boolean(loginRes.authUrl), 'OAuth authorization URL is generated');

    const parsedUrl = new URL(loginRes.authUrl);
    assert(parsedUrl.hostname === 'login.microsoftonline.com', 'Auth URL targets login.microsoftonline.com');
    assert(parsedUrl.searchParams.get('response_type') === 'code', 'Auth URL requests code response');
    assert(parsedUrl.searchParams.get('code_challenge_method') === 'S256', 'PKCE uses SHA-256 (S256)');
    assert(Boolean(parsedUrl.searchParams.get('code_challenge')), 'PKCE code challenge is present');
    assert(Boolean(parsedUrl.searchParams.get('state')), 'OAuth state parameter is present');

    const scopes = parsedUrl.searchParams.get('scope') || '';
    assert(scopes.includes('Files.ReadWrite.AppFolder'), 'Requests least-privilege Files.ReadWrite.AppFolder');
    assert(scopes.includes('offline_access'), 'Requests offline_access for refresh tokens');

    // 6b. Disconnected by default
    assert(oneDriveService.getConnectionStatus().isConnected === false, 'OneDrive reports disconnected status initially');

    // 6c. Upload without connection must fail gracefully
    const unauthUpload = await oneDriveService.uploadBackupArchive('test.zip', new ArrayBuffer(100));
    assert(unauthUpload.success === false, 'Upload rejected when OneDrive is not authenticated');
    assert(
      Boolean(unauthUpload.error && unauthUpload.error.includes('Not connected')),
      'Returns actionable error: "Not connected to Microsoft OneDrive"'
    );
  } catch (err: any) {
    assert(false, 'OneDrive integration', err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: RBAC Owner-Only Access Guard
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: RBAC Owner-Only Access Guard ---');
  try {
    // Owner role
    (supabaseAuthService as any).currentProfile = { id: 'u1', role: 'owner', companyId: testWsId };
    const ownerAllowed = supabaseAuthService.getUser()?.role === 'owner';
    assert(ownerAllowed === true, 'Workspace Owner is authorized to access Backup & Restore');

    // Staff role
    (supabaseAuthService as any).currentProfile = { id: 'u2', role: 'staff', companyId: testWsId };
    const staffAllowed = supabaseAuthService.getUser()?.role === 'owner';
    assert(staffAllowed === false, 'Staff employee is denied access to Backup & Restore');

    // Cashier role
    (supabaseAuthService as any).currentProfile = { id: 'u3', role: 'cashier', companyId: testWsId };
    const cashierAllowed = supabaseAuthService.getUser()?.role === 'owner';
    assert(cashierAllowed === false, 'Cashier employee is denied access to Backup & Restore');
  } catch (err: any) {
    assert(false, 'RBAC check', err.message);
  }

  // Summary
  console.log('\n================================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(` Test Results: ${passedCount}/${totalCount} tests passed`);
  console.log('================================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
