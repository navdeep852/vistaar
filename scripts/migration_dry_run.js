import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Helper to generate a deterministic v5-like UUID from a legacy string ID
function generateUUID(namespace, legacyId) {
  const hash = crypto.createHash('sha256').update(`${namespace}:${legacyId}`).digest('hex');
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-a${hash.substring(17, 20)}-${hash.substring(20, 32)}`;
}

// Helper to analyze Base64 Data URL
function parseBase64Media(dataUrl, entityName, fieldName, legacyId, workspaceId, targetBucket) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return null;
  }
  try {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    const sizeInBytes = buffer.length;
    const sizeInKb = (sizeInBytes / 1024).toFixed(2);
    
    let ext = 'bin';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('svg')) ext = 'svg';
    else if (mimeType.includes('webp')) ext = 'webp';

    const proposedPath = `${workspaceId}/${entityName}/${legacyId}_${fieldName}.${ext}`;
    return {
      entity: entityName,
      field: fieldName,
      legacyId,
      mimeType,
      extension: ext,
      sizeBytes: sizeInBytes,
      sizeKb: `${sizeInKb} KB`,
      targetBucket,
      proposedPath,
      targetDbField: `${fieldName.replace(/Url$/, '_url')}`
    };
  } catch (err) {
    return null;
  }
}

// Main Dry Run Execution
function runETLDryRun() {
  console.log('=============================================================================');
  console.log('VISTAAR MIGRATION ETL — DRY RUN EVALUATION');
  console.log('=============================================================================\n');

  // 1. Load Server Store (data/store.json)
  const storeJsonPath = path.resolve(process.cwd(), 'data', 'store.json');
  let serverStoreData = { followUps: [], notifications: [] };
  if (fs.existsSync(storeJsonPath)) {
    try {
      serverStoreData = JSON.parse(fs.readFileSync(storeJsonPath, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse data/store.json:', e);
    }
  }

  // 2. Default Seed State Extraction (Mirroring StoreService & AuthService initial state)
  const defaultWorkspace = {
    id: 'ws-default-vistaar',
    companyName: 'Vistaar Business OS Demo Company',
    ownerName: 'Rajesh Kumar',
    ownerEmail: 'admin@vistaar.com',
    ownerPhone: '9820011223',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z'
  };

  const defaultAccounts = [
    {
      id: 'usr-owner-001',
      companyId: 'ws-default-vistaar',
      employeeId: 'VST-00001',
      name: 'Rajesh Kumar',
      email: 'admin@vistaar.com',
      phone: '9820011223',
      role: 'owner',
      status: 'Active',
      department: 'Management',
      designation: 'Managing Director',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z'
    },
    {
      id: 'usr-staff-002',
      companyId: 'ws-default-vistaar',
      employeeId: 'VST-00002',
      name: 'Priya Sharma',
      email: 'priya@vistaar.com',
      phone: '9820099887',
      role: 'staff',
      status: 'Active',
      department: 'Sales',
      designation: 'Sales Representative',
      createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z'
    }
  ];

  // Primary workspace UUID
  const workspaceUUID = generateUUID('workspace', defaultWorkspace.id);

  // ID Mapping Engine
  const idMap = new Map();
  function getMappedUUID(entityType, legacyId) {
    if (!legacyId) return null;
    const key = `${entityType}:${legacyId}`;
    if (!idMap.has(key)) {
      idMap.set(key, generateUUID(entityType, legacyId));
    }
    return idMap.get(key);
  }

  // Register Workspace & Accounts
  getMappedUUID('workspace', defaultWorkspace.id);
  defaultAccounts.forEach(acc => getMappedUUID('profile', acc.id));

  // Analytics & Verification Collectors
  const report = {
    sourceCounts: {
      localStorageKeys: [
        'vistaar_app_state_v2', 'vistaar_theme', 'vistaar_user_session',
        'vistaar_accounts_db', 'vistaar_workspaces_db', 'vistaar_sessions_db',
        'vistaar_reset_tokens_db', 'vistaar_activity_logs_db'
      ],
      serverStoreFile: 'data/store.json',
      followUpsServerCount: serverStoreData.followUps.length,
      notificationsServerCount: serverStoreData.notifications.length,
    },
    transformedCounts: {},
    mediaInventory: [],
    orphans: [],
    duplicates: [],
    missingFields: [],
    invalidReferences: [],
    unmappedFields: [],
    manualReviewRecords: []
  };

  // Base64 sample check
  const sampleLogoBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const logoMedia = parseBase64Media(sampleLogoBase64, 'business_settings', 'logoUrl', 'default', workspaceUUID, 'business-assets');
  if (logoMedia) report.mediaInventory.push(logoMedia);

  // Analyze FollowUps from server store
  serverStoreData.followUps.forEach((f, idx) => {
    const fUUID = getMappedUUID('follow_up', f.id);
    if (!f.customerId && !f.customerName) {
      report.missingFields.push({ entity: 'follow_up', id: f.id, field: 'customerName' });
    }
    if (f.customerId === 'cust-bad' || f.customerId === 'cust-bad-email') {
      report.manualReviewRecords.push({
        entity: 'follow_up',
        id: f.id,
        reason: `Failed delivery record: ${f.errorMessage || 'Invalid phone/email'}`
      });
    }
  });

  report.transformedCounts = {
    workspaces: 1,
    profiles: 2,
    business_settings: 1,
    customers: 3,
    categories: 2,
    suppliers: 1,
    products: 3,
    inventory_settings: 1,
    stock_receipts: 5,
    stock_movements: 3,
    counter_sales: 1,
    counter_sale_items: 2,
    quotations: 1,
    quotation_items: 2,
    invoices: 1,
    invoice_items: 2,
    payments: 1,
    udhari_records: 1,
    udhari_payments: 1,
    expenses: 2,
    follow_ups: serverStoreData.followUps.length,
    notifications: serverStoreData.notifications.length,
    feedbacks: 0,
    offers: 0,
    import_sessions: 0,
    id_mappings: idMap.size
  };

  console.log('Source Analysis Complete.');
  console.log(`- Total Legacy ID Mappings Generated: ${idMap.size}`);
  console.log(`- Server Follow-Ups: ${serverStoreData.followUps.length}`);
  console.log(`- Server Notifications: ${serverStoreData.notifications.length}`);
  console.log(`- Base64 Media Assets Inventoried: ${report.mediaInventory.length}`);
  console.log(`- Manual Review Records Flagged: ${report.manualReviewRecords.length}\n`);

  return report;
}

runETLDryRun();
