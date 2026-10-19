import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GeneralEvent from '../views/GeneralEvent';
import { eventOccurrences, occurrenceProgress } from '../lib/eventTimeline';
import type { AppEvent } from '../types';

const state = vi.hoisted(() => ({ events: [] as AppEvent[] }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: { uid: 'admin', role: 'admin' }, revision: 0, loading: false }) }));
vi.mock('../lib/backend', () => ({ appData: { getEvents: () => state.events, getVisibleEvents: () => state.events, getRecipientEvents: () => state.events, getOrganizations: () => [], getSchoolStructure: () => [] } }));
vi.mock('../components/events/GeofenceMap', () => ({ GeofenceMap: () => <div role="region" aria-label="Event geofence map" /> }));
const stamp = (day: string, time: string) => Date.parse(`${day}T${time}:00+08:00`);
const event = { id: 'activity', parentEventId: 'general', title: 'Opening program', status: 'active', startTime: stamp('2026-10-01', '08:00'), endTime: stamp('2026-10-02', '16:00'), venue: 'Main gymnasium', geofenceEnabled: true, location: { lat: 7.0736, lng: 125.6126, radius_meters: 100 }, attendanceWindows: [{ id: 'morning', label: 'Morning session', timeIn: '08:00', timeOut: '10:00', lateAfterMinutes: 15 }, { id: 'afternoon', label: 'Afternoon session', timeIn: '13:00', timeOut: '16:00', lateAfterMinutes: 15 }], penaltyValue: 1, penaltyUnit: 'hours' } as AppEvent;
afterEach(() => { cleanup(); vi.restoreAllMocks(); state.events = []; });

it('expands multi-day events into Philippine date sections and tracks upcoming, live, break and finished schedules', () => {
  const rows = eventOccurrences([event]);
  expect(rows.map(row => row.day)).toEqual(['2026-10-01', '2026-10-02']);
  expect(occurrenceProgress(rows[0], stamp('2026-10-01', '07:00')).label).toBe('Starts in 1h 0m');
  expect(occurrenceProgress(rows[0], stamp('2026-10-01', '09:00'))).toEqual({ label: 'Happening now · Ends in 7h 0m', percent: 12 });
  expect(occurrenceProgress(rows[0], stamp('2026-10-01', '11:00')).label).toBe('Break · Next window in 2h 0m');
  expect(occurrenceProgress(rows[0], stamp('2026-10-01', '16:00'))).toEqual({ label: 'Already happened', percent: 100 });
  expect(occurrenceProgress({ ...rows[0], event: { ...event, cancellationStatus: 'cancelled' } }, Date.now()).label).toBe('Cancelled');
  expect(occurrenceProgress({ ...rows[0], event: { ...event, approvalStatus: 'pending' } }, Date.now()).label).toBe('Pending approval');
});

function mount(student = false) {
  return render(<MemoryRouter initialEntries={['/events/general']}><Routes><Route path="/events/:eventId" element={<GeneralEvent student={student} />} /></Routes></MemoryRouter>);
}

it('opens a full general page with banner and date sections, then a detailed activity modal', () => {
  vi.spyOn(Date, 'now').mockReturnValue(stamp('2026-10-01', '09:00'));
  state.events = [{ ...event, id: 'general', parentEventId: undefined, isGeneralEvent: true, title: 'Intramurals', bannerUrl: 'https://example.com/banner.png', startDate: '2026-10-01', endDate: '2026-10-02' }, event];
  mount();
  expect(screen.getByRole('heading', { name: 'Intramurals' })).toBeVisible();
  expect(screen.getByRole('img', { name: 'Intramurals banner' })).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const firstDay = screen.getByRole('region', { name: 'Thursday, October 1, 2026' });
  expect(screen.getByRole('region', { name: 'Friday, October 2, 2026' })).toBeVisible();
  fireEvent.click(within(firstDay).getByRole('button', { name: /Opening program/ }));
  const modal = screen.getByRole('dialog', { name: 'Opening program' });
  expect(within(modal).getByText('Main gymnasium')).toBeVisible();
  expect(within(modal).getByText('100 meters')).toBeVisible();
  expect(within(modal).getByRole('region', { name: 'Event geofence map' })).toBeVisible();
  expect(within(modal).getByRole('link', { name: 'Open location in Maps' })).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=7.0736,125.6126');
});

it('keeps student pages read-only and handles missing events', () => {
  state.events = [{ ...event, id: 'general', isGeneralEvent: true, title: 'Intramurals' }];
  const view = mount(true);
  expect(screen.queryByRole('button', { name: 'Add specific event' })).not.toBeInTheDocument();
  view.unmount(); state.events = []; mount();
  expect(screen.getByText('This general event is unavailable.')).toBeVisible();
});


it('loads organization general events only within the requested organization', () => {
  state.events = [{ ...event, id: 'general', parentEventId: undefined, isGeneralEvent: true, title: 'Organization Festival', organizationId: 'club' }];
  const route = (org: string) => <MemoryRouter initialEntries={[`/organizations/${org}/events/general`]}><Routes><Route path="/organizations/:organizationId/events/:eventId" element={<GeneralEvent />} /></Routes></MemoryRouter>;
  const view = render(route('club'));
  expect(screen.getByRole('heading', { name: 'Organization Festival' })).toBeVisible();
  view.unmount(); render(route('other-club'));
  expect(screen.getByText('This general event is unavailable.')).toBeVisible();
});
