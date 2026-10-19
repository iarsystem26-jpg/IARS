
export type UserRole = 'student' | 'mayor' | 'ssg' | 'admin' | 'ossa' | 'ossa_staff' | string;
export type AccountStatus = 'pending' | 'active' | 'suspended' | 'inactive' | 'graduated';

export type AppPermission =
  | 'calendar.view'
  | 'calendar.view_scope'
  | 'calendar.manage_schedules'
  | 'calendar.manage_closures'
  | 'calendar.manage_schoolwide'
  | 'system.manage_accounts'
  | 'system.view_audit'
  | 'system.freeze'
  | 'system.health'
  | 'system.payment_reminders'
  | 'system.manage_rbac'
  | 'directory.manage_structure'
  | 'directory.create_units'
  | 'directory.delete_structure'
  | 'directory.manage_members'
  | 'directory.add_members_manually'
  | 'directory.change_member_designation'
  | 'directory.transfer_students'
  | 'directory.manage_student_sanctions'
  | 'attendance.scan'
  | 'attendance.manage'
  | 'events.manage'
  | 'events.require_ossa_approval'
  | 'events.approve'
  | 'ossa.manage_cases';

export interface SystemFreezeState {
  isFrozen: boolean;
  reason: string;
  frozenAt?: number;
  frozenBy?: string;
}

export interface NodeFreezeState {
  isFrozen: boolean;
  reason: string;
  frozenAt: number;
  frozenBy?: string;
}

export interface PaymentReminderLog {
  id: string;
  sentAt: number;
  sentBy: string;
  recipientRole: string;
  recipientEmail: string;
  subject: string;
  message: string;
  urgency: 'normal' | 'urgent' | 'critical';
  status: 'sent' | 'delivered' | 'in_app';
}

export interface PaymentInfo {
  status: 'paid' | 'due_soon' | 'overdue' | 'unpaid';
  amountDue: number;
  currency: string;
  dueDate: number;
  billingCycle: string;
  accountName: string;
  schoolId: string;
  lastPaymentDate?: number;
  reminders: PaymentReminderLog[];
}

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  isPositionOnly: boolean;
  permissions: AppPermission[];
  createdBy: string;
  createdAt: number;
  updatedAt?: number;
}

export interface CoreRole {
  id: string;
  name: string;
  description: string;
  isPositionOnly: boolean;
  permissions: AppPermission[];
  isBuiltIn: boolean;
  updatedAt?: number;
}

export interface SystemHealthMetric {
  dbStatus: 'operational' | 'degraded' | 'maintenance';
  authStatus: 'operational' | 'degraded';
  geofenceStatus: 'operational' | 'degraded';
  storageUsedBytes: number;
  storageMaxBytes: number;
  storageUsagePercent: number;
  latencyMs: number;
  activeSessions: number;
  totalUsersCount: number;
  studentsCount: number;
  eventsCount: number;
  attendanceLogsCount: number;
  excuseAppsCount: number;
  auditLogsCount: number;
  lastBackupTime: number;
  healthScore: number;
}

export type AcademicNodeType =
  | 'campus' | 'education_unit' | 'curriculum' | 'college' | 'department'
  | 'track' | 'elective_cluster' | 'strand' | 'program' | 'major'
  | 'grade_level' | 'year_level' | 'section' | 'block' | 'specialization' | 'custom'
  // Legacy aliases retained while saved structures migrate.
  | 'school' | 'sub_department' | 'level' | 'secondary' | 'elementary' | 'special';

export type AcademicPresetId = 'jhs' | 'strengthened_shs' | 'legacy_shs' | 'higher_ed' | 'blank';

export interface AcademicAssignment {
  campusId: string;
  nodePathIds: string[];
  terminalGroupId: string;
  curriculumCode?: string;
  academicYear?: string;
  affiliations?: Array<{
    nodeId?: string;
    type: 'tle_specialization' | 'academic_elective' | 'techpro_elective' | 'major' | 'other';
    name: string;
  }>;
}

export interface ExcuseApplication {
  event_id?: string;
  id: string;
  student_uid: string;
  student_name: string;
  student_id: string;
  department: string;
  section: string;
  event_title: string;
  event_date?: string;
  category: 'medical' | 'personal' | 'institutional' | 'emergency';
  reason: string;
  proof_url?: string;
  contact_mobile?: string;
  submission_deadline?: number;
  submission_date: number;
  submitted_at?: number;
  status: 'pending' | 'approved' | 'rejected';
  review_notes?: string;
  waived_hours?: number;
  reviewed_at?: number;
  reviewed_by?: string;
}

export interface UserProfile {
  /** Server-owned restriction, independent of role, status, and school freezes. */
  account_freeze?: NodeFreezeState | null;
  /** Authorized snapshot membership; not editable profile data. */
  organizationIds?: string[];
  positionRoleIds?: string[];
  uid: string;
  name: string;
  username: string;
  role: UserRole;
  account_status?: AccountStatus;
  student_id: string;
  photo_url: string;
  email: string;
  phone?: string;
  guardian?: {
    name: string;
    contact: string;
    email?: string;
  };
  official_data?: {
    body: 'SSG' | 'OSSA' | 'Administration';
    position?: string;
    scope?: string;
    assignment_node_id?: string;
    assignment_node_path_ids?: string[];
  };
  school_data: {
    type: 'High School' | 'College';
    level: string; 
    section: string;
    department?: string; 
    track?: string; 
    strand?: string;
    program?: string; 
    major?: string;
    school_id?: string;
    academic_assignment?: AcademicAssignment;
  };
}

export interface UserStats {
  merit_hours?: number;
  attendance_rate: number;
  sanction_hours: number; 
  events_attended: number;
  events_missed: number;
}

export interface EventAttendanceWindow {
  id: string;
  label?: string;
  timeIn: string;
  timeOut: string;
  lateAfterMinutes: number;
}

export interface EventSanctionRule {
  value: number;
  unit: 'hours' | 'minutes';
}

export interface AppEvent {
  /** Whole days (24 hours each) after endTime; 0 closes at the activity's end. */
  excuseWindowDays?: number;
  isGeneralEvent?: boolean;
  bannerUrl?: string;
  parentEventId?: string | null;
  parentEventTitle?: string;
  venue?: string;
  requiresOssaApproval?: boolean;
  reviewedAt?: number;
  organizationId?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  reviewNotes?: string;
  reviewedBy?: string;
  ceremony?: {
    flagKind?: 'raising' | 'retreat';
    useStandardSchedule?: boolean;
    exemptStudentIds: string[];
    /** Creation-only date-specific exemptions, materialized per ceremony on save. */
    exemptStudentIdsByDate?: Record<string, string[]>;
    allowVolunteerMerit: boolean;
    volunteerMeritHours: number;
    classWindows: Record<string, EventAttendanceWindow[]>;
  } | null;
  service?: { overflow: 'clear' | 'merit' } | null;
  kind?: 'attendance' | 'service' | 'merit' | 'flag_ceremony';
  meritHours?: number;
  recurrence?: { frequency: 'weekly'; occurrences: number };
  seriesId?: string;
  scopeNodeId?: string;
  id: string;
  title: string;
  description?: string;
  created_by: string;
  status: 'upcoming' | 'active' | 'done' | 'pending' | 'rejected';
  cancellationStatus?: 'cancelled' | 'dropped';
  startTime: number;
  endTime: number;
  penaltyValue: number;
  penaltyUnit: 'hours' | 'minutes';
  participantsType: 'all' | 'department' | 'track' | 'strand' | 'level' | 'section' | 'specific';
  targetValue?: string; // e.g., "Senior High School" or "STEM" or "Grade 12"
  specificParticipants?: string[];
  target: {
    all: boolean;
    department?: string[];
    strand?: string[];
    section?: string[];
  };
  location: {
    lat: number;
    lng: number;
    radius_meters: number;
  };
  timestamp: number;
  startDate?: string;
  endDate?: string;
  attendanceWindows?: EventAttendanceWindow[];
  sanctionRules?: {
    late: EventSanctionRule;
    absent: EventSanctionRule;
  };
  recipientGroups?: string[];
  geofenceEnabled?: boolean;
  audienceTarget?: {
    mode: 'all' | 'directory_node' | 'specific_people' | 'group_list';
    nodeId?: string;
    includeDescendants?: boolean;
    specificUserIds?: string[];
    snapshotLabel?: string;
    groups?: string[];
  };
}

export interface Organization {
  can_manage?: boolean;
  can_review?: boolean;
  can_assign_heads?: boolean;
  id: string;
  name: string;
  description: string;
  logo_url: string;
  node_id: string | null;
  visible: boolean;
  joining: 'closed' | 'open' | 'approval';
  key_required: boolean;
  head_ids: string[];
  created_at: string;
}

export interface OrganizationMembership {
  organization_id: string;
  student_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at?: string;
  name?: string;
  student_number?: string;
}

export interface OrganizationSanctionRequest {
  id: string;
  organization_id: string;
  student_id: string;
  hours: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  review_notes?: string;
  student_name?: string;
}

export type ClassDaySchedule = { status: 'no_class' } | { status: 'classes'; timeIn: string; timeOut: string };
export type ClassWeekSchedule = Partial<Record<string, ClassDaySchedule>>;

export interface SchoolNode {
  enrollmentKeyRequired?: boolean;
  id: string;
  name: string;
  code?: string;
  type: AcademicNodeType;
  logo_url?: string;
  children?: SchoolNode[];
  metadata?: {
    classSchedule?: ClassWeekSchedule;
    schemaVersion?: number;
    educationLevel?: 'elementary' | 'jhs' | 'shs' | 'higher_ed' | 'graduate' | 'other';
    curriculumCode?: string;
    academicYearStart?: number;
    academicYearEnd?: number;
    officialGrouping?: boolean;
    selectableForRegistration?: boolean;
    selectableForEvents?: boolean;
    allowedChildTypes?: AcademicNodeType[];
    shortCode?: string;
    programLevel?: string;
    durationYears?: number;
    copcNumber?: string;
    archived?: boolean;
    legacyType?: string;
    migrationStatus?: 'migrated' | 'needs_review';
    customFields?: Record<string, string | number | boolean>;
  };
}

  export interface Application {
  documents?: Record<string, string>;
  id: string;
    status: 'pending' | 'approved' | 'rejected' | 'bounced' | 'deleted';
  submission_date: number;
  rejection_count: number;
    rejection_reason?: string;
    clarification_fields?: string[];
    reviewed_at?: number;
    reviewed_by?: string;
  enrollment_node_id?: string;
  enrollment_verified_at?: number;
  form_data: UserProfile;
}

