import { normalizeToYyyyMmDd, formatFriendlyDate } from './dateRange';

export type QuotationDatePreset = 'ALL' | 'today' | 'yesterday' | 'custom';

export interface QuotationDateFilterResult {
  preset: QuotationDatePreset;
  targetDate: string; // YYYY-MM-DD or '' for ALL
  displayLabel: string;
  badgeText: string;
}

/**
 * Returns current calendar day in user's local timezone formatted as YYYY-MM-DD.
 */
export function getLocalTodayDateString(referenceDate = new Date()): string {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const d = String(referenceDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns yesterday's calendar day in user's local timezone formatted as YYYY-MM-DD.
 */
export function getLocalYesterdayDateString(referenceDate = new Date()): string {
  const prev = new Date(referenceDate.getTime());
  prev.setDate(prev.getDate() - 1);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, '0');
  const d = String(prev.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extracts and normalizes the creation calendar date (YYYY-MM-DD) from a quotation object.
 * Priority:
 * 1. q.date (explicit business creation date)
 * 2. q.createdAt / q.created_at (fallback audit timestamp)
 * 
 * Strict rule: NEVER uses validUntil or valid_until.
 */
export function getQuotationCreationDate(q: {
  date?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  validUntil?: string | null;
  valid_until?: string | null;
}): string {
  if (!q) return '';

  // 1. Check explicit business date
  if (q.date && typeof q.date === 'string' && q.date.trim()) {
    const raw = q.date.trim();

    // Pattern A: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw;
    }

    // Pattern B: DD-MM-YYYY or DD/MM/YYYY
    const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    // Pattern C: YYYY/MM/DD
    const ymd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(raw);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
    }

    // Pattern D: ISO or date with time - evaluate in local timezone
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // 2. Fallback to createdAt or created_at (record insertion timestamp)
  const ts = q.createdAt || (q as any).created_at;
  if (ts && typeof ts === 'string' && ts.trim()) {
    const rawTs = ts.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawTs)) {
      return rawTs;
    }
    const parsed = new Date(rawTs);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return '';
}

/**
 * Resolves the target date and display badge text for a quotation date filter.
 */
export function resolveQuotationDateFilter(
  preset: QuotationDatePreset,
  selectedDate?: string,
  referenceDate = new Date()
): QuotationDateFilterResult {
  const today = getLocalTodayDateString(referenceDate);
  const yesterday = getLocalYesterdayDateString(referenceDate);

  switch (preset) {
    case 'ALL':
      return {
        preset: 'ALL',
        targetDate: '',
        displayLabel: 'All Dates',
        badgeText: 'All Dates',
      };
    case 'today':
      return {
        preset: 'today',
        targetDate: today,
        displayLabel: `Today — ${formatFriendlyDate(today)}`,
        badgeText: `Date: Today (${formatFriendlyDate(today)})`,
      };
    case 'yesterday':
      return {
        preset: 'yesterday',
        targetDate: yesterday,
        displayLabel: `Yesterday — ${formatFriendlyDate(yesterday)}`,
        badgeText: `Date: Yesterday (${formatFriendlyDate(yesterday)})`,
      };
    case 'custom': {
      const normalizedTarget = selectedDate ? normalizeToYyyyMmDd(selectedDate) : today;
      return {
        preset: 'custom',
        targetDate: normalizedTarget,
        displayLabel: `Date: ${formatFriendlyDate(normalizedTarget)}`,
        badgeText: `Date: ${formatFriendlyDate(normalizedTarget)}`,
      };
    }
  }
}

/**
 * Determines whether a quotation satisfies the active date filter.
 */
export function matchesQuotationDateFilter(
  q: {
    date?: string | null;
    createdAt?: string | null;
    created_at?: string | null;
    validUntil?: string | null;
    valid_until?: string | null;
  },
  preset: QuotationDatePreset,
  selectedDate?: string,
  referenceDate = new Date()
): boolean {
  if (preset === 'ALL') return true;
  const resolved = resolveQuotationDateFilter(preset, selectedDate, referenceDate);
  if (!resolved.targetDate) return true;
  const qDate = getQuotationCreationDate(q);
  return qDate === resolved.targetDate;
}

