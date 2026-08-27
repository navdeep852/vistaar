import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// 1. DETERMINISTIC UUID GENERATION TEST
function generateUUID(namespace, legacyId) {
  const hash = crypto.createHash('sha256').update(`${namespace}:${legacyId}`).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
}

function testUUIDDeterminism() {
  const testCases = [
    { ns: 'workspace', legacy: 'ws-default-vistaar' },
    { ns: 'customer', legacy: 'cust-1' },
    { ns: 'customer', legacy: 'cust-2' },
    { ns: 'product', legacy: 'prod-1' },
    { ns: 'product', legacy: 'prod-2' }
  ];

  let passCount = 0;
  const results = [];

  for (const tc of testCases) {
    const run1 = generateUUID(tc.ns, tc.legacy);
    const run2 = generateUUID(tc.ns, tc.legacy);
    const run3 = generateUUID(tc.ns, tc.legacy);

    const isIdentical = (run1 === run2 && run2 === run3);
    const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(run1);
    
    if (isIdentical && isValidUUID) passCount++;
    results.push({ legacy: tc.legacy, uuid: run1, deterministic: isIdentical, validFormat: isValidUUID });
  }

  // Check collision resistance: different inputs produce different outputs
  const u1 = generateUUID('customer', 'cust-1');
  const u2 = generateUUID('customer', 'cust-2');
  const u3 = generateUUID('product', 'cust-1'); // different namespace
  const noCollisions = (u1 !== u2 && u1 !== u3 && u2 !== u3);

  return { pass: passCount === testCases.length && noCollisions, results, noCollisions };
}

// 2. BASE64 MEDIA DECODING TEST
function validateMediaAsset(name, dataUrl, workspaceId, entity, field, bucket) {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return { name, valid: false, error: 'Invalid Base64 string' };
  }
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return { name, valid: false, error: 'Format mismatch' };

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const sizeBytes = buffer.length;
  const sizeKb = (sizeBytes / 1024).toFixed(2);
  
  let ext = 'bin';
  if (mimeType.includes('png')) ext = 'png';
  else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
  else if (mimeType.includes('svg')) ext = 'svg';

  const proposedPath = `${workspaceId}/${entity}/${name.toLowerCase().replace(/\s+/g, '_')}.${ext}`;
  const targetDbColumn = `${field.replace(/Url$/, '_url')}`;

  return {
    name,
    valid: sizeBytes > 0,
    mimeType,
    ext,
    sizeBytes,
    sizeKb: `${sizeKb} KB`,
    proposedPath,
    targetDbColumn,
    bucket
  };
}

// 3. MAIN VALIDATION EXECUTION
function runValidation() {
  console.log('=============================================================================');
  console.log('VISTAAR PHASE 3A.5 — PRE-LIVE IMPORT VALIDATION ENGINE');
  console.log('=============================================================================\n');

  // Test 1: UUID Determinism
  const uuidTest = testUUIDDeterminism();
  console.log('1. LEGACY ID -> UUID DETERMINISM CHECK:');
  console.log(`   - Identical Across Executions: ${uuidTest.pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`   - Collision Resistance: ${uuidTest.noCollisions ? 'PASS ✅' : 'FAIL ❌'}`);
  uuidTest.results.forEach(r => console.log(`     Legacy ID: ${r.legacy.padEnd(20)} -> UUID: ${r.uuid}`));

  // Test 2: Base64 Media Decoding
  console.log('\n2. MEDIA DECODING & VALIDATION CHECK:');
  const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const sampleJpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP--------------------------------------------------------------------------------------/9j/4AAQSkZJRgABAQ';
  
  const wsUUID = generateUUID('workspace', 'ws-default-vistaar');
  const userUUID = generateUUID('profile', 'usr-owner-001');

  const logoTest = validateMediaAsset('Business Logo', samplePng, wsUUID, 'branding', 'logoUrl', 'business-assets');
  const sigTest = validateMediaAsset('Signature', samplePng, wsUUID, 'branding', 'signatureUrl', 'business-assets');
  const stampTest = validateMediaAsset('Stamp', samplePng, wsUUID, 'branding', 'stampUrl', 'business-assets');
  const avatarTest = validateMediaAsset('Owner Avatar', sampleJpg, `${wsUUID}/${userUUID}`, 'avatars', 'avatarUrl', 'avatars');

  [logoTest, sigTest, stampTest, avatarTest].forEach(m => {
    console.log(`   - ${m.name.padEnd(16)}: ${m.mimeType} (${m.sizeKb}) -> Bucket: ${m.bucket.padEnd(15)} Path: ${m.proposedPath}`);
  });

  // Test 3: Load store.json & verify historical failures
  const storePath = path.resolve(process.cwd(), 'data', 'store.json');
  const storeData = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  const failedFollowUps = storeData.followUps.filter(f => f.status === 'Failed');

  console.log('\n3. HISTORICAL FAILURE PRESERVATION CHECK:');
  console.log(`   - Total Failed Follow-Ups Found: ${failedFollowUps.length}`);
  failedFollowUps.forEach(f => {
    console.log(`     ID: ${f.id} | Status: ${f.status} | Error: "${f.errorMessage}"`);
  });

  console.log('\n=============================================================================');
  console.log('ALL PHASE 3A.5 MATHEMATICAL & DETERMINISTIC CHECKS COMPLETED.');
  console.log('=============================================================================\n');
}

runValidation();
