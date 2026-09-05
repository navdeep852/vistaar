/**
 * VISTAAR — Centralized Supabase Database Error & Connectivity Diagnostic Utility
 */

export type SupabaseErrorCategory =
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'RLS_ERROR'
  | 'DATABASE_SCHEMA_ERROR'
  | 'CONSTRAINT_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNKNOWN_ERROR';

export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export interface CategorizedError {
  category: SupabaseErrorCategory;
  userMessage: string;
  technicalDetails: {
    message: string;
    code: string;
    details?: string;
    hint?: string;
    status?: number;
  };
}

export function categorizeSupabaseError(error: any): CategorizedError {
  if (!error) {
    return {
      category: 'UNKNOWN_ERROR',
      userMessage: 'An unexpected database error occurred.',
      technicalDetails: { message: 'No error object provided', code: '' },
    };
  }

  const msg = typeof error === 'string' ? error : error.message || error.details || error.error_description || String(error);
  const code = String(error?.code || '');
  const status = Number(error?.status || error?.statusCode || 0);
  const hint = error?.hint || '';
  const details = error?.details || '';

  const tech = { message: msg, code, details, hint, status };

  // 1. Session Expired (PGRST301 / 401 / JWT Expired)
  if (
    status === 401 ||
    code === 'PGRST301' ||
    msg.includes('JWT expired') ||
    msg.includes('invalid claim') ||
    msg.includes('token is expired')
  ) {
    return {
      category: 'AUTH_ERROR',
      userMessage: 'Session Expired: Your authentication session has expired. Please log in again.',
      technicalDetails: tech,
    };
  }

  // 2. Permission / RLS / Authorization Error (42501 / 403)
  if (
    code === '42501' ||
    status === 403 ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('RLS')
  ) {
    return {
      category: 'RLS_ERROR',
      userMessage: 'Permission Denied: Your account does not have authorization to add products to this workspace.',
      technicalDetails: tech,
    };
  }

  // 3. Authentication Error
  if (
    msg.includes('Invalid login credentials') ||
    msg.includes('invalid_credentials') ||
    msg.includes('invalid_grant') ||
    msg.includes('Email not confirmed') ||
    msg.includes('user_not_found')
  ) {
    return {
      category: 'AUTH_ERROR',
      userMessage: 'Authentication Failure: Invalid credentials or unconfirmed account.',
      technicalDetails: tech,
    };
  }

  // 4. PostgreSQL Unique Constraint Violation (23505) - Duplicate Part Number / Code
  if (code === '23505' || msg.includes('duplicate key')) {
    return {
      category: 'CONSTRAINT_ERROR',
      userMessage: 'Duplicate Product: A product with this Part Number, Product Code, or SKU already exists.',
      technicalDetails: tech,
    };
  }

  // 5. PostgreSQL Foreign Key Violation (23503)
  if (code === '23503' || msg.includes('foreign key constraint')) {
    return {
      category: 'CONSTRAINT_ERROR',
      userMessage: 'Invalid Reference: The related Category or Supplier was not found.',
      technicalDetails: tech,
    };
  }

  // 6. Validation / Check / Not-Null Constraint Violation (23514 / 23502)
  if (code === '23514' || code === '23502' || msg.includes('check constraint') || msg.includes('not-null constraint') || msg.includes('invalid input syntax')) {
    return {
      category: 'VALIDATION_ERROR',
      userMessage: 'Validation Error: Product details violate database required constraints.',
      technicalDetails: tech,
    };
  }

  // 6. Record Not Found (PGRST116 / 404)
  if (code === 'PGRST116' || status === 404 || msg.includes('0 rows') || msg.includes('JSON object requested, multiple (or no) rows returned')) {
    return {
      category: 'NOT_FOUND',
      userMessage: 'Record Not Found: The requested database row does not exist.',
      technicalDetails: tech,
    };
  }

  // 7. Database Schema / PostgREST Table or Column Missing Error
  if (
    code.startsWith('PGRST') ||
    code === '42P01' ||
    code === '42703' ||
    msg.includes('relation') ||
    msg.includes('column') ||
    msg.includes('does not exist')
  ) {
    return {
      category: 'DATABASE_SCHEMA_ERROR',
      userMessage: `Database Schema Error: Query failed on database table/column structure (${code || 'PGRST'}).`,
      technicalDetails: tech,
    };
  }

  // 8. Network / DNS / Host Unreachable Failure
  if (
    msg.includes('ENOTFOUND') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('getaddrinfo') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('fetch failed') ||
    msg.includes('Failed to connect')
  ) {
    return {
      category: 'NETWORK_ERROR',
      userMessage: 'Network Error: Unable to connect to Supabase database. Please check your internet connection or VITE_SUPABASE_URL configuration.',
      technicalDetails: tech,
    };
  }

  // Fallback / Unknown
  return {
    category: 'UNKNOWN_ERROR',
    userMessage: msg || 'An unknown database error occurred.',
    technicalDetails: tech,
  };
}

export function normalizeDatabaseError(error: any): string {
  const categorized = categorizeSupabaseError(error);
  return categorized.userMessage;
}

export function handleSupabaseError(error: any, operation: string): string {
  const categorized = categorizeSupabaseError(error);

  console.error(`[Supabase DB Diagnostic] Operation '${operation}' failed [Category: ${categorized.category}]:`, {
    operation,
    category: categorized.category,
    userMessage: categorized.userMessage,
    technicalDetails: categorized.technicalDetails,
    rawError: error,
  });

  return categorized.userMessage;
}
