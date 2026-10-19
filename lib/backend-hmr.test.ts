import { expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ rpc: vi.fn(), data: {} as Record<string, unknown>, dispose: undefined as undefined | ((data: Record<string, unknown>) => void) }));
vi.mock('./supabase', () => ({ requireConfiguration: () => {}, supabase: { rpc: api.rpc } }));
vi.mock('./hotState', async importOriginal => {
  const original = await importOriginal<typeof import('./hotState')>();
  return { hotState: (_hot: unknown, create: () => unknown) => original.hotState({ data: api.data, dispose: callback => { api.dispose = callback; } }, create) };
});

it('preserves backend identity and roles when the module is replaced and shares subsequent updates', async () => {
  const first = await import('./backend');
  first.resetData('admin');
  const role = { id: 'ssg', name: 'SSG Officer', isBuiltIn: true, isPositionOnly: false, permissions: ['events.manage'] };
  const data = {
    roles: { ssg: role }, nodes: [], sanctions: [], attendance: [],
    profiles: [{ uid: 'admin', name: 'Admin', role: 'admin', account_status: 'active' }],
    events: [], applications: [], excuses: [], settings: {}, audit: [],
  };
  api.rpc.mockResolvedValue({ data, error: null });
  await first.refreshData();
  api.dispose!(api.data);
  vi.resetModules();
  const second = await import('./backend');
  expect(second.appAuth.getCurrentUser()?.profile.uid).toBe('admin');
  expect(second.appData.getCoreRoles().ssg.name).toBe('SSG Officer');

  api.rpc.mockResolvedValue({ data: { ...data, roles: { ssg: { ...role, name: 'Updated SSG' } } }, error: null });
  await second.refreshData();
  expect(api.rpc).toHaveBeenLastCalledWith('rmc_snapshot');
  expect(first.appData.getCoreRoles().ssg.name).toBe('Updated SSG');
  first.resetData();
  expect(second.appAuth.getCurrentUser()).toBeNull();
  expect(second.appData.getCoreRoles()).toEqual({});
});
