import { educationalUnit } from '../../lib/educationalUnit';
import { hierarchyPathForRole } from '../../lib/workspaceRoutes';
import AttendanceConfirmation from '../attendance/AttendanceConfirmation';
import { formatManilaDate } from '../../lib/dateTime';
import ProfileAvatar from './ProfileAvatar';
import type { AppPermission } from '../../types';
import { appData } from '../../lib/backend';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Award, BarChart3, Building2, Calendar, CalendarPlus, ChevronDown, ChevronRight, FileText,
  LayoutDashboard, Menu, PanelLeftClose, QrCode,
  ScanLine, ShieldCheck, Sliders, User, X,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { ThemeToggle } from './ThemeToggle';
import { Collapsible } from './Collapsible';
import { hasPermission, roleLabels } from '../../lib/accessControl';
import { FreezeBanner } from '../admin/FreezeBanner';
import FrozenAccess from '../admin/FrozenAccess';
import { Notifications } from './Notifications';

const mobileDrawerId = 'mobile-main-navigation';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isMock } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('iars.sidebar.collapsed') === 'true'; }
    catch { return false; }
  });
  const [desktopNotificationContainer, setDesktopNotificationContainer] = useState<HTMLDivElement | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const drawerWasOpen = useRef(false);
  const [, setFreezeRevision] = useState(0);
  useEffect(() => {
    const update = () => setFreezeRevision(value => value + 1);
    window.addEventListener('rmc_data_update', update);
    return () => window.removeEventListener('rmc_data_update', update);
  }, []);
  const frozen = appData.isUserScopeFrozen(profile);

  useEffect(() => {
    try { localStorage.setItem('iars.sidebar.collapsed', String(isSidebarCollapsed)); }
    catch { /* Navigation still works when browser storage is unavailable. */ }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname, frozen]);

  useEffect(() => {
    const desktopViewport = window.matchMedia('(min-width: 768px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setIsMobileMenuOpen(false);
    };

    if (desktopViewport.matches) setIsMobileMenuOpen(false);
    desktopViewport.addEventListener('change', closeOnDesktop);
    return () => desktopViewport.removeEventListener('change', closeOnDesktop);
  }, []);

  useLayoutEffect(() => {
    if (!isMobileMenuOpen || frozen) {
      if (drawerWasOpen.current) mobileMenuButtonRef.current?.focus();
      drawerWasOpen.current = false;
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };

    drawerWasOpen.current = true;
    document.body.classList.add('app-scroll-lock');
    window.addEventListener('keydown', closeOnEscape);
    mobileDrawerRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
    return () => {
      document.body.classList.remove('app-scroll-lock');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMobileMenuOpen, frozen]);

  const trapDrawerFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;

    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.tabIndex >= 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const role = profile?.role || '';
  const hierarchyPath = hierarchyPathForRole(role);
  const navItems = [
  { label: 'Organizations', icon: Building2, path: '/organizations', roles: [] },
  {
    label: 'OSSA Hub',
    icon: Building2,
    path: '/ossa/dashboard',
    permissionAny: ['ossa.manage_cases', 'events.approve'],
    roles: ['ossa', 'ossa_staff']
  },

  {
    label: 'Home',
    icon: LayoutDashboard,
    path: '/dashboard',
    roles: [
      'student',
      'mayor',
      'ssg',
      'admin',
      'ossa',
      'ossa_staff'
    ]
  },

  {
    label: 'My QR',
    icon: QrCode,
    path: '/student/qr',
    roles: [
      'student',
      'mayor',
      'ssg'
    ]
  },

  {
    label: 'My Calendar', icon: Calendar, path: '/student/calendar', permission: 'calendar.view', roles: []
  },
  {
    label: 'Events',
    icon: Calendar,
    path: '/student/events',
    roles: [
      'student',
      'mayor',
      'ssg'
    ]
  },

  {
    label: 'Ceremonies',
    icon: Award,
    path: '/student/ceremonies',
    roles: [
      'student',
      'mayor',
      'ssg',
      'admin',
      'ossa',
      'ossa_staff'
    ]
  },

  {
    label: 'Records',
    icon: FileText,
    path: '/student/records',
    roles: [
      'student',
      'mayor',
      'ssg'
    ]
  },

  {
    label: 'Attendance Scanner',
    icon: ScanLine,
    path: '/mayor/scan',
    permission: 'attendance.scan',
    roles: [
      'mayor',
      'ssg',
      'admin',
      'ossa',
      'ossa_staff'
    ]
  },

  {
    label:
      role === 'admin'
        ? 'School Hierarchy'
        : role === 'ossa' || role === 'ossa_staff'
        ? 'OSSA Hierarchy'
        : role === 'mayor'
        ? 'My Classroom'
        : 'SSG Panel',

    icon: ShieldCheck,

    path: hierarchyPath,

    permissionAny: [
      'directory.manage_structure',
      'directory.manage_members',
      'directory.transfer_students',
      'attendance.scan',
      'events.manage'
    ],

    roles: [
      'mayor',
      'ssg',
      'admin',
      'ossa',
      'ossa_staff'
    ]
  },

  {
    label: 'Event Management',
    icon: CalendarPlus,
    path: '/ssg/events',
    permission: 'events.manage',
    roles: [
      'ssg',
      'admin',
      'ossa'
    ]
  },

  {
    label: 'System Controls',
    icon: Sliders,
    path: '/admin/controls',
    permissionAny: [
      'system.manage_accounts',
      'system.manage_rbac',
      'system.health',
      'system.freeze',
      'system.payment_reminders'
    ],
    roles: [
      'admin'
    ]
  },
];
  const identityLabel = role === 'student' || role === 'mayor' ? 'Student ID' : 'Official ID';
  const allowedNavItems = navItems.filter((item) => {

  if (!profile?.role) {
    return false;
  }

  const userRole = profile.role;
  if (item.path === '/organizations' && hasPermission(userRole, 'directory.manage_structure')) return false;


  // Permission-based navigation follows the same precedence as ProtectedRoute.
  if (
    item.roles &&
    item.roles.length > 0 &&
    !item.permission &&
    !(item as any).permissionAny &&
    !item.roles.includes(userRole) && !(item.path === hierarchyPath && hasPermission(userRole, 'directory.transfer_students'))
  ) {
    return false;
  }


  // Check single permission
  if (item.permission) {
    return hasPermission(
      userRole,
      item.permission as AppPermission
    );
  }


  // Check multiple permissions
  if ((item as any).permissionAny) {

    return (item as any).permissionAny.some(
      (permission: AppPermission) =>
        hasPermission(
          userRole,
          permission
        )
    );

  }


  return true;

});
  const hasDirectory = hasPermission(profile?.role, 'attendance.manage');
  const canViewAttendance = hasPermission(profile?.role, 'attendance.manage');

  const navigateAndClose = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const navButtonClass = (isActive: boolean, compact = false) => (
    `app-nav-link w-full min-h-11 flex items-center gap-4 rounded-xl ${
      compact ? 'justify-center px-2 py-3' : 'px-4 py-3.5'
    } ${isActive ? 'bg-gold-400 text-brand-900 shadow-lg font-bold' : 'text-gold-100 hover:bg-brand-800'}`
  );

  const renderDirectory = (mobile = false) => {
    const controlsId = mobile ? 'mobile-directory-links' : 'desktop-directory-links';
    const itemClass = (path: string) => `app-nav-link w-full min-h-11 flex items-center gap-3 p-3 rounded-xl border ${
      location.pathname === path
        ? 'bg-white/10 text-white font-bold border border-white/10 shadow-sm'
        : 'border-transparent text-gold-100/70 hover:bg-brand-800 hover:text-white'
    }`;

    if (!hasDirectory) return null;
    return (
      <div className="pt-4 mt-4 border-t border-brand-800/80">
        <button
          type="button"
          aria-label="Toggle directory navigation"
          aria-expanded={isDirectoryOpen}
          aria-controls={controlsId}
          onClick={() => setIsDirectoryOpen((open) => !open)}
          className="w-full min-h-11 flex items-center justify-between px-3 py-3 text-gold-400/70 hover:text-gold-400 transition-colors uppercase text-[10px] font-black tracking-widest"
        >
          <span>{role === 'ssg' ? 'Directory' : 'Admin'}</span>
          <ChevronDown size={14} className="app-disclosure-chevron" />
        </button>
        <Collapsible id={controlsId} open={isDirectoryOpen} innerClassName="space-y-1 pl-2">
            {canViewAttendance && (
              <button
                type="button"
                aria-current={location.pathname === '/admin/attendance' ? 'page' : undefined}
                onClick={() => mobile ? navigateAndClose('/admin/attendance') : navigate('/admin/attendance')}
                className={itemClass('/admin/attendance')}
              >
                <BarChart3 size={18} />
                <span className="text-xs">Attendance</span>
              </button>
            )}
            {role === 'admin' && (
              <button
                type="button"
                aria-current={location.pathname.startsWith('/admin/controls') ? 'page' : undefined}
                onClick={() => mobile ? navigateAndClose('/admin/controls') : navigate('/admin/controls')}
                className={itemClass('/admin/controls')}
              >
                <Sliders size={18} />
                <span className="text-xs">System Controls</span>
              </button>
            )}
        </Collapsible>
      </div>
    );
  };

  if (frozen) return <main className="min-h-dvh"><FrozenAccess /></main>;

  return (
    <div className={`app-sidebar-layout min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row transition-[padding] duration-base ease-standard ${
      isSidebarCollapsed ? 'md:pl-20' : 'md:pl-64'
    }`}>
      <header className="md:hidden sticky top-0 z-40 min-h-14 bg-brand-900 text-white px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <button
            ref={mobileMenuButtonRef}
            type="button"
            aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={isMobileMenuOpen}
            aria-controls={mobileDrawerId}
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-gold-100 hover:bg-brand-800 transition-colors"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2.5 select-none">
            <img src={educationalUnit.logoUrl} alt="Institution logo" className="w-8 h-8 object-contain shrink-0" />
            <h1 className="font-extrabold text-base tracking-tight text-white">IARS</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className="min-h-11 min-w-11" />
          {isMock && <span className="text-[8px] bg-gold-400/20 text-gold-400 px-2 py-0.5 rounded-full font-extrabold tracking-wider">LOCAL TEST</span>}
          <Notifications desktopContainer={desktopNotificationContainer} desktopCollapsed={isSidebarCollapsed} />
          <AttendanceConfirmation />
        </div>
      </header>

      {isMobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          className="app-navigation-backdrop fixed inset-0 z-40 bg-brand-950/70 backdrop-blur-sm md:hidden"
        />
      )}

      {isMobileMenuOpen && (
        <aside
          ref={mobileDrawerRef}
          id={mobileDrawerId}
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
          onKeyDown={trapDrawerFocus}
          className="app-navigation-drawer fixed inset-y-0 left-0 z-50 w-72 max-w-[calc(100vw-env(safe-area-inset-left))] bg-brand-900 text-white border-r border-brand-800 shadow-2xl md:hidden flex flex-col pl-[env(safe-area-inset-left)]"
        >
          <div className="shrink-0 p-5 pt-[max(1.25rem,env(safe-area-inset-top))] border-b border-brand-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <img src={educationalUnit.logoUrl} alt="Institution logo" className="w-10 h-10 object-contain shrink-0" />
              <div><h2 className="font-extrabold text-xl leading-none">IARS</h2><p className="text-emerald-400 text-[10px] font-semibold uppercase tracking-wider mt-1">{educationalUnit.name || 'Attendance & Records'}</p></div>
            </div>
            <button type="button" aria-label="Close navigation" onClick={() => setIsMobileMenuOpen(false)} className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-gold-200 hover:text-white hover:bg-brand-800">
              <X size={20} />
            </button>
          </div>
          <nav aria-label="Main navigation" className="min-h-0 flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
            {allowedNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || (item.path === '/ossa/dashboard' && location.pathname.startsWith('/ossa/dashboard/')) || (item.path === hierarchyPath && (location.pathname === '/ssg/transfers' || location.pathname.startsWith(`${hierarchyPath}/students/`))) || (item.path === hierarchyPath && location.pathname.startsWith('/organizations/') && hasPermission(role, 'directory.manage_structure'));
              return <button type="button" key={item.path} aria-current={isActive ? 'page' : undefined} onClick={() => navigateAndClose(item.path)} className={navButtonClass(isActive)}><Icon size={22} /><span className="font-medium text-sm">{item.label}</span></button>;
            })}
            {renderDirectory(true)}
          </nav>
          <div className="shrink-0 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-brand-800 space-y-3">
            <div className="flex items-center justify-between px-1"><span className="text-[10px] font-black uppercase tracking-widest text-gold-400/80">Appearance</span><ThemeToggle size="sm" className="min-h-11 min-w-11" /></div>
            <button type="button" aria-label="View profile" onClick={() => navigateAndClose('/student/profile')} className="w-full min-h-14 group flex items-center gap-3 p-3 rounded-2xl bg-brand-950/80 border border-gold-400/30 hover:border-gold-400/60 transition-all text-left">
              <ProfileAvatar src={profile?.photo_url || '/avatar-placeholder.svg'} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-gold-400" />
              <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white truncate">{profile?.name || 'Account'}</span><span className="block text-[10px] font-semibold text-white/80 truncate" title={roleLabels[role] || role}>{roleLabels[role] || role}</span><span className="block text-[10px] text-gold-400 font-mono font-bold truncate">{identityLabel}: {profile?.student_id || 'Not assigned'}</span></span><User size={18} className="text-gold-400 shrink-0" />
            </button>
          </div>
        </aside>
      )}

      <aside id="desktop-main-navigation" data-collapsed={isSidebarCollapsed} className={`app-desktop-sidebar hidden md:flex flex-col fixed inset-y-0 left-0 z-30 bg-brand-900 text-white border-r border-brand-800 shadow-2xl transition-[width] duration-base ease-standard ${isSidebarCollapsed ? 'w-20' : 'w-64'}`}>
        <div className={`relative shrink-0 p-4 border-b border-brand-800 flex items-center justify-between ${isSidebarCollapsed ? 'overflow-visible' : 'overflow-hidden'}`}>
          <div className="flex items-center gap-3 min-w-0"><img src={educationalUnit.logoUrl} alt="Institution logo" className="w-10 h-10 object-contain shrink-0" /><div aria-hidden={isSidebarCollapsed} className="app-sidebar-label min-w-0 truncate"><h2 className="font-extrabold text-lg leading-tight">IARS</h2><p className="text-emerald-400 text-[10px] font-semibold uppercase tracking-wider truncate" title={educationalUnit.name}>{educationalUnit.name || 'Attendance & Records'}</p></div></div>
          {!isSidebarCollapsed ? (
            <button type="button" aria-label="Collapse sidebar" title="Collapse sidebar" aria-expanded={true} aria-controls="desktop-main-navigation" onClick={() => setIsSidebarCollapsed(true)} className="min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center rounded-lg text-gold-200 hover:text-white hover:bg-brand-800"><PanelLeftClose size={18} /></button>
          ) : (
            <button type="button" aria-label="Expand sidebar" title="Expand sidebar" aria-expanded={false} aria-controls="desktop-main-navigation" onClick={() => setIsSidebarCollapsed(false)} className="absolute right-0 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-gold-400/50 bg-brand-900 text-gold-300 shadow-md transition-colors hover:bg-brand-800 hover:text-white"><ChevronRight size={15} strokeWidth={2.5} /></button>
          )}
        </div>
        <div ref={setDesktopNotificationContainer} className="shrink-0 px-3 pt-3" />
        <nav aria-label="Desktop navigation" className="min-h-0 flex-1 p-3 mt-2 space-y-2 overflow-y-auto custom-scrollbar">
          {allowedNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path === '/ossa/dashboard' && location.pathname.startsWith('/ossa/dashboard/')) || (item.path === hierarchyPath && (location.pathname === '/ssg/transfers' || location.pathname.startsWith(`${hierarchyPath}/students/`))) || (item.path === hierarchyPath && location.pathname.startsWith('/organizations/') && hasPermission(role, 'directory.manage_structure'));
            return <button type="button" key={item.path} aria-label={item.label} title={isSidebarCollapsed ? item.label : undefined} aria-current={isActive ? 'page' : undefined} onClick={() => navigate(item.path)} className={`app-sidebar-link ${navButtonClass(isActive, isSidebarCollapsed)}`}><Icon size={22} className="shrink-0" /><span aria-hidden={isSidebarCollapsed} className="app-sidebar-label truncate font-medium text-sm">{item.label}</span></button>;
          })}
          {isSidebarCollapsed && hasDirectory ? <div className="pt-4 mt-4 border-t border-brand-800/80 space-y-2">{canViewAttendance && <button type="button" aria-label="Attendance dashboard" aria-current={location.pathname === '/admin/attendance' ? 'page' : undefined} onClick={() => navigate('/admin/attendance')} className={navButtonClass(location.pathname === '/admin/attendance', true)}><BarChart3 size={22} /></button>}{role === 'admin' && <button type="button" aria-label="System Controls" aria-current={location.pathname.startsWith('/admin/controls') ? 'page' : undefined} onClick={() => navigate('/admin/controls')} className={navButtonClass(location.pathname.startsWith('/admin/controls'), true)}><Sliders size={22} /></button>}</div> : renderDirectory()}
        </nav>
        <div className="shrink-0 p-3 border-t border-brand-800 space-y-2.5">
          {!isSidebarCollapsed ? <><div className="flex items-center justify-between px-1"><span className="text-[10px] font-black uppercase tracking-widest text-gold-400/80">Theme Mode</span><ThemeToggle size="sm" className="min-h-11 min-w-11" /></div><button type="button" aria-label="View profile" onClick={() => navigate('/student/profile')} className="w-full min-h-14 group flex items-center gap-3 p-2.5 rounded-2xl bg-brand-950/80 hover:bg-brand-800/90 border border-gold-400/30 hover:border-gold-400/60 transition-all text-left"><ProfileAvatar src={profile?.photo_url || '/avatar-placeholder.svg'} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-gold-400/70" /><span className="min-w-0 flex-1"><span className="block text-xs font-extrabold text-white truncate">{profile?.name || 'Account'}</span><span className="block text-[10px] font-semibold text-white/80 truncate" title={roleLabels[role] || role}>{roleLabels[role] || role}</span><span className="block text-[10px] font-mono font-bold text-gold-400/90 truncate">{identityLabel}: {profile?.student_id || 'Not assigned'}</span></span><User size={16} className="text-gold-400/80 shrink-0" /></button></> : <div className="flex flex-col items-center gap-2.5"><ThemeToggle size="sm" className="min-h-11 min-w-11" /><button type="button" aria-label="View profile" onClick={() => navigate('/student/profile')} className="min-h-11 min-w-11 relative rounded-full ring-2 ring-gold-400/70"><ProfileAvatar src={profile?.photo_url || '/avatar-placeholder.svg'} alt="" className="w-10 h-10 rounded-full object-cover" /></button></div>}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
      {!frozen && <FreezeBanner />}
      {['ossa', 'ossa_staff'].includes(role) && appData.getPaymentInfo().reminders.slice(0, 1).map(reminder => <div key={reminder.id} role="status" className="border-b border-amber-200 bg-amber-50 p-4 text-amber-950"><strong>{reminder.subject}</strong><p className="mt-1 whitespace-pre-line text-sm">{reminder.message}</p><p className="mt-1 text-xs">Payment due: {formatManilaDate(appData.getPaymentInfo().dueDate)}</p></div>)}

      <main className="min-w-0 flex-1 overflow-x-hidden"><div key={location.pathname} className="app-route-enter">{children}</div></main>
      </div>
    </div>
  );
};

export default Layout;
