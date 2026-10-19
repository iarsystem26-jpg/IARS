import { expect, it } from 'vitest';
import { canScheduleCeremony, defaultCeremonyRange, manilaDate, predictCeremonyDates, validWindows } from './ceremonySchedule';

it('predicts selected weekdays with an independent limit per month', () => {
  expect(predictCeremonyDates('2026-10-01', '2026-11-30', [1], 2)).toEqual(['2026-10-05','2026-10-12','2026-11-02','2026-11-09']);
});
it('rejects invalid ranges and counts and handles leap days', () => {
  expect(predictCeremonyDates('2026-02-30','2026-03-10',[1],4)).toEqual([]);
  expect(predictCeremonyDates('2026-10-20','2026-10-01',[1],4)).toEqual([]);
  expect(predictCeremonyDates('2026-10-01','2026-10-20',[1],1.5)).toEqual([]);
  expect(predictCeremonyDates('2028-02-28','2028-03-01',[2],4)).toEqual(['2028-02-29']);
});
it('enforces current Philippine month plus seven days, without past dates', () => {
  const now = Date.parse('2026-09-28T16:00:00Z');
  expect(manilaDate(now)).toBe('2026-09-29');
  expect(canScheduleCeremony('2026-09-28',now)).toBe(false);
  expect(canScheduleCeremony('2026-09-30',now)).toBe(true);
  expect(canScheduleCeremony('2026-10-06',now)).toBe(true);
  expect(canScheduleCeremony('2026-10-07',now)).toBe(false);
  expect(canScheduleCeremony('2026-10-31',Date.parse('2026-10-01T00:00:00+08:00'))).toBe(true);
});
it('rejects overlapping or reversed class windows', () => {
  const first = {id:'a',timeIn:'07:00',timeOut:'08:00',lateAfterMinutes:15};
  expect(validWindows([first])).toBe(true);
  expect(validWindows([first,{...first,id:'b',timeIn:'07:30'}])).toBe(false);
  expect(validWindows([{...first,timeOut:'06:00'}])).toBe(false);
});

it('defaults to a full planning month across month and year boundaries', () => {
  expect(defaultCeremonyRange(Date.parse('2026-09-28T16:00:00Z'))).toEqual({start:'2026-10-01',end:'2026-10-31'});
  expect(defaultCeremonyRange(Date.parse('2026-11-01T00:00:00+08:00'))).toEqual({start:'2026-11-01',end:'2026-11-30'});
  expect(defaultCeremonyRange(Date.parse('2026-12-30T00:00:00+08:00'))).toEqual({start:'2027-01-01',end:'2027-01-31'});
});

it('predicts the four Mondays of October', () => {
 expect(predictCeremonyDates('2026-10-01','2026-10-31',[1],4)).toEqual(['2026-10-05','2026-10-12','2026-10-19','2026-10-26']);
});
