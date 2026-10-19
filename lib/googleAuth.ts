import { supabase, requireConfiguration } from './supabase';
import type { UserProfile } from '../types';

export type GoogleEnrollment = { credential: string; nonce: string; email: string };
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export async function googleRequest(body: Record<string, unknown>) {
  requireConfiguration();
  const { data, error } = await supabase.functions.invoke('rmc-enroll', { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw Object.assign(new Error(details?.error || error.message || 'Unable to connect. Try again.'), { code: details?.code || error.code, status: error.context?.status });
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export async function checkGoogle(credential: string, nonce: string) {
  const result = await googleRequest({ action: 'google', credential, nonce });
  if (result.session) {
    const { error } = await supabase.auth.setSession(result.session);
    if (error) throw error;
  }
  return { ...result, enrollment: { credential, nonce, email: result.email } as GoogleEnrollment };
}
export async function submitGoogleEnrollment(profile: UserProfile, password: string, enrollmentKey: string, google: GoogleEnrollment) {
  const result = await googleRequest({ action: 'enroll', profile, password, enrollmentKey, credential: google.credential, nonce: google.nonce });
  if (result.session) {
    const { error } = await supabase.auth.setSession(result.session);
    if (error) throw error;
  }
  return result;
}
