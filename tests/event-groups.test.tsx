import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EventGroups } from '../components/events/EventGroups';
import { attendanceWindowTitle, eventDisplayTitle, eventSectionRoots } from '../lib/eventGroups';
import { AppEvent } from '../types';

const parent = { id: 'general', title: 'Foundation Days', isGeneralEvent: true, startDate: '2026-11-10', endDate: '2026-11-12', status: 'upcoming' } as AppEvent;
const child = { id: 'opening', title: 'Day 1', parentEventId: 'general', parentEventTitle: 'Foundation Days', venue: 'Main gymnasium', startDate: '2026-11-10', endDate: '2026-11-10', startTime: 1, status: 'upcoming', attendanceWindows: [{ id: 'morning', label: 'Opening program', timeIn: '08:00', timeOut: '10:00', lateAfterMinutes: 15 }] } as AppEvent;
afterEach(cleanup);

it('shows grouped events with the location, named window and separate open/add actions', () => {
  const onOpen = vi.fn(), onAdd = vi.fn();
  render(<EventGroups events={[parent, child]} onOpen={onOpen} onAdd={onAdd} />);
  expect(screen.getByText('Opening program: 8:00 AM–10:00 AM')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Day 1.*Main gymnasium/ }));
  expect(onOpen).toHaveBeenCalledWith(child);
  fireEvent.click(screen.getByRole('button', { name: 'Add specific event' }));
  expect(onAdd).toHaveBeenCalledWith(parent);
});

it('keeps the group name visible when only a specific event is available to the student', () => {
  render(<EventGroups events={[child]} onOpen={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Foundation Days' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Add specific event' })).not.toBeInTheDocument();
  expect(eventDisplayTitle(child)).toBe('Foundation Days / Day 1');
  expect(attendanceWindowTitle(child, '2026-11-10:morning')).toBe('Opening program');
});

it('uses the current general title in records and preserves legacy windows', () => {
  expect(eventDisplayTitle(child, [{ ...parent, title: 'Annual Foundation Days' }])).toBe('Annual Foundation Days / Day 1');
  expect(attendanceWindowTitle(child, 'default')).toBe('');
  expect(eventDisplayTitle({ ...child, parentEventId: undefined, parentEventTitle: undefined })).toBe('Day 1');
});


it('counts a general event once and keeps its specific events nested', () => {
  expect(eventSectionRoots([parent, child])).toEqual([parent]);
  expect(eventSectionRoots([child])).toEqual([child]);
});

it('shows a saved banner on the group card', () => {
  render(<EventGroups events={[{ ...parent, bannerUrl: 'https://example.com/banner.png' }, child]} groupIds={[parent.id]} onOpen={vi.fn()} />);
  expect(screen.getByRole('img', { name: 'Foundation Days banner' })).toHaveAttribute('src', 'https://example.com/banner.png');
});
