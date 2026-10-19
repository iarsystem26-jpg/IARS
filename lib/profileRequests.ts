import { supabase } from './supabase';
import { refreshData } from './backend';
import { toast } from './toast';
import { errorMessage } from './errors';
import type { UserProfile } from '../types';

export const requestFields = {
  name: 'Full name', student_id: 'Student ID', phone: 'Mobile contact',
  guardianName: 'Guardian name', guardianContact: 'Guardian contact', guardianEmail: 'Guardian email',
  node_id: 'Academic assignment',
} as const;
export type RequestField = keyof typeof requestFields;
export const optionalRequestFields: RequestField[] = ['phone', 'guardianName', 'guardianContact', 'guardianEmail'];
export type ProfileRequest = {
  id: string; student_id: string; student_name: string; student_number: string;
  kind: 'edit' | 'deletion' | 'transfer'; changes: Partial<Record<RequestField, string>>;
  original: Partial<Record<RequestField, string>>; reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'partially_approved'; created_at: string;
  field_decisions?: Partial<Record<RequestField, { status: 'approved' | 'rejected'; note: string; reviewed_at: string; reviewer_name: string }>>;
  reviewed_at: string | null; review_note: string; reviewer_name: string | null;
};
export function profileRequestValues(profile: UserProfile): Record<RequestField, string> {
  return { name: profile.name, student_id: profile.student_id, phone: profile.phone || '',
    guardianName: profile.guardian?.name || '', guardianContact: profile.guardian?.contact || '', guardianEmail: profile.guardian?.email || '',
    node_id: profile.official_data?.assignment_node_id || profile.school_data?.academic_assignment?.terminalGroupId || '' };
}
export async function loadProfileRequests(studentUid?: string): Promise<ProfileRequest[]> {
  const rows: ProfileRequest[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase.from('rmc_profile_requests').select('*');
    if (studentUid) query = query.eq('student_id', studentUid);
    const { data, error } = await query.order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}
export async function submitProfileRequest(kind: ProfileRequest['kind'], changes: ProfileRequest['changes'], reason: string) {
  const { error } = kind === 'transfer'
    ? await supabase.rpc('rmc_submit_transfer_request', { destination: changes.node_id, reason })
    : await supabase.rpc('rmc_submit_profile_request', { kind, changes, reason });
  if (error) throw error;
}
export async function reviewProfileRequest(requestId: string, decision: 'approved' | 'rejected', note: string, fields?: RequestField[]) {
  const { error } = await supabase.rpc('rmc_review_profile_request_fields', { request_id: requestId, decision, note, fields: fields || null });
  if (error) throw error;
  try { await refreshData(); }
  catch { toast.error(new Error('The decision was saved and the student notified. Refresh to load the latest profile.')); }
}
export function fieldDecision(row: ProfileRequest, field: RequestField) {
  return row.field_decisions?.[field]?.status || (row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending');
}
export function profileRequestTitle(row: ProfileRequest) {
  if (row.kind === 'transfer') return `Transfer academic assignment — ${row.student_name}`;
  const fields = Object.keys(row.changes) as RequestField[];
  const subject = fields.length === 1 ? requestFields[fields[0]] : `${fields.length} information fields`;
  return `${row.kind === 'deletion' ? 'Delete' : 'Update'} ${subject.toLowerCase()} — ${row.student_name}`;
}
export function requestError(error: unknown) {
  return errorMessage(error);
}
