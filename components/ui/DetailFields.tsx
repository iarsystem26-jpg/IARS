import React from 'react';

export default function DetailFields({ fields }: { fields: { label: string; value: React.ReactNode }[] }) {
  return <dl className="grid gap-3 sm:grid-cols-2">{fields.map(({ label, value }) => <div key={label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
    <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="mt-1 break-words text-sm font-semibold text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100">{value ?? 'Not specified'}</dd>
  </div>)}</dl>;
}
