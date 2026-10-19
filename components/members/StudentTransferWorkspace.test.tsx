import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import StudentTransferWorkspace from './StudentTransferWorkspace';
import { classifyError } from '../../lib/errors';
const mocks = vi.hoisted(() => ({ roster: vi.fn(), transfer: vi.fn() }));
vi.mock('../../lib/backend', () => ({ documentUrl: (src: string) => Promise.resolve(src), appData: { getTransferRoster: mocks.roster, transferStudents: mocks.transfer } }));
vi.mock('../ui/CustomSelect', () => ({ default: ({ label, value, onChange, options }: any) => <label>{label}<select value={value} onChange={e => onChange(e.target.value)}>{options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label> }));
const nodes: any = [{ id: 'campus', name: 'Campus', type: 'campus', children: [{ id: 'a', name: 'Class A', type: 'section' }, { id: 'b', name: 'Class B', type: 'section' }] }];
const chooseDestination = () => {
  const picker = within(screen.getByRole('group', { name: 'Destination class' }));
  fireEvent.change(picker.getByLabelText('Campus'), { target: { value: 'campus' } });
  fireEvent.change(picker.getByLabelText('Section'), { target: { value: 'b' } });
};
beforeEach(() => { mocks.roster.mockResolvedValue([{ uid: '1', name: 'Jane', student_id: '00001', node_id: 'a', role: 'student' }]); mocks.transfer.mockResolvedValue(1); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('opens the chosen profile from both layouts without selecting or transferring the student', async () => {
  const onShowProfile = vi.fn();
  render(<StudentTransferWorkspace nodes={nodes} onShowProfile={onShowProfile} />);
  const buttons = await screen.findAllByRole('button', { name: 'Show profile for Jane (00001)' });
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    fireEvent.click(button);
    expect(onShowProfile).toHaveBeenLastCalledWith(expect.objectContaining({ uid: '1', student_id: '00001', node_id: 'a' }));
    screen.getAllByRole('checkbox').forEach(checkbox => expect(checkbox).not.toBeChecked());
  }
  expect(mocks.transfer).not.toHaveBeenCalled();
});
it('shows the profile photo in both student layouts and the transfer review', async () => {
  mocks.roster.mockResolvedValue([{ uid: '1', name: 'Jane', student_id: '00001', node_id: 'a', role: 'student', photo_url: '/jane.png' }]);
  render(<StudentTransferWorkspace nodes={nodes} />);
  const photos = await screen.findAllByRole('img', { name: 'Profile picture of Jane' });
  expect(photos).toHaveLength(2);
  await waitFor(() => photos.forEach(photo => expect(photo).toHaveAttribute('src', '/jane.png')));
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  chooseDestination();
  fireEvent.click(screen.getByRole('button', { name: 'Review selected students (1)' }));
  await waitFor(() => expect(screen.getByRole('img', { name: 'Profile picture of Jane' })).toHaveAttribute('src', '/jane.png'));
});
it('explains an empty session group and allows review after choosing a class inside a group', async () => {
  const hierarchy: any = [{ ...nodes[0], children: [nodes[0].children[0],
    { id: 'morning', name: 'Morning', type: 'custom', metadata: { customFields: { grouping: 'Session' } }, children: [] },
    { id: 'afternoon', name: 'Afternoon', type: 'custom', children: [nodes[0].children[1]] },
  ] }];
  render(<StudentTransferWorkspace nodes={hierarchy} />);
  fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
  const picker = within(screen.getByRole('group', { name: 'Destination class' }));
  fireEvent.change(picker.getByLabelText('Campus'), { target: { value: 'campus' } });
  const choice = picker.getByLabelText('Academic unit / class');
  expect(choice).toHaveTextContent('Morning — Session');
  fireEvent.change(choice, { target: { value: 'morning' } });
  expect(picker.getByRole('status')).toHaveTextContent('“Morning” has no active blocks or sections');
  expect(screen.getByRole('button', { name: 'Review selected students (1)' })).toBeDisabled();
  fireEvent.change(choice, { target: { value: 'afternoon' } });
  expect(picker.getByRole('status')).toHaveTextContent('Continue to a specific block or section');
  fireEvent.change(picker.getByLabelText('Section'), { target: { value: 'b' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review selected students (1)' }));
  expect(screen.getByText('Review 1 assignment changes')).toBeInTheDocument();
  expect(mocks.transfer).not.toHaveBeenCalled();
});
it('requires a specific destination class and clears it when a parent changes', async () => {
  const hierarchy: any = [{ id: 'campus', name: 'Campus', type: 'campus', children: [
    { id: 'unit-a', name: 'College', type: 'education_unit', children: [nodes[0].children[0]] },
    { id: 'unit-b', name: 'High School', type: 'education_unit', children: [nodes[0].children[1]] },
    { id: 'empty', name: 'Empty unit', type: 'education_unit', children: [] },
    { id: 'archived', name: 'Archived unit', type: 'education_unit', metadata: { archived: true }, children: [{ id: 'old', name: 'Old class', type: 'section' }] },
  ] }];
  render(<StudentTransferWorkspace nodes={hierarchy} />);
  fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
  const picker = within(screen.getByRole('group', { name: 'Destination class' }));
  const review = screen.getByRole('button', { name: 'Review selected students (1)' });
  expect(review).toBeDisabled();
  fireEvent.change(picker.getByLabelText('Campus'), { target: { value: 'campus' } });
  expect(review).toBeDisabled();
  expect(picker.getByLabelText('Education Unit')).not.toHaveTextContent('Archived unit');
  fireEvent.change(picker.getByLabelText('Education Unit'), { target: { value: 'unit-b' } });
  expect(review).toBeDisabled();
  expect(picker.getByLabelText('Section')).not.toHaveTextContent('All of');
  expect(picker.getByLabelText('Section')).toHaveTextContent('Class B');
  fireEvent.change(picker.getByLabelText('Section'), { target: { value: 'b' } });
  expect(review).toBeEnabled();
  fireEvent.change(picker.getByLabelText('Education Unit'), { target: { value: 'unit-a' } });
  expect(review).toBeDisabled();
  expect(picker.getByLabelText('Section')).not.toHaveTextContent('Class B');
  fireEvent.change(picker.getByLabelText('Education Unit'), { target: { value: 'empty' } });
  expect(picker.queryByLabelText('Section')).not.toBeInTheDocument();
  expect(review).toBeDisabled();
  expect(screen.getAllByRole('checkbox')[0]).toBeChecked();
  expect(mocks.transfer).not.toHaveBeenCalled();
});
it('reviews a selected student and applies only after the Apply button is pressed', async () => {
  render(<StudentTransferWorkspace nodes={nodes} />);
  fireEvent.click((await screen.findAllByRole('checkbox', { name: 'Select Jane (00001)' }))[0]);
  chooseDestination();
  fireEvent.click(screen.getByRole('button', { name: 'Review selected students (1)' }));
  expect(screen.getByText('Review 1 assignment changes')).toBeInTheDocument();
  expect(mocks.transfer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Apply 1 transfers' }));
  await screen.findByText('1 student transferred.');
  expect(mocks.transfer).toHaveBeenCalledWith([{ uid: '1', student_id: '00001', source_node_id: 'a', destination_node_id: 'b' }]);
});
it('keeps the preview available when the server rejects a stale batch', async () => {
  mocks.transfer.mockRejectedValue(new Error('Student assignment changed.'));
  render(<StudentTransferWorkspace nodes={nodes} />);
  fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
  chooseDestination();
  fireEvent.click(screen.getByRole('button', { name: 'Review selected students (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply 1 transfers' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(classifyError(new Error('Student assignment changed.')).message));
  expect(screen.getByRole('button', { name: 'Apply 1 transfers' })).toBeEnabled();
});

it('imports a spreadsheet into a review without applying any changes', async () => {
  render(<StudentTransferWorkspace nodes={nodes} />);
  (await screen.findAllByRole('checkbox'))[0];
  fireEvent.click(screen.getByRole('button', { name: 'Use a spreadsheet' }));
  const file = new File(['student_id,source_node_id,destination_node_id\n00001,a,b'], 'transfers.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText('Import student transfers'), { target: { files: [file] } });
  await screen.findByText('Review 1 assignment changes');
  expect(mocks.transfer).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('explains the easy template and imports a readable destination class', async () => {
  render(<StudentTransferWorkspace nodes={nodes} />);
  await screen.findAllByRole('checkbox');
  fireEvent.click(screen.getByRole('button', { name: 'Use a spreadsheet' }));
  expect(screen.getByRole('button', { name: 'Download easy template' })).toBeInTheDocument();
  expect(screen.queryByText('Edit destination IDs only')).not.toBeInTheDocument();
  const file = new File(['Student name,Student ID,Current institutional unit,Current class,Move to class,Assignment reference\nJane,00001,Campus,Class A,Campus / Class B,a'], 'easy-transfers.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText('Import student transfers'), { target: { files: [file] } });
  await screen.findByText('Review 1 assignment changes');
  expect(mocks.transfer).not.toHaveBeenCalled();
});

it('retains selected students when search filters hide them', async () => {
  render(<StudentTransferWorkspace nodes={nodes} initialNodeId="a" />);
  fireEvent.click((await screen.findAllByRole('checkbox'))[0]);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Nobody' } });
  expect(screen.getAllByText('No students match these filters.').length).toBeGreaterThan(0);
  chooseDestination();
  fireEvent.click(screen.getByRole('button', { name: 'Review selected students (1)' }));
  expect(screen.getByText('Jane')).toBeInTheDocument();
  expect(mocks.transfer).not.toHaveBeenCalled();
});

it('lists empty classes through the same cascading picker used for enrollment', async () => {
  render(<StudentTransferWorkspace nodes={nodes} />);
  await screen.findAllByRole('checkbox');
  fireEvent.change(within(screen.getByRole('group', { name: 'Student filters' })).getByLabelText('Campus'), { target: { value: 'campus' } });
  const section = screen.getByLabelText('Section');
  expect(section).toHaveTextContent('Class A');
  expect(section).toHaveTextContent('Class B');
  fireEvent.change(section, { target: { value: 'b' } });
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  expect(screen.getAllByText('No students match these filters.').length).toBeGreaterThan(0);
});

it('filters by a parent unit, resets descendants when changing units, and can clear the path', async () => {
  const hierarchy: any = [{ id: 'campus', name: 'Campus', type: 'campus', children: [
    { id: 'unit-a', name: 'College', type: 'education_unit', children: [nodes[0].children[0]] },
    { id: 'unit-b', name: 'High School', type: 'education_unit', children: [nodes[0].children[1]] },
  ] }];
  render(<StudentTransferWorkspace nodes={hierarchy} initialNodeId="unit-b" />);
  await waitFor(() => expect(screen.queryByText('Loading students...')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Education Unit')).toHaveValue('unit-b');
  expect(screen.getByLabelText('Section')).toHaveTextContent('Class B');
  expect(screen.getByLabelText('Section')).not.toHaveTextContent('Class A');
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  expect(within(screen.getByRole('group', { name: 'Destination class' })).getByLabelText('Campus')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'b' } });
  fireEvent.change(screen.getByLabelText('Education Unit'), { target: { value: 'unit-a' } });
  expect(screen.getByLabelText('Section')).toHaveValue('unit-a');
  expect(screen.getByLabelText('Section')).toHaveTextContent('All of College');
  expect(screen.getByLabelText('Section')).toHaveTextContent('Class A');
  expect(screen.getByLabelText('Section')).not.toHaveTextContent('Class B');
  expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'All units in your scope' }));
  expect(screen.queryByLabelText('Education Unit')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Section')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Selected academic path')).not.toBeInTheDocument();
});
