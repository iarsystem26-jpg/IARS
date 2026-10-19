import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PersonalCalendar from './PersonalCalendar';
import { loadPersonalCalendar, type CalendarData } from '../lib/personalCalendar';

vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: { role: 'student' } }) }));
vi.mock('../lib/accessControl', () => ({ hasPermission: () => false }));
vi.mock('../lib/backend', () => ({ subscribeData: (callback: () => void) => {
 window.addEventListener('rmc_data_update', callback);
 return () => window.removeEventListener('rmc_data_update', callback);
} }));
vi.mock('../lib/personalCalendar', async importOriginal => ({
 ...await importOriginal<typeof import('../lib/personalCalendar')>(),
 calendarDay: () => '2026-10-09', loadPersonalCalendar: vi.fn(),
}));
vi.mock('../components/events/CalendarExport', () => ({ default: () => null }));
vi.mock('../components/events/CalendarActivityDetail', () => ({ default: () => null }));

const data: CalendarData = { closures: [], items: [{
 id: 'session', event_id: 'event', title: 'Opening program', label: 'Morning',
 starts_at: '2026-10-09T08:00:00+08:00', ends_at: '2026-10-09T17:00:00+08:00',
 kind: 'attendance', organization_id: null, general: false, cancelled: false,
 suspended: false, venue: '', description: '',
}] };
const load = vi.mocked(loadPersonalCalendar);
beforeEach(() => { load.mockReset(); load.mockResolvedValue(data); });
afterEach(cleanup);
async function openCalendar() {
 render(<MemoryRouter><PersonalCalendar/></MemoryRouter>);
 await screen.findByText('Opening program');
 await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
}
it('displays informational schedules without counting them as attendance sessions', async () => {
 load.mockResolvedValue({ closures: [], items: [{ ...data.items[0], kind: 'informational', label: 'No attendance required' }] });
 await openCalendar();
 expect(screen.getByText('Informational schedule')).toBeVisible();
 expect(screen.getByRole('button', { name: 'View schedule' })).toBeVisible();
 expect(screen.getByRole('button', { name: '2026-10-09, 0 sessions' })).toBeVisible();
});

it('keeps the agenda, counts and markers visible while a background refresh is pending', async () => {
 await openCalendar();
 let resolve!: (value: CalendarData) => void;
 load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 act(() => { window.dispatchEvent(new Event('rmc_data_update')); });
 expect(screen.getByText('Opening program')).toBeVisible();
 expect(screen.getByRole('button', { name: '2026-10-09, 1 sessions' })).toBeVisible();
 expect(screen.queryByText('Loading your schedule…')).not.toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
 await act(async () => { resolve({ ...data, items: [{ ...data.items[0], title: 'Updated program' }] }); });
 expect(screen.getByText('Updated program')).toBeVisible();
 expect(screen.queryByText('Opening program')).not.toBeInTheDocument();
});

it('retains the loaded schedule when a refresh fails and permits retry', async () => {
 await openCalendar();
 load.mockRejectedValueOnce(new Error('Connection interrupted'));
 fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('NET-001');
 expect(screen.getByText('Opening program')).toBeVisible();
 fireEvent.click(screen.getByRole('button', { name: 'Retry calendar' }));
 await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
 expect(screen.getByText('Opening program')).toBeVisible();
});

it('hides the previous month while loading a different month', async () => {
 await openCalendar();
 let resolve!: (value: CalendarData) => void;
 load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
 expect(screen.getByRole('status', { name: 'Loading your schedule' })).toBeVisible();
 expect(screen.queryByText('Opening program')).not.toBeInTheDocument();
 await act(async () => { resolve({ items: [], closures: [] }); });
 expect(screen.getByText('No activities for this day and filter.')).toBeVisible();
});
