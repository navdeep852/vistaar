export interface PasswordStrength {
  length: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  isValid: boolean;
  score: number;
}

export function validatePassword(password: string): PasswordStrength {
  const safePass = password || '';
  const length = safePass.length >= 12;
  const hasUppercase = /[A-Z]/.test(safePass);
  const hasLowercase = /[a-z]/.test(safePass);
  const hasNumber = /[0-9]/.test(safePass);
  const hasSymbol = /[^A-Za-z0-9]/.test(safePass);

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
  };
}

export function validateEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email.trim());
}
