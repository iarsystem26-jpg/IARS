import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  user: vi.fn(), activeRpc: vi.fn(), login: vi.fn(), factors: vi.fn(), verify: vi.fn(), rpc: vi.fn(), signOut: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: (_url: string, _key: string, options: any) => options.auth.persistSession === false
  ? { auth: { signInWithPassword: api.login, mfa: { listFactors: api.factors, challengeAndVerify: api.verify }, signOut: api.signOut }, rpc: api.rpc }
  : { auth: { getUser: api.user }, rpc: api.activeRpc } }));

beforeEach(() => {
  vi.resetAllMocks(); vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  api.user.mockResolvedValue({ data: { user: { id: 'actor', email: 'actor@example.edu' } } });
  api.login.mockResolvedValue({ data: { user: { id: 'actor' } } });
  api.factors.mockResolvedValue({ data: { totp: [{ id: 'factor', status: 'verified' }] } });
  api.verify.mockResolvedValue({}); api.rpc.mockResolvedValue({ data: true }); api.signOut.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());
const confirmation = { password: 'secret-password', code: '123456', typedAction: 'DELETE', typedName: 'Unit', reason: 'Duplicate unit' };
it('opens and saves enrollment settings only through the freshly verified session', async () => {
  const { configureEnrollmentConfirmation } = await import('./supabase');
  await configureEnrollmentConfirmation('current-secret', '123456', 'initiate', null);
  expect(api.rpc).toHaveBeenCalledWith('rmc_set_enrollment_confirmation', { confirmation: 'initiate', settings: null });
  await configureEnrollmentConfirmation('current-secret', '123456', 'initiate', { mode: 'required' });
  expect(api.rpc).toHaveBeenCalledWith('rmc_set_enrollment_confirmation', { confirmation: 'initiate', settings: { mode: 'required' } });
  expect(api.activeRpc).not.toHaveBeenCalled();
  expect(JSON.stringify(api.rpc.mock.calls)).not.toContain('current-secret');
});

it('executes using the freshly verified MFA session and sends no password or code to the command RPC', async () => {
  const { executeSensitiveAction } = await import('./supabase');
  await expect(executeSensitiveAction('deleteSchoolNode', 'unit', confirmation)).resolves.toBe(true);
  expect(api.verify).toHaveBeenCalledWith({ factorId: 'factor', code: confirmation.code });
  expect(api.rpc).toHaveBeenCalledWith('rmc_command', { action: 'deleteSchoolNode', args: ['unit', { typedAction: 'DELETE', typedName: 'Unit', reason: 'Duplicate unit' }] });
  expect(api.activeRpc).not.toHaveBeenCalled();
  expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(JSON.stringify(api.rpc.mock.calls)).not.toContain(confirmation.password);
  expect(JSON.stringify(api.rpc.mock.calls)).not.toContain(confirmation.code);
});
it.each(['wrong-account', 'unsupported-factor', 'factor-fetch', 'invalid-code'])('blocks the command after %s verification and cleans up the temporary session', async failure => {
  if (failure === 'wrong-account') api.login.mockResolvedValue({ data: { user: { id: 'other' } } });
  if (failure === 'unsupported-factor') api.factors.mockResolvedValue({ data: { all: [{ id: 'phone', status: 'verified' }], totp: [] } });
  if (failure === 'factor-fetch') api.factors.mockResolvedValue({ error: new Error('Unavailable') });
  if (failure === 'invalid-code') api.verify.mockResolvedValue({ error: { message: 'Invalid code' } });
  const { executeSensitiveAction } = await import('./supabase');
  await expect(executeSensitiveAction('deleteSchoolNode', 'unit', confirmation)).rejects.toThrow();
  expect(api.rpc).not.toHaveBeenCalled(); expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it('allows password-confirmed deletion without enrolling an authenticator', async () => {
  api.factors.mockResolvedValue({ data: { all: [{ status: 'unverified' }], totp: [] } });
  const { executeSensitiveAction } = await import('./supabase');
  await expect(executeSensitiveAction('deleteSchoolNode', 'unit', { ...confirmation, code: '' })).resolves.toBe(true);
  expect(api.verify).not.toHaveBeenCalled();
  expect(api.rpc).toHaveBeenCalledOnce();
  expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it('preserves a rejected deletion without reporting success', async () => {
  api.rpc.mockResolvedValue({ data: false });
  const { executeSensitiveAction } = await import('./supabase');
  await expect(executeSensitiveAction('deleteSchoolNode', 'unit', confirmation)).rejects.toThrow('Archive it instead');
  expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

it('submits a reviewed plan through the freshly authenticated session without credentials in the payload', async () => {
  const { executeSensitiveAction } = await import('./supabase');
  const deletionPlan = { version: 'v1', deleteKeys: ['unit:unit'], transfers: { 'account:kept': 'destination' } };
  await executeSensitiveAction('deleteSchoolNodeReviewed', 'unit', { ...confirmation, deletionPlan });
  expect(api.rpc).toHaveBeenCalledWith('rmc_delete_unit_reviewed', {
    target: 'unit', confirmation: { typedAction: 'DELETE', typedName: 'Unit', reason: 'Duplicate unit' }, plan: deletionPlan,
  });
  expect(JSON.stringify(api.rpc.mock.calls)).not.toContain(confirmation.password);
  expect(JSON.stringify(api.rpc.mock.calls)).not.toContain(confirmation.code);
  expect(api.activeRpc).not.toHaveBeenCalled();
});

it('verifies before loading the review and uses that temporary session for confirmation', async () => {
  const { beginVerifiedUnitDeletion } = await import('./supabase');
  api.rpc.mockResolvedValueOnce({ data: { version: 'v1', records: [], destinations: [] } }).mockResolvedValueOnce({ data: { deleted: 1 } });
  const access = await beginVerifiedUnitDeletion('unit', confirmation.password, confirmation.code);
  expect(api.login).toHaveBeenCalledWith({ email: 'actor@example.edu', password: confirmation.password });
  expect(api.verify).toHaveBeenCalled();
  expect(api.rpc).toHaveBeenCalledWith('rmc_preview_unit_deletion', { target: 'unit' });
  expect(api.signOut).not.toHaveBeenCalled();
  const plan = { version: 'v1', deleteKeys: ['unit:unit'], transfers: {} };
  const details = { typedAction: 'DELETE', typedName: 'Unit', reason: 'Duplicate unit' };
  await access.confirm(details, plan);
  expect(api.rpc).toHaveBeenLastCalledWith('rmc_delete_unit_reviewed', { target: 'unit', confirmation: details, plan });
  expect(api.activeRpc).not.toHaveBeenCalled();
  expect(api.signOut).toHaveBeenCalledOnce();
  await expect(access.reload()).rejects.toThrow('Verify your identity again');
  expect(JSON.stringify(api.rpc.mock.calls)).not.toContain(confirmation.password);
  expect(JSON.stringify(api.rpc.mock.calls)).not.toContain(confirmation.code);
});

it('closes verification when preview fails and never requests records after a rejected password', async () => {
  const { beginVerifiedUnitDeletion } = await import('./supabase');
  api.login.mockResolvedValueOnce({ error: new Error('Incorrect password'), data: {} });
  await expect(beginVerifiedUnitDeletion('unit', 'bad', '')).rejects.toThrow('Incorrect current password');
  expect(api.rpc).not.toHaveBeenCalled();
  api.rpc.mockResolvedValueOnce({ error: new Error('Permission denied') });
  await expect(beginVerifiedUnitDeletion('unit', confirmation.password, confirmation.code)).rejects.toThrow('Permission denied');
  expect(api.signOut).toHaveBeenCalledTimes(2);
});

it.each([true, false])('refresh reauthenticates with password and uses MFA only when enrolled (%s)', async enrolled => {
  if (!enrolled) api.factors.mockResolvedValue({ data: { totp: [] } });
  const { initiateAppRefresh } = await import('./supabase');
  await initiateAppRefresh('current-secret', '123456', 'initiate');
  expect(api.login).toHaveBeenCalledWith({ email: 'actor@example.edu', password: 'current-secret' });
  expect(api.verify).toHaveBeenCalledTimes(enrolled ? 1 : 0);
  expect(api.rpc).toHaveBeenCalledWith('rmc_initiate_app_refresh', { confirmation: 'initiate' });
  expect(api.activeRpc).not.toHaveBeenCalled();
  expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it.each(['wrong-password', 'wrong-account', 'invalid-mfa', 'factor-fetch', 'server-denied'])('refresh fails closed on %s', async failure => {
  if (failure === 'wrong-password') api.login.mockResolvedValue({ error: {}, data: {} });
  if (failure === 'wrong-account') api.login.mockResolvedValue({ data: { user: { id: 'other' } } });
  if (failure === 'invalid-mfa') api.verify.mockResolvedValue({ error: {} });
  if (failure === 'factor-fetch') api.factors.mockResolvedValue({ error: new Error('Unavailable') });
  if (failure === 'server-denied') api.rpc.mockResolvedValue({ error: new Error('Forbidden') });
  const { initiateAppRefresh } = await import('./supabase');
  await expect(initiateAppRefresh('secret', '123456', 'initiate')).rejects.toThrow();
  if (failure !== 'server-denied') expect(api.rpc).not.toHaveBeenCalled();
  expect(api.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it('requires the exact typed refresh confirmation before requesting credentials', async () => {
  const { initiateAppRefresh } = await import('./supabase');
  await expect(initiateAppRefresh('secret', '', 'INITIATE')).rejects.toThrow('Type initiate');
  expect(api.login).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
});
