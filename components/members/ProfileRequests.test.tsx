import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProfileRequests from './ProfileRequests';
const state = vi.hoisted(() => ({ profile: { uid: 'student', role: 'student', name: 'Jane', student_id: '2026-00001A', phone: '0917', guardian: { name: 'Guardian', contact: '0918' } }, requester: null as any, lookup: vi.fn(), load: vi.fn(), submit: vi.fn(), review: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: state.profile }) }));
vi.mock('../../lib/profileRequests', async importOriginal => ({ ...await importOriginal<any>(), loadProfileRequests: state.load, submitProfileRequest: state.submit, reviewProfileRequest: state.review }));
vi.mock('../../lib/backend', () => ({ refreshData: vi.fn(), documentUrl: vi.fn(async (src: string) => src), appData: { getSchoolStructure: () => [{ id: 'campus', name: 'Main Campus', type: 'campus', children: [{ id: 'program', name: 'Psychology', type: 'program', children: [{ id: 'year', name: '2nd Year', type: 'year_level', children: [{ id: 'class-a', name: 'Class A', type: 'section', children: [] }, { id: 'class-b', name: 'Class B', type: 'section', children: [] }, { id: 'archived', name: 'Archived class', type: 'section', metadata: { archived: true }, children: [] }] }] }] }], getUserDetail: (uid: string) => { state.lookup(uid); return state.requester ? { profile: state.requester } : null; } } }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn() } }));
const pending = { id: 'request', student_id: 'student', student_name: 'Jane', student_number: '26-0001-001', kind: 'edit', changes: { phone: '0999' }, original: { phone: '0917' }, reason: 'Correct my phone number', status: 'pending', created_at: '2026-10-09T01:00:00Z', review_note: '' };
it('limits detail history to one student and provides no review actions', async () => {
 state.profile.role = 'admin';
 state.load.mockResolvedValue([pending, { ...pending, id: 'other-request', student_id: 'other', student_name: 'Other Student' }]);
 render(<ProfileRequests review studentUid="student" />);
 fireEvent.click(await screen.findByRole('button', { name: /Update mobile contact.*Jane/ }));
 expect(state.load).toHaveBeenCalledWith('student');
 expect(screen.queryByText(/Other Student/)).not.toBeInTheDocument();
 expect(screen.queryByRole('button', { name: /Approve|Reject/ })).not.toBeInTheDocument();
 expect(screen.queryByLabelText('Decision note (sent to student)')).not.toBeInTheDocument();
 expect(screen.getByRole('dialog', { name: 'Information request details' })).toBeInTheDocument();
});
beforeEach(() => { state.profile.role = 'student'; state.requester = null; state.load.mockResolvedValue([]); state.submit.mockResolvedValue(undefined); state.review.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('submits only changed values for approval', async () => {
 render(<ProfileRequests />);
 await waitFor(() => expect(screen.getByRole('button', { name: 'Request information change' })).toBeEnabled());
 fireEvent.click(screen.getByRole('button', { name: 'Request information change' }));
 const dialog = within(screen.getByRole('dialog'));
 fireEvent.change(dialog.getByLabelText('Mobile contact'), { target: { value: '0999' } });
 fireEvent.change(dialog.getByLabelText('Reason for request'), { target: { value: 'Correct my phone number' } });
 fireEvent.click(dialog.getByRole('button', { name: 'Submit request' }));
 await waitFor(() => expect(state.submit).toHaveBeenCalledWith('edit', { phone: '0999' }, 'Correct my phone number'));
 expect(state.review).not.toHaveBeenCalled();
});
it('deletes only selected optional information and explains retention', async () => {
 render(<ProfileRequests />);
 await waitFor(() => expect(screen.getByRole('button', { name: 'Request information deletion' })).toBeEnabled());
 fireEvent.click(screen.getByRole('button', { name: 'Request information deletion' }));
 const dialog = within(screen.getByRole('dialog'));
 expect(dialog.getByText(/Your account and school records will be retained/)).toBeVisible();
 expect(dialog.queryByLabelText('Full name')).not.toBeInTheDocument();
 fireEvent.click(dialog.getByRole('checkbox', { name: 'Mobile contact' }));
 fireEvent.change(dialog.getByLabelText('Reason for request'), { target: { value: 'Remove my old contact number' } });
 fireEvent.click(dialog.getByRole('button', { name: 'Submit request' }));
 await waitFor(() => expect(state.submit).toHaveBeenCalledWith('deletion', { phone: '' }, 'Remove my old contact number'));
});
it('blocks duplicate pending requests', async () => {
 state.load.mockResolvedValue([pending]); render(<ProfileRequests />);
 await screen.findByText(/You have a pending request/);
 expect(screen.getByRole('button', { name: 'Request information change' })).toBeDisabled();
 expect(screen.getByRole('button', { name: 'Request transfer' })).toBeDisabled();
});
it.each(['approved', 'rejected'])('requires a review note before %s', async decision => {
 state.profile.role = 'ossa'; state.load.mockResolvedValue([pending]); render(<ProfileRequests review />);
 fireEvent.click(await screen.findByRole('button', { name: 'Update mobile contact — Jane' }));
 const dialog = within(screen.getByRole('dialog'));
 expect(dialog.getByRole('button', { name: 'Approve all pending (1)' })).toBeDisabled();
 fireEvent.change(dialog.getByLabelText('Decision note (sent to student)'), { target: { value: 'Verified the submitted information' } });
 fireEvent.click(dialog.getByRole('button', { name: decision === 'approved' ? 'Approve all pending (1)' : 'Reject all pending (1)' }));
 await waitFor(() => expect(state.review).toHaveBeenCalledWith('request', decision, 'Verified the submitted information', undefined));
});
it('keeps the review dialog and displays a failed approval', async () => {
 state.profile.role = 'admin'; state.load.mockResolvedValue([pending]); state.review.mockRejectedValue({ message: 'Student information changed after submission.' });
 render(<ProfileRequests review />); fireEvent.click(await screen.findByRole('button', { name: 'Update mobile contact — Jane' }));
 fireEvent.change(screen.getByLabelText('Decision note (sent to student)'), { target: { value: 'Verified correction' } });
 fireEvent.click(screen.getByRole('button', { name: 'Approve all pending (1)' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('SYS-001');
 expect(screen.getByRole('dialog')).toBeVisible();
});

it('shows brief titles in a paginated table and opens the full comparison in a modal', async () => {
 state.profile.role = 'ossa'; state.load.mockResolvedValue(Array.from({length: 12}, (_, i) => ({...pending, id: `r${i}`, student_name: `Student ${i}`})));
 render(<ProfileRequests review />);
 await screen.findByRole('button', { name: 'Update mobile contact — Student 0' });
 const table = within(screen.getByRole('table', {name: 'Information request table'}));
 expect(table.getAllByRole('button')).toHaveLength(10);
 expect(table.queryByText('0917')).not.toBeInTheDocument();
 expect(table.queryByText(pending.reason)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button', {name: 'Next page'}));
 expect(table.getAllByRole('button')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button', {name: 'Update mobile contact — Student 10'}));
 const dialog = within(screen.getByRole('dialog'));
 expect(dialog.getByText('0917')).toBeVisible(); expect(dialog.getByText('0999')).toBeVisible();
 expect(dialog.getByText(pending.reason)).toBeVisible();
 expect(document.querySelector('select')).toBeNull();
});

it('approves one field, keeps the modal open, and allows rejection of the other field', async () => {
 state.profile.role = 'ossa';
 let request: any = {...pending, changes: {phone: '0999', guardianName: 'Correct Guardian'}, original: {phone: '0917', guardianName: 'Guardian'}, field_decisions: {}};
 state.load.mockImplementation(async () => [request]);
 state.review.mockImplementation(async (_id, decision, note, fields) => {
  const decisions = {...request.field_decisions};
  for (const field of fields || Object.keys(request.changes).filter(key => !decisions[key])) decisions[field] = {status: decision, note, reviewer_name: 'OSSA', reviewed_at: '2026-10-09T02:00:00Z'};
  request = {...request, field_decisions: decisions, status: Object.keys(decisions).length === 2 ? 'partially_approved' : 'pending'};
 });
 render(<ProfileRequests review />); fireEvent.click(await screen.findByRole('button', {name: 'Update 2 information fields — Jane'}));
 fireEvent.change(screen.getByLabelText('Decision note (sent to student)'), {target: {value: 'Verified phone correction'}});
 fireEvent.click(screen.getByRole('button', {name: 'Approve Mobile contact'}));
 await waitFor(() => expect(screen.queryByRole('button', {name: 'Approve Mobile contact'})).not.toBeInTheDocument());
 expect(state.review).toHaveBeenCalledWith('request', 'approved', 'Verified phone correction', ['phone']);
 expect(screen.getByRole('dialog')).toBeVisible();
 expect(screen.getByRole('button', {name: 'Approve all pending (1)'})).toBeEnabled();
 fireEvent.change(screen.getByLabelText('Decision note (sent to student)'), {target: {value: 'Guardian correction unverified'}});
 fireEvent.click(screen.getByRole('button', {name: 'Reject Guardian name'}));
 await within(screen.getByRole('dialog')).findByText('Partially approved');
 const statistics = within(screen.getByLabelText('Request statistics'));
 expect(statistics.getByText('Partially approved').parentElement).toHaveTextContent('1');
 expect(statistics.getByText('Pending').parentElement).toHaveTextContent('0');
 expect(state.review).toHaveBeenLastCalledWith('request','rejected','Guardian correction unverified',['guardianName']);
 expect(screen.queryByRole('button', {name: /all pending/})).not.toBeInTheDocument();
});

it('uses the custom dropdown to filter completed requests', async () => {
 state.profile.role = 'ossa'; state.load.mockResolvedValue([{...pending, status: 'approved'}]); render(<ProfileRequests review />);
 await screen.findByText('No pending requests.');
 fireEvent.click(screen.getByRole('button', {name: 'Request status'}));
 fireEvent.click(await screen.findByRole('option', {name: 'Approved'}));
 expect(await screen.findByRole('button', {name: 'Update mobile contact — Jane'})).toBeVisible();
});

it('shows the requesting student profile rather than the reviewing officer', async () => {
 state.profile.role = 'ossa';
 state.requester = { uid: 'requesting-student', name: 'Alex Student', student_id: '2026-0042', photo_url: '/student-photo.png', school_data: { department: 'College', section: 'BSIT 2A' } };
 state.load.mockResolvedValue([{ ...pending, student_id: 'requesting-student', student_name: 'Alex Student', student_number: '2026-0042' }]);
 render(<ProfileRequests review />);
 fireEvent.click(await screen.findByRole('button', { name: /Update mobile contact.*Alex Student/ }));
 const card = within(screen.getByRole('region', { name: 'Requester profile' }));
 expect(state.lookup).toHaveBeenCalledWith('requesting-student');
 expect(card.getByText('Requested by')).toBeVisible();
 expect(card.getByText('Alex Student')).toBeVisible();
 expect(card.getByText('Student ID: 2026-0042')).toBeVisible();
 expect(card.getByText('College · BSIT 2A')).toBeVisible();
 await waitFor(() => expect(card.getByRole('img', { name: "Alex Student's profile photo" })).toHaveAttribute('src', '/student-photo.png'));
 expect(card.queryByText('Jane')).not.toBeInTheDocument();
});

it('keeps requester identity visible when their current profile is unavailable', async () => {
 state.profile.role = 'admin'; state.load.mockResolvedValue([{ ...pending, student_id: 'unavailable-student' }]);
 render(<ProfileRequests review />);
 fireEvent.click(await screen.findByRole('button', { name: /Update mobile contact.*Jane/ }));
 const card = within(screen.getByRole('region', { name: 'Requester profile' }));
 expect(card.getByText('Jane')).toBeVisible();
 expect(card.getByText('Student ID: 26-0001-001')).toBeVisible();
 expect(card.getByRole('img')).toHaveAttribute('src', '/iars-icon.png');
});


it('submits a transfer destination for review without directly changing the student', async () => {
 render(<ProfileRequests />);
 await waitFor(() => expect(screen.getByRole('button', {name: 'Request transfer'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button', {name: 'Request transfer'}));
 const dialog = within(screen.getByRole('dialog'));
 expect(dialog.getByRole('button', {name: 'Submit request'})).toBeDisabled();
 const choose = async (label: RegExp, option: string) => {
  fireEvent.click(dialog.getByRole('button', {name: label}));
  fireEvent.click(await screen.findByRole('option', {name: option}));
 };
 fireEvent.change(dialog.getByLabelText('Reason for request'), {target: {value: 'My enrollment belongs in Class B'}});
 await choose(/Campus/, 'Main Campus');
 await choose(/Degree Program/, 'Psychology');
 await choose(/Year Level/, '2nd Year');
 expect(dialog.getByRole('button', {name: 'Submit request'})).toBeDisabled();
 fireEvent.click(dialog.getByRole('button', {name: /Section/}));
 expect(screen.queryByRole('option', {name: 'Archived class'})).not.toBeInTheDocument();
 fireEvent.click(await screen.findByRole('option', {name: 'Class B'}));
 expect(dialog.getByRole('button', {name: 'Submit request'})).toBeEnabled();
 // Changing an ancestor clears the previously chosen class.
 await choose(/Year Level/, '2nd Year');
 expect(dialog.getByRole('button', {name: 'Submit request'})).toBeDisabled();
 await choose(/Section/, 'Class B');
 fireEvent.click(dialog.getByRole('button', {name: 'Submit request'}));
 await waitFor(() => expect(state.submit).toHaveBeenCalledWith('transfer', {node_id: 'class-b'}, 'My enrollment belongs in Class B'));
 expect(state.review).not.toHaveBeenCalled();
});

it('shows current and requested classes and reviews a transfer in the request queue', async () => {
 state.profile.role = 'ossa';
 state.load.mockResolvedValue([{...pending, kind: 'transfer', changes: {node_id: 'class-b'}, original: {node_id: 'class-a'}}]);
 render(<ProfileRequests review />);
 fireEvent.click(await screen.findByRole('button', {name: /Transfer academic assignment.*Jane/}));
 const dialog = within(screen.getByRole('dialog'));
 expect(dialog.getByText('Main Campus / Psychology / 2nd Year / Class A')).toBeVisible();
 expect(dialog.getByText('Main Campus / Psychology / 2nd Year / Class B')).toBeVisible();
 fireEvent.change(dialog.getByLabelText('Decision note (sent to student)'), {target: {value: 'Verified enrollment'}});
 fireEvent.click(dialog.getByRole('button', {name: 'Approve Academic assignment'}));
 await waitFor(() => expect(state.review).toHaveBeenCalledWith('request', 'approved', 'Verified enrollment', ['node_id']));
});
