import { createClient } from '@supabase/supabase-js';
import { backendFetch } from './backendFetch';
import { unitStorageKey } from './educationalUnit';
import { runtimeBackend } from './institutionRuntime';
import type { UnitDeletionPlan, UnitDeletionAccess, UnitDeletionPreview } from './unitDeletion';

const url = runtimeBackend.url;
const key = runtimeBackend.key;
export const configurationError = !url || !key
  ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.'
  : null;

// No privileged key, local database, or demo fallback is shipped to the browser.
export const supabase = createClient(url || 'https://unconfigured.supabase.co', key || 'unconfigured', {
  global: { fetch: backendFetch },
  auth: { storageKey: unitStorageKey('auth'), persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, experimental: { passkey: true } },
});

export function requireConfiguration() {
  if (configurationError) throw new Error(configurationError);
}

// Only the freshly password-authenticated session can invoke the server action.
async function verifyPrivilegedAction(password: string, code: string, typed: string, enrollmentSettings?: Record<string, unknown> | null) {
  requireConfiguration();
  if (typed !== 'initiate') throw new Error('Type initiate exactly to confirm.');
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) throw new Error('Sign in again before continuing.');
  const verifier = createClient(url, key, { global: { fetch: backendFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: unitStorageKey('refresh-verification') } });
  try {
    const login = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (login.error || login.data.user?.id !== user.id) throw new Error('Incorrect current password.');
    const factors = await verifier.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const all = factors.data.all || factors.data.totp;
    const verifiedFactors = all.filter(factor => factor.status === 'verified');
    if (verifiedFactors.length) {
      const factor = factors.data.totp.find(factor => factor.status === 'verified');
      if (!factor) throw new Error('An enrolled authenticator is required to verify this action.');
      const verification = await verifier.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (verification.error) throw new Error('Invalid or expired authenticator code.');
    }
    const result = enrollmentSettings !== undefined
      ? await verifier.rpc('rmc_set_enrollment_confirmation', { confirmation: typed, settings: enrollmentSettings })
      : await verifier.rpc('rmc_initiate_app_refresh', { confirmation: typed });
    if (result.error) throw result.error;
    return result.data;
  } finally { await verifier.auth.signOut({ scope: 'local' }); }
}

export const initiateAppRefresh = (password: string, code: string, typed: string) => verifyPrivilegedAction(password, code, typed);
export const configureEnrollmentConfirmation = (password: string, code: string, typed: string, settings: Record<string, unknown> | null) => verifyPrivilegedAction(password, code, typed, settings);

export type SensitiveConfirmation = { password: string; code: string; typedAction: string; typedName: string; reason: string; deletionPlan?: UnitDeletionPlan };

export async function sensitiveActionRequiresMfa() {
  requireConfiguration();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data.all || data.totp).some(factor => factor.status === 'verified');
}

// A separate, short-lived session proves the password and any enrolled MFA without changing the
// active browser session. Neither credential is sent to the command/audit API.
async function authenticateSensitiveSession(password: string, code: string) {
  requireConfiguration();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) throw new Error('Sign in again before continuing.');
  // This flow renders its own busy/error feedback. Avoid global sign-in and RPC
  // success toasts covering the review while verifying a temporary session.
  const verifier = createClient(url, key, { global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: unitStorageKey('sensitive-action') } });
  try {
    const login = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (login.error || login.data.user?.id !== user.id) throw new Error('Incorrect current password.');
    const factors = await verifier.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    const factor = factors.data.totp.find(item => item.status === 'verified');
    if ((factors.data.all || factors.data.totp).some(item => item.status === 'verified')) {
      if (!factor) throw new Error('An enrolled authenticator is required to verify this action.');
      const verified = await verifier.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
      if (verified.error) throw new Error('Invalid or expired Google Authenticator code. Try the latest code.');
    }
    return verifier;
  } catch (error) {
    await verifier.auth.signOut({ scope: 'local' });
    throw error;
  }
}

export async function executeSensitiveAction(action: string, target: string, confirmation: SensitiveConfirmation) {
  const verifier = await authenticateSensitiveSession(confirmation.password, confirmation.code);
  try {
    const { typedAction, typedName, reason } = confirmation;
    const { data, error } = action === 'deleteSchoolNodeReviewed'
      ? await verifier.rpc('rmc_delete_unit_reviewed', { target, confirmation: { typedAction, typedName, reason }, plan: confirmation.deletionPlan })
      : await verifier.rpc('rmc_command', { action, args: [target, { typedAction, typedName, reason }] });
    if (error) throw error;
    if (data === false) throw new Error('This record has linked records or children. Archive it instead.');
    return data;
  } finally { await verifier.auth.signOut({ scope: 'local' }); }
}

// Keep only the short-lived verified session in memory. Password and MFA code are
// discarded before review; closing the flow revokes the temporary session.
export async function beginVerifiedUnitDeletion(target: string, password: string, code: string): Promise<UnitDeletionAccess> {
  const verifier = await authenticateSensitiveSession(password, code);
  const expiresAt = Date.now() + 110_000;
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await verifier.auth.signOut({ scope: 'local' }); } };
  const check = () => { if (closed || Date.now() >= expiresAt) throw new Error('Verify your identity again to continue. Your selections are saved.'); };
  const reload = async () => {
    check();
    const { data, error } = await verifier.rpc('rmc_preview_unit_deletion', { target });
    if (error) throw error;
    return data as UnitDeletionPreview;
  };
  try {
    const preview = await reload();
    return { preview, expiresAt, reload, close, confirm: async (confirmation, plan) => {
      check();
      const { data, error } = await verifier.rpc('rmc_delete_unit_reviewed', { target, confirmation, plan });
      if (error) throw error;
      await close();
      return data;
    } };
  } catch (error) { await close(); throw error; }
}

// Reauthentication must not downgrade the active browser's verified MFA session.
export async function verifyPassword(email: string, password: string) {
  requireConfiguration();
  const verifier = createClient(url, key, { global: { fetch: backendFetch }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: unitStorageKey('password-verification') } });
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  if (!error) await verifier.auth.signOut({ scope: 'local' });
  return !error;
}
