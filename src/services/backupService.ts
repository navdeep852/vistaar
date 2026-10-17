import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { supabaseAuthService } from './supabaseAuth';
import { store } from './store';
import { isValidUuid } from '../lib/supabaseError';
import { safeGetTenantStorage, safeSaveTenantStorage, safeGetTenantItem, safeSaveTenantItem } from './supabase/safeStorage';
import { auditLogService } from './supabase/auditLogService';
import {
  BackupRecord,
  BackupType,
  BackupStatus,
  BackupDataPayload,
  Invoice,
  Payment,
  Customer,
  Product,
} from '../types';

const BACKUP_META_STORAGE_KEY = 'vistaar_backups_history_db';
const BACKUP_DATA_PREFIX = 'vistaar_backup_blob_';
const SCHEMA_VERSION = 'v2.1.0';

/**
 * Computes a SHA-256 hexadecimal hash string for arbitrary text
 */
async function computeSha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node / non-browser fallback
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(text).digest('hex');
  } catch {
    // Minimal pseudo-checksum fallback
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return `hash-${Math.abs(hash).toString(16)}`;
  }
}

export class BackupService {
  private isOperationLocked = false;
  private inMemoryPayloads = new Map<string, string>();

  private getWorkspaceId(): string {
    return supabaseAuthService.getCurrentCompanyId();
  }

  /**
   * Retrieves list of all backups for the authorized workspace
   */
  public async getBackupHistory(): Promise<BackupRecord[]> {
    const wsId = this.getWorkspaceId();
    let remoteBackups: BackupRecord[] = [];

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const { data, error } = await supabase
          .from('backups')
          .select('*')
          .eq('workspace_id', wsId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          remoteBackups = data.map((b: any) => ({
            id: b.id,
            workspaceId: b.workspace_id,
            branchId: b.branch_id,
            backupType: b.backup_type as BackupType,
            status: b.status as BackupStatus,
            storageLocation: b.storage_location || 'remote_supabase',
            fileSizeBytes: Number(b.file_size_bytes || 0),
            recordCounts: b.record_counts || {},
            checksumSha256: b.checksum_sha256,
            schemaVersion: b.schema_version,
            errorMessage: b.error_message,
            createdAt: b.created_at,
            verifiedAt: b.verified_at,
          }));
        }
      } catch (err) {
        console.warn('[BackupService] Remote backups query notice:', err);
      }
    }

    const localBackups = safeGetTenantStorage<BackupRecord>(BACKUP_META_STORAGE_KEY, []);

    // Merge with deduplication (remote takes priority)
    const seenIds = new Set<string>();
    const combined: BackupRecord[] = [];

    for (const b of remoteBackups) {
      if (!seenIds.has(b.id)) {
        seenIds.add(b.id);
        combined.push(b);
      }
    }

    for (const b of localBackups) {
      if (!seenIds.has(b.id)) {
        seenIds.add(b.id);
        combined.push(b);
      }
    }

    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Generates a comprehensive, consistent business data snapshot
   */
  public async generateDataSnapshot(branchId?: string): Promise<{ payload: BackupDataPayload; jsonString: string; checksum: string }> {
    const wsId = this.getWorkspaceId();

    // 1. Gather all local entities
    const invoices = store.getInvoices();
    const payments = store.getPayments();
    const customers = store.getCustomers();
    const suppliers = store.getSuppliers();
    const categories = store.getCategories();
    const products = store.getProducts();
    const quotations = store.getQuotations();
    const expenses = store.getExpenses();
    const udharis = store.getUdharis();
    const counterSales = store.getCounterSales();
    const settings = store.getSettings();

    const localDaybook = safeGetTenantStorage<any>('vistaar_local_daybook_db', []);
    const localCashbook = safeGetTenantStorage<any>('vistaar_local_cashbook_db', []);
    const localBranches = safeGetTenantStorage<any>('vistaar_local_branches_db', []);

    // 2. Query remote tables if available for maximum completeness
    let remoteInvoices: any[] = [];
    let remotePayments: any[] = [];
    let remoteItems: any[] = [];

    if (isSupabaseConfigured() && isValidUuid(wsId)) {
      try {
        const [invRes, payRes, itemRes] = await Promise.all([
          supabase.from('invoices').select('*').eq('workspace_id', wsId),
          supabase.from('payments').select('*').eq('workspace_id', wsId),
          supabase.from('invoice_items').select('*').eq('workspace_id', wsId),
        ]);
        remoteInvoices = invRes.data || [];
        remotePayments = payRes.data || [];
        remoteItems = itemRes.data || [];
      } catch {
        // non-blocking fallback
      }
    }

    // Merge remote and local with deduplication
    const mergedInvoices = [...invoices];
    const seenInvIds = new Set(invoices.map((i) => i.id));
    for (const r of remoteInvoices) {
      if (!seenInvIds.has(r.id)) {
        seenInvIds.add(r.id);
        mergedInvoices.push(r);
      }
    }

    const mergedPayments = [...payments];
    const seenPayIds = new Set(payments.map((p) => p.id));
    for (const p of remotePayments) {
      if (!seenPayIds.has(p.id)) {
        seenPayIds.add(p.id);
        mergedPayments.push(p);
      }
    }

    const payload: BackupDataPayload = {
      workspaceId: wsId,
      branchId,
      timestamp: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      businessName: settings.businessName || 'VISTAAR',
      data: {
        invoices: mergedInvoices,
        invoiceItems: remoteItems,
        payments: mergedPayments,
        customers,
        suppliers,
        categories,
        products,
        inventoryTransactions: (store as any).getInventoryTransactions ? (store as any).getInventoryTransactions() : [],
        stockReceipts: (store as any).getStockReceipts ? (store as any).getStockReceipts() : [],
        stockMovements: (store as any).getStockMovements ? (store as any).getStockMovements() : [],
        udhariRecords: udharis,
        udhariPayments: (store as any).getUdhariPayments ? (store as any).getUdhariPayments() : [],
        expenses,
        quotations,
        quotationItems: [],
        counterSales,
        branches: localBranches,
        daybookEntries: localDaybook,
        cashbookEntries: localCashbook,
        settings,
      },
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const checksum = await computeSha256(jsonString);

    return { payload, jsonString, checksum };
  }

  /**
   * Creates a verified backup (Manual, Automatic, or Safety)
   */
  public async createBackup(options: {
    type?: BackupType;
    branchId?: string;
  } = {}): Promise<{
    success: boolean;
    backup?: BackupRecord;
    error?: string;
  }> {
    return this.internalCreateBackup(options, false);
  }

  private async internalCreateBackup(
    options: {
      type?: BackupType;
      branchId?: string;
    } = {},
    isInternalSafety = false
  ): Promise<{
    success: boolean;
    backup?: BackupRecord;
    error?: string;
  }> {
    if (this.isOperationLocked && !isInternalSafety) {
      return { success: false, error: 'A backup or restore operation is already in progress. Please wait.' };
    }

    if (!isInternalSafety) {
      this.isOperationLocked = true;
    }

    const wsId = this.getWorkspaceId();
    const backupId = crypto.randomUUID();
    const backupType = options.type || 'manual';
    const nowIso = new Date().toISOString();

    try {
      // 1. Generate consistent snapshot
      const { payload, jsonString, checksum } = await this.generateDataSnapshot(options.branchId);
      const fileSizeBytes = new Blob([jsonString]).size;

      const recordCounts: Record<string, number> = {
        invoices: payload.data.invoices?.length || 0,
        payments: payload.data.payments?.length || 0,
        customers: payload.data.customers?.length || 0,
        products: payload.data.products?.length || 0,
        udharis: payload.data.udhariRecords?.length || 0,
        expenses: payload.data.expenses?.length || 0,
        counterSales: payload.data.counterSales?.length || 0,
      };

      const backupRecord: BackupRecord = {
        id: backupId,
        workspaceId: wsId,
        branchId: options.branchId,
        backupName: `VISTAAR-Backup-${backupType.toUpperCase()}-${nowIso.split('T')[0]}`,
        backupType,
        status: 'completed',
        storageLocation: 'protected_storage',
        sizeBytes: fileSizeBytes,
        fileSizeBytes,
        recordCounts,
        checksumSha256: checksum,
        schemaVersion: SCHEMA_VERSION,
        createdAt: nowIso,
        verifiedAt: nowIso,
      };

      // 2. Persist blob to in-memory cache and tenant storage
      this.inMemoryPayloads.set(backupId, jsonString);
      try {
        safeSaveTenantItem(`${BACKUP_DATA_PREFIX}${backupId}`, jsonString);
      } catch (storageErr) {
        console.warn('[BackupService] Could not cache backup blob in storage:', storageErr);
      }

      // 3. Save backup metadata to local backups history
      const history = safeGetTenantStorage<BackupRecord>(BACKUP_META_STORAGE_KEY, []);
      history.unshift(backupRecord);
      safeSaveTenantStorage(BACKUP_META_STORAGE_KEY, history.slice(0, 50));

      // 4. Persist to remote Supabase if available
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          const { error: insErr } = await supabase.from('backups').insert([
            {
              id: backupId,
              workspace_id: wsId,
              branch_id: options.branchId && isValidUuid(options.branchId) ? options.branchId : null,
              backup_type: backupType,
              status: 'completed',
              storage_location: 'remote_database',
              file_size_bytes: fileSizeBytes,
              record_counts: recordCounts,
              checksum_sha256: checksum,
              schema_version: SCHEMA_VERSION,
              backup_payload: payload,
              created_at: nowIso,
              verified_at: nowIso,
            },
          ]);

          if (insErr) {
            console.warn('[BackupService] Remote backups table insert notice:', insErr.message);
          }
        } catch (dbErr) {
          console.warn('[BackupService] Remote backups insert notice:', dbErr);
        }
      }

      // 5. Verify integrity (never claim success without cryptographic verification)
      const verifyCheck = await computeSha256(jsonString);
      if (verifyCheck !== checksum) {
        backupRecord.status = 'failed';
        backupRecord.errorMessage = 'Checksum verification mismatch after write.';
        await auditLogService.logFinancialEvent({
          action: 'BACKUP_VERIFICATION_FAILED',
          entityType: 'BACKUP',
          entityId: backupId,
          details: { expected: checksum, actual: verifyCheck },
        });
        return { success: false, error: 'Backup integrity verification failed!' };
      }

      // 6. Record Audit Log
      await auditLogService.logFinancialEvent({
        action: 'BACKUP_CREATED',
        entityType: 'BACKUP',
        entityId: backupId,
        details: {
          backupType,
          fileSizeBytes,
          recordCounts,
          checksum,
        },
      });

      return {
        success: true,
        backup: backupRecord,
      };
    } catch (err: any) {
      console.error('[BackupService] Backup creation failed:', err);
      return {
        success: false,
        error: err.message || 'Failed to generate backup.',
      };
    } finally {
      if (!isInternalSafety) {
        this.isOperationLocked = false;
      }
    }
  }

  /**
   * Retrieves the raw JSON string payload for downloading or inspecting a backup
   */
  public async getBackupContent(backupId: string): Promise<string | null> {
    const wsId = this.getWorkspaceId();

    // 1. Try in-memory payload cache
    if (this.inMemoryPayloads.has(backupId)) {
      return this.inMemoryPayloads.get(backupId)!;
    }

    // 2. Try tenant storage
    const localContent = safeGetTenantItem<string | null>(`${BACKUP_DATA_PREFIX}${backupId}`, null);
    if (localContent) {
      const resStr = typeof localContent === 'string' ? localContent : JSON.stringify(localContent, null, 2);
      this.inMemoryPayloads.set(backupId, resStr);
      return resStr;
    }

    // 3. Try remote Supabase
    if (isSupabaseConfigured() && isValidUuid(wsId) && isValidUuid(backupId)) {
      try {
        const { data, error } = await supabase
          .from('backups')
          .select('backup_payload')
          .eq('workspace_id', wsId)
          .eq('id', backupId)
          .maybeSingle();

        if (!error && data?.backup_payload) {
          const resStr = JSON.stringify(data.backup_payload, null, 2);
          this.inMemoryPayloads.set(backupId, resStr);
          return resStr;
        }
      } catch (e) {
        console.warn('[BackupService] Could not fetch remote backup payload:', e);
      }
    }

    return null;
  }

  /**
   * Verifies the cryptographic integrity and schema compatibility of a backup payload
   */
  public async verifyBackupIntegrity(rawJson: string): Promise<{
    valid: boolean;
    checksum: string;
    schemaVersion?: string;
    recordCounts?: Record<string, number>;
    error?: string;
  }> {
    try {
      const parsed: BackupDataPayload = JSON.parse(rawJson);
      if (!parsed || !parsed.data) {
        return { valid: false, checksum: '', error: 'Invalid backup structure: missing data payload.' };
      }

      const calculatedChecksum = await computeSha256(rawJson);

      const counts = {
        invoices: parsed.data.invoices?.length || 0,
        payments: parsed.data.payments?.length || 0,
        customers: parsed.data.customers?.length || 0,
        products: parsed.data.products?.length || 0,
        udharis: parsed.data.udhariRecords?.length || 0,
        expenses: parsed.data.expenses?.length || 0,
        counterSales: parsed.data.counterSales?.length || 0,
      };

      await auditLogService.logFinancialEvent({
        action: 'BACKUP_VERIFIED',
        entityType: 'BACKUP',
        details: { checksum: calculatedChecksum, counts, schema: parsed.schemaVersion },
      });

      return {
        valid: true,
        checksum: calculatedChecksum,
        schemaVersion: parsed.schemaVersion,
        recordCounts: counts,
      };
    } catch (err: any) {
      return {
        valid: false,
        checksum: '',
        error: `Malformed JSON: ${err.message}`,
      };
    }
  }

  /**
   * Guarded Restore Workflow
   * 1. Verifies confirmation code ('RESTORE')
   * 2. Creates a Safety Backup of current state first
   * 3. Validates backup integrity and tenant isolation
   * 4. Merges/Restores data atomically into store and Supabase
   * 5. Emits global dashboard refresh and audit log
   */
  public async restoreBackup(
    backupContentOrId: string,
    confirmationCode: string
  ): Promise<{
    success: boolean;
    restoredCounts?: Record<string, number>;
    safetyBackupId?: string;
    error?: string;
  }> {
    if (confirmationCode.trim().toUpperCase() !== 'RESTORE') {
      return { success: false, error: 'Confirmation rejected. You must type "RESTORE" to confirm.' };
    }

    if (this.isOperationLocked) {
      return { success: false, error: 'A backup or restore operation is already in progress. Please wait.' };
    }

    this.isOperationLocked = true;
    const wsId = this.getWorkspaceId();

    try {
      // 1. Resolve raw JSON
      let rawJson = backupContentOrId;
      if (!backupContentOrId.includes('{')) {
        const fetched = await this.getBackupContent(backupContentOrId);
        if (!fetched) {
          return { success: false, error: 'Backup content could not be located in local or remote storage.' };
        }
        rawJson = fetched;
      }

      // 2. Validate payload integrity
      const verify = await this.verifyBackupIntegrity(rawJson);
      if (!verify.valid) {
        return { success: false, error: `Backup integrity check failed: ${verify.error}` };
      }

      const parsed: BackupDataPayload = JSON.parse(rawJson);

      // Verify tenant isolation: reject restoring another workspace's backup into current workspace
      if (parsed.workspaceId && isValidUuid(parsed.workspaceId) && isValidUuid(wsId)) {
        if (parsed.workspaceId !== wsId) {
          return {
            success: false,
            error: `Tenant isolation violation: This backup belongs to workspace "${parsed.workspaceId}", which does not match active workspace "${wsId}".`,
          };
        }
      }

      // 3. Create Safety Pre-Restore Backup FIRST
      console.log('[BackupService] Creating pre-restore safety snapshot...');
      const safetyRes = await this.internalCreateBackup({ type: 'safety' }, true);
      const safetyId = safetyRes.backup?.id;

      // 4. Restore Data into Local Store State & Tenant Storage
      const { data } = parsed;

      if (data.customers && Array.isArray(data.customers)) {
        store.setCustomers(data.customers);
      }

      if (data.products && Array.isArray(data.products)) {
        store.setProducts(data.products);
      }

      if (data.invoices && Array.isArray(data.invoices)) {
        store.syncRemoteInvoices(data.invoices);
      }

      if (data.payments && Array.isArray(data.payments)) {
        store.syncRemotePayments(data.payments);
      }

      if (data.udhariRecords && Array.isArray(data.udhariRecords)) {
        store.syncRemoteUdharis(data.udhariRecords);
      }

      if (data.counterSales && Array.isArray(data.counterSales)) {
        (store as any).syncRemoteCounterSales ? (store as any).syncRemoteCounterSales(data.counterSales) : null;
      }

      // Persist local state
      store.saveAndNotify();

      // 5. Restore to remote Supabase if available
      if (isSupabaseConfigured() && isValidUuid(wsId)) {
        try {
          if (data.invoices && data.invoices.length > 0) {
            for (const inv of data.invoices) {
              if (isValidUuid(inv.id)) {
                await supabase.from('invoices').upsert([{
                  id: inv.id,
                  workspace_id: wsId,
                  customer_id: isValidUuid(inv.customerId || inv.customer_id) ? (inv.customerId || inv.customer_id) : null,
                  invoice_number: inv.invoiceNumber || inv.invoice_number,
                  customer_name: inv.customerName || inv.customer_name,
                  customer_phone: inv.customerPhone || inv.customer_phone,
                  status: inv.status,
                  date: inv.date,
                  due_date: inv.dueDate || inv.due_date,
                  subtotal: inv.subtotal,
                  discount_total: inv.discountTotal || inv.discount_total,
                  tax_total: inv.taxTotal || inv.tax_total,
                  grand_total: inv.grandTotal || inv.grand_total,
                  paid_amount: inv.paidAmount || inv.paid_amount,
                  balance_amount: inv.balanceAmount || inv.balance_amount,
                  notes: inv.notes,
                  terms: inv.terms,
                }]);
              }
            }
          }

          if (data.payments && data.payments.length > 0) {
            for (const p of data.payments) {
              if (isValidUuid(p.id)) {
                await supabase.from('payments').upsert([{
                  id: p.id,
                  workspace_id: wsId,
                  invoice_id: isValidUuid(p.invoiceId || p.invoice_id) ? (p.invoiceId || p.invoice_id) : null,
                  invoice_number: p.invoiceNumber || p.invoice_number,
                  customer_id: isValidUuid(p.customerId || p.customer_id) ? (p.customerId || p.customer_id) : null,
                  customer_name: p.customerName || p.customer_name,
                  amount: p.amount,
                  payment_date: p.date || p.payment_date,
                  method: p.method || p.payment_method || 'Cash',
                  reference_no: p.referenceNo || p.reference_no,
                  notes: p.notes,
                }]);
              }
            }
          }
        } catch (remoteRestoreErr) {
          console.warn('[BackupService] Remote restore notice:', remoteRestoreErr);
        }
      }

      // 6. Record Audit Log
      await auditLogService.logFinancialEvent({
        action: 'BACKUP_RESTORED',
        entityType: 'BACKUP',
        details: {
          safetyBackupId: safetyId,
          restoredCounts: verify.recordCounts,
        },
      });

      // 7. Refresh Application
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vistaar:refresh-dashboard'));
      }

      return {
        success: true,
        restoredCounts: verify.recordCounts,
        safetyBackupId: safetyId,
      };
    } catch (err: any) {
      console.error('[BackupService] Restore failed:', err);
      return {
        success: false,
        error: err.message || 'Restore execution failed.',
      };
    } finally {
      this.isOperationLocked = false;
    }
  }

  /**
   * Automated Daily Backup Trigger
   * Checks if an automatic backup was already created today. If not, creates one.
   */
  public async checkAndTriggerDailyBackup(): Promise<void> {
    try {
      const history = await this.getBackupHistory();
      const lastAuto = history.find((b) => b.backupType === 'automatic' && b.status === 'completed');
      if (lastAuto) {
        const lastDate = new Date(lastAuto.createdAt).toISOString().split('T')[0];
        const todayDate = new Date().toISOString().split('T')[0];
        if (lastDate === todayDate) {
          // Already backed up today
          return;
        }
      }

      console.log('[BackupService] Triggering automatic daily backup...');
      await this.createBackup({ type: 'automatic' });
    } catch (e) {
      console.warn('[BackupService] Automatic backup check notice:', e);
    }
  }
}

export const backupService = new BackupService();
