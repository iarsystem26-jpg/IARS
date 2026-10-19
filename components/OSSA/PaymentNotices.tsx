import { useEffect, useState } from 'react';
import { appData } from '../../lib/backend';
import { formatManilaDateTime } from '../../lib/dateTime';

/** Settings are readable by OSSA roles; notices are posted to the whole OSSA team. */
export default function PaymentNotices() {
  const [info, setInfo] = useState(() => appData.getPaymentInfo());
  useEffect(() => {
    const refresh = () => setInfo(appData.getPaymentInfo());
    window.addEventListener('rmc_data_update', refresh);
    return () => window.removeEventListener('rmc_data_update', refresh);
  }, []);
  if (!info.reminders.length) return null;
  return <section aria-label="School payment notices" className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-slate-800">
    <h2 className="text-base font-bold text-brand-900 dark:text-white">School payment notices</h2>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Subscription reminders posted by System Administration. Earlier notices remain here for reference after settlement.</p>
    <div className="mt-4 space-y-3">{[...info.reminders].sort((a, b) => b.sentAt - a.sentAt).map((notice, index) => <details key={notice.id} open={index === 0} className="rounded-xl border border-amber-200 p-3 dark:border-slate-600">
      <summary className="cursor-pointer break-words text-sm font-bold">{notice.subject} · {notice.urgency}</summary>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{formatManilaDateTime(notice.sentAt)} · {notice.sentBy || 'System Administration'}</p>
      <p className="mt-3 whitespace-pre-line break-words text-sm text-slate-700 dark:text-slate-200">{notice.message}</p>
    </details>)}</div>
  </section>;
}
