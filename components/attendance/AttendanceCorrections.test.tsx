import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AttendanceCorrections from './AttendanceCorrections';
import { changeField } from '../../tests/ui-select';
import type { AttendanceCorrection, CorrectionOption } from '../../lib/attendanceCorrections';
const mocks = vi.hoisted(() => ({ profile: { uid: 'student-1', role: 'student' }, history: vi.fn(), options: vi.fn(), submit: vi.fn(), review: vi.fn(), upload: vi.fn(), preview: vi.fn() }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: mocks.profile }) }));
vi.mock('../../lib/accessControl', () => ({ hasPermission: () => true }));
vi.mock('../../lib/backend', () => ({ uploadDocument: mocks.upload, documentUrl: vi.fn(), refreshData: vi.fn() }));
vi.mock('../../lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../lib/attendanceCorrections', async importOriginal => ({
 ...(await importOriginal<typeof import('../../lib/attendanceCorrections')>()),
 loadAttendanceCorrections: mocks.history, loadCorrectionOptions: mocks.options,
 submitAttendanceCorrection: mocks.submit, reviewAttendanceCorrection: mocks.review, previewCorrectionCredit: mocks.preview,
}));
const option: CorrectionOption = { event_id: 'event-1', event_title: 'Assembly', slot: 'default', label: 'Default session', original: null,
 starts_at: '2026-10-08T00:00:00Z', ends_at: '2026-10-08T02:00:00Z', late_at: '2026-10-08T00:15:00Z' };
const request: AttendanceCorrection = { id: 'request-1', student_id: 'student-1', student_name: 'Demo Student', student_number: '123',
 event_id: 'event-1', event_title: 'Assembly', slot: 'default', reason: 'My scanner did not record my attendance.', proof_url: null,
 original: { status: 'absent', scanned_by_name: 'Original recorder' }, corrected: null,
 proposed_time_in: '2026-10-08T00:05:00Z', proposed_time_out: null,
 session_starts_at: option.starts_at, session_ends_at: option.ends_at, session_late_at: option.late_at,
 status: 'pending', created_at: '2026-10-09T00:00:00Z', reviewed_at: null, reviewer_name: null, review_note: '', sanction_change: 0 };
afterEach(cleanup);
function setTime(label: string, hour: string, minute: string, period = 'AM') {
 fireEvent.change(screen.getByLabelText(`${label} hour`), { target: { value: hour } });
 fireEvent.change(screen.getByLabelText(`${label} minute`), { target: { value: minute } });
 fireEvent.change(screen.getByLabelText(`${label} AM/PM`), { target: { value: period } });
}
beforeEach(() => {
 vi.clearAllMocks(); mocks.profile = { uid: 'student-1', role: 'student' };
 mocks.history.mockResolvedValue([]); mocks.options.mockResolvedValue([option]);
 mocks.submit.mockResolvedValue('request-1'); mocks.review.mockResolvedValue(undefined);
});
it('submits a missing attendance request with optional evidence and claimed Manila times', async () => {
 render(<AttendanceCorrections />);
 const open = await screen.findByRole('button', { name: /Report a problem \/ missing record/ });
 await waitFor(() => expect(open).not.toBeDisabled()); fireEvent.click(open);
 changeField('Activity and session', JSON.stringify(['event-1', 'default']));
 setTime('Requested time-in', '8', '05');
 fireEvent.change(screen.getByLabelText('Explain the recording mistake'), { target: { value: 'The scanner did not save my attendance.' } });
 fireEvent.click(screen.getByRole('button', { name: 'Submit for OSSA review' }));
 await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith(option, 'The scanner did not save my attendance.', '2026-10-08T08:05', '', undefined));
 expect(mocks.upload).not.toHaveBeenCalled();
});
it('shows a failed submission in the dialog without clearing the student explanation', async () => {
 mocks.submit.mockRejectedValue(new Error('This session is unavailable or already has a pending correction. Refresh or contact OSSA.'));
 render(<AttendanceCorrections target={{ eventId: 'event-1', slot: 'default' }} />);
 const reason = await screen.findByLabelText('Explain the recording mistake');
 setTime('Requested time-in', '8', '05');
 fireEvent.change(reason, { target: { value: 'An attendance mistake needs review.' } });
 fireEvent.click(screen.getByRole('button', { name: 'Submit for OSSA review' }));
 await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('already has a pending correction'));
 expect(reason).toHaveValue('An attendance mistake needs review.');
});
it('requires reviewer notes, previews derived status and rejects invalid verified times', async () => {
 mocks.profile = { uid: 'reviewer-1', role: 'ossa' }; mocks.history.mockResolvedValue([request]);
 render(<AttendanceCorrections review />);
 fireEvent.click(await screen.findByRole('button', { name: 'Assembly / default - Demo Student' }));
 expect(screen.getByText('Original recorder')).toBeInTheDocument();
 const approve = screen.getByRole('button', { name: 'Approve correction' });
 expect(approve).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Decision notes'), { target: { value: 'Officer verified the missed scan.' } });
 expect(approve).not.toBeDisabled();
 setTime('Verified time-in', '7', '00');
 expect(approve).toBeDisabled();
 setTime('Verified time-in', '8', '16');
 expect(screen.getByText('Status: late')).toBeInTheDocument();
 fireEvent.click(approve);
 await waitFor(() => expect(mocks.review).toHaveBeenCalledWith('request-1', 'approved', 'Officer verified the missed scan.', '2026-10-08T08:16', ''));
 expect(mocks.options).not.toHaveBeenCalled();
});
it('shows a before/after preview and requires an explicit absence choice when no arrival is entered', async () => {
 mocks.options.mockResolvedValue([{ ...option, original: { status: 'absent', scanned_by_name: 'System' } }]);
 render(<AttendanceCorrections target={{ eventId: 'event-1', slot: 'default' }} />);
 await screen.findByLabelText('Explain the recording mistake');
 expect(screen.getByRole('region', { name: 'Attendance change preview' })).toHaveTextContent('Current record');
 expect(screen.getByRole('region', { name: 'Attendance change preview' })).toHaveTextContent('Arrival time needed');
 fireEvent.change(screen.getByLabelText('Explain the recording mistake'), { target: { value: 'This entry should be reviewed by OSSA.' } });
 expect(screen.getByRole('button', { name: 'Submit for OSSA review' })).toBeDisabled();
 setTime('Requested time-in', '8', '05');
 expect(screen.getByRole('region', { name: 'Requested change' })).toHaveTextContent('present');
 changeField('Attendance outcome', 'absent');
 expect(screen.queryByLabelText('Requested time-in hour')).not.toBeInTheDocument();
 expect(screen.getByRole('region', { name: 'Requested change' })).toHaveTextContent('absent');
 expect(screen.getByRole('button', { name: 'Submit for OSSA review' })).not.toBeDisabled();
});
it('hides unusable fields and explains next steps when no sessions are eligible', async () => {
 mocks.options.mockResolvedValue([]);
 render(<AttendanceCorrections />);
 const open = await screen.findByRole('button', { name: /Report a problem \/ missing record/ });
 await waitFor(() => expect(open).not.toBeDisabled()); fireEvent.click(open);
 expect(screen.getByText('No sessions available for correction')).toBeInTheDocument();
 expect(screen.getByText('What you can do next')).toBeInTheDocument();
 expect(screen.queryByLabelText('Requested time-in hour')).not.toBeInTheDocument();
 expect(screen.queryByLabelText('Explain the recording mistake')).not.toBeInTheDocument();
 expect(screen.queryByRole('button', { name: 'Submit for OSSA review' })).not.toBeInTheDocument();
});
it('shows the chosen file and supports removing it before submission', async () => {
 render(<AttendanceCorrections target={{ eventId: 'event-1', slot: 'default' }} />);
 await screen.findByLabelText('Supporting evidence');
 fireEvent.change(screen.getByLabelText('Supporting evidence'), { target: { files: [new File(['proof'], 'scan-proof.pdf', { type: 'application/pdf' })] } });
 expect(screen.getByText('scan-proof.pdf')).toBeInTheDocument();
 expect(screen.getByText(/Ready to attach/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button', { name: 'Remove supporting evidence' }));
 expect(screen.queryByText('scan-proof.pdf')).not.toBeInTheDocument();
 expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
});
it('shows completed decisions in student history by default', async () => {
 mocks.history.mockResolvedValue([{ ...request, status: 'approved', corrected: { status: 'present' }, reviewer_name: 'OSSA reviewer', review_note: 'Verified with the officer.', reviewed_at: '2026-10-09T01:00:00Z', sanction_change: -2 }]);
 render(<AttendanceCorrections />);
 fireEvent.click(await screen.findByRole('button', { name: 'Assembly / default' }));
 expect(screen.getByText('Approved corrected recording')).toBeInTheDocument();
 expect(screen.getByText('OSSA reviewer')).toBeInTheDocument();
 expect(screen.getByText('-2.00 hours')).toBeInTheDocument();
 expect(screen.queryByRole('button', { name: 'Approve correction' })).not.toBeInTheDocument();
});

const plan = { kind: 'service' as const, rendered_before: 2, rendered_after: 1, cleared_before: 1, cleared_after: 1,
 merit_before: 1, merit_after: 0, sanction_change: 0, merit_change: -1, balance_before: 3, balance_after: 3, complete: true };
it('requires the server credit preview and passes it unchanged when approving service corrections', async () => {
 mocks.profile = { uid: 'reviewer-1', role: 'ossa' };
 mocks.history.mockResolvedValue([{ ...request, kind: 'service', proposed_time_out: '2026-10-08T01:05:00Z' }]);
 let resolvePreview!: (value: typeof plan) => void;
 mocks.preview.mockReturnValue(new Promise(resolve => { resolvePreview = resolve; }));
 render(<AttendanceCorrections review />);
 fireEvent.click(await screen.findByRole('button', { name: 'Assembly / default - Demo Student' }));
 fireEvent.change(screen.getByLabelText('Decision notes'), { target: { value: 'Officer verified the service hours.' } });
 const approve = screen.getByRole('button', { name: 'Approve correction' });
 expect(approve).toBeDisabled();
 await waitFor(() => expect(mocks.preview).toHaveBeenCalled());
 await act(async () => resolvePreview(plan));
 expect(await screen.findByRole('region', { name: 'Credit change preview' })).toHaveTextContent('1.00 → 0.00 hours');
 await waitFor(() => expect(approve).not.toBeDisabled());
 fireEvent.click(approve);
 await waitFor(() => expect(mocks.review).toHaveBeenCalledWith('request-1', 'approved', 'Officer verified the service hours.', '2026-10-08T08:05:00', '2026-10-08T09:05:00', plan));
});
it('blocks approval when the credit preview fails while allowing rejection with notes', async () => {
 mocks.profile = { uid: 'reviewer-1', role: 'ossa' };
 mocks.history.mockResolvedValue([{ ...request, kind: 'merit' }]);
 mocks.preview.mockRejectedValue(new Error('Attendance or credits changed after submission. Reject and resubmit against the latest records.'));
 render(<AttendanceCorrections review />);
 fireEvent.click(await screen.findByRole('button', { name: 'Assembly / default - Demo Student' }));
 fireEvent.change(screen.getByLabelText('Decision notes'), { target: { value: 'Please resubmit against the latest records.' } });
 await screen.findByText('Attendance or credits changed after submission. Reject and resubmit against the latest records.');
 expect(screen.getByRole('button', { name: 'Approve correction' })).toBeDisabled();
 fireEvent.click(screen.getByRole('button', { name: 'Reject correction' }));
 await waitFor(() => expect(mocks.review).toHaveBeenCalledWith('request-1', 'rejected', 'Please resubmit against the latest records.', '2026-10-08T08:05:00', ''));
});
it('invalidates the credit preview as soon as verified times change', async () => {
 mocks.profile = { uid: 'reviewer-1', role: 'ossa' };
 mocks.history.mockResolvedValue([{ ...request, kind: 'service' }]);
 mocks.preview.mockResolvedValue(plan);
 render(<AttendanceCorrections review />);
 fireEvent.click(await screen.findByRole('button', { name: 'Assembly / default - Demo Student' }));
 fireEvent.change(screen.getByLabelText('Decision notes'), { target: { value: 'Officer verified the service hours.' } });
 await screen.findByRole('region', { name: 'Credit change preview' });
 const approve = screen.getByRole('button', { name: 'Approve correction' });
 await waitFor(() => expect(approve).not.toBeDisabled());
 mocks.preview.mockImplementation(() => new Promise(() => {}));
 setTime('Verified time-in', '8', '10');
 expect(approve).toBeDisabled();
 expect(screen.queryByRole('region', { name: 'Credit change preview' })).not.toBeInTheDocument();
});
