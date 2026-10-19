import type { UserRole } from '../types';

export const hierarchyPathForRole = (role?: UserRole | string): string =>
  role === 'admin' ? '/admin/hierarchy' : '/ssg/panel';
