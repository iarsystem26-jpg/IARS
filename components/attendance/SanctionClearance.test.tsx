import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SanctionClearance from './SanctionClearance';

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('remembers dismissal and allows the student to reopen the celebration', async () => {
  const user = userEvent.setup();
  const props = { uid: 'student-1', name: 'Alex', clearanceId: 'clearance-1' };
  const view = render(<SanctionClearance {...props} />);
  expect(screen.getByRole('dialog', { name: 'Congratulations!' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Continue to my records' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.unmount();
  render(<SanctionClearance {...props} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'View celebration' }));
  expect(screen.getByRole('dialog', { name: 'Congratulations!' })).toBeVisible();
});

it('celebrates a later clearance and keeps dismissals separate for each student', () => {
  localStorage.setItem('rmc:sanction-clearance:student-1', 'clearance-1');
  const view = render(<SanctionClearance uid="student-1" name="Alex" clearanceId="clearance-2" />);
  expect(screen.getByRole('dialog')).toBeVisible();
  view.unmount();
  render(<SanctionClearance uid="student-2" name="Sam" clearanceId="clearance-1" />);
  expect(screen.getByRole('dialog')).toBeVisible();
});

it('can dismiss the screen when browser storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked'); });
  const user = userEvent.setup();
  render(<SanctionClearance uid="student-1" name="Alex" clearanceId="clearance-1" />);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
