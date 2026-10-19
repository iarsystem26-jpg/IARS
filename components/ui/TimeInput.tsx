import { useId, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  onChange?: (event: { target: { value: string } }) => void;
};

/** Explicit AM/PM controls; values stay HH:mm for scheduling and storage. */
export function TimeInput({ value, onChange, id, className = '', required, disabled, 'aria-label': ariaLabel, type, ...rest }: Props) {
  const generatedId = useId();
  const controlId = id || generatedId;
  if (type && type !== 'time') return <input {...rest} id={id} type={type} value={value} onChange={onChange} className={className} required={required} disabled={disabled} aria-label={ariaLabel} />;
  const raw = String(value || '');
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(raw);
  const hour = valid ? String(Number(raw.slice(0, 2)) % 12 || 12) : '';
  const minute = valid ? raw.slice(3, 5) : '';
  const period = valid && Number(raw.slice(0, 2)) >= 12 ? 'PM' : 'AM';
  const change = (h: string, m: string, p: string) => {
    const next = h && m ? `${String(Number(h) % 12 + (p === 'PM' ? 12 : 0)).padStart(2, '0')}:${m}` : '';
    onChange?.({ target: { value: next } });
  };
  const selectClass = 'min-w-0 flex-1 rounded bg-transparent px-1 py-2 text-inherit focus-visible:outline-gold-500';
  return <div className={`flex min-w-0 items-center gap-1 ${className}`} role="group" aria-label={ariaLabel || 'Time (Manila)'}>
    <select id={controlId} aria-label={`${ariaLabel || 'Time'} hour`} className={selectClass} value={hour} required={required} disabled={disabled} onChange={e => change(e.target.value, minute || '00', period)}>
      <option value="">HH</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
    </select><span aria-hidden="true">:</span>
    <select aria-label={`${ariaLabel || 'Time'} minute`} className={selectClass} value={minute} required={required} disabled={disabled} onChange={e => change(hour || '12', e.target.value, period)}>
      <option value="">MM</option>{Array.from({ length: 60 }, (_, i) => { const m = String(i).padStart(2, '0'); return <option key={m} value={m}>{m}</option>; })}
    </select>
    <select aria-label={`${ariaLabel || 'Time'} AM/PM`} className={selectClass} value={period} disabled={disabled} onChange={e => change(hour || '12', minute || '00', e.target.value)}><option>AM</option><option>PM</option></select>
    {rest.name && <input type="hidden" name={rest.name} value={raw} disabled={disabled} />}
  </div>;
}

export function DateTimeInput({ value, onChange, id, className = '', required, disabled, 'aria-label': ariaLabel }: Props) {
  const [day = '', time = ''] = String(value || '').split('T');
  return <div className="space-y-2">
    <input id={id} aria-label={`${ariaLabel || 'Schedule'} date (Manila)`} type="date" className={className} required={required} disabled={disabled} value={day} onChange={e => onChange?.({ target: { value: e.target.value ? `${e.target.value}T${time || '00:00'}` : '' } })} />
    <TimeInput aria-label={`${ariaLabel || 'Schedule'} time (Manila)`} className={className} required={required} disabled={disabled} value={time} onChange={e => onChange?.({ target: { value: `${day}T${e.target.value}` } })} />
  </div>;
}
