import { expect, it } from 'vitest';
import { backgroundPollDelay } from './backgroundPolling';
it('reduces idle student/public traffic while keeping scanners responsive', () => {
  expect(backgroundPollDelay('student', false, 0, 0)).toBe(120_000);
  expect(backgroundPollDelay(undefined, false, 0, 0)).toBe(120_000);
  expect(backgroundPollDelay('admin', false, 0, 0)).toBe(45_000);
  expect(backgroundPollDelay('mayor', true, 0, 0)).toBe(15_000);
});
it('adds bounded jitter and exponential outage backoff', () => {
  expect(backgroundPollDelay('student', false, 0, 1)).toBe(144_000);
  expect(backgroundPollDelay('mayor', true, 1, 0)).toBe(30_000);
  expect(backgroundPollDelay('mayor', true, 99, 1)).toBe(360_000);
  expect(backgroundPollDelay('student', false, 0, 0)).toBe(120_000);
});
