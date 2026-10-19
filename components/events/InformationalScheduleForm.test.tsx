import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import InformationalScheduleForm from './InformationalScheduleForm';
import { saveInformationalSchedule } from '../../lib/personalCalendar';
const state = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ profile: { role: state.role, official_data: { assignment_node_id: 'unit' } } }) }));
vi.mock('../../lib/backend', () => ({ appData: { getSchoolStructure: () => [{ id: 'unit', name: 'College', type: 'department', children: [] }] } }));
vi.mock('../../lib/accessControl', () => ({ hasPermission: () => false }));
vi.mock('../../lib/personalCalendar', () => ({ calendarDay: () => '2099-01-01', saveInformationalSchedule: vi.fn() }));
vi.mock('../ui/CustomSelect', () => ({ default: ({ label, options, value, onChange, disabled }: any) => <label>{label}<select disabled={disabled} value={value} onChange={event => onChange(event.target.value)}><option value="">Choose</option>{options.map((option: any) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }));
afterEach(cleanup);
beforeEach(() => { vi.mocked(saveInformationalSchedule).mockReset(); state.role = 'admin'; });
function fill() {
 fireEvent.change(screen.getByLabelText('Schedule title'), { target: { value: 'Exam preparations' } });
 fireEvent.change(screen.getByLabelText('Starts (Philippine time)'), { target: { value: '2099-01-02T08:00' } });
 fireEvent.change(screen.getByLabelText('Ends (Philippine time)'), { target: { value: '2099-01-02T09:00' } });
 fireEvent.change(screen.getByLabelText('Recipient type'), { target: { value: 'All Students' } });
}
it('publishes schoolwide notices with Philippine timestamps and no attendance configuration', async () => {
 const saved = vi.fn(); vi.mocked(saveInformationalSchedule).mockResolvedValue('notice');
 render(<InformationalScheduleForm onClose={vi.fn()} onSaved={saved}/>); fill();
 expect(screen.queryByText('Attendance windows')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button', { name: 'Publish & notify recipients' }));
 await waitFor(() => expect(saved).toHaveBeenCalledOnce());
 expect(saveInformationalSchedule).toHaveBeenCalledWith({ title: 'Exam preparations', description: '', venue: '', starts_at: '2099-01-02T08:00:00+08:00', ends_at: '2099-01-02T09:00:00+08:00', scope_node_id: null, recipients: ['All Students'] },null);
});
it('uses the assigned unit for scoped officers and preserves the form after a save failure', async () => {
 state.role = 'ssg'; vi.mocked(saveInformationalSchedule).mockRejectedValue(new Error('Schedule could not be saved'));
 const saved = vi.fn(); render(<InformationalScheduleForm onClose={vi.fn()} onSaved={saved}/>); fill();
 fireEvent.click(screen.getByRole('button', { name: 'Publish & notify recipients' }));
 await screen.findByRole('alert');
 expect(saveInformationalSchedule).toHaveBeenCalledWith(expect.objectContaining({ scope_node_id: 'unit' }),null);
 expect(screen.getByLabelText('Schedule title')).toHaveValue('Exam preparations');
 expect(saved).not.toHaveBeenCalled();
});
it('requires added recipients and an end after the start', () => {
 render(<InformationalScheduleForm onClose={vi.fn()} onSaved={vi.fn()}/>);
 expect(screen.getByRole('button', { name: 'Publish & notify recipients' })).toBeDisabled();
 fill(); fireEvent.change(screen.getByLabelText('Ends (Philippine time)'), { target: { value: '2099-01-02T07:00' } });
 expect(screen.getByRole('button', { name: 'Publish & notify recipients' })).toBeDisabled();
});
it('combines College and Mayors as an intersection and keeps the type when the unit changes', async () => {
 vi.mocked(saveInformationalSchedule).mockResolvedValue('notice');
 const saved = vi.fn(); render(<InformationalScheduleForm onClose={vi.fn()} onSaved={saved}/>); fill();
 expect(screen.queryByLabelText('School unit')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Recipient type'), { target: { value: 'All Mayors' } });
 fireEvent.change(screen.getByLabelText('Recipients in'), { target: { value: 'unit' } });
 expect(screen.getByRole('status')).toHaveTextContent('Mayors only in College');
 expect(screen.getByLabelText('Recipient type')).toHaveValue('All Mayors');
 fireEvent.click(screen.getByRole('button', { name: 'Publish & notify recipients' }));
 await waitFor(() => expect(saved).toHaveBeenCalledOnce());
 expect(saveInformationalSchedule).toHaveBeenCalledWith(expect.objectContaining({ scope_node_id: 'unit', recipients: ['All Mayors'] }),null);
});
