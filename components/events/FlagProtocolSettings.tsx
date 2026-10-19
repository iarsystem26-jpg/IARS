import { AppEvent, EventAttendanceWindow } from '../../types';
import CustomSelect from '../ui/CustomSelect';

export function FlagProtocolSettings({ value, onChange, onWindowsChange }: { value: NonNullable<AppEvent['ceremony']>; onChange: (value: NonNullable<AppEvent['ceremony']>) => void; onWindowsChange: (windows: EventAttendanceWindow[]) => void }) {
  const set = (phase: 'raising' | 'retreat', standard: boolean) => {
    onChange({ ...value, flagKind: phase, useStandardSchedule: standard });
    if (standard) onWindowsChange([{ id: 'flag-window', timeIn: phase === 'raising' ? '07:00' : '16:30', timeOut: phase === 'raising' ? '07:30' : '17:00', lateAfterMinutes: 5 }]);
  };
  return <div className="space-y-3 rounded-xl border p-4">
    <CustomSelect label="Flag ceremony type" value={value.flagKind || 'raising'} onChange={phase => set(phase as 'raising' | 'retreat', Boolean(value.useStandardSchedule))} options={[{ value: 'raising', label: 'Flag raising' }, { value: 'retreat', label: 'Flag retreat / lowering' }]} />
    <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={Boolean(value.useStandardSchedule)} onChange={e => set(value.flagKind || 'raising', e.target.checked)} />Use Philippine standard ceremony week</label>
    <p className="text-sm text-slate-600 dark:text-slate-300">Monday morning for flag raising; Friday afternoon for flag retreat. Suggested school windows are 7:00–7:30 AM and 4:30–5:00 PM. You can edit the clock times below; these are school defaults, not nationally mandated hours.</p>
    <a className="text-sm underline" href="https://lawphil.net/statutes/repacts/ra1998/ra_8491_1998.html" target="_blank" rel="noreferrer">Source: Republic Act 8491, Sections 15 and 18</a>
  </div>;
}
