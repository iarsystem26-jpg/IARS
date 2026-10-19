import { supabase } from './supabase';
import { refreshData } from './backend';
import { parseManilaDateTime } from './dateTime';
import { toast } from './toast';

export type CorrectionAttendance = {
 status: 'present' | 'late' | 'absent' | 'excused'; time_in?: number; time_out?: number;
 recorded_at?: number; scanned_by_name?: string; scanned_by_uid?: string;
 corrected_by_name?: string; corrected_at?: number; correction_note?: string;
 rendered_hours?: number; deducted_hours?: number; merit_earned_hours?: number;
};
export type CreditAdjustment = {
 kind: 'service' | 'merit'; rendered_before: number; rendered_after: number;
 cleared_before: number; cleared_after: number; merit_before: number; merit_after: number;
 sanction_change: number; merit_change: number; balance_before: number; balance_after: number; complete: boolean;
};
export type CorrectionOption = {
 event_id: string; event_title: string; slot: string; label: string;
 starts_at: string; ends_at: string; late_at: string; original: CorrectionAttendance | null;
 kind?: string;
};
export type AttendanceCorrection = {
 id: string; student_id: string; student_name: string; student_number: string;
 event_id: string; event_title: string; slot: string; reason: string; proof_url: string | null;
 session_starts_at: string; session_ends_at: string; session_late_at: string;
 original: CorrectionAttendance | null; corrected: CorrectionAttendance | null;
 proposed_time_in: string | null; proposed_time_out: string | null;
 status: 'pending' | 'approved' | 'rejected'; created_at: string; reviewed_at: string | null;
 reviewer_name: string | null; review_note: string; sanction_change: number;
 kind?: string; credit_adjustment?: CreditAdjustment | null;
};
export const correctionKey = (eventId: string, slot: string) => JSON.stringify([eventId, slot]);
export function manilaInput(value?: string | number | null) {
 if (value == null || value === '') return '';
 const stamp = typeof value === 'number' ? value : Date.parse(value);
 return Number.isFinite(stamp) ? new Date(stamp + 8 * 3600000).toISOString().slice(0, 19) : '';
}
export function correctionTimestamp(value: string): string | null {
 if (!value) return null;
 const stamp = parseManilaDateTime(value);
 if (!Number.isFinite(stamp)) throw new Error('Enter a valid Manila date and time.');
 return new Date(stamp).toISOString();
}
export function correctionTimeError(timeIn: string, timeOut: string, option?: CorrectionOption) {
 try {
  const input = correctionTimestamp(timeIn), output = correctionTimestamp(timeOut);
  if (output && (!input || Date.parse(output) < Date.parse(input))) return 'Time-out must follow time-in.';
  if (option && input && (Date.parse(input) < Date.parse(option.starts_at) || Date.parse(input) > Date.parse(option.ends_at))) return 'Time-in must be within the selected session.';
  if (option && output && Date.parse(output) > Date.parse(option.ends_at)) return 'Time-out must be within the selected session.';
  return '';
 } catch (error) { return (error as Error).message; }
}
export function correctionStatus(timeIn: string, option?: CorrectionOption) {
 if (!timeIn) return 'absent';
 if (!option) return 'Determined from verified time-in';
 return parseManilaDateTime(timeIn) > Date.parse(option.late_at) ? 'late' : 'present';
}
export function correctionEvidenceError(file: File | null) {
 if (!file) return '';
 return !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024
  ? 'Choose a non-empty PDF, JPG, PNG, or WebP file up to 5 MB.' : '';
}
export async function loadAttendanceCorrections(studentUid?: string): Promise<AttendanceCorrection[]> {
 const rows: AttendanceCorrection[] = [];
 for (let offset = 0; ; offset += 1000) {
  let query = supabase.from('rmc_attendance_corrections').select('*');
  if (studentUid) query = query.eq('student_id', studentUid);
  const { data, error } = await query.order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
  if (error) throw error;
  rows.push(...(data || []));
  if (!data || data.length < 1000) return rows;
 }
}
export async function loadCorrectionOptions(): Promise<CorrectionOption[]> {
 const { data, error } = await supabase.rpc('rmc_correction_options');
 if (error) throw error;
 return data || [];
}
export async function submitAttendanceCorrection(option: CorrectionOption, reason: string, timeIn: string, timeOut: string, proof?: string) {
 const { data, error } = await supabase.rpc('rmc_submit_attendance_correction', {
  target_event: option.event_id, target_slot: option.slot, explanation: reason.trim(),
  claimed_in: correctionTimestamp(timeIn), claimed_out: correctionTimestamp(timeOut), evidence: proof || null,
 });
 if (error) throw error;
 return data as string;
}
export async function previewCorrectionCredit(id: string, timeIn: string, timeOut: string): Promise<CreditAdjustment> {
 const { data, error } = await supabase.rpc('rmc_preview_correction_credit', {
  request_id: id, verified_in: correctionTimestamp(timeIn), verified_out: correctionTimestamp(timeOut),
 });
 if (error) throw error;
 return data;
}
export async function reviewAttendanceCorrection(id: string, decision: 'approved' | 'rejected', note: string, timeIn: string, timeOut: string, credit?: CreditAdjustment) {
 const { error } = await supabase.rpc('rmc_review_attendance_correction', {
  request_id: id, decision, note: note.trim(),
  verified_in: decision === 'approved' ? correctionTimestamp(timeIn) : null,
  verified_out: decision === 'approved' ? correctionTimestamp(timeOut) : null,
  ...(credit && decision === 'approved' ? { expected_credit: credit } : {}),
 });
 if (error) throw error;
 try { await refreshData(); }
 catch { toast.error(new Error('The decision was saved. Refresh to load the updated attendance and balance.')); }
}
