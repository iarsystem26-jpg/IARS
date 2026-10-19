import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { AppEvent } from '../types';
const api = vi.hoisted(() => ({ rosters: vi.fn(), prepare: vi.fn(), photos: vi.fn(), recentPreparations: vi.fn() }));
vi.mock('./offlineAttendance', () => ({ offlineRosters: api.rosters, prepareOfflineAttendance: api.prepare, recentRosterPreparations: api.recentPreparations }));
vi.mock('./scannerPhotos', () => ({ prefetchScannerPhotos: api.photos }));
let refresh: typeof import('./autoRosterSync').refreshAutomaticRosters;
const current = () => true;
const event = (id: string, fields: Partial<AppEvent> = {}) => ({ id, approvalStatus: 'approved', status: 'active', startTime: Date.now() - 60000, endTime: Date.now() + 3600000, ...fields } as AppEvent);
const roster = (id: string, age = 0) => ({ event: event(id), preparedAt: Date.now() - age, clockOffset: 0 });
beforeEach(async () => {
  vi.resetModules(); vi.resetAllMocks();
  vi.stubGlobal('indexedDB', {});
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  api.rosters.mockResolvedValue([]); api.prepare.mockResolvedValue({});
  api.photos.mockResolvedValue(undefined); api.recentPreparations.mockResolvedValue(undefined);
  refresh = (await import('./autoRosterSync')).refreshAutomaticRosters;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('prepares only approved current and next-day attendance events', async () => {
  await refresh('mayor', [event('current'), event('next-day', { startTime: Date.now() + 3600000 }), event('pending', { approvalStatus: 'pending' }), event('rejected', { approvalStatus: 'rejected' }), event('cancelled', { cancellationStatus: 'cancelled' }), event('done', { status: 'done' }), event('general', { isGeneralEvent: true }), event('ended', { endTime: Date.now() - 1000 }), event('distant', { startTime: Date.now() + 172800000 })], current);
  expect(api.prepare.mock.calls.map(call => call[1])).toEqual(['current', 'next-day']);
});
it('does not redownload fresh rosters on each workspace poll', async () => {
  api.rosters.mockResolvedValue([roster('fresh'), roster('due', 16 * 60000)]);
  await refresh('mayor', [event('fresh'), event('due')], current);
  expect(api.prepare).toHaveBeenCalledOnce(); expect(api.prepare.mock.calls[0][1]).toBe('due');
});
it('bounds each batch and preserves hourly capacity for manual requests', async () => {
  const events = Array.from({ length: 5 }, (_, i) => event(`event-${i}`));
  api.rosters.mockResolvedValue(Array.from({ length: 19 }, (_, i) => roster(`other-${i}`)));
  await refresh('mayor', events, current); expect(api.prepare).toHaveBeenCalledOnce();
  api.prepare.mockClear(); api.rosters.mockResolvedValue(Array.from({ length: 20 }, (_, i) => roster(`other-${i}`)));
  await refresh('mayor', events, current); expect(api.prepare).not.toHaveBeenCalled();
});
it('coalesces concurrent refreshes and stops after an account change', async () => {
  let active = true;
  api.prepare.mockImplementation(async () => { active = false; });
  await Promise.all([refresh('mayor', [event('first'), event('second')], () => active), refresh('mayor', [event('first')], () => active)]);
  expect(api.prepare).toHaveBeenCalledOnce();
  expect(api.prepare.mock.calls[0][2]()).toBe(false);
});
it('backs off denied or failed preparation without breaking other events', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  api.prepare.mockRejectedValueOnce(new Error('Permission required'));
  await refresh('mayor', [event('denied'), event('allowed')], current);
  expect(api.prepare).toHaveBeenCalledTimes(2);
  api.prepare.mockClear(); await refresh('mayor', [event('denied')], current);
  expect(api.prepare).not.toHaveBeenCalled();
});
it('does no storage or network work offline or after logout', async () => {
  await refresh('mayor', [event('event')], () => false);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  await refresh('mayor', [event('event')], current);
  expect(api.rosters).not.toHaveBeenCalled(); expect(api.prepare).not.toHaveBeenCalled();
});
