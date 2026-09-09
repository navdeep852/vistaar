/**
 * Centralized Date Resolution Layer for Vistaar
 * Authoritative Indian Standard Time (IST, UTC+05:30) date handling.
 * Guarantees inclusive upper bounds (23:59:59.999) and exact bounds for both
 * DATE columns (YYYY-MM-DD) and TIMESTAMPTZ columns (ISO).
 */

export type DatePresetType = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'custom';

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
  } else if (preset === 'week') {
    formattedLabel = `This Week (${periodBadge})`;
  } else if (preset === 'month') {
    formattedLabel = `This Month (${periodBadge})`;
  } else if (preset === 'last_month') {
    formattedLabel = `Last Month (${periodBadge})`;
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
