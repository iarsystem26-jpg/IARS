import { useEffect, useRef, useState } from 'react';

export default function CountdownBar({ seconds, label, onComplete, paused = false }: {
  seconds: number; label: string; onComplete: () => void; paused?: boolean;
}) {
  const [remaining, setRemaining] = useState(seconds * 1000);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  useEffect(() => {
    if (paused) return;
    let previous = Date.now();
    let left = remaining;
    const timer = window.setInterval(() => {
      const now = Date.now();
      left = Math.max(0, left - (now - previous));
      previous = now;
      setRemaining(left);
      if (left === 0) { clearInterval(timer); complete.current(); }
    }, 100);
    return () => clearInterval(timer);
  }, [paused, seconds]);
  return <div className="space-y-2">
    <p className="text-xs text-slate-500 dark:text-slate-400">{paused ? 'Waiting for your choice…' : `${label} in ${Math.ceil(remaining / 1000)} seconds`}</p>
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={Math.ceil(remaining / 1000)} className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div className="h-full rounded-full bg-gold-500 transition-[width] duration-100 motion-reduce:transition-none" style={{ width: `${remaining / (seconds * 1000) * 100}%` }} />
    </div>
  </div>;
}
