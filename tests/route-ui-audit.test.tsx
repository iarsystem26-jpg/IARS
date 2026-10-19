vi.mock('../lib/personalCalendar', async original => ({ ...await original<any>(), loadScheduleNotices: vi.fn(async () => []) }));
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../components/ThemeContext';
import LandingPage from '../views/LandingPage';
import Login from '../views/Login';
import Register from '../views/Register';
import RegisterStatus from '../views/RegisterStatus';
import Dashboard from '../views/Dashboard';
import StudentQR from '../views/StudentQR';
import StudentRecords from '../views/StudentRecords';
import StudentProfile from '../views/StudentProfile';
import StudentEvents from '../views/StudentEvents';
import StudentCeremonies from '../views/StudentCeremonies';
import MayorScanner from '../views/MayorScanner';
import ManageMembers from '../views/ManageMembers';
import SSGPanel from '../views/SSGPanel';
import SSGEventCreation from '../views/SSGEventCreation';
import SSGCreateEvent from '../views/SSGCreateEvent';
import AttendanceDashboard from '../views/AttendanceDashboard';
import OSSADashboard from '../views/OSSADashboard';
import AdminControls from '../views/AdminControls';
import { changeField } from './ui-select';
import { defaultLegalPages } from '../lib/legalPages';
import { DEFAULT_CORE_ROLES, setMockDataRef } from '../lib/accessControl';

vi.mock('../lib/legalPageStore', () => ({ loadLegalPage: vi.fn(async () => defaultLegalPages.agreement) }));
vi.mock('../lib/enrollmentConfirmation', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/enrollmentConfirmation')>();
  return { ...actual, loadConfirmationSettings: vi.fn(async () => actual.defaultConfirmationSettings) };
});
vi.mock('../lib/attendanceCorrections', async importOriginal => ({
  ...await importOriginal<any>(),
  loadAttendanceCorrections: vi.fn(async () => []),
  loadCorrectionOptions: vi.fn(async () => []),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, vi.fn()], updateServiceWorker: vi.fn() }),
}));

const studentProfile = {
  uid: 'student-1',
  name: 'Juan Dela Cruz',
  username: 'juan.delacruz',
  role: 'student',
  account_status: 'active',
  student_id: '2026-00001A',
  photo_url: '',
  email: 'juan.delacruz@example.edu',
  phone: '0917 000 0000',
  guardian: { name: 'Original Guardian', contact: '0918 000 0000' },
  school_data: {
    type: 'High School',
    level: 'Grade 12',
    section: 'Newton',
    department: 'Senior High School',
    school_id: 'school_rmc',
  },
};

const routeState = vi.hoisted(() => ({
  applications: [] as Array<Record<string, unknown>>,
  auth: {
    isMock: false,
    loading: false,
    profile: null as typeof studentProfile | null,
    stats: null as { attendance_rate: number; sanction_hours: number; events_attended: number; events_missed: number } | null,
    user: null as { uid: string } | null,
  } as {
    isMock: boolean;
    loading?: boolean;
    profile: typeof studentProfile | null;
    stats: { attendance_rate: number; sanction_hours: number; events_attended: number; events_missed: number } | null;
    user: { uid: string } | null;
  },
}));

const backendState = vi.hoisted(() => ({
  db: { school_structure: [{}], users: {} } as Record<string, any>,
  ensureMockReferenceData: vi.fn(),
  mockSeed: vi.fn(),
}));

const staffState = vi.hoisted(() => ({
  applications: [] as Array<Record<string, any>>,
  excuses: [] as Array<Record<string, any>>,
  events: [] as Array<Record<string, any>>,
  schoolStructure: [] as Array<Record<string, any>>,
  students: [] as Array<Record<string, any>>,
  addSchoolNode: vi.fn(),
  adjustSanctionHours: vi.fn(),
  approveApplication: vi.fn(),
  assignRole: vi.fn(),
  assignSectionMayor: vi.fn(),
  createEvent: vi.fn(),
  createSectionMembers: vi.fn(),
  updateEvent: vi.fn(),
  archiveEvent: vi.fn(),
  cancelEvent: vi.fn(),
  deleteEvent: vi.fn(),
  createUser: vi.fn(),
  logAttendance: vi.fn(),
  resolveStudentSanctions: vi.fn(),
  reviewExcuseApplication: vi.fn(),
  updateContactDetails: vi.fn(),
}));

const scannerState = vi.hoisted(() => ({
  decoded: null as null | ((value: string) => void),
  startPromise: Promise.resolve() as Promise<void>,
  pause: vi.fn(),
  resume: vi.fn(),
  start: vi.fn((_camera: unknown, _config: unknown, onSuccess: (value: string) => void) => {
    scannerState.decoded = onSuccess;
    const mount = document.getElementById('mayor-camera-reader');
    if (mount) mount.replaceChildren(document.createElement('video'));
    return scannerState.startPromise;
  }),
  stop: vi.fn(() => {
    document.getElementById('mayor-camera-reader')?.replaceChildren();
    return Promise.resolve();
  }),
}));

vi.mock('../components/AuthContext', () => ({
  useAuth: () => routeState.auth,
}));


vi.mock('../lib/backend', () => ({
  ensureMockReferenceData: backendState.ensureMockReferenceData,
  getDB: () => backendState.db,
  appAuth: { signIn: vi.fn(), signOut: vi.fn() },
  appData: {
    addSchoolNode: staffState.addSchoolNode,
    adjustSanctionHours: staffState.adjustSanctionHours,
    approveApplication: staffState.approveApplication,
    assignRole: staffState.assignRole,
    assignSectionMayor: staffState.assignSectionMayor,
    createEvent: staffState.createEvent,
    createSectionMembers: staffState.createSectionMembers,
    updateEvent: staffState.updateEvent,
    archiveEvent: staffState.archiveEvent,
    cancelEvent: staffState.cancelEvent,
    deleteEvent: staffState.deleteEvent,
    createUser: staffState.createUser,
    getApplications: () => staffState.applications.length ? staffState.applications : routeState.applications,
    getAllStudents: () => staffState.students,
    getAllAccountIdentities: () => staffState.students,
    getEvents: () => testEvents(),
    getVisibleEvents: () => testEvents(), getRecipientEvents: () => testEvents(),
    getVisibleStudents: () => staffState.students, getVisibleApplications: () => staffState.applications,
    getVisibleExcuseApplications: () => staffState.excuses,
    getVisibleSchoolStructure: () => staffState.schoolStructure,
    getSchoolNodePath: (id: string) => { const walk = (nodes: any[], path: any[] = []): any[] => { for (const n of nodes) { if (n.id === id) return [...path, n]; const match = walk(n.children || [], [...path, n]); if (match.length) return match; } return []; }; return walk(staffState.schoolStructure); },
    getAttendanceRecords: () => testEvents().slice(0, 2).map((event, index) => ({ id: event.id, event, slot: 'default', time_in: Date.now(), status: 'present', scanned_by_name: 'Section Mayor' })),
    getAttendanceLogs: () => ({}), isEventRecipient: () => true,
    issueQr: vi.fn(async () => ({ token: 'RMC1.test-token', expiresAt: Date.now()+90000 })),
    resolveQr: vi.fn(async (token: string) => { if (!token.startsWith('RMC1.')) throw new Error('Invalid or expired QR code.'); return staffState.students[0]; }),
    submitExcuseApplication: vi.fn(async () => undefined),
    getExcuseApplications: () => staffState.excuses,
    getOrganizationPeople: async () => [],
    getOrganizations: () => [],
    getOrganizationSanctions: () => [],
    getSchoolStructure: () => staffState.schoolStructure,
    getStudentsBySection: () => staffState.students,
    getUserDetail: (uid: string) => {
      const student = staffState.students.find((candidate) => candidate.uid === uid);
      return student ? { profile: student, stats: student.stats } : null;
    },
    getUserProfile: (identifier: string) => staffState.students.find(
      (candidate) => candidate.uid === identifier || candidate.student_id === identifier,
    ),
    logAttendance: staffState.logAttendance,
    resolveStudentSanctions: staffState.resolveStudentSanctions,
    reviewExcuseApplication: staffState.reviewExcuseApplication,
    updateContactDetails: staffState.updateContactDetails,
    submitApplication: vi.fn(),
    validateEnrollment: vi.fn(async () => undefined),
    getSystemFreezeStatus: () => ({ isFrozen: false, reason: '' }),
    getFrozenNodes: () => ({}),
    getAccountsForFreeze: () => [],
    isNodeOrParentFrozen: () => false,
    setSystemFreezeStatus: vi.fn(),
    setNodeFreezeStatus: vi.fn(),
    isUserScopeFrozen: () => false,
    getPaymentInfo: () => ({ reminders: [], status: 'paid', dueDate: '2026-12-31', amountDue: 0, logs: [] }),
    sendPaymentReminderToOSAS: vi.fn(),
    updatePaymentInfo: vi.fn(),
    getCoreRoles: () => ({}), getCustomRoles: () => ({}),
    saveCustomRole: vi.fn(),
    deleteCustomRole: vi.fn(),
    getSystemHealthMetrics: () => ({ status: 'healthy', activeSessions: 1, totalAccounts: 10, totalEvents: 2, totalAttendanceLogs: 50, databaseSize: 1024, cacheHitRate: 98, cpuUsage: 12, memoryUsage: 45 }),
    getAccountAuditLogs: () => [],
  },
  mockSeed: backendState.mockSeed,
  refreshData: vi.fn(async () => undefined), subscribeData: () => () => {},
  uploadDocument: vi.fn(async () => 'student-1/excuses/proof.pdf'), documentUrl: vi.fn(async (path: string) => path),
}));

vi.mock('../lib/supabase', () => ({
  configurationError: null,
  verifyPassword: vi.fn(async () => true),
  supabase: { auth: { mfa: {
    listFactors: vi.fn(async () => ({ data: { all: [], totp: [] }, error: null })),
    enroll: vi.fn(async () => ({ data: { id: 'factor-test', totp: { qr_code: 'data:image/svg+xml,<svg/>', secret: 'TEST-ONLY-SECRET', uri: 'otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP' } }, error: null })),
    unenroll: vi.fn(async () => ({ error: null })), challengeAndVerify: vi.fn(async () => ({ error: null })),
  } } },
}));

vi.mock('../lib/profileRequests', async importOriginal => ({
  ...await importOriginal<any>(),
  loadProfileRequests: vi.fn(async () => []),
  submitProfileRequest: vi.fn(async () => undefined),
  reviewProfileRequest: vi.fn(async () => undefined),
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = true;
    pause = scannerState.pause;
    resume = scannerState.resume;
    start = scannerState.start;
    stop = scannerState.stop;
  },
}));

async function openDisclosure(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const trigger = screen.getByRole('button', { name });
  if (trigger.getAttribute('aria-expanded') !== 'true') await user.click(trigger);
}

async function agreeToPrivacy() {
  const panel = await screen.findByRole('region', { name: 'Data privacy agreement text' });
  Object.defineProperties(panel, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 400 },
    scrollTop: { configurable: true, writable: true, value: 600 },
  });
  fireEvent.scroll(panel);
  fireEvent.click(screen.getByRole('checkbox', { name: 'I have read and agree to the Data Privacy Agreement.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
}

function renderRoute(element: React.ReactElement) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[element.type === Register ? '/register' : element.type === StudentEvents ? '/student/events' : element.type === StudentCeremonies ? '/student/ceremonies' : '/']}>{element}</MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
});

afterEach(() => {
  setMockDataRef(null);
  cleanup();
  routeState.applications = [];
  routeState.auth = { isMock: false, loading: false, profile: null, stats: null, user: null };
  staffState.applications = [];
  staffState.excuses = [];
  staffState.events = [];
  staffState.schoolStructure = [];
  staffState.students = [];
  staffState.addSchoolNode.mockReset();
  staffState.adjustSanctionHours.mockReset();
  staffState.approveApplication.mockReset();
  staffState.assignRole.mockReset();
  staffState.assignSectionMayor.mockReset();
  staffState.createEvent.mockReset();
  staffState.createSectionMembers.mockReset();
  staffState.updateEvent.mockReset();
  staffState.archiveEvent.mockReset();
  staffState.cancelEvent.mockReset();
  staffState.deleteEvent.mockReset();
  staffState.createUser.mockReset();
  staffState.logAttendance.mockReset();
  staffState.resolveStudentSanctions.mockReset();
  staffState.reviewExcuseApplication.mockReset();
  staffState.updateContactDetails.mockReset();
  scannerState.decoded = null;
  scannerState.startPromise = Promise.resolve();
  scannerState.pause.mockReset();
  scannerState.resume.mockReset();
  scannerState.start.mockClear();
  scannerState.stop.mockClear();
  backendState.db = { school_structure: [{}], users: {} };
  backendState.ensureMockReferenceData.mockReset();
  backendState.mockSeed.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.classList.remove('dark');
});

function testEvents(): any[] {
  return staffState.events.map(event => ({ description: 'Test event', startTime: Date.now()-60000, endTime: Date.now()+3600000, timestamp: Date.now(), geofenceEnabled: false, location: { lat: 7, lng: 125, radius_meters: 100 }, penaltyValue: 1, penaltyUnit: 'hours', target: { all: true }, recipientGroups: ['All Students'], ...event }));
}
const useStaff = () => {
  routeState.auth = {
    isMock: true,
    profile: { ...studentProfile, uid: 'staff-1', name: 'SSG President', role: 'ssg', official_data: { assignment_node_id: 'school-rmc' } } as typeof studentProfile,
    stats: null,
    user: { uid: 'staff-1' },
  };
};

const useOSSA = () => {
  routeState.auth = {
    isMock: true,
    profile: { ...studentProfile, uid: 'ossa-1', name: 'Dr. Evelyn Santos', role: 'ossa' } as typeof studentProfile,
    stats: null,
    user: { uid: 'ossa-1' },
  };
};

const seedStaffDirectory = () => {
  const section = { id: 'section-newton', name: 'Newton', type: 'section', children: [] };
  const department = { id: 'department-shs', name: 'Senior High School', type: 'department', children: [section] };
  staffState.schoolStructure = [{ id: 'school-rmc', name: 'RMC Campus', type: 'school', children: [department] }];
  staffState.students = [{
    ...studentProfile,
    name: `Juan ${'Dela Cruz '.repeat(12)}`,
    email: `juan.${'long-address.'.repeat(10)}@example.edu`,
    stats: { attendance_rate: 94, sanction_hours: 2, events_attended: 12, events_missed: 1 },
  }];
};

const seedCollegeDirectory = () => {
  const section = { id: 'section-cs1a', name: 'CS-1A', type: 'section', children: [] };
  const program = { id: 'program-bscs', name: 'BS Computer Science', type: 'strand', children: [section] };
  const college = { id: 'college-cas', name: 'College of Arts and Sciences', type: 'track', children: [program] };
  const department = { id: 'department-college', name: 'College', type: 'department', children: [college] };
  staffState.schoolStructure = [{ id: 'school-rmc', name: 'RMC Campus', type: 'school', children: [department] }];
  staffState.students = [];
};

const useStudentRoute = () => {
  staffState.events = [
    { id: 'ceremony', title: 'Weekly Institutional Flag Raising Ceremony', kind: 'flag_ceremony', status: 'active' },
    { id: 'drill', title: 'Disaster Risk & Safety Drill', kind: 'attendance', status: 'active' },
    { id: 'assembly', title: 'University Midyear Leadership Convocation', kind: 'attendance', status: 'active' },
    { id: 'past', title: 'First Semester General Assembly 2025', kind: 'attendance', status: 'done' },
    { id: 'past-ceremony', title: 'Annual Founders Day Thanksgiving Mass', kind: 'flag_ceremony', status: 'done' },
  ];
  routeState.auth = {
    isMock: false,
    profile: studentProfile,
    stats: { attendance_rate: 94, sanction_hours: 2, events_attended: 12, events_missed: 1 },
    user: { uid: studentProfile.uid },
  };
};

describe('public route UI behavior', () => {
  it('does not seed demo data on an empty database', async () => {
    backendState.db = { school_structure: [], users: { mock_uid_student: {} } };
    routeState.auth = { isMock: true, loading: false, profile: null, stats: null, user: null };

    renderRoute(<LandingPage />);

    expect(backendState.ensureMockReferenceData).not.toHaveBeenCalled();
    expect(backendState.mockSeed).not.toHaveBeenCalled();
  });

  it('keeps login dismissible and enrollment on a dedicated page with back navigation', async () => {
    const user = userEvent.setup();
    renderRoute(<LandingPage defaultOpenLogin />);

    expect(screen.getByRole('dialog', { name: /log in to IARS/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /username or email/i })).toBeInTheDocument();
    const landingPassword = screen.getByLabelText(/^password$/i);
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(landingPassword).toHaveAttribute('type', 'text');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /log in to IARS/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^register$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /create your student account/i })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Data privacy agreement' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /legal full name/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
    await agreeToPrivacy();
    expect(screen.getByRole('textbox', { name: /legal full name/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('heading', { name: /create your student account/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back to home/i }));
    expect(screen.queryByLabelText(/legal full name/i)).not.toBeInTheDocument();
  });

  it('gives the login form programmatic labels and an operable password disclosure', async () => {
    const user = userEvent.setup();
    renderRoute(<Login />);

    expect(screen.getByRole('textbox', { name: /username or email/i })).toBeInTheDocument();
    const password = screen.getByLabelText(/^password$/i);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toBeInTheDocument();
  });

  it('makes the registration identity inputs and step progress accessible by name', async () => {
    const user = userEvent.setup();
    renderRoute(<Register />);

    await agreeToPrivacy();

    await user.type(screen.getByRole('textbox', { name: /legal full name/i }), 'Juan Dela Cruz');
    expect(screen.getByRole('textbox', { name: /legal full name/i })).toHaveValue('Juan Dela Cruz');
    expect(screen.getByRole('list', { name: /enrollment progress/i })).toBeInTheDocument();
  });

  it('requires identity details before showing academic enrollment fields', async () => {
    const user = userEvent.setup();
    renderRoute(<Register />);

    await agreeToPrivacy();

    const next = screen.getByRole('button', { name: /^next$/i });
    await user.click(next);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your full name.');
    expect(screen.queryByLabelText(/official student id/i)).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /legal full name/i }), 'Juan Dela Cruz');
    await user.type(screen.getByRole('textbox', { name: /email address/i }), 'juan@rmc.edu.ph');
    await user.type(screen.getByLabelText(/^password$/i), 'secure-password-123');
    await user.type(screen.getByLabelText(/^confirm password$/i), 'secure-password-123');
    expect(next).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('textbox', { name: /official student id/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /capture student id/i })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /official student id/i })).toBeRequired();
  });

  it.each([
    ['login', <Login />, /log in to IARS/i, /username or email/i],
    ['registration', <Register />, /create your student account/i, /legal full name/i],
  ])('keeps the standalone %s card readable when dark mode is selected', async (_name, element, headingName, inputName) => {
    const user = userEvent.setup();
    localStorage.setItem('iars-theme', 'light');
    renderRoute(element);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /current theme: light mode/i }));
    if (_name === 'login') await user.click(screen.getAllByRole('button', { name: /^log in$/i })[0]);
    else await agreeToPrivacy();
    expect(document.documentElement).toHaveClass('dark');

    const card = screen.getByRole(_name === 'login' ? 'dialog' : 'main', { name: headingName });
    expect(card).toBeVisible();
    expect(screen.getByRole('textbox', { name: inputName })).toHaveClass('dark:text-white');
    expect(screen.getByRole('textbox', { name: inputName }).className).toMatch(/dark:bg-slate-800/);
  });

  it('renders a long rejected registration status with wrapping and accessible actions', async () => {
    const rejectionReason = `REVIEW-${'X'.repeat(256)}`;
    localStorage.setItem('iars-theme', 'dark');
    routeState.auth = { isMock: true, profile: null, stats: null, user: { uid: 'applicant-1' } };
    routeState.applications = [{
      id: 'applicant-1',
      form_data: studentProfile,
      rejection_count: 1,
      rejection_reason: rejectionReason,
      status: 'rejected',
    }];

    renderRoute(<RegisterStatus />);

    expect(await screen.findByRole('heading', { name: /application rejected/i })).toBeInTheDocument();
    expect(screen.getByText(rejectionReason).closest('main')).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByRole('button', { name: /reapply with updated details/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /current theme: dark mode/i })).toBeInTheDocument();
    expect(screen.getByText(rejectionReason).closest('section')).toHaveClass('app-surface');
  });

  it('does not redirect registration status while authentication is still initializing', async () => {
    routeState.auth = { isMock: true, loading: true, profile: null, stats: null, user: null };

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/register/status']}>
          <Routes>
            <Route element={<RegisterStatus />} path="/register/status" />
            <Route element={<h1>Login destination</h1>} path="/login" />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByRole('status', { name: /loading application status/i })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('heading', { name: /login destination/i })).not.toBeInTheDocument();
  });
});

describe('student route UI behavior', () => {
  const useStudent = useStudentRoute;

  it('renders the student dashboard as a named page with stable metric hierarchy', () => {
    useStudent();
    renderRoute(<Dashboard />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /welcome back, juan dela cruz/i })).toBeInTheDocument();
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /my qr passport/i })).toBeInTheDocument();
  });

  it('exposes a bounded, named student QR and its download action', async () => {
    useStudent();
    renderRoute(<StudentQR />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /my digital id/i })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: /student qr code/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download card as png/i })).toBeInTheDocument();
    expect(screen.getByText(/refreshes automatically every 45 seconds/i)).toBeInTheDocument();
  });

  it('renders accessible record filters and equivalent mobile and desktop ledgers', async () => {
    const user = userEvent.setup();
    useStudent();
    renderRoute(<StudentRecords />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    const search = screen.getByRole('searchbox', { name: /search attendance records/i });
    expect(screen.getByRole('combobox', { name: /filter by category/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /filter by status/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /attendance ledger/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^weekly institutional flag raising ceremony$/i })).toHaveLength(1);

    await user.type(search, 'Disaster Risk');
    expect(screen.queryByRole('button', { name: /^weekly institutional flag raising ceremony$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^disaster risk & safety drill$/i })).toBeInTheDocument();
  });

  it('labels profile, password, two-factor, and session controls', async () => {
    const user = userEvent.setup();
    useStudent();
    renderRoute(<StudentProfile />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save contact details/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Information requests' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /request information change/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /request information change/i }));
    expect(screen.getByRole('textbox', { name: /mobile contact/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^guardian name$/i })).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog', { name: 'Request information change' })).getByRole('button', { name: 'Close dialog' }));
    await user.click(screen.getByRole('button', { name: /close dialog/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /enable two-factor authentication/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change password/i }).parentElement).toHaveClass(
      'flex-col', 'lg:flex-row',
    );

    await user.click(screen.getByRole('button', { name: /change password/i }));
    const currentPassword = screen.getByLabelText(/^current password$/i);
    expect(currentPassword).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /show current password/i }));
    expect(currentPassword).toHaveAttribute('type', 'text');
    await user.type(currentPassword, 'Current-password-test');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));
    const newPassword = await screen.findByLabelText(/^new password$/i);
    const confirmPassword = screen.getByLabelText(/confirm new password/i);
    await user.click(screen.getByRole('button', { name: /show new password/i }));
    await user.click(screen.getByRole('button', { name: /show password confirmation/i }));
    expect(newPassword).toHaveAttribute('type', 'text');
    expect(confirmPassword).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /sign out of portal/i })).toBeInTheDocument();
  });

  it('opens Google Authenticator enrollment in a cancelable modal panel', async () => {
    const user = userEvent.setup();
    useStudent();
    renderRoute(<StudentProfile />);

    const enrollmentTrigger = screen.getByRole('button', { name: /enable two-factor authentication/i });
    await user.click(enrollmentTrigger);

    const dialog = await screen.findByRole('dialog', { name: /enroll google authenticator/i });
    expect(within(dialog).getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /enroll/i })).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/six-digit authentication code/i), '123456');
    expect(within(dialog).getByRole('button', { name: /enroll/i })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog', { name: /enroll google authenticator/i })).not.toBeInTheDocument();
    expect(enrollmentTrigger).toHaveFocus();
  });

  it('routes student contact changes through an approval request', async () => {
    const user = userEvent.setup();
    routeState.auth = {
      isMock: true,
      profile: { ...studentProfile, phone: '0917 000 0000', guardian: { name: 'Original Guardian', contact: '0918 000 0000' } },
      stats: { attendance_rate: 94, sanction_hours: 2, events_attended: 12, events_missed: 1 },
      user: { uid: studentProfile.uid },
    };
    renderRoute(<StudentProfile />);
    await user.click(screen.getByRole('button', { name: 'Information requests' }));

    expect(screen.queryByRole('button', { name: /edit contact details/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save contact details/i })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /request information change/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /request information change/i }));
    const phone = screen.getByRole('textbox', { name: /mobile contact/i });
    await user.clear(phone);
    await user.type(phone, '0999 111 2222');
    await user.type(screen.getByLabelText('Reason for request'), 'Please correct my mobile contact number.');
    await user.click(screen.getByRole('button', { name: /submit request/i }));

    expect(staffState.updateContactDetails).not.toHaveBeenCalled();
    expect((await import('../lib/profileRequests')).submitProfileRequest).toHaveBeenCalledWith('edit', { phone: '0999 111 2222' }, 'Please correct my mobile contact number.');
  });

  it('keeps event details and excuse filing as named, stacked modal workflows', async () => {
    const user = userEvent.setup();
    useStudent();
    renderRoute(<StudentEvents />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /university midyear leadership convocation/i }));
    expect(screen.getByRole('dialog', { name: /university midyear leadership convocation/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /file for excuse/i }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(screen.getByRole('dialog', { name: /file excuse application.*university midyear leadership convocation/i })).toBeInTheDocument();
    const details = screen.getByRole('textbox', { name: /detailed explanation/i });
    expect(details).toBeRequired();
    await user.click(screen.getByRole('button', { name: /submit formal excuse/i }));
    expect(screen.queryByText(/excuse letter submitted/i)).not.toBeInTheDocument();
    await user.type(details, 'Recovering from a documented medical condition.');
    await user.type(screen.getByRole('textbox', { name: /guardian \/ contact mobile number/i }), '0917 123 4567');
    await user.upload(
      screen.getByLabelText(/attach excuse letter \/ medical certificate/i),
      new File(['proof'], 'medical-certificate.pdf', { type: 'application/pdf' }),
    );
    expect(screen.getByText('medical-certificate.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /submit formal excuse/i }));
    expect(await screen.findByText(/excuse letter submitted/i)).toBeInTheDocument();
    await user.click(screen.getAllByTestId('modal-backdrop').at(-1)!);
    expect(screen.getByRole('dialog', { name: /file excuse application.*university midyear leadership convocation/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /file excuse application/i })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /university midyear leadership convocation/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass('app-scroll-lock');
  });

  it('keeps ceremony details and response filing as named, stacked modal workflows', async () => {
    const user = userEvent.setup();
    useStudent();
    renderRoute(<StudentCeremonies />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /weekly institutional flag raising ceremony/i }));
    expect(screen.getByRole('dialog', { name: /weekly institutional flag raising ceremony/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /file for excuse/i }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    expect(screen.getByRole('dialog', { name: /excuse letter submission.*weekly institutional flag raising ceremony/i })).toBeInTheDocument();
    const details = screen.getByRole('textbox', { name: /detailed justification/i });
    expect(details).toBeRequired();
    await user.click(screen.getByRole('button', { name: /transmit exemption letter/i }));
    expect(screen.queryByText(/exemption form transmitted/i)).not.toBeInTheDocument();
    await user.type(details, 'Representing the school at an official academic competition.');
    await user.upload(
      screen.getByLabelText(/upload supporting document \/ excuse letter/i),
      new File(['proof'], 'competition-letter.pdf', { type: 'application/pdf' }),
    );
    expect(screen.getByText('competition-letter.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /transmit exemption letter/i }));
    expect(await screen.findByText(/exemption form transmitted/i)).toBeInTheDocument();
    await user.click(screen.getAllByTestId('modal-backdrop').at(-1)!);
    expect(screen.getByRole('dialog', { name: /excuse letter submission.*weekly institutional flag raising ceremony/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /excuse letter submission/i })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /weekly institutional flag raising ceremony/i })).toBeInTheDocument();
  });

  it.each([false, true])('blocks expired excuses and honors activity-specific extensions (ceremony=%s)', async (ceremony) => {
    const user = userEvent.setup();
    useStudent();
    staffState.events = [{ id: 'expired', title: 'Expired Activity', status: 'done', kind: ceremony ? 'flag_ceremony' : 'attendance', endTime: Date.now() - 4 * 86400000, startTime: Date.now() - 5 * 86400000, excuseWindowDays: 3 }];
    const { unmount } = renderRoute(ceremony ? <StudentCeremonies /> : <StudentEvents />);
    await openDisclosure(user, ceremony ? /archived ceremonies/i : /archived events/i);
    await user.click(screen.getByRole('button', { name: /expired activity/i }));
    expect(screen.getByRole('button', { name: /file for excuse/i })).toBeDisabled();
    expect(screen.getAllByText(/submission window has closed/i).length).toBeGreaterThan(0);
    unmount();
    staffState.events[0].excuseWindowDays = 7;
    renderRoute(ceremony ? <StudentCeremonies /> : <StudentEvents />);
    await openDisclosure(user, ceremony ? /archived ceremonies/i : /archived events/i);
    await user.click(screen.getByRole('button', { name: /expired activity/i }));
    expect(screen.getByRole('button', { name: /file for excuse/i })).toBeEnabled();
  });

  it('allows retrospective excuses for ended events and archived ceremonies', async () => {
    const user = userEvent.setup();
    useStudent();
    const { unmount } = renderRoute(<StudentEvents />);

    await openDisclosure(user, /archived events/i);
    await user.click(screen.getByRole('button', { name: /first semester general assembly 2025/i }));
    expect(screen.getByRole('dialog', { name: /first semester general assembly 2025/i })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /file for excuse/i })).toBeInTheDocument();

    unmount();
    renderRoute(<StudentCeremonies />);
    await openDisclosure(user, /archived ceremonies/i);
    await user.click(screen.getByRole('button', { name: /annual founders day thanksgiving mass/i }));
    expect(screen.getByRole('dialog', { name: /annual founders day thanksgiving mass/i })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /file for excuse/i })).toBeInTheDocument();
  });
});

describe('complete routed view render matrix', () => {
  const publicRoute = () => undefined;
  const applicantRoute = () => {
    routeState.auth = { isMock: true, profile: null, stats: null, user: { uid: 'applicant-1' } };
    routeState.applications = [{ id: 'applicant-1', status: 'pending', form_data: studentProfile }];
  };
  const staffRoute = () => {
    useStaff();
    seedStaffDirectory();
    staffState.events = [{ id: 'event-1', title: 'Institutional Assembly', status: 'active' }];
  };

  const routedViews: Array<{
    path: string;
    file: string;
    element: React.ReactElement;
    setup: () => void;
    usesPage: boolean;
  }> = [
    { path: '/', file: 'views/LandingPage.tsx', element: <LandingPage />, setup: publicRoute, usesPage: false },
    { path: '/login', file: 'views/LandingPage.tsx', element: <LandingPage defaultOpenLogin />, setup: publicRoute, usesPage: false },
    { path: '/register', file: 'views/Register.tsx', element: <Register />, setup: publicRoute, usesPage: false },
    { path: '/register/status', file: 'views/RegisterStatus.tsx', element: <RegisterStatus />, setup: applicantRoute, usesPage: false },
    { path: '/dashboard', file: 'views/Dashboard.tsx', element: <Dashboard />, setup: useStudentRoute, usesPage: true },
    { path: '/student/qr', file: 'views/StudentQR.tsx', element: <StudentQR />, setup: useStudentRoute, usesPage: true },
    { path: '/student/events', file: 'views/StudentEvents.tsx', element: <StudentEvents />, setup: useStudentRoute, usesPage: true },
    { path: '/student/ceremonies', file: 'views/StudentCeremonies.tsx', element: <StudentCeremonies />, setup: useStudentRoute, usesPage: true },
    { path: '/student/records', file: 'views/StudentRecords.tsx', element: <StudentRecords />, setup: useStudentRoute, usesPage: true },
    { path: '/student/profile', file: 'views/StudentProfile.tsx', element: <StudentProfile />, setup: useStudentRoute, usesPage: true },
    { path: '/mayor/scan', file: 'views/MayorScanner.tsx', element: <MayorScanner />, setup: staffRoute, usesPage: true },
    { path: '/ssg/panel', file: 'views/SSGPanel.tsx', element: <SSGPanel />, setup: staffRoute, usesPage: true },
    { path: '/ssg/events', file: 'views/SSGEventCreation.tsx', element: <SSGEventCreation />, setup: staffRoute, usesPage: true },
    { path: '/ssg/events/create', file: 'views/SSGCreateEvent.tsx', element: <SSGCreateEvent />, setup: staffRoute, usesPage: true },
    { path: '/admin/attendance', file: 'views/AttendanceDashboard.tsx', element: <AttendanceDashboard />, setup: staffRoute, usesPage: true },
    { path: '/admin/controls', file: 'views/AdminControls.tsx', element: <AdminControls />, setup: () => { staffRoute(); routeState.auth.profile = { ...routeState.auth.profile!, role: 'admin' }; }, usesPage: true },
    { path: '/admin/members', file: 'views/ManageMembers.tsx', element: <ManageMembers />, setup: staffRoute, usesPage: true },
    { path: '/ossa/dashboard', file: 'views/OSSADashboard.tsx', element: <OSSADashboard />, setup: staffRoute, usesPage: true },
  ];

  it.each(routedViews)('$path ($file) renders with page containment and named controls', async ({
    element, file, setup, usesPage,
  }) => {
    setup();
    const { container } = renderRoute(element);

    if (usesPage) {
      expect(
        screen.getByRole('main'),
        `${file}: routed view must render through the shared Page containment component`,
      ).toHaveClass('app-page');
    } else {
      expect(container.firstElementChild, `${file}: routed view must render a bounded root`).toBeInTheDocument();
    }

    Array.from(container.querySelectorAll('button')).forEach((button) => {
      expect(
        button,
        `${file}: every rendered button, including icon-only controls, must have an accessible name`,
      ).toHaveAccessibleName();
    });

    const dialog = screen.queryByRole('dialog');
    if (dialog) {
      expect(
        dialog.closest('[data-modal-root="true"]'),
        `${file}: rendered dialogs must use the shared viewport-safe modal shell`,
      ).toBeInTheDocument();
    }
  });
});

describe('staff route UI behavior', () => {
  it('initializes responsive charts without invalid-dimension warnings', () => {
    const consoleWarning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      useStaff();
      seedStaffDirectory();
      const attendance = renderRoute(<AttendanceDashboard />);
      attendance.unmount();
      renderRoute(<OSSADashboard />);

      expect(consoleWarning.mock.calls.flat().join(' ')).not.toMatch(/width\(-1\).*height\(-1\)/i);
    } finally {
      consoleWarning.mockRestore();
    }
  });

  it('keeps scanner controls operable while scan outcomes use named dialogs', async () => {
    const user = userEvent.setup();
    useStaff();
    seedStaffDirectory();
    staffState.events = [{
      id: 'event-1',
      title: 'Institutional Assembly',
      status: 'active',
      location: { lat: 7, lng: 125, radius_meters: 100 },
    }];
    staffState.logAttendance.mockReturnValue({ time_in: Date.now(), status: 'present', already_recorded: false });

    renderRoute(<MayorScanner />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /institutional assembly/i }));
    expect(screen.queryByRole('button', { name: /use demo location/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start scanning/i }));

    expect(screen.getByRole('heading', { name: /attendance recording/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /attendance scanner/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /camera selection/i })).toHaveTextContent(/rear-facing camera/i);
    expect(document.getElementById('mayor-camera-reader')).toBeEmptyDOMElement();
    await user.click(screen.getByRole('button', { name: /start scanner/i }));

    expect(await screen.findByRole('region', { name: /camera scanner/i })).toHaveClass(
      'aspect-square',
      'sm:aspect-video',
      'w-full',
      'overflow-hidden',
    );
    expect(screen.getByRole('button', { name: /stop scanner/i })).toBeInTheDocument();
    await waitFor(() => expect(scannerState.start).toHaveBeenCalledTimes(1));
    expect(scannerState.start.mock.calls[0][1]).toEqual({ fps: 12 });

    scannerState.decoded?.('RMC1.test-token');
    expect(await screen.findByRole('dialog', { name: /verify student identity/i })).toBeInTheDocument();
    expect(staffState.logAttendance).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^record$/i }));
    expect(staffState.logAttendance).toHaveBeenCalledWith('event-1', 'student-1', 'staff-1', 'SSG President', undefined, 'in', expect.objectContaining({ qrToken: 'RMC1.test-token' }));
    expect(await screen.findByRole('dialog', { name: /attendance recorded/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /scan next student/i }));
    await user.click(screen.getByRole('button', { name: /stop scanner/i }));
    await waitFor(() => expect(scannerState.stop).toHaveBeenCalledTimes(1));
  });

  it('renders a disabled loading action until asynchronous scanner startup completes', async () => {
    const user = userEvent.setup();
    useStaff();
    staffState.events = [{ id: 'event-1', title: 'Institutional Assembly', status: 'active' }];
    let resolveStart!: () => void;
    scannerState.startPromise = new Promise<void>((resolve) => { resolveStart = resolve; });
    renderRoute(<MayorScanner />);

    await user.click(screen.getByRole('button', { name: /institutional assembly/i }));
    expect(screen.queryByRole('button', { name: /use demo location/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start scanning/i }));
    await user.click(screen.getByRole('button', { name: /start scanner/i }));

    expect(screen.queryByRole('button', { name: /start scanner/i })).not.toBeInTheDocument();
    const loadingAction = screen.getByRole('button', { name: /stop scanner/i });
    expect(loadingAction).toBeDisabled();

    resolveStart();
    expect(await screen.findByRole('region', { name: /camera scanner/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop scanner/i })).toBeEnabled();
  });

  it('waives an identified student without saving attendance', async () => {
    const user = userEvent.setup();
    routeState.auth = {
      isMock: true,
      profile: { ...studentProfile, uid: 'mayor-1', name: 'Section Mayor', role: 'mayor' } as typeof studentProfile,
      stats: null,
      user: { uid: 'mayor-1' },
    };
    staffState.students = [{ ...studentProfile, uid: 'mock_uid_student' }];
    staffState.events = [{ id: 'event-1', title: 'Institutional Assembly', status: 'active', location: { lat: 7, lng: 125, radius_meters: 100 } }];
    renderRoute(<MayorScanner />);

    await user.click(screen.getByRole('button', { name: /institutional assembly/i }));
    expect(screen.queryByRole('button', { name: /use demo location/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start scanning/i }));
    await user.type(screen.getByRole('textbox', { name: /student id/i }), studentProfile.student_id);
    await user.click(screen.getByRole('button', { name: /check student/i }));
    expect(await screen.findByRole('dialog', { name: /verify student identity/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /waive/i }));
    expect(staffState.logAttendance).not.toHaveBeenCalled();
  });

  it('checks an exact student ID manually before recording attendance', async () => {
    const user = userEvent.setup();
    routeState.auth = {
      isMock: true,
      profile: { ...studentProfile, uid: 'mayor-1', name: 'Section Mayor', role: 'mayor' } as typeof studentProfile,
      stats: null,
      user: { uid: 'mayor-1' },
    };
    staffState.students = [studentProfile];
    staffState.events = [{ id: 'event-1', title: 'Institutional Assembly', status: 'active', location: { lat: 7, lng: 125, radius_meters: 100 } }];
    staffState.logAttendance.mockReturnValue({ time_in: Date.now(), status: 'present', already_recorded: false });
    renderRoute(<MayorScanner />);

    await user.click(screen.getByRole('button', { name: /institutional assembly/i }));
    expect(screen.queryByRole('button', { name: /use demo location/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start scanning/i }));
    const studentIdInput = screen.getByRole('textbox', { name: /student id/i });
    expect(studentIdInput).toHaveAttribute('autocomplete', 'off');
    await user.type(studentIdInput, studentProfile.student_id);
    await user.click(screen.getByRole('button', { name: /check student/i }));

    expect(await screen.findByRole('dialog', { name: /verify student identity/i })).toBeInTheDocument();
    expect(screen.getByText(studentProfile.student_id)).toBeInTheDocument();
    expect(staffState.logAttendance).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: /reason for manual entry/i }), 'Student presented a valid school ID');
    await user.click(screen.getByRole('button', { name: /^record$/i }));
    expect(staffState.logAttendance).toHaveBeenCalledWith('event-1', 'student-1', 'mayor-1', 'Section Mayor', undefined, 'in', expect.objectContaining({ manualReason: 'Student presented a valid school ID' }));
  });

  it.each([
    { age: 0, accuracy: 5, freshCalls: 1 },
    { age: 20000, accuracy: 5, freshCalls: 2 },
    { age: 0, accuracy: 200, freshCalls: 2 },
  ])('validates watched GPS freshness and accuracy before recording ($age ms, $accuracy m)', async ({ age, accuracy, freshCalls }) => {
    const originalGeolocation = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    const position = (positionAge = 0, positionAccuracy = 5) => ({
      timestamp: Date.now() - positionAge,
      coords: { latitude: 7, longitude: 125, accuracy: positionAccuracy },
    });
    const getCurrentPosition = vi.fn(success => success(position()));
    const watchPosition = vi.fn(success => { success(position(age, accuracy)); return 17; });
    const clearWatch = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition, watchPosition, clearWatch } });
    let rendered: ReturnType<typeof render> | undefined;
    try {
      const user = userEvent.setup();
      routeState.auth = {
        isMock: true,
        profile: { ...studentProfile, uid: 'mayor-1', name: 'Section Mayor', role: 'mayor' } as typeof studentProfile,
        stats: null,
        user: { uid: 'mayor-1' },
      };
      staffState.students = [studentProfile];
      staffState.events = [{ id: 'event-1', title: 'Institutional Assembly', status: 'active', geofenceEnabled: true, location: { lat: 7, lng: 125, radius_meters: 100 } }];
      staffState.logAttendance.mockReturnValue({ time_in: Date.now(), status: 'present', already_recorded: false });
      rendered = renderRoute(<MayorScanner />);
      await user.click(screen.getByRole('button', { name: /institutional assembly/i }));
      await user.click(screen.getByRole('button', { name: /start scanning/i }));
      await waitFor(() => expect(watchPosition).toHaveBeenCalledTimes(1));
      await user.type(screen.getByRole('textbox', { name: /student id/i }), studentProfile.student_id);
      await user.click(screen.getByRole('button', { name: /check student/i }));
      await screen.findByRole('dialog', { name: /verify student identity/i });
      await user.type(screen.getByRole('textbox', { name: /reason for manual entry/i }), 'Valid physical school ID');
      await user.click(screen.getByRole('button', { name: /^record$/i }));
      await waitFor(() => expect(staffState.logAttendance).toHaveBeenCalledTimes(1));
      expect(getCurrentPosition).toHaveBeenCalledTimes(freshCalls);
      expect(staffState.logAttendance).toHaveBeenCalledWith('event-1', 'student-1', 'mayor-1', 'Section Mayor', undefined, 'in', expect.objectContaining({
        position: expect.objectContaining({ latitude: 7, longitude: 125, accuracy: 5 }),
      }));
      rendered.unmount();
      expect(clearWatch).toHaveBeenCalledWith(17);
    } finally {
      rendered?.unmount();
      if (originalGeolocation) Object.defineProperty(navigator, 'geolocation', originalGeolocation);
      else Reflect.deleteProperty(navigator, 'geolocation');
    }
  });

  it('reports invalid QR passports without recording attendance', async () => {
    const user = userEvent.setup();
    useStaff();
    staffState.events = [{ id: 'event-1', title: 'Institutional Assembly', status: 'active' }];
    renderRoute(<MayorScanner />);

    await user.click(screen.getByRole('button', { name: /institutional assembly/i }));
    expect(screen.queryByRole('button', { name: /use demo location/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start scanning/i }));
    await user.click(screen.getByRole('button', { name: /start scanner/i }));
    await waitFor(() => expect(scannerState.decoded).toBeTypeOf('function'));
    scannerState.decoded?.('not-a-student');

    expect((await screen.findAllByText(/ATT-001/)).length).toBeGreaterThan(0);
    expect(staffState.logAttendance).not.toHaveBeenCalled();
  });

  it('renders section members as equivalent searchable desktop rows and labeled mobile cards', async () => {
    const user = userEvent.setup();
    useStaff();
    seedStaffDirectory();
    renderRoute(<ManageMembers />);

    expect(await screen.findByRole('main')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /senior high school/i }));
    await user.click(screen.getByRole('button', { name: /^newton/i }));

    expect(screen.getByRole('searchbox', { name: /search section members/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /filter members by role/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bulk create members/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /newton member registry/i })).toBeInTheDocument();
    const memberCard = screen.getByRole('article', { name: /juan dela cruz/i });
    expect(memberCard).toHaveClass('mobile-data-card');
    expect(within(memberCard).getByText(/long-address/i)).toBeInTheDocument();
    expect(within(memberCard).getByText(studentProfile.student_id)).toBeInTheDocument();
    expect(within(memberCard).getByText('student')).toBeInTheDocument();
    expect(screen.getAllByText(studentProfile.student_id)).toHaveLength(2);
    expect(screen.getAllByText(/long-address/i)[0]).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.queryByText(/^active$/i)).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /assign .* as mayor/i })[0]);
    expect(staffState.assignSectionMayor).toHaveBeenCalledWith('student-1', 'section-newton', 'Newton');

    await user.type(screen.getByRole('searchbox', { name: /search section members/i }), 'missing member');
    expect(screen.queryByRole('article', { name: /juan dela cruz/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no members match/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add member/i }));
    const memberForm = screen.getByRole('dialog', { name: /add member to newton/i });
    expect(within(memberForm).getByRole('textbox', { name: /legal full name/i })).toBeRequired();
    expect(within(memberForm).getByRole('textbox', { name: /email address/i })).toBeRequired();
    await user.click(screen.getByTestId('modal-backdrop'));
    expect(screen.getByRole('dialog', { name: /add member to newton/i })).toBeInTheDocument();
  });

  it('bulk creates reviewed members with the selected section assignment', async () => {
    const user = userEvent.setup();
    useStaff();
    seedStaffDirectory();
    renderRoute(<ManageMembers />);
    await user.click(await screen.findByRole('button', { name: /senior high school/i }));
    await user.click(screen.getByRole('button', { name: /^newton/i }));
    await user.click(screen.getByRole('button', { name: /bulk create members/i }));

    const csv = 'name,email,username,student_id,role,phone,guardian_name,guardian_contact,guardian_email\r\n'
      + 'Ada Lovelace,ada@example.edu,ada,2026-00010A,student,,,,\r\n'
      + 'Grace Hopper,grace@example.edu,grace,2026-00011A,mayor,09170000000,Parent Hopper,09171111111,parent@example.edu';
    const file = new File([csv], 'newton.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => csv });
    const dialog = screen.getByRole('dialog', { name: /bulk create members in newton/i });
    await user.upload(within(dialog).getByLabelText(/upload completed csv/i), file);
    await within(dialog).findByText(/2 people detected/i);
    await user.click(within(dialog).getByRole('button', { name: /create 2 members/i }));

    const schoolData = expect.objectContaining({
      section: 'Newton',
      academic_assignment: expect.objectContaining({ terminalGroupId: 'section-newton' }),
    });
    expect(staffState.createSectionMembers).toHaveBeenCalledWith([
      expect.objectContaining({
        makeMayor: false,
        profile: expect.objectContaining({ name: 'Ada Lovelace', role: 'student', school_data: schoolData }),
      }),
      expect.objectContaining({
        makeMayor: true,
        profile: expect.objectContaining({
          name: 'Grace Hopper', role: 'student', phone: '09170000000',
          guardian: { name: 'Parent Hopper', contact: '09171111111', email: 'parent@example.edu' },
          school_data: schoolData,
        }),
      }),
    ], 'section-newton', 'Newton');
  });

  it('submits a college member with school data derived from the selected directory branch', async () => {
    const user = userEvent.setup();
    useStaff();
    seedCollegeDirectory();
    renderRoute(<ManageMembers />);

    await user.click(await screen.findByRole('button', { name: /^college/i }));
    await user.click(screen.getByRole('button', { name: /college of arts and sciences/i }));
    await user.click(screen.getByRole('button', { name: /bs computer science/i }));
    await user.click(screen.getByRole('button', { name: /^cs-1a/i }));
    await user.click(screen.getByRole('button', { name: /add member/i }));

    const form = screen.getByRole('dialog', { name: /add member to cs-1a/i });
    await user.type(within(form).getByRole('textbox', { name: /legal full name/i }), 'Ada Lovelace');
    await user.type(within(form).getByRole('textbox', { name: /email address/i }), 'ada@rmc.edu.ph');
    await user.type(within(form).getByRole('textbox', { name: /username/i }), 'ada.lovelace');
    await user.type(within(form).getByRole('textbox', { name: /student id/i }), '2026-01001A');
    await user.click(within(form).getByRole('button', { name: /create member/i }));

    expect(staffState.createSectionMembers).toHaveBeenCalledWith([{
      makeMayor: false,
      profile: {
        name: 'Ada Lovelace',
        email: 'ada@rmc.edu.ph',
        username: 'ada.lovelace',
        role: 'student',
        student_id: '2026-01001A',
        school_data: {
        type: 'College',
        level: '',
        section: 'CS-1A',
        department: 'College of Arts and Sciences',
        program: 'BS Computer Science',
        school_id: 'school-rmc',
        academic_assignment: {
          campusId: 'school-rmc',
          nodePathIds: ['school-rmc', 'department-college', 'college-cas', 'program-bscs', 'section-cs1a'],
          terminalGroupId: 'section-cs1a',
        },
        },
      },
    }], 'section-cs1a', 'CS-1A');
  });

  it('blocks invalid or whitespace-only single-member details', async () => {
    const user = userEvent.setup();
    useStaff();
    seedStaffDirectory();
    renderRoute(<ManageMembers />);
    await user.click(await screen.findByRole('button', { name: /senior high school/i }));
    await user.click(screen.getByRole('button', { name: /^newton/i }));
    await user.click(screen.getByRole('button', { name: /add member/i }));
    const form = screen.getByRole('dialog', { name: /add member to newton/i });
    fireEvent.change(within(form).getByRole('textbox', { name: /legal full name/i }), { target: { value: '   ' } });
    fireEvent.change(within(form).getByRole('textbox', { name: /email address/i }), { target: { value: 'invalid' } });
    fireEvent.change(within(form).getByRole('textbox', { name: /username/i }), { target: { value: 'new.user' } });
    fireEvent.change(within(form).getByRole('textbox', { name: /student id/i }), { target: { value: '2026-90001A' } });
    await user.click(within(form).getByRole('button', { name: /create member/i }));

    expect(within(form).getByText(/field is required/i)).toBeInTheDocument();
    expect(within(form).getByText(/valid email/i)).toBeInTheDocument();
    expect(staffState.createSectionMembers).not.toHaveBeenCalled();
  });

  it('keeps SSG unit creation in a named dialog', async () => {
    const user = userEvent.setup();
    useStaff();
    routeState.auth.profile!.role = 'admin';
    seedStaffDirectory();
    renderRoute(<SSGPanel />);

    await user.click(screen.getByRole('button', { name: /add unit/i }));
    const unitDialog = screen.getByRole('dialog', { name: /establish unit/i });
    await user.type(within(unitDialog).getByRole('textbox', { name: /unit designation/i }), 'New College Division');
    await user.click(within(unitDialog).getByRole('button', { name: /establish unit/i }));
    expect(staffState.addSchoolNode).toHaveBeenCalledWith(null, expect.objectContaining({
      id: expect.stringMatching(/^education_unit_/),
      name: 'New College Division',
      type: 'education_unit',
      children: [],
    }));

  });

  it('shows, searches, and filters the SSG event registry before opening event creation', async () => {
    const user = userEvent.setup();
    useStaff();
    const baseEvent = {
      description: 'Event details', created_by: 'SSG President', startTime: Date.now(), endTime: Date.now() + 3600000,
      penaltyValue: 1, penaltyUnit: 'hours', participantsType: 'all', target: { all: true },
      location: { lat: 7.0736, lng: 125.6126, radius_meters: 100 }, timestamp: Date.now(),
    };
    staffState.events = [
      { ...baseEvent, id: 'ongoing-1', title: 'Live Assembly', status: 'active', recipientGroups: ['All Students'], geofenceEnabled: true },
      { ...baseEvent, id: 'scheduled-1', title: 'Future College Fair', status: 'upcoming', recipientGroups: ['College'], geofenceEnabled: false },
      { ...baseEvent, id: 'archived-1', title: 'Past JHS Program', status: 'done', recipientGroups: ['JHS'], geofenceEnabled: true },
    ];

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/ssg/events']}>
          <Routes>
            <Route path="/ssg/events" element={<SSGEventCreation />} />
            <Route path="/ssg/events/create" element={<p>Create event destination</p>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByRole('heading', { name: /^institutional events$/i })).toBeInTheDocument();
    expect(screen.getByText(/campus calendar/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /active.*ongoing.*1/i })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: /live assembly/i })).toHaveClass('bg-brand-950', 'text-white');
    expect(screen.getByRole('button', { name: /scheduled upcoming events.*1/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /archived events.*1/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('heading', { name: /archived events.*1/i })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: /search events/i }), 'Future College');
    expect(screen.getByText('Future College Fair')).toBeInTheDocument();
    expect(screen.queryByText('Live Assembly')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: /search events/i }));
    await user.click(screen.getByRole('button', { name: /event status/i }));
    await user.click(screen.getByRole('option', { name: /archived/i }));
    expect(screen.getByRole('button', { name: /event recipients/i })).toHaveTextContent(/all recipients/i);
    expect(screen.getByRole('button', { name: /geofence status/i })).toHaveTextContent(/all events/i);
    expect(screen.getByText('Past JHS Program')).toBeInTheDocument();
    expect(screen.queryByText('Future College Fair')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create event/i }));
    expect(screen.getByText(/create event destination/i)).toBeInTheDocument();
  });

  it('shows one Edit action and opens the prefilled create-style event editor', async () => {
    const user = userEvent.setup();
    useStaff();
    seedCollegeDirectory();
    const now = Date.now();
    const baseEvent = {
      description: 'Complete event details', created_by: 'SSG President', scopeNodeId: 'school-rmc', startTime: now, endTime: now + 3600000,
      penaltyValue: 2, penaltyUnit: 'hours', participantsType: 'all', target: { all: true },
      recipientGroups: ['All Students'], geofenceEnabled: true,
      location: { lat: 7.0736, lng: 125.6126, radius_meters: 100 }, timestamp: now,
      attendanceWindows: [{ id: 'window-1', label: 'Main', timeIn: '08:00', timeOut: '10:00', lateAfterMinutes: 15 }],
      sanctionRules: { late: { value: 30, unit: 'minutes' }, absent: { value: 2, unit: 'hours' } },
    };
    staffState.events = [
      { ...baseEvent, id: 'active-1', title: 'Live Assembly', status: 'active' },
      { ...baseEvent, id: 'scheduled-1', title: 'Future Fair', status: 'upcoming', startTime: now + 86400000, endTime: now + 90000000 },
      { ...baseEvent, id: 'archived-1', title: 'Past Program', status: 'done' },
    ];
    render(
      <ThemeProvider><MemoryRouter initialEntries={['/ssg/events']}><Routes>
        <Route path="/ssg/events" element={<SSGEventCreation />} />
        <Route path="/ssg/events/:eventId/edit" element={<SSGCreateEvent />} />
      </Routes></MemoryRouter></ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: /open live assembly details/i }));
    let dialog = screen.getByRole('dialog', { name: /live assembly/i });
    expect(within(dialog).getByText('Complete event details')).toBeInTheDocument();
    const activeEdit = within(dialog).getByRole('button', { name: /^edit$/i });
    expect(within(dialog).getAllByRole('button', { name: /^edit$/i })).toHaveLength(1);
    await user.click(activeEdit);
    expect(screen.getByRole('heading', { name: /edit event/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /event title/i })).toHaveValue('Live Assembly');
    expect(screen.getByRole('button', { name: /extend by 1 hour/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /finish and archive/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete event/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /back to events/i }));

    await user.click(screen.getByRole('button', { name: /scheduled upcoming events/i }));
    await user.click(screen.getByRole('button', { name: /open future fair details/i }));
    dialog = screen.getByRole('dialog', { name: /future fair/i });
    expect(within(dialog).getAllByRole('button', { name: /^edit$/i })).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: /^edit$/i }));
    expect(screen.getByRole('textbox', { name: /event title/i })).toHaveValue('Future Fair');
    expect(screen.getByRole('button', { name: /reschedule/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /drop/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    const editActions = screen.getByRole('group', { name: /event form actions/i });
    expect(editActions).toHaveClass('grid-cols-2', 'sm:flex');
    expect(within(editActions).getByRole('button', { name: /reschedule/i })).toHaveClass('sm:w-auto');
    expect(within(editActions).getByRole('button', { name: /delete/i })).toHaveClass('text-red-700');
    expect(within(editActions).getByRole('button', { name: /submit changes for approval/i })).toHaveClass('sm:min-w-32');
    await user.click(screen.getByRole('button', { name: /back to events/i }));

    await openDisclosure(user, /archived events/i);
    await user.click(screen.getByRole('button', { name: /open past program details/i }));
    dialog = screen.getByRole('dialog', { name: /past program/i });
    expect(within(dialog).getByText(/read-only archived record/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('schedules an event with combined recipients, geofencing, multiple windows, and sanction rules', async () => {
    const user = userEvent.setup();
    useStaff();
    seedCollegeDirectory();
    renderRoute(<SSGCreateEvent />);

    const form = screen.getByRole('form', { name: /schedule attendance event/i });
    await user.type(within(form).getByRole('textbox', { name: /event title/i }), 'College General Assembly');
    const details = within(form).getByRole('textbox', { name: /event details/i });
    expect(details).toHaveClass('input-field');
    await user.type(details, 'Required institutional assembly.');
    await user.click(screen.getByRole('button', { name: 'Next: Schedule' }));
    fireEvent.change(within(form).getByLabelText(/^start date$/i), { target: { value: '2026-08-10' } });
    fireEvent.change(within(form).getByLabelText(/^end date$/i), { target: { value: '2026-08-11' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time In 1 hour' }), { target: { value: '8' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time In 1 minute' }), { target: { value: '00' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time In 1 AM/PM' }), { target: { value: 'AM' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time Out 1 hour' }), { target: { value: '10' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time Out 1 minute' }), { target: { value: '00' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time Out 1 AM/PM' }), { target: { value: 'AM' } });
    const firstLateThreshold = within(form).getByLabelText(/late after minutes 1/i);
    await user.clear(firstLateThreshold);
    await user.type(firstLateThreshold, '30');
    await user.click(within(form).getByRole('button', { name: /add attendance window/i }));
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time In 2 hour' }), { target: { value: '1' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time In 2 minute' }), { target: { value: '00' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time In 2 AM/PM' }), { target: { value: 'PM' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time Out 2 hour' }), { target: { value: '4' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time Out 2 minute' }), { target: { value: '00' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Time Out 2 AM/PM' }), { target: { value: 'PM' } });
    await user.click(screen.getByRole('button', { name: 'Next: Attendees' }));
    const recipientPicker = within(form).getByRole('group', { name: /choose recipient unit/i });
    await user.click(within(recipientPicker).getAllByRole('button')[0]);
    await user.click(screen.getByRole('option', { name: 'RMC Campus' }));
    await user.click(within(recipientPicker).getAllByRole('button')[1]);
    await user.click(screen.getByRole('option', { name: 'College' }));
    await user.click(within(form).getByRole('button', { name: /^add recipient$/i }));
    await user.click(within(form).getByRole('button', { name: /^recipient type/i }));
    await user.click(screen.getByRole('option', { name: 'All Mayors' }));
    await user.click(within(form).getByRole('button', { name: /^add recipient$/i }));
    const addedRecipients = within(form).getByRole('status', { name: /added event recipients/i });
    expect(addedRecipients).toHaveTextContent('RMC Campus / College');
    expect(addedRecipients).toHaveTextContent('All Mayors');
    expect(addedRecipients).toHaveTextContent('2 recipients added');
    await user.click(screen.getByRole('button', { name: 'Next: Rules & Location' }));
    await user.click(within(form).getByRole('switch', { name: /enable geofencing/i }));
    expect(within(form).getByRole('region', { name: /event geofence map/i })).toBeInTheDocument();
    const radius = within(form).getByRole('spinbutton', { name: /geofence radius/i });
    await user.clear(radius);
    await user.type(radius, '275');
    const lateSanction = within(form).getByRole('spinbutton', { name: /late sanction value/i });
    await user.clear(lateSanction);
    await user.type(lateSanction, '30');
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    const scheduleButton = within(form).getByRole('button', { name: /submit for ossa approval/i });
    expect(scheduleButton).toBeEnabled();
    await user.click(scheduleButton);

    expect(staffState.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      title: 'College General Assembly',
      description: 'Required institutional assembly.',
      status: 'upcoming',
      created_by: 'staff-1',
      startDate: '2026-08-10',
      endDate: '2026-08-11',
      startTime: new Date('2026-08-10T08:00:00+08:00').getTime(),
      endTime: new Date('2026-08-11T16:00:00+08:00').getTime(),
      penaltyValue: 1,
      penaltyUnit: 'hours',
      participantsType: 'specific',
      targetValue: 'RMC Campus / College, All Mayors',
      recipientGroups: ['RMC Campus / College', 'All Mayors'],
      audienceTarget: { mode: 'group_list', groups: ['node:department-college', 'All Mayors'], snapshotLabel: 'RMC Campus / College, All Mayors' },
      target: { all: false },
      geofenceEnabled: true,
      location: { lat: 7.0736, lng: 125.6126, radius_meters: 275 },
      attendanceWindows: [
        { id: expect.any(String), label: 'Window 1', timeIn: '08:00', timeOut: '10:00', lateAfterMinutes: 30 },
        { id: expect.any(String), label: 'Window 2', timeIn: '13:00', timeOut: '16:00', lateAfterMinutes: 15 },
      ],
      sanctionRules: { late: { value: 30, unit: 'minutes' }, absent: { value: 1, unit: 'hours' } },
    }));
  });

  it('rejects overlapping windows and schedules out-of-order windows chronologically', async () => {
    const user = userEvent.setup();
    useStaff();
    seedCollegeDirectory();
    renderRoute(<SSGCreateEvent />);
    fireEvent.change(screen.getByLabelText(/event title/i), { target: { value: 'Two sessions' } });
    fireEvent.change(screen.getByLabelText(/event details/i), { target: { value: 'Morning and afternoon' } });
    await user.click(screen.getByRole('button', { name: 'Next: Schedule' }));
    fireEvent.change(screen.getByLabelText(/^start date$/i), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText(/^end date$/i), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time In 1 hour' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time In 1 minute' }), { target: { value: '00' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time In 1 AM/PM' }), { target: { value: 'PM' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time Out 1 hour' }), { target: { value: '4' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time Out 1 minute' }), { target: { value: '00' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time Out 1 AM/PM' }), { target: { value: 'PM' } });
    await user.click(screen.getByRole('button', { name: /add attendance window/i }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Time In 2 hour' }), { target: { value: '8' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time In 2 minute' }), { target: { value: '00' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time In 2 AM/PM' }), { target: { value: 'AM' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time Out 2 hour' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time Out 2 minute' }), { target: { value: '00' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time Out 2 AM/PM' }), { target: { value: 'PM' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Attendance windows must not overlap.');
    expect(screen.queryByRole('button', { name: /submit for ossa approval/i })).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form'));
    expect(staffState.createEvent).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('combobox', { name: 'Time Out 2 hour' }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time Out 2 minute' }), { target: { value: '00' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Time Out 2 AM/PM' }), { target: { value: 'AM' } });
    await user.click(screen.getByRole('button', { name: 'Next: Attendees' }));
    await user.click(screen.getByRole('button', { name: 'Next: Rules & Location' }));
    await user.click(screen.getByRole('button', { name: 'Next: Review' }));
    await user.click(screen.getByRole('button', { name: /submit for ossa approval/i }));
    expect(staffState.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      startTime: new Date('2026-10-01T08:00:00+08:00').getTime(),
      endTime: new Date('2026-10-01T16:00:00+08:00').getTime(),
      attendanceWindows: [expect.objectContaining({ timeIn: '08:00', timeOut: '10:00' }), expect.objectContaining({ timeIn: '13:00', timeOut: '16:00' })],
    }));
  });

  it('keeps schedule actions compact and lets the user cancel event creation', async () => {
    const user = userEvent.setup();
    useStaff();
    render(
      <ThemeProvider><MemoryRouter initialEntries={['/ssg/events/create']}><Routes>
        <Route path="/ssg/events/create" element={<SSGCreateEvent />} />
        <Route path="/ssg/events" element={<p>Events registry destination</p>} />
      </Routes></MemoryRouter></ThemeProvider>,
    );

    const actions = screen.getByRole('group', { name: /event form actions/i });
    expect(within(actions).getByRole('button', { name: /next: schedule/i })).toHaveClass('sm:w-auto');
    await user.click(within(actions).getByRole('button', { name: /^cancel$/i }));

    expect(screen.getByText('Events registry destination')).toBeInTheDocument();
    expect(staffState.createEvent).not.toHaveBeenCalled();
  });

  it('executes the preserved applicant approval action from the rendered SSG panel', async () => {
    const user = userEvent.setup();
    useStaff();
    seedStaffDirectory();
    staffState.applications = [{
      id: 'application-1',
      status: 'pending',
      submission_date: Date.now(),
      rejection_count: 0,
      form_data: { ...studentProfile, name: 'Pending Applicant' },
    }];
    renderRoute(<SSGPanel />);

    expect(screen.queryByRole('button', { name: /^applicants$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /RMC Campus/i }));
    await user.click(screen.getByRole('button', { name: /Senior High School/i }));
    await user.click(screen.getByRole('button', { name: /Newton/i }));
    await user.click(screen.getByRole('button', { name: /^verify$/i }));
    expect(staffState.approveApplication).toHaveBeenCalledWith('application-1', 'student');
  });

  it('does not duplicate event navigation in the SSG control hub', () => {
    useStaff();
    seedStaffDirectory();
    renderRoute(<SSGPanel />);

    expect(screen.queryByRole('button', { name: /^events$/i })).not.toBeInTheDocument();
    expect(screen.getByText('Attendance events')).toBeInTheDocument();
  });

  it('renders an OSSA-specific home and control panel', () => {
    useOSSA();
    renderRoute(<Dashboard />);

    expect(screen.getByText(/ossa workspace/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open ossa control panel/i })).toBeInTheDocument();

    cleanup();
    renderRoute(<SSGPanel />);

    expect(screen.getByRole('heading', { name: /ossa control panel/i })).toBeInTheDocument();
    expect(screen.getByText('Assigned scope only')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText(/ssg administration/i)).not.toBeInTheDocument();
  });

  it('renders equivalent attendance records and operable report and date-range dialogs', async () => {
    const user = userEvent.setup();
    useStaff();
    staffState.students = [{ ...studentProfile, name: 'Student 1', student_id: 'ID-1000' }];
    staffState.events = [
      { id: 'event-1', title: 'Institutional Assembly' },
      { id: 'event-2', title: 'Campus Safety Drill' },
    ];
    renderRoute(<AttendanceDashboard />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /attendance dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /attendance filters/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /event scope.*all events/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /education level.*all levels/i })).toBeInTheDocument();

    const eventScope = screen.getByRole('button', { name: /event scope.*all events/i });
    await user.click(eventScope);
    const eventOptions = screen.getByRole('listbox', { name: /event scope options/i });
    await user.click(within(eventOptions).getByRole('option', { name: /select all/i }));
    expect(eventScope).toHaveAccessibleName(/event scope.*all selected/i);
    expect(within(eventOptions).getByRole('option', { name: /institutional assembly/i })).toHaveAttribute('aria-selected', 'true');
    expect(within(eventOptions).getByRole('option', { name: /campus safety drill/i })).toHaveAttribute('aria-selected', 'true');

    await user.click(within(eventOptions).getByRole('option', { name: /select all/i }));
    expect(eventScope).toHaveAccessibleName(/event scope.*all events/i);
    expect(within(eventOptions).getByRole('option', { name: /institutional assembly/i })).toHaveAttribute('aria-selected', 'false');
    expect(within(eventOptions).getByRole('option', { name: /campus safety drill/i })).toHaveAttribute('aria-selected', 'false');

    const chart = screen.getByRole('region', { name: /attendance visualization/i });
    expect(chart).toHaveClass('h-64', 'sm:h-72');
    const ledger = screen.getByRole('table', { name: /attendance records/i });
    const mobileRecord = screen.getAllByRole('article', { name: /student 1 attendance record/i })[0];
    expect(mobileRecord).toHaveClass('mobile-data-card');
    expect(within(ledger).getAllByText('ID-1000')[0]).toBeInTheDocument();
    expect(within(mobileRecord).getByText('ID-1000')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /export report/i }));
    const exportDialog = screen.getByRole('dialog', { name: /download attendance report/i });
    expect(within(exportDialog).getByRole('combobox', { name: /group data by/i })).toBeInTheDocument();
    expect(within(exportDialog).getByRole('checkbox', { name: /include visualizations/i })).toBeChecked();
    expect(within(exportDialog).getByRole('button', { name: /generate pdf report/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /export configuration/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /time period.*all time/i }));
    await user.click(screen.getByRole('option', { name: /custom range/i }));
    const dateDialog = screen.getByRole('dialog', { name: /select date range/i });
    fireEvent.change(within(dateDialog).getByLabelText(/start date/i), { target: { value: '2026-08-01' } });
    fireEvent.change(within(dateDialog).getByLabelText(/end date/i), { target: { value: '2026-08-08' } });
    await user.click(within(dateDialog).getByRole('button', { name: /apply range/i }));
    expect(screen.queryByRole('dialog', { name: /select date range/i })).not.toBeInTheDocument();
  });

  it('keeps OSSA analytics, filters, dense records, and sanction actions accessible', async () => {
    const user = userEvent.setup();
    useOSSA();
    seedStaffDirectory();
    renderRoute(<OSSADashboard section="sanctions" />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /student sanctions & analytics/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /sanction status chart/i })).toHaveClass('h-64', 'sm:h-72');
    expect(screen.getByRole('region', { name: /department sanction hours chart/i })).toHaveClass('h-64', 'sm:h-72');
    expect(screen.getByRole('searchbox', { name: /search student sanctions/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /filter by department/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^all \(/i })).toHaveAttribute('aria-pressed', 'true');

    const roster = screen.getByRole('table', { name: /student sanction roster/i });
    const mobileRecord = screen.getByRole('article', { name: /juan dela cruz/i });
    expect(mobileRecord).toHaveClass('mobile-data-card');
    expect(within(roster).getByText(studentProfile.student_id)).toBeInTheDocument();
    expect(within(mobileRecord).getByText(studentProfile.student_id)).toBeInTheDocument();
    expect(within(mobileRecord).getByText(/senior high school/i)).toHaveClass('[overflow-wrap:anywhere]');

    await user.click(screen.getAllByRole('button', { name: /manage juan dela cruz/i })[0]);
    const recordDialog = screen.getByRole('dialog', { name: /student full record.*juan dela cruz/i });
    await user.click(within(recordDialog).getByRole('button', { name: /add penalty/i }));
    const hours = within(recordDialog).getByRole('spinbutton', { name: /hours to add/i });
    await user.clear(hours);
    await user.type(hours, '3');
    await user.type(within(recordDialog).getByRole('textbox', { name: /official reason.*ossa note/i }), 'Unexcused institutional absence');
    await user.click(within(recordDialog).getByRole('button', { name: /confirm adjustment/i }));
    expect(staffState.adjustSanctionHours).toHaveBeenCalledWith(
      'student-1',
      3,
      'Unexcused institutional absence',
    );
    await user.click(within(recordDialog).getByRole('button', { name: /close full record/i }));

    await user.click(screen.getByRole('button', { name: /cleared \(0\)/i }));
    expect(screen.getByText(/no matching student records found/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^all \(1\)/i }));
    await user.type(screen.getByRole('searchbox', { name: /search student sanctions/i }), 'missing student');
    expect(screen.getByText(/no matching student records found/i)).toBeInTheDocument();
  });

  it('reviews an OSSA excuse through the standardized dialog without changing the mutation payload', async () => {
    const user = userEvent.setup();
    useOSSA();
    staffState.excuses = [{
      id: 'excuse-1',
      student_uid: 'student-1',
      student_name: 'Juan Dela Cruz',
      student_id: studentProfile.student_id,
      department: 'Senior High School',
      section: 'Newton',
      event_title: 'Institutional Assembly',
      category: 'medical',
      reason: 'Documented illness',
      submission_date: Date.now(),
      status: 'pending',
    }];
    renderRoute(<OSSADashboard section="excuses" />);


    await user.click(screen.getByRole('button', { name: /institutional assembly.*juan dela cruz/i }));
    const dialog = screen.getByRole('dialog', { name: /^excuse application$/i });
    const waiveHours = within(dialog).getByRole('spinbutton', { name: /sanction hours to waive/i });
    await user.clear(waiveHours);
    await user.type(waiveHours, '4');
    await user.type(within(dialog).getByRole('textbox', { name: /decision notes/i }), 'Medical certificate verified.');
    await user.click(within(dialog).getByRole('button', { name: /approve/i }));

    expect(staffState.reviewExcuseApplication).toHaveBeenCalledWith(
      'excuse-1',
      'approved',
      'Medical certificate verified.',
      4,
    );
    expect(screen.queryByRole('dialog', { name: /^excuse application$/i })).not.toBeInTheDocument();
  });

  it('filters OSSA excuses by category and status and distinguishes decisions in the review dialog', async () => {
    const user = userEvent.setup();
    useOSSA();
    staffState.excuses = [
      {
        id: 'medical-pending', student_uid: 'student-1', student_name: 'Medical Pending',
        student_id: '2026-00001A', department: 'SHS', section: 'Newton', event_title: 'Assembly',
        category: 'medical', reason: 'Illness', submission_date: Date.now(), status: 'pending',
      },
      {
        id: 'personal-approved', student_uid: 'student-2', student_name: 'Personal Approved',
        student_id: '2026-00002A', department: 'SHS', section: 'Newton', event_title: 'Assembly',
        category: 'personal', reason: 'Family matter', submission_date: Date.now(), status: 'approved',
      },
      {
        id: 'emergency-rejected', student_uid: 'student-3', student_name: 'Emergency Rejected',
        student_id: '2026-00003A', department: 'SHS', section: 'Newton', event_title: 'Assembly',
        category: 'emergency', reason: 'Emergency', submission_date: Date.now(), status: 'rejected',
      },
      {
        id: 'institutional-approved', student_uid: 'student-4', student_name: 'Institutional Approved',
        student_id: '2026-00004A', department: 'SHS', section: 'Newton', event_title: 'Assembly',
        category: 'institutional', reason: 'Official duty', submission_date: Date.now(), status: 'approved',
      },
    ];
    renderRoute(<OSSADashboard section="excuses" />);



    expect(screen.getByRole('button', { name: /medical pending/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /personal approved/i })).not.toBeInTheDocument();
    changeField('Request status', 'all');
    expect(screen.getAllByRole('button', { name: /assembly.*(medical pending|personal approved|emergency rejected|institutional approved)/i })).toHaveLength(4);
    changeField('Request type', 'medical');
    expect(screen.queryByRole('button', { name: /personal approved/i })).not.toBeInTheDocument();
    changeField('Request type', 'all');
    for (const [name, category, status, colors] of [
      ['Medical Pending', 'medical', 'Pending', ['bg-amber-100', 'text-amber-800', 'dark:bg-amber-950', 'dark:text-amber-300']],
      ['Personal Approved', 'personal', 'Approved', ['bg-emerald-100', 'text-emerald-700', 'dark:bg-emerald-950', 'dark:text-emerald-300']],
      ['Emergency Rejected', 'emergency', 'Rejected', ['bg-red-100', 'text-red-700', 'dark:bg-red-950', 'dark:text-red-300']],
      ['Institutional Approved', 'institutional', 'Approved', ['bg-emerald-100', 'text-emerald-700', 'dark:bg-emerald-950', 'dark:text-emerald-300']],
    ] as const) {
      await user.click(screen.getByRole('button', { name: new RegExp(name, 'i') }));
      const dialog = screen.getByRole('dialog', { name: 'Excuse application' });
      expect(within(dialog).getByText(category + ' excuse')).toBeInTheDocument();
      expect(within(dialog).getByText(status)).toHaveClass(...colors);
      if (status !== 'Pending') expect(within(dialog).queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    }
  });


  it('uses named SSG dialogs, mobile registry cards, and protected confirmation for sanction changes', async () => {
    const user = userEvent.setup();
    useStaff();
    setMockDataRef({
      getCoreRoles: () => ({ ...DEFAULT_CORE_ROLES, ssg: { ...DEFAULT_CORE_ROLES.ssg,
        permissions: [...DEFAULT_CORE_ROLES.ssg.permissions, 'directory.manage_student_sanctions'] } }),
      getCustomRoles: () => ({}),
    });
    seedStaffDirectory();
    renderRoute(<SSGPanel />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /rmc campus/i }));
    await user.click(screen.getByRole('button', { name: /senior high school/i }));
    await user.click(screen.getByRole('button', { name: /^newton/i }));
    expect(screen.getByRole('table', { name: /newton personnel registry/i })).toBeInTheDocument();
    const studentCard = screen.getByRole('article', { name: /juan dela cruz/i });
    expect(within(studentCard).getByText(/long-address/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /manage juan dela cruz/i })[0]);

    const memberDialog = screen.getByRole('dialog', { name: /member details.*juan dela cruz/i });
    expect(memberDialog).toBeInTheDocument();
    expect(within(memberDialog).getByText(/long-address/i)).toHaveClass('[overflow-wrap:anywhere]');
    await user.click(screen.getByRole('button', { name: /add one sanction hour/i }));
    expect(screen.getByRole('dialog', { name: /confirm sanction change/i })).toBeInTheDocument();
    await user.click(screen.getAllByTestId('modal-backdrop').at(-1)!);
    expect(screen.getByRole('dialog', { name: /confirm sanction change/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm add hour/i }));
    expect(staffState.adjustSanctionHours).toHaveBeenCalledWith(
      'student-1',
      1,
      'Administrative Adjustment: SSG President',
    );
    await user.click(within(memberDialog).getByRole('button', { name: /^mayor$/i }));
    expect(staffState.assignSectionMayor).toHaveBeenCalledWith('student-1', 'section-newton', 'Newton');
  });

  it('returns a Mayor to Regular using designation access and the current class', async () => {
    const user = userEvent.setup();
    useStaff();
    seedStaffDirectory();
    staffState.students[0].role = 'mayor';
    setMockDataRef({ getCoreRoles: () => ({ ...DEFAULT_CORE_ROLES,
      ssg: { ...DEFAULT_CORE_ROLES.ssg, permissions: ['attendance.scan', 'directory.change_member_designation'] } }),
      getCustomRoles: () => ({}) });
    renderRoute(<SSGPanel />);
    await user.click(screen.getByRole('button', { name: /rmc campus/i }));
    await user.click(screen.getByRole('button', { name: /senior high school/i }));
    await user.click(screen.getByRole('button', { name: /^newton/i }));
    await user.click(screen.getAllByRole('button', { name: /manage juan dela cruz/i })[0]);
    await user.click(within(screen.getByRole('dialog', { name: /member details/i })).getByRole('button', { name: /^regular$/i }));
    await waitFor(() => expect(staffState.assignRole).toHaveBeenCalledWith('student-1', 'student', 'section-newton'));
    expect(staffState.assignSectionMayor).not.toHaveBeenCalled();
  });

  it.each(['ssg', 'mayor', 'ossa_staff'])('keeps member sanctions and designations separate for default %s', async role => {
    const user = userEvent.setup();
    useStaff();
    routeState.auth.profile = { ...routeState.auth.profile!, role };
    seedStaffDirectory();
    renderRoute(<SSGPanel />);
    await user.click(screen.getByRole('button', { name: /rmc campus/i }));
    await user.click(screen.getByRole('button', { name: /senior high school/i }));
    await user.click(screen.getByRole('button', { name: /^newton/i }));
    await user.click(screen.getAllByRole('button', { name: /manage juan dela cruz/i })[0]);
    const dialog = screen.getByRole('dialog', { name: /member details/i });
    if (role === 'ossa_staff') {
      expect(within(dialog).getByRole('button', { name: /add one sanction hour/i })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /clear one sanction hour/i })).toBeEnabled();
    } else {
      expect(within(dialog).queryByRole('button', { name: /add one sanction hour/i })).not.toBeInTheDocument();
    }
    if (role === 'ssg') expect(within(dialog).getByRole('button', { name: /^mayor$/i })).toBeInTheDocument();
    else expect(within(dialog).queryByRole('button', { name: /^mayor$/i })).not.toBeInTheDocument();
    expect(staffState.adjustSanctionHours).not.toHaveBeenCalled();
  });
});
