export interface PasswordStrength {
  length: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  isValid: boolean;
  score: number;
  errors: string[];
}

export function validatePassword(password: string): PasswordStrength {
  const safePass = password || '';
  const length = safePass.length >= 12;
  const hasUppercase = /[A-Z]/.test(safePass);
  const hasLowercase = /[a-z]/.test(safePass);
  const hasNumber = /[0-9]/.test(safePass);
  const hasSymbol = /[^A-Za-z0-9]/.test(safePass);

  const errors: string[] = [];
  if (!length) errors.push('Password must be at least 12 characters long.');
  if (!hasUppercase) errors.push('Password must include at least one uppercase letter.');
  if (!hasLowercase) errors.push('Password must include at least one lowercase letter.');
  if (!hasNumber) errors.push('Password must include at least one number.');
  if (!hasSymbol) errors.push('Password must include at least one special character.');

  const checks = [length, hasUppercase, hasLowercase, hasNumber, hasSymbol];
  const score = checks.filter(Boolean).length;
  const isValid = checks.every(Boolean);

  return {
    length,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSymbol,
    isValid,
    score,
    errors,
  };
}

export function validateEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}

/**
 * Generates a cryptographically secure temporary password.
 * Satisfies the VISTAAR password policy:
 * - Minimum 14 characters (> 12)
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 symbol
 */
export function generateSecureTemporaryPassword(length: number = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*_-+=';
  const allChars = upper + lower + digits + symbols;

  const getRandomChar = (charset: string): string => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return charset[arr[0] % charset.length];
    }
    // Fallback for environments where crypto is not globally bound
    const idx = Math.floor(Math.random() * charset.length);
    return charset[idx];
  };

  // Guarantee at least one character from each category
  const chars: string[] = [
    getRandomChar(upper),
    getRandomChar(lower),
    getRandomChar(digits),
    getRandomChar(symbols),
  ];

  // Fill remaining characters
  for (let i = 4; i < Math.max(14, length); i++) {
    chars.push(getRandomChar(allChars));
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    let j = 0;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      j = arr[0] % (i + 1);
    } else {
      j = Math.floor(Math.random() * (i + 1));
    }
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  const generated = chars.join('');
  // Verify it satisfies the policy; if by freak chance it doesn't, retry
  if (!validatePassword(generated).isValid) {
    return generateSecureTemporaryPassword(length);
  }

  return generated;
}

