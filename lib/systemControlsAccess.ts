import { hasPermission, type AppPermission } from './accessControl';

export const systemControlPermissions = {
  freeze: 'system.freeze', health: 'system.health', payment: 'system.payment_reminders',
  rbac: 'system.manage_rbac', accounts: 'system.manage_accounts',
} as const satisfies Record<string, AppPermission>;

export function canAccessSystemControls(role: string | undefined, search: string): boolean {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'drive' || tab === 'legal' || tab === 'video' || tab === 'updates' || tab === 'enrollment' || tab === 'email') return role === 'admin';
  if (tab && Object.hasOwn(systemControlPermissions, tab)) {
    return hasPermission(role, systemControlPermissions[tab as keyof typeof systemControlPermissions]);
  }
  return Object.values(systemControlPermissions).some(permission => hasPermission(role, permission));
}
