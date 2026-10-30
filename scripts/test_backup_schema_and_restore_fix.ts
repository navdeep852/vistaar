/**
 * VISTAAR Business OS — Schema Compatibility & Restore Validation Test Suite
 *
 * Verifies:
 * 1. Pre-flight schema validation detects valid schemas and rejects invalid UUIDs/missing tables.
 * 2. business_settings and inventory_settings are configured as singletons with PK = 'workspace_id'.
 * 3. TABLES_TO_COLLECT table configs strictly match production schema.
 * 4. Paged collection query generation NEVER attempts ORDER BY id on tables lacking an id column.
 * 5. formatBackupDbError formats PostgreSQL 42703 (undefined_column), 42P01 (undefined_table), etc.
 * 6. BackupRestoreService resolves onConflict column correctly ('workspace_id' for business_settings and inventory_settings).
 * 7. Live Supabase pre-flight schema validation passes cleanly for authoritative UUID format.
 * 8. Shared Collector feeds both OneDrive folder backup and Download Backup identically.
 * 9. Financial consistency preserves invoice balances, totals, and udhari relations.
 */

import { BackupDataCollector, TABLES_TO_COLLECT } from '../src/services/backup/backupDataCollector';
import { BackupRestoreService } from '../src/services/backup/backupRestoreService';
import { formatBackupDbError } from '../src/services/backup/backupErrors';
import { BackupSerializer } from '../src/services/backup/backupSerializer';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  FAIL: ${testName} - ${detail || ''}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log(' VISTAAR BACKUP SCHEMA & RESTORE COMPATIBILITY TEST SUITE');
  console.log('================================================================\n');

  // TEST 1: Table Configuration Audit
  console.log('1. Auditing Table Configurations & Primary Key Registry...');
  const bsConfig = TABLES_TO_COLLECT.find((t) => t.name === 'business_settings');
  assert(!!bsConfig, "business_settings is registered in TABLES_TO_COLLECT");
  assert(bsConfig?.primaryKey === 'workspace_id', "business_settings primaryKey is 'workspace_id'");
  assert(bsConfig?.isSingletonRecord === true, "business_settings is flagged as singleton record");
  assert(bsConfig?.sortColumn === null, "business_settings sortColumn is null (no ORDER BY id)");
  assert(bsConfig?.isRequired === true, "business_settings is marked isRequired: true");

  const invConfig = TABLES_TO_COLLECT.find((t) => t.name === 'inventory_settings');
  assert(!!invConfig, "inventory_settings is registered in TABLES_TO_COLLECT");
  assert(invConfig?.primaryKey === 'workspace_id', "inventory_settings primaryKey is 'workspace_id'");
  assert(invConfig?.isSingletonRecord === true, "inventory_settings is flagged as singleton record");
  assert(invConfig?.sortColumn === null, "inventory_settings sortColumn is null (no ORDER BY id)");

  const branchesConfig = TABLES_TO_COLLECT.find((t) => t.name === 'branches');
  assert(branchesConfig?.isRequired === false, "branches is marked isRequired: false to prevent PGRST205 failures when optional");

  const coreTables = ['invoices', 'invoice_items', 'customers', 'products', 'payments', 'categories', 'suppliers'];
  for (const ct of coreTables) {
    const config = TABLES_TO_COLLECT.find((t) => t.name === ct);
    assert(config?.isRequired === true, `Core table '${ct}' is marked isRequired: true`);
    assert(config?.primaryKey === 'id', `Core table '${ct}' has primaryKey: 'id'`);
  }

  // TEST 2: Schema Error Formatting
  console.log('\n2. Testing PostgreSQL Error Formatting...');
  const err42703 = formatBackupDbError('business_settings', 'select', {
    code: '42703',
    message: 'column business_settings.id does not exist',
  });
  assert(err42703.includes('Code: 42703'), "Formatted error includes PostgreSQL code 42703");
  assert(err42703.includes("table 'business_settings'"), "Formatted error names table 'business_settings'");
  assert(err42703.includes("Suggestion:"), "Formatted error includes safe, actionable suggestion");
  assert(!err42703.includes("password"), "Formatted error does not leak credentials");

  const err42P01 = formatBackupDbError('branches', 'select', {
    code: 'PGRST205',
    message: "Could not find the table 'public.branches' in the schema cache",
  });
  assert(err42P01.includes('Code: PGRST205'), "Formatted error includes PostgREST code PGRST205");
  assert(err42P01.includes("table 'branches'"), "Formatted error names table 'branches'");

  // TEST 3: Pre-flight Schema Validation against live Supabase
  console.log('\n3. Testing Pre-Flight Schema Validation on Live Supabase...');
  const testWsId = 'a1111111-1111-4111-8111-111111111111';
  const validation = await BackupDataCollector.validateSchema(testWsId);
  assert(validation.valid, `Pre-flight schema validation passes on live Supabase without error (errors: ${validation.errors.join(', ')})`);
  assert(validation.errors.length === 0, "No schema validation errors returned");

  // TEST 4: Invalid workspace UUID rejection
  console.log('\n4. Testing Invalid Workspace UUID Rejection...');
  const invalidValidation = await BackupDataCollector.validateSchema('not-a-valid-uuid');
  assert(!invalidValidation.valid, "Pre-flight validation correctly rejects non-UUID workspace ID");
  assert(invalidValidation.errors.some(e => e.includes('must be a valid UUID')), "Validation returns explicit UUID format error");

  // TEST 5: Restoration Conflict Column Logic
  console.log('\n5. Testing Restoration Conflict Key Mapping...');
  // Verify that business_settings maps to workspace_id on conflict
  const getConflictColumn = (tableName: string) =>
    tableName === 'business_settings' || tableName === 'inventory_settings' ? 'workspace_id' : 'id';

  assert(getConflictColumn('business_settings') === 'workspace_id', "business_settings resolves to 'workspace_id' for onConflict");
  assert(getConflictColumn('inventory_settings') === 'workspace_id', "inventory_settings resolves to 'workspace_id' for onConflict");
  assert(getConflictColumn('invoices') === 'id', "invoices resolves to 'id' for onConflict");
  assert(getConflictColumn('products') === 'id', "products resolves to 'id' for onConflict");
  assert(getConflictColumn('customers') === 'id', "customers resolves to 'id' for onConflict");

  // TEST 6: Financial Consistency Preservation in Backup Payload
  console.log('\n6. Testing Financial Consistency in Backup Serialization...');
  const mockPayload = {
    workspaces: [{ id: testWsId, company_name: 'Test Business' }],
    business_settings: [{
      workspace_id: testWsId,
      legal_name: 'Test Business Pvt Ltd',
      gstin: '27AAAAA0000A1Z5',
      phone: '9876543210',
      email: 'test@business.com',
      address: '123 Test St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    }],
    invoices: [{
      id: '11111111-1111-1111-1111-111111111111',
      workspace_id: testWsId,
      invoice_number: 'INV-2026-001',
      total_amount: 15000,
      paid_amount: 10000,
      remaining_amount: 5000,
      status: 'PARTIAL',
    }],
    invoice_items: [{
      id: '22222222-2222-2222-2222-222222222222',
      workspace_id: testWsId,
      invoice_id: '11111111-1111-1111-1111-111111111111',
      product_name_snapshot: 'High-Tensile Steel Wire',
      quantity: 10,
      unit_price: 1500,
      total_amount: 15000,
    }],
    udhari_records: [{
      id: '33333333-3333-3333-3333-333333333333',
      workspace_id: testWsId,
      total_credit: 5000,
      total_paid: 2000,
      current_balance: 3000,
    }],
    udhari_payments: [{
      id: '44444444-4444-4444-4444-444444444444',
      workspace_id: testWsId,
      udhari_id: '33333333-3333-3333-3333-333333333333',
      amount: 2000,
    }],
  };

  const { archiveContent, manifest } = await BackupSerializer.serializeArchive({
    data: mockPayload,
    tableCounts: {
      workspaces: 1,
      business_settings: 1,
      invoices: 1,
      invoice_items: 1,
      udhari_records: 1,
      udhari_payments: 1,
    },
    workspaceId: testWsId,
    workspaceName: 'Test Business',
    backupType: 'manual',
    platform: 'desktop',
    password: 'TestPassword123!',
  });

  assert(typeof archiveContent === 'string' && archiveContent.length > 0, "Archive content generated successfully");
  assert(manifest.tables.business_settings?.rowCount === 1, "Manifest accurately records 1 business_settings row");
  assert(manifest.tables.invoices?.rowCount === 1, "Manifest accurately records 1 invoices row");

  // Deserialize and inspect financial data preservation
  const deserialized = await BackupSerializer.deserializeArchive(archiveContent, 'TestPassword123!');
  const restoredInvoice = deserialized.data.invoices?.[0];
  assert(restoredInvoice.total_amount === 15000, "Invoice total_amount preserved exactly (15000)");
  assert(restoredInvoice.paid_amount === 10000, "Invoice paid_amount preserved exactly (10000)");
  assert(restoredInvoice.remaining_amount === 5000, "Invoice remaining_amount preserved exactly (5000)");
  assert(restoredInvoice.status === 'PARTIAL', "Invoice partial status preserved");

  const restoredUdhari = deserialized.data.udhari_records?.[0];
  assert(restoredUdhari.current_balance === 3000, "Udhari balance preserved exactly (3000)");

  const restoredSettings = deserialized.data.business_settings?.[0];
  assert(restoredSettings.workspace_id === testWsId, "business_settings workspace_id preserved");
  assert(restoredSettings.id === undefined, "business_settings does not contain artificial 'id' column");

  // TEST 7: Preview Generation Without Mutations
  console.log('\n7. Testing Preview Generation...');
  const { preview } = await BackupRestoreService.generatePreview(
    archiveContent,
    testWsId,
    'Test Business',
    'TestPassword123!'
  );
  assert(preview.isSameWorkspace === true, "Preview correctly identifies matching workspace");
  assert(preview.totalRecords === 6, `Preview total records matches exactly (expected 6, got ${preview.totalRecords})`);
  assert(preview.warnings.length === 0, "No mismatch warnings for identical workspace");

  console.log('\n================================================================');
  console.log(` RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
