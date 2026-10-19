import knownErrors from './errorCatalog.json';

export type ErrorOwner = 'user' | 'school' | 'developer' | 'unknown';
export interface ClassifiedError { code: string; message: string; owner: ErrorOwner; reference?: string }
export const errorOwnerLabels: Record<ErrorOwner, string> = {
  user: 'You can resolve this', school: 'School staff can help',
  developer: 'Developer fix needed', unknown: 'Support needs to check this',
};
const item = (code: string, message: string, owner: ErrorOwner = 'user'): ClassifiedError => ({ code, message, owner });
export const commonErrors: ClassifiedError[] = [
  item('ATT-001', 'This QR code has expired or was replaced. Ask the student to open My QR, or present their latest downloaded ID.'),
  item('ATT-002', 'Attendance is already recorded for this session. Check the student’s Records before recording again.'),
  item('ATT-003', 'Attendance is closed for this session. Check the activity’s time-in and time-out schedule.'),
  item('ATT-004', 'The scanner cannot confirm the event location. Enable location access and move inside the event perimeter.'),
  item('ATT-005', 'Enter a reason for recording attendance manually.'),
  item('ATT-006', 'Attendance is saved on this device but is not confirmed yet. Reconnect and select Sync pending attendance. Keep the saved records on this device.'),
  item('EVENT-001', 'This activity needs OSSA approval before attendance can open. Ask an eligible OSSA reviewer to check it.', 'school'),
  item('EVENT-002', 'You cannot approve your own activity. Ask another eligible OSSA reviewer to review it.', 'school'),
  item('EVENT-003', 'This activity was cancelled. It cannot accept attendance or excuse requests.', 'school'),
  item('CASE-001', 'The excuse submission deadline has passed. Contact OSSA to ask about exceptional handling.', 'school'),
  item('CASE-002', 'You already have an excuse request for this activity. Open the existing request to check its status.'),
  item('CASE-003', 'The balance update could not be confirmed. Refresh Records and ask OSSA to check the balance before making another adjustment.', 'school'),
  item('ENROLL-001', 'The section enrollment key is incorrect. Ask your class manager for the current key.', 'school'),
  item('ENROLL-002', 'An application already exists for these details. Open Check enrollment progress or sign in to continue it.'),
  item('ORG-001', 'Joining could not be confirmed. Check the organization’s joining policy and your membership status before applying again.'),
  item('ORG-002', 'The transfer could not be confirmed. Refresh the roster and select an available destination class.', 'school'),
  item('AUTH-001', 'Sign-in could not be verified. Check your username or email and password, then sign in again.'),
  item('AUTH-002', 'Your current password is incorrect. Enter it again.'),
  item('AUTH-003', 'The security code is invalid or expired. Enter the latest authenticator code and check that your device time is automatic.'),
  item('FILE-001', 'The file could not be uploaded. Check the allowed file type and size shown beside the upload field, then choose the file again.'),
  item('FILE-002', 'The photo could not be read. Save it on your device and choose a JPG, PNG, or WebP photo up to 5 MB.'),
  item('FILE-003', 'The file is empty or could not be read. Save a complete copy on your device and choose it again.'),
  item('FREEZE-001', 'School administration has paused access. Contact your school officer about the freeze.', 'school'),
  item('ROSTER-001', 'Download the roster for an approved activity that is ongoing or starts within 24 hours.'),
  item('DEVICE-001', 'Camera or location access was blocked. Allow the requested permission in your browser’s site settings.'),
  item('DEVICE-002', 'The camera is unavailable or in use. Close other camera apps, reconnect the camera, and select it again.'),
  item('ACT-001', 'The action was cancelled. Start it again when you are ready.'),
  item('NET-001', 'The connection was interrupted. Reconnect, then check whether your change was saved before submitting again.'),
  item('NET-002', 'The server did not respond in time. Check whether your change was saved before retrying.'),
  item('LIMIT-001', 'Too many requests were sent. Wait a few minutes before trying again.'),
  item('ACCESS-001', 'Your account cannot perform this action. Ask a school administrator to check your permissions and assigned unit.', 'school'),
  item('DATA-001', 'A matching record already exists. Refresh the list and open the existing record.'),
  item('DATA-002', 'This record is unavailable. Refresh the list; it may have been removed or moved outside your access.'),
  item('INPUT-001', 'The server rejected the submitted details without naming the field. Keep your entries and report this code to support.', 'unknown'),
  item('SYS-001', 'The result of this request could not be confirmed. Check the latest records before repeating it. If it continues, send the code and reference to support.', 'unknown'),
  item('SYS-002', 'This feature’s server update is missing. Send this code to technical support so the developer can update the backend.', 'developer'),
  item('SYS-003', 'The app and server are using different data definitions. Send this code to technical support so the developer can fix the deployment.', 'developer'),
  item('SYS-004', 'The app encountered a programming error. Send this code to technical support with the screen and action you were using.', 'developer'),
];
export const errorCatalog: ClassifiedError[] = [...commonErrors, ...knownErrors.map(({ code, message, owner }) => ({ code, message, owner: owner as ErrorOwner }))];
const byCode = new Map(errorCatalog.map(error => [error.code, error]));
const byMessage = new Map(knownErrors.map(error => [error.source.trim().toLowerCase(), byCode.get(error.code)!]));
for (const error of commonErrors) byMessage.set(error.message.toLowerCase(), error);
for (const [message, code] of [
  ['Prepare an approved ongoing event or one starting within 24 hours.', 'ROSTER-001'],
  ['Attendance is frozen for your unit.', 'FREEZE-001'],
  ['Operations are frozen for this school or class.', 'FREEZE-001'],
  ['Enrollment is frozen.', 'FREEZE-001'],
  ['Enrollment is frozen for this section.', 'FREEZE-001'],
  ['Your school is frozen.', 'FREEZE-001'],
  ['Connection interrupted', 'NET-001'],
  ['permission denied', 'ACCESS-001'],
  ['Invalid or expired QR code.', 'ATT-001'],
  ['Unable to read this image. Save the photo to your phone, then choose it again.', 'FILE-002'],
]) byMessage.set(message.toLowerCase(), byCode.get(code)!);
const patterns = knownErrors.filter(error => error.source.includes('{value}') && error.source.replaceAll('{value}', '').trim().length >= 15).map(error => ({
  expression: new RegExp('^' + error.source.toLowerCase().split('{value}').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.{1,500}') + '$'),
  detail: byCode.get(error.code)!,
}));
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `REF-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}
export function classifyError(error: unknown): ClassifiedError {
  const value = error && typeof error === 'object' ? error as { code?: string; status?: number; name?: string; message?: string } : undefined;
  const message = (typeof error === 'string' ? error : typeof value?.message === 'string' ? value.message : '').trim();
  const lower = message.toLowerCase();
  const formatted = message.match(/\(([A-Z]+-(?:\d{3}|[A-F\d]{8}))\)$/)?.[1];
  const explicit = byCode.get(value?.code || formatted || '');
  if (explicit) return { ...explicit, ...(message.match(/REF-[A-F\d]{8}/)?.[0] ? { reference: message.match(/REF-[A-F\d]{8}/)![0] } : {}) };
  const get = (code: string) => byCode.get(code)!;
  if (value?.code === 'FILE-001') return get('FILE-001');
  if (value?.code === 'FILE-003') return get('FILE-003');
  if (value?.code === 'PGRST202' || value?.code === '42883') return get('SYS-002');
  if (['PGRST204', '42P01', '42703'].includes(value?.code || '')) return get('SYS-003');
  if (value?.name === 'ReferenceError' || value?.name === 'SyntaxError') return get('SYS-004');
  const known = byMessage.get(lower);
  if (known) return known;
  const template = patterns.find(pattern => pattern.expression.test(lower));
  if (template) return template.detail;
  // Only browser/transport signatures and standard API statuses are grouped.
  // Business rules use the exact source catalog above, not guessed keywords.
  if (value?.name === 'NotAllowedError') return get('DEVICE-001');
  if (['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(value?.name || '')) return get('DEVICE-002');
  if (value?.name === 'AbortError') return get('ACT-001');
  if (value?.name === 'TimeoutError' || /\btimeout\b|timed out/.test(lower)) return get('NET-002');
  if (/failed to fetch|networkerror|network request failed|^network(?: failed)?\b|^offline$|load failed/.test(lower)) return get('NET-001');
  if (value?.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(value?.code || '')) return get('LIMIT-001');
  if (value?.status === 401 || ['invalid_credentials', 'session_not_found', 'refresh_token_not_found'].includes(value?.code || '')) return get('AUTH-001');
  if (value?.status === 403 || value?.code === '42501') return get('ACCESS-001');
  if (value?.status === 409 || value?.code === '23505') return get('DATA-001');
  if (value?.status === 404) return get('DATA-002');
  if (value?.status === 413) return get('FILE-001');
  if ([400, 422].includes(value?.status || 0)) return { ...get('INPUT-001'), reference: fingerprint(`${value?.code || ''}:${message}`) };
  return { ...get('SYS-001'), reference: fingerprint(`${value?.name || ''}:${value?.code || ''}:${value?.status || ''}:${message}`) };
}
export function errorMessage(error: unknown): string {
  const detail = classifyError(error);
  return `${detail.message}${detail.reference ? ` Reference: ${detail.reference}.` : ''} (${detail.code})`;
}
