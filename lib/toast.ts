import { classifyError } from './errors';
export { classifyError, errorMessage } from './errors';
export type ToastKind = 'progress' | 'success' | 'error';
export interface ToastItem { id: number; kind: ToastKind; message: string; code?: string; title?: string; phases?: string[]; phase?: number; percent?: number; occurrences?: number; request?: boolean }
export interface OperationProgress {
  step: (phase: number) => void;
  fail: (error: unknown, message?: string) => void;
  complete: (message?: string) => void;
}
export interface ClassifiedError { code: string; message: string }
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let items: ToastItem[] = [];
let sequence = 0;
const reported = new WeakSet<object>();
export const toastStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => items,
};
function emit() { listeners.forEach(listener => listener()); }
function dismiss(id: number) {
  clearTimeout(timers.get(id)); timers.delete(id);
  items = items.filter(item => item.id !== id); emit();
}
function show(kind: ToastKind, message: string, code?: string, id = ++sequence) {
  clearTimeout(timers.get(id));
  let previous = items.find(item => item.id === id);
  let next: ToastItem = { ...previous, id, kind, message, code };
  // Background polling can repeat the same failure. Keep one reviewable entry.
  if (kind === 'error') {
    const duplicates = items.filter(item => item.id !== id && item.kind === 'error' && item.code === code && item.message === message);
    if (duplicates.length) {
      // Update the existing popup in place so its exit animation cannot create
      // a second copy of the same failure.
      next = { ...duplicates[0], ...next, id: duplicates[0].id };
      next.occurrences = 1 + duplicates.reduce((count, item) => count + (item.occurrences || 1), 0);
      for (const duplicate of duplicates) {
        clearTimeout(timers.get(duplicate.id)); timers.delete(duplicate.id);
      }
      items = items.filter(item => item.id !== id && (!duplicates.includes(item) || item.id === next.id));
      id = next.id;
      previous = duplicates[0];
    }
  }
  if (kind === 'success' && previous?.phases) next.percent = 100;
  items = previous ? items.map(item => item.id === id ? next : item) : [...items, next];
  // Active requests and failures stay available until finished or dismissed.
  if (kind === 'success') timers.set(id, setTimeout(() => dismiss(id), 5000));
  emit(); return id;
}

function errorToast(error: unknown, id?: number) {
  const value = error as { name?: string; message?: string; code?: string; details?: string; hint?: string; status?: number } | null;
  const detail = classifyError(error);
  console.error('[Toast] operation failed', {
    appCode: detail.code,
    reference: detail.reference,
    errorName: value?.name,
    errorMessage: value?.message,
    errorCode: value?.code,
    errorDetails: value?.details,
    errorHint: value?.hint,
    errorStatus: value?.status,
  });
  if (typeof error === 'object' && error !== null) {
    if (reported.has(error) && id === undefined) return;
    reported.add(error);
  }
  return show('error', detail.message + (detail.reference ? ` Reference: ${detail.reference}.` : ''), detail.code, id);
}
export const toast = {
  dismiss,
  start(label: string, phases = ['Getting ready', 'Working on it', 'Finishing up'], request = false): OperationProgress {
    const hasAction = () => items.some(item => !item.request && item.kind === 'progress');
    const coveredByAction = request && hasAction();
    const id = request ? ++sequence : show('progress', phases[0]);
    let finished = false;
    let currentPhase = 0;
    const step = (phase: number) => {
      if (finished) return;
      currentPhase = phase;
      items = items.map(item => item.id === id ? { ...item, title: label, request, phases, phase, percent: Math.round(phase / phases.length * 100), message: phases[phase] } : item);
      emit();
    };
    const publish = () => {
      if (request && (coveredByAction || hasAction())) return;
      show('progress', phases[currentPhase], undefined, id); step(currentPhase);
    };
    // Fast background checks stay quiet; longer requests still show progress.
    const delay = request ? setTimeout(publish, 500) : undefined;
    step(0);
    return {
      step,
      complete(message = `${label} completed`) {
        if (finished) return;
        finished = true; clearTimeout(delay);
        // The user action already reports the result of its underlying requests.
        if (request && (coveredByAction || hasAction())) {
          if (items.some(item => item.id === id)) dismiss(id);
          return;
        }
        // Fast background checks stay quiet. Once progress is visible, keep
        // its completion readable instead of removing it immediately.
        if (!request || items.some(item => item.id === id)) show('success', message, undefined, id);
      },
      fail(error, message) {
        if (finished) return;
        clearTimeout(delay);
        if (request && !items.some(item => item.id === id)) publish();
        finished = true;
        const failureId = errorToast(error, id);
        if (message) { items = items.map(item => item.id === failureId ? { ...item, message: `${message} ${item.message}` } : item); emit(); }
      },
    };
  },
  progress: (message: string) => show('progress', message),
  success: (message: string, id?: number) => show('success', message, undefined, id),
  error: errorToast,
  sync<T>(operation: () => T, label: string, success = `${label} completed`): T {
    const id = show('progress', `${label}…`);
    try { const result = operation(); show('success', success, undefined, id); return result; }
    catch (error) { errorToast(error, id); throw error; }
  },
  async track<T>(operation: (progress: OperationProgress) => PromiseLike<T>, label: string, success = `${label} completed`, phases = ['Working on it']) {
    const progress = toast.start(label, phases);
    try { const result = await operation(progress); progress.complete(success); return result; }
    catch (error) { progress.fail(error); throw error; }
  },
  // APIs that resolve with { error } must not show a false success.
  async result<T extends { error?: unknown }>(operation: () => PromiseLike<T>, label: string, success?: string): Promise<T> {
    const progress = toast.start(label, ['Working on it', 'Finishing up']);
    try {
      const result = await operation();
      progress.step(1);
      if (result.error) progress.fail(result.error);
      else progress.complete(success || `${label} completed`);
      return result;
    } catch (error) { progress.fail(error); throw error; }
  },
};
