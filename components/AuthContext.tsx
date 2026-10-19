import { subscribeAttendance } from '../lib/liveAttendance';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { UserProfile, UserStats } from '../types';
import { appAuth, appData, refreshData, resetData, subscribeData } from '../lib/backend';
import { supabase, configurationError } from '../lib/supabase';
import { AuthChallenge } from './AuthChallenge';
import { toast } from '../lib/toast';
import ErrorNotice from './ui/ErrorNotice';
import { errorMessage } from '../lib/errors';
import { clearOfflineRosters, refreshCachedRosterProfiles, restoreActiveOfflineScanner, restoreOfflineScanner, syncOfflineAttendance } from '../lib/offlineAttendance';
import { refreshAutomaticRosters } from '../lib/autoRosterSync';
import { hasPermission } from '../lib/accessControl';
import { createIdleSession, sessionIdentity } from '../lib/idleSession';
import { backgroundPollDelay } from '../lib/backgroundPolling';
interface AuthContextType {
  user: { uid: string; email?: string } | null;
  profile: UserProfile | null; stats: UserStats | null;
  loading: boolean; isMock: boolean; error?: string | null; revision?: number; offlineScanner?: boolean; approvalNoticeSeen?: boolean;
  markApprovalNoticeSeen?: () => void;
}
const AuthContext = createContext<AuthContextType>({ user: null, profile: null, stats: null, loading: true, isMock: false });
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const retrySync = useRef<(() => Promise<void>) | null>(null);
  const recoveryOwner = useRef<string | null>(null);
  const [challenge, setChallenge] = useState<'mfa' | 'recovery' | null>(null);
  const [state, setState] = useState<AuthContextType>({ user: null, profile: null, stats: null, loading: true, isMock: false, error: configurationError, revision: 0 });
  useEffect(() => {
    let disposed = false, syncing = false, syncAgain = false;
    let identity: string | null | undefined;
    let identityVersion = 0;
    let welcomePending: string | null = null;
    let rosterAuthorizedVersion = -1;
    let expiredOwner: string | null = null;
    let pollFailures = 0;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const schedulePoll = () => {
      if (poll) clearTimeout(poll);
      if (disposed) return;
      const profile = appAuth.getCurrentUser()?.profile;
      poll = setTimeout(() => {
        if (navigator.onLine && document.visibilityState === 'visible') void sync();
        else schedulePoll();
      }, backgroundPollDelay(profile?.role, Boolean(profile && hasPermission(profile.role, 'attendance.scan')), pollFailures));
    };
    const idleSession = createIdleSession(owner => {
      if (disposed || expiredOwner === owner) return;
      expiredOwner = owner;
      recoveryOwner.current = null;
      identity = null; identityVersion++; rosterAuthorizedVersion = -1; welcomePending = null;
      setChallenge(null);
      resetData();
      setState(s => ({ ...s, user: null, profile: null, stats: null, loading: false, error: null, offlineScanner: false }));
      toast.success('You were signed out after 15 minutes of inactivity. Sign in again to continue.');
      void clearOfflineRosters(owner).catch(error => toast.error(error));
      // Defer Auth calls until the current Auth callback releases its lock.
      // Local scope signs out this browser without interrupting other devices.
      setTimeout(() => {
        if (identity) return; // A fresh login supersedes this deferred logout.
        void supabase.auth.signOut({ scope: 'local' }).then(({ error }) => {
          if (error) console.warn('Session ended locally; server sign-out could not be confirmed.');
        }).catch(() => console.warn('Session ended locally; server sign-out could not be confirmed.'));
      }, 0);
    });
    const refreshRosters = () => {
      const owner = identity, version = identityVersion;
      const profile = appAuth.getCurrentUser()?.profile;
      if (!owner || rosterAuthorizedVersion !== version || profile?.account_status !== 'active' || appData.isUserScopeFrozen(profile) || appData.getSystemFreezeStatus().isFrozen) return;
      const organizations = appData.getOrganizations().filter(org => org.can_manage);
      if (!hasPermission(profile.role, 'attendance.scan') && !organizations.length) return;
      const events = appData.getVisibleEvents(owner).filter(event => (!event.scopeNodeId || !appData.isNodeOrParentFrozen(event.scopeNodeId)) && (hasPermission(profile.role, 'attendance.scan') || organizations.some(org => org.id === event.organizationId)));
      const isCurrent = () => !disposed && identity === owner && identityVersion === version && rosterAuthorizedVersion === version && !appData.isUserScopeFrozen(appAuth.getCurrentUser()?.profile) && !appData.getSystemFreezeStatus().isFrozen;
      const update = hasPermission(profile.role, 'attendance.scan') ? refreshCachedRosterProfiles(owner, appData.getVisibleStudents(owner), isCurrent) : Promise.resolve();
      void update.then(() => refreshAutomaticRosters(owner, events, isCurrent)).catch(error => {
        console.warn('Automatic roster storage is unavailable.', error instanceof Error ? error.message : 'Storage unavailable.');
      });
    };
    const restorePreparedScanner = async () => {
      const version = identityVersion;
      try {
        const roster = await restoreActiveOfflineScanner();
        if (disposed || expiredOwner || navigator.onLine || version !== identityVersion) return;
        if (!roster) { if (!identity) { identity = null; failed(new Error('Reconnect to load your school information and records.')); } return; }
        if (identity && identity !== roster.actorUid) return;
        if (!idleSession.setSession(roster.actorUid)) return;
        identity = roster.actorUid; identityVersion++; resetData(identity);
        setState(s => ({ ...s, user: { uid: roster.actorUid }, profile: roster.actor as UserProfile, stats: null, loading: false, error: null, offlineScanner: true }));
      } catch (error) { failed(error); }
    };
    const failed = (error: unknown) => { if (!disposed) setState(s => ({ ...s, loading: false, error: errorMessage(error) })); };
    const sync = async () => {
      if (disposed || identity === undefined) return;
      if (!navigator.onLine) {
        const owner = identity;
        try {
          const roster = owner ? await restoreOfflineScanner(owner) : undefined;
          if (disposed || identity !== owner) return;
          if (roster) setState(s => ({ ...s, profile: roster.actor as UserProfile, loading: false, error: null, offlineScanner: true }));
          else failed(new Error('Reconnect to load your school information and records.'));
        } catch (error) { failed(error); }
        return;
      }
      if (syncing) { syncAgain = true; return; }
      syncing = true;
      const version = identityVersion;
      let needsMfa = false;
      try {
        if (identity) {
          const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (disposed || version !== identityVersion) return;
          if (error) throw error;
          needsMfa = data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
          if (needsMfa) rosterAuthorizedVersion = -1;
          if (needsMfa) setChallenge('mfa');
          // Recovery is a separate pending action, not a completed login. MFA
          // must lead back to the password form before loading the workspace.
          if (recoveryOwner.current === identity) {
            setChallenge(needsMfa ? 'mfa' : 'recovery');
            return;
          }
        }
        const applied = await refreshData();
        if (disposed || version !== identityVersion) return;
        // A superseded request has not finished loading this session's workspace.
        if (!applied) { syncAgain = true; return; }
        const account = appAuth.getCurrentUser();
        pollFailures = 0;
        rosterAuthorizedVersion = !needsMfa && account?.profile.account_status === 'active' ? version : -1;
        refreshRosters();
        if (welcomePending === identity && account?.profile.account_status === 'active' && !needsMfa && !appData.isUserScopeFrozen(account.profile)) {
          welcomePending = null;
          toast.success(`Welcome back, ${account.profile.name}! Open the notification bell for your latest updates.`);
        }
        // Publish the loaded profile together with readiness so route guards never
        // mistake an account still being hydrated for an admission applicant.
        setState(s => ({ ...s, profile: account && (account.profile.account_status === 'active' || appData.isUserScopeFrozen(account.profile)) ? account.profile : null, stats: account?.stats || null, loading: false, error: null, offlineScanner: false }));
        if (identity && !appData.isUserScopeFrozen(account?.profile) && !appData.getSystemFreezeStatus().isFrozen) void syncOfflineAttendance(identity).catch(error => {
          if (!disposed) console.warn('Attendance remains on this device until synchronization succeeds.', error instanceof Error ? error.message : 'Sync unavailable.');
        });
      }
      catch (error) { if (version === identityVersion) { pollFailures++; failed(error); } }
      finally { syncing = false; schedulePoll(); if (syncAgain && !disposed) { syncAgain = false; void sync(); } }
    };
    retrySync.current = sync;
    const unsubscribeData = subscribeData(changed => {
      if (disposed || !changed) return;
      const account = appAuth.getCurrentUser();
      setState(s => ({ ...s, profile: account && (account.profile.account_status === 'active' || appData.isUserScopeFrozen(account.profile)) ? account.profile : null, stats: account?.stats || null, revision: (s.revision || 0) + 1 }));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (disposed) return;
      const uid = session?.user.id || null;
      if (uid) {
        if (!idleSession.setSession(uid, sessionIdentity(session?.access_token))) return;
        expiredOwner = null;
      } else idleSession.setSession(null);
      // A cached, authorized scanner grant remains usable when an expired Auth
      // token cannot refresh offline. It grants no online writes or other routes.
      if (_event === 'INITIAL_SESSION' && !uid && !navigator.onLine && !expiredOwner) {
        setTimeout(() => void restorePreparedScanner(), 0);
        return;
      }
      setState(s => ({ ...s, approvalNoticeSeen: Boolean(session?.user.user_metadata?.approval_notice_seen_at) }));
      if (recoveryOwner.current !== uid) recoveryOwner.current = null;
      if (_event === 'PASSWORD_RECOVERY' && uid) {
        recoveryOwner.current = uid;
        setChallenge('recovery');
      }
      if (!uid) setChallenge(null);
      if (identity !== uid) {
        const previousOwner = identity;
        if (previousOwner) void clearOfflineRosters(previousOwner).catch(error => toast.error(error));
        rosterAuthorizedVersion = -1;
        identityVersion++;
        pollFailures = 0;
        if (syncing) syncAgain = true;
        identity = uid; resetData(uid);
        welcomePending = uid;
        setState(s => ({ ...s, user: session ? { uid: session.user.id, email: session.user.email } : null, profile: null, stats: null, loading: true, error: null, offlineScanner: false }));
      }
      // Auth callbacks hold a client lock; start database queries after the callback returns.
      setTimeout(() => void sync(), 0);
    });
    if (!navigator.onLine) void restorePreparedScanner();
    schedulePoll();
    const rosterPoll = setInterval(() => { if (navigator.onLine) refreshRosters(); }, 60000);
    const onFocus = () => { if (idleSession.check() && navigator.onLine) void sync(); }; window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    const onRejection = (event: PromiseRejectionEvent) => { toast.error(event.reason); event.preventDefault(); };
    window.addEventListener('unhandledrejection', onRejection);
    const onSyncError = (event: Event) => failed(new Error((event as CustomEvent).detail));
    window.addEventListener('rmc_sync_error', onSyncError);
    if (configurationError) failed(new Error(configurationError));
    return () => { disposed = true; idleSession.dispose(); clearTimeout(poll); clearInterval(rosterPoll); subscription.unsubscribe(); unsubscribeData(); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus); window.removeEventListener('unhandledrejection', onRejection); window.removeEventListener('rmc_sync_error', onSyncError); };
  }, []);
  const scopeFrozen = appData.isUserScopeFrozen(state.profile);
  useEffect(() => {
    if (!state.profile?.uid || !scopeFrozen) return;
    void clearOfflineRosters(state.profile.uid).catch(() => console.warn('Cached scanner data could not be cleared. Access remains frozen.'));
  }, [state.profile?.uid, scopeFrozen]);
  useEffect(() => {
    if (!state.profile?.uid || state.offlineScanner || scopeFrozen) return;
    let disposed = false;
    let refreshing = false;
    let pending = false;
    const refresh = async () => {
      if (refreshing) { pending = true; return; }
      refreshing = true;
      try { await refreshData(); } catch { /* Periodic refresh retries after connection recovery. */ }
      finally { refreshing = false; if (pending && !disposed) { pending = false; void refresh(); } }
    };
    const unsubscribe = subscribeAttendance(state.profile.uid, () => { if (!disposed) void refresh(); });
    return () => { disposed = true; unsubscribe(); };
  }, [state.profile?.uid, state.offlineScanner, scopeFrozen]);
  return <AuthContext.Provider value={{ ...state, markApprovalNoticeSeen: () => setState(s => ({ ...s, approvalNoticeSeen: true })) }}>
    {state.error && <ErrorNotice error={state.error} operation="Load your account"><button className="underline" onClick={() => void retrySync.current?.()}>Retry connection</button></ErrorNotice>}
    {challenge ? <AuthChallenge key={challenge} recovery={challenge === 'recovery'} onComplete={() => {
      if (challenge === 'mfa' && recoveryOwner.current) {
        setChallenge('recovery');
        return;
      }
      if (challenge === 'recovery') recoveryOwner.current = null;
      setChallenge(null);
      void retrySync.current?.();
    }} /> : children}
  </AuthContext.Provider>;
};
export const useAuth = () => useContext(AuthContext);
