import { SchoolNode } from '../../types';
import { findNodePath } from '../../lib/academicDirectory';
import { AcademicPathPicker } from './AcademicPathPicker';

interface Props {
  roots: SchoolNode[];
  value: string;
  onChange: (unitId: string) => void;
}

export default function AssignedUnitPicker({ roots, value, onChange }: Props) {
  const path = value ? findNodePath(roots, value) || [] : [];
  const selected = path[path.length - 1];
  const hasChildren = selected?.children?.some(node => !node.metadata?.archived);

  return <fieldset className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <legend className="px-1 text-sm font-semibold">Assigned unit</legend>
    <p className="text-xs text-slate-500 dark:text-slate-400">Start with a general unit, then choose a unit beneath it to narrow the assignment. Choose “All of” to keep the parent unit and everything under it.</p>
    <AcademicPathPicker roots={roots} value={path.map(node => node.id)} allowParentSelection onChange={next => onChange(next[next.length - 1]?.id || '')} />
    {!roots.some(node => !node.metadata?.archived) && <p className="text-sm text-slate-500">No units are available for assignment.</p>}
    {selected && <p className="text-xs text-slate-600 dark:text-slate-300">Assignment: <strong>{selected.name}</strong>. {hasChildren ? 'Includes all units beneath it.' : 'This unit has no sub-units; it is the final assignment.'}</p>}
  </fieldset>;
}
