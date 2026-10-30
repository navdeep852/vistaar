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

