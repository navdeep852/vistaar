/**
 * Centralized Date Resolution Layer for Vistaar
 * Authoritative Indian Standard Time (IST, UTC+05:30) date handling.
 * Guarantees inclusive upper bounds (23:59:59.999) and exact bounds for both
 * DATE columns (YYYY-MM-DD) and TIMESTAMPTZ columns (ISO).
 */

export type DatePresetType =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'week'
  | 'this_month'
  | 'month'
  | 'last_month'
  | 'this_quarter'
  | 'quarter'
  | 'this_year'
  | 'year'
  | 'custom';

export type ComparisonType =
  | 'previous_period'
  | 'previous_month'
  | 'previous_year'
  | 'custom'
  | 'none';

export interface ResolvedDateRange {
  rangeType: DatePresetType;
  startDateStr: string;     // YYYY-MM-DD in IST
  endDateStr: string;       // YYYY-MM-DD in IST (inclusive)
  startIso: string;         // ISO string starting at 00:00:00.000 IST
  endIso: string;           // ISO string ending at 23:59:59.999 IST
  nextDayIso: string;       // Exclusive upper bound (start of next day in IST)
  formattedLabel: string;   // e.g. "01/09/2026 – 08/09/2026" or "Today (08 Sep 2026)"
  periodBadge: string;      // Human-readable compact label e.g. "01/09/2026 – 08/09/2026"
  isHistorical: boolean;    // True if endDateStr is strictly before current Indian business day
}

const IST_OFFSET_HOURS = 5.5; // UTC+5:30

/**
 * Returns current date string in Indian Standard Time (YYYY-MM-DD)
 */
export function getIstTodayString(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    // Fallback if Intl timeZone is unsupported
    const now = new Date();
    const istMs = now.getTime() + (IST_OFFSET_HOURS * 3600000);
    return new Date(istMs).toISOString().split('T')[0];
  }
}

/**
 * Formats YYYY-MM-DD into Indian display format (DD/MM/YYYY)
 */
export function formatIndianDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Formats YYYY-MM-DD into compact friendly date (e.g. "08 Sep 2026")
 */
export function formatFriendlyDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return formatIndianDate(dateStr);
  }
}

/**
 * Formats reporting period context for the toolbar header.
 * e.g. "Today · 09 Sep 2026", "Yesterday · 08 Sep 2026", or "01 Sep 2026 – 09 Sep 2026"
 */
export function formatReportingPeriodSubtitle(dateRange: ResolvedDateRange): string {
  const startFriendly = formatFriendlyDate(dateRange.startDateStr);
  const endFriendly = formatFriendlyDate(dateRange.endDateStr);

  if (dateRange.rangeType === 'today') {
    return `Today · ${startFriendly}`;
  }
  if (dateRange.rangeType === 'yesterday') {
    return `Yesterday · ${startFriendly}`;
  }
  if (dateRange.startDateStr === dateRange.endDateStr) {
    return startFriendly;
  }
  return `${startFriendly} – ${endFriendly}`;
}

/**
 * Constructs an ISO string for an IST date at given time.
 */
function toIstIso(dateStr: string, timeStr: '00:00:00.000' | '23:59:59.999'): string {
  return `${dateStr}T${timeStr}+05:30`;
}

/**
 * Computes date string offset by N days from a base YYYY-MM-DD string
 */
export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Centralized Date Range Resolver
 * Authoritatively resolves any preset or custom date bounds.
 */
export function resolveDateRange(
  preset: DatePresetType,
  customStart?: string,
  customEnd?: string
): ResolvedDateRange {
  const today = getIstTodayString();

  let startDateStr = today;
  let endDateStr = today;

  switch (preset) {
    case 'today': {
      startDateStr = today;
      endDateStr = today;
      break;
    }

    case 'yesterday': {
      const yStr = addDays(today, -1);
      startDateStr = yStr;
      endDateStr = yStr;
      break;
    }

    case 'this_week':
    case 'week': {
      // Find Monday of the current week
      const [year, month, day] = today.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      startDateStr = addDays(today, diffToMonday);
      endDateStr = today; // Current week through today
      break;
    }

    case 'this_month':
    case 'month': {
      const parts = today.split('-');
      startDateStr = `${parts[0]}-${parts[1]}-01`;
      endDateStr = today;
      break;
    }

    case 'last_month': {
      const [year, month] = today.split('-').map(Number);
      // Previous month
      const prevDate = new Date(year, month - 2, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
      // Last day of previous month
      const lastDayDate = new Date(year, month - 1, 0);
      const lastDay = String(lastDayDate.getDate()).padStart(2, '0');

      startDateStr = `${prevYear}-${prevMonth}-01`;
      endDateStr = `${prevYear}-${prevMonth}-${lastDay}`;
      break;
    }

    case 'this_quarter':
    case 'quarter': {
      const [year, month] = today.split('-').map(Number);
      const qIndex = Math.floor((month - 1) / 3);
      const qStartMonth = String(qIndex * 3 + 1).padStart(2, '0');
      startDateStr = `${year}-${qStartMonth}-01`;
      endDateStr = today;
      break;
    }

    case 'this_year':
    case 'year': {
      const year = today.split('-')[0];
      startDateStr = `${year}-01-01`;
      endDateStr = today;
      break;
    }

    case 'custom': {
      startDateStr = customStart || today;
      endDateStr = customEnd || today;
      // Ensure chronological ordering
      if (startDateStr > endDateStr) {
        const tmp = startDateStr;
        startDateStr = endDateStr;
        endDateStr = tmp;
      }
      break;
    }

    default: {
      startDateStr = today;
      endDateStr = today;
      break;
    }
  }

  const nextDayStr = addDays(endDateStr, 1);
  const startIso = toIstIso(startDateStr, '00:00:00.000');
  const endIso = toIstIso(endDateStr, '23:59:59.999');
  const nextDayIso = toIstIso(nextDayStr, '00:00:00.000');

  // Format display labels
  const formattedStart = formatIndianDate(startDateStr);
  const formattedEnd = formatIndianDate(endDateStr);
  const periodBadge = `${formattedStart} – ${formattedEnd}`;

  let formattedLabel = periodBadge;
  if (preset === 'today') {
    formattedLabel = `Today (${formatFriendlyDate(today)})`;
  } else if (preset === 'yesterday') {
    formattedLabel = `Yesterday (${formatFriendlyDate(startDateStr)})`;
  } else if (preset === 'this_week' || preset === 'week') {
    formattedLabel = `This Week (${periodBadge})`;
  } else if (preset === 'this_month' || preset === 'month') {
    formattedLabel = `This Month (${periodBadge})`;
  } else if (preset === 'last_month') {
    formattedLabel = `Last Month (${periodBadge})`;
  } else if (preset === 'this_quarter' || preset === 'quarter') {
    formattedLabel = `This Quarter (${periodBadge})`;
  } else if (preset === 'this_year' || preset === 'year') {
    formattedLabel = `This Year (${periodBadge})`;
  } else if (preset === 'custom') {
    formattedLabel = `Custom Range (${periodBadge})`;
  }

  const isHistorical = endDateStr < today;

  return {
    rangeType: preset,
    startDateStr,
    endDateStr,
    startIso,
    endIso,
    nextDayIso,
    formattedLabel,
    periodBadge,
    isHistorical,
  };
}

/**
 * Resolves an authoritative comparison date range matching the selected baseline
 */
export function resolveComparisonRange(
  currentRange: ResolvedDateRange,
  comparisonType: ComparisonType,
  customCompStart?: string,
  customCompEnd?: string
): ResolvedDateRange | null {
  if (comparisonType === 'none') return null;

  if (comparisonType === 'custom') {
    if (!customCompStart || !customCompEnd) return null;
    return resolveDateRange('custom', customCompStart, customCompEnd);
  }

  const [curStartY, curStartM, curStartD] = currentRange.startDateStr.split('-').map(Number);
  const [curEndY, curEndM, curEndD] = currentRange.endDateStr.split('-').map(Number);

  if (comparisonType === 'previous_month') {
    // Shift back by 1 calendar month safely
    const startObj = new Date(curStartY, curStartM - 2, curStartD);
    const endObj = new Date(curEndY, curEndM - 2, curEndD);
    const sStr = startObj.toISOString().split('T')[0];
    const eStr = endObj.toISOString().split('T')[0];
    return resolveDateRange('custom', sStr, eStr);
  }

  if (comparisonType === 'previous_year') {
    // Shift back by 1 year
    const sStr = `${curStartY - 1}-${String(curStartM).padStart(2, '0')}-${String(curStartD).padStart(2, '0')}`;
    const eStr = `${curEndY - 1}-${String(curEndM).padStart(2, '0')}-${String(curEndD).padStart(2, '0')}`;
    return resolveDateRange('custom', sStr, eStr);
  }

  if (comparisonType === 'previous_period') {
    // Exactly same duration in days immediately preceding the current range
    const startMs = new Date(currentRange.startDateStr).getTime();
    const endMs = new Date(currentRange.endDateStr).getTime();
    const diffDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);

    const compEndStr = addDays(currentRange.startDateStr, -1);
    const compStartStr = addDays(compEndStr, -(diffDays - 1));
    return resolveDateRange('custom', compStartStr, compEndStr);
  }

  return null;
}
