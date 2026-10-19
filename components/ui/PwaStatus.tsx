import ErrorNotice from './ErrorNotice';
import React, { createContext, useContext, useEffect, useId, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Button from './Button';
import CountdownBar from './CountdownBar';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const InstallContext = createContext({ available: false, installed: false, installing: false, installApp: async () => {} });
export const usePwaInstall = () => useContext(InstallContext);

export default function PwaStatus({ children }: { children?: React.ReactNode }) {
  const installTitleId = useId();
  const updateTitleId = useId();
  const [online, setOnline] = useState(navigator.onLine);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW: (_url, registeredWorker) => setRegistration(registeredWorker),
    onRegisterError: () => console.warn('Offline setup was unavailable. It will be retried on the next visit.'),
  });
  useEffect(() => {
    if (needRefresh && online) void updateServiceWorker(true).catch(() => setUpdateError('Unable to update. Reconnect and try again.'));
  }, [needRefresh, online, updateServiceWorker]);
  useEffect(() => {
    if (!registration) return;
    let checking = false;
    const checkForUpdate = async () => {
      if (checking || !navigator.onLine || document.visibilityState !== 'visible' || registration.installing) return;
      checking = true;
      try { await registration.update(); }
      catch { /* A failed background check is retried on the next trigger. */ }
      finally { checking = false; }
    };
    const check = () => { void checkForUpdate(); };
    check();
    const interval = window.setInterval(check, 5 * 60 * 1000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [registration]);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstall = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent); setShowInstall(true); };
    const onInstalled = () => { setInstall(null); setShowInstall(false); setInstalled(true); };
    const standalone = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = () => setInstalled(standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    standalone.addEventListener('change', onDisplayChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('appinstalled', onInstalled);
      standalone.removeEventListener('change', onDisplayChange);
    };
  }, []);
  const installApp = async () => {
    if (!install || installing) return;
    setInstalling(true);
    try { await install.prompt(); await install.userChoice; }
    catch { /* The browser can withdraw installation availability. */ }
    finally { setInstall(null); setShowInstall(false); setInstalling(false); }
  };
  const update = async () => {
    setUpdating(true); setUpdateError('');
    try { await updateServiceWorker(true); }
    catch { setUpdateError('Unable to update. Reconnect and try again.'); }
    finally { setUpdating(false); }
  };
  return <InstallContext.Provider value={{ available: Boolean(install) && online && !installed, installed, installing, installApp }}>
  {!online && <aside aria-label="App status" className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 print:hidden">
    {!online && <p role="status">You’re offline. Prepared attendance rosters can be used offline. New sign-ins, other records and uploads need internet; attendance stays pending until synced.</p>}
  </aside>}
  {needRefresh && <aside aria-labelledby={updateTitleId} className="fixed top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-[10000] w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 print:hidden">
    <div className="flex items-start gap-3" role="status" aria-live="polite">
      <RefreshCw aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-brand-900 dark:text-gold-400" />
      <div className="min-w-0 flex-1">
        <h2 id={updateTitleId} className="text-base font-semibold">App update ready</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Installing the latest app version. This page will reload automatically.</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button disabled={!online || updating} onClick={() => void update()}>{updating ? 'Updating…' : 'Reload to update'}</Button>
    </div>
      {updateError && <ErrorNotice error={updateError} operation="Pwa Status"></ErrorNotice>}
  </aside>}
  {online && install && showInstall && !installed && <aside aria-labelledby={installTitleId} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-40 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 print:hidden">
    <div className="flex items-start gap-3">
      <Download aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-brand-900 dark:text-gold-400" />
      <div className="min-w-0 flex-1" role="status">
        <h2 id={installTitleId} className="text-base font-semibold">Install IARS</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Add IARS to your home screen for quick access to attendance and your records.</p>
      </div>
      <button type="button" aria-label="Dismiss install notification" disabled={installing} onClick={() => setShowInstall(false)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700">
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
    </div>
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        <Button disabled={installing} onClick={() => void installApp()}>{installing ? 'Installing…' : 'Install IARS'}</Button>
        <Button variant="secondary" disabled={installing} onClick={() => setShowInstall(false)}>Maybe later</Button>
      </div>
      <CountdownBar seconds={12} label="This notification closes" paused={installing} onComplete={() => setShowInstall(false)} />
    </div>
  </aside>}
  {children}
  </InstallContext.Provider>;
}
