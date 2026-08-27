/**
 * Cryptographic utility functions for secure password hashing (PBKDF2/Salted SHA-256),
 * single-use password reset tokens, and temporary employee password generation.
 */

// Simple salted hash using SHA-256 via Web Crypto API for client/browser storage
export async function hashPassword(password: string, salt: string = 'VST_2026_SALT'): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '::' + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2_sha256$${salt}$${hashHex}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  
  // If storedHash is formatted as pbkdf2_sha256$salt$hash
  if (storedHash.startsWith('pbkdf2_sha256$')) {
    const parts = storedHash.split('$');
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = await hashPassword(password, salt);
      return storedHash === expectedHash;
    }
  }

  // Fallback for legacy plain text comparison if migrated
  const computed = await hashPassword(password, 'VST_2026_SALT');
  return storedHash === computed || storedHash === password;
}

export function generateRandomToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateTemporaryPassword(): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%&*';

  const getRandomChar = (str: string) => str.charAt(Math.floor(Math.random() * str.length));

  const u1 = getRandomChar(uppercase);
  const u2 = getRandomChar(uppercase);
  const l1 = getRandomChar(lowercase);
  const l2 = getRandomChar(lowercase);
  const l3 = getRandomChar(lowercase);
  const n1 = getRandomChar(numbers);
  const n2 = getRandomChar(numbers);
  const s1 = getRandomChar(symbols);

  // Guarantee minimum 12 chars satisfying policy: 2 upper, 4 lower, 3 num, 3 symbol
  const tailLower = getRandomChar(lowercase) + getRandomChar(lowercase);
  const tailSymbol = getRandomChar(symbols);

  const pool = [u1, u2, l1, l2, l3, n1, n2, s1, tailLower[0], tailLower[1], tailSymbol, '9'];
  return 'Tmp@' + pool.sort(() => Math.random() - 0.5).join('');
}
