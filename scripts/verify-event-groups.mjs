import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const accounts = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8'));
const client = () => createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const admin = client(), student = client();
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const command = async (action, args) => checked(await admin.rpc('rmc_command', { action, args }));
const prefix = `verify-groups-${Date.now()}`;
const ids = [];
const day = offset => new Date(Date.now() + (7 + offset) * 86400000).toISOString().slice(0, 10);
const stamp = (date, time) => Date.parse(`${date}T${time}:00+08:00`);
const base = {
  bannerUrl: 'https://example.com/event-banner.png', title: prefix, description: 'Temporary group verification', kind: 'attendance', status: 'upcoming',
  startDate: day(0), endDate: day(2), startTime: stamp(day(0),'00:00'), endTime: stamp(day(2),'23:59'),
  participantsType: 'all', target: {all: true}, audienceTarget: {mode: 'all'}, recipientGroups: ['All Students'],
  penaltyValue: 0, penaltyUnit: 'hours', sanctionRules: {late: {value:0,unit:'hours'}, absent: {value:0,unit:'hours'}},
  attendanceWindows: [], geofenceEnabled: false, location: {lat:0,lng:0,radius_meters:0},
};
try {
  for (const [who, role] of [[admin,'admin'],[student,'student']]) {
    const account = accounts.find(a => a.role === role);
    checked(await who.auth.signInWithPassword({email: account.email, password: account.password}));
  }
  const parent = await command('createEvent', [{...base, isGeneralEvent: true}]); ids.push(parent);
  const childData = {...base, isGeneralEvent:false, parentEventId:parent, title:`${prefix} Opening`, venue:'Main gymnasium', startDate:day(1),endDate:day(1),startTime:stamp(day(1),'08:00'),endTime:stamp(day(1),'12:00'), attendanceWindows:[{id:'opening',label:'Opening program',timeIn:'08:00',timeOut:'12:00',lateAfterMinutes:15}]};
  const child = await command('createEvent',[childData]); ids.push(child);
  const second = await command('createEvent',[{...childData,title:`${prefix} Sports`,venue:'Sports field',startDate:day(2),endDate:day(2),startTime:stamp(day(2),'08:00'),endTime:stamp(day(2),'12:00')}]); ids.push(second);
  const row = checked(await service.from('rmc_events').select('data,parent_event_id').eq('id',child).single());
  assert.equal(row.parent_event_id,parent);
  assert.equal(row.data.bannerUrl,base.bannerUrl);
  assert.equal(row.data.parentEventTitle,prefix);
  assert.equal(row.data.attendanceWindows[0].label,'Opening program');
  console.log('PASS duration group, independent child locations, and named windows persist');
  const snapshot = checked(await student.rpc('rmc_snapshot'));
  assert.ok(snapshot.events.some(e => e.id===parent && e.bannerUrl===base.bannerUrl));
  assert.ok(snapshot.events.some(e => e.id===child));
  console.log('PASS general and specific events appear in student snapshot');
  for (const [action,args] of [
    ['createEvent',[{...childData,endTime:stamp(day(3),'12:00')}]],
    ['createEvent',[{...childData,parentEventId:child}]],
    ['updateEvent',[parent,{endTime:stamp(day(0),'23:59')}]],
    ['updateEvent',[child,{parentEventId:null}]],
    ['deleteEvent',[parent]],
  ]) assert.ok((await admin.rpc('rmc_command',{action,args})).error, `${action} should reject invalid group change`);
  console.log('PASS date bounds, nesting, reparenting, and parent deletion protected');
  const studentId = checked(await student.auth.getUser()).user.id;
  const attendance = await service.from('rmc_attendance').insert({event_id:parent,student_id:studentId,slot:'default',data:{status:'present'}});
  assert.ok(attendance.error?.message.includes('specific event'));
  console.log('PASS attendance on general event is rejected');
} finally {
  for (const id of ids.reverse()) checked(await service.from('rmc_events').delete().eq('id',id));
  await Promise.all([admin.auth.signOut(),student.auth.signOut()]);
}
