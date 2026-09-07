/**
 * Canonical Tax Rate Constants for VISTAAR
 * Strict Indian GST rate slabs: 0%, 5%, 12%, 18%, 40%
 */

export const ALLOWED_TAX_RATES = [0, 5, 12, 18, 40] as const;
export type AllowedTaxRate = (typeof ALLOWED_TAX_RATES)[number];

export function isValidTaxRate(rate: number): boolean {
  return (ALLOWED_TAX_RATES as readonly number[]).includes(rate);
}

export function normalizeToNearestAllowedTaxRate(rate: number): AllowedTaxRate {
  if (isValidTaxRate(rate)) {
    return rate as AllowedTaxRate;
  }
  let closest: AllowedTaxRate = ALLOWED_TAX_RATES[0];
  let minDiff = Math.abs(rate - closest);
  for (let i = 1; i < ALLOWED_TAX_RATES.length; i++) {
    const diff = Math.abs(rate - ALLOWED_TAX_RATES[i]);
    if (diff < minDiff) {
      minDiff = diff;
      closest = ALLOWED_TAX_RATES[i];
    }
  }
  return closest;
}
