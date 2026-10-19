import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { SchoolNode } from '../../types';
import { findNodePath } from '../../lib/academicDirectory';
import { AcademicPathPicker } from './AcademicPathPicker';
import Button from '../ui/Button';

export default function ClosureUnitPicker({ roots, selected, onChange, disabled = false }: { roots: SchoolNode[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
 const [path, setPath] = useState<string[]>([]);
 const current = findNodePath(roots, path[path.length - 1] || '') || [];
 const candidate = current[current.length - 1]?.id;
 const covered = current.some(node => selected.includes(node.id));
 const label = (id: string) => (findNodePath(roots, id) || []).map(node => node.name).join(' / ') || id;
 return <fieldset className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
  <legend className="px-1 text-sm font-semibold">Affected academic units</legend>
  <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Follow the academic path, as in enrollment. Choose “All of” to include a unit and everything beneath it, then add the unit. You can add several paths.</p>
  <AcademicPathPicker roots={roots} value={path} allowParentSelection disabled={disabled} onChange={next => setPath(next.map(node => node.id))}/>
  {!roots.length && <p className="text-sm">No academic units are available within your assignment.</p>}
  <Button type="button" fullWidth={false} variant="secondary" disabled={disabled || !candidate || covered} onClick={() => { if (!candidate) return; onChange([...selected.filter(id => !findNodePath(roots, id)?.some(node => node.id === candidate)), candidate]); setPath([]); }}><Plus size={16}/>Add academic unit</Button>
  {candidate && !covered && <p className="text-xs text-gold-700 dark:text-gold-300">Click Add academic unit to include this selection.</p>}
  <div aria-label="Added academic units" className="flex flex-wrap gap-2">{selected.map(id => <span key={id} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-semibold dark:border-gold-800 dark:bg-gold-950/40"><span className="min-w-0 break-words">{label(id)}</span><button type="button" disabled={disabled} aria-label={`Remove ${label(id)}`} onClick={() => onChange(selected.filter(value => value !== id))}><X size={15}/></button></span>)}</div>
 </fieldset>;
}
