import type { AppEvent } from '../types';
import { formatManilaDateTime } from './dateTime';

/** Match the server's preparation window without relaxing its authorization checks. */
export function offlineRosterUnavailableReason(event: AppEvent, now = Date.now()): string | undefined {
  if (event.isGeneralEvent) return 'Select a specific attendance event to download its roster.';
  if (event.cancellationStatus) return 'This event is cancelled. Its offline roster is unavailable.';
  if (event.approvalStatus === 'pending') return 'This event needs approval before its offline roster can be downloaded.';
  if (event.approvalStatus === 'rejected') return 'This event was rejected. Its offline roster is unavailable.';
  if (!Number.isFinite(event.startTime) || !Number.isFinite(event.endTime)) return 'This event needs a valid start and end time before its roster can be downloaded.';
  if (event.status === 'done' || event.endTime < now) return 'This event has ended. Its offline roster is unavailable.';
  if (event.startTime > now + 86400000) return `Offline roster download opens ${formatManilaDateTime(event.startTime - 86400000)} (24 hours before this event starts).`;
  return undefined;
}
