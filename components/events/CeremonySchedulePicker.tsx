import ErrorNotice from '../ui/ErrorNotice';
import { useState } from 'react';
import { canScheduleCeremony, defaultCeremonyRange, ceremonyMonthRange, dateStamp, validDate, predictCeremonyDates } from '../../lib/ceremonySchedule';
import Button from '../ui/Button';
import { Surface } from '../ui/Page';
import { CeremonyCalendar } from './CeremonyCalendar';

export function CeremonySchedulePicker({ start, end, dates, onChange, standardWeekday }: { standardWeekday?: number; start: string; end: string; dates: string[]; onChange: (dates: string[]) => void }) {
  const [weekdays, setWeekdays] = useState([1]);
  const [count, setCount] = useState(4);
  const [manual, setManual] = useState('');
  const [notice, setNotice] = useState('');
  const [month, setMonth] = useState(() => (dates[0] || (validDate(start) ? start : defaultCeremonyRange().start)).slice(0, 7));
  const range = start || end ? { start, end } : ceremonyMonthRange(month);
  const predict = () => {
    const selectedWeekdays = standardWeekday !== undefined ? [standardWeekday] : weekdays;
    if (!validDate(range.start) || !validDate(range.end)) { setNotice('Enter both dates for a custom range, or clear both to predict the calendar month.'); return; }
    if (range.end < range.start) { setNotice('End date must be on or after the start date.'); return; }
    if (dateStamp(range.end) - dateStamp(range.start) > 366 * 86400000) { setNotice('Choose a prediction range of no more than one year.'); return; }
    if (!selectedWeekdays.length) { setNotice('Select at least one day of the week.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 31) { setNotice('Occurrences per month must be a whole number from 1 to 31.'); return; }
    const predicted = predictCeremonyDates(range.start, range.end, selectedWeekdays, count);
    if (!predicted.length) { setNotice('No matching weekdays remain in this range. Try another weekday or a custom range. Your selected dates were kept.'); return; }
    onChange(predicted);
    setMonth(predicted[0].slice(0, 7));
    setNotice(`Predicted ${predicted.length} dates from ${range.start} to ${range.end}. Review the calendar before saving.`);
  };
  return <Surface className="space-y-4 p-4 sm:p-6">
    <h2 className="text-lg font-bold">Flag ceremony dates</h2>
    <p className="text-sm text-slate-500">Choose days of the week, then predict dates. With no custom range, prediction includes the whole month shown in the calendar. Use Previous, Next, or Calendar month to choose a month. You can then add or remove dates. Each selected date becomes a separate ceremony.</p>
    <p className="text-sm font-semibold">Prediction range: {range.start || "Choose a start date"} to {range.end || "Choose an end date"}. Dates outside the creation window are preview only.</p>
    {standardWeekday !== undefined && <p className="text-sm font-semibold">Standard schedule: {standardWeekday === 1 ? 'Monday morning' : 'Friday afternoon'}. Manual dates must follow this weekday.</p>}
    <fieldset className="flex flex-wrap gap-3"><legend className="app-field-label mb-2">Days of the week</legend>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, i) => <label key={day} className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={standardWeekday !== undefined} checked={standardWeekday !== undefined ? standardWeekday === i : weekdays.includes(i)} onChange={() => setWeekdays(weekdays.includes(i) ? weekdays.filter(d => d !== i) : [...weekdays, i])} />{day}</label>)}</fieldset>
    <label className="app-field-label block">Occurrences per month<input type="number" min="1" max="31" value={count} onChange={e => setCount(Number(e.target.value))} className="input-field mt-2" /></label>
    <p className="text-sm text-slate-500">Choose 4 and Monday to predict the first four Mondays of the month. Months with fewer matching days include only those available. Predicting again replaces the selected dates.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="sm:w-auto" onClick={predict}>Automatically predict dates</Button><Button type="button" variant="secondary" className="sm:w-auto" onClick={() => onChange(dates.filter(d => canScheduleCeremony(d)))}>Keep only dates allowed now</Button></div>
    {notice && <p role="status" aria-label="Date prediction result" className="text-sm">{notice}</p>}
    <div className="flex flex-wrap items-end gap-3"><label className="app-field-label">Manual ceremony date<input type="date" className="input-field mt-2" value={manual} onChange={e => setManual(e.target.value)} /></label><Button type="button" variant="secondary" className="sm:w-auto" disabled={!manual || dates.includes(manual)} onClick={() => onChange([...dates, manual].sort())}>Add date</Button></div>
    <CeremonyCalendar month={month} onMonthChange={setMonth} dates={dates} onChange={onChange} />
    <p className="font-semibold">{dates.length} selected dates</p>
    <ul className="flex flex-wrap gap-2">{dates.map(day => <li key={day} className="rounded-lg border p-2 text-sm">{day}{!canScheduleCeremony(day) && <span className="ml-2 text-amber-700 dark:text-amber-300">Preview only</span>}<button type="button" aria-label={`Remove ${day}`} className="ml-2 min-h-10 px-2 underline" onClick={() => onChange(dates.filter(d => d !== day))}>Remove</button></li>)}</ul>
    {dates.some(d => !canScheduleCeremony(d)) && <ErrorNotice error="Remove preview-only dates before saving. Past dates cannot be scheduled." />}
  </Surface>;
}
