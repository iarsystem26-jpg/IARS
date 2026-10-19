import { describe, expect, it } from 'vitest';
import { formatClockTime, formatManilaDate, formatManilaDateTime, formatManilaTime, parseManilaDateTime, startOfManilaPeriod } from './dateTime';

describe('Manila time displays', () => {
  it('shows midnight, noon, and seconds with AM/PM', () => {
    expect(formatManilaTime('2026-10-02T16:08:02Z')).toBe('12:08:02 AM');
    expect(formatManilaTime('2026-10-03T04:00:00Z')).toBe('12:00:00 PM');
    expect(formatClockTime('17:05')).toBe('5:05 PM');
    expect(formatClockTime('00:00')).toBe('12:00 AM');
  });
  it('uses the Manila calendar day and interprets form values as Manila time', () => {
    expect(formatManilaDate('2026-10-02T16:08:02Z')).toBe('10/3/2026');
    expect(formatManilaDateTime('2026-10-03T00:08:02')).toBe('10/3/2026, 12:08:02 AM');
    expect(parseManilaDateTime('2026-10-03T17:05')).toBe(Date.parse('2026-10-03T09:05:00Z'));
    expect(formatManilaDate('2026-10-03')).toBe('10/3/2026');
  });
  it('handles missing and invalid data without crashing', () => {
    expect(formatManilaTime(undefined)).toBe('—');
    expect(formatManilaDateTime('invalid')).toBe('—');
    expect(formatClockTime('25:00')).toBe('—');
  });
  it('starts dashboard reporting periods at Manila midnight', () => {
    const now = Date.parse('2026-10-04T16:15:00Z'); // Monday in Manila, Sunday in UTC.
    expect(startOfManilaPeriod('week', now)).toBe(Date.parse('2026-10-04T16:00:00Z'));
    expect(startOfManilaPeriod('month', now)).toBe(Date.parse('2026-09-30T16:00:00Z'));
  });
});
