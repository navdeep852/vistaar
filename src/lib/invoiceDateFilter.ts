import { getIstTodayString, addDays, formatFriendlyDate, normalizeToYyyyMmDd } from './dateRange';

export type InvoiceDateFilterPreset =
  | 'ALL'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface InvoiceDateRangeResult {
  preset: InvoiceDateFilterPreset;
  startDate: string; // YYYY-MM-DD or '' for ALL
  endDate: string;   // YYYY-MM-DD or '' for ALL
  displayLabel: string;
  badgeText: string;
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Formats a date range compactly e.g. "1 Oct–31 Oct 2026" or "10 Sep–17 Oct 2026"
 */
export function formatCompactRange(startDate: string, endDate: string): string {
  if (!startDate || !endDate) return '';
  const [y1, m1, d1] = startDate.split('-').map(Number);
  const [y2, m2, d2] = endDate.split('-').map(Number);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mStr1 = monthNames[m1 - 1];
  const mStr2 = monthNames[m2 - 1];

  if (y1 === y2 && m1 === m2) {
    return `${d1} ${mStr1}–${d2} ${mStr2} ${y1}`;
  } else if (y1 === y2) {
    return `${d1} ${mStr1}–${d2} ${mStr2} ${y1}`;
  } else {
    return `${d1} ${mStr1} ${y1}–${d2} ${mStr2} ${y2}`;
  }
}

/**
 * Authoritatively resolves any invoice date filter preset or custom range into
 * exact IST calendar-day boundaries and display labels.
 */
export function resolveInvoiceDateFilter(
  preset: InvoiceDateFilterPreset,
  customStart?: string,
  customEnd?: string
): InvoiceDateRangeResult {
  const today = getIstTodayString();

  switch (preset) {
    case 'ALL':
      return {
        preset: 'ALL',
        startDate: '',
        endDate: '',
        displayLabel: 'All Dates',
        badgeText: 'All Dates',
        isValid: true,
      };

    case 'today':
      return {
        preset: 'today',
        startDate: today,
        endDate: today,
        displayLabel: `Today — ${formatFriendlyDate(today)}`,
        badgeText: `Today — ${formatFriendlyDate(today)}`,
        isValid: true,
      };

    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return {
        preset: 'yesterday',
        startDate: yesterday,
        endDate: yesterday,
        displayLabel: `Yesterday — ${formatFriendlyDate(yesterday)}`,
        badgeText: `Yesterday — ${formatFriendlyDate(yesterday)}`,
        isValid: true,
      };
    }

    case 'this_week': {
      // Calendar week: Monday to Sunday in IST
      const [y, m, d] = today.split('-').map(Number);
      const dObj = new Date(y, m - 1, d);
      const dayOfWeek = dObj.getDay(); // 0 is Sun, 1 is Mon...
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mondayStr = addDays(today, diffToMonday);
      const sundayStr = addDays(mondayStr, 6);
      return {
        preset: 'this_week',
        startDate: mondayStr,
        endDate: sundayStr,
        displayLabel: `This Week — ${formatCompactRange(mondayStr, sundayStr)}`,
        badgeText: `This Week — ${formatCompactRange(mondayStr, sundayStr)}`,
        isValid: true,
      };
    }

    case 'this_month': {
      // Calendar month: 1st of month to last day of month
      const [y, m] = today.split('-').map(Number);
      const startOfMonth = `${today.substring(0, 7)}-01`;
      const lastDayOfMonth = new Date(y, m, 0).getDate();
      const endOfMonth = `${today.substring(0, 7)}-${String(lastDayOfMonth).padStart(2, '0')}`;
      return {
        preset: 'this_month',
        startDate: startOfMonth,
        endDate: endOfMonth,
        displayLabel: `This Month — ${formatCompactRange(startOfMonth, endOfMonth)}`,
        badgeText: `This Month — ${formatCompactRange(startOfMonth, endOfMonth)}`,
        isValid: true,
      };
    }

    case 'last_month': {
      // Previous calendar month (handles year boundary correctly, e.g. Jan -> Dec)
      const [y, m] = today.split('-').map(Number);
      const prevDate = new Date(y, m - 2, 1);
      const prevYear = prevDate.getFullYear();
      const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
      const lastDayOfPrevMonth = new Date(y, m - 1, 0).getDate();
      const startOfPrevMonth = `${prevYear}-${prevMonth}-01`;
      const endOfPrevMonth = `${prevYear}-${prevMonth}-${String(lastDayOfPrevMonth).padStart(2, '0')}`;
      return {
        preset: 'last_month',
        startDate: startOfPrevMonth,
        endDate: endOfPrevMonth,
        displayLabel: `Last Month — ${formatCompactRange(startOfPrevMonth, endOfPrevMonth)}`,
        badgeText: `Last Month — ${formatCompactRange(startOfPrevMonth, endOfPrevMonth)}`,
        isValid: true,
      };
    }

    case 'custom': {
      const s = customStart ? normalizeToYyyyMmDd(customStart) : today;
      const e = customEnd ? normalizeToYyyyMmDd(customEnd) : today;

      if (s > e) {
        return {
          preset: 'custom',
          startDate: s,
          endDate: e,
          displayLabel: 'Invalid Date Range',
          badgeText: 'Invalid Date Range',
          isValid: false,
          errorMessage: 'Start date cannot be later than end date.',
        };
      }

      return {
        preset: 'custom',
        startDate: s,
        endDate: e,
        displayLabel: `Custom — ${formatCompactRange(s, e)}`,
        badgeText: `Custom — ${formatCompactRange(s, e)}`,
        isValid: true,
      };
    }

    default:
      return {
        preset: 'ALL',
        startDate: '',
        endDate: '',
        displayLabel: 'All Dates',
        badgeText: 'All Dates',
        isValid: true,
      };
  }
}
