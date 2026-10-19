import type { Organization, UserProfile } from '../types';
import { hasPermission } from './accessControl';
import { errorMessage } from './errors';

export const canReviewOrganizations = (profile: UserProfile | null) => Boolean(profile &&
  ['ossa', 'ossa_staff'].includes(profile.role) && hasPermission(profile.role, 'ossa.manage_cases'));

export const canManageOrganization = (profile: UserProfile | null, organization: Organization) => Boolean(profile &&
  (organization.can_manage ?? (profile.role === 'admin' || organization.head_ids.includes(profile.uid) || canReviewOrganizations(profile))));

export const canCreateOrganization = (profile: UserProfile | null) => Boolean(profile &&
  hasPermission(profile.role, 'directory.manage_structure'));

export function organizationError(error: unknown) {
  return errorMessage(error);
}
