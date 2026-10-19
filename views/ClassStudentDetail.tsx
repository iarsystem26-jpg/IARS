import ErrorNotice from '../components/ui/ErrorNotice';
import { hierarchyPathForRole } from '../lib/workspaceRoutes';
import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Award, BarChart3, BookOpen, CheckCircle2, ChevronRight, Clock, FileText, Mail, ShieldAlert, UserRound, UsersRound } from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { appData, documentUrl } from '../lib/backend';
import { findNodePath } from '../lib/academicDirectory';
import { roleLabels } from '../lib/accessControl';
import { formatManilaDateTime } from '../lib/dateTime';
import ProfileAvatar from '../components/ui/ProfileAvatar';
import DetailFields from '../components/ui/DetailFields';
import { MetricCard, Page, PageHeader, Surface } from '../components/ui/Page';
import { Modal } from '../components/ui/Modal';
import ProfileRequests from '../components/members/ProfileRequests';
import StudentRecords from './StudentRecords';
import RecordPagination from '../components/ui/RecordPagination';
import { usePagination } from '../components/usePagination';
import SearchInput from '../components/ui/SearchInput';
import CustomSelect from '../components/ui/CustomSelect';

type RequestEntry = { id: string; title: string; status: string; date: number | string; fields: { label: string; value: React.ReactNode }[]; proof?: string };
const linkClass = 'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-brand-900 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500 dark:text-white dark:hover:bg-slate-800';
const hours = (value: number) => `${Number(value.toFixed(2))} ${value === 1 ? 'hour' : 'hours'}`;
function StatusBadge({ status }: { status: string }) {
  const color = ['approved', 'active'].includes(status) ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : ['rejected', 'deleted', 'suspended'].includes(status) ? 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${color}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{status.replaceAll('_', ' ')}</span>;
}
function InformationGroup({ title, description, icon, fields, className = '' }: { title: string; description: string; icon: React.ReactNode; fields: { label: string; value?: React.ReactNode }[]; className?: string }) {
  return <Surface className={`overflow-hidden ${className}`} aria-label={title}><header className="flex gap-3 border-b border-slate-100 p-5 dark:border-slate-700"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-800 dark:bg-slate-800 dark:text-gold-300">{icon}</span><div><h2 className="font-bold text-brand-900 dark:text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p></div></header><dl className="divide-y divide-slate-100 px-5 dark:divide-slate-700/70">{fields.map(field => <div key={field.label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 py-3.5 text-sm"><dt className="text-slate-500 dark:text-slate-400">{field.label}</dt><dd className="min-w-0 break-words font-medium text-brand-900 [overflow-wrap:anywhere] dark:text-slate-100">{field.value || <span className="font-normal text-slate-400 dark:text-slate-500">Not provided</span>}</dd></div>)}</dl></Surface>;
}

function StudentRequests({ rows }: { rows: RequestEntry[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const filtered = rows.filter(row => (status === 'all' || row.status === status) && `${row.title} ${row.fields.map(field => typeof field.value === 'string' ? field.value : '').join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const pagination = usePagination(filtered, JSON.stringify([search, status]));
  const [selected, setSelected] = useState<RequestEntry | null>(null);
  const [proofError, setProofError] = useState('');
  const openProof = async () => {
    if (!selected?.proof) return;
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await documentUrl(selected.proof);
      if (!url || !/^https?:\/\//i.test(url)) throw new Error('Document unavailable.');
      if (tab) tab.location.href = url;
    } catch { tab?.close(); setProofError('Unable to open the supporting document. Please try again.'); }
  };
  return <Surface className="overflow-hidden" aria-label="Student requests">
    <div className="border-b border-slate-200 p-5 dark:border-slate-700"><div className="flex items-center gap-3"><span className="rounded-xl bg-brand-50 p-2.5 text-brand-800 dark:bg-slate-800 dark:text-gold-300"><FileText size={20} /></span><div><h2 className="font-bold">Student requests</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Excuses, enrollment and organizations · Newest first</p></div></div><div className="mt-5 grid items-end gap-3 sm:grid-cols-[1fr_12rem]"><SearchInput label="Search requests" ariaLabel="Search student requests" value={search} onChange={setSearch} placeholder="Search activity, organization or reason" /><CustomSelect label="Status" ariaLabel="Filter student request status" value={status} onChange={value => setStatus(String(value))} options={['all', 'pending', 'approved', 'rejected', 'bounced', 'deleted'].map(value => ({ value, label: value === 'all' ? 'All statuses' : value[0].toUpperCase() + value.slice(1) }))} /></div></div>
    <div className="divide-y divide-slate-100 dark:divide-slate-700">{pagination.visible.length ? pagination.visible.map(row => <button key={row.id} type="button" onClick={() => { setSelected(row); setProofError(''); }} className="flex w-full items-center gap-3 p-5 text-left transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-gold-500 dark:hover:bg-slate-900"><span className="hidden rounded-xl bg-slate-50 p-2.5 text-slate-400 sm:block dark:bg-slate-800"><FileText size={18} /></span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{row.title}</span><span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">{formatManilaDateTime(row.date)}</span><span className="mt-2 inline-flex sm:hidden"><StatusBadge status={row.status} /></span></span><span className="hidden sm:inline-flex"><StatusBadge status={row.status} /></span><ChevronRight size={18} className="shrink-0 text-slate-400" /></button>) : <div className="p-10 text-center"><FileText size={28} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" /><p className="text-sm font-semibold">{rows.length ? 'No matching requests' : 'No requests yet'}</p><p className="mt-1 text-xs text-slate-500">{rows.length ? 'Try another search or status filter.' : 'Available requests and decisions will appear here.'}</p></div>}</div>
    <RecordPagination {...pagination} label="Student requests pagination" />
    <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.title || 'Request details'} size="lg">{selected && <div className="space-y-4"><DetailFields fields={[{ label: 'Status', value: selected.status }, { label: 'Submitted', value: formatManilaDateTime(selected.date) }, ...selected.fields]} />{selected.proof && <button type="button" onClick={openProof} className={linkClass}>Open supporting document</button>}{proofError && <ErrorNotice error={proofError} operation="Class Student Detail"></ErrorNotice>}</div>}</Modal>
  </Surface>;
}

export default function ClassStudentDetail() {
  const { profile: actor } = useAuth();
  const { studentUid = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const section = ['overview', 'profile', 'requests', 'records'].includes(params.get('view') || '') ? params.get('view')! : 'overview';
  const setSection = (value: string) => { const next = new URLSearchParams(params); next.set('view', value); setParams(next, { replace: true, preventScrollReset: true }); };
  const student = actor ? appData.getVisibleStudents(actor.uid).find(item => item.uid === studentUid) : undefined;
  const detail = student ? appData.getUserDetail(student.uid) : null;
  const nodes = appData.getSchoolStructure();
  const academicPath = student ? findNodePath(nodes, student.school_data?.academic_assignment?.terminalGroupId || '') || [] : [];
  const visibleNodes = actor ? appData.getVisibleSchoolStructure(actor.uid) : [];
  const requestedUnit = params.get('unit') || '';
  const unit = findNodePath(visibleNodes, requestedUnit)?.at(-1)?.id || academicPath.at(-1)?.id;
  const back = `${hierarchyPathForRole(actor?.role)}${unit ? `?unit=${encodeURIComponent(unit)}` : ''}`;
  if (!student || !detail) return <Page><Link className={linkClass} to={back}><ArrowLeft size={16} /> Back to class</Link><PageHeader title="Student unavailable" description="This student is unavailable or outside your assigned scope." /></Page>;
  const attendance = appData.getAttendanceRecords(student.uid).filter(row => !['service', 'merit'].includes(row.event?.kind || ''));
  const counts = ['present', 'late', 'absent', 'excused'].map(status => ({ status, count: attendance.filter(row => row.status === status).length }));
  const rate = attendance.length ? Math.round(attendance.filter(row => row.status !== 'absent').length / attendance.length * 100) : null;
  const months = new Map<string, { total: number; attended: number }>();
  attendance.forEach(row => {
    const time = /^\d{4}-\d{2}-\d{2}/.test(row.slot) ? Date.parse(`${row.slot.split(':')[0]}T00:00:00+08:00`) : Number(row.time_in || row.recorded_at || row.event?.startTime);
    if (!Number.isFinite(time)) return;
    const month = new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
    const entry = months.get(month) || { total: 0, attended: 0 };
    entry.total++; if (row.status !== 'absent') entry.attended++;
    months.set(month, entry);
  });
  const organizations = appData.getOrganizations();
  const organizationName = (id: string) => organizations.find(item => item.id === id)?.name || 'Archived organization';
  const memberships = appData.getOrganizationMemberships().filter(item => item.student_id === student.uid);
  const rows: RequestEntry[] = [
    ...detail.excuse_applications.map(item => ({ id: `excuse:${item.id}`, title: `Excuse · ${item.event_title}`, status: item.status, date: item.submission_date, proof: item.proof_url, fields: [{ label: 'Category', value: item.category }, { label: 'Reason', value: item.reason }, { label: 'Event date', value: item.event_date }, { label: 'Contact mobile', value: item.contact_mobile }, { label: 'Review notes', value: item.review_notes }, { label: 'Hours waived', value: item.waived_hours }, { label: 'Reviewed at', value: item.reviewed_at ? formatManilaDateTime(item.reviewed_at) : 'Awaiting review' }] })),
    ...memberships.map(item => ({ id: `membership:${item.organization_id}`, title: `Membership · ${organizationName(item.organization_id)}`, status: item.status, date: item.created_at, fields: [{ label: 'Organization', value: organizationName(item.organization_id) }, { label: 'Reviewed at', value: item.reviewed_at ? formatManilaDateTime(item.reviewed_at) : 'Not recorded' }] })),
    ...appData.getOrganizationSanctions().filter(item => item.student_id === student.uid).map(item => ({ id: `org-sanction:${item.id}`, title: `Sanction request · ${organizationName(item.organization_id)}`, status: item.status, date: item.created_at, fields: [{ label: 'Reason', value: item.reason }, { label: 'Hours requested', value: item.hours }, { label: 'Review notes', value: item.review_notes }] })),
    ...appData.getVisibleApplications(actor!.uid).filter(item => item.id === student.uid || item.form_data.uid === student.uid).map(item => ({ id: `enrollment:${item.id}`, title: 'Enrollment application', status: item.status, date: item.submission_date, fields: [{ label: 'Review notes', value: item.rejection_reason }, { label: 'Clarification requested', value: item.clarification_fields?.join(', ') }, { label: 'Reviewed at', value: item.reviewed_at ? formatManilaDateTime(item.reviewed_at) : 'Not recorded' }] })),
  ].sort((a, b) => (typeof b.date === 'number' ? b.date : Date.parse(b.date)) - (typeof a.date === 'number' ? a.date : Date.parse(a.date)));
  const school = student.school_data;
  const pending = rows.filter(row => row.status === 'pending').length;
  return <Page className="max-w-6xl">
    <Link className={linkClass} to={back}><ArrowLeft size={16} /> Back to class</Link>
    <Surface className="relative overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-brand-900 via-brand-700 to-gold-400" />
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <ProfileAvatar src={student.photo_url || undefined} alt={`${student.name} profile`} className="h-20 w-20 shrink-0 rounded-2xl border-4 border-white object-cover shadow-sm sm:h-24 sm:w-24 dark:border-slate-700" />
        <div className="min-w-0 flex-1"><p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Student record</p><h1 className="break-words text-2xl font-bold tracking-tight text-brand-900 dark:text-white">{student.name}</h1><div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{student.student_id}</span><StatusBadge status={student.account_status || 'active'} /><span className="text-xs text-slate-500 dark:text-slate-400">{roleLabels[student.role] || student.role}</span></div><p className="mt-3 flex items-start gap-1.5 text-sm text-slate-500 dark:text-slate-400"><BookOpen size={15} className="mt-0.5 shrink-0" /><span className="break-words">{[school.program || school.department, school.level, school.section].filter(Boolean).join(' / ')}</span></p></div>
      </div>
      <nav aria-label="Student detail sections" className="grid grid-cols-2 gap-1 border-t border-slate-100 bg-slate-50/60 px-3 py-2 sm:flex sm:flex-wrap sm:px-5 dark:border-slate-700 dark:bg-slate-900/30">{[['overview', 'Overview & analytics', BarChart3], ['profile', 'Profile information', UserRound], ['requests', 'Requests', FileText], ['records', 'Attendance & sanctions', Clock]].map(([id, label, Icon]) => { const TabIcon = Icon as typeof BarChart3; return <button key={String(id)} type="button" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(String(id))} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500 sm:text-sm ${section === id ? 'bg-brand-900 text-white shadow-sm dark:bg-gold-400 dark:text-brand-900' : 'text-slate-500 hover:bg-white hover:text-brand-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'}`}><TabIcon size={16} className="shrink-0" /><span>{String(label)}</span></button>; })}</nav>
    </Surface>
    {section === 'overview' && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><MetricCard className="!shadow-none [&>div]:flex-col [&>div]:gap-2 sm:[&>div]:flex-row" icon={<CheckCircle2 size={20} />} label="Attendance rate" value={rate === null ? 'N/A' : `${rate}%`} detail={`${attendance.length} recorded attendance sessions`} /><MetricCard className="!shadow-none [&>div]:flex-col [&>div]:gap-2 sm:[&>div]:flex-row" icon={<ShieldAlert size={20} />} label="Sanction balance" value={hours(detail.stats.sanction_hours)} detail="Community service remaining" /><MetricCard className="!shadow-none [&>div]:flex-col [&>div]:gap-2 sm:[&>div]:flex-row" icon={<Award size={20} />} label="Earned merit" value={hours(detail.stats.merit_hours || 0)} detail="Saved service and activity credits" /><MetricCard className="!shadow-none [&>div]:flex-col [&>div]:gap-2 sm:[&>div]:flex-row" icon={<Clock size={20} />} label="Pending requests" value={pending} detail="Excuses, enrollment and organizations" /></div>
      <Surface className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 className="flex items-center gap-2 text-sm font-bold"><BookOpen size={17} className="text-gold-600 dark:text-gold-300" /> Academic assignment</h2><p className="mt-2 break-words text-sm text-slate-600 dark:text-slate-300">{academicPath.map(node => node.name).join(' / ') || school.section}</p></div><button type="button" onClick={() => setSection('profile')} className={`${linkClass} shrink-0 self-start`}>View full profile <ArrowUpRight size={15} /></button></Surface>
      <div className="grid gap-4 lg:grid-cols-2"><Surface className="space-y-5 p-5" aria-label="Attendance breakdown"><div><h2 className="flex items-center gap-2 font-bold"><BarChart3 size={18} className="text-gold-600 dark:text-gold-300" /> Attendance breakdown</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Distribution across recorded sessions</p></div><div className="flex flex-col items-center gap-6 sm:flex-row"><div aria-hidden="true" className="flex h-36 w-36 shrink-0 items-center justify-center rounded-full p-3" style={{ background: attendance.length ? `conic-gradient(#10b981 0% ${counts[0].count / attendance.length * 100}%, #f59e0b ${counts[0].count / attendance.length * 100}% ${(counts[0].count + counts[1].count) / attendance.length * 100}%, #ef4444 ${(counts[0].count + counts[1].count) / attendance.length * 100}% ${(counts[0].count + counts[1].count + counts[2].count) / attendance.length * 100}%, #3b82f6 ${(counts[0].count + counts[1].count + counts[2].count) / attendance.length * 100}% 100%)` : '#cbd5e1' }}><div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white dark:bg-slate-900"><span className="text-3xl font-bold text-brand-900 dark:text-white">{attendance.length}</span><span className="mt-1 text-xs text-slate-500">Sessions</span></div></div><dl className="w-full flex-1 space-y-3">{counts.map(({ status, count }) => <div key={status} className="flex items-center justify-between gap-3 text-sm"><dt className="flex items-center gap-2 capitalize text-slate-600 dark:text-slate-300"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${status === 'absent' ? 'bg-red-500' : status === 'late' ? 'bg-amber-500' : status === 'excused' ? 'bg-blue-500' : 'bg-emerald-500'}`} />{status}</dt><dd className="flex items-center gap-3"><span className="font-semibold tabular-nums">{count} sessions</span><span className="w-10 text-right text-xs tabular-nums text-slate-400">{attendance.length ? Math.round(count / attendance.length * 100) : 0}%</span></dd></div>)}</dl></div><p className="border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:text-slate-400">Attendance rate includes present, late and excused sessions. Service and merit activities are tracked separately.</p></Surface>
      <Surface className="space-y-4 p-5" aria-label="Monthly attendance trend"><h2 className="text-lg font-bold">Monthly attendance trend</h2><p className="!mt-1 text-xs text-slate-500 dark:text-slate-400">Participation over the last six recorded months</p>{months.size ? [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([month, entry]) => <div key={month}><div className="mb-1 flex justify-between gap-2 text-sm"><time dateTime={month}>{new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(`${month}-01T00:00:00+08:00`))}</time><span>{Math.round(entry.attended / entry.total * 100)}% · {entry.attended}/{entry.total} sessions</span></div><div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-brand-700 dark:bg-gold-400" style={{ width: `${entry.attended / entry.total * 100}%` }} /></div></div>) : <p className="text-sm text-slate-500">No recorded attendance yet.</p>}<p className="text-xs text-slate-500">Up to six recorded months, using Philippine dates.</p></Surface></div>
    </>}
    {section === 'profile' && <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4">
      <InformationGroup title="Student & account" description="Identity and account details" icon={<UserRound size={20} />} fields={[
        { label: 'Full name', value: student.name }, { label: 'Student ID', value: <span className="font-mono">{student.student_id}</span> }, { label: 'Username', value: student.username }, { label: 'Role', value: roleLabels[student.role] || student.role }, { label: 'Account status', value: <StatusBadge status={student.account_status || 'active'} /> },
      ]} />
      <InformationGroup title="Academic information" description="Enrollment and class assignment" icon={<BookOpen size={20} />} fields={[
        { label: 'Education type', value: school.type }, { label: 'Department', value: school.department }, { label: 'Program', value: school.program }, { label: 'Year / grade level', value: school.level }, { label: 'Class / section', value: school.section },
        ...([{ label: 'Major', value: school.major }, { label: 'Track', value: school.track }, { label: 'Strand', value: school.strand }, { label: 'Academic year', value: school.academic_assignment?.academicYear }, { label: 'Curriculum', value: school.academic_assignment?.curriculumCode }].filter(field => field.value)),
      ]} />
      </div><div className="space-y-4">
      <InformationGroup title="Contact information" description="Student email and mobile contact" icon={<Mail size={20} />} fields={[
        { label: 'Email address', value: student.email ? <a className="hover:underline focus-visible:outline-gold-500" href={`mailto:${student.email}`}>{student.email}</a> : undefined }, { label: 'Mobile number', value: student.phone ? <a className="hover:underline" href={`tel:${student.phone}`}>{student.phone}</a> : undefined },
      ]} />
<InformationGroup title="Parent / guardian" description="Guardian information on file" icon={<UsersRound size={20} />} fields={[
        { label: 'Full name', value: student.guardian?.name }, { label: 'Contact number', value: student.guardian?.contact ? <a className="hover:underline" href={`tel:${student.guardian.contact}`}>{student.guardian.contact}</a> : undefined }, { label: 'Email address', value: student.guardian?.email ? <a className="hover:underline" href={`mailto:${student.guardian.email}`}>{student.guardian.email}</a> : undefined },
      ]} /><InformationGroup title="Organizations & affiliations" description="Approved memberships and academic affiliations" icon={<Award size={20} />} fields={[
        { label: 'Organizations', value: memberships.filter(item => item.status === 'approved').map(item => organizationName(item.organization_id)).join(', ') || 'No approved memberships' }, { label: 'Academic affiliations', value: school.academic_assignment?.affiliations?.map(item => item.name).join(', ') || 'None recorded' },
      ]} />      </div>
    </div>}
    {section === 'requests' && <><StudentRequests rows={rows} />{['admin', 'ossa', 'ossa_staff'].includes(actor!.role) ? <ProfileRequests key={student.uid} review studentUid={student.uid} /> : <Surface className="p-5"><h2 className="text-lg font-bold">Information change & deletion requests</h2><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Information request history is available to OSSA and administrators under the current access rules.</p></Surface>}</>}
    {section === 'records' && <StudentRecords key={student.uid} student={student} studentStats={detail.stats} embedded />}
  </Page>;
}
