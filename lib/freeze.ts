import { appData } from './backend';
import type { UserProfile } from '../types';

/** Resolve the actual frozen ancestor, including an official's assigned unit. */
export function getFreezeDetails(profile: UserProfile | null) {
  if (profile?.account_freeze?.isFrozen) return { ...profile.account_freeze, scope: 'Your account', global: false, account: true };
  const system = appData.getSystemFreezeStatus();
  if (system.isFrozen) return { ...system, scope: 'Entire school system', global: true, account: false };
  const assignments = [profile?.school_data?.academic_assignment?.terminalGroupId, profile?.official_data?.assignment_node_id];
  for (const id of assignments) {
    if (!id) continue;
    for (const node of appData.getSchoolNodePath(id)) {
      const freeze = appData.getNodeFreezeStatus(node.id);
      if (freeze?.isFrozen) return { ...freeze, scope: node.name, global: false, account: false };
    }
  }
  return null;
}
