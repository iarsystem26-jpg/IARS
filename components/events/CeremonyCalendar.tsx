import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { canScheduleCeremony, dateStamp, manilaDate } from '../../lib/ceremonySchedule';
import Button from '../ui/Button';

export function CeremonyCalendar({ dates, onChange, month: controlledMonth, onMonthChange }: { dates: string[]; onChange?: (dates: string[]) => void; month?: string; onMonthChange?: (month: string) => void }) {
  const [localMonth, setLocalMonth] = useState((dates[0] || manilaDate()).slice(0, 7));
  const month = controlledMonth ?? localMonth;
  const setMonth = onMonthChange ?? setLocalMonth;
  const first = new Date(dateStamp(`${month}-01`));
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const shift = (step: number) => setMonth(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + step, 1)).toISOString().slice(0, 7));
  return <section aria-label="Ceremony calendar" className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2">
      <Button type="button" variant="secondary" size="sm" fullWidth={false} className="min-h-11" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /><span className="hidden sm:inline">Previous</span></Button>
      <label className="app-field-label mx-auto w-full min-w-0 max-w-64">Calendar month<input aria-label="Calendar month" type="month" value={month} onChange={e => /^\d{4}-\d{2}$/.test(e.target.value) && setMonth(e.target.value)} className="input-field min-w-0 w-full" /></label>
      <Button type="button" variant="secondary" size="sm" fullWidth={false} className="min-h-11" onClick={() => shift(1)} aria-label="Next month"><span className="hidden sm:inline">Next</span><ChevronRight size={16} /></Button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center text-sm">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <span key={day} className="py-2 font-bold">{day}</span>)}
      {Array.from({ length: first.getUTCDay() }, (_, i) => <span key={`blank-${i}`} />)}
      {Array.from({ length: days }, (_, i) => {
        const day = `${month}-${String(i + 1).padStart(2, '0')}`, selected = dates.includes(day), eligible = canScheduleCeremony(day);
        return <button key={day} type="button" aria-label={`${day}${selected ? ', selected' : ''}${!eligible ? ', preview only' : ''}`} aria-pressed={selected} disabled={!onChange} onClick={() => onChange?.(selected ? dates.filter(d => d !== day) : [...dates, day].sort())} className={`min-h-11 rounded-lg border text-sm ${selected ? 'border-blue-600 bg-blue-100 font-bold text-blue-950 dark:bg-blue-900 dark:text-white' : 'border-transparent'} ${!eligible ? 'text-slate-400' : ''}`}>{i + 1}</button>;
      })}
    </div>
    {onChange && <p className="text-xs text-slate-500">Click a date to add or remove it. Dates outside the current month and next 7 days are preview only and cannot be saved yet.</p>}
  </section>;
}
