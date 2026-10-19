import type { ReactNode } from 'react';

type SkeletonProps = React.HTMLAttributes<HTMLSpanElement> & { width?: string | number; height?: string | number; rounded?: 'sm' | 'md' | 'lg' | 'pill' };

export function Skeleton({ width, height, rounded = 'md', className = '', style, ...props }: SkeletonProps) {
  const radius = { sm: 'rounded', md: 'rounded-lg', lg: 'rounded-xl', pill: 'rounded-full' }[rounded];
  return <span aria-hidden="true" className={`app-skeleton ${radius} ${className}`} style={{ width, height, ...style }} {...props} />;
}

export function AppLoading({ label = 'Loading', children, embedded = false }: { label?: string; children?: ReactNode; embedded?: boolean }) {
  return <div aria-label={label} aria-busy="true" className={embedded ? 'min-w-0 w-full' : 'app-loading-shell'} role="status">{children || <div className="app-loading-layout" aria-hidden="true"><Skeleton width="2.75rem" height="2.75rem" rounded="pill" /><div className="min-w-0 flex-1 space-y-3"><Skeleton className="max-w-[12rem]" height="1rem" /><Skeleton className="max-w-[20rem]" height="0.75rem" /></div></div>}</div>;
}
