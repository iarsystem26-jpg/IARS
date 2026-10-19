import { AppEvent, SchoolNode, UserProfile } from '../types';
import { findNodePath, flattenDirectory, getDirectorySubtree } from './academicDirectory';
import { getRoleDefinitions } from './accessControl';

const legacyRoleGroups: Record<string, string> = { student: 'All Students', ssg: 'All SSG Officers', mayor: 'All Mayors' };
const roleGroupLabels: Record<string, string> = { ossa: 'All OSSA Administrators', ossa_staff: 'All OSSA Staff' };

export function recipientRoleOptions() {
  return Object.values(getRoleDefinitions()).filter(role => role.id !== 'admin').map(role => ({
    value: legacyRoleGroups[role.id] || `role:${role.id}`,
    label: legacyRoleGroups[role.id] || roleGroupLabels[role.id] || `All ${role.name}`,
  }));
}

export function eventRecipientRoots(profile: UserProfile | null, roots: SchoolNode[]): SchoolNode[] {
  if (!profile) return [];
  if (profile.role === 'admin') return roots;
  const assignment = profile.official_data?.assignment_node_id || profile.school_data?.academic_assignment?.terminalGroupId;
  return assignment ? getDirectorySubtree(roots, assignment) : [];
}

export function canManageEventInScope(profile: UserProfile | null, event: AppEvent, roots: SchoolNode[]): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  return Boolean(event.scopeNodeId && findNodePath(eventRecipientRoots(profile, roots), event.scopeNodeId));
}

export function recipientGroupLabel(group: string, roots: SchoolNode[]): string {
  if (group.startsWith('role:')) {
    const id = group.slice(5);
    return roleGroupLabels[id] || `All ${getRoleDefinitions()[id]?.name || 'Unavailable role'}`;
  }
  if (!group.startsWith('node:')) return group;
  const path = findNodePath(roots, group.slice(5));
  return path?.map(node => node.name).join(' / ') || 'Unavailable school unit';
}

export function isEventRecipient(event: AppEvent, profile: UserProfile, roots: SchoolNode[]): boolean {
  if (event.approvalStatus === 'pending' || event.approvalStatus === 'rejected') return false;
  if (event.organizationId) return event.approvalStatus === 'approved' && Boolean(profile.organizationIds?.includes(event.organizationId));
  if (event.ceremony?.exemptStudentIds.includes(profile.uid)) return false;
  const assignment = profile.school_data.academic_assignment;
  const pathIds = new Set([
    ...(assignment?.nodePathIds || []),
    ...(findNodePath(roots, assignment?.terminalGroupId || '') || []).map(node => node.id),
    ...(profile.official_data?.assignment_node_path_ids || []),
    ...(findNodePath(roots, profile.official_data?.assignment_node_id || '') || []).map(node => node.id),
  ]);
  if (event.scopeNodeId && !pathIds.has(event.scopeNodeId)) return false;
  const audience = event.audienceTarget;
  if (audience?.mode === 'specific_people') return Boolean(audience.specificUserIds?.includes(profile.uid));
  if (audience?.mode === 'directory_node') return audience.includeDescendants === false
    ? assignment?.terminalGroupId === audience.nodeId
    : pathIds.has(audience.nodeId || '');
  const groups = audience?.groups || event.recipientGroups;
  if (groups?.length) return groups.some(group => {
    if (group === 'All Students') return ['student', 'mayor', 'ssg'].includes(profile.role);
    if (group === 'All SSG Officers') return profile.role === 'ssg';
    if (group === 'All Mayors') return profile.role === 'mayor';
    if (group.startsWith('role:')) {
      const roleId = group.slice(5);
      return roleId !== 'admin' && profile.role !== 'admin'
        && Boolean(getRoleDefinitions()[roleId])
        && (profile.role === roleId || Boolean(profile.positionRoleIds?.includes(roleId)));
    }
    if (group.startsWith('person:')) return group.slice(7) === profile.uid;
    if (group.startsWith('node:')) return pathIds.has(group.slice(5));
    const names = { JHS: 'Junior High School', SHS: 'Senior High School', College: 'College' };
    const name = names[group as keyof typeof names] || group;
    return flattenDirectory(roots).some(node => node.name === name && pathIds.has(node.id))
      || Object.values(profile.school_data).some(value => value === name);
  });
  if (audience?.mode === 'all' || event.target?.all || event.participantsType === 'all') return true;
  if (event.specificParticipants?.includes(profile.uid)) return true;
  const values = [event.targetValue, ...(event.target?.department || []), ...(event.target?.section || []), ...(event.target?.strand || [])].filter(Boolean);
  return values.some(value => Object.values(profile.school_data).includes(value));
}

export function isCeremonyVolunteer(event: AppEvent, profile: UserProfile, roots: SchoolNode[]): boolean {
  if (event.approvalStatus === 'pending' || event.approvalStatus === 'rejected') return false;
  if (event.kind !== 'flag_ceremony' || event.ceremony?.exemptStudentIds.includes(profile.uid) || !['student', 'mayor', 'ssg'].includes(profile.role)) return false;
  const node = profile.official_data?.assignment_node_id || profile.school_data.academic_assignment?.terminalGroupId;
  return !event.scopeNodeId || Boolean(findNodePath(roots, node || '')?.some(item => item.id === event.scopeNodeId));
}
