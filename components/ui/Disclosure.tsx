import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible } from './Collapsible';

/** Uncontrolled disclosure using the same motion as controlled app sections. */
export function Disclosure({ title, children, className = '' }: { title: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className={`app-surface ${className}`}>
    <button type="button" className="app-disclosure-trigger flex w-full items-center justify-between gap-3 p-3 text-left text-sm font-semibold"
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span>{title}</span><ChevronDown className="app-disclosure-chevron shrink-0" size={16} aria-hidden="true" />
    </button>
    <Collapsible id={id} open={open} innerClassName="space-y-2 border-t border-[var(--color-border)] p-3">{children}</Collapsible>
  </div>;
}
