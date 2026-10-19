import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, ChevronDown } from 'lucide-react';
import { DropdownPanel } from './DropdownPanel';
import SearchInput from './SearchInput';

export interface Option {
  value: string;
  label: string;
  searchText?: string;
  content?: React.ReactNode;
}

interface CustomSelectProps {
  label?: string;
  options: Option[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  multi?: boolean;
  searchable?: boolean;
  className?: string;
  disabled?: boolean;
  combobox?: boolean;
  ariaLabel?: string;
  describedBy?: string;
  invalid?: boolean;
  searchPlaceholder?: string;
}

const selectAllKey = '__select_all__';

const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select...',
  multi = false,
  searchable = false,
  className = '',
  disabled = false,
  combobox = false,
  ariaLabel,
  describedBy,
  invalid,
  searchPlaceholder,
}) => {
  const labelId = useId();
  const valueId = useId();
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());

  const filteredOptions = useMemo(() => options.filter((option) =>
    `${option.label} ${option.searchText || ''}`.toLowerCase().includes(search.trim().toLowerCase())), [options, search]);
  const optionKeys = useMemo(
    () => [...(multi ? [selectAllKey] : []), ...filteredOptions.map((option) => option.value)],
    [filteredOptions, multi],
  );

  const selectedKey = multi
    ? selectAllKey
    : typeof value === 'string' && options.some((option) => option.value === value)
      ? value
      : null;

  const focusOption = (key: string | undefined) => {
    if (key === undefined) return;
    setActiveKey(key);
    const option = optionRefs.current.get(key);
    if (option) option.focus();
  };

  useLayoutEffect(() => {
    if (isOpen && activeKey !== null && !(document.activeElement instanceof HTMLInputElement && containerRef.current?.contains(document.activeElement))) optionRefs.current.get(activeKey)?.focus();
  }, [activeKey, isOpen]);

  const openListbox = (preferredKey?: string) => {
    const nextKey = preferredKey !== undefined && optionKeys.includes(preferredKey)
      ? preferredKey
      : selectedKey !== null && optionKeys.includes(selectedKey)
        ? selectedKey
        : optionKeys[0];
    setIsOpen(true);
    focusOption(nextKey);
  };

  const closeListbox = (restoreFocus = false) => {
    setIsOpen(false);
    setSearch('');
    setActiveKey(null);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeListbox();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || optionKeys.length === 0 || (activeKey !== null && optionKeys.includes(activeKey))) return;
    setActiveKey(optionKeys[0]);
  }, [activeKey, isOpen, optionKeys]);

  const handleSelect = (optionValue: string) => {
    if (multi) {
      const currentValues = Array.isArray(value) ? value : [];
      onChange(currentValues.includes(optionValue)
        ? currentValues.filter((currentValue) => currentValue !== optionValue)
        : [...currentValues, optionValue]);
      return;
    }

    onChange(optionValue);
    closeListbox(true);
  };

  const handleSelectAll = () => {
    if (Array.isArray(value) && value.length === options.length) onChange([]);
    else onChange(options.map((option) => option.value));
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeListbox(true);
      return;
    }

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (optionKeys.length === 0) return;

    const currentIndex = Math.max(0, optionKeys.indexOf(activeKey ?? optionKeys[0]));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? optionKeys.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1) % optionKeys.length
          : (currentIndex - 1 + optionKeys.length) % optionKeys.length;
    focusOption(optionKeys[nextIndex]);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeListbox(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusOption(event.key === 'ArrowDown' ? optionKeys[0] : optionKeys.at(-1));
    }
  };

  const getDisplayValue = () => {
    if (multi) {
      const currentValues = Array.isArray(value) ? value : [];
      if (currentValues.length === 0) return placeholder;
      if (currentValues.length === options.length && options.length > 0) return 'All Selected';
      if (currentValues.length === 1) {
        return options.find((option) => option.value === currentValues[0])?.label || placeholder;
      }
      return `${currentValues.length} Selected`;
    }

    const selected = options.find((option) => option.value === value);
    return selected ? selected.label : placeholder;
  };

  const searchName = label ? `Search ${label} options` : 'Search selection options';

  return (
    <div
      className={`relative space-y-1.5 ${className}`}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (isOpen && (!nextTarget || !event.currentTarget.contains(nextTarget))) {
          closeListbox();
        }
      }}
      ref={containerRef}
    >
      {label ? (
        <span className="app-field-label" id={labelId}>
          {label}
        </span>
      ) : null}

      <button
        aria-controls={isOpen ? listboxId : undefined}
        aria-expanded={isOpen && !disabled}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-labelledby={ariaLabel ? undefined : label ? `${labelId} ${valueId}` : valueId}
        className="app-select-trigger group flex min-w-0 cursor-pointer items-center justify-between gap-3 text-left"
        disabled={disabled}
        role={combobox ? 'combobox' : undefined}
        value={typeof value === 'string' ? value : undefined}
        onClick={() => isOpen ? closeListbox() : openListbox()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openListbox(event.key === 'ArrowUp' ? optionKeys.at(-1) : undefined);
          } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            event.stopPropagation();
            closeListbox(true);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span className="min-w-0 flex-1 select-none truncate" id={valueId}>{getDisplayValue()}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[var(--color-text-muted)]">
          <ChevronDown className="app-disclosure-chevron" size={15} strokeWidth={2.5} />
        </span>
      </button>

      <DropdownPanel open={isOpen && !disabled} anchorRef={triggerRef} className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden">
          {searchable || options.length > 10 ? (
            <div className="border-b border-[var(--color-border)] p-2">
              <SearchInput placeholder={searchPlaceholder} ariaLabel={searchName} clearLabel={`Clear ${label || 'selection'} options search`} controls={listboxId} type="text" value={search} onChange={setSearch} onKeyDown={handleSearchKeyDown} />
            </div>
          ) : null}

          <div
            aria-label={label ? `${label} options` : 'Selection options'}
            aria-multiselectable={multi || undefined}
            className="max-h-[200px] overflow-y-auto p-1 custom-scrollbar"
            id={listboxId}
            role="listbox"
          >
            {multi ? (
              <button
                aria-label="Select all"
                aria-selected={Array.isArray(value) && value.length === options.length && options.length > 0}
                className="app-dropdown-option mb-1 flex items-center justify-between gap-2 font-semibold"
                onClick={handleSelectAll}
                onFocus={() => setActiveKey(selectAllKey)}
                onKeyDown={handleOptionKeyDown}
                ref={(element) => { if (element) optionRefs.current.set(selectAllKey, element); else optionRefs.current.delete(selectAllKey); }}
                role="option"
                tabIndex={activeKey === selectAllKey ? 0 : -1}
                type="button"
              >
                <span>All</span>
                {Array.isArray(value) && value.length === options.length && options.length > 0 ? <CheckCircle className="text-gold-500" size={14} /> : null}
              </button>
            ) : null}

            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500" role="status">
                No options found
              </div>
            ) : filteredOptions.map((option) => {
              const isSelected = multi
                ? Array.isArray(value) && value.includes(option.value)
                : value === option.value;

              return (
                <button
                  aria-selected={isSelected}
                  value={option.value}
                  className="app-dropdown-option mb-1 flex items-center justify-between gap-2 font-semibold"
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  onFocus={() => setActiveKey(option.value)}
                  onKeyDown={handleOptionKeyDown}
                  ref={(element) => { if (element) optionRefs.current.set(option.value, element); else optionRefs.current.delete(option.value); }}
                  role="option"
                  tabIndex={activeKey === option.value ? 0 : -1}
                  type="button"
                >
                  <span className="min-w-0 truncate">{option.content ?? option.label}</span>
                  {isSelected ? <CheckCircle className="text-current" size={14} /> : null}
                </button>
              );
            })}
          </div>

          {multi ? (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {Array.isArray(value) ? value.length : 0} selected
              </span>
              <button className="text-[9px] font-black uppercase tracking-widest text-brand-900 transition-colors hover:text-gold-500 dark:text-gold-400" onClick={() => closeListbox(true)} type="button">
                Done
              </button>
            </div>
          ) : null}
      </DropdownPanel>
    </div>
  );
};

export default CustomSelect;
