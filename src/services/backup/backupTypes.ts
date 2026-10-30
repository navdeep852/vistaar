/**
 * VISTAAR Business OS — Backup System Type Definitions
 * Complete, versioned, portable schema for VISTAAR Desktop and Web
 */

export type BackupType =
  | 'manual'
  | 'daily'
  | 'weekly'
  | 'safety_pre_restore'
  | 'download'
  | 'automatic';
export type BackupStatus = 'pending' | 'running' | 'encrypting' | 'writing' | 'completed' | 'verified' | 'failed';
export type BackupPlatform = 'desktop' | 'web';

export interface BackupEncryptionInfo {
  enabled: boolean;
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2';
  kdfHash: 'SHA-256';
  iterations: number;
  saltHex: string;
  ivHex: string;
}

export interface BackupTableSummary {
  rowCount: number;
  checksum?: string;
}

export interface BackupIntegrityInfo {
  algorithm: 'SHA-256';
  checksum: string; // SHA-256 of encrypted or raw payload
  uncompressedSizeBytes: number;
  archiveSizeBytes: number;
}

export interface BackupManifest {
  format: 'VISTAAR_BACKUP';
  formatVersion: 1;
  application: 'VISTAAR';
  backupId: string;
  workspaceId: string;
  workspaceName: string;
  createdAt: string; // ISO-8601
  backupType: BackupType;
  schemaVersion: string;
  applicationVersion: string;
  platform: BackupPlatform;
  encryption: BackupEncryptionInfo;
  tables: Record<string, BackupTableSummary>;
  integrity: BackupIntegrityInfo;
}

export interface BackupDataPayload {
  workspaces?: any[];
  business_settings?: any[];
  inventory_settings?: any[];
  branches?: any[];
  user_branch_access?: any[];
  profiles?: any[];
  categories?: any[];
  suppliers?: any[];
  customers?: any[];
  products?: any[];
  branch_inventory?: any[];
  stock_receipts?: any[];
  stock_movements?: any[];
  stock_transfers?: any[];
  stock_transfer_items?: any[];
  quotations?: any[];
  quotation_items?: any[];
  invoices?: any[];
  invoice_items?: any[];
  payments?: any[];
  payment_transactions?: any[];
  counter_sales?: any[];
  counter_sale_items?: any[];
  udhari_records?: any[];
  udhari_payments?: any[];
  expenses?: any[];
  daybook_transactions?: any[];
  cashbook_entries?: any[];
  financial_accounts?: any[];
  purchase_orders?: any[];
  purchase_order_items?: any[];
  purchase_order_receipts?: any[];
  purchase_order_receipt_items?: any[];
  supplier_catalogue_files?: any[];
  supplier_catalogue_items?: any[];
  supplier_catalogue_mappings?: any[];
  eway_bills?: any[];
  eway_bill_items?: any[];
  eway_bill_events?: any[];
  vehicles?: any[];
  transporters?: any[];
  salary_structures?: any[];
  salary_payments?: any[];
  salary_payment_items?: any[];
  follow_ups?: any[];
  notifications?: any[];
  feedbacks?: any[];
  offers?: any[];
  [tableName: string]: any[] | undefined;
}

export interface StoredBackupFile {
  format: 'VISTAAR_BACKUP';
  version: 1;
  manifest: BackupManifest;
  encrypted: boolean;
  payload: string; // Base64 encoded encrypted payload (AES-256-GCM)
}

export type LocalWriteStatus = 'saved' | 'failed' | 'downloaded';
export type CloudSyncStatus = 'unknown' | 'synced' | 'syncing' | 'not_applicable';

export interface BackupHistoryRecord {
  backupId: string;
  workspaceId: string;
  workspaceName?: string;
  createdAt: string;
  completedAt?: string;
  backupType: 'manual' | 'automatic' | 'download';
  destinationType: 'onedrive_folder' | 'browser_download' | 'local_folder';
  destinationName: string;
  fileName: string;
  filePath?: string;
  fileSizeBytes: number;
  recordCounts: Record<string, number>;
  totalRecords: number;
  integrityStatus: 'verified' | 'corrupted' | 'unverified';
  localWriteStatus: LocalWriteStatus;
  cloudSyncStatus: CloudSyncStatus;
  errorMessage?: string;
}

export interface BackupFileInfo {
  fileName: string;
  filePath?: string;
  fileSizeBytes: number;
  createdAt: string;
  status: 'valid' | 'corrupted' | 'unverified';
  backupType?: 'manual' | 'automatic' | 'download';
  destinationName?: string;
  localWriteStatus?: LocalWriteStatus;
  cloudSyncStatus?: CloudSyncStatus;
  manifest?: BackupManifest;
  error?: string;
}

export interface BackupCapabilities {
  platform: BackupPlatform;
  hasDirectoryPicker: boolean;
  hasNativeFs: boolean;
  supportsDirectFolder: boolean;
  canOpenFolderInExplorer: boolean;
}

export interface BackupDestinationResult {
  success: boolean;
  folderPath?: string;
  folderName?: string;
  error?: string;
  warning?: string;
}

export interface BackupWriteResult {
  success: boolean;
  fileName: string;
  filePath?: string;
  fileSizeBytes: number;
  checksum: string;
  error?: string;
}

export interface BackupReadResult {
  success: boolean;
  data?: Uint8Array;
  error?: string;
}

export interface BackupDeleteResult {
  success: boolean;
  fileName: string;
  error?: string;
}

export interface BackupVerificationResult {
  valid: boolean;
  manifest?: BackupManifest;
  error?: string;
  checksumMatches?: boolean;
  passwordRequired?: boolean;
  rowCountTotal?: number;
}

export interface RestorePreview {
  backupId: string;
  createdAt: string;
  sourceWorkspaceId: string;
  sourceWorkspaceName: string;
  currentWorkspaceId: string;
  currentWorkspaceName: string;
  isSameWorkspace: boolean;
  schemaVersion: string;
  totalRecords: number;
  tableCounts: Record<string, number>;
  warnings: string[];
}

export interface RestoreResult {
  success: boolean;
  safetyBackupFileName?: string;
  restoredCounts: Record<string, number>;
  totalRestored: number;
  durationMs: number;
  error?: string;
  verificationReport?: {
    verified: boolean;
    invoicesVerified: boolean;
    paymentsVerified: boolean;
    productsVerified: boolean;
    discrepancies: string[];
  };
}

export interface BackupSettings {
  autoBackupEnabled: boolean;
  frequency: 'manual' | 'daily' | 'weekly';
  preferredTime: string; // e.g. "23:00"
  retentionDailyCount: number; // default 7
  retentionWeeklyCount: number; // default 4
  retentionMonthlyCount: number; // default 3
  destinationPath?: string; // Local folder path (desktop)
  destinationLabel?: string; // Display name of folder
  lastSuccessfulBackup?: string;
  lastAttemptedBackup?: string;
  lastStatus?: 'completed' | 'failed';
  lastError?: string;
  nextScheduledBackup?: string;
}

export type BackupStage =
  | 'idle'
  | 'collecting'
  | 'compressing'
  | 'encrypting'
  | 'writing'
  | 'verifying'
  | 'cleanup'
  | 'completed'
  | 'failed';

export interface BackupProgressInfo {
  stage: BackupStage;
  message: string;
  percentage: number;
  currentTable?: string;
  tableIndex?: number;
  totalTables?: number;
  rowsCollected?: number;
}

export type BackupProgressCallback = (info: BackupProgressInfo) => void;

