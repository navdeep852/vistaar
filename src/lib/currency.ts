/**
 * Authoritative Indian Currency & Number Formatting Utility
 * Strictly enforces Indian numbering system (lakhs & crores) and ₹ symbol.
 * Guarantees that null, undefined, and NaN never leak to the UI.
 */

export interface CurrencyFormatOptions {
  showZero?: boolean;
  decimals?: number;
  showSymbol?: boolean;
}

/**
 * Formats any numeric value into authoritative Indian Rupee string (e.g. ₹15,750, ₹1,25,000).
 * If value is invalid, NaN, null, or undefined, strictly outputs "₹0".
 */
export function formatInr(value: number | string | null | undefined, options?: CurrencyFormatOptions): string {
  const showSymbol = options?.showSymbol !== false;
  const prefix = showSymbol ? '₹' : '';

  if (value === null || value === undefined || value === '') {
    return `${prefix}0`;
  }

  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return `${prefix}0`;
  }

  const decimals = options?.decimals !== undefined
    ? options.decimals
    : (num % 1 !== 0 ? 2 : 0);

  try {
    const formatted = num.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${prefix}${formatted}`;
  } catch {
    // Fallback if locale is unsupported
    return `${prefix}${num.toFixed(decimals)}`;
  }
}

/**
 * Formats a count or quantity integer safely (e.g. 0, 1, 24).
 * Returns '0' on null, undefined, or NaN.
 */
export function formatSafeCount(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '0';
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !isFinite(num)) {
    return '0';
  }
  return Math.round(num).toLocaleString('en-IN');
}
