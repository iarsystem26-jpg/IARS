import { useState, type FormEvent } from 'react';
import { useAuth } from '../AuthContext';
import { appData } from '../../lib/backend';
import { hasPermission } from '../../lib/accessControl';
import { eventRecipientRoots } from '../../lib/eventAudience';
import { flattenDirectory, findNodePath } from '../../lib/academicDirectory';
import { calendarDay, saveInformationalSchedule, type CalendarItem } from '../../lib/personalCalendar';
import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { Modal } from '../ui/Modal';
import Button from '../ui/Button';
import CustomSelect from '../ui/CustomSelect';

const localDate = (value: string) => new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16);
export default function InformationalScheduleForm({ item, onClose, onSaved }: { item?: CalendarItem; onClose: () => void; onSaved: () => void }) {
 const { profile } = useAuth();
 const schoolwide = profile?.role === 'admin' || hasPermission(profile?.role, 'calendar.manage_schoolwide');
 const structure = appData.getSchoolStructure();
 const roots = schoolwide ? structure : eventRecipientRoots(profile, structure);
 const [scope, setScope] = useState(item?.schedule?.scope_node_id || (schoolwide ? '' : roots[0]?.id || ''));
 const [title, setTitle] = useState(item?.title || ''), [description, setDescription] = useState(item?.description || ''), [venue, setVenue] = useState(item?.venue || '');
 const [start, setStart] = useState(item ? localDate(item.starts_at) : ''), [end, setEnd] = useState(item ? localDate(item.ends_at) : '');
 const [recipients, setRecipients] = useState<string[]>(item?.schedule?.recipients || []);
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 const recipientTypes = [{ value: 'All Students', label: 'All students (including student officers)' }, { value: 'All Mayors', label: 'Mayors only' }, { value: 'All SSG Officers', label: 'SSG officers only' }];
 const legacyRecipients = recipients.length > 0 && (recipients.length !== 1 || !recipientTypes.some(type => type.value === recipients[0]));
 const recipientType = legacyRecipients ? 'existing' : recipients[0] || '';
 const unitLabel = scope ? (findNodePath(roots, scope) || []).map(node => node.name).join(' / ') : 'Whole school';
 const valid = title.trim().length >= 3 && start && end > start && Date.parse(`${start}:00+08:00`) > Date.now() && recipients.length > 0 && (schoolwide || scope);
 const submit = async (event: FormEvent) => {
  event.preventDefault(); if (!valid || busy) return;
  setBusy(true); setError('');
  try {
   await saveInformationalSchedule({ title: title.trim(), description: description.trim(), venue: venue.trim(), starts_at: `${start}:00+08:00`, ends_at: `${end}:00+08:00`, scope_node_id: scope || null, recipients }, item?.id || null);
   onSaved();
  } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
 };
 return <Modal open onClose={() => { if (!busy) onClose(); }} title={item ? 'Edit informational schedule' : 'Add informational schedule'} description="Inform recipients of a school schedule. No attendance, sanctions, or credits apply." size="lg" footer={<><Button variant="secondary" fullWidth={false} disabled={busy} onClick={onClose}>Cancel</Button><Button form="informational-schedule-form" type="submit" fullWidth={false} disabled={!valid || busy}>{busy ? 'Saving…' : item ? 'Save & notify recipients' : 'Publish & notify recipients'}</Button></>}>
  <form id="informational-schedule-form" onSubmit={submit} className="space-y-5">
   {error && <ErrorNotice error={error} operation="Save informational schedule"/>}
   <fieldset disabled={busy} className="space-y-5">
    <label className="block text-sm font-semibold">Schedule title<input required minLength={3} maxLength={200} className="input-field mt-2 w-full" value={title} onChange={event => setTitle(event.target.value)}/></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Starts (Philippine time)<input required type="datetime-local" min={`${calendarDay()}T00:00`} className="input-field mt-2 w-full" value={start} onChange={event => setStart(event.target.value)}/></label><label className="block text-sm font-semibold">Ends (Philippine time)<input required type="datetime-local" min={start} className="input-field mt-2 w-full" value={end} onChange={event => setEnd(event.target.value)}/></label></div>
    <label className="block text-sm font-semibold">Details & instructions<textarea maxLength={5000} rows={4} className="input-field mt-2 w-full" value={description} onChange={event => setDescription(event.target.value)}/></label>
    <label className="block text-sm font-semibold">Venue (optional)<input maxLength={300} className="input-field mt-2 w-full" value={venue} onChange={event => setVenue(event.target.value)}/></label>
    <fieldset className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
     <legend className="px-1 text-sm font-semibold">Recipients</legend>
     <CustomSelect label="Recipients in" disabled={busy} searchable value={scope} options={[...(schoolwide ? [{ value: '', label: 'Whole school' }] : []), ...flattenDirectory(roots).filter(node => (findNodePath(roots,node.id) || [node]).every(parent => !parent.metadata?.archived && parent.metadata?.selectableForEvents !== false)).map(node => ({ value: node.id, label: (findNodePath(roots,node.id) || [node]).map(parent => parent.name).join(' / ') }))]} onChange={value => { setScope(String(value)); if (legacyRecipients) setRecipients([]); }}/>
     <CustomSelect label="Recipient type" disabled={busy} value={recipientType} placeholder="Choose who to inform" options={[...recipientTypes, ...(legacyRecipients ? [{ value: 'existing', label: 'Existing selected groups' }] : [])]} onChange={value => { if (value !== 'existing') setRecipients([String(value)]); }}/>
     <p className="text-sm text-slate-500">Both filters apply together. Only the selected recipient type within this unit and its sub-units will be informed.</p>
     {recipients.length > 0 && <p role="status" className="rounded-lg bg-brand-50 p-3 text-sm font-semibold text-brand-800 dark:bg-brand-900/30 dark:text-brand-200">{legacyRecipients ? `Existing groups: ${recipients.map(group => group.startsWith('node:') ? (findNodePath(structure,group.slice(5)) || []).map(node => node.name).join(' / ') || 'Unavailable unit' : group).join(', ')}` : `${recipientTypes.find(type => type.value === recipientType)?.label} in ${unitLabel || 'your assigned unit'}`}</p>}
    </fieldset>
   </fieldset>
  </form>
 </Modal>;
}
