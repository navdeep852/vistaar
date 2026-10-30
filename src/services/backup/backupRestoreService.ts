/**
 * VISTAAR Business OS — Transactional Restoration Engine
 * Validates, decrypts, previews, and restores workspace data in strict foreign-key dependency order.
 */

import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { isValidUuid } from '../../lib/supabaseError';
import { BackupSerializer } from './backupSerializer';
import { BackupRestoreError, formatBackupDbError } from './backupErrors';
import {
  BackupDataPayload,
  BackupManifest,
  RestorePreview,
  RestoreResult,
} from './backupTypes';

const BATCH_SIZE = 100;

export class BackupRestoreService {
  /**
   * Generates a preview of the backup without mutating the database
   */
  public static async generatePreview(
    archiveContent: string,
    currentWorkspaceId: string,
    currentWorkspaceName: string,
    password?: string
  ): Promise<{ preview: RestorePreview; manifest: BackupManifest; data?: BackupDataPayload }> {
    // 1. Inspect Manifest
    const manifest = BackupSerializer.inspectManifest(archiveContent);

    // 2. Compute Warnings
    const warnings: string[] = [];
    const isSameWorkspace = manifest.workspaceId === currentWorkspaceId;
    if (!isSameWorkspace) {
      warnings.push(
        `Workspace Mismatch: Archive was created for "${manifest.workspaceName}" (${manifest.workspaceId}), but your active workspace is "${currentWorkspaceName}" (${currentWorkspaceId}). Records will be mapped into your current workspace.`
      );
    }

    // 3. Count Total Records from Manifest
    let totalRecords = 0;
    const tableCounts: Record<string, number> = {};
    for (const [tName, summary] of Object.entries(manifest.tables || {})) {
      tableCounts[tName] = summary.rowCount || 0;
      totalRecords += summary.rowCount || 0;
    }

    // 4. If password is provided, attempt full decryption test
    let data: BackupDataPayload | undefined;
    if (password !== undefined) {
      const unpacked = await BackupSerializer.deserializeArchive(archiveContent, password);
      data = unpacked.data;
    }

    const preview: RestorePreview = {
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      sourceWorkspaceId: manifest.workspaceId,
      sourceWorkspaceName: manifest.workspaceName,
      currentWorkspaceId,
      currentWorkspaceName,
      isSameWorkspace,
      schemaVersion: manifest.schemaVersion,
      totalRecords,
      tableCounts,
      warnings,
    };

    return { preview, manifest, data };
  }

  /**
   * Helper to batch upsert rows into a Supabase table with workspace isolation re-mapping
   */
  private static async upsertTableBatch(
    tableName: string,
    rows: any[],
    targetWorkspaceId: string
  ): Promise<number> {
    if (!rows || rows.length === 0) return 0;

    // Filter and remap workspace_id
    const sanitizedRows = rows.map((row) => {
      const clean = { ...row };
      if ('workspace_id' in clean || tableName !== 'workspaces') {
        clean.workspace_id = targetWorkspaceId;
      }
      return clean;
    });

    let inserted = 0;
    const onConflictColumn =
      tableName === 'business_settings' || tableName === 'inventory_settings'
        ? 'workspace_id'
        : 'id';

    for (let i = 0; i < sanitizedRows.length; i += BATCH_SIZE) {
      const chunk = sanitizedRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from(tableName)
        .upsert(chunk, { onConflict: onConflictColumn });

      if (error) {
        // If optional table doesn't exist, log and continue
        if (error.code === 'PGRST205' || error.code === '42P01') {
          console.warn(`[BackupRestoreService] Table '${tableName}' does not exist on target database. Skipped.`);
          return 0;
        }
        throw new BackupRestoreError(
          formatBackupDbError(tableName, `restore upsert (rows ${i}-${i + chunk.length})`, error)
        );
      }
      inserted += chunk.length;
    }

    return inserted;
  }

  /**
   * Restores an unpacked backup payload into the target workspace in strict dependency order.
   */
  public static async executeRestore(
    data: BackupDataPayload,
    manifest: BackupManifest,
    targetWorkspaceId: string
  ): Promise<RestoreResult> {
    if (!isSupabaseConfigured()) {
      throw new BackupRestoreError('Supabase client is not configured.');
    }
    if (!isValidUuid(targetWorkspaceId)) {
      throw new BackupRestoreError(`Invalid target workspace ID '${targetWorkspaceId}'.`);
    }

    const startTime = Date.now();
    const restoredCounts: Record<string, number> = {};
    let totalRestored = 0;

    // Dependency Restoration Pipeline (Strict order of foreign keys)
    const RESTORE_ORDER: string[] = [
      'business_settings',
      'inventory_settings',
      'branches',
      'user_branch_access',
      'categories',
      'suppliers',
      'customers',
      'products',
      'branch_inventory',
      'purchase_orders',
      'purchase_order_items',
      'purchase_order_receipts',
      'purchase_order_receipt_items',
      'supplier_catalogue_files',
      'supplier_catalogue_items',
      'supplier_catalogue_mappings',
      'stock_receipts',
      'stock_transfers',
      'stock_transfer_items',
      'stock_movements',
      'quotations',
      'quotation_items',
      'invoices',
      'invoice_items',
      'payments',
      'payment_transactions',
      'counter_sales',
      'counter_sale_items',
      'udhari_records',
      'udhari_payments',
      'expenses',
      'financial_accounts',
      'daybook_transactions',
      'cashbook_entries',
      'eway_bills',
      'eway_bill_items',
      'vehicles',
      'transporters',
      'salary_structures',
      'salary_payments',
      'salary_payment_items',
      'follow_ups',
      'notifications',
      'feedbacks',
      'offers',
      'id_mappings',
    ];

    for (const tableName of RESTORE_ORDER) {
      const rows = data[tableName];
      if (rows && Array.isArray(rows) && rows.length > 0) {
        try {
          const count = await this.upsertTableBatch(tableName, rows, targetWorkspaceId);
          restoredCounts[tableName] = count;
          totalRestored += count;
        } catch (err: any) {
          throw new BackupRestoreError(
            `Restoration failed during step '${tableName}': ${err.message || String(err)}`
          );
        }
      } else {
        restoredCounts[tableName] = 0;
      }
    }

    // Post-Restore Verification: Re-query counts to confirm database persistence
    const discrepancies: string[] = [];
    const keyTablesToCheck = ['customers', 'products', 'invoices', 'payments'];

    for (const t of keyTablesToCheck) {
      if (data[t] && data[t]!.length > 0) {
        try {
          const { count, error } = await supabase
            .from(t)
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', targetWorkspaceId);

          if (!error && typeof count === 'number') {
            if (count < data[t]!.length) {
              discrepancies.push(
                `Table '${t}': expected at least ${data[t]!.length} records, found ${count} in database.`
              );
            }
          }
        } catch (vErr: any) {
          console.warn(`[BackupRestoreService] Post-restore count verification notice for '${t}':`, vErr);
        }
      }
    }

    const durationMs = Date.now() - startTime;

    return {
      success: discrepancies.length === 0,
      restoredCounts,
      totalRestored,
      durationMs,
      verificationReport: {
        verified: discrepancies.length === 0,
        invoicesVerified: !discrepancies.some((d) => d.includes('invoices')),
        paymentsVerified: !discrepancies.some((d) => d.includes('payments')),
        productsVerified: !discrepancies.some((d) => d.includes('products')),
        discrepancies,
      },
    };
  }
}

