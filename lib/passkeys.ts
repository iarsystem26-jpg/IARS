import { requireConfiguration, supabase } from './supabase';

export type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

export function passkeyUnavailableReason(): string | null {
  if (!window.isSecureContext) return 'Passkeys require HTTPS or localhost. You can still use your password or Google.';
  if (!window.PublicKeyCredential || !navigator.credentials?.create || !navigator.credentials?.get) {
    return 'This browser does not support passkeys. Use your password or Google, or try another browser.';
  }
  const rpId = import.meta.env.VITE_PASSKEY_RP_ID;
  if (rpId && window.location.hostname !== rpId && !window.location.hostname.endsWith(`.${rpId}`)) {
    return `To add or use a passkey, open this app at https://${rpId}. You can still sign in here with your password or Google.`;
  }
  return null;
}

export function passkeyErrorMessage(error: unknown): string {
  const value = error as { code?: string; name?: string; message?: string } | null;
  if (value?.name === 'AbortError') return 'Passkey request cancelled. Please try again.';
  if (value?.name === 'NotAllowedError' || value?.code === 'ERROR_CEREMONY_ABORTED' || value?.code === 'ERROR_PASSTHROUGH_SEE_CAUSE') {
    return 'The passkey request was cancelled or could not be completed. Try again, or use your password or Google.';
  }
  // Some Auth deployments return { code, message } rather than { error_code, msg };
  // the SDK preserves the message but may omit the server's code in that case.
  if (value?.code === 'webauthn_verification_failed' || value?.message === 'Credential verification failed') {
    return 'This passkey could not be verified. Try another passkey, or sign in with your password or Google.';
  }
  const messages: Record<string, string> = {
    passkey_disabled: 'Passkey login is currently unavailable. Use your password or Google.',
    webauthn_credential_exists: 'This passkey is already registered to your account.',
    webauthn_credential_not_found: 'No matching passkey was found. Sign in with your password or Google, then add a passkey in My Profile.',
    webauthn_challenge_expired: 'The passkey request expired. Please try again.',
    too_many_passkeys: 'You have reached the passkey limit. Remove an unused passkey before adding another.',
    email_not_confirmed: 'Confirm your email before adding or using a passkey.',
  };
  return messages[value?.code || ''] || value?.message || 'Unable to complete the passkey request. Please try again.';
}

function requirePasskeyBrowser() {
  requireConfiguration();
  const reason = passkeyUnavailableReason();
  if (reason) throw new Error(reason);
  if (!navigator.onLine) throw new Error('Connect to the internet to add or use a passkey.');
}

export async function signInWithPasskey(signal?: AbortSignal) {
  requirePasskeyBrowser();
  const { data, error } = await supabase.auth.signInWithPasskey({ options: { signal } });
  if (error) throw error;
  if (!data?.session || !data.user) throw new Error('No login session was created. Please try again.');
  // Supabase emits SIGNED_IN; AuthProvider applies the existing approval and MFA checks.
  return data;
}

export async function registerPasskey(signal?: AbortSignal): Promise<Passkey> {
  requirePasskeyBrowser();
  const { data, error } = await supabase.auth.registerPasskey({ options: { signal } });
  if (error) throw error;
  if (!data) throw new Error('The passkey was not saved. Please try again.');
  return data;
}

export async function listPasskeys(): Promise<Passkey[]> {
  requireConfiguration();
  const { data, error } = await supabase.auth.passkey.list();
  if (error) throw error;
  return data || [];
}

export async function removePasskey(passkeyId: string) {
  requireConfiguration();
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  if (error) throw error;
}
