import { retainedUploadFile } from './fileUploads';
import { requestAuthEmail } from './emailDelivery';
import { hotState } from './hotState';
import { reconcileData } from './reconcileData';
import { toast, type OperationProgress } from './toast';
import { supabase, requireConfiguration, verifyPassword, executeSensitiveAction, type SensitiveConfirmation } from './supabase';
import { UserProfile, UserStats, Application, AppEvent, SchoolNode, ExcuseApplication, CoreRole, CustomRole, PaymentInfo, SystemFreezeState, NodeFreezeState, Organization, OrganizationMembership, OrganizationSanctionRequest } from '../types';
import { setMockDataRef, hasPermission } from './accessControl';
import { findNodeById, findNodePath, flattenDirectory, getDirectorySubtree, isNodeInSubtree, profileMatchesDirectorySection } from './academicDirectory';
import { isEventRecipient, canManageEventInScope } from './eventAudience';
import { publicDriveImageUrl } from './googleDrive';
import { googleRequest } from './googleAuth';
import { clearOfflineRosters } from './offlineAttendance';

type Student = UserProfile & { stats: UserStats; sanction_logs: any[] };
type Snapshot = {
  organizations?: Organization[];
  organization_members?: OrganizationMembership[];
  organization_sanctions?: OrganizationSanctionRequest[];
  users: Record<string, { profile: UserProfile; stats: UserStats }>;
  applications: Record<string, Application>; excuse_applications: Record<string, ExcuseApplication>;
  events: Record<string, AppEvent>; attendance_logs: Record<string, Record<string, any>>;
  attendance: any[]; sanction_logs: Record<string, any[]>; school_structure: SchoolNode[];
  system_freeze: SystemFreezeState; frozen_nodes: Record<string, NodeFreezeState>;
  core_roles: Record<string, CoreRole>; custom_roles: Record<string, CustomRole>;
  payment_info: PaymentInfo; audit_logs: any[];
};
const empty = (): Snapshot => ({ users: {}, applications: {}, excuse_applications: {}, events: {}, attendance_logs: {}, attendance: [], sanction_logs: {}, school_structure: [], system_freeze: { isFrozen: false, reason: '' }, frozen_nodes: {}, core_roles: {}, custom_roles: {}, payment_info: { status: 'unpaid', amountDue: 0, currency: 'PHP', dueDate: 0, billingCycle: '', accountName: '', schoolId: '', reminders: [] }, audit_logs: [] });
const backendState = hotState(import.meta.hot, () => ({
  snapshot: empty(),
  generation: 0,
  snapshotRequest: 0,
  currentUserId: null as string | null,
  lastSync: null as number | null,
  latency: 0,
  lastSyncFailed: false,
  syncFailures: 0,
  syncSuccesses: 0,
  latencySamples: [] as { time: number; ms: number }[],
}));
const getDB = () => backendState.snapshot;
const getAssignmentNodeId = (p: UserProfile) => p.official_data?.assignment_node_id || p.school_data?.academic_assignment?.terminalGroupId;
const getAccountProfiles = (db: Snapshot) => Object.values(db.users).map(u => u.profile);
const profileBelongsToScope = (db: Snapshot, profile: UserProfile, id: string) => isNodeInSubtree(db.school_structure, id, getAssignmentNodeId(profile) || '');
// Every completed read lets independent queues refresh; only changed snapshots
// need to advance the shared workspace revision.
export const subscribeData = (callback: (changed: boolean) => void) => {
  const listener = (event: Event) => callback((event as CustomEvent).detail?.changed !== false);
  window.addEventListener('rmc_data_update', listener);
  return () => window.removeEventListener('rmc_data_update', listener);
};
export const notifyAuthChange = (changed = true) => window.dispatchEvent(new CustomEvent('rmc_data_update', { detail: { changed } }));
export function resetData(uid: string | null = null) { backendState.generation++; backendState.currentUserId = uid; backendState.snapshot = empty(); backendState.lastSync = null; backendState.lastSyncFailed = false; backendState.syncFailures = 0; backendState.syncSuccesses = 0; backendState.latencySamples = []; backendState.latency = 0; notifyAuthChange(); }
function tree(rows: any[]): SchoolNode[] {
  const nodes = new Map<string, SchoolNode>(rows.map(r => [r.id, { ...r.data, id: r.id, children: [] }]));
  const roots: SchoolNode[] = [];
  rows.forEach(r => { const node = nodes.get(r.id)!; const parent = nodes.get(r.parent_id); (parent?.children || roots).push(node); });
  return roots;
}
export async function refreshData() {
  requireConfiguration();
  const requestGeneration = backendState.generation;
  const request = ++backendState.snapshotRequest;
  const started = performance.now();
  if (!backendState.currentUserId) {
    const { data, error } = await supabase.from('rmc_nodes').select('id,parent_id,data');
    if (error) { console.error('[Supabase] school structure refresh failed', error); throw error; }
    if (requestGeneration !== backendState.generation || request !== backendState.snapshotRequest) return false;
    const previous = backendState.snapshot.school_structure;
    backendState.snapshot.school_structure = reconcileData(previous, tree(data || []));
    notifyAuthChange(previous !== backendState.snapshot.school_structure); return true;
  }
  const { data, error } = await supabase.rpc('rmc_snapshot');
  if (error) { if (requestGeneration === backendState.generation && request === backendState.snapshotRequest) { backendState.lastSyncFailed = true; backendState.syncFailures++; notifyAuthChange(); } console.error('[Supabase] snapshot refresh failed', error); throw error; }
  if (requestGeneration !== backendState.generation || request !== backendState.snapshotRequest) return false;
  const next = empty();
  next.organizations = data.organizations || [];
  next.organization_members = data.organization_members || [];
  next.organization_sanctions = data.organization_sanctions || [];
  next.school_structure = tree(data.nodes);
  for (const [id, role] of Object.entries(data.roles)) (role as CoreRole).isBuiltIn ? next.core_roles[id] = role as CoreRole : next.custom_roles[id] = role as CustomRole;
  for (const s of data.sanctions) (next.sanction_logs[s.student_id] ||= []).push(s.data);
  const attendanceByStudent = new Map<string, any[]>();
  const meritByStudent = new Map<string, number>();
  const organizationsByStudent = new Map<string, string[]>();
  for (const credit of data.merit_credits || []) meritByStudent.set(credit.student_id, (meritByStudent.get(credit.student_id) ?? 0) + Number(credit.hours));
  for (const membership of next.organization_members) if (membership.status === 'approved') {
    const ids = organizationsByStudent.get(membership.student_id) || [];
    ids.push(membership.organization_id); organizationsByStudent.set(membership.student_id, ids);
  }
  for (const a of data.attendance) {
    next.attendance.push(a);
    const studentRecords = attendanceByStudent.get(a.student_id) || [];
    studentRecords.push(a); attendanceByStudent.set(a.student_id, studentRecords);
    const logs = next.attendance_logs[a.event_id] ||= {};
    const previous = logs[a.student_id];
    // Each window remains available in records; reports summarize the worst recorded status.
    const rank = { absent: 4, late: 3, present: 2, excused: 1 };
    if (!previous || rank[a.data.status as keyof typeof rank] > rank[previous.status as keyof typeof rank]) logs[a.student_id] = a.data;
  }
  for (const p of data.profiles as UserProfile[]) {
    p.organizationIds = organizationsByStudent.get(p.uid) || [];
    const attendance = attendanceByStudent.get(p.uid) || [];
    const attended = new Set(attendance.filter((a: any) => ['present', 'late', 'excused'].includes(a.data.status)).map((a: any) => a.event_id)).size;
    const missed = new Set(attendance.filter((a: any) => a.data.status === 'absent').map((a: any) => a.event_id)).size;
    next.users[p.uid] = { profile: p, stats: { merit_hours: meritByStudent.get(p.uid) ?? 0, events_attended: attended, events_missed: missed, attendance_rate: attendance.length ? Math.round(attendance.filter((a: any) => a.data.status !== 'absent').length / attendance.length * 100) : 0, sanction_hours: Math.max(0, (next.sanction_logs[p.uid] || []).reduce((sum, s) => sum + Number(s.change), 0)) } };
  }
  for (const item of data.events) next.events[item.id] = item;
  for (const item of data.applications) next.applications[item.id] = item;
  for (const item of data.excuses) next.excuse_applications[item.id] = item;
  next.system_freeze = data.settings.system_freeze || next.system_freeze;
  next.frozen_nodes = data.settings.frozen_nodes || {};
  next.payment_info = data.settings.payment_info || next.payment_info;
  next.audit_logs = data.audit;
  const previous = backendState.snapshot;
  backendState.snapshot = reconcileData(previous, next); backendState.lastSync = Date.now(); backendState.latency = Math.round(performance.now() - started);
  backendState.lastSyncFailed = false; backendState.syncSuccesses++; backendState.latencySamples = [...backendState.latencySamples.slice(-29), { time: backendState.lastSync, ms: backendState.latency }];
  notifyAuthChange(previous !== backendState.snapshot);
  return true;
}

async function rpc<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  requireConfiguration();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const rpcError = error as typeof error & { status?: number };
    const loggedArgs = name === 'rmc_organization_command' ? {
      ...args, payload: { ...(args.payload as Record<string, unknown>), key: '[redacted]' },
    } : { ...args };
    for (const field of ['token', 'qr_token', 'access_token', 'refresh_token']) if (field in loggedArgs) loggedArgs[field] = '[redacted]';
    console.error('[Supabase] RPC failed', {
      name,
      args: loggedArgs,
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      errorDetails: error.details,
      errorHint: error.hint,
      errorStatus: rpcError.status,
      errorRaw: JSON.stringify(error),
    });
    throw error;
  }
  return data as T;
}

export type EnrollmentLookup = { found: boolean; status?: 'pending' | 'approved' | 'rejected' | 'bounced' | 'deleted'; submittedAt?: number; reviewedAt?: number; rejectionReason?: string; clarificationFields?: string[]; namePreview?: string; emailPreview?: string; sectionPreview?: string };
export async function lookupEnrollment(studentId: string): Promise<EnrollmentLookup> {
  return rpc<EnrollmentLookup>('rmc_lookup_enrollment', { lookup_student_id: studentId.trim() });
}
function trackWrite<T>(operation: (progress: OperationProgress) => PromiseLike<T>, label: string, success?: string) {
  return toast.track(operation, label, success, ['Saving your changes', 'Updating your screen']);
}
async function refreshAfterWrite(progress?: OperationProgress) {
  progress?.step(1);
  try { await refreshData(); }
  catch (error) { progress?.fail(error, 'Changes saved. Could not refresh the page.'); console.error('[Supabase] refresh after write failed', error); window.dispatchEvent(new CustomEvent('rmc_sync_error', { detail: 'Your change was saved, but the latest data could not be loaded. Reconnect or refresh the page.' })); }
}
async function command<T = any>(action: string, args: unknown[]): Promise<T> {
  return trackWrite(async (progress) => {
  const result = await rpc<T>('rmc_command', { action, args });
  await refreshAfterWrite(progress);
  return result;

  }, action.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()));
}
async function accounts(action: string, data: unknown) {
  const operation = async (progress?: OperationProgress) => {
  const { data: result, error } = await supabase.functions.invoke('rmc-accounts', { body: { action, data } });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw Object.assign(new Error(body?.error || error.message), { code: body?.code || error.code, status: error.context?.status });
  }
  if (result.error) throw new Error(result.error);
  if (action !== 'access') await refreshAfterWrite(progress);
  return result;

  };
  // Access status is a read, already represented by the table's loading state.
  if (action === 'access') return operation();
  const labels: Record<string, string> = { create: 'Create accounts', deactivate: 'Deactivate account', reset_password: 'Reset account password' };
  return trackWrite(operation, labels[action] || 'Update account');
}
export const appAuth = {
  async resendConfirmation(email: string) {
    requireConfiguration();
    return requestAuthEmail('confirmation',email);
  },
  async signIn(identifier: string, password: string) {
  return toast.track(async (progress) => {
    requireConfiguration();
    // Usernames are resolved on the server; no public email directory is exposed.
    const { data, error } = await supabase.functions.invoke('rmc-login', { body: { identifier: identifier.trim(), password } });
    if (error || data?.error) {
      const details = data?.error ? data : await error?.context?.json?.().catch(() => null);
      throw Object.assign(new Error(details?.error || 'Unable to sign in. Check your credentials.'), { code: details?.code });
    }
    progress.step(1);
    const { error: sessionError } = await supabase.auth.setSession(data);
    if (sessionError) throw sessionError;
  
  }, 'Sign in', undefined, ['Checking your sign-in details', 'Signing you in']);
},
  async signOut() {
  return toast.track(async (progress) => { const owner = backendState.currentUserId; const { error } = await supabase.auth.signOut(); if (error) throw error; resetData(); if (owner) await clearOfflineRosters(owner);
  }, 'Sign out');
},
  getCurrentUser: () => backendState.currentUserId ? backendState.snapshot.users[backendState.currentUserId] || null : null,
  async changePassword(currentPassword: string, password: string) {
  return toast.track(async (progress) => {
    // The profile snapshot can be refreshed independently of the auth session.
    // Read the email from the current Supabase user so password changes do not
    // incorrectly ask a valid session to sign in again.
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || backendState.snapshot.users[backendState.currentUserId || '']?.profile.email;
    if (!email) throw new Error('Sign in again to change your password.');
    progress.step(1);
    const verified = await verifyPassword(email, currentPassword);
    if (!verified) throw new Error('Current password is incorrect.');
    progress.step(2);
    const result = await supabase.auth.updateUser({ password }); if (result.error) throw result.error;
  
  }, 'Change password', undefined, ['Checking your account', 'Checking your current password', 'Saving your new password']);
},
};

export async function uploadDocument(file: File, kind: string) {
  const retained = retainedUploadFile(file);
  return toast.track(async (progress) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in and verify your email before uploading documents.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG, WebP, or PDF file up to 5 MB.');
  const path = `${user.id}/${kind}/${crypto.randomUUID()}.${file.type.split('/')[1]}`;
  progress.step(1);
  const { error } = await supabase.storage.from('rmc-documents').upload(path, await retained, { upsert: false });
  if (error) throw error;
  return `storage://${path}`;

  }, 'Upload document', undefined, ['Checking your document', 'Upload document']);
}
export async function documentUrl(path: string) {
  if (!path.startsWith('storage://')) return publicDriveImageUrl(path);
  const objectPath = path.slice(10).replace(/^rmc-documents\//, '');
  const { data, error } = await supabase.storage.from('rmc-documents').createSignedUrl(objectPath, 300);
  if (error) throw error; return data.signedUrl;
}

export const appData = {
  getOrganizations: () => backendState.snapshot.organizations || [],
  getOrganizationMemberships: () => backendState.snapshot.organization_members || [],
  getOrganizationSanctions: () => backendState.snapshot.organization_sanctions || [],
  getPublicOrganizations: () => rpc<Organization[]>('rmc_public_organizations'),
  getOrganizationPeople: (organizationId: string | null, scopeNode: string | null = null) => rpc<Array<{ uid: string; name: string; student_id: string; role: string; can_add: boolean }>>('rmc_organization_people', { org: organizationId, scope_node: scopeNode }),
  organizationCommand: (action: string, payload: Record<string, unknown>) => trackWrite(async (progress) => {
    const result = await rpc('rmc_organization_command', { action, payload });
    await refreshAfterWrite(progress);
    return result;
  }, 'Update organization'),
  performSensitiveAction: (action: string, target: string, confirmation: SensitiveConfirmation) => trackWrite(async (progress) => {
    const result = await executeSensitiveAction(action, target, confirmation);
    await refreshAfterWrite(progress);
    return result;
  }, confirmation.typedAction === 'DELETE' ? 'Delete record' : 'Archive record'),
  validateEnrollment: async (person: Partial<UserProfile>, enrollmentKey: string, phase: number) => {
    const errors = await rpc<Record<string, string>>('rmc_validate_enrollment', { person, enrollment_key: enrollmentKey || null, phase });
    if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '));
  },
  updatePhoto: (uid: string, path: string) => command('updatePhoto', [uid, { path }]),
  getEvents: (): AppEvent[] => Object.values(backendState.snapshot.events),
  getCoreRoles: () => backendState.snapshot.core_roles,
  getCustomRoles: () => backendState.snapshot.custom_roles,
  getPaymentInfo: () => backendState.snapshot.payment_info,
  getSystemHealthMetrics: () => ({ lastSync: backendState.lastSync, lastSyncFailed: backendState.lastSyncFailed, syncFailures: backendState.syncFailures, syncSuccesses: backendState.syncSuccesses, latencySamples: backendState.latencySamples, dbStatus: backendState.lastSync && !backendState.lastSyncFailed ? 'operational' as const : 'degraded' as const, authStatus: backendState.currentUserId ? 'operational' as const : 'degraded' as const, geofenceStatus: 'degraded' as const, storageUsedBytes: 0, storageMaxBytes: 0, storageUsagePercent: 0, latencyMs: backendState.latency, activeSessions: backendState.currentUserId ? 1 : 0, totalUsersCount: Object.keys(backendState.snapshot.users).length, studentsCount: Object.values(backendState.snapshot.users).filter(u => u.profile.role === 'student').length, eventsCount: Object.keys(backendState.snapshot.events).length, attendanceLogsCount: backendState.snapshot.attendance.length, excuseAppsCount: Object.keys(backendState.snapshot.excuse_applications).length, auditLogsCount: backendState.snapshot.audit_logs.length, lastBackupTime: 0, healthScore: backendState.lastSync ? 100 : 0 }),
  getAttendanceRecords: (uid: string) => backendState.snapshot.attendance.filter(a => a.student_id === uid).map(a => ({ ...a.data, slot: a.slot, id: `${a.event_id}:${a.slot}`, event: backendState.snapshot.events[a.event_id] })),
  isMayorRegisteredForSection: (id?: string, name?: string) => Boolean(flattenDirectory(backendState.snapshot.school_structure).find(n => id ? n.id === id : n.name === name)?.['enrollmentKeyRequired']),
  getSectionSecurityKey: (_id?: string, _name?: string) => 'Stored securely; set a new key to rotate',
  createSchoolOfficial: (_actor: string, profile: Omit<UserProfile, 'uid' | 'photo_url'>, password: string) => accounts('create', { members: [{ profile, password }] }).then(r => r.ids[0]),
  deleteSchoolOfficial: (_actor: string, uid: string) => accounts('deactivate', { uid }),
  createUser: (profile: Omit<UserProfile, 'uid' | 'photo_url'>, password?: string) => accounts('create', { members: [{ profile, password }] }).then(r => r.ids[0]),
  getAccountAccess: async () => {
    const result = await accounts('access', {});
    return Object.fromEntries((result.users || []).map((item: { id: string; last_sign_in_at?: string | null; created_at?: string }) => [item.id, item]));
  },
  resetAccountPassword: (uid: string, password: string) => accounts('reset_password', { uid, password }),
  createSectionMembers: (members: Array<{ profile: Omit<UserProfile, 'uid' | 'photo_url'>; makeMayor: boolean }>, _id: string, _name: string, password?: string) => accounts('create', { members: members.map(m => ({ profile: { ...m.profile, role: m.makeMayor ? 'mayor' : 'student' }, password })) }).then(r => r.ids),
  submitApplication: async (profile: UserProfile, password: string, enrollmentKey?: string) => {
  return trackWrite(async (progress) => {
    requireConfiguration();
    if (backendState.currentUserId && ['rejected', 'bounced', 'deleted'].includes(backendState.snapshot.applications[backendState.currentUserId]?.status || '')) {
      await rpc('rmc_admission_update', { documents: {}, person: profile, enrollment_key: enrollmentKey || null });
      await refreshAfterWrite(progress); return { uid: backendState.currentUserId, needsEmailConfirmation: false };
    }
    if (backendState.currentUserId) throw new Error('You already have an account. Open your application status or sign out to register another student.');
    const result = await googleRequest({ action: 'enroll', profile, password, enrollmentKey });
    if (result.session) {
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
    }
    return { uid: result.uid, needsEmailConfirmation: result.needsEmailConfirmation, deliveryWarning: result.deliveryWarning };
  
  }, 'Submit application');
},
  verifyUserPassword: async (_uid: string, password: string) => {
    const email = backendState.snapshot.users[backendState.currentUserId || '']?.profile.email;
    if (!email) return false;
    return verifyPassword(email, password);
  },
  issueQr: () => rpc<{ token: string; expiresAt: number; persistent?: false }>('rmc_issue_qr'),
  getPrintQr: () => rpc<{ token: string; expiresAt: null; persistent: true }>('rmc_get_print_qr'),
  refreshPrintQr: () => rpc<{ token: string; expiresAt: null; persistent: true }>('rmc_refresh_print_qr'),
  resolveQr: (token: string) => rpc<UserProfile>('rmc_resolve_qr', { token }),
  logAttendance: async (eventId: string, studentUid: string, _actor?: string, _name?: string, _time?: number, direction: 'in' | 'out' = 'in', verification?: { qrToken?: string; position?: unknown; manualReason?: string }) => {
  return trackWrite(async (progress) => {
    const result = await rpc('rmc_record_attendance', { event_id: eventId, student_id: studentUid, direction, qr_token: verification?.qrToken || null, scan_position: verification?.position || null, manual_reason: verification?.manualReason || null });
    await refreshAfterWrite(progress); return result;
  
  }, 'Record attendance');
},
getApplications: () => Object.values(getDB().applications),
getExcuseApplications: () => Object.values(getDB().excuse_applications || {}),
getSchoolStructure: () => getDB().school_structure,
getTransferRoster: () => rpc<import('./studentTransfers').TransferStudent[]>('rmc_transfer_roster'),
transferStudents: (changes: import('./studentTransfers').StudentTransfer[]) => trackWrite(async progress => {
    const count = await rpc<number>('rmc_transfer_students', { changes });
    await refreshAfterWrite(progress);
    return count;
  }, 'Transfer students'),
getSchoolNodePath: (nodeId: string) => findNodePath(getDB().school_structure, nodeId) || [],
getVisibleSchoolStructure: (actorUid: string) => {
    const db = getDB();
    const actor = db.users[actorUid]?.profile;
    if (!actor) return [];
    if (actor.role === 'admin') return db.school_structure;
    const scopeNodeId = getAssignmentNodeId(actor);
    return scopeNodeId ? getDirectorySubtree(db.school_structure, scopeNodeId) : [];
  },
getOfficialsForNode: (nodeId: string) => Object.values(getDB().users)
    .map(({ profile }) => profile)
    .filter((profile) => profile.role !== 'student' && profile.role !== 'admin' && getAssignmentNodeId(profile) === nodeId)
    .sort((first, second) => first.name.localeCompare(second.name)),
getAllAccountIdentities: () => getAccountProfiles(getDB()).map(({ email, username, student_id }) => ({
    email, username, student_id,
  })),
getAccountsForFreeze: () => getAccountProfiles(getDB()).sort((a, b) => a.name.localeCompare(b.name)),
setAccountFreezeStatuses: (ids: string[], frozen: boolean, reason: string) => trackWrite(async progress => {
    const result = await rpc('rmc_set_account_freezes', { target_ids: ids, frozen, reason });
    await refreshAfterWrite(progress);
    return result;
  }, frozen ? 'Freeze accounts' : 'Unfreeze accounts'),
getOfficialAccounts: () => Object.values(getDB().users)
    .map(({ profile }) => profile)
    .filter(({ role, account_status }) => role !== 'student' && account_status === 'active')
    .sort((first, second) => first.name.localeCompare(second.name)),
getAccountAuditLogs: () => {
    const db = getDB();
    return [...(db.audit_logs || [])].map(log => ({
      ...log,
      actor_name: log.actor_name || db.users[log.actor_uid]?.profile.name,
      target_name: log.target_name && log.target_name !== log.target_uid ? log.target_name :
        db.users[log.target_uid]?.profile.name || db.events[log.target_uid || log.event_id]?.title || log.target_name,
      target_role: log.target_role || db.users[log.target_uid]?.profile.role,
    })).sort((first, second) => second.timestamp - first.timestamp);
  },
isNodeVisibleTo: (actorUid: string, nodeId: string) => {
    const db = getDB();
    const actor = db.users[actorUid]?.profile;
    if (!actor) return false;
    if (actor.role === 'admin') return Boolean(findNodeById(db.school_structure, nodeId));
    const scopeNodeId = getAssignmentNodeId(actor);
    return Boolean(scopeNodeId && isNodeInSubtree(db.school_structure, scopeNodeId, nodeId));
  },
getAllStudents: () => {
    const db = getDB();
    return Object.values(db.users)
      .filter(u => u.profile.account_status === 'active' && ['student', 'mayor', 'ssg'].includes(u.profile.role))
      .map(u => ({
        ...u.profile,
        stats: u.stats,
        sanction_logs: db.sanction_logs[u.profile.uid] || []
      }));
  },
getVisibleStudents: (actorUid: string) => {
    const db = getDB();
    const actor = db.users[actorUid]?.profile;
    const scopeNodeId = actor ? getAssignmentNodeId(actor) : undefined;
    return Object.values(db.users)
      .filter(({ profile }) => profile.account_status === 'active' && ['student', 'mayor', 'ssg'].includes(profile.role))
      .filter(({ profile }) => actor?.role === 'admin' || Boolean(scopeNodeId && profileBelongsToScope(db, profile, scopeNodeId)))
      .map(({ profile, stats }) => ({ ...profile, stats, sanction_logs: db.sanction_logs[profile.uid] || [] }));
  },
getVisibleApplications: (actorUid: string) => {
    const db = getDB();
    const actor = db.users[actorUid]?.profile;
    const scopeNodeId = actor ? getAssignmentNodeId(actor) : undefined;
    return Object.values(db.applications)
      .filter((application) => actor?.role === 'admin' || Boolean(scopeNodeId && profileBelongsToScope(db, application.form_data, scopeNodeId)));
  },
getVisibleExcuseApplications: (actorUid: string) => {
    const visibleIds = new Set(appData.getVisibleStudents(actorUid).map((student) => student.uid));
    return Object.values(getDB().excuse_applications || {}).filter((application) => visibleIds.has(application.student_uid));
  },
getVisibleEvents: (actorUid: string) => {
    const db = getDB();
    const actor = db.users[actorUid]?.profile;
    if (!actor) return [];
    if (actor?.role === 'admin') return Object.values(db.events);
    // School-wide recipients do not need a directory assignment to see events.
    const students = appData.getVisibleStudents(actorUid);
    return appData.getEvents().filter(event => event.created_by === actorUid || (actor && (hasPermission(actor.role, 'events.manage') || hasPermission(actor.role, 'events.approve')) && canManageEventInScope(actor, event, db.school_structure)) || students.some(student => isEventRecipient(event, student, db.school_structure)) || isEventRecipient(event, actor!, db.school_structure));
  },
getRecipientEvents: (uid: string) => {
    const db = getDB();
    const profile = db.users[uid]?.profile;
    return profile ? appData.getEvents().filter(event => isEventRecipient(event, profile, db.school_structure)) : [];
  },
isEventRecipient: (event: AppEvent, profile: UserProfile) => isEventRecipient(event, profile, getDB().school_structure),
getAttendanceLogs: (eventId: string) => getDB().attendance_logs[eventId] || {},
getStudentsBySection: (sectionName: string, terminalGroupId?: string) => {
    const db = getDB();
    return Object.values(db.users)
      .filter(({ profile }) => terminalGroupId
        ? profileMatchesDirectorySection(profile, terminalGroupId, db.school_structure)
        : profile.school_data.section === sectionName)
      .filter(({ profile }) => profile.account_status === 'active' && ['student', 'mayor', 'ssg'].includes(profile.role))
      .map(u => ({ ...u.profile, stats: u.stats }));
  },
getUserProfile: (studentIdentifier: string) => {
    const db = getDB();
    return Object.values(db.users).find(u => 
      (u.profile.uid === studentIdentifier || u.profile.student_id === studentIdentifier) &&
      (u.profile.account_status === 'active' && ['student', 'mayor', 'ssg'].includes(u.profile.role)) &&
      (u.profile.account_status || 'active') === 'active'
    )?.profile;
  },
getUserDetail: (uid: string) => {
    const db = getDB();
    const u = db.users[uid];
    if (!u) return null;
    return {
      ...u,
      sanction_logs: db.sanction_logs[uid] || [],
      excuse_applications: Object.values(db.excuse_applications || {}).filter(a => a.student_uid === uid)
    };
  },
getSystemFreezeStatus: () => {
    return getDB().system_freeze || { isFrozen: false, reason: '' };
  },
getFrozenNodes: () => {
    return getDB().frozen_nodes || {};
  },
getNodeFreezeStatus: (nodeId: string) => {
    const frozenNodes = getDB().frozen_nodes || {};
    return frozenNodes[nodeId] || null;
  },
isNodeOrParentFrozen: (nodeId: string) => {
    const db = getDB();
    if (db.system_freeze?.isFrozen) return true;
    const frozenNodes = db.frozen_nodes || {};
    const path = findNodePath(db.school_structure, nodeId) || [];
    return path.some(node => frozenNodes[node.id]?.isFrozen);
  },
isUserScopeFrozen: (profile?: UserProfile | null) => {
    if (!profile) return false;
    if (profile.account_freeze?.isFrozen) return true;
    const db = getDB();
    if (profile.role === 'admin') return false;
    if (db.system_freeze?.isFrozen) return true;
    const studentNode = profile.school_data?.academic_assignment?.terminalGroupId;
    if (studentNode && appData.isNodeOrParentFrozen(studentNode)) return true;
    const assignmentNodeId = profile.official_data?.assignment_node_id || studentNode;
    if (assignmentNodeId) {
      const path = findNodePath(db.school_structure, assignmentNodeId) || [];
      const frozenNodes = db.frozen_nodes || {};
      if (path.some(node => frozenNodes[node.id]?.isFrozen)) return true;
    }
    return false;
  },
  addSchoolNode: (...args: any[]) => command('addSchoolNode', args),
  setClassSchedule: (nodeId: string, schedule: import('../types').ClassWeekSchedule) => trackWrite(async (progress) => {
    await rpc('rmc_set_class_schedule', { node_id: nodeId, schedule });
    await refreshAfterWrite(progress);
  }, 'Save class schedule'),
  updateSchoolNode: (...args: any[]) => command('updateSchoolNode', args),
  archiveSchoolNode: (...args: any[]) => command('archiveSchoolNode', args),
  restoreSchoolNode: async (id: string, confirmation?: unknown) => { const node = findNodeById(getDB().school_structure, id); if (!node) throw new Error('Unit not found.'); return appData.updateSchoolNode(id, { metadata: { ...(node.metadata || {}), archived: false } }); },
  deleteSchoolNode: (...args: any[]) => command('deleteSchoolNode', args),
  replaceSchoolStructure: (...args: any[]) => command('replaceSchoolStructure', args),
  setSectionSecurityKey: (...args: any[]) => command('setSectionSecurityKey', args),
  clearSectionSecurityKey: (nodeId: string) => trackWrite(async (progress) => {
    const { error } = await supabase.rpc('rmc_clear_section_security_key', { target: nodeId });
    if (error) throw error;
    await refreshAfterWrite(progress);
  }, 'Clear enrollment key'),
  updateContactDetails: (...args: any[]) => command('updateContactDetails', args),
  approveApplication: (...args: any[]) => command('approveApplication', args),
  rejectApplication: (...args: any[]) => command('rejectApplication', args),
  reviewAdmission: async (applicationId: string, decision: 'rejected' | 'bounced' | 'deleted', reason: string, clarificationFields: string[] = []) => {
    await trackWrite(async (progress) => {
      await rpc('rmc_review_admission', { application_id: applicationId, decision, reason, clarification_fields: clarificationFields });
      await refreshAfterWrite(progress);
    }, decision === 'bounced' ? 'Return application' : decision === 'deleted' ? 'Delete application' : 'Reject application');
  },
  assignSectionMayor: (...args: any[]) => command('assignSectionMayor', args),
  assignRole: (...args: any[]) => command('assignRole', args),
  assignAccountRole: (...args: any[]) => command('assignAccountRole', args),
  assignOfficialToNode: (...args: any[]) => command('assignOfficialToNode', args),
  reviewEvent: (eventId: string, decision: 'approved' | 'rejected', notes: string) => trackWrite(async (progress) => {
    const result = await rpc('rmc_review_event', { event_id: eventId, decision, notes });
    await refreshAfterWrite(progress);
    return result;
  }, 'Saving OSSA decision', 'Review saved.'),
  createEvent: (...args: any[]) => command('createEvent', args),
  extendService: (eventId: string, endDate: string) => trackWrite(async (progress) => {
    const result = await rpc('rmc_extend_service', { event_id: eventId, new_end_date: endDate });
    await refreshAfterWrite(progress);
    return result;
  }, 'Extend service duration'),
  createCeremonies: (event: Omit<AppEvent, 'id'>, dates: string[]) => trackWrite(async (progress) => {
    const result = await rpc('rmc_create_ceremonies', { configuration: event, dates });
    await refreshAfterWrite(progress);
    return result;
  }, 'Schedule ceremonies'),
  updateEvent: (...args: any[]) => command('updateEvent', args),
  archiveEvent: (...args: any[]) => command('archiveEvent', args),
  cancelEvent: (...args: any[]) => command('cancelEvent', args),
  deleteEvent: (...args: any[]) => command('deleteEvent', args),
  adjustSanctionHours: (...args: any[]) => command('adjustSanctionHours', args),
  resolveStudentSanctions: (...args: any[]) => command('resolveStudentSanctions', args),
  submitExcuseApplication: (...args: any[]) => command('submitExcuseApplication', args),
  reviewExcuseApplication: (...args: any[]) => command('reviewExcuseApplication', args),
  setSystemFreezeStatus: (...args: any[]) => command('setSystemFreezeStatus', args),
  setNodeFreezeStatus: (...args: any[]) => command('setNodeFreezeStatus', args),
  createCustomRole: (...args: any[]) => command('createCustomRole', args),
  updateCoreRole: (roleId: string, changes: Partial<CoreRole>) => trackWrite(async (progress) => {
    const result = await rpc<CoreRole>('rmc_update_core_role', { target: roleId, changes });
    await refreshAfterWrite(progress);
    return result;
  }, 'Update core role'),
  updateCustomRole: (...args: any[]) => command('updateCustomRole', args),
  deleteCustomRole: (...args: any[]) => command('deleteCustomRole', args),
  updatePaymentInfo: (...args: any[]) => command('updatePaymentInfo', args),
  sendPaymentReminderToOSAS: (...args: any[]) => command('sendPaymentReminderToOSAS', args),
};
setMockDataRef(appData);


