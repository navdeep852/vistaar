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
 * Normalizes an input string to a clean 10-digit Indian mobile number string.
 * Strips all non-digit characters, leading +91, leading 91, and leading 0 if 11/12 digits.
 * Idempotent: normalizeIndianPhoneNumber("9876543210") === "9876543210"
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

  // 4. Cap max length at 10 digits
  return digits.slice(0, 10);
}

/**
 * Validates whether a phone number string satisfies the 10-digit Indian mobile number rule.
 */
export function validateIndianPhoneNumber(
  rawPhone: string | null | undefined,
  required: boolean = true
): PhoneValidationResult {
  const normalized = normalizeIndianPhoneNumber(rawPhone);

  if (!normalized) {
    if (required) {
      return {
        isValid: false,
        error: 'Phone number is required.',
        normalized: '',
      };
    }
    return {
      isValid: true,
      normalized: '',
    };
  }

  if (normalized.length < 10) {
    return {
      isValid: false,
      error: 'Phone number must contain exactly 10 digits.',
      normalized,
    };
  }

  if (normalized.length > 10) {
    return {
      isValid: false,
      error: 'Phone number must contain exactly 10 digits.',
      normalized: normalized.slice(0, 10),
    };
  }

  // Check valid Indian mobile number prefix (6, 7, 8, 9)
  if (!/^[6-9][0-9]{9}$/.test(normalized)) {
    return {
      isValid: false,
      error: 'Please enter a valid 10-digit Indian mobile number.',
      normalized,
    };
  }

  return {
    isValid: true,
    normalized,
  };
}

/**
 * Formats a 10-digit Indian mobile number for display (e.g., "+91 9876543210").
 * Idempotent: formatIndianPhoneNumber("+91 9876543210") === "+91 9876543210"
 */
export function formatIndianPhoneNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return '';
  const normalized = normalizeIndianPhoneNumber(rawPhone);
  if (!normalized) return '';
  return `+91 ${normalized}`;
}

/**
 * Normalizes a phone number for WhatsApp API links or external phone protocols.
 * Formats as "91XXXXXXXXXX" (e.g., "919876543210").
 * Prevents duplicate country codes like "+91+919876543210" or "91919876543210".
 */
export function toWhatsAppNumber(rawPhone: string | null | undefined): string {
  if (!rawPhone) return '';
  const normalized = normalizeIndianPhoneNumber(rawPhone);
  if (!normalized) return '';
  return `91${normalized}`;
}
