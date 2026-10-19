import { requireConfiguration, supabase } from './supabase';
import { parseManilaDateTime } from './dateTime';

export type ClearanceCertificate = {
 id: string; token: string; reference: string; issued_at: string; cleared_at: string;
 details: { student_name: string; student_number: string; school_name: string; period_title: string;
  starts_at: string; ends_at: string; authorized_by: string };
};
export type ClearanceSchedule = {
 id: string; title: string; starts_at: string; ends_at: string; release_enabled: boolean;
 eligible?: boolean; cleared_at?: string; certificate?: ClearanceCertificate | null;
 eligible_count?: number; issued_count?: number;
};
export type ClearanceVerification = {
 found: boolean; valid?: boolean; reference?: string; student_name?: string; school_name?: string;
 period_title?: string; issued_at?: string; cleared_at?: string;
};
async function command<T>(operation: string, payload = {}): Promise<T> {
 requireConfiguration();
 const { data, error } = await supabase.rpc('rmc_clearance', { operation, payload });
 if (error) throw error;
 return data as T;
}
export const loadClearanceSchedules = (manage = false) => command<ClearanceSchedule[]>(manage ? 'manage' : 'list');
export function createClearanceSchedule(title: string, start: string, end: string) {
 const starts = parseManilaDateTime(start), ends = parseManilaDateTime(end);
 if (!title.trim() || !Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) {
  throw new Error('Enter a title and a clearing period with an end after its start.');
 }
 return command<ClearanceSchedule[]>('create', { title: title.trim(), starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString() });
}
export const releaseClearanceSchedule = (schedule_id: string, enabled: boolean) => command<ClearanceSchedule[]>('release', { schedule_id, enabled });
export const issueClearanceCertificate = (schedule_id: string) => command<ClearanceCertificate>('issue', { schedule_id });
export const clearanceVerificationUrl = (token: string, base = window.location.href) => {
 const url = new URL(base); url.search = ''; url.hash = `/verify/clearance/${encodeURIComponent(token)}`; return url.href;
};
export async function verifyClearanceCertificate(token: string): Promise<ClearanceVerification> {
 requireConfiguration();
 const { data, error } = await supabase.rpc('rmc_verify_clearance', { verification_token: token });
 if (error) throw new Error('Verification is unavailable. Please try again when connected.');
 return data as ClearanceVerification;
}
