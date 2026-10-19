import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminPaymentReminderView } from './AdminPaymentReminderView';
import PaymentNotices from '../OSSA/PaymentNotices';
import type { PaymentInfo } from '../../types';
import { parseManilaDateTime } from '../../lib/dateTime';
const state = vi.hoisted(() => ({ info: {} as PaymentInfo, update: vi.fn(), post: vi.fn() }));
vi.mock('../../lib/backend', () => ({ appData: { getPaymentInfo: () => state.info, updatePaymentInfo: (...args: unknown[]) => state.update(...args), sendPaymentReminderToOSAS: (...args: unknown[]) => state.post(...args) } }));
// Exercise the workflow independently of the shared custom select's keyboard tests.
vi.mock('../ui/SelectField', () => ({ SelectField: ({ onChange, ...props }: any) => <select {...props} onChange={e => onChange(e.target.value)} /> }));
beforeEach(() => {
  state.info = { accountName: 'RMC', schoolId: 'RMC-01', billingCycle: '2026–2027', currency: 'PHP', amountDue: 2000, dueDate: parseManilaDateTime('2026-12-31'), status: 'unpaid', reminders: [] };
  state.update.mockReset(); state.post.mockReset();
  state.update.mockImplementation(async patch => { state.info = { ...state.info, ...patch }; return state.info; });
});
afterEach(cleanup);
it('guides an unconfigured account into billing setup and disables notices', () => {
  state.info = { ...state.info, accountName: '', schoolId: '', billingCycle: '', dueDate: 0, amountDue: 0 };
  render(<AdminPaymentReminderView />);
  expect(screen.getByRole('button', { name: /Post OSSA Notice/i })).toBeDisabled();
  expect(screen.queryByText(/Overdue!/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Set Up Billing/i }));
  fireEvent.change(screen.getByLabelText('School account name'), { target: { value: 'RMC' } });
  fireEvent.change(screen.getByLabelText('School ID'), { target: { value: 'RMC-01' } });
  fireEvent.change(screen.getByLabelText('Billing period'), { target: { value: '2026–2027' } });
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-12-31' } });
  fireEvent.change(screen.getByLabelText('Outstanding balance (PHP)'), { target: { value: '2000' } });
  fireEvent.submit(document.getElementById('status-form')!);
  return waitFor(() => expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ accountName: 'RMC', schoolId: 'RMC-01', amountDue: 2000, dueDate: parseManilaDateTime('2026-12-31') })));
});
it('records settlement as zero balance and disables further reminders', async () => {
  render(<AdminPaymentReminderView />);
  fireEvent.click(screen.getByRole('button', { name: /Edit Billing/i }));
  fireEvent.change(screen.getByLabelText('Payment state'), { target: { value: 'paid' } });
  fireEvent.submit(document.getElementById('status-form')!);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Billing details saved'));
  expect(state.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', amountDue: 0, lastPaymentDate: expect.any(Number) }));
  expect(screen.getByRole('button', { name: /Post OSSA Notice/i })).toBeDisabled();
});
it('keeps failed edits open with the entered values and allows retry', async () => {
  state.update.mockRejectedValueOnce(new Error('Network unavailable'));
  render(<AdminPaymentReminderView />);
  fireEvent.click(screen.getByRole('button', { name: /Edit Billing/i }));
  fireEvent.change(screen.getByLabelText('Outstanding balance (PHP)'), { target: { value: '3500' } });
  fireEvent.submit(document.getElementById('status-form')!);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('NET-001'));
  expect(screen.getByLabelText('Outstanding balance (PHP)')).toHaveValue(3500);
  fireEvent.submit(document.getElementById('status-form')!);
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Billing details saved'));
});
it('blocks duplicate posts and displays the saved notice to OSSA readers', async () => {
  let finish!: (value: unknown) => void;
  state.post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<><AdminPaymentReminderView actorName="Owner" /><PaymentNotices /></>);
  fireEvent.click(screen.getByRole('button', { name: /Post OSSA Notice/i }));
  expect((screen.getByDisplayValue(/outstanding subscription balance/) as HTMLTextAreaElement).value).toContain('PHP 2,000.00');
  fireEvent.submit(document.getElementById('reminder-form')!);
  fireEvent.submit(document.getElementById('reminder-form')!);
  expect(state.post).toHaveBeenCalledTimes(1);
  const args = state.post.mock.calls[0][0];
  const notice = { ...args, id: 'notice-1', sentAt: Date.now(), sentBy: 'Owner', recipientRole: 'OSSA Administrator', status: 'in_app' };
  await act(async () => { state.info = { ...state.info, reminders: [notice] }; finish(notice); });
  act(() => { window.dispatchEvent(new Event('rmc_data_update')); });
  expect(screen.getByRole('region', { name: 'School payment notices' })).toHaveTextContent('PHP 2,000.00');
  expect(screen.getByRole('status')).toHaveTextContent('posted to the OSSA Hub');
});
