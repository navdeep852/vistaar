/**
 * Power BI Visual Theme & Token System for VISTAAR Analytics
 * Matches Microsoft Power BI styling: classic palette, typography, gridlines, and Indian number formats.
 */

export const PBI_PALETTE = [
  '#118DFF', // Primary Blue
  '#12239E', // Deep Navy
  '#E66C37', // Orange Amber
  '#6B007B', // Deep Purple
  '#E044A7', // Magenta Pink
  '#744EC2', // Royal Violet
  '#D9B300', // Gold Yellow
  '#D64550', // Crimson Red
] as const;

export const PBI_SEMANTIC = {
  positive: '#1AAB40', // Green
  negative: '#D64550', // Red
  warning: '#D9B300',  // Amber
  neutral: '#A6A6A6',  // Slate Gray
  info: '#118DFF',     // Accent Blue
} as const;

export const PBI_FONTS = {
  family: "'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  axisSize: 11,
  dataLabelSize: 11,
  headerSize: 13,
  titleSize: 15,
} as const;

export const PBI_GRIDLINES = {
  light: 'rgba(0, 0, 0, 0.06)',
  dark: 'rgba(255, 255, 255, 0.06)',
} as const;

/**
 * Formats values into compact Indian numeric notation:
 * ₹1.7L, ₹24K, ₹2.1Cr, etc.
 */
export function formatCompactInr(val: number): string {
  if (isNaN(val) || val === 0) return '₹0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';

  if (abs >= 10000000) {
    const cr = abs / 10000000;
    return `${sign}₹${cr >= 10 ? cr.toFixed(1) : cr.toFixed(2)}Cr`;
  }
  if (abs >= 100000) {
    const l = abs / 100000;
    return `${sign}₹${l >= 10 ? l.toFixed(1) : l.toFixed(2)}L`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}₹${k >= 10 ? Math.round(k) : k.toFixed(1)}K`;
  }
  return `${sign}₹${Math.round(abs)}`;
}

/**
 * Full Indian currency formatting for tooltips (e.g. ₹1,71,402)
 */
export function formatFullInr(val: number): string {
  if (isNaN(val)) return '₹0';
  const sign = val < 0 ? '-' : '';
  const abs = Math.round(Math.abs(val));
  const s = abs.toString();
  if (s.length <= 3) return `${sign}₹${s}`;

  const lastThree = s.substring(s.length - 3);
  const otherNumbers = s.substring(0, s.length - 3);
  const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  return `${sign}₹${formatted}`;
}

/**
 * Compact unit count format (e.g. 1.2K units, 450)
 */
export function formatCompactCount(val: number): string {
  if (isNaN(val) || val === 0) return '0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K`;
  return `${sign}${abs}`;
}
