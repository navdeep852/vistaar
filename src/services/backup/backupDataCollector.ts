/**
 * VISTAAR Business OS — Authoritative Data Collector
 * Queries live Supabase PostgreSQL tables using paged batching with full workspace isolation.
 * Strictly adheres to verified production database schemas (no assumptions of 'id' on singleton tables).
 */

import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { isValidUuid } from '../../lib/supabaseError';
import { BackupCollectionError, formatBackupDbError } from './backupErrors';
import { BackupDataPayload, BackupProgressCallback } from './backupTypes';

const PAGE_SIZE = 1000;

export interface TableSchemaConfig {
  name: string;
  primaryKey: 'workspace_id' | 'id';
  isWorkspaceRecord?: boolean; // workspaces table: queried by id = workspaceId
  isSingletonRecord?: boolean; // business_settings, inventory_settings: at most 1 row per workspace!
  isRequired: boolean;
  columnFilter?: string; // default: 'workspace_id'
  sortColumn?: string | null; // column for deterministic pagination (null if singleton)
}

/**
 * Ordered list of all workspace-scoped business tables to collect.
 * Primary keys, singletons, and requirements are validated against live production schema.
 */
export const TABLES_TO_COLLECT: TableSchemaConfig[] = [
  // 1. Core workspace & settings
  { name: 'workspaces', primaryKey: 'id', isWorkspaceRecord: true, isRequired: true, columnFilter: 'id', sortColumn: 'id' },
  { name: 'business_settings', primaryKey: 'workspace_id', isSingletonRecord: true, isRequired: true, columnFilter: 'workspace_id', sortColumn: null },
  { name: 'inventory_settings', primaryKey: 'workspace_id', isSingletonRecord: true, isRequired: false, columnFilter: 'workspace_id', sortColumn: null },

  // 2. Multi-branch & User Access (Optional if multi-branch migrations not yet deployed)
  { name: 'branches', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'user_branch_access', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'branch_inventory', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'stock_transfers', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'stock_transfer_items', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 3. User & Organization Data
  { name: 'profiles', primaryKey: 'id', isRequired: true, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 4. Master Data
  { name: 'categories', primaryKey: 'id', isRequired: true, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'suppliers', primaryKey: 'id', isRequired: true, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'customers', primaryKey: 'id', isRequired: true, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'products', primaryKey: 'id', isRequired: true, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 5. Stock & Receipts
  { name: 'stock_receipts', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'stock_movements', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 6. Quotations
  { name: 'quotations', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'quotation_items', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 7. Invoices & Billing (Core)
  { name: 'invoices', primaryKey: 'id', isRequired: true, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'invoice_items', primaryKey: 'id', isRequired: true, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'payments', primaryKey: 'id', isRequired: true, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'payment_transactions', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 8. POS & Counter Sales
  { name: 'counter_sales', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'counter_sale_items', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 9. Udhari Ledger
  { name: 'udhari_records', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'udhari_payments', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 10. Financials & Journals
  { name: 'expenses', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'financial_accounts', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'daybook_transactions', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'cashbook_entries', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 11. Purchase Orders & Supplier Catalogues
  { name: 'purchase_orders', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'purchase_order_items', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'purchase_order_receipts', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'purchase_order_receipt_items', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'supplier_catalogue_files', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'supplier_catalogue_items', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'supplier_catalogue_mappings', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 12. Logistics & E-Way Bills
  { name: 'eway_bills', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'eway_bill_items', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'vehicles', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'transporters', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 13. Payroll & Staff
  { name: 'salary_structures', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'salary_payments', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'salary_payment_items', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },

  // 14. CRM & Operations
  { name: 'follow_ups', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'notifications', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'feedbacks', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'offers', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
  { name: 'id_mappings', primaryKey: 'id', isRequired: false, columnFilter: 'workspace_id', sortColumn: 'id' },
];

export class BackupDataCollector {
  /**
   * Pre-flight Schema Validation: Verifies core table accessibility, primary key columns,
   * and workspace ownership before initiating data collection.
   */
  public static async validateSchema(workspaceId: string): Promise<{ valid: boolean; errors: string[] }> {
    if (!isSupabaseConfigured()) {
      return { valid: false, errors: ['Supabase client is not configured or missing environment credentials.'] };
    }
    if (!isValidUuid(workspaceId)) {
      return { valid: false, errors: [`Invalid workspace ID format: '${workspaceId}' (must be a valid UUID).`] };
    }

    const errors: string[] = [];

    // 1. Verify business_settings: Must be queryable by workspace_id without assuming id column
    try {
      const { error: bsErr } = await supabase
        .from('business_settings')
        .select('workspace_id, legal_name, email, phone')
        .eq('workspace_id', workspaceId)
        .limit(1);

      if (bsErr) {
        errors.push(formatBackupDbError('business_settings', 'schema_validation', bsErr));
      }
    } catch (err: any) {
      errors.push(`Failed pre-flight validation on 'business_settings': ${err?.message || err}`);
    }

    // 2. Verify core transactional tables exist and support workspace filtering
    const coreTables = ['customers', 'products', 'invoices', 'invoice_items', 'payments'];
    for (const table of coreTables) {
      try {
        const { error } = await supabase
          .from(table)
          .select('id, workspace_id')
          .eq('workspace_id', workspaceId)
          .limit(0);

        if (error) {
          errors.push(formatBackupDbError(table, 'schema_validation', error));
        }
      } catch (err: any) {
        errors.push(`Failed pre-flight validation on '${table}': ${err?.message || err}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Fetches an entire table from Supabase using schema-aware paged batching.
   * Eliminates erroneous ORDER BY 'id' queries on tables without an 'id' column.
   */
  private static async fetchTablePaged(
    tableName: string,
    workspaceId: string,
    config: TableSchemaConfig
  ): Promise<any[]> {
    // Case 1: Workspace root record (queried by workspaces.id = workspaceId)
    if (config.isWorkspaceRecord) {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', workspaceId)
        .maybeSingle();

      if (error) {
        throw new BackupCollectionError(
          formatBackupDbError('workspaces', 'select', error)
        );
      }
      return data ? [data] : [];
    }

    // Case 2: Singleton records where workspace_id is primary key (business_settings, inventory_settings)
    // There is at most 1 row per workspace; DO NOT sort by 'id' (id column does not exist!).
    if (config.isSingletonRecord || config.primaryKey === 'workspace_id') {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle();

      if (error) {
        // Handle optional table missing from schema cache
        if (error.code === 'PGRST205' || error.code === '42P01') {
          if (!config.isRequired) {
            console.warn(`[BackupDataCollector] Optional singleton table '${tableName}' not present in schema cache.`);
            return [];
          }
        }

        if (config.isRequired) {
          throw new BackupCollectionError(
            formatBackupDbError(tableName, 'select', error)
          );
        } else {
          console.warn(`[BackupDataCollector] Optional singleton table '${tableName}' query notice:`, error.message);
          return [];
        }
      }

      return data ? [data] : [];
    }

    // Case 3: Paged collection for multi-row workspace-scoped tables
    const allRows: any[] = [];
    let offset = 0;
    let hasMore = true;
    const filterCol = config.columnFilter || 'workspace_id';

    while (hasMore) {
      let query = supabase
        .from(tableName)
        .select('*')
        .eq(filterCol, workspaceId)
        .range(offset, offset + PAGE_SIZE - 1);

      // Only apply order if table explicitly has an 'id' or specified sort column
      if (config.sortColumn) {
        query = query.order(config.sortColumn, { ascending: true });
      } else if (config.primaryKey === 'id') {
        query = query.order('id', { ascending: true });
      }

      const { data, error } = await query;

      if (error) {
        // Handle optional table missing from schema cache
        if (error.code === 'PGRST205' || error.code === '42P01') {
          if (!config.isRequired) {
            console.warn(`[BackupDataCollector] Optional table '${tableName}' not present in schema cache.`);
            return [];
          }
        }

        if (config.isRequired) {
          throw new BackupCollectionError(
            formatBackupDbError(tableName, 'select', error)
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

    // Pre-flight schema validation
    const validation = await this.validateSchema(workspaceId);
    if (!validation.valid) {
      throw new BackupCollectionError(
        `Pre-flight schema validation failed:\n${validation.errors.join('\n')}`
      );
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
