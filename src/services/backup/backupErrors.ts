/**
 * VISTAAR Business OS — Backup System Error Hierarchy
 */

export class BackupError extends Error {
  public code: string;
  public details?: any;

  constructor(message: string, code: string = 'BACKUP_ERROR', details?: any) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BackupValidationError extends BackupError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'BackupValidationError';
  }
}

export class BackupCryptoError extends BackupError {
  constructor(message: string, details?: any) {
    super(message, 'CRYPTO_ERROR', details);
    this.name = 'BackupCryptoError';
  }
}

export class BackupPermissionError extends BackupError {
  constructor(message: string, details?: any) {
    super(message, 'PERMISSION_ERROR', details);
    this.name = 'BackupPermissionError';
  }
}

export class BackupCollectionError extends BackupError {
  constructor(message: string, details?: any) {
    super(message, 'COLLECTION_ERROR', details);
    this.name = 'BackupCollectionError';
  }
}

export class BackupRestoreError extends BackupError {
  constructor(message: string, details?: any) {
    super(message, 'RESTORE_ERROR', details);
    this.name = 'BackupRestoreError';
  }
}

export class BackupNotFoundError extends BackupError {
  constructor(message: string, details?: any) {
    super(message, 'NOT_FOUND', details);
    this.name = 'BackupNotFoundError';
  }
}

/**
 * Formats PostgreSQL / PostgREST errors into safe, structured, actionable messages
 * without leaking credentials, sensitive data, or raw query text.
 */
export function formatBackupDbError(
  table: string,
  operation: string,
  error: { code?: string; message?: string; details?: string; hint?: string } | any
): string {
  const code = error?.code || 'UNKNOWN';
  const rawMsg = error?.message || String(error);
  let explanation = rawMsg;
  let resolution = 'Please check table permissions and database schema.';

  if (code === '42703') {
    explanation = `A requested column in '${table}' does not exist in the database schema. (${rawMsg})`;
    resolution = `Verify database columns for '${table}' and ensure queries match production schema without assuming non-existent primary keys.`;
  } else if (code === '42P01' || code === 'PGRST205') {
    explanation = `Table '${table}' was not found in the database schema cache.`;
    resolution = `Ensure migrations are applied and the Supabase API schema cache is refreshed.`;
  } else if (code === '42501' || code === 'PGRST301') {
    explanation = `Insufficient permissions to access table '${table}' under current workspace policy.`;
    resolution = `Ensure user is signed in with an active workspace session.`;
  } else if (code === '23503') {
    explanation = `Foreign key reference constraint failed while processing '${table}'.`;
    resolution = `Ensure parent records are preserved or restored before child records.`;
  } else if (code === '23505') {
    explanation = `Unique key constraint violation on table '${table}'.`;
    resolution = `Ensure primary keys and conflict keys are properly specified.`;
  }

  return `Database error in table '${table}' during ${operation} (Code: ${code}): ${explanation} Suggestion: ${resolution}`;
}


