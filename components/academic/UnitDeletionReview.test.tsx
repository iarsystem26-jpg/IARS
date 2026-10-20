import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UnitDeletionReview } from './UnitDeletionReview';
import { UnitDeletionHierarchy } from './UnitDeletionHierarchy';
import type { UnitDeletionPreview } from '../../lib/unitDeletion';

const api = vi.hoisted(() => ({ begin: vi.fn(), perform: vi.fn(), reload: vi.fn(), close: vi.fn(), mfa: vi.fn() }));
vi.mock('../../lib/backend', () => ({ appData: { beginUnitDeletion: api.begin } }));
vi.mock('../../lib/supabase', () => ({ sensitiveActionRequiresMfa: api.mfa }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const preview: UnitDeletionPreview = {
  version: 'v1', records: [
    { key: 'unit:root', id: 'root', kind: 'unit', name: 'Campus', detail: 'campus', nodeIds: [], destinationType: null, canDelete: true, blockedReason: null },
    { key: 'unit:class', id: 'class', kind: 'unit', name: 'Class A', detail: 'section', nodeIds: ['root'], destinationType: 'campus', canDelete: true, blockedReason: null },
    { key: 'account:student', id: 'student', kind: 'account', name: 'Student A', detail: 'student', nodeIds: ['class'], destinationType: 'class', canDelete: true, blockedReason: null },
    { key: 'event:history', id: 'history', kind: 'event', name: 'Attendance event', detail: 'Event', nodeIds: ['root'], destinationType: null, canDelete: false, blockedReason: 'Has attendance history' },
  ], destinations: [{ id: 'other-campus', name: 'Other Campus', type: 'campus' }, { id: 'other-class', name: 'Other Class', type: 'block' }],
};
beforeEach(() => {
  api.mfa.mockResolvedValue(false);
  api.begin.mockImplementation(async () => ({ preview, expiresAt: Date.now() + 110000, confirm: api.perform, close: api.close, reload: api.reload }));
});
async function verify(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Current password'), 'current-password');
  await user.click(screen.getByRole('button', { name: 'Verify and review records' }));
  await screen.findByRole('button', { name: 'Review and confirm deletion' });
}
async function destination(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  await user.click(screen.getByLabelText(`Set transfer destination for ${name}`));
  await user.click(screen.getByRole('button', { name: `Transfer ${name} to` }));
  await user.click(screen.getByRole('option', { name: option }));
}

it('requires destinations for kept records and keeps people inside a retained class', async () => {
  const user = userEvent.setup();
  render(<UnitDeletionReview nodeId="root" name="Campus" onClose={vi.fn()} onDeleted={vi.fn()} />);
  await verify(user);
  const next = await screen.findByRole('button', { name: 'Review and confirm deletion' });
  expect(next).toBeDisabled();
  expect(screen.queryByLabelText('Transfer Student A to')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /Attendance event/ })).toBeDisabled();
  await destination(user, 'Class A', 'Other Campus (campus)');
  await destination(user, 'Attendance event', 'Other Campus (campus)');
  expect(next).toBeEnabled();
  await user.click(screen.getByRole('checkbox', { name: /Class A/ }));
  expect(screen.queryByLabelText('Transfer Class A to')).not.toBeInTheDocument();
  expect(next).toBeDisabled();
  await destination(user, 'Student A', 'Other Class (block)');
  expect(next).toBeEnabled();
});

it('selects only deletable records and shows the final plan after initial verification', async () => {
  const user = userEvent.setup();
  render(<UnitDeletionReview nodeId="root" name="Campus" onClose={vi.fn()} onDeleted={vi.fn()} />);
  await verify(user);
  await user.click(await screen.findByRole('button', { name: 'Select all deletable records' }));
  expect(screen.getByRole('checkbox', { name: /Student A/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Attendance event/ })).not.toBeChecked();
  await destination(user, 'Attendance event', 'Other Campus (campus)');
  await user.click(screen.getByRole('button', { name: 'Review and confirm deletion' }));
  expect(screen.getByText('Student A')).toBeInTheDocument();
  expect(screen.getByText('Transfer to Other Campus')).toBeInTheDocument();
  expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  expect(api.perform).not.toHaveBeenCalled();
});

it('blocks record access until verification succeeds and clears rejected credentials', async () => {
  api.begin.mockRejectedValueOnce(new Error('Incorrect password'));
  const user = userEvent.setup();
  render(<UnitDeletionReview nodeId="root" name="Campus" onClose={vi.fn()} onDeleted={vi.fn()} />);
  expect(api.begin).not.toHaveBeenCalled();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  await user.type(screen.getByLabelText('Current password'), 'wrong-password');
  await user.click(screen.getByRole('button', { name: 'Verify and review records' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Current password')).toHaveValue('');
  expect(screen.queryByRole('button', { name: 'Review and confirm deletion' })).not.toBeInTheDocument();
  await verify(user);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review and confirm deletion' })).toBeDisabled());
  expect(screen.getByRole('checkbox', { name: /Student A/ })).not.toBeChecked();
});

it('requires enrolled MFA before requesting access and closes the temporary session on dismissal', async () => {
  api.mfa.mockResolvedValue(true);
  const user = userEvent.setup();
  const view = render(<UnitDeletionReview nodeId="root" name="Campus" onClose={vi.fn()} onDeleted={vi.fn()} />);
  await user.type(screen.getByLabelText('Current password'), 'current-password');
  expect(screen.getByRole('button', { name: 'Verify and review records' })).toBeDisabled();
  await user.type(await screen.findByLabelText(/Google Authenticator code/), '123456');
  await user.click(screen.getByRole('button', { name: 'Verify and review records' }));
  await screen.findByRole('button', { name: 'Review and confirm deletion' });
  expect(api.begin).toHaveBeenCalledWith('root', 'current-password', '123456');
  view.unmount();
  expect(api.close).toHaveBeenCalled();
});

it('filters by people and search while preserving selections', async () => {
  const user = userEvent.setup();
  render(<UnitDeletionReview nodeId="root" name="Campus" onClose={vi.fn()} onDeleted={vi.fn()} />);
  await verify(user);
  await user.click(screen.getByRole('button', { name: /People/ }));
  expect(screen.queryByRole('checkbox', { name: /Class A/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: /Student A/ }));
  await user.type(screen.getByRole('searchbox', { name: 'Search linked records' }), 'unknown');
  expect(screen.getByText('No records match your search or filter.')).toBeInTheDocument();
  await user.clear(screen.getByRole('searchbox', { name: 'Search linked records' }));
  expect(screen.getByRole('checkbox', { name: /Student A/ })).toBeChecked();
});

it('distinguishes one unit from its entire branch and excludes protected history and sibling schools', async () => {
  const nested: UnitDeletionPreview = { ...preview, records: [
    preview.records[0],
    { ...preview.records[1], key: 'unit:college', id: 'college', name: 'College Department', detail: 'college' },
    { ...preview.records[1], nodeIds: ['college'] }, preview.records[2],
    { ...preview.records[3], nodeIds: ['class'] },
    { ...preview.records[1], key: 'unit:school', id: 'school', name: 'Junior High School', detail: 'education_unit' },
  ] };
  function Harness() {
    const [selected, setSelected] = React.useState(new Set(['unit:root']));
    return <UnitDeletionHierarchy preview={nested} rootId="root" selected={selected} transfers={{}} onSelected={setSelected} />;
  }
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('checkbox', { name: 'Delete College Department only' }));
  expect(screen.getByRole('checkbox', { name: 'Delete Class A only' })).not.toBeChecked();
  expect(screen.getAllByText(/This unit only selected/).length).toBeGreaterThan(0);
  const college = screen.getByRole('checkbox', { name: 'Delete College Department only' }).closest('[data-record-key]')!;
  await user.click(within(college as HTMLElement).getByRole('button', { name: 'Select entire branch (3 deletable)' }));
  await user.click(screen.getByRole('button', { name: 'Expand Class A' }));
  expect(screen.getByRole('checkbox', { name: 'Delete Class A only' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Delete Student A' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Delete Attendance event' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Delete Attendance event' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'Delete Junior High School only' })).not.toBeChecked();
  expect(within(college as HTMLElement).getByText(/3 of 4 records to delete/)).toBeInTheDocument();
  await user.click(within(college as HTMLElement).getAllByRole('button', { name: 'Keep this branch' })[0]);
  expect(screen.getByRole('checkbox', { name: 'Delete Student A' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Delete Campus only' })).toBeChecked();
});

it('requires renewed verification on expiry and resumes confirmation with the saved plan', async () => {
  api.begin.mockResolvedValueOnce({ preview, expiresAt: Date.now() - 1, confirm: api.perform, close: api.close, reload: api.reload });
  const user = userEvent.setup();
  render(<UnitDeletionReview nodeId="root" name="Campus" onClose={vi.fn()} onDeleted={vi.fn()} />);
  await verify(user);
  await user.click(screen.getByRole('button', { name: 'Select all deletable records' }));
  await destination(user, 'Attendance event', 'Other Campus (campus)');
  await user.click(screen.getByRole('button', { name: 'Review and confirm deletion' }));
  await user.type(screen.getByLabelText('Type DELETE'), 'DELETE');
  await user.type(screen.getByLabelText('Type the exact name: Campus'), 'Campus');
  await user.type(screen.getByLabelText('Reason'), 'Remove test campus');
  await user.click(screen.getByRole('button', { name: 'Confirm Delete' }));
  expect(api.perform).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('Current password'), 'current-password');
  await user.click(screen.getByRole('button', { name: 'Verify and review records' }));
  await screen.findByRole('button', { name: 'Confirm Delete' });
  expect(screen.getByLabelText('Reason')).toHaveValue('Remove test campus');
  await user.click(screen.getByRole('button', { name: 'Confirm Delete' }));
  expect(api.perform).toHaveBeenCalledWith({ typedAction: 'DELETE', typedName: 'Campus', reason: 'Remove test campus' }, {
    version: 'v1', deleteKeys: ['unit:root', 'unit:class', 'account:student'], transfers: { 'event:history': 'other-campus' },
  });
});
