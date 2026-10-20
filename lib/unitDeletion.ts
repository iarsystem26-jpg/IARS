export type UnitDeletionRecord = {
  key: string;
  kind: 'unit' | 'account' | 'event' | 'organization' | 'calendar' | 'clearance' | 'closure';
  id: string;
  name: string;
  detail: string;
  nodeIds: string[];
  destinationType: string | null;
  canDelete: boolean;
  blockedReason: string | null;
};
export type UnitDeletionPreview = {
  version: string;
  records: UnitDeletionRecord[];
  destinations: { id: string; name: string; type: string }[];
};
export type UnitDeletionPlan = { version: string; deleteKeys: string[]; transfers: Record<string, string> };
export type UnitDeletionConfirmation = { typedAction: string; typedName: string; reason: string };
export type UnitDeletionAccess = {
  preview: UnitDeletionPreview;
  expiresAt: number;
  reload: () => Promise<UnitDeletionPreview>;
  confirm: (confirmation: UnitDeletionConfirmation, plan: UnitDeletionPlan) => Promise<unknown>;
  close: () => Promise<void>;
};

export function needsUnitTransfer(record: UnitDeletionRecord, selected: Set<string>) {
  return !selected.has(record.key) && record.nodeIds.some(id => selected.has(`unit:${id}`));
}

export function availableUnitDestinations(record: UnitDeletionRecord, preview: UnitDeletionPreview) {
  return preview.destinations.filter(node => !record.destinationType || node.type === record.destinationType
    || (record.destinationType === 'class' && ['section', 'block'].includes(node.type)));
}
