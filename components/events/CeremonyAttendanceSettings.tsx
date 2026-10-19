import ErrorNotice from '../ui/ErrorNotice';
import { TimeInput } from '../ui/TimeInput';
import { useState } from 'react';
import { CeremonyExemptionFilters } from './CeremonyExemptionFilters';
import { SearchSuggest } from '../ui/SearchSuggest';
import { AppEvent, EventAttendanceWindow, SchoolNode, UserProfile } from '../../types';
import { findNodePath, flattenDirectory } from '../../lib/academicDirectory';
import { recipientGroupLabel } from '../../lib/eventAudience';
import Button from '../ui/Button';
import { Surface } from '../ui/Page';

type Settings = NonNullable<AppEvent['ceremony']>;
function VolunteerMeritDuration({ value, onChange }: { value: number; onChange: (hours: number) => void }) {
  const [hours, setHours] = useState(String(Math.floor(value)));
  // Preserve existing decimal-hour awards, including fractional minutes.
  const [minutes, setMinutes] = useState(String(Math.round((value - Math.floor(value)) * 60 * 1000000) / 1000000));
  const valid = (h: string, m: string) => h !== '' && m !== '' && Number.isInteger(Number(h)) && Number(h) >= 0
    && Number.isFinite(Number(m)) && Number(m) >= 0 && Number(m) < 60 && Number(h) + Number(m) / 60 >= 0.01 && Number(h) + Number(m) / 60 <= 24;
  const update = (h: string, m: string) => {
    setHours(h); setMinutes(m);
    onChange(valid(h, m) ? Number(h) + Number(m) / 60 : 0);
  };
  return <fieldset className="min-w-0 space-y-3">
    <legend className="font-bold">Volunteer merit duration</legend>
    <div className="grid grid-cols-2 gap-4">
      <label className="app-field-label">Hours<input aria-label="Volunteer merit hours" type="number" min="0" max="24" step="1" required className="input-field mt-2" value={hours} onChange={e => update(e.target.value, minutes)} /></label>
      <label className="app-field-label">Minutes<input aria-label="Volunteer merit minutes" type="number" min="0" max="59.999999" step="any" required className="input-field mt-2" value={minutes} onChange={e => update(hours, e.target.value)} /></label>
    </div>
    <p className="text-sm text-slate-500">For 30 minutes, enter 0 hours and 30 minutes. Maximum total: 24 hours.</p>
    {!valid(hours, minutes) && <ErrorNotice error="Enter whole hours and minutes from 0 to less than 60, with a total of at least 0.6 minutes and no more than 24 hours." />}
    <p className="text-sm text-slate-500">Deducted from outstanding sanction hours once per ceremony after scan-in and scan-out. No negative balance. Exempt students do not earn volunteer merit.</p>
  </fieldset>;
}

export function CeremonyAttendanceSettings({ value, onChange, roots, students, dates = [], editing = false, canFilter = false, defaultWindows = [] }: { defaultWindows?: EventAttendanceWindow[]; dates?: string[]; editing?: boolean; canFilter?: boolean; value: Settings; onChange: (value: Settings) => void; roots: SchoolNode[]; students: UserProfile[] }) {
  const classes = flattenDirectory(roots).filter(n => ['section', 'block'].includes(n.type) && !(findNodePath(roots,n.id) || []).some(parent => parent.metadata?.archived));
  const studentDetail = (person: UserProfile) => {
    const classId = person.school_data?.academic_assignment?.terminalGroupId;
    return [person.student_id, classId ? recipientGroupLabel(`node:${classId}`, roots) : person.school_data?.section].filter(Boolean).join(' / ');
  };
  return <Surface className="space-y-5 p-4 sm:p-6">
    <h2 className="text-lg font-bold">Ceremony attendance rules</h2>
    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={value.allowVolunteerMerit} onChange={e => onChange({ ...value, allowVolunteerMerit: e.target.checked })} />Award merit to non-recipients who attend</label>
    <p className="text-sm text-slate-500">Non-recipients may attend voluntarily without late or absence sanctions. Enable this option to award merit after they scan in and out.</p>
    {value.allowVolunteerMerit && <VolunteerMeritDuration value={value.volunteerMeritHours} onChange={volunteerMeritHours => onChange({ ...value, volunteerMeritHours })} />}
    {canFilter && <CeremonyExemptionFilters value={value} onChange={onChange} roots={roots} students={students} dates={dates} editing={editing} />}
    <fieldset className="min-w-0 space-y-3"><legend className="font-bold">{editing ? "Exempt students" : "Exempt students from all selected dates"}</legend><p className="text-sm text-slate-500">Exempt students are not required to attend and receive no absence or late sanctions for this ceremony. Only students within your assignment are listed.</p>
      <SearchSuggest label="Search students for exemption" placeholder="Search name, student ID, or class" options={students.filter(p => !value.exemptStudentIds.includes(p.uid)).map(p => ({id:p.uid,label:p.name,detail:studentDetail(p),keywords:p.student_id}))} onSelect={id => onChange({...value,exemptStudentIds:[...new Set([...value.exemptStudentIds,id])]})} />
      <p className="text-sm" role="status">{value.exemptStudentIds.length} exempted</p>
      <ul className="flex flex-wrap gap-2">{value.exemptStudentIds.map(id => {
        const person = students.find(p => p.uid === id);
        return <li key={id} className="flex max-w-full items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1 dark:border-blue-900 dark:bg-blue-950"><span className="min-w-0 break-words text-sm"><span className="font-semibold">{person?.name || 'Unavailable student'}</span>{person && <span className="block text-xs text-slate-500 dark:text-slate-300">{studentDetail(person)}</span>}</span><button type="button" className="min-h-11 shrink-0 px-2 text-sm underline" aria-label={`Remove exemption for ${person?.name || id}`} onClick={() => onChange({...value,exemptStudentIds:value.exemptStudentIds.filter(uid => uid !== id)})}>Remove</button></li>;
      })}</ul>
    </fieldset>
    <fieldset className="min-w-0 space-y-3"><legend className="font-bold">Ceremony attendance window overrides</legend><p className="text-sm text-slate-500">These are ceremony scan windows, separate from weekly class schedules in the hierarchy. OSAS, SSG, and admins can override the default scheduled time in and out for a class. These replace the default windows for that class. Configure before attendance begins.</p>
      <SearchSuggest label="Search classes for ceremony time overrides" placeholder="Search class, section code, course, or campus" options={classes.filter(n => !value.classWindows[n.id]).map(n => ({id:n.id,label:n.name,detail:recipientGroupLabel(`node:${n.id}`,roots),keywords:n.metadata?.shortCode || n.code}))} onSelect={id => onChange({...value,classWindows:{...value.classWindows,[id]:defaultWindows.length && defaultWindows.every(w => w.timeIn && w.timeOut) ? defaultWindows.map((w,i) => ({...w,id:`class-${id}-${i}`})) : [{id:`class-${id}`,timeIn:value.flagKind === 'retreat' ? '16:30' : '07:00',timeOut:value.flagKind === 'retreat' ? '17:00' : '08:00',lateAfterMinutes:15}]}})} />
      {Object.entries(value.classWindows).map(([id, windows]) => <fieldset key={id} className="rounded-xl border p-3"><legend className="font-bold">{recipientGroupLabel(`node:${id}`, roots)}</legend>{windows.map((w, i) => <div key={w.id} className="grid gap-3 sm:grid-cols-3">{(['timeIn','timeOut','lateAfterMinutes'] as const).map(field => <label key={field} className="app-field-label">{field === 'timeIn' ? 'Class time in' : field === 'timeOut' ? 'Class time out' : 'Class late after minutes'}<TimeInput aria-label={`${id} ${field} ${i + 1}`} className="input-field mt-2" type={field === 'lateAfterMinutes' ? 'number' : 'time'} min={field === 'lateAfterMinutes' ? 0 : undefined} value={w[field]} onChange={e => onChange({ ...value, classWindows: { ...value.classWindows, [id]: windows.map((item, j) => i === j ? { ...item, [field]: field === 'lateAfterMinutes' ? Number(e.target.value) : e.target.value } : item) } })} /></label>)}</div>)}<Button type="button" variant="secondary" className="mt-3" onClick={() => { const next = { ...value.classWindows }; delete next[id]; onChange({ ...value, classWindows: next }); }}>Use default windows</Button></fieldset>)}
    </fieldset>
  </Surface>;
}
