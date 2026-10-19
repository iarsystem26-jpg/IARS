import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClearanceCertificates from './ClearanceCertificates';

const state = vi.hoisted(() => ({ role: 'student', rows: [] as any[], load: vi.fn(), release: vi.fn(), issue: vi.fn() }));
vi.mock('../../lib/backend', () => ({ subscribeData: (callback: () => void) => {
 window.addEventListener('rmc_data_update', callback);
 return () => window.removeEventListener('rmc_data_update', callback);
} }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: { uid: 'demo', role: state.role }, revision: 0 }) }));
vi.mock('../../lib/clearanceCertificates', () => ({
 loadClearanceSchedules: state.load, releaseClearanceSchedule: state.release, issueClearanceCertificate: state.issue,
 createClearanceSchedule: vi.fn(), clearanceVerificationUrl: vi.fn(),
}));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn() } }));
const row = { id: 'period', title: 'Semester clearance', starts_at: '2026-10-09T00:00:00Z', ends_at: '2026-10-09T09:00:00Z', eligible: true, release_enabled: false };
beforeEach(() => { vi.clearAllMocks(); state.role = 'student'; state.rows = []; state.load.mockImplementation(async () => state.rows); });
afterEach(cleanup);

it('keeps schedules visible and silently applies new release data during background refresh', async () => {
 state.rows = [row];
 render(<ClearanceCertificates />);
 await screen.findByText('Semester clearance');
 let resolve!: (rows: any[]) => void;
 state.load.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 act(() => window.dispatchEvent(new Event('rmc_data_update')));
 expect(screen.getByText('Semester clearance')).toBeVisible();
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Refresh certificates' })).toBeEnabled();
 await act(async () => { resolve([{ ...row, release_enabled: true }]); });
 expect(screen.getByRole('button', { name: 'Request certificate' })).toBeEnabled();
});

it('blocks requests until both scheduled clearance and OSSA release qualify', async () => {
 state.rows = [{ ...row, id: 'outside', title: 'Outside period', eligible: false, release_enabled: true }, row, { ...row, id: 'ready', title: 'Released period', release_enabled: true }];
 render(<ClearanceCertificates />);
 await screen.findByText('Released period');
 const cards = screen.getAllByRole('article');
 expect(within(cards[0]).getByRole('button', { name: 'Request certificate' })).toBeDisabled();
 expect(within(cards[1]).getByRole('button', { name: 'Request certificate' })).toBeDisabled();
 expect(within(cards[2]).getByRole('button', { name: 'Request certificate' })).toBeEnabled();
 expect(state.issue).not.toHaveBeenCalled();
});
it('requires reviewing the release confirmation before allowing student downloads', async () => {
 state.role = 'ossa'; state.rows = [row]; state.release.mockResolvedValue([{ ...row, release_enabled: true }]);
 const user = userEvent.setup(); render(<ClearanceCertificates manage />);
 await user.click(await screen.findByRole('button', { name: 'Enable release' }));
 expect(state.release).not.toHaveBeenCalled();
 await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm release' }));
 expect(state.release).toHaveBeenCalledWith('period', true);
 expect(await screen.findByRole('button', { name: 'Hold release' })).toBeEnabled();
});
it('reports backend failure and permits a refresh instead of showing false eligibility', async () => {
 state.load.mockRejectedValueOnce(new Error('Server unavailable'));
 const user = userEvent.setup(); render(<ClearanceCertificates />);
 expect(await screen.findByRole('alert')).toHaveTextContent('SYS-001');
 expect(screen.queryByRole('button', { name: 'Request certificate' })).not.toBeInTheDocument();
 state.rows = [row];
 await user.click(screen.getByRole('button', { name: 'Refresh certificates' }));
 expect(await screen.findByText('Semester clearance')).toBeVisible();
});
