import { supabase } from './supabase';
export interface InboxNotice {
  id: string; user_id: string; title: string; detail: string; path: string;
  created_at: string; read_at: string | null;
}
export async function loadNotifications(uid: string): Promise<InboxNotice[]> {
  const rows: InboxNotice[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('rmc_notifications').select('id,user_id,title,detail,path,created_at,read_at')
      .eq('user_id', uid).order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
    if (error) throw error;
    // Some stored notices contain a UTF-8 em dash decoded as Windows-1252.
    // Repair that known sequence for both the inbox and notification toasts.
    rows.push(...data.map(row => ({
      ...row,
      title: row.title.replace(/\u00e2\u20ac\u201d/g, '\u2014'),
      detail: row.detail.replace(/\u00e2\u20ac\u201d/g, '\u2014'),
    })));
    if (data.length < 1000) return rows;
  }
}
export async function readNotifications(uid: string, ids: string[]) {
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { error } = await supabase.from('rmc_notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', uid).in('id', ids.slice(offset, offset + 100)).is('read_at', null);
    if (error) throw error;
  }
}
export function subscribeNotifications(uid: string, refresh: () => void) {
  const channel = supabase.channel(`notifications:${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rmc_notifications', filter: `user_id=eq.${uid}` }, refresh)
    .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
  return () => { void supabase.removeChannel(channel); };
}
