import { AppEvent, ExcuseApplication } from '../types';

export const DEFAULT_EXCUSE_WINDOW_DAYS = 3;
export const MAX_EXCUSE_WINDOW_DAYS = 30;
export const EXCUSE_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

export function excuseDeadline(event: Pick<AppEvent, 'endTime' | 'excuseWindowDays'>) {
  return event.endTime + (event.excuseWindowDays ?? DEFAULT_EXCUSE_WINDOW_DAYS) * 86400000;
}

export function excuseBlockReason(event: AppEvent, applications: ExcuseApplication[], uid: string, frozen: boolean, now = Date.now()): string {
  if (event.isGeneralEvent || event.cancellationStatus || ['service', 'merit'].includes(event.kind || '')) return 'Excuses are unavailable for this activity.';
  if (['pending', 'rejected'].includes(event.status) || ['pending', 'rejected'].includes(event.approvalStatus || '')) return 'This activity has not been approved.';
  const existing = applications.find(application => application.event_id === event.id && application.student_uid === uid && ['pending', 'approved'].includes(application.status));
  if (existing) return existing.status === 'approved' ? 'Your excuse has already been approved.' : 'Your excuse is pending OSSA review.';
  if (frozen) return 'Excuse submissions are temporarily frozen. Contact OSSA.';
  if (!Number.isFinite(excuseDeadline(event)) || now > excuseDeadline(event)) return 'The excuse submission window has closed. Contact OSSA for exceptional cases.';
  return '';
}

export function excuseFileError(file: File | null): string {
  if (!file) return 'Attach an excuse letter or supporting document.';
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) return 'Choose a non-empty PDF, JPG, PNG, or WebP file up to 5 MB.';
  return '';
}
