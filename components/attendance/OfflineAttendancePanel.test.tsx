import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import OfflineAttendancePanel, { useOfflineAttendance } from './OfflineAttendancePanel';
import type { AppEvent } from '../../types';
import type { OfflineRoster } from '../../lib/offlineAttendance';

vi.mock('../../lib/offlineAttendance', () => ({}));
afterEach(cleanup);

function show(options: { expired?: boolean; missing?: boolean; error?: string; scheduled?: boolean } = {}) {
  const now = Date.now();
  const event = { id: 'event', startTime: now + (options.scheduled ? 60000 : -60000), endTime: now + 3600000, status: 'active' } as AppEvent;
  const roster = { id: 'roster', event, students: [], preparedAt: now - 30000, captureUntil: now + (options.expired ? -1 : 3600000), syncUntil: now + 7200000, clockOffset: 0 } as unknown as OfflineRoster;
  const data = { rosters: options.missing ? [] : [roster], queue: [], online: true, error: options.error || '' } as ReturnType<typeof useOfflineAttendance>;
  render(<OfflineAttendancePanel owner="officer" eventId="event" event={event} data={data} />);
}

it('marks a usable saved roster ready and displays its refresh time', () => {
  show();
  expect(screen.getByText('Ready for offline attendance')).toBeInTheDocument();
  expect(screen.getByText(/Last roster refresh:/)).toBeInTheDocument();
});

it.each([{ missing: true }, { expired: true }, { error: 'Storage failed' }, { scheduled: true }])('does not claim readiness with %j', options => {
  show(options);
  expect(screen.getByText('Offline attendance is not ready')).toBeInTheDocument();
  expect(screen.queryByText('Ready for offline attendance')).toBeNull();
});
