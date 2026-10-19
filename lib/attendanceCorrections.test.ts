import { describe, expect, it, vi } from 'vitest';
import { correctionEvidenceError, correctionStatus, correctionTimeError, correctionTimestamp, manilaInput, reviewAttendanceCorrection, type CorrectionOption } from './attendanceCorrections';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), refresh: vi.fn(), error: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('./backend', () => ({ refreshData: mocks.refresh }));
vi.mock('./toast', () => ({ toast: { error: mocks.error } }));
const option: CorrectionOption = { event_id: 'e', event_title: 'Event', slot: '2026-10-08:morning', label: 'Morning', original: null,
 starts_at: '2026-10-08T00:00:00Z', ends_at: '2026-10-08T02:00:00Z', late_at: '2026-10-08T00:15:00Z' };
describe('Manila correction timestamps and validation', () => {
 it('converts Manila form values independently of device timezone and preserves seconds', () => {
  expect(correctionTimestamp('2026-10-08T08:15:37')).toBe('2026-10-08T00:15:37.000Z');
  expect(manilaInput('2026-10-08T00:15:37Z')).toBe('2026-10-08T08:15:37');
  expect(correctionTimestamp('')).toBeNull();
 });
 it('derives the exact late boundary and absent requests', () => {
  expect(correctionStatus('', option)).toBe('absent');
  expect(correctionStatus('2026-10-08T08:15:00', option)).toBe('present');
  expect(correctionStatus('2026-10-08T08:15:01', option)).toBe('late');
 });
 it('rejects checkout without check-in, reversed times, invalid dates and out-of-window claims', () => {
  expect(correctionTimeError('', '2026-10-08T09:00', option)).toContain('follow');
  expect(correctionTimeError('2026-10-08T09:00', '2026-10-08T08:00', option)).toContain('follow');
  expect(correctionTimeError('2026-10-08T07:59', '', option)).toContain('within');
  expect(correctionTimeError('2026-10-08T08:00', '2026-10-08T10:01', option)).toContain('within');
  expect(correctionTimeError('invalid', '', option)).toContain('valid');
  expect(correctionTimeError('2026-10-08T08:00', '2026-10-08T10:00', option)).toBe('');
 });
 it('allows optional evidence and rejects empty, oversized or unsupported uploads', () => {
  expect(correctionEvidenceError(null)).toBe('');
  expect(correctionEvidenceError(new File(['proof'], 'proof.pdf', { type: 'application/pdf' }))).toBe('');
  expect(correctionEvidenceError(new File([], 'proof.pdf', { type: 'application/pdf' }))).toContain('non-empty');
  expect(correctionEvidenceError(new File(['text'], 'proof.txt', { type: 'text/plain' }))).toContain('PDF');
  expect(correctionEvidenceError({ type: 'application/pdf', size: 5242881 } as File)).toContain('5 MB');
 });
 it('does not report a saved decision as failed when the snapshot refresh fails', async () => {
  mocks.rpc.mockResolvedValue({ error: null }); mocks.refresh.mockRejectedValue(new Error('Offline'));
  await expect(reviewAttendanceCorrection('r', 'approved', 'Verified.', '2026-10-08T08:00', '')).resolves.toBeUndefined();
  expect(mocks.rpc).toHaveBeenCalledWith('rmc_review_attendance_correction', expect.objectContaining({ verified_in: '2026-10-08T00:00:00.000Z', verified_out: null }));
  expect(mocks.error).toHaveBeenCalled();
 });
});
