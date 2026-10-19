import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, LoaderCircle, X } from 'lucide-react';
import { toast, toastStore, type ToastItem } from '../../lib/toast';
import { classifyError, errorOwnerLabels } from '../../lib/errors';

function Notification({ item, exiting }: { item: ToastItem; exiting: boolean }) {
  const phase = item.phase ?? 0;
  const detail = item.kind === 'error' ? classifyError({ code: item.code }) : undefined;
  return <div className="app-toast" role={item.kind === 'error' ? 'alert' : 'status'} data-owner={detail?.owner} data-kind={item.kind} data-state={exiting ? 'closing' : 'open'}>
    {item.kind === 'progress' ? <LoaderCircle size={17} className="app-toast-spinner" aria-hidden="true" /> : item.kind === 'error' ? <CircleAlert size={17} aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
    <div className="app-toast-content">
      {item.kind === 'error' ? <>
        <span className="error-notice-label">{errorOwnerLabels[detail!.owner]}</span>
        {item.title && <span className="error-notice-operation">{item.title}</span>}
        <span className="app-toast-label">{item.message}</span>
        <span className="app-toast-code">{item.code}</span>
      </> : <>
        <span className="app-toast-label">{item.kind === 'success' ? item.message : item.title || item.message}</span>
        {item.phases && item.kind === 'progress' && <>
          <div className="app-toast-phase">Step {phase + 1} of {item.phases.length}: {item.phases[phase]}</div>
          <div className="app-toast-bar" role="progressbar" aria-label={`${item.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.percent} aria-valuetext={`Step ${phase + 1}: ${item.phases[phase]}`}>
            <div style={{ width: `${item.percent}%` }} />
          </div>
        </>}
      </>}
    </div>
    {item.kind !== 'progress' && <button type="button" className="app-toast-dismiss" aria-label={`Dismiss ${item.title || 'notification'}`} onClick={() => toast.dismiss(item.id)}><X size={16} /></button>}
  </div>;
}

export default function ToastViewport() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
  const [displayed, setDisplayed] = useState<{ item: ToastItem; exiting: boolean }[]>([]);
  useEffect(() => {
    setDisplayed(previous => [
      ...previous.filter(entry => !items.some(item => item.id === entry.item.id)).map(entry => ({ ...entry, exiting: true })),
      ...items.map(item => ({ item, exiting: false })),
    ]);
    const timer = window.setTimeout(() => setDisplayed(previous => previous.filter(entry => !entry.exiting)), 200);
    return () => clearTimeout(timer);
  }, [items]);
  const hasAction = items.some(item => !item.request && item.kind === 'progress');
  const visible = displayed.filter(({ item }) => !hasAction || !item.request || item.kind !== 'progress');
  return createPortal(<div className="app-toast-viewport" data-toast-root="true" aria-label="Notifications">
    <div role="status" aria-live="polite">{visible.filter(({ item }) => item.kind !== 'error').map(({ item, exiting }) => <Notification item={item} exiting={exiting} key={`${item.id}:${item.kind}`} />)}</div>
    <div role="alert" aria-live="assertive">{visible.filter(({ item }) => item.kind === 'error').map(({ item, exiting }) => <Notification item={item} exiting={exiting} key={`${item.id}:${item.kind}`} />)}</div>
  </div>, document.body);
}
