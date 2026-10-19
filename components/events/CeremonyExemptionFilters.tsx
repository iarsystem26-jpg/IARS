import { TimeInput } from '../ui/TimeInput';
import { SelectField } from '../ui/SelectField';
import { useId, useState } from 'react';
import { AppEvent, SchoolNode, UserProfile } from '../../types';
import { ExemptionFilter, previewExemptions } from '../../lib/classSchedules';
import { recipientGroupLabel } from '../../lib/eventAudience';
import { AcademicPathPicker } from '../academic/AcademicPathPicker';
import Button from '../ui/Button';
import { Collapsible } from '../ui/Collapsible';
import { Disclosure } from '../ui/Disclosure';

type Settings = NonNullable<AppEvent['ceremony']>;
export function CeremonyExemptionFilters({ value, onChange, roots, students, dates, editing }: {value:Settings; onChange:(value:Settings)=>void; roots:SchoolNode[]; students:UserProfile[]; dates:string[]; editing:boolean}) {
  const panelId = useId();
  const [open,setOpen] = useState(false);
  const [path,setPath] = useState<SchoolNode[]>([]);
  const [filter,setFilter] = useState<ExemptionFilter>({mode:'class',classIds:[],comparison:'equal',time:'10:00'});
  const [date,setDate] = useState('');
  const [notice,setNotice] = useState('');
  const targetDates = date ? dates.filter(d => d === date) : dates;
  const preview = previewExemptions(roots,students,targetDates,filter);
  const chosen = path.at(-1);
  const canAddClass = chosen && ['section','block'].includes(chosen.type) && !filter.classIds.includes(chosen.id);
  const total = preview.reduce((sum,row) => sum + row.students.length,0);
  return <div className="space-y-4 rounded-xl border p-3">
    <Button type="button" variant="secondary" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>Filter exempt students by class or schedule</Button>
    <Collapsible open={open} id={panelId} innerClassName="space-y-4">
      <p className="text-sm text-slate-500">Preview students by their class schedule on each ceremony weekday. Applying adds exemptions without removing your manual selections. Schedule changes later do not change saved exemptions.</p>
      <label className="app-field-label block">Exemption filter<SelectField aria-label="Exemption filter" className="mt-1 min-w-0" value={filter.mode} onChange={e => setFilter({...filter,mode:e as ExemptionFilter['mode']})}><option value="class">Selected classes</option><option value="timeIn">First class starts</option><option value="timeOut">Last class ends</option><option value="no_class">No classes on the ceremony day</option></SelectField></label>
      <label className="app-field-label block">Apply filter to ceremony date<SelectField aria-label="Apply filter to ceremony date" className="mt-1 min-w-0" value={date} onChange={e => setDate(e)}><option value="">All selected ceremony dates</option>{dates.map(day => <option key={day}>{day}</option>)}</SelectField></label>
      <fieldset className="min-w-0 space-y-3"><legend className="font-semibold">Choose exemption classes</legend>
        <p className="text-sm text-slate-500">Choose a section or block through the hierarchy. For schedule filters, leaving this list empty searches all classes in your scope.</p>
        <AcademicPathPicker roots={roots} value={path.map(n => n.id)} onChange={setPath} />
        <Button type="button" variant="secondary" disabled={!canAddClass} onClick={() => {if (chosen) setFilter({...filter,classIds:[...filter.classIds,chosen.id]}); setPath([]);}}>Add exemption class</Button>
        {filter.classIds.map(id => <div key={id} className="flex flex-wrap items-center gap-2 text-sm"><span>{recipientGroupLabel(`node:${id}`,roots)}</span><button type="button" className="min-h-11 underline" onClick={() => setFilter({...filter,classIds:filter.classIds.filter(c => c !== id)})}>Remove class</button></div>)}
      </fieldset>
      {['timeIn','timeOut'].includes(filter.mode) && <div className="grid gap-3 sm:grid-cols-2"><label className="app-field-label">Time comparison<SelectField aria-label="Time comparison" className="mt-1 min-w-0" value={filter.comparison} onChange={e => setFilter({...filter,comparison:e as ExemptionFilter['comparison']})}><option value="equal">Exactly at</option><option value="at_or_after">At or after</option><option value="at_or_before">At or before</option></SelectField></label><label className="app-field-label">Class schedule time<TimeInput type="time" className="input-field mt-2" value={filter.time} onChange={e => setFilter({...filter,time:e.target.value})} /></label></div>}
      {!dates.length && <p role="status">Choose ceremony dates first to preview exemptions.</p>}
      <p className="text-sm text-slate-500">Unconfigured schedules are excluded from time and no-class filters. First class starts and last class ends are separate filters; choose the one your exemption policy uses.</p>
      <div aria-label="Exemption preview" className="max-h-72 space-y-3 overflow-auto">{preview.map(row => <Disclosure key={row.date} title={<>{row.date}: {row.students.length} matching students in {row.classes.length} classes</>}><ul>{row.students.map(p => <li key={p.uid}>{p.name} ({p.student_id})</li>)}</ul></Disclosure>)}</div>
      <Button type="button" variant="secondary" disabled={!total} onClick={() => {
        if (editing) onChange({...value,exemptStudentIds:[...new Set([...value.exemptStudentIds,...preview.flatMap(row => row.students.map(p => p.uid))])]});
        else {
          const next = {...value.exemptStudentIdsByDate};
          preview.forEach(row => {next[row.date]=[...new Set([...(next[row.date] || []),...row.students.map(p => p.uid)])];});
          onChange({...value,exemptStudentIdsByDate:next});
        }
        setNotice('Matching students added. Review the exemptions below before saving.');
      }}>Apply matching exemptions</Button>
      {notice && <p role="status">{notice}</p>}
    </Collapsible>
    {!editing && dates.map(day => {
      const ids=value.exemptStudentIdsByDate?.[day] || [];
      return ids.length ? <Disclosure key={day} title={<>{day}: {ids.length} date-specific exemptions</>}><p className="text-sm">These are in addition to students exempted from all dates below.</p>{ids.map(id => <div key={id} className="flex items-center justify-between gap-2"><span>{students.find(p => p.uid === id)?.name || 'Unavailable student'}</span><button type="button" className="min-h-11 underline" aria-label={`Remove exemption ${id} on ${day}`} onClick={() => onChange({...value,exemptStudentIdsByDate:{...value.exemptStudentIdsByDate,[day]:ids.filter(uid => uid !== id)}})}>Remove</button></div>)}</Disclosure> : null;
    })}
  </div>;
}
