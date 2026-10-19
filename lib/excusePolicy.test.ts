import { describe, expect, it } from 'vitest';
import { AppEvent, ExcuseApplication } from '../types';
import { excuseBlockReason, excuseDeadline, excuseFileError } from './excusePolicy';

const endTime = Date.parse('2026-10-08T16:00:00+08:00');
const event = { id: 'activity', endTime, status: 'done', kind: 'attendance' } as AppEvent;
const reason = (extra: Partial<AppEvent> = {}, now = endTime, applications: ExcuseApplication[] = []) => excuseBlockReason({ ...event, ...extra }, applications, 'student', false, now);

describe('excuse submission policy', () => {
  it('allows advance submissions and applies the default and configurable deadline inclusively', () => {
    expect(excuseDeadline(event)).toBe(endTime + 3 * 86400000);
    expect(reason({ status: 'upcoming' }, endTime - 86400000)).toBe('');
    expect(reason({ excuseWindowDays: 7 }, endTime + 7 * 86400000)).toBe('');
    expect(reason({ excuseWindowDays: 7 }, endTime + 7 * 86400000 + 1)).toContain('closed');
    expect(reason({ excuseWindowDays: 0 }, endTime)).toBe('');
    expect(reason({ excuseWindowDays: 0 }, endTime + 1)).toContain('closed');
  });
  it('rejects ineligible activities and frozen submissions', () => {
    for (const extra of [{ isGeneralEvent: true }, { cancellationStatus: 'cancelled' }, { kind: 'merit' }, { kind: 'service' }, { status: 'pending' }, { approvalStatus: 'rejected' }] as Partial<AppEvent>[]) expect(reason(extra)).not.toBe('');
    expect(excuseBlockReason(event, [], 'student', true, endTime)).toContain('frozen');
  });
  it('shows existing decisions and allows rejected requests to be resubmitted before the deadline', () => {
    const application = { event_id: event.id, student_uid: 'student', status: 'pending' } as ExcuseApplication;
    expect(reason({}, endTime, [application])).toContain('pending OSSA');
    expect(reason({}, endTime, [{ ...application, status: 'approved' }])).toContain('already been approved');
    expect(reason({}, endTime, [{ ...application, status: 'rejected' }])).toBe('');
    expect(reason({}, endTime, [{ ...application, student_uid: 'someone-else' }])).toBe('');
  });
  it('requires a real supported file within the storage limit', () => {
    expect(excuseFileError(null)).toContain('Attach');
    expect(excuseFileError(new File([], 'empty.pdf', { type: 'application/pdf' }))).not.toBe('');
    expect(excuseFileError(new File(['proof'], 'letter.doc', { type: 'application/msword' }))).not.toBe('');
    expect(excuseFileError(new File(['proof'], 'letter.pdf', { type: 'application/pdf' }))).toBe('');
    expect(excuseFileError({ type: 'application/pdf', size: 5 * 1024 * 1024 + 1 } as File)).not.toBe('');
  });
});
