import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  toggleLabel?: string;
};

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className = '', toggleLabel = 'password', id, disabled, value, ...props }, ref,
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  useEffect(() => { if (value === '') setVisible(false); }, [value]);

  return <span className="relative block min-w-0">
    <input {...props} id={inputId} ref={ref} value={value} disabled={disabled}
      type={visible ? 'text' : 'password'} className={`${className} !pr-12`} />
    <button type="button" disabled={disabled} aria-controls={inputId} aria-pressed={visible}
      aria-label={`${visible ? 'Hide' : 'Show'} ${toggleLabel}`}
      onMouseDown={event => event.preventDefault()} onClick={() => setVisible(current => !current)}
      className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700">
      {visible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
    </button>
  </span>;
});

export default PasswordInput;
