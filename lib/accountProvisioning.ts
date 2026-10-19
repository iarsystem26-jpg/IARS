import { SchoolNode, UserRole } from '../types';

// These are the staff roles supported by the account provisioning RPC.
export const managedAccountRoles = [
  { id: 'admin', label: 'Administrator' },
  { id: 'ossa', label: 'OSAS Administrator' },
  { id: 'ossa_staff', label: 'OSAS Staff' },
  { id: 'ssg', label: 'SSG Officer' },
];

export const accountUnits = (nodes: SchoolNode[]): SchoolNode[] => nodes.flatMap(node =>
  node.metadata?.archived ? [] : [node, ...accountUnits(node.children || [])]);

export function supportsAccountRole(node: SchoolNode, role: UserRole): boolean {
  if (node.metadata?.archived) return false;
  return ['ossa', 'ossa_staff', 'ssg'].includes(role);
}

export function canProvisionRole(actorRole: UserRole, role: UserRole): boolean {
  if (['admin', 'ossa', 'ossa_staff'].includes(role)) return actorRole === 'admin';
  return role === 'ssg' && actorRole !== 'ssg';
}
