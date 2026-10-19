import { useId, useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { generatePassword } from '../../lib/passwordPolicy';
import Button from './Button';
import PasswordStrengthMeter from './PasswordStrengthMeter';

export default function ManagedPasswordField({ label, value, onChange, optional = false }: {
  label: string; value: string; onChange: (value: string) => void; optional?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative min-w-0 flex-1">
        <input id={id} className="input-field pr-12" type={visible ? 'text' : 'password'} value={value}
          autoComplete="new-password" required={!optional} minLength={12} maxLength={1024}
          placeholder="Enter a strong password" aria-describedby={`${id}-hint`} onChange={event => onChange(event.target.value)} />
        <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}
          onClick={() => setVisible(current => !current)}
          className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-gold-500 dark:text-slate-300 dark:hover:bg-slate-700">
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <Button fullWidth={false} variant="secondary" onClick={() => onChange(generatePassword())}><KeyRound size={16} /> Generate</Button>
    </div>
    <p id={`${id}-hint`} className="text-xs leading-5 text-slate-500 dark:text-slate-400">{optional && 'Leave blank to generate automatically. '}Use at least 12 characters, an uppercase letter, a number, and a special character.</p>
    <PasswordStrengthMeter password={value} />
  </div>;
}
