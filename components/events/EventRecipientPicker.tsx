import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { SchoolNode } from '../../types';
import { findNodePath } from '../../lib/academicDirectory';
import { recipientGroupLabel, recipientRoleOptions } from '../../lib/eventAudience';
import { AcademicPathPicker } from '../academic/AcademicPathPicker';
import Button from '../ui/Button';
import CustomSelect from '../ui/CustomSelect';

interface Props {
  roots: SchoolNode[];
  selected: string[];
  onChange: (groups: string[]) => void;
  onPendingChange?: (pending: boolean) => void;
}

export function EventRecipientPicker({ roots, selected, onChange, onPendingChange }: Props) {
  const [type, setType] = useState('directory');
  const [path, setPath] = useState<string[]>([]);
  // Resolve against the current directory, including after a backend refresh.
  const currentPath = findNodePath(roots, path[path.length - 1] || '') || [];
  const available = currentPath.length > 0 && currentPath.every(node => !node.metadata?.archived && node.metadata?.selectableForEvents !== false);
  const candidate = type === 'directory' ? (available ? `node:${currentPath[currentPath.length - 1].id}` : '') : type;
  const duplicate = selected.includes(candidate);
  useEffect(() => { onPendingChange?.(Boolean(candidate && !duplicate)); }, [candidate, duplicate, onPendingChange]);
  const add = () => {
    if (!candidate || duplicate) return;
    // Non-student roles can be combined with the existing all-students audience.
    onChange(candidate === 'All Students' ? [...selected.filter(group => group.startsWith('role:')), candidate]
      : [...selected.filter(group => candidate.startsWith('role:') || group !== 'All Students'), candidate]);
    setPath([]);
  };

  return <div className="min-w-0 space-y-4">
    <CustomSelect label="Recipient type" value={type} onChange={value => { setType(value as string); setPath([]); }} options={[
      { value: 'directory', label: 'School unit or group' },
      ...recipientRoleOptions(),
    ]} />
    {type === 'directory' && <fieldset className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <legend className="px-1 text-sm font-semibold">Choose recipient unit</legend>
      <AcademicPathPicker roots={roots} value={path} purpose="events" allowParentSelection onChange={next => setPath(next.map(node => node.id))} />
      {!roots.some(node => !node.metadata?.archived && node.metadata?.selectableForEvents !== false) && <p className="text-sm text-slate-500">No school units are available.</p>}
      {candidate && <p className="text-xs text-slate-600 dark:text-slate-300">Recipient: <strong>{recipientGroupLabel(candidate, roots)}</strong>. Includes everyone in this unit and its sub-units.</p>}
    </fieldset>}
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" disabled={!candidate || duplicate} onClick={add}><Plus size={16} /> Add recipient</Button>
      {duplicate && <p className="text-xs text-slate-500">This recipient is already added.</p>}
      {candidate && !duplicate && <p className="text-sm text-amber-700">Click Add recipient to include this selection before continuing.</p>}
    </div>
    <div aria-label="Added event recipients" role="status" className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-wrap gap-2">
        {selected.map(group => <span key={group} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-semibold text-brand-900 dark:border-gold-800 dark:bg-gold-950/40 dark:text-gold-200">
          <span className="min-w-0 break-words">{recipientGroupLabel(group, roots)}</span>
          <button type="button" aria-label={`Remove ${recipientGroupLabel(group, roots)}`} className="shrink-0 rounded-full p-1 hover:bg-gold-100 dark:hover:bg-gold-900" onClick={() => onChange(selected.filter(item => item !== group))}><X size={15} /></button>
        </span>)}
        {!selected.length && <p className="text-sm text-slate-500">No recipients added yet.</p>}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{selected.length} {selected.length === 1 ? 'recipient' : 'recipients'} added</p>
    </div>
  </div>;
}
