import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyError, toast, toastStore } from './toast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { toastStore.getSnapshot().forEach(item => toast.dismiss(item.id)); vi.useRealTimers(); });
describe('action feedback', () => {
  it.each([
    { status: 400, message: 'Attendance is frozen for your unit.' },
    { status: 403, code: '42501', message: 'Operations are frozen for this school or class.' },
    { message: 'Enrollment is frozen.' },
  ])('explains a freeze instead of reporting invalid input or permissions', error => {
    expect(classifyError(error)).toMatchObject({ code: 'FREEZE-001', owner: 'school', message: expect.stringContaining('Contact your school officer') });
  });
  it('identifies a missing server function instead of a deleted student record', () => {
    expect(classifyError({ status: 404, code: 'PGRST202' })).toMatchObject({ code: 'SYS-002', owner: 'developer', message: expect.stringContaining('update the backend') });
  });
  it('replaces progress with success and automatically dismisses it', async () => {
    let finish!: (value: number) => void;
    const operation = toast.track(() => new Promise<number>(resolve => { finish = resolve; }), 'Save');
    const initial = toastStore.getSnapshot()[0];
    expect(initial.kind).toBe('progress');
    finish(42);
    expect(await operation).toBe(42);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ id: initial.id, kind: 'success', message: 'Save completed', percent: 100 });
    vi.advanceTimersByTime(5000);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });
  it('preserves rejection, hides raw details and suppresses duplicate unhandled feedback', async () => {
    const error = new Error('network failed at secret-internal-host');
    await expect(toast.track(() => Promise.reject(error), 'Save')).rejects.toBe(error);
    toast.error(error);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'error', code: 'NET-001' });
    expect(toastStore.getSnapshot()[0].message).not.toContain('secret');
    vi.advanceTimersByTime(7000);
    expect(toastStore.getSnapshot()).toHaveLength(1);
    toast.dismiss(toastStore.getSnapshot()[0].id);
    expect(toastStore.getSnapshot()).toHaveLength(0);
  });
  it('does not report success for resolved API errors', async () => {
    const response = { error: { status: 403 } };
    expect(await toast.result(() => Promise.resolve(response), 'Save')).toBe(response);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'error', code: 'ACCESS-001' });
  });
  it('keeps all concurrent operations visible until they finish', async () => {
    for (let index = 0; index < 5; index++) toast.progress('Working');
    expect(toastStore.getSnapshot()).toHaveLength(5);
    vi.advanceTimersByTime(120000);
    expect(toastStore.getSnapshot()).toHaveLength(5);
  });
  it.each([[401, 'AUTH-001'], [403, 'ACCESS-001'], [409, 'DATA-001'], [404, 'DATA-002'], [413, 'FILE-001'], [422, 'INPUT-001'], [429, 'LIMIT-001'], [500, 'SYS-001']])('classifies status %s', (status, code) => {
    expect(classifyError({ status }).code).toBe(code);
  });
});

it('retains the failed phase and cannot overwrite partial success with full success', async () => {
  const result = await toast.track(async progress => {
    progress.step(1);
    progress.fail(new Error('network'), 'Saved, but refresh failed.');
    return 42;
  }, 'Save', undefined, ['Write record', 'Refresh data']);
  expect(result).toBe(42);
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'error', phase: 1, percent: 50, message: expect.stringContaining('Saved, but refresh failed.') });
});
it('isolates the phases of simultaneous operations', () => {
  const first = toast.start('First', ['Upload', 'Save']);
  const second = toast.start('Second', ['Check', 'Send', 'Read']);
  first.step(1);
  second.fail(new Error('network'));
  first.complete();
  expect(toastStore.getSnapshot()).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: 'First', kind: 'success', percent: 100 }),
    expect.objectContaining({ title: 'Second', kind: 'error', phase: 0, percent: 0 }),
  ]));
});
it('consolidates recurring polling failures without hiding their phase', () => {
  toast.start('Refresh data').fail(new Error('network'));
  const id = toastStore.getSnapshot()[0].id;
  toast.start('Refresh data').fail(new Error('network'));
  expect(toastStore.getSnapshot()).toHaveLength(1);
  expect(toastStore.getSnapshot()[0]).toMatchObject({ id, kind: 'error', phase: 0, occurrences: 2 });
});

it('keeps quick background checks quiet and retains visible completions for five seconds', () => {
  const quick = toast.start('Checking your account', ['Working on it'], true);
  quick.complete();
  vi.advanceTimersByTime(500);
  expect(toastStore.getSnapshot()).toHaveLength(0);
  const slow = toast.start('Loading your information', ['Working on it'], true);
  vi.advanceTimersByTime(500);
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'progress', request: true });
  slow.complete();
  expect(toastStore.getSnapshot()[0]).toMatchObject({ kind: 'success', message: 'Loading your information completed' });
  vi.advanceTimersByTime(4999);
  expect(toastStore.getSnapshot()).toHaveLength(1);
  vi.advanceTimersByTime(1);
  expect(toastStore.getSnapshot()).toHaveLength(0);
});
it('shows one brief error when a request and its action report the same problem', () => {
  const action = toast.start('Save contact details');
  toast.start('Saving your changes', undefined, true).fail(new Error('network'));
  action.fail(new Error('network'));
  expect(toastStore.getSnapshot()).toHaveLength(1);
  expect(toastStore.getSnapshot()[0]).toMatchObject({ message: expect.stringContaining('check whether your change was saved'), code: 'NET-001' });
});
it('retains the action context when merging a request failure', () => {
  const action = toast.start('Save contact details');
  toast.start('Saving your changes', undefined, true).fail(new Error('network'));
  action.fail(new Error('network'), 'Saved, but refresh failed.');
  expect(toastStore.getSnapshot()).toHaveLength(1);
  expect(toastStore.getSnapshot()[0]).toMatchObject({ title: 'Save contact details', message: expect.stringContaining('Saved, but refresh failed.') });
});
it('gives an updated success toast its full duration', () => {
  const id = toast.success('Saved');
  vi.advanceTimersByTime(4900);
  toast.success('Updated', id);
  vi.advanceTimersByTime(4999);
  expect(toastStore.getSnapshot()).toEqual([expect.objectContaining({ id, message: 'Updated' })]);
  vi.advanceTimersByTime(1);
  expect(toastStore.getSnapshot()).toHaveLength(0);
});

it('reports one success for an action and its slower underlying requests', () => {
  const action = toast.start('Update account');
  const request = toast.start('Updating account details', undefined, true);
  vi.advanceTimersByTime(1000);
  expect(toastStore.getSnapshot()).toEqual([expect.objectContaining({ title: 'Update account', kind: 'progress' })]);
  request.complete();
  action.complete('Account updated');
  expect(toastStore.getSnapshot()).toEqual([expect.objectContaining({ title: 'Update account', kind: 'success', message: 'Account updated' })]);
  vi.advanceTimersByTime(5000);
  expect(toastStore.getSnapshot()).toHaveLength(0);
});

it('does not publish a delayed nested request after its owning action finishes', () => {
  const action = toast.start('Save');
  const request = toast.start('Saving your changes', undefined, true);
  action.complete();
  vi.advanceTimersByTime(600);
  request.complete();
  expect(toastStore.getSnapshot()).toEqual([expect.objectContaining({ title: 'Save', kind: 'success' })]);
});
it('explains the offline roster preparation window instead of reporting invalid input', () => {
  expect(classifyError({ status: 400, code: '22023', message: 'Prepare an approved ongoing event or one starting within 24 hours.' })).toMatchObject({ code: 'ROSTER-001', owner: 'user', message: expect.stringContaining('within 24 hours') });
});
