import type { ReactNode } from 'react';
import { Page, Surface } from './Page';
import { Skeleton } from './Skeleton';
import { calendarDay, monthDays } from '../../lib/calendarDates';
import { hasPermission } from '../../lib/accessControl';
import { systemControlPermissions } from '../../lib/systemControlsAccess';
import { ossaSections } from '../../lib/ossaHub';

const repeat = (count: number, render: (index: number) => ReactNode) =>
  Array.from({ length: count }, (_, index) => <div className="min-w-0" key={index}>{render(index)}</div>);

export function LinesSkeleton({ count = 3 }: { count?: number }) {
  return <div className="min-w-0 space-y-3">{repeat(count, index => <Skeleton height="0.875rem" className={index === count - 1 ? 'w-2/3' : 'w-full'} />)}</div>;
}

const Lines = LinesSkeleton;

function Header({ actions = 0, centered = false }: { actions?: number; centered?: boolean }) {
  return <div className={`flex flex-wrap items-start justify-between gap-4 ${centered ? 'text-center' : ''}`}>
    <div className={`min-w-0 ${centered ? 'w-full [&>span]:mx-auto' : 'flex-1'}`}>
      <Skeleton className="mb-1 w-32" height="1rem" />
      <Skeleton className="w-full max-w-sm" height="2.25rem" />
      <Skeleton className="mt-2 w-full max-w-3xl" height="1.5rem" />
    </div>
    {actions > 0 && <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">{repeat(actions, () => <Skeleton className="w-full sm:w-36" height="2.75rem" />)}</div>}
  </div>;
}

function Metrics({ count = 4, className = 'grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4' }: { count?: number; className?: string }) {
  return <div data-skeleton="metrics" className={`grid ${className}`}>{repeat(count, () =>
    <Surface className="p-4 sm:p-5"><div className="flex items-start gap-3">
      <Skeleton width="1.25rem" height="1.25rem" className="shrink-0" />
      <div className="min-w-0 flex-1"><Skeleton className="w-full max-w-32" height="1.25rem" /><Skeleton className="mt-1 w-20" height="2rem" /><Skeleton className="mt-1 w-full" height="1.25rem" /></div>
    </div></Surface>)}</div>;
}

function Identity({ large = false }: { large?: boolean }) {
  return <Surface data-skeleton="identity" className="p-4 sm:p-5"><div className="flex items-center gap-3 sm:gap-4">
    <Skeleton width={large ? '5rem' : '3.5rem'} height={large ? '5rem' : '3.5rem'} className="shrink-0" rounded="lg" />
    <div className="min-w-0 flex-1 space-y-2"><Skeleton className="w-full max-w-sm" height="1.75rem" /><Skeleton className="w-full max-w-md" height="1rem" /></div>
  </div></Surface>;
}

export function FieldSkeleton({ count = 4, columns = 'sm:grid-cols-2' }: { count?: number; columns?: string }) {
  return <div data-skeleton="fields" className={`grid min-w-0 gap-4 ${columns}`}>{repeat(count, () => <div className="space-y-2"><Skeleton className="w-28" height="1rem" /><Skeleton className="w-full" height="2.75rem" /></div>)}</div>;
}

function Panel({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <Surface className={`min-w-0 space-y-4 p-4 sm:p-6 ${className}`}><Skeleton className="w-full max-w-52" height="1.5rem" />{children || <Lines />}</Surface>;
}

export function OrganizationCardsSkeleton() {
  return <div data-skeleton="organizations" aria-hidden="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{repeat(6, () => <Surface className="space-y-3 p-5"><div className="flex items-center gap-3"><Skeleton width="3.5rem" height="3.5rem" className="shrink-0" /><div className="min-w-0 flex-1"><Lines count={2} /></div></div><Lines count={3} /></Surface>)}</div>;
}

function Cards({ count = 2, className = 'md:grid-cols-2' }: { count?: number; className?: string }) {
  return <div className={`grid gap-4 ${className}`}>{repeat(count, () => <Panel><Lines /><Skeleton className="w-full" height="2.75rem" /></Panel>)}</div>;
}

export function LedgerSkeleton({ columns = 5 }: { columns?: number }) {
  return <div data-skeleton="ledger" aria-hidden="true" className="min-w-0">
    <div className="hidden md:block"><div className="grid gap-4 border-b p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{repeat(columns, () => <Skeleton className="w-2/3" height="1rem" />)}</div>{repeat(5, () => <div className="grid gap-4 border-b p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{repeat(columns, () => <Skeleton className="w-full" height="1.25rem" />)}</div>)}</div>
    <div className="space-y-3 p-4 md:hidden">{repeat(3, () => <Panel><Lines /><Skeleton className="w-full" height="2.75rem" /></Panel>)}</div>
  </div>;
}

function CalendarGrid({ month, ceremony = false }: { month: string; ceremony?: boolean }) {
  return <div data-skeleton="calendar" className="grid grid-cols-7 gap-1">{monthDays(month).map((date, index) => date ? <Skeleton key={date} className={ceremony ? 'w-full h-11' : 'w-full h-16 sm:h-20'} /> : <span key={`blank-${index}`} />)}</div>;
}

function EventSections({ filters = true, management = false, ceremony = false }: { filters?: boolean; management?: boolean; ceremony?: boolean }) {
  return <>{filters && (management ? <Panel><FieldSkeleton count={4} columns="lg:grid-cols-4" /></Panel> : <Surface className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><Skeleton className="w-full" height="2.75rem" /></div><div className="min-w-0 sm:w-56"><FieldSkeleton count={1} columns="grid-cols-1" /></div></Surface>)}
    {ceremony && <Surface className="space-y-3 p-4"><div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-2"><Skeleton width="2.75rem" height="2.75rem" /><Skeleton className="mx-auto w-full max-w-64" height="4.25rem" /><Skeleton width="2.75rem" height="2.75rem" /></div><div className="grid grid-cols-7 gap-1">{repeat(7, () => <Skeleton className="w-full" height="2rem" />)}</div><CalendarGrid month={calendarDay().slice(0, 7)} ceremony /></Surface>}
    <Panel><Cards /></Panel>{repeat(2, () => <Surface className="p-5"><Skeleton className="w-full max-w-64" height="2.5rem" /></Surface>)}</>;
}

function CalendarContent({ month }: { month: string }) {
  return <><Metrics count={3} className="gap-3 sm:grid-cols-3" /><div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
    <Surface className="min-w-0 p-3 sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Skeleton className="w-64" height="2.75rem" /><Skeleton width="4rem" height="2.75rem" /></div>
      <div className="mt-4 grid grid-cols-7 gap-1">{repeat(7, () => <Skeleton className="mx-auto w-2/3" height="2rem" />)}</div>
      <CalendarGrid month={month} />
      <div className="mt-5 border-t pt-4"><Lines count={3} /></div>
    </Surface><Panel><Lines /><Cards count={2} className="grid-cols-1" /></Panel>
  </div></>;
}

function ProfileContent({ detail = false }: { detail?: boolean }) {
  return <><Identity large />{detail && <><Skeleton className="w-full" height="3.5rem" /><Metrics className="grid-cols-2 gap-3 lg:grid-cols-4" /></>}
    <div className="grid items-start gap-4 md:grid-cols-2"><Panel><FieldSkeleton count={6} columns="grid-cols-1" /></Panel><div className="min-w-0 space-y-4"><Panel><FieldSkeleton count={4} columns="grid-cols-1" /></Panel><Panel><Lines /></Panel></div></div>
    {!detail && <Panel><Lines /><Skeleton className="w-full sm:w-40" height="2.75rem" /></Panel>}</>;
}

function QrContent() {
  return <Surface data-skeleton="qr-card" className="w-full overflow-hidden"><div className="flex items-center gap-4 border-b-2 p-5 sm:p-6"><Skeleton width="4rem" height="4rem" rounded="pill" className="shrink-0" /><div className="min-w-0 flex-1"><Lines /></div></div><div className="space-y-5 p-5 sm:p-6"><Lines count={2} /><FieldSkeleton count={2} columns="min-[400px]:grid-cols-2" /><div className="mx-auto w-full max-w-[min(17rem,calc(100vw-4rem))] rounded-2xl border border-slate-200 bg-white p-4"><Skeleton className="aspect-square w-full" rounded="lg" /></div><Skeleton className="w-full" height="2.75rem" /><Panel><Lines count={2} /></Panel></div></Surface>;
}

function DashboardContent({ staff }: { staff: boolean }) {
  return <>{staff ? <Panel><Lines /><Skeleton className="w-full sm:w-64" height="2.75rem" /></Panel> : <Identity />}<Metrics className={staff ? 'grid-cols-2 gap-3 lg:grid-cols-4' : undefined} />
    {staff ? <Cards count={6} className="sm:grid-cols-2" /> : <><div className="grid grid-cols-1 gap-2.5 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">{repeat(6, () => <Surface className="space-y-2 p-3"><Skeleton width="2rem" height="2rem" /><Skeleton className="w-full" height="1rem" /></Surface>)}</div><div className="grid gap-6 lg:grid-cols-3"><div className="space-y-4 lg:col-span-2"><Skeleton className="w-full" height="2rem" /><Cards /></div><div className="space-y-6"><Panel /><Panel /><Panel /></div></div></>}
  </>;
}

function ScannerContent({ officer }: { officer: boolean }) {
  return <><Metrics count={officer ? 3 : 4} className={officer ? 'gap-4 sm:grid-cols-3' : 'gap-4 sm:grid-cols-2 xl:grid-cols-4'} /><div className={`grid items-start gap-5 ${officer ? 'xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]' : 'lg:grid-cols-[1fr_1.1fr]'}`}><Panel><FieldSkeleton count={1} columns="grid-cols-1" /><Skeleton className="aspect-square w-full max-w-md mx-auto" /></Panel><div className="space-y-5"><Panel><Lines /><Skeleton className="w-full" height="2.75rem" /></Panel><Panel><LedgerSkeleton columns={3} /></Panel></div></div></>;
}

function FormContent({ holiday = false, creating = false, ceremony = false }: { holiday?: boolean; creating?: boolean; ceremony?: boolean }) {
  if (holiday) return <><Panel><Lines count={2} /><FieldSkeleton count={5} columns="md:grid-cols-2" /><Skeleton className="w-full" height="6rem" /><FieldSkeleton count={1} columns="grid-cols-1" /><Skeleton className="w-full sm:w-64" height="2.75rem" /></Panel><Panel><LedgerSkeleton /></Panel></>;
  return <>{creating && <Panel><Skeleton className="w-full" height="0.5rem" /><div className="flex flex-wrap gap-2">{repeat(5, () => <Skeleton className="w-24" height="1.5rem" />)}</div></Panel>}
    <Panel><FieldSkeleton count={ceremony ? 1 : 3} columns="grid-cols-1" /></Panel>
    <Panel><FieldSkeleton count={1} columns="grid-cols-1" /><Skeleton className="w-full" height="9rem" />{!ceremony && <Skeleton className="w-full" height="8rem" />}</Panel>
    {!creating && <><Panel><FieldSkeleton count={4} /></Panel><Panel><FieldSkeleton count={2} /><Skeleton className="w-full" height="16rem" /></Panel><Panel><FieldSkeleton count={4} /></Panel></>}
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Skeleton className="w-full sm:w-32" height="2.75rem" /><Skeleton className="w-full sm:w-40" height="2.75rem" /></div></>;
}

function PublicHeaderSkeleton() {
  return <div className="absolute inset-x-0 top-0 flex min-h-20 items-center justify-between gap-4 px-4 py-4 sm:px-6"><Skeleton width="3rem" height="3rem" rounded="pill" /><div className="flex min-w-0 gap-3"><Skeleton className="hidden w-40 sm:block" height="1rem" /><Skeleton className="w-24" height="2.75rem" /></div></div>;
}

export function PageSkeletonForRoute({ pathname, search = '', role }: { pathname: string; search?: string; role?: string }) {
  const staff = !!role && ['admin', 'ssg', 'ossa', 'ossa_staff'].includes(role);
  let content: ReactNode;
  let className = '';
  let actions = 0;
  let centered = false;
  let kind = '';
  const publicLegal = ['/privacy-policy', '/data-deletion', '/data-privacy-agreement', '/terms-of-service'].includes(pathname);
  if (pathname === '/' || pathname === '/login' || pathname === '/register' || publicLegal) {
    const enrollment = pathname === '/register';
    return <div data-skeleton-page={publicLegal ? 'legal' : enrollment ? 'enrollment' : 'landing'} aria-hidden="true" className="relative min-h-dvh w-full">
      <PublicHeaderSkeleton />
      <div className={enrollment ? 'mx-auto w-full max-w-4xl px-4 pb-12 pt-28 sm:px-6 sm:pt-32' : publicLegal ? 'mx-auto max-w-4xl px-6 pb-12 pt-32 sm:pt-36' : 'px-6 pb-20 pt-32 lg:pb-28 lg:pt-44'}>
        <div className={publicLegal || enrollment ? 'space-y-6' : 'mx-auto max-w-4xl space-y-6 [&>span]:mx-auto'}><Header centered={!publicLegal && !enrollment} />{enrollment ? <Panel><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{repeat(5, () => <Skeleton height="2.75rem" className="w-full" />)}</div><FieldSkeleton count={6} /></Panel> : publicLegal ? <><Panel><Lines count={6} /></Panel>{repeat(3, () => <Panel><Lines count={5} /></Panel>)}</> : <><Skeleton className="w-full max-w-2xl" height="3rem" /><Panel className="mx-auto max-w-3xl"><FieldSkeleton count={2} /></Panel><Cards count={3} className="md:grid-cols-3" /></>}</div>
      </div>
      {pathname === '/login' && <div data-skeleton="login-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 sm:p-6"><Surface className="flex w-full min-w-0 max-w-lg flex-col overflow-hidden rounded-2xl sm:rounded-3xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)]"><div className="space-y-3 border-b px-5 py-4 sm:px-6"><Skeleton className="w-full max-w-52" height="1.5rem" /><Lines count={1} /></div><div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5 sm:px-6"><FieldSkeleton count={2} columns="grid-cols-1" /><Skeleton className="w-full" height="2.75rem" /><Lines count={1} /><Skeleton className="w-full" height="2.75rem" /><Skeleton className="w-full" height="2.75rem" /></div></Surface></div>}
    </div>;
  }
  if (pathname === '/register/status' || pathname.startsWith('/verify/clearance/')) {
    const verification = pathname.startsWith('/verify/');
    return <div data-skeleton-page={verification ? 'verification' : 'application-status'} aria-hidden="true" className={verification ? 'min-h-screen px-4 py-12' : 'min-h-dvh bg-brand-900 p-5 pt-20'}><div className={`mx-auto space-y-6 ${verification ? 'max-w-xl' : 'max-w-lg'}`}><Panel className={verification ? 'p-6 sm:p-10' : 'p-6'}><Header /><Lines count={6} /><Skeleton className="w-full" height="2.75rem" /></Panel></div></div>;
  }
  if (pathname === '/dashboard') { kind = 'dashboard'; className = 'max-w-6xl'; content = <DashboardContent staff={staff} />; }
  else if (pathname === '/student/qr') { kind = 'qr'; className = 'student-qr-page'; centered = true; content = <QrContent />; }
  else if (pathname === '/student/calendar') { kind = 'calendar'; actions = hasPermission(role, 'calendar.manage_closures') ? 3 : 2; const requestedMonth = new URLSearchParams(search).get('month'); const month = requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : calendarDay().slice(0, 7); content = <CalendarContent month={month} />; }
  else if (pathname === '/student/profile' || /\/(?:panel|hierarchy)\/students\/[^/]+$/.test(pathname)) { kind = 'profile'; content = <ProfileContent detail={pathname !== '/student/profile'} />; if (pathname !== '/student/profile') className = 'max-w-6xl'; }
  else if (pathname === '/student/records') { kind = 'records'; className = 'max-w-6xl'; actions = 1; content = <><Metrics className="grid-cols-2 gap-3 lg:grid-cols-4" /><Metrics count={1} className="grid-cols-1" /><Panel><FieldSkeleton count={2} /></Panel><Surface className="overflow-hidden"><LedgerSkeleton /></Surface><Panel><Cards count={3} className="md:grid-cols-3" /></Panel></>; }
  else if (pathname === '/admin/calendar' || /\/(?:events|ceremonies)\/(?:create|[^/]+\/edit)$/.test(pathname)) { kind = 'form'; actions = pathname === '/admin/calendar' ? 2 : 1; content = <FormContent holiday={pathname === '/admin/calendar'} creating={pathname.endsWith('/create')} ceremony={pathname.includes('/ceremonies/')} />; }
  else if (pathname === '/student/events' || pathname === '/student/ceremonies' || pathname === '/ssg/events') { kind = 'events'; className = pathname === '/ssg/events' ? 'max-w-7xl' : 'max-w-6xl'; actions = pathname === '/ssg/events' ? 1 + Number(hasPermission(role, 'calendar.manage_closures')) : pathname === '/student/ceremonies' && hasPermission(role, 'events.manage') ? 1 : 0; content = <EventSections management={pathname === '/ssg/events'} ceremony={pathname === '/student/ceremonies'} />; }
  else if (/\/events\/[^/]+$/.test(pathname)) { kind = 'event-detail'; className = 'max-w-6xl'; actions = staff ? 2 : 0; content = <EventSections filters={false} />; }
  else if (pathname === '/mayor/scan') { kind = 'scanner'; content = <ScannerContent officer={role !== 'mayor'} />; }
  else if (pathname === '/ssg/transfers') { kind = 'transfers'; actions = 1; content = <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"><Panel><FieldSkeleton count={2} /><LedgerSkeleton /></Panel><div className="space-y-5"><Panel /><Panel /></div></div>; }
  else if (pathname.startsWith('/organizations')) { kind = 'organizations'; actions = pathname.endsWith('/public') || /\/organizations\/[^/]+$/.test(pathname) ? 1 : 0; content = pathname === '/organizations' || pathname === '/organizations/public' ? <><Skeleton className="w-full" height="2.75rem" /><OrganizationCardsSkeleton /></> : <><Identity large /><Panel><Cards /></Panel></>; }
  else if (pathname === '/ssg/panel' || pathname === '/admin/hierarchy') { kind = 'hierarchy'; actions = 1; content = <><Panel><Lines count={2} /></Panel><Metrics count={3} className="gap-3 sm:grid-cols-3" /><Cards count={4} className="min-[420px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4" /><Panel><LedgerSkeleton /></Panel></>; }
  else if (pathname === '/admin/attendance') { kind = 'attendance'; className = 'max-w-[1600px]'; actions = 3; content = <><Panel><FieldSkeleton count={4} /></Panel><Metrics className="gap-4 sm:grid-cols-2 xl:grid-cols-4" /><div className="grid gap-6 lg:grid-cols-3"><Panel /><Surface className="min-w-0 overflow-hidden lg:col-span-2"><LedgerSkeleton /></Surface></div></>; }
  else if (pathname.startsWith('/ossa/dashboard')) { kind = 'ossa'; className = 'max-w-7xl'; const overview = pathname === '/ossa/dashboard'; content = <><Panel><Header actions={pathname.endsWith('/sanctions') ? 2 : 1} /></Panel>{overview ? <>{[ ['activities', 'requests', 'excuses', 'corrections'], ['sanctions', 'clearance', 'organizations'] ].map((group, index) => <div className="space-y-4" key={index}><Lines count={2} /><Cards count={ossaSections.filter(section => group.includes(section.id) && hasPermission(role, section.permission)).length} className="sm:grid-cols-2 xl:grid-cols-3" /></div>)}{hasPermission(role, 'ossa.manage_cases') && <Metrics count={5} className="gap-4 sm:grid-cols-2 xl:grid-cols-5" />}</> : <><Skeleton className="w-32" height="2.75rem" />{pathname.endsWith('/sanctions') && <Metrics className="gap-4 sm:grid-cols-2 xl:grid-cols-4" />}<Panel><FieldSkeleton count={pathname.endsWith('/clearance') ? 5 : 3} /><LedgerSkeleton /></Panel></>}</>; }
  else if (pathname === '/admin/controls') { kind = 'controls'; className = 'max-w-none space-y-8 px-5 py-6 sm:px-8 sm:py-8 xl:px-12'; const tab = new URLSearchParams(search).get('tab'); const tabCount = Object.values(systemControlPermissions).filter(permission => hasPermission(role, permission)).length + (role === 'admin' ? 2 : 0); content = <><Panel className="max-w-[96rem]"><Lines count={2} /><div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">{repeat(tabCount, () => <Skeleton className="w-full" height="2.75rem" />)}</div></Panel><Panel className="max-w-[96rem]">{tab === 'accounts' || tab === 'freeze' ? <LedgerSkeleton /> : <FieldSkeleton count={4} />}</Panel></>; }
  else { kind = 'workspace'; content = <Panel><Lines count={5} /></Panel>; }
  return <Page data-skeleton-page={kind} className={className} aria-hidden="true">{kind !== 'ossa' && <Header actions={actions} centered={centered} />}{content}</Page>;
}
