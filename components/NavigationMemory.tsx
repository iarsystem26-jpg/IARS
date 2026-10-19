import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { clearNavigationMemory, isReturnDestination, readMemory, readReturnHistory, writeMemory } from '../lib/navigationMemory';

const BackContext = createContext<((fallback?: string) => void) | null>(null);

export function useSmartBack() {
  const back = useContext(BackContext);
  const navigate = useNavigate();
  return back || ((fallback = '/dashboard') => navigate(fallback, { replace: true }));
}

export default function NavigationMemory({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const action = useNavigationType();
  const previousOwner = useRef<string | null>(null);
  const visited = useRef(false);
  const owner = user?.uid;
  const url = location.pathname + location.search;
  // Control sections share one workspace; switching sections must not reset scroll.
  const scrollUrl = location.pathname === '/admin/controls' ? location.pathname : url;

  useEffect(() => {
    if (loading) return;
    if (previousOwner.current !== (owner || null)) {
      if (previousOwner.current) clearNavigationMemory();
      visited.current = false;
    }
    previousOwner.current = owner || null;
  }, [owner, loading]);

  useEffect(() => {
    if (loading || !owner) return;
    const history = readReturnHistory(owner);
    const initial = !visited.current;
    visited.current = true;
    if (!isReturnDestination(url)) {
      if (!initial && action === 'POP' && (['/login', '/register'].includes(location.pathname) || /\/(create|edit)$/.test(location.pathname))) {
        // The last safe entry is the page we just left; skip it as well.
        history.pop();
        writeMemory(owner + ':history', history);
        navigate(history.at(-1) || '/dashboard', { replace: true });
      }
      return;
    }
    if (history.at(-1) !== url) {
      const existing = history.lastIndexOf(url);
      if (action === 'POP' && existing >= 0) history.splice(existing + 1);
      else {
        if (action === 'REPLACE') history.pop();
        history.push(url);
      }
      writeMemory(owner + ':history', history.slice(-40));
    }
  }, [owner, loading, url, action, location.key, navigate]);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useEffect(() => {
    if (loading || !owner || !isReturnDestination(scrollUrl)) return;
    const key = owner + ':scroll:' + scrollUrl;
    const saved = readMemory<{ x: number; y: number } | null>(key, null);
    let restoring = true;
    let stopped = false;
    let frame = 0;
    const started = performance.now();
    const restore = () => {
      if (stopped) return;
      window.scrollTo({ left: saved?.x || 0, top: saved?.y || 0, behavior: 'instant' });
      // Lazy pages and asynchronously rendered lists can grow after mounting.
      if (saved && window.scrollY < saved.y - 1 && performance.now() - started < 5000) frame = requestAnimationFrame(restore);
      else restoring = false;
    };
    frame = requestAnimationFrame(restore);
    const save = () => { if (!restoring) writeMemory(key, { x: window.scrollX, y: window.scrollY }); };
    const stopRestoring = () => { restoring = false; stopped = true; cancelAnimationFrame(frame); };
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('pagehide', save);
    window.addEventListener('wheel', stopRestoring, { passive: true });
    window.addEventListener('touchstart', stopRestoring, { passive: true });
    window.addEventListener('keydown', stopRestoring);
    return () => {
      save(); stopped = true; cancelAnimationFrame(frame);
      window.removeEventListener('scroll', save); window.removeEventListener('pagehide', save);
      window.removeEventListener('wheel', stopRestoring); window.removeEventListener('touchstart', stopRestoring);
      window.removeEventListener('keydown', stopRestoring);
    };
  }, [owner, loading, scrollUrl]);

  const back = (fallback = '/dashboard') => {
    const history = owner ? readReturnHistory(owner) : [];
    if (history.at(-1) === url) history.pop();
    const target = history.at(-1) || fallback;
    if (owner) writeMemory(owner + ':history', history);
    navigate(target, { replace: true });
  };
  return <BackContext.Provider value={back}>{children}</BackContext.Provider>;
}
