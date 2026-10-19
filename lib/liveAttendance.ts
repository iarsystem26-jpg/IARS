import { supabase } from './supabase';

// RLS restricts delivery to rows the signed-in account can read.
export function subscribeAttendance(uid: string, refresh: () => void) {
  const channel = supabase.channel(`attendance:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rmc_attendance', filter: `student_id=eq.${uid}` }, refresh)
    .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
  return () => { void supabase.removeChannel(channel); };
}
