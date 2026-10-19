import { expect, it, vi } from 'vitest';
import { hotState } from './hotState';

it('keeps the loaded roles and identity shared across hot module replacements', () => {
  const data: Record<string, unknown> = {};
  let dispose!: (data: Record<string, unknown>) => void;
  const hot = { data, dispose: (callback: typeof dispose) => { dispose = callback; } };
  const original = hotState(hot, () => ({ uid: 'admin', roles: { ssg: { name: 'SSG Officer' } }, request: 1 }));
  const oldCallback = () => original.roles;
  dispose(data);
  const create = vi.fn();
  const updated = hotState<typeof original>(hot, create);
  expect(create).not.toHaveBeenCalled();
  expect(updated).toBe(original);
  expect(updated.uid).toBe('admin');
  expect(updated.roles.ssg.name).toBe('SSG Officer');
  updated.roles = { ssg: { name: 'Updated SSG' } };
  updated.request++;
  expect(oldCallback().ssg.name).toBe('Updated SSG');
  expect(original.request).toBe(2);
  // Session reset is visible to callbacks from both module versions.
  updated.uid = '';
  updated.roles = {} as typeof original.roles;
  expect(original.uid).toBe('');
  expect(oldCallback()).toEqual({});
});

it('starts with fresh state outside hot reload', () => {
  const create = () => ({ roles: {} });
  expect(hotState(undefined, create)).not.toBe(hotState(undefined, create));
});
