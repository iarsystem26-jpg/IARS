import { UserRole, AppPermission, CustomRole, CoreRole } from '../types';

export type { AppPermission };

export interface PermissionDefinition {
  id: AppPermission;
  name: string;
  category: 'System' | 'Directory' | 'Attendance' | 'Events' | 'OSSA';
  description: string;
}

export const ALL_PERMISSIONS: PermissionDefinition[] = [
  { id: 'calendar.view', name: 'View Calendar', category: 'Events', description: 'View personal activities, conflicts, holidays and suspensions, and export the calendar.' },
  { id: 'calendar.manage_schedules', name: 'Manage Informational Schedules', category: 'Events', description: 'Publish, update, or cancel calendar schedules and notify recipients without attendance requirements, within the assigned academic scope.' },
  { id: 'calendar.view_scope', name: 'View Scoped Calendar', category: 'Events', description: 'Also view activities for the assigned academic scope. System administrators see the school-wide schedule. Requires View Calendar.' },
  { id: 'calendar.manage_closures', name: 'Manage Holidays & Suspensions', category: 'Events', description: 'Mark dates, preview affected activities, and suspend, cancel or reschedule within the assigned academic scope.' },
  { id: 'calendar.manage_schoolwide', name: 'Manage School-wide Suspensions', category: 'Events', description: 'Allow school-wide dates and all academic units. Requires Manage Holidays & Suspensions.' },
  { id: 'directory.transfer_students', name: 'Transfer Students', category: 'Directory', description: 'Export student assignments and transfer, promote, or demote students individually or in batches within the assigned scope.' },
  { id: 'directory.create_units', name: 'Create Directory Units', category: 'Directory', description: 'Create units and apply templates within the assigned scope. Also requires Manage Directory Structure. Disabled for SSG by default.' },
  { id: 'events.require_ossa_approval', name: 'Require OSSA Approval', category: 'Events', description: 'Workflow rule: events and ceremonies submitted or changed by this role remain inactive until OSSA approves. Enabled for SSG by default. Turning it off does not approve existing requests.' },
  { id: 'events.approve', name: 'Review Event & Ceremony Requests', category: 'OSSA', description: 'Allow OSSA administrators or OSSA staff to approve or reject activities within their scope. Authors cannot approve their own requests.' },
  { id: 'system.manage_accounts', name: 'Manage User Accounts', category: 'System', description: 'Create, edit, and manage school official accounts' },
  { id: 'system.view_audit', name: 'View System Audit Logs', category: 'System', description: 'Access security and activity audit trails' },
  { id: 'system.freeze', name: 'Freeze System & Scopes', category: 'System', description: 'Freeze or unfreeze global system or specific departments/sections' },
  { id: 'system.health', name: 'Monitor System Health', category: 'System', description: 'View database metrics, storage usage, and component status' },
  { id: 'system.payment_reminders', name: 'Manage Payments & Reminders', category: 'System', description: 'Track payment status and send payment reminders to OSAS' },
  { id: 'system.manage_rbac', name: 'Manage RBAC & Roles', category: 'System', description: 'Create, edit, and customize access control permissions for roles' },
  { id: 'directory.manage_structure', name: 'Manage Directory Structure', category: 'Directory', description: 'Modify, restore, or archive campus hierarchy units' },
  { id: 'directory.delete_structure', name: 'Delete Directory Structure & Units', category: 'Directory', description: 'Delete school units, departments, and academic hierarchy nodes' },
  { id: 'directory.manage_members', name: 'Manage Members & Students', category: 'Directory', description: 'Create and update student rosters and section assignments' },
  { id: 'directory.add_members_manually', name: 'Add Members Manually', category: 'Directory', description: 'Open the manual form to add an individual member to a class section' },
  { id: 'directory.change_member_designation', name: 'Change Member Designation', category: 'Directory', description: 'Assign or change a student designation, including mayor' },
  { id: 'directory.manage_student_sanctions', name: 'Manage Student Sanctions', category: 'Directory', description: 'Add, deduct, or clear student sanction hours' },
  { id: 'attendance.scan', name: 'Scan Attendance QR', category: 'Attendance', description: 'Use QR code scanner to take event attendance' },
  { id: 'attendance.manage', name: 'Manage Attendance Logs', category: 'Attendance', description: 'Review, modify, or export attendance records' },
  { id: 'events.manage', name: 'Create & Manage Events', category: 'Events', description: 'Schedule institutional events and set geofence rules' },
  { id: 'ossa.manage_cases', name: 'Manage Student Cases & Excuses', category: 'OSSA', description: 'Review excuse applications, adjust sanctions, and clear balances' },
];

export const DEFAULT_CORE_ROLES: Record<string, CoreRole> = {
  admin: {
    id: 'admin',
    name: 'System Owner / Super Admin',
    description: 'Full administrative access across all system nodes and controls',
    isPositionOnly: false,
    permissions: ['calendar.view', 'calendar.view_scope', 'calendar.manage_schedules', 'calendar.manage_closures', 'calendar.manage_schoolwide',
      'directory.transfer_students', 'system.manage_accounts', 'system.view_audit', 'system.freeze', 'system.health',
      'system.payment_reminders', 'system.manage_rbac', 'directory.manage_structure', 'directory.create_units',
      'directory.delete_structure', 'directory.manage_members', 'attendance.scan',
      'directory.add_members_manually', 'directory.change_member_designation', 'directory.manage_student_sanctions',
      'attendance.manage', 'events.manage', 'ossa.manage_cases',
    ],
    isBuiltIn: true,
  },
  ossa: {
    id: 'ossa',
    name: 'OSSA Administrator',
    description: 'Directs student discipline, excuses, and institutional sanction cases',
    isPositionOnly: false,
    permissions: ['calendar.view', 'calendar.view_scope', 'calendar.manage_schedules',
      'directory.transfer_students', 'directory.manage_structure', 'directory.create_units', 'directory.manage_members', 'attendance.scan', 'events.approve',
      'directory.add_members_manually', 'directory.change_member_designation', 'directory.manage_student_sanctions',
      'attendance.manage', 'events.manage', 'ossa.manage_cases',
    ],
    isBuiltIn: true,
  },
  ossa_staff: {
    id: 'ossa_staff',
    name: 'OSSA Staff',
    description: 'Scans attendance and reviews student excuse applications',
    isPositionOnly: false,
    permissions: ['calendar.view', 'calendar.view_scope', 'attendance.scan', 'attendance.manage', 'ossa.manage_cases', 'directory.manage_student_sanctions'],
    isBuiltIn: true,
  },
  ssg: {
    id: 'ssg',
    name: 'SSG Officer',
    description: 'Manages events, geofencing, and directory section rosters',
    isPositionOnly: false,
    permissions: ['calendar.view', 'calendar.manage_schedules', 'directory.manage_structure', 'directory.manage_members', 'directory.add_members_manually', 'directory.change_member_designation', 'attendance.scan', 'attendance.manage', 'events.manage', 'events.require_ossa_approval'],
    isBuiltIn: true,
  },
  mayor: {
    id: 'mayor',
    name: 'Mayor / Attendance Officer',
    description: 'Scans class QR codes and records student attendance',
    isPositionOnly: false,
    permissions: ['calendar.view', 'attendance.scan'],
    isBuiltIn: true,
  },
  student: {
    id: 'student',
    name: 'Student',
    description: 'Personal attendance QR, event history, and excuse submission',
    isPositionOnly: false,
    permissions: ['calendar.view', ],
    isBuiltIn: true,
  },
};

let mockDataRef: any = null;
export const setMockDataRef = (ref: any) => {
  mockDataRef = ref;
};

export const getRoleDefinitions = (): Record<string, CoreRole | CustomRole> => ({
  ...DEFAULT_CORE_ROLES,
  ...(mockDataRef?.getCoreRoles?.() || {}),
  ...(mockDataRef?.getCustomRoles?.() || {}),
});

export const hasPermission = (
  role: UserRole | string | undefined,
  permission: AppPermission,
  customRoles?: Record<string, CustomRole>,
  coreRoles?: Record<string, CoreRole>
): boolean => {
  if (!role) return false;

  const activeCore = coreRoles || (mockDataRef ? mockDataRef.getCoreRoles() : DEFAULT_CORE_ROLES);
  const activeCustom = customRoles || (mockDataRef ? mockDataRef.getCustomRoles() : {});

  if (activeCore && activeCore[role]) {
    const cRole = activeCore[role];
    if (cRole.isPositionOnly) return false;
    return (cRole.permissions || []).includes(permission);
  }

  if (activeCustom && activeCustom[role]) {
    const cRole = activeCustom[role];
    if (cRole.isPositionOnly) return false;
    return (cRole.permissions || []).includes(permission);
  }

  const defaultRole = DEFAULT_CORE_ROLES[role];
  if (defaultRole) {
    if (defaultRole.isPositionOnly) return false;
    return defaultRole.permissions.includes(permission);
  }

  return false;
};

export const roleLabels: Record<string, string> = {
  admin: 'System Owner / Super Admin',
  ossa: 'OSSA Administrator',
  ossa_staff: 'OSSA Staff',
  ssg: 'SSG Officer',
  mayor: 'Mayor / Attendance Officer',
  student: 'Student',
};

export const schoolOfficialRoles: readonly UserRole[] = ['ossa', 'ossa_staff', 'ssg', 'mayor'];

