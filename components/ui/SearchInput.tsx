import { useRef, type KeyboardEventHandler } from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  controls?: string;
  type?: 'text' | 'search';
  clearLabel?: string;
}

const SearchInput = ({ ariaLabel, value, onChange, placeholder = 'Search...', label, className = '', disabled = false, onKeyDown, controls, type = 'search', clearLabel }: SearchInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      {label ? <span className="app-field-label">{label}</span> : null}
      <div className="group relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-gold-600 dark:text-slate-500 dark:group-focus-within:text-gold-400" size={17} strokeWidth={2.25} />
        <input aria-label={ariaLabel} aria-controls={controls} className="app-search-input" disabled={disabled} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} ref={inputRef} type={type} value={value} />
        {value && !disabled ? (
          <button aria-label={clearLabel || `Clear ${ariaLabel.toLowerCase()}`} className="app-icon-button absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center" onClick={() => { onChange(''); inputRef.current?.focus(); }} type="button">
            <X aria-hidden="true" size={14} strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default SearchInput;
