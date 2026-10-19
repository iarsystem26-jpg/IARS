import { useEffect, useRef, useState } from 'react';
import { createAttendanceReport, loadAttendanceReportLogo, type AttendanceReportOptions } from '../../lib/attendanceReport';

export function useAttendanceReportPreview(options: AttendanceReportOptions | null) {
  const logoPromise = useRef<Promise<Uint8Array> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    options: AttendanceReportOptions;
    url?: string;
    doc?: ReturnType<typeof createAttendanceReport>;
    pages?: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!options) { setResult(null); return; }
    let cancelled = false;
    let url: string | undefined;
    const timer = window.setTimeout(async () => {
      try {
        logoPromise.current ??= loadAttendanceReportLogo().catch(error => {
          logoPromise.current = null;
          throw error;
        });
        const schoolLogo = await logoPromise.current;
        if (cancelled) return;
        const doc = createAttendanceReport({ ...options, schoolLogo });
        url = URL.createObjectURL(doc.output('blob'));
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setResult({ options, url, doc, pages: doc.getNumberOfPages() });
      } catch (error) {
        if (!cancelled) setResult({ options, error: error instanceof Error ? error.message : 'Could not prepare the PDF preview.' });
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [options, attempt]);

  const current = result?.options === options ? result : null;
  return { ...current, loading: Boolean(options && !current), retry: () => { setResult(null); setAttempt(value => value + 1); } };
}
