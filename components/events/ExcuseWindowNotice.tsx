import { useEffect, useState } from 'react';
import { AppEvent } from '../../types';
import { excuseDeadline } from '../../lib/excusePolicy';
import { formatManilaDateTime } from '../../lib/dateTime';

export function useExcuseClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function ExcuseWindowNotice({ event, blocked }: { event: AppEvent; blocked: string }) {
  return <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
    <p><strong>Excuse deadline:</strong> {formatManilaDateTime(excuseDeadline(event))} (Philippine time)</p>
    <p className="mt-1">{blocked || 'Submit in advance or before this deadline. A supporting document is required. Filing does not automatically excuse an absence; OSSA must approve it.'}</p>
  </div>;
}
