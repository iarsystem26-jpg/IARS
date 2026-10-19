import type { EventAttendanceWindow, EventSanctionRule } from '../types';
import { supabase } from './supabase';
import { refreshData } from './backend';
import { toast } from './toast';
import { monthBounds } from './calendarDates';
export { calendarDay, monthBounds, monthDays, shiftMonth } from './calendarDates';

export type CalendarSpecificActivity = {
 id: string; title: string; kind: string; starts_at: string; ends_at: string;
 venue: string; description: string; cancelled: boolean; windows: EventAttendanceWindow[];
};
export type CalendarItem = {
 id: string; event_id: string; title: string; label: string; starts_at: string; ends_at: string;
 kind: string; organization_id: string | null; general: boolean; cancelled: boolean; suspended: boolean;
 venue: string; description: string;
 schedule?: { scope_node_id: string | null; recipients: string[]; audience?: string; can_manage: boolean };
 parent_event_id?: string | null;
 details?: {
  activity_kind: string; banner_url: string | null; starts_at: string; ends_at: string;
  parent_title: string | null; organization_name: string | null; unit_name: string | null;
  audience: string | null; approval: string; windows: EventAttendanceWindow[];
  geofence_enabled: boolean; location: { lat: number; lng: number; radius_meters: number } | null;
  late_rule: EventSanctionRule; absent_rule: EventSanctionRule; excuse_days: number;
  merit_hours: number | null; service_overflow: string | null; flag_kind: string | null;
  volunteer_merit_hours: number | null;
  specific_activities?: CalendarSpecificActivity[];
 };
};
export type CalendarClosure = { id: string; title: string; reason: string; kind: 'holiday' | 'suspension'; starts_on: string; ends_on: string; node_ids?: string[] };
export type CalendarData = { items: CalendarItem[]; closures: CalendarClosure[] };
export type ClosureActivity = { id: string; title: string; kind: string; starts_at: string; ends_at: string; new_starts_at: string; new_ends_at: string; affected: number; unaffected: number; can_change: boolean; organization: boolean };
export type ClosurePreview = { activities: ClosureActivity[]; token: string };
export type CalendarMove = { event_id: string; date: string };
export type ScheduleActivity = ClosureActivity & { general: boolean; parent_event_id: string | null; parent_title: string | null; description: string; venue: string; approval_status: string; attendance_windows: Array<{ id: string; title?: string; label?: string; timeIn: string; timeOut: string }>; disabled_reason: string | null; move_days: number | null };
export type SchedulePreview = { activities: ScheduleActivity[]; token: string; plan_valid: boolean; errors: string[]; moved_count: number };
export type ClosureDraft = { first_day: string; last_day: string; nodes: string[]; shift_days: number };
export function itemsOnDay(items: CalendarItem[], day: string) {
 const start = Date.parse(`${day}T00:00:00+08:00`), end = start + 86400000;
 return items.filter(item => Date.parse(item.starts_at) < end && Date.parse(item.ends_at) > start);
}
export type CalendarAgendaGroup = { id: string; parent?: CalendarItem; title?: string; items: CalendarItem[] };
export function calendarAgendaGroups(items: CalendarItem[]): CalendarAgendaGroup[] {
 const groups = new Map<string, CalendarAgendaGroup>();
 for (const item of items) {
  const parentId = item.general ? item.event_id : item.parent_event_id;
  const key = parentId || item.id;
  const group = groups.get(key) || { id: key, items: [] };
  if (item.general) { group.parent = item; group.title = item.title; }
  else { group.items.push(item); if (parentId) group.title ||= item.details?.parent_title || 'General event'; }
  groups.set(key, group);
 }
 return [...groups.values()];
}
export function calendarConflicts(items: CalendarItem[]): Set<string> {
 const ids = new Set<string>();
 const active = items.filter(item => !item.cancelled && !item.suspended && !item.general && item.kind !== 'informational').sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
 for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length && Date.parse(active[j].starts_at) < Date.parse(active[i].ends_at); j++) {
  if (active[i].event_id !== active[j].event_id) { ids.add(active[i].id); ids.add(active[j].id); }
 }
 return ids;
}
const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function foldLine(line: string) {
 const rows: string[] = []; let current = '', bytes = 0;
 for (const char of line) {
  const size = new TextEncoder().encode(char).length;
  if (bytes + size > 75) { rows.push(current); current = ' '; bytes = 1; }
  current += char; bytes += size;
 }
 rows.push(current); return rows.join('\r\n');
}
export function calendarICS(items: CalendarItem[], now = Date.now()) {
 const timestamp = (date: string | number) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
 const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IARS//Personal Calendar//EN', 'CALSCALE:GREGORIAN'];
 for (const item of items.filter(item => !item.suspended && !item.cancelled)) {
  lines.push('BEGIN:VEVENT', `UID:${escapeText(item.id)}@iars`, `DTSTAMP:${timestamp(now)}`, `DTSTART:${timestamp(item.starts_at)}`,
   `DTEND:${timestamp(item.ends_at)}`, `SUMMARY:${escapeText(item.title + (item.label === 'Default session' ? '' : ` · ${item.label}`))}`,
   `DESCRIPTION:${escapeText(item.kind === 'informational' ? `No attendance required.\n${item.description}` : item.description)}`, `LOCATION:${escapeText(item.venue)}`, `TRANSP:${item.general || item.kind === 'informational' ? 'TRANSPARENT' : 'OPAQUE'}`, 'END:VEVENT');
 }
 return lines.map(foldLine).join('\r\n') + '\r\nEND:VCALENDAR\r\n';
}
export async function loadPersonalCalendar(month: string): Promise<CalendarData> {
 const { data, error } = await supabase.rpc('rmc_personal_calendar', monthBounds(month)); if (error) throw error; return data;
}
export type InformationalScheduleDraft = { title: string; description: string; venue: string; starts_at: string; ends_at: string; scope_node_id: string | null; recipients: string[] };
export async function saveInformationalSchedule(draft: InformationalScheduleDraft, id: string | null = null) {
 const { data, error } = await supabase.rpc('rmc_save_calendar_schedule', { schedule_id: id, draft });
 if (error) throw error;
 window.dispatchEvent(new Event('rmc_data_update'));
 return data as string;
}
export async function cancelInformationalSchedule(id: string) {
 const { error } = await supabase.rpc('rmc_cancel_calendar_schedule', { schedule_id: id });
 if (error) throw error;
 window.dispatchEvent(new Event('rmc_data_update'));
}
export async function loadClosures(): Promise<CalendarClosure[]> {
 const { data, error } = await supabase.rpc('rmc_calendar_closures'); if (error) throw error; return data;
}
export async function loadScheduleNotices(first: string, last: string): Promise<CalendarClosure[]> {
 const { data, error } = await supabase.rpc('rmc_schedule_notices', { first_day: first, last_day: last }); if (error) throw error; return data || [];
}
export async function previewClosure(draft: ClosureDraft): Promise<ClosurePreview> {
 const { data, error } = await supabase.rpc('rmc_preview_closure', draft); if (error) throw error; return data;
}
export async function previewClosureSchedule(draft: ClosureDraft, plans: CalendarMove[]): Promise<SchedulePreview> {
 const { data, error } = await supabase.rpc('rmc_preview_closure_schedule', { first_day: draft.first_day, last_day: draft.last_day, nodes: draft.nodes, plans }); if (error) throw error; return data;
}
export async function applyClosureSchedule(draft: ClosureDraft, title: string, reason: string, kind: CalendarClosure['kind'], plans: CalendarMove[], token: string) {
 const { data, error } = await supabase.rpc('rmc_apply_closure_schedule', { first_day: draft.first_day, last_day: draft.last_day, nodes: draft.nodes, plans, closure_title: title.trim(), explanation: reason.trim(), closure_kind: kind, expected_token: token });
 if (error) throw error;
 try { await refreshData(); } catch { toast.error(new Error('The rescheduling was saved. Refresh to load updated schedules.')); }
 return data as string;
}
export async function applyClosure(draft: ClosureDraft, title: string, reason: string, kind: CalendarClosure['kind'], operation: string, eventIds: string[], token: string) {
 const { data, error } = await supabase.rpc('rmc_apply_closure', { ...draft, closure_title: title.trim(), explanation: reason.trim(), closure_kind: kind, operation, event_ids: eventIds, expected_token: token });
 if (error) throw error;
 try { await refreshData(); } catch { toast.error(new Error('The suspension was saved. Refresh to load updated schedules.')); }
 return data as string;
}
