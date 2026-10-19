import { useId, type ReactNode } from 'react';

interface CollapsibleProps {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
  innerClassName?: string;
}

export function Collapsible({
  open,
  children,
  id,
  className = '',
  innerClassName = '',
}: CollapsibleProps) {
  const generatedId = useId();

  return (
    <div
      aria-hidden={!open}
      className={`app-collapsible ${className}`}
      data-state={open ? 'open' : 'closed'}
      id={id || generatedId}
    >
      <div className="app-collapsible__inner">
        <div className={innerClassName} inert={open ? undefined : true}>
          {children}
        </div>
      </div>
    </div>
  );
}
