import { supabase } from './supabase';
import { unitStorageKey } from './educationalUnit';

// This is a display preference, never an account approval or authorization check.
const pending = new Map<string, Promise<boolean>>();
export function claimApprovalNotice(uid: string): Promise<boolean> {
  const existing = pending.get(uid);
  if (existing) return existing;
  const request = (async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (data.user?.id !== uid) throw new Error('Please sign in again to load your account.');
    if (data.user.user_metadata?.approval_notice_seen_at) return false;
    const previouslyOpened = localStorage.getItem(unitStorageKey(`dashboard-opened:${uid}`)) === 'true';
    const saved = await supabase.auth.updateUser({ data: { approval_notice_seen_at: new Date().toISOString() } });
    if (saved.error) throw saved.error;
    return !previouslyOpened;
  })();
  pending.set(uid, request);
  void request.finally(() => { if (pending.get(uid) === request) pending.delete(uid); }).catch(() => undefined);
  return request;
}
