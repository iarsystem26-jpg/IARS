import { useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { readMemory, writeMemory } from '../lib/navigationMemory';

// Opt in only browsing state; never persist credentials or mutation dialogs.
export function usePageMemory<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const key = (user?.uid || 'guest') + ':ui:' + pathname + ':' + name;
  const fallback = () => typeof initial === 'function' ? (initial as () => T)() : initial;
  const read = () => {
    const defaultValue = fallback();
    const cached = readMemory(key, defaultValue);
    return typeof cached === typeof defaultValue && Array.isArray(cached) === Array.isArray(defaultValue)
      ? cached : defaultValue;
  };
  const [entry, setEntry] = useState(() => ({ key, value: read() }));
  const value = entry.key === key ? entry.value : read();
  const setValue: Dispatch<SetStateAction<T>> = next => {
    setEntry(current => {
      const previous = current.key === key ? current.value : read();
      const updated = typeof next === 'function' ? (next as (value: T) => T)(previous) : next;
      writeMemory(key, updated);
      return { key, value: updated };
    });
  };
  return [value, setValue];
}
