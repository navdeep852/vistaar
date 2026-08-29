/**
 * Centralized Indian Phone Number Validation, Normalization, and Formatting Utility for VISTAAR.
 * Standard Rule: India (+91) + exactly 10 numeric digits.
 */

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  normalized: string;
}

/**
 * Normalizes an input string to a clean digit string.
 * Strips non-digits, leading +91, leading 91 (if 12 digits), and leading 0 (if 11 digits).
 * Does NOT silently truncate 11+ digit numbers like "98765432101" to 10 digits, ensuring validation fails.
 */
export function normalizeIndianPhoneNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return '';

  // 1. Remove all non-numeric characters
  let digits = String(rawPhone).replace(/[^0-9]/g, '');

  // 2. Strip leading 91 if it makes the length 12 digits (e.g. 919876543210 -> 9876543210)
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  // 3. Strip leading 0 if it makes the length 11 digits (e.g. 09876543210 -> 9876543210)
  else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits;
}

/**
 * Convenience boolean helper function.
 * Returns true ONLY if the phone number satisfies the exactly 10-digit Indian mobile number rule.
 */
export function isValidIndianPhoneNumber(
  rawPhone: string | null | undefined,
  required: boolean = false
): boolean {
  return validateIndianPhoneNumber(rawPhone, required).isValid;
}

/**
 * Validates whether a phone number string satisfies the 10-digit Indian mobile number rule.
 */
export function validateIndianPhoneNumber(
  rawPhone: string | null | undefined,
  required: boolean = false
): PhoneValidationResult {
  const rawStr = rawPhone ? String(rawPhone).trim() : '';
  const normalized = normalizeIndianPhoneNumber(rawPhone);

  if (!rawStr) {
    if (required) {
      return {
        isValid: false,
        error: 'Phone number is required.',
        normalized: '',
      };
    }
    return {
      isValid: true,
      error: undefined,
      normalized: '',
    };
  }

  // If raw string was provided but normalized produced empty or invalid string (e.g. "abcdefghij"), it's invalid
  if (!normalized) {
    return {
      isValid: false,
      error: 'Please enter a valid 10-digit Indian mobile number.',
      normalized: '',
    };
  }

  if (normalized.length !== 10) {
    return {
      isValid: false,
      error: 'Phone number must contain exactly 10 digits.',
      normalized,
    };
  }

  // Check valid Indian mobile number prefix (6, 7, 8, 9)
  if (!/^[6-9][0-9]{9}$/.test(normalized)) {
    return {
      isValid: false,
      error: 'Please enter a valid 10-digit Indian mobile number (starting with 6-9).',
      normalized,
    };
  }

  return {
    isValid: true,
    error: undefined,
    normalized,
  };
}

/**
 * Formats a 10-digit Indian mobile number for display (e.g., "+91 9876543210").
 * Only prepends "+91 " if normalized value is a valid 10-digit number.
 * Idempotent: formatIndianPhoneNumber("+91 9876543210") === "+91 9876543210"
 */
export function formatIndianPhoneNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return '';
  const normalized = normalizeIndianPhoneNumber(rawPhone);
  if (!normalized) return '';
  if (normalized.length === 10 && /^[6-9][0-9]{9}$/.test(normalized)) {
    return `+91 ${normalized}`;
  }
  // For legacy invalid numbers already in DB (e.g., "98778"), return raw without adding misleading +91 prefix
  return String(rawPhone);
}

/**
 * Normalizes a phone number for WhatsApp API links or external phone protocols.
 * Formats as "91XXXXXXXXXX" (e.g., "919876543210").
 * Prevents duplicate country codes like "+91+919876543210" or "91919876543210".
 */
export function toWhatsAppNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return '';
  const normalized = normalizeIndianPhoneNumber(rawPhone);
  if (!normalized || normalized.length !== 10 || !/^[6-9][0-9]{9}$/.test(normalized)) return '';
  return `91${normalized}`;
}
