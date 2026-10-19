export const MANILA_TIME_ZONE = 'Asia/Manila';
type DateValue = number | string | Date | null | undefined;

// Offset-free form values represent Manila wall time, regardless of device settings.
function dateValue(value: DateValue): Date {
  if (value == null || value === '') return new Date(NaN);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/.test(value)) {
    return new Date(`${value.length === 10 ? `${value}T00:00:00` : value}+08:00`);
  }
  return new Date(value);
}

function display(value: DateValue, options: Intl.DateTimeFormatOptions): string {
  const date = dateValue(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: MANILA_TIME_ZONE, hour12: true }).format(date);
}

export const formatManilaTime = (value: DateValue, options: Intl.DateTimeFormatOptions = {}) =>
  display(value, { hour: 'numeric', minute: '2-digit', second: '2-digit', ...options });
export const formatManilaDate = (value: DateValue, options: Intl.DateTimeFormatOptions = {}) =>
  display(value, { year: 'numeric', month: 'numeric', day: 'numeric', ...options });
export const formatManilaDateTime = (value: DateValue, options: Intl.DateTimeFormatOptions = {}) =>
  display(value, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', ...options });

export function formatClockTime(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return '—';
  return formatManilaTime(`2000-01-01T${value}`, { second: undefined });
}

export const parseManilaDateTime = (value: string) => dateValue(value).getTime();

export function startOfManilaPeriod(period: 'month' | 'week', now = Date.now()): number {
  const local = new Date(now + 8 * 3600000);
  const day = period === 'month' ? 1 : local.getUTCDate() - (local.getUTCDay() + 6) % 7;
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), day) - 8 * 3600000;
}
