import { useState } from 'react';
import { Eye, EyeOff, Settings, UsersRound } from 'lucide-react';
import { Organization, SchoolNode, UserProfile } from '../../types';
import { appData } from '../../lib/backend';
import { canManageOrganization } from '../../lib/organizations';
import OrganizationForm from './OrganizationForm';
import Button from '../ui/Button';
import ProfileAvatar from '../ui/ProfileAvatar';

export default function HierarchyOrganizations({ unit, profile, onChanged }: {
  unit: SchoolNode | null; profile: UserProfile; onChanged: () => void;
}) {
  const [editor, setEditor] = useState<Organization | null>(null);
  const organizations = (appData.getOrganizations?.() || []).filter(org => org.node_id === (unit?.id || null));
  const scopeName = unit?.name || 'General school';
  if (organizations.length === 0) return null;
  return <section aria-labelledby="hierarchy-organizations-heading" className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5 dark:border-amber-900/60 dark:bg-amber-950/10">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 id="hierarchy-organizations-heading" className="flex items-center gap-2 text-base font-bold text-brand-900 dark:text-white"><UsersRound size={20} className="shrink-0 text-amber-700 dark:text-amber-300" /> Organizations <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">{organizations.length}</span></h2>
        <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{unit ? `Organizations directly under ${scopeName}.` : 'School-wide organizations across all academic units.'}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Student memberships are separate from academic units and classroom enrollment.</p>
      </div>
    </div>
    {<div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{organizations.map(org => {
        const manager = canManageOrganization(profile, org);
        return <article key={org.id} className="min-w-0 rounded-xl border border-amber-200 bg-white p-4 dark:border-amber-900/60 dark:bg-slate-800">
          <div className="flex items-start gap-3"><ProfileAvatar src={org.logo_url} alt={`${org.name} logo`} className="h-12 w-12 shrink-0 rounded-xl object-cover" /><div className="min-w-0"><span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">Organization</span><h3 className="break-words font-bold text-brand-900 dark:text-white">{org.name}</h3></div></div>
          <p className="mt-3 line-clamp-2 break-words text-sm text-slate-600 dark:text-slate-300">{org.description || `An organization under ${scopeName}.`}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><span className="inline-flex items-center gap-1">{org.visible ? <Eye size={13} /> : <EyeOff size={13} />}{org.visible ? 'Public' : 'Hidden'}</span><span>· {org.joining === 'closed' ? 'Joining closed' : org.joining === 'approval' ? 'Applications open' : 'Open joining'}</span></div>
          <div className="mt-4 flex flex-wrap gap-2"><a href={`#/organizations/${org.id}`} className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-brand-900 dark:border-slate-600 dark:text-white">{manager ? 'Manage organization' : 'View organization'}</a>
            {manager && <Button aria-label={`Settings for ${org.name}`} size="sm" variant="secondary" onClick={() => setEditor(org)}><Settings size={16} /> Settings</Button>}</div>
        </article>;
      })}</div>}
    {editor && <OrganizationForm key={editor.id} profile={profile} organization={editor} initialNodeId={unit?.id || null} lockScope onClose={() => { setEditor(null); onChanged(); }} />}
  </section>;
}
