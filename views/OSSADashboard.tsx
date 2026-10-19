import RecordPagination from '../components/ui/RecordPagination';
import PaymentNotices from '../components/OSSA/PaymentNotices';
import DetailFields from '../components/ui/DetailFields';
import { usePagination } from '../components/usePagination';
import { usePageMemory } from '../components/usePageMemory';
import { formatManilaDateTime } from '../lib/dateTime';
import ActivityApprovalQueue from '../components/events/ActivityApprovalQueue';
import OrganizationApprovalQueue from '../components/events/OrganizationApprovalQueue';
import ExcuseApprovalQueue from '../components/events/ExcuseApprovalQueue';
import AttendanceCorrections from '../components/attendance/AttendanceCorrections';
import ClearanceCertificates from '../components/attendance/ClearanceCertificates';
import { loadAttendanceCorrections } from '../lib/attendanceCorrections';
import ProfileRequests from '../components/members/ProfileRequests';
import ProfileAvatar from '../components/ui/ProfileAvatar';
import { downloadCsv } from '../lib/export';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ossaSections, ossaSectionPath, type OSSASection } from '../lib/ossaHub';
import { CheckCircle2, ChevronRight, Clock, Download, FileCheck2, MinusCircle, PlusCircle, RotateCcw, School, ShieldAlert, ShieldCheck, Users, X, ArrowLeft, ArrowUpRight, Building2, CalendarCheck, PencilLine } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { appData, refreshData } from '../lib/backend';
import { toast } from '../lib/toast';
import { ExcuseApplication, UserProfile, UserStats } from '../types';

import Button from '../components/ui/Button';
import { MetricCard, Page, PageHeader, Surface } from '../components/ui/Page';
import { Modal } from '../components/ui/Modal';
import CustomSelect from '../components/ui/CustomSelect';
import SearchInput from '../components/ui/SearchInput';
import { useAuth } from '../components/AuthContext';
import { hasPermission } from '../lib/accessControl';
import { loadProfileRequests } from '../lib/profileRequests';

interface StudentWithStats extends UserProfile {
  stats: UserStats;
  sanction_logs?: any[];
}

const OSSADashboard: React.FC<{ section?: OSSASection }> = ({ section = 'overview' }) => {
  const { profile } = useAuth();

  const canManageSanctions = hasPermission(profile?.role, 'directory.manage_student_sanctions', appData.getCustomRoles(), appData.getCoreRoles());
  const [students, setStudents] = useState<StudentWithStats[]>([]);
  const [excuseApps, setExcuseApps] = useState<ExcuseApplication[]>([]);
  const [searchQuery, setSearchQuery] = usePageMemory('searchQuery', '');
  const [deptFilter, setDeptFilter] = usePageMemory('deptFilter', 'all');
  const [sanctionFilter, setSanctionFilter] = usePageMemory<'all' | 'has_sanctions' | 'cleared'>('sanctionFilter', 'all');
  const [selectedStudent, setSelectedStudent] = useState<StudentWithStats | null>(null);
  const [studentDetails, setStudentDetails] = useState<any>(null);
  const [adjustMode, setAdjustMode] = useState<'deduct' | 'add' | 'clear' | null>(null);
  const [adjustHours, setAdjustHours] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingInformationCount, setPendingInformationCount] = useState<number | null>(null);
  const [pendingCorrectionCount, setPendingCorrectionCount] = useState<number | null>(null);
  const [pendingActivityCount, setPendingActivityCount] = useState(0);
  const [pendingOrganizationCount, setPendingOrganizationCount] = useState(0);
  const canReviewInformation = hasPermission(profile?.role, 'ossa.manage_cases');

  useEffect(() => {
    setPendingInformationCount(null);
    setPendingCorrectionCount(null);
    if (section !== 'overview' || !profile || !canReviewInformation || refreshing) return;
    let active = true;
    let latestRequest = 0;
    const load = async () => {
      const request = ++latestRequest;
      try {
        const [requests, corrections] = await Promise.allSettled([loadProfileRequests(), loadAttendanceCorrections()]);
        if (active && request === latestRequest) {
          setPendingInformationCount(requests.status === 'fulfilled' ? requests.value.filter(row => row.status === 'pending').length : null);
          setPendingCorrectionCount(corrections.status === 'fulfilled' ? corrections.value.filter(row => row.status === 'pending').length : null);
          if (requests.status === 'rejected') toast.error(requests.reason);
          if (corrections.status === 'rejected') toast.error(corrections.reason);
        }
      } catch (error) {
        if (active && request === latestRequest) { setPendingInformationCount(null); toast.error(error); }
      }
    };
    void load();
    window.addEventListener('rmc_data_update', load);
    const timer = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('rmc_data_update', load); };
  }, [section, profile?.uid, canReviewInformation, refreshing]);

  useEffect(() => {
    setSelectedStudent(null); setStudentDetails(null); setAdjustMode(null);
  }, [section]);

  const loadData = () => {
    setStudents((profile && typeof appData.getVisibleStudents === 'function' ? appData.getVisibleStudents(profile.uid) : appData.getAllStudents()) as StudentWithStats[]);
    setExcuseApps(profile && typeof appData.getVisibleExcuseApplications === 'function' ? appData.getVisibleExcuseApplications(profile.uid) : appData.getExcuseApplications());
    if (section === 'overview' && profile) {
      const events = typeof appData.getVisibleEvents === 'function' ? appData.getVisibleEvents(profile.uid) : appData.getEvents();
      setPendingActivityCount(events.filter(event => event.requiresOssaApproval && !event.cancellationStatus && event.status !== 'done' && (event.approvalStatus || 'pending') === 'pending').length);
      const organizations = appData.getOrganizations().filter(org => org.can_review || org.can_manage || profile.role === 'admin');
      const organizationIds = new Set(organizations.map(org => org.id));
      setPendingOrganizationCount(
        appData.getEvents().filter(event => organizationIds.has(event.organizationId) && !event.cancellationStatus && event.approvalStatus === 'pending').length
        + appData.getOrganizationSanctions().filter(request => organizationIds.has(request.organization_id) && request.status === 'pending').length,
      );
    }

    if (selectedStudent) {
      const updatedDetail = appData.getUserDetail(selectedStudent.uid);
      setStudentDetails(updatedDetail);
      if (updatedDetail) setSelectedStudent((current) => current ? { ...current, stats: updatedDetail.stats } : null);
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener('rmc_data_update', loadData);
    return () => window.removeEventListener('rmc_data_update', loadData);
  }, [profile?.uid, selectedStudent?.uid, section]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshData(); loadData(); }
    catch (error) { toast.error(error); }
    finally { setRefreshing(false); }
  };

  const totalStudents = students.length;
  const studentsWithSanctions = students.filter((student) => (student.stats?.sanction_hours || 0) > 0);
  const clearedStudents = students.filter((student) => (student.stats?.sanction_hours || 0) === 0);
  const totalSanctionHours = students.reduce((total, student) => total + (student.stats?.sanction_hours || 0), 0);
  const pendingExcuseCount = excuseApps.filter((application) => application.status === 'pending').length;
  const workspaceCounts = {
    clearance: 0,
    activities: pendingActivityCount,
    requests: pendingInformationCount,
    excuses: pendingExcuseCount,
    corrections: pendingCorrectionCount,
    sanctions: studentsWithSanctions.length,
    organizations: pendingOrganizationCount,
  };
  const departments = Array.from(new Set(students.map((student) => student.school_data?.department).filter(Boolean) as string[]));

  const filteredStudents = students.filter((student) => {
    const normalizedQuery = searchQuery.toLowerCase();
    const matchesSearch = [
      student.name,
      student.student_id,
      student.school_data?.section,
      student.email,
    ].some((value) => (value || '').toLowerCase().includes(normalizedQuery));
    const department = student.school_data?.department || '';
    const matchesDepartment = deptFilter === 'all' || department === deptFilter;
    const hours = student.stats?.sanction_hours || 0;
    const matchesSanction = sanctionFilter === 'all'
      || (sanctionFilter === 'has_sanctions' && hours > 0)
      || (sanctionFilter === 'cleared' && hours === 0);
    return matchesSearch && matchesDepartment && matchesSanction;
  });

  const rosterPage = usePagination(filteredStudents.sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid)), JSON.stringify([profile?.uid, searchQuery, deptFilter, sanctionFilter]));
  const history = [...(studentDetails?.sanction_logs || [])].sort((a, b) => Number(b.timestamp) - Number(a.timestamp) || String(b.id || '').localeCompare(String(a.id || '')));
  const historyPage = usePagination(history, selectedStudent?.uid || '', 5);

  const sanctionStatusData = [
    { name: 'With Sanctions', value: studentsWithSanctions.length, color: '#dc2626' },
    { name: 'Cleared', value: clearedStudents.length, color: '#059669' },
  ];

  const departmentSanctionData = Array.from(
    students.reduce((totals, student) => {
      const department = student.school_data?.department || 'Unassigned';
      totals.set(department, (totals.get(department) || 0) + (student.stats?.sanction_hours || 0));
      return totals;
    }, new Map<string, number>()),
    ([department, hours]) => ({ department, hours }),
  );

  const openStudentModal = (student: StudentWithStats) => {
    setSelectedStudent(student);
    setStudentDetails(appData.getUserDetail(student.uid));
    setAdjustMode(null);
    setAdjustReason('');
    setAdjustHours(1);
    setAdjustSuccess(null);
  };

  const handleSanctionSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStudent || !adjustMode) return;

    if (adjustMode === 'clear') {
      const note = adjustReason || 'Fully cleared and resolved by OSSA Director.';
      await appData.resolveStudentSanctions(selectedStudent.uid, note);
      setAdjustSuccess('Sanctions successfully cleared!');
    } else if (adjustMode === 'deduct') {
      if (adjustHours <= 0) return;
      const reason = adjustReason || 'Sanction hours deducted for completed service.';
      await appData.adjustSanctionHours(selectedStudent.uid, -adjustHours, reason);
      setAdjustSuccess(`Deducted ${adjustHours} sanction hours.`);
    } else {
      if (adjustHours <= 0) return;
      const reason = adjustReason || 'Additional sanction hours issued by OSSA.';
      await appData.adjustSanctionHours(selectedStudent.uid, adjustHours, reason);
      setAdjustSuccess(`Added ${adjustHours} sanction hours.`);
    }

    loadData();
    setAdjustMode(null);
    setAdjustReason('');
    setTimeout(() => setAdjustSuccess(null), 3500);
  };

  const availableSections = ossaSections.filter(item => hasPermission(profile?.role, item.permission)
    && (item.id !== 'clearance' || profile?.role === 'ossa' || profile?.role === 'ossa_staff'));
  const currentSection = ossaSections.find(item => item.id === section);
  const sectionIcons = { clearance: ShieldCheck, activities: CalendarCheck, requests: PencilLine, sanctions: ShieldAlert, excuses: FileCheck2, corrections: PencilLine, organizations: Building2 };
  const sectionTones = {
    clearance: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    activities: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    requests: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    sanctions: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    excuses: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    corrections: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
    organizations: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  };

  return (
    <Page className="max-w-7xl animate-in fade-in duration-base">
      <Surface className="dark relative overflow-hidden border-gold-400/30 bg-gradient-to-r from-brand-950 via-brand-900 to-brand-950 p-5 shadow-xl sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-10 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl" />
        <PageHeader
          actions={(
            <>
              <Button aria-label="Refresh records" className="border-white/20 bg-white/10 text-white hover:bg-white/20 sm:w-auto" onClick={handleRefresh} loading={refreshing} disabled={refreshing} size="sm" variant="secondary"><RotateCcw size={14} /> Refresh</Button>
              {section === 'sanctions' && <Button aria-label="Export roster CSV" className="sm:w-auto" onClick={() => downloadCsv('sanction-roster.csv', [['Student ID', 'Name', 'Section', 'Sanction hours'], ...students.map(s => [s.student_id, s.name, s.school_data.section, s.stats?.sanction_hours || 0])])} size="sm" variant="gold"><Download size={14} /> Export</Button>}
            </>
          )}
          className="relative z-10 flex-col sm:flex-row"
          description={currentSection?.description || 'Choose a workspace to review requests, manage student cases, or view reports.'}
          eyebrow={<span className="inline-flex items-center gap-1"><ShieldCheck size={12} /> Office of the Students Services and Affairs{pendingExcuseCount > 0 ? ` · ${pendingExcuseCount} Pending Excuses` : ''}</span>}
          title={currentSection?.title || 'OSSA Hub'}
        />
      </Surface>

      {section !== 'overview' && <nav aria-label="OSSA Hub pages"><Link to={ossaSectionPath('overview')} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-brand-800 hover:bg-brand-50 dark:text-gold-300 dark:hover:bg-slate-800"><ArrowLeft size={16} /> OSSA Hub</Link></nav>}

      {section === 'overview' && <PaymentNotices />}
      {section === 'overview' && <nav aria-label="OSSA workspaces" className="space-y-6">
        {[
          { title: 'Review & approvals', description: 'Decide on submitted requests and supporting documents.', ids: ['activities', 'requests', 'excuses', 'corrections'] },
          { title: 'Records & oversight', description: 'Manage student cases, reports, and organization requests.', ids: ['sanctions', 'clearance', 'organizations'] },
        ].map(group => { const items = availableSections.filter(item => group.ids.includes(item.id)); if (!items.length) return null; return <section key={group.title} className="space-y-3">
          <div><h2 className="text-base font-bold text-brand-900 dark:text-white">{group.title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{group.description}</p></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => { const Icon = sectionIcons[item.id]; return <Link key={item.id} to={ossaSectionPath(item.id)} className="group flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-gold-500 hover:shadow-md motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500 dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-4 flex items-center justify-between gap-3"><span className={`relative flex h-11 w-11 items-center justify-center rounded-xl ${sectionTones[item.id]}`}><Icon size={22} />
            {(workspaceCounts[item.id] ?? 0) > 0 && <span aria-label={`${workspaceCounts[item.id]} ${item.id === 'sanctions' ? 'students with active sanctions' : 'pending requests'}`} className="absolute -right-2 -top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white ring-2 ring-white dark:ring-slate-800">{workspaceCounts[item.id]}</span>}
          </span><ArrowUpRight size={18} className="text-slate-300 transition group-hover:text-gold-600 dark:text-slate-600" /></div>
          <h3 className="text-lg font-bold text-brand-900 dark:text-white">{item.title}</h3>
          <p className="mt-2 flex-1 text-sm text-slate-500 dark:text-slate-300">{item.description}</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-brand-800 dark:text-gold-400">Open workspace <ChevronRight size={16} /></span>
        </Link>; })}</div></section>; })}
      </nav>}

      {section === 'overview' && hasPermission(profile?.role, 'ossa.manage_cases') && <div aria-label="OSSA summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard detail="Registered in portal" icon={<Users size={20} />} label="Total Enrolled" value={totalStudents} />
        <MetricCard detail={`${totalStudents > 0 ? Math.round((studentsWithSanctions.length / totalStudents) * 100) : 0}% of students`} icon={<ShieldAlert size={20} />} label="With Sanctions" value={studentsWithSanctions.length} />
        <MetricCard detail="No active penalty" icon={<CheckCircle2 size={20} />} label="Cleared Status" value={clearedStudents.length} />
        <MetricCard detail="Within assigned scope" icon={<Clock size={20} />} label="Penalty Hours" value={totalSanctionHours} />
        <MetricCard detail="Medical / absence letters" icon={<FileCheck2 size={20} />} label="Excuse Applications" value={pendingExcuseCount} />
      </div>}

      {section === 'sanctions' && <div aria-label="Sanction statistics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard detail="Within assigned scope" icon={<Users size={20} />} label="Total students" value={totalStudents} />
        <MetricCard detail={`${totalStudents > 0 ? Math.round((studentsWithSanctions.length / totalStudents) * 100) : 0}% of students`} icon={<ShieldAlert size={20} />} label="With sanctions" value={studentsWithSanctions.length} />
        <MetricCard detail="No outstanding hours" icon={<CheckCircle2 size={20} />} label="Cleared students" value={clearedStudents.length} />
        <MetricCard detail="Outstanding sanction balance" icon={<Clock size={20} />} label="Sanction hours" value={totalSanctionHours} />
      </div>}

      {section === 'activities' && <ActivityApprovalQueue />}
      {section === 'requests' && <ProfileRequests review />}
      {section === 'corrections' && <AttendanceCorrections review />}
      {section === 'clearance' && <ClearanceCertificates manage />}
      {section === 'organizations' && <OrganizationApprovalQueue />}
      {section === 'sanctions' && <Surface aria-labelledby="ossa-analytics-heading" className="p-4 sm:p-6">
        <h2 id="ossa-analytics-heading" className="text-lg font-bold text-brand-900 dark:text-white">Sanction Analytics</h2>
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Student Status</h3><div aria-label="Sanction status chart" className="h-64 min-h-64 min-w-0 w-full sm:h-72 sm:min-h-72" role="region"><ResponsiveContainer height="100%" initialDimension={{ width: 1, height: 256 }} minHeight={256} minWidth={0} width="100%"><PieChart><Pie data={sanctionStatusData} dataKey="value" innerRadius={50} outerRadius={88} paddingAngle={3}>{sanctionStatusData.map((entry) => <Cell fill={entry.color} key={entry.name} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
          <div className="min-w-0"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">Outstanding Hours by Department</h3><div aria-label="Department sanction hours chart" className="h-64 min-h-64 min-w-0 w-full sm:h-72 sm:min-h-72" role="region"><ResponsiveContainer height="100%" initialDimension={{ width: 1, height: 256 }} minHeight={256} minWidth={0} width="100%"><BarChart data={departmentSanctionData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="department" interval={0} tickFormatter={(label: string) => label.length > 16 ? `${label.slice(0, 16)}…` : label} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="hours" fill="#D4AF37" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        </div>
      </Surface>}

      {adjustSuccess ? <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" role="status"><span className="flex items-center gap-2"><CheckCircle2 size={18} />{adjustSuccess}</span><button aria-label="Dismiss sanction update" onClick={() => setAdjustSuccess(null)} type="button"><X size={14} /></button></div> : null}


      {section === 'sanctions' && (
        <div aria-label="Student sanctions" className="space-y-4" id="ossa-roster-panel">
          <Surface aria-labelledby="ossa-filters-heading" className="p-4">
            <h2 className="sr-only" id="ossa-filters-heading">Student sanction filters</h2>
            <div className="flex flex-wrap items-end gap-3">
              <SearchInput ariaLabel="Search student sanctions" className="min-w-[16rem] flex-1" label="Search students" onChange={setSearchQuery} placeholder="Search student name, ID, section..." value={searchQuery} />
              <div className="min-w-[14rem] flex-1"><CustomSelect ariaLabel="Filter by department" combobox label="Department" onChange={(value) => setDeptFilter(value as string)} options={[{ value: 'all', label: 'All Departments' }, ...departments.map((department) => ({ value: department, label: department }))]} searchable value={deptFilter} /></div>
              <div aria-label="Filter by sanction status" className="flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900" role="group">
                <button aria-pressed={sanctionFilter === 'all'} className={`rounded-lg px-3 py-2 text-xs font-bold ${sanctionFilter === 'all' ? 'bg-brand-900 text-white dark:bg-gold-400 dark:text-slate-950' : 'text-slate-600 dark:text-slate-300'}`} onClick={() => setSanctionFilter('all')} type="button">All ({students.length})</button>
                <button aria-label={`With sanctions, ${studentsWithSanctions.length}`} aria-pressed={sanctionFilter === 'has_sanctions'} className={`rounded-lg px-3 py-2 text-xs font-bold ${sanctionFilter === 'has_sanctions' ? 'bg-red-600 text-white' : 'text-red-600 dark:text-red-400'}`} onClick={() => setSanctionFilter('has_sanctions')} type="button">Active ({studentsWithSanctions.length})</button>
                <button aria-pressed={sanctionFilter === 'cleared'} className={`rounded-lg px-3 py-2 text-xs font-bold ${sanctionFilter === 'cleared' ? 'bg-emerald-600 text-white' : 'text-emerald-600 dark:text-emerald-400'}`} onClick={() => setSanctionFilter('cleared')} type="button">Cleared ({clearedStudents.length})</button>
              </div>
            </div>
          </Surface>

          <Surface aria-labelledby="ossa-roster-heading" className="overflow-hidden">
            <div className="border-b border-slate-200 p-4 dark:border-slate-700 sm:p-5"><h2 className="text-lg font-bold text-brand-900 dark:text-white" id="ossa-roster-heading">Student Sanction Roster</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{filteredStudents.length} matching student records</p></div>
            {filteredStudents.length === 0 ? <div className="p-8 text-center"><ShieldCheck className="mx-auto text-slate-300 dark:text-slate-600" size={36} /><h3 className="mt-3 text-sm font-bold uppercase text-slate-700 dark:text-slate-200">No Matching Student Records Found</h3><p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">Try resetting search parameters or filters to view student accounts.</p></div> : (
              <>
                <div className="desktop-data-table overflow-x-auto"><table aria-label="Student sanction roster" className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900 dark:text-slate-300"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Department / Section</th><th className="px-5 py-3">Attendance</th><th className="px-5 py-3">Sanction Status</th><th className="px-5 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{rosterPage.visible.map((student) => { const hours = student.stats?.sanction_hours || 0; return <tr key={student.uid}><td className="px-5 py-4"><p className="max-w-xs [overflow-wrap:anywhere] font-bold text-brand-900 dark:text-white">{student.name}</p><p className="font-mono text-xs text-slate-500">{student.student_id}</p></td><td className="px-5 py-4"><p className="max-w-xs [overflow-wrap:anywhere] font-semibold text-slate-700 dark:text-slate-200">{student.school_data?.department || 'Department'}</p><p className="text-xs text-slate-500">{student.school_data?.section || 'N/A'}</p></td><td className="px-5 py-4 font-bold text-emerald-600 dark:text-emerald-400">{student.stats?.attendance_rate ?? 100}%</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${hours > 0 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>{hours > 0 ? `${hours}h Sanctions` : 'Cleared'}</span></td><td className="px-5 py-4 text-right"><Button aria-label={`Manage ${student.name}`} className="ml-auto w-auto" onClick={() => openStudentModal(student)} size="sm" variant="secondary">Manage <ChevronRight size={14} /></Button></td></tr>; })}</tbody></table></div>
                <div className="space-y-3 p-4 md:hidden">{rosterPage.visible.map((student) => { const hours = student.stats?.sanction_hours || 0; return <article aria-label={`${student.name} sanction record`} className="mobile-data-card rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900" key={student.uid}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="[overflow-wrap:anywhere] font-bold text-brand-900 dark:text-white">{student.name}</h3><p className="font-mono text-xs text-slate-500">{student.student_id}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${hours > 0 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>{hours > 0 ? `${hours}h Sanctions` : 'Cleared'}</span></div><div className="mt-3 rounded-xl bg-white p-3 text-xs dark:bg-slate-800"><p className="[overflow-wrap:anywhere] font-semibold text-slate-700 dark:text-slate-200"><School className="mr-1 inline" size={12} />{student.school_data?.department || 'Department'}</p><p className="mt-1 text-slate-500">Section: {student.school_data?.section || 'N/A'}</p><p className="mt-1 font-bold text-emerald-600 dark:text-emerald-400">Attendance Rate: {student.stats?.attendance_rate ?? 100}%</p></div><Button aria-label={`Manage ${student.name}`} className="mt-3" onClick={() => openStudentModal(student)} size="sm">Manage <ChevronRight size={14} /></Button></article>; })}</div>
              </>
            )}
            <RecordPagination {...rosterPage} label="Sanction roster pagination" />
          </Surface>
        </div>
      )}
      {section === 'excuses' && <ExcuseApprovalQueue applications={excuseApps} onChanged={loadData} />}
      <Modal
        footer={<Button aria-label="Close full record" className="sm:w-auto" onClick={() => setSelectedStudent(null)}>Close</Button>}
        onClose={() => setSelectedStudent(null)}
        open={Boolean(selectedStudent)}
        size="lg"
        title={`Student Full Record — ${selectedStudent?.name || ''}`}
      >
        {selectedStudent ? <div className="space-y-5">
          <div className="flex min-w-0 items-center gap-3"><ProfileAvatar alt={selectedStudent.name} className="h-12 w-12 shrink-0 rounded-2xl object-cover ring-2 ring-gold-400" src={selectedStudent.photo_url || '/avatar-placeholder.svg'} /><div className="min-w-0"><p className="[overflow-wrap:anywhere] font-bold text-brand-900 dark:text-white">{selectedStudent.name}</p><p className="[overflow-wrap:anywhere] text-xs text-slate-500">ID: {selectedStudent.student_id} · {selectedStudent.school_data?.department}</p></div></div>
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center"><div><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Current Sanction Balance</span><p className="mt-1 text-3xl font-bold text-brand-900 dark:text-white">{selectedStudent.stats?.sanction_hours || 0} <span className="text-sm text-slate-500">Sanction Hours</span></p></div><div className="flex flex-wrap gap-2">{canManageSanctions ? <><Button aria-label="Subtract sanction hours" className="w-auto" onClick={() => { setAdjustMode('deduct'); setAdjustHours(2); }} size="sm" variant="secondary"><MinusCircle size={14} /> Subtract</Button><Button aria-label="Add penalty hours" className="w-auto" onClick={() => { setAdjustMode('add'); setAdjustHours(2); }} size="sm" variant="gold"><PlusCircle size={14} /> Add</Button><Button aria-label="Resolve and clear all sanctions" className="w-auto" onClick={() => { setAdjustMode('clear'); setAdjustHours(0); }} size="sm"><ShieldCheck size={14} /> Clear</Button></> : null}</div></div>
          {adjustMode ? <form className="space-y-3 rounded-2xl border border-brand-900/20 bg-brand-900/5 p-4 dark:bg-brand-900/30" onSubmit={handleSanctionSubmit}><div className="flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-wider text-brand-900 dark:text-gold-400">{adjustMode === 'deduct' ? 'Minus Sanction Hours' : adjustMode === 'add' ? 'Issue Additional Penalty Hours' : 'Fully Resolve & Clear Student Sanctions'}</h3><button aria-label="Cancel adjustment" onClick={() => setAdjustMode(null)} type="button"><X size={14} /></button></div>{adjustMode !== 'clear' ? <div className="space-y-1.5"><label className="text-xs font-bold text-slate-500" htmlFor="ossa-adjust-hours">Hours to {adjustMode}</label><input className="app-control w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white" id="ossa-adjust-hours" max="100" min="1" onChange={(event) => setAdjustHours(Number(event.target.value))} type="number" value={adjustHours} /></div> : null}<div className="space-y-1.5"><label className="text-xs font-bold text-slate-500" htmlFor="ossa-adjust-reason">Official Reason / OSSA Note</label><input className="app-control w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white" id="ossa-adjust-reason" onChange={(event) => setAdjustReason(event.target.value)} placeholder={adjustMode === 'deduct' ? 'e.g. Rendered 2 hours SSG Community Clean-Up' : adjustMode === 'add' ? 'e.g. Unexcused absence from University Convocation' : 'e.g. Completed all required community service tasks'} required type="text" value={adjustReason} /></div><div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button className="sm:w-auto" onClick={() => setAdjustMode(null)} size="sm" variant="secondary">Cancel</Button><Button aria-label="Confirm adjustment" className="sm:w-auto" size="sm" type="submit">Confirm</Button></div></form> : null}
          <section className="space-y-3"><h3 className="text-sm font-bold text-brand-900 dark:text-white">Academic Assignment</h3><DetailFields fields={[
            { label: 'Level / section', value: [selectedStudent.school_data?.level, selectedStudent.school_data?.section].filter(Boolean).join(' · ') || 'Not specified' },
            { label: 'Department', value: selectedStudent.school_data?.department || 'Not specified' },
            { label: 'Track / strand', value: [selectedStudent.school_data?.track, selectedStudent.school_data?.strand].filter(Boolean).join(' · ') || 'Not specified' },
          ]} /></section>
          <section className="space-y-3"><h3 className="text-sm font-bold text-brand-900 dark:text-white">Contact Details</h3><DetailFields fields={[
            { label: 'Email', value: selectedStudent.email || 'Not specified' },
            { label: 'Guardian', value: selectedStudent.guardian?.name || 'Not specified' },
            { label: 'Contact', value: selectedStudent.guardian?.contact || 'Not specified' },
          ]} /></section>
          <section aria-label="Sanction history" className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3 dark:bg-slate-900"><h3 className="text-sm font-bold text-brand-900 dark:text-white">Sanction History & Action Log</h3><span className="text-xs text-slate-500">{history.length} entries · Newest first</span></div>
            {!history.length ? <p className="p-6 text-center text-sm text-slate-500">No sanction log history recorded for this student.</p> : <ol className="divide-y divide-slate-200 dark:divide-slate-700">{historyPage.visible.map((log: any, index: number) => <li key={log.id || `${log.timestamp}:${index}`} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm font-semibold text-brand-900 [overflow-wrap:anywhere] dark:text-white">{log.reason}</p><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${log.change > 0 ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>{log.change > 0 ? '+' : ''}{log.change}h</span></div>
              <dl className="grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-slate-500">Recorded at</dt><dd className="mt-1 text-slate-700 dark:text-slate-200">{formatManilaDateTime(log.timestamp)}</dd></div><div><dt className="text-slate-500">Authorized by</dt><dd className="mt-1 break-words text-slate-700 dark:text-slate-200">{log.performed_by || 'System'}</dd></div></dl>
            </li>)}</ol>}
            <RecordPagination {...historyPage} label="Sanction history pagination" />
          </section>
        </div> : null}
      </Modal>


    </Page>
  );
};

export default OSSADashboard;

