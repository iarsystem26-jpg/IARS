import AdminDriveFolders from '../components/admin/AdminDriveFolders';
import { RoleAssignment } from '../components/admin/RoleAssignment';
import { hasPermission } from '../lib/accessControl';
import { canAccessSystemControls, systemControlPermissions } from '../lib/systemControlsAccess';
import React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { legalLinks } from '../lib/legal';
import { Snowflake, Activity, DollarSign, ShieldCheck, Shield, Users, Video, RefreshCw, ChevronRight, FolderOpen } from 'lucide-react';
import { useAuth } from '../components/AuthContext';
import { Page, PageHeader, Surface } from '../components/ui/Page';
import CustomSelect from '../components/ui/CustomSelect';
import { AdminFreezeView } from '../components/admin/AdminFreezeView';
import { AdminSystemHealthView } from '../components/admin/AdminSystemHealthView';
import { AdminPaymentReminderView } from '../components/admin/AdminPaymentReminderView';
import { AdminRBACRoleView } from '../components/admin/AdminRBACRoleView';
import { AdminAccountView } from '../components/admin/AdminAccountView';
import LegalPage from './LegalPage';
import AdminHomepageVideoView from '../components/admin/AdminHomepageVideoView';
import AdminAppUpdates from '../components/admin/AdminAppUpdates';
import AdminEnrollmentConfirmation from '../components/admin/AdminEnrollmentConfirmation';
import AdminEmailDashboard from '../components/admin/AdminEmailDashboard';
import { LegalKind } from '../lib/legalPages';

type TabId = 'drive' | 'freeze' | 'health' | 'payment' | 'rbac' | 'accounts' | 'legal' | 'video' | 'updates' | 'enrollment' | 'email';

const subPages: { id: TabId; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'drive', label: 'Drive folders', icon: FolderOpen, description: 'Organize uploads and manage this educational unit’s folders' },
  { id: 'email', label: 'Email', icon: ShieldCheck, description: 'Monitor delivery, preview emails, manage the queue and configure enrollment verification' },
  { id: 'updates', label: 'App Updates', icon: RefreshCw, description: 'Keep connected browsers on the latest deployed app' },
  { id: 'freeze', label: 'Freeze Controls', icon: Snowflake, description: 'Manage institutional and node-level system freezes' },
  { id: 'health', label: 'System Health', icon: Activity, description: 'Monitor system performance, database status, and audit logs' },
  { id: 'payment', label: 'Payments', icon: DollarSign, description: 'Manage subscription reminders and billing statuses' },
  { id: 'rbac', label: 'RBAC Roles', icon: ShieldCheck, description: 'Configure custom roles and institutional permissions' },
  { id: 'accounts', label: 'Accounts', icon: Users, description: 'Create managed accounts, review profiles, and manage passwords' },
  { id: 'video', label: 'Homepage Video', icon: Video, description: 'Choose and preview the video shown on the public homepage' },
  { id: 'legal', label: 'Legal pages', icon: Shield, description: 'Preview and edit the current saved legal pages' },
];

const navigationGroups: { label: string; pages: TabId[] }[] = [
  { label: 'Access & identity', pages: ['email', 'accounts', 'rbac'] },
  { label: 'System operations', pages: ['drive', 'updates', 'freeze', 'health', 'payment'] },
  { label: 'Public content', pages: ['video', 'legal'] },
];

const AdminControls: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const requested = new URLSearchParams(location.search).get('tab');
  const requestedTab = requested === 'enrollment' ? 'email' : requested;
  const activeTab = subPages.some(page => page.id === requestedTab) ? requestedTab as TabId : 'freeze';

  const tabPermissions = systemControlPermissions;
  const allowedPages = subPages.filter(page => (page.id === 'drive' || page.id === 'legal' || page.id === 'video' || page.id === 'updates' || page.id === 'enrollment' || page.id === 'email') ? profile?.role === 'admin' : hasPermission(profile?.role, tabPermissions[page.id]));
  const requestedPage = new URLSearchParams(location.search).get('page');
  const legalKinds: LegalKind[] = ['privacy', 'deletion', 'agreement', 'terms'];
  const legalKind = legalKinds.includes(requestedPage as LegalKind) ? requestedPage as LegalKind : 'privacy';
  const selectedTab = allowedPages.some(page => page.id === activeTab) ? activeTab : allowedPages[0]?.id;
  const activeSubPage = subPages.find((p) => p.id === selectedTab) || subPages[0];

  if (!canAccessSystemControls(profile?.role, location.search)) {
    return <Navigate to={profile?.role === 'ossa' || profile?.role === 'ossa_staff' ? '/ossa/dashboard' : '/dashboard'} replace />;
  }

  return (
    <Page className="operations-center mx-auto max-w-[96rem]">
      <PageHeader
        eyebrow="System Administration"
        title="Operations center"
        description="Manage access, keep the system running smoothly, and maintain your public content."
        className="max-w-[96rem]"
      />

      <Surface className="relative overflow-hidden !border-brand-800 !bg-brand-900 p-5 text-white sm:p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold-400/15 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-400/30 bg-gold-400/15 text-gold-300 shadow-md">
              <Shield size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-gold-300">System controls</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">{activeSubPage.label}</h2>
              <p className="mt-1 min-h-[4.5rem] text-sm leading-6 text-slate-300 sm:min-h-12 lg:min-h-6">{activeSubPage.description}</p>
            </div>
          </div>

        </div>
      </Surface>

      <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-6">
        <Surface className="p-3 sm:p-4">
          <CustomSelect
            className="sm:hidden"
            label="Control section"
            ariaLabel="Control section"
            value={selectedTab || ''}
            onChange={value => navigate(`/admin/controls?tab=${value}`)}
            options={navigationGroups.flatMap(group => group.pages.flatMap(id => {
              const page = allowedPages.find(page => page.id === id);
              return page ? [{ value: page.id, label: page.label, content: <span className="flex flex-col"><span>{page.label}</span><span className="app-dropdown-meta">{group.label}</span></span> }] : [];
            }))}
          />
          <nav aria-label="Admin control sub pages" className="hidden gap-5 sm:grid sm:grid-cols-3 lg:grid-cols-1">
            {navigationGroups.map(group => {
              const pages = group.pages.map(id => allowedPages.find(page => page.id === id)).filter((page): page is typeof subPages[number] => Boolean(page));
              if (!pages.length) return null;
              return <div key={group.label}>
                <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{group.label}</p>
                <div className="space-y-1">
                  {pages.map(({ id, label, icon: Icon }) => <Link
                    key={id}
                    to={`/admin/controls?tab=${id}`}
                    aria-current={selectedTab === id ? 'page' : undefined}
                    className="operations-nav-link flex min-h-11 items-center gap-2.5 px-3 py-2.5 text-sm font-semibold"
                  >
                    <Icon size={18} aria-hidden="true" className="shrink-0" />
                    <span className="min-w-0 flex-1">{label}</span>
                    {selectedTab === id && <ChevronRight size={16} aria-hidden="true" className="shrink-0" />}
                  </Link>)}
                </div>
              </div>;
            })}
          </nav>
        </Surface>

      <div className="min-w-0 space-y-5">

      {selectedTab === 'legal' && <Surface className="max-w-[96rem] space-y-3 p-6">
        <h2 className="text-xl font-bold">Legal pages</h2>
        <p className="text-sm text-[var(--color-text-muted)]">Open a saved page to preview it, then choose Edit page to make changes.</p>
        <nav aria-label="Legal pages" className="flex flex-wrap gap-3">{legalLinks.map((link, index) => <Link key={link.path} to={`/admin/controls?tab=legal&page=${legalKinds[index]}`} aria-current={legalKind === legalKinds[index] ? 'page' : undefined} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${legalKind === legalKinds[index] ? 'border-brand-900 bg-brand-900 text-white' : 'border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'}`}>{link.title}</Link>)}</nav>
        <LegalPage key={legalKind} kind={legalKind} adminPreview />
      </Surface>}

      <div className="max-w-[96rem]">
        {selectedTab === 'drive' && profile?.role === 'admin' && <AdminDriveFolders />}
        {selectedTab === 'freeze' && <AdminFreezeView actorName={profile?.name} />}
        {selectedTab === 'health' && <AdminSystemHealthView />}
        {selectedTab === 'payment' && <AdminPaymentReminderView actorName={profile?.name} />}
        {selectedTab === 'rbac' && <div className="space-y-6"><RoleAssignment /><AdminRBACRoleView actorName={profile?.name} /></div>}
        {selectedTab === 'accounts' && <AdminAccountView />}
        {selectedTab === 'video' && <AdminHomepageVideoView />}
        {selectedTab === 'updates' && profile?.role === 'admin' && <AdminAppUpdates />}
        {selectedTab === 'email' && profile?.role === 'admin' && <AdminEnrollmentConfirmation><AdminEmailDashboard /></AdminEnrollmentConfirmation>}
      </div>
      </div>
      </div>
    </Page>
  );
};

export default AdminControls;
