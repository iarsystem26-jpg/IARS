import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type RefObject } from 'react';

/** Shared presence and motion for selects and search suggestions. */
export function DropdownPanel({ open, children, className = '', anchorRef, ...props }: HTMLAttributes<HTMLDivElement> & { open: boolean; anchorRef?: RefObject<HTMLElement | null> }) {
  const [present, setPresent] = useState(open);
  const panel = useRef<HTMLDivElement>(null);
  const topLayer = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element || !topLayer || (!open && !present)) return;
    // The top layer escapes card/accordion clipping while preserving DOM focus order.
    element.showPopover();
    const position = () => {
      const anchor = anchorRef?.current || element.previousElementSibling;
      if (!(anchor instanceof HTMLElement)) return;
      const rect = anchor.getBoundingClientRect();
      const gap = 8;
      const below = window.innerHeight - rect.bottom - gap * 2;
      const above = rect.top - gap * 2;
      const upwards = below < Math.min(element.scrollHeight, 240) && above > below;
      element.style.width = `${Math.min(rect.width, window.innerWidth - gap * 2)}px`;
      element.style.left = `${Math.max(gap, Math.min(rect.left, window.innerWidth - rect.width - gap))}px`;
      element.style.top = upwards ? 'auto' : `${rect.bottom + gap}px`;
      element.style.bottom = upwards ? `${window.innerHeight - rect.top + gap}px` : 'auto';
      element.style.maxHeight = `${Math.max(0, upwards ? above : below)}px`;
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    if (anchorRef?.current) observer?.observe(anchorRef.current);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      observer?.disconnect();
    };
  }, [open, present, topLayer, anchorRef]);

  useEffect(() => {
    if (open) { setPresent(true); return; }
    if (!present) return;
    // Read the actual token-backed CSS duration, including reduced-motion overrides.
    const style = panel.current ? getComputedStyle(panel.current) : null;
    const milliseconds = (value: string) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000) || 0;
    const duration = Math.max(0, ...(style?.transitionDuration.split(',').map(milliseconds) || [0]));
    const timer = window.setTimeout(() => setPresent(false), duration);
    return () => window.clearTimeout(timer);
  }, [open, present]);

  if (!open && !present) return null;
  return <div {...props} ref={panel} popover={topLayer ? 'manual' : undefined} aria-hidden={open ? undefined : true} inert={open ? undefined : true}
    data-state={open ? 'open' : 'closed'} className={`app-dropdown-menu ${className}`}>
    {children}
  </div>;
}
