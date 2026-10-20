import type { UnitDeletionRecord } from './unitDeletion';

export type DeletionBranch = { record: UnitDeletionRecord; children: DeletionBranch[]; keys: string[] };

/** Each record appears once. Records spanning multiple units sit at their common ancestor. */
export function buildDeletionHierarchy(records: UnitDeletionRecord[], rootId: string): DeletionBranch[] {
  const entries = new Map(records.map(record => [record.key, { record, children: [], keys: [] } as DeletionBranch]));
  const units = new Map(records.filter(record => record.kind === 'unit').map(record => [record.id, record]));
  const path = (id: string) => {
    const ids: string[] = []; const seen = new Set<string>();
    while (units.has(id) && !seen.has(id)) {
      seen.add(id); ids.unshift(id);
      if (id === rootId) break;
      id = units.get(id)!.nodeIds[0];
    }
    return ids;
  };
  const roots: DeletionBranch[] = [];
  for (const entry of entries.values()) {
    const record = entry.record;
    let parentId: string | undefined;
    if (record.kind === 'unit') parentId = record.id === rootId ? undefined : record.nodeIds[0];
    else {
      const paths = [...new Set(record.nodeIds)].filter(id => units.has(id)).map(path);
      parentId = paths[0]?.filter((id, index) => paths.every(ids => ids[index] === id)).at(-1) || rootId;
    }
    const parent = entries.get(`unit:${parentId}`);
    if (parent && parent !== entry && !path(parent.record.id).includes(record.id)) parent.children.push(entry);
    else roots.push(entry);
  }
  const collect = (branch: DeletionBranch): string[] => {
    branch.children.sort((a, b) => Number(b.record.kind === 'unit') - Number(a.record.kind === 'unit') || a.record.name.localeCompare(b.record.name, undefined, { numeric: true }));
    branch.keys = [branch.record.key, ...branch.children.flatMap(collect)];
    return branch.keys;
  };
  roots.forEach(collect);
  return roots;
}

export function selectDeletionBranch(selected: Set<string>, branch: DeletionBranch, records: UnitDeletionRecord[], include: boolean, rootId: string) {
  const next = new Set(selected);
  const allowed = new Set(records.filter(record => record.canDelete).map(record => record.key));
  for (const key of branch.keys) {
    if (key === `unit:${rootId}`) { next.add(key); continue; }
    if (include && allowed.has(key)) next.add(key);
    else if (!include) next.delete(key);
  }
  return next;
}
