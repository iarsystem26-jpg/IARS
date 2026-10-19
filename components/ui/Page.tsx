import type { ComponentPropsWithoutRef, ReactNode } from 'react';

type ClassNameProps = {
  className?: string;
};

const withClassName = (base: string, className?: string) =>
  [base, className].filter(Boolean).join(' ');

export function Page({ className, ...props }: ComponentPropsWithoutRef<'main'>) {
  return <main className={withClassName('app-page space-y-5 sm:space-y-6', className)} {...props} />;
}

interface PageHeaderProps extends ClassNameProps, Omit<ComponentPropsWithoutRef<'header'>, 'title'> {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={withClassName('flex flex-wrap items-start justify-between gap-4', className)}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gold-600 dark:text-gold-300">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl dark:text-white">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">{actions}</div> : null}
    </header>
  );
}

export function Surface({ className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section className={withClassName('app-surface', className)} {...props} />;
}

interface MetricCardProps extends ClassNameProps, ComponentPropsWithoutRef<'section'> {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
}

export function MetricCard({ icon, label, value, detail, className, ...props }: MetricCardProps) {
  return (
    <section className={withClassName('app-surface p-4 sm:p-5', className)} {...props}>
      <div className="flex items-start gap-3">
        {icon ? <div className="shrink-0 text-gold-500">{icon}</div> : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-brand-900 dark:text-white">{value}</p>
          {detail ? <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{detail}</div> : null}
        </div>
      </div>
    </section>
  );
}
