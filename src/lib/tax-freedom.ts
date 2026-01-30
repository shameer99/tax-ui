const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAYS_IN_MONTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function dayOfYearToDate(dayOfYear: number): string {
  let remaining = Math.min(Math.max(dayOfYear, 1), 365);
  let monthIndex = 0;

  while (monthIndex < 11) {
    const daysInMonth = DAYS_IN_MONTHS[monthIndex] ?? 30;
    if (remaining <= daysInMonth) break;
    remaining -= daysInMonth;
    monthIndex++;
  }

  return `${MONTH_NAMES[monthIndex] ?? "Jan"} ${remaining}`;
}

export interface TaxFreedomDayResult {
  dayOfYear: number;
  date: string;
}

export function getTaxFreedomDay(effectiveRate: number): TaxFreedomDayResult {
  const dayOfYear = Math.round(effectiveRate * 365);
  return {
    dayOfYear,
    date: dayOfYearToDate(dayOfYear),
  };
}

export function getTodayDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}
