/**
 * VISTAAR Business OS — Authoritative Data Collector
 * Queries live Supabase PostgreSQL tables using paged batching with full workspace isolation.
 */

import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { isValidUuid } from '../../lib/supabaseError';
import { BackupCollectionError } from './backupErrors';
import { BackupDataPayload, BackupProgressCallback } from './backupTypes';

const PAGE_SIZE = 1000;

interface TableConfig {
  name: string;
  isWorkspaceRecord?: boolean;
  isRequired?: boolean;
  columnFilter?: string; // default 'workspace_id'
}

/**
 * Ordered list of all workspace-scoped business tables to collect.
 */
const TABLES_TO_COLLECT: TableConfig[] = [
  { name: 'workspaces', isWorkspaceRecord: true, isRequired: true },
  { name: 'business_settings', isRequired: true },
  { name: 'inventory_settings', isRequired: false },
  { name: 'branches', isRequired: true },
  { name: 'user_branch_access', isRequired: false },
  { name: 'profiles', isRequired: true },
  { name: 'categories', isRequired: true },
  { name: 'suppliers', isRequired: true },
  { name: 'customers', isRequired: true },
  { name: 'products', isRequired: true },
  { name: 'branch_inventory', isRequired: false },
  { name: 'stock_receipts', isRequired: false },
  { name: 'stock_movements', isRequired: false },
  { name: 'stock_transfers', isRequired: false },
  { name: 'stock_transfer_items', isRequired: false },
  { name: 'quotations', isRequired: false },
  { name: 'quotation_items', isRequired: false },
  { name: 'invoices', isRequired: true },
  { name: 'invoice_items', isRequired: true },
  { name: 'payments', isRequired: true },
  { name: 'payment_transactions', isRequired: false },
  { name: 'counter_sales', isRequired: false },
  { name: 'counter_sale_items', isRequired: false },
  { name: 'udhari_records', isRequired: false },
  { name: 'udhari_payments', isRequired: false },
  { name: 'expenses', isRequired: false },
  { name: 'daybook_transactions', isRequired: false },
  { name: 'cashbook_entries', isRequired: false },
  { name: 'financial_accounts', isRequired: false },
  { name: 'purchase_orders', isRequired: false },
  { name: 'purchase_order_items', isRequired: false },
  { name: 'purchase_order_receipts', isRequired: false },
  { name: 'purchase_order_receipt_items', isRequired: false },
  { name: 'supplier_catalogue_files', isRequired: false },
  { name: 'supplier_catalogue_items', isRequired: false },
  { name: 'supplier_catalogue_mappings', isRequired: false },
  { name: 'eway_bills', isRequired: false },
  { name: 'eway_bill_items', isRequired: false },
  { name: 'vehicles', isRequired: false },
  { name: 'transporters', isRequired: false },
  { name: 'salary_structures', isRequired: false },
  { name: 'salary_payments', isRequired: false },
  { name: 'salary_payment_items', isRequired: false },
  { name: 'follow_ups', isRequired: false },
  { name: 'notifications', isRequired: false },
  { name: 'feedbacks', isRequired: false },
  { name: 'offers', isRequired: false },
];

export class BackupDataCollector {
  /**
   * Fetches an entire table from Supabase using deterministic pagination.
   */
  private static async fetchTablePaged(
    tableName: string,
    workspaceId: string,
    config: TableConfig
  ): Promise<any[]> {
    if (config.isWorkspaceRecord) {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .maybeSingle();

      if (error) {
        throw new BackupCollectionError(`Failed to fetch workspace metadata: ${error.message}`);
      }
      return data ? [data] : [];
    }

    const allRows: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const filterCol = config.columnFilter || 'workspace_id';
      let query = supabase
        .from(tableName)
        .select('*')
        .eq(filterCol, workspaceId)
        .range(offset, offset + PAGE_SIZE - 1);

      // Stable sorting if possible
      try {
        query = query.order('id', { ascending: true });
      } catch {
        // Some tables may lack an 'id' column
      }

      const { data, error } = await query;

      if (error) {
        // Handle missing table gracefully if table is not strictly required
        if (error.code === 'PGRST205' || error.code === '42P01') {
          console.warn(`[BackupDataCollector] Optional table '${tableName}' does not exist in database.`);
          return [];
        }

        if (config.isRequired) {
          throw new BackupCollectionError(
            `Failed to collect required table '${tableName}': ${error.message} (Code: ${error.code})`
          );
        } else {
          console.warn(`[BackupDataCollector] Optional table '${tableName}' query error:`, error.message);
          return [];
        }
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allRows.push(...data);
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          offset += PAGE_SIZE;
        }
      }
    }

    // Sanitize user profiles to strip sensitive internal fields and large base64 avatars
    if (tableName === 'profiles') {
      return allRows.map((p) => {
        const clean = { ...p };
        delete clean.password;
        delete clean.password_hash;
        delete clean.access_token;
        delete clean.refresh_token;
        if (typeof clean.avatar_url === 'string' && clean.avatar_url.startsWith('data:') && clean.avatar_url.length > 500) {
          clean.avatar_url = '';
        }
        return clean;
      });
    }

    return allRows;
  }

  /**
   * Collects all workspace data across tables with progress reporting.
   */
  public static async collectWorkspaceData(
    workspaceId: string,
    onProgress?: BackupProgressCallback
  ): Promise<{ data: BackupDataPayload; tableCounts: Record<string, number>; totalRows: number }> {
    if (!isSupabaseConfigured()) {
      throw new BackupCollectionError('Supabase client is not configured.');
    }
    if (!isValidUuid(workspaceId)) {
      throw new BackupCollectionError(`Invalid authoritative workspace ID '${workspaceId}'.`);
    }

    const payload: BackupDataPayload = {};
    const tableCounts: Record<string, number> = {};
    let totalRows = 0;
    const totalTables = TABLES_TO_COLLECT.length;

    for (let i = 0; i < totalTables; i++) {
      const tableConfig = TABLES_TO_COLLECT[i];
      const tableName = tableConfig.name;

      if (onProgress) {
        onProgress({
          stage: 'collecting',
          message: `Collecting ${tableName}...`,
          percentage: Math.round(((i + 1) / totalTables) * 60), // Collecting is 0% - 60%
          currentTable: tableName,
          tableIndex: i + 1,
          totalTables,
          rowsCollected: totalRows,
        });
      }

      try {
        const rows = await this.fetchTablePaged(tableName, workspaceId, tableConfig);
        payload[tableName] = rows;
        tableCounts[tableName] = rows.length;
        totalRows += rows.length;
      } catch (err: any) {
        if (tableConfig.isRequired) {
          throw err;
        }
        console.warn(`[BackupDataCollector] Skipped non-critical table '${tableName}':`, err);
        payload[tableName] = [];
        tableCounts[tableName] = 0;
      }
    }

    return { data: payload, tableCounts, totalRows };
  }
}

