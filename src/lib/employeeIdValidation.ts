/**
 * VISTAAR Business OS — Employee ID Validation and Normalization
 *
 * Rules:
 * - Allowed characters: A-Z, a-z, 0-9, -, _
 * - Minimum length: 3 characters
 * - Maximum length: 30 characters
 * - Reject: leading/trailing whitespace, empty, only separators (- or _)
 * - Normalization: trim whitespace, convert to uppercase
 *
 * Examples of valid IDs:
 * - EMP-001
 * - SALES-001
 * - STORE_01
 * - TECH001
 * - VST-EMP-001
 *
 * Examples of invalid IDs:
 * - EMP 001 (contains space)
 * - EMP@001 (contains special character @)
 * - EMP/001 (contains slash)
 * - EMP.001 (contains dot)
 * - EMP#001 (contains hash)
 * - A (too short, < 3 chars)
 * - --- (separators only)
 */

export interface EmployeeIdValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
}

export function validateEmployeeId(id: string | null | undefined): EmployeeIdValidationResult {
  if (id === null || id === undefined) {
    return { isValid: false, normalized: '', error: 'Employee ID is required.' };
  }

  const raw = String(id);

  // Reject leading or trailing whitespace
  if (raw.startsWith(' ') || raw.endsWith(' ') || raw.startsWith('\t') || raw.endsWith('\t')) {
    return {
      isValid: false,
      normalized: '',
      error: 'Employee ID cannot have leading or trailing whitespace.',
    };
  }

  const trimmed = raw.trim();

  // Reject empty ID
  if (trimmed.length === 0) {
    return { isValid: false, normalized: '', error: 'Employee ID is required.' };
  }

  // Minimum length check
  if (trimmed.length < 3) {
    return {
      isValid: false,
      normalized: '',
      error: 'Employee ID must be at least 3 characters.',
    };
  }

  // Maximum length check
  if (trimmed.length > 30) {
    return {
      isValid: false,
      normalized: '',
      error: 'Employee ID cannot exceed 30 characters.',
    };
  }

  // Allowed character set: A-Z, a-z, 0-9, -, _
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return {
      isValid: false,
      normalized: '',
      error: 'Only letters, numbers, hyphens (-), and underscores (_) are allowed.',
    };
  }

  // Reject IDs consisting only of separators (- and _)
  if (/^[-_]+$/.test(trimmed)) {
    return {
      isValid: false,
      normalized: '',
      error: 'Employee ID cannot consist only of separators (hyphens or underscores).',
    };
  }

  return {
    isValid: true,
    normalized: trimmed.toUpperCase(),
  };
}

export function normalizeEmployeeId(id: string | null | undefined): string {
  if (!id) return '';
  return String(id).trim().toUpperCase();
}
