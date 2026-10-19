import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import AttendanceSchedule from './AttendanceSchedule';
import type { AppEvent } from '../../types';

const stamp = (day: string, time: string) => Date.parse(`${day}T${time}:00+08:00`);
const event = {
  id: 'assembly', status: 'active', startTime: stamp('2026-10-09', '08:30'), endTime: stamp('2026-10-10', '15:30'),
  attendanceWindows: [
    { id: 'morning', label: 'Morning session', timeIn: '08:00', timeOut: '10:00', lateAfterMinutes: 15 },
    { id: 'afternoon', label: 'Afternoon session', timeIn: '13:00', timeOut: '16:00', lateAfterMinutes: 15 },
  ],
} as AppEvent;
afterEach(cleanup);

it('shows each opening and closing time, clamped to event dates, in Philippine time', () => {
  const { rerender } = render(<AttendanceSchedule event={event} now={stamp('2026-10-09', '09:00')} />);
  expect(screen.getByText('8:30 AM')).toBeVisible();
  expect(screen.getByText('10:00 AM')).toBeVisible();
  expect(screen.getByText('1:00 PM')).toBeVisible();
  expect(screen.getByText('4:00 PM')).toBeVisible();
  expect(screen.getByText(/Philippine time/)).toHaveTextContent('Repeats daily');
  expect(screen.getByRole('status')).toHaveTextContent('Current window closes at 10:00 AM.');
  rerender(<AttendanceSchedule event={event} now={stamp('2026-10-10', '14:00')} />);
  expect(screen.getByText('8:00 AM')).toBeVisible();
  expect(screen.getByText('3:30 PM')).toBeVisible();
});

it('updates from upcoming to open, then shows the next window during the break', () => {
  const { rerender } = render(<AttendanceSchedule event={event} now={stamp('2026-10-09', '08:00')} />);
  expect(screen.getByRole('status')).toHaveTextContent('Next window opens today at 8:30 AM.');
  rerender(<AttendanceSchedule event={event} now={stamp('2026-10-09', '08:30')} />);
  expect(screen.getByText('Open now')).toBeVisible();
  rerender(<AttendanceSchedule event={event} now={stamp('2026-10-09', '10:00')} />);
  expect(screen.queryByText('Open now')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Next window opens today at 1:00 PM.');
  rerender(<AttendanceSchedule event={event} now={stamp('2026-10-09', '17:00')} />);
  expect(screen.getByRole('status')).toHaveTextContent('Next window opens on Oct 10 at 8:00 AM.');
  rerender(<AttendanceSchedule event={event} now={stamp('2026-10-10', '16:00')} />);
  expect(screen.getByRole('status')).toHaveTextContent('Attendance windows for this event have ended.');
});

it('uses the full event period for legacy events without configured windows', () => {
  render(<AttendanceSchedule event={{ ...event, attendanceWindows: [] }} now={stamp('2026-10-09', '09:00')} />);
  const schedule = screen.getByRole('region', { name: 'Attendance windows' });
  expect(within(schedule).getByText('8:30 AM')).toBeVisible();
  expect(within(schedule).getByText('3:30 PM')).toBeVisible();
  expect(within(schedule).getByText('Oct 9')).toBeVisible();
  expect(within(schedule).getByText('Oct 10')).toBeVisible();
});

it('never labels cancelled or completed events as open', () => {
  const { rerender } = render(<AttendanceSchedule event={{ ...event, cancellationStatus: 'cancelled' }} now={stamp('2026-10-09', '09:00')} />);
  expect(screen.getByText('Cancelled')).toBeVisible();
  expect(screen.queryByText('Open now')).not.toBeInTheDocument();
  rerender(<AttendanceSchedule event={{ ...event, status: 'done' }} now={stamp('2026-10-09', '09:00')} />);
  expect(screen.getByText('Windows closed')).toBeVisible();
});
