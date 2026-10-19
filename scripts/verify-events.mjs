import { testStudentId } from './test-student-id.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const admin = client();
const credentials = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'admin');
const prefix = `verify-events-${Date.now()}`;
const nodes = [], users = [], checks = [];
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const command = async (action, args, who = admin) => checked(await who.rpc('rmc_command', { action, args }));
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const denied = async (name, args, who = admin) => {
  const result = await who.rpc('rmc_command', { action: 'createEvent', args: [event(args)] });
  assert.ok(result.error, `${name} must be rejected`); pass(name);
};
const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const windows = [
  { id: 'morning', label: 'Window 1', timeIn: '08:00', timeOut: '10:00', lateAfterMinutes: 15 },
  { id: 'afternoon', label: 'Window 2', timeIn: '13:00', timeOut: '16:00', lateAfterMinutes: 30 },
];
function event(extra = {}) {
  return { title: `${prefix} Assembly`, description: 'Temporary event verification', kind: 'attendance', status: 'upcoming',
    startDate: date, endDate: date, startTime: Date.parse(`${date}T08:00:00+08:00`), endTime: Date.parse(`${date}T16:00:00+08:00`),
    participantsType: 'all', target: { all: true }, audienceTarget: { mode: 'all' }, recipientGroups: ['All Students'],
    penaltyValue: 1, penaltyUnit: 'hours', sanctionRules: { late: { value: 30, unit: 'minutes' }, absent: { value: 1, unit: 'hours' } },
    attendanceWindows: windows, geofenceEnabled: false, location: { lat: 0, lng: 0, radius_meters: 0 },
    scopeNodeId: `${prefix}-department`, ...extra };
}
async function account(role, node) {
  const who = client(), password = `${crypto.randomUUID()}Aa!`;
  const profile = { name: `${prefix} ${role}`, username: `${prefix}-${role}`, email: `${prefix}-${role}@example.test`, role,
    student_id: testStudentId(), school_data: { academic_assignment: { terminalGroupId: node } },
    ...(role !== 'student' ? { official_data: { body: 'SSG', assignment_node_id: node } } : {}) };
  const response = await admin.functions.invoke('rmc-accounts', { body: { action: 'create', data: { members: [{ profile, password }] } } });
  if (response.error) throw new Error((await response.error.context?.json?.())?.error || response.error.message);
  assert.ok(response.data.ids?.length); users.push(...response.data.ids);
  checked(await who.auth.signInWithPassword({ email: profile.email, password }));
  return { who, id: response.data.ids[0] };
}
try {
  checked(await admin.auth.signInWithPassword({ email: credentials.email, password: credentials.password }));
  for (const [suffix, parent, type] of [['campus', null, 'education_unit'], ['department', 'campus', 'department'], ['section', 'department', 'section'], ['outside', 'campus', 'section']]) {
    const id = `${prefix}-${suffix}`;
    await command('addSchoolNode', [parent ? `${prefix}-${parent}` : null, { id, name: `${prefix} ${suffix}`, type }]); nodes.push(id);
  }
  const officer = await account('ssg', `${prefix}-department`);
  const osas = await account('ossa', `${prefix}-department`);
  const student = await account('student', `${prefix}-section`);
  for (const [role, manager] of [['ssg', officer], ['ossa', osas]]) {
    const childId = `${prefix}-${role}-child`;
    if (role === 'ssg') {
      assert.ok((await manager.who.rpc('rmc_command', { action: 'addSchoolNode', args: [`${prefix}-department`, { id: childId, name: 'Denied SSG unit', type: 'section' }] })).error);
      pass('SSG cannot create units by default');
    }
    await command('addSchoolNode', [`${prefix}-department`, { id: childId, name: `${prefix} ${role} child`, type: 'section' }], role === 'ssg' ? admin : manager.who);
    nodes.push(childId);
    await command('updateSchoolNode', [childId, { name: `${prefix} ${role} managed child` }], manager.who);
    pass(`${role} can manage existing units within the assigned unit`);
    for (const outside of [`${prefix}-outside`, `${prefix}-campus`]) {
      assert.ok((await manager.who.rpc('rmc_command', { action: 'addSchoolNode', args: [outside, { id: `${prefix}-${role}-forbidden`, name: 'Forbidden', type: 'section' }] })).error);
      assert.ok((await manager.who.rpc('rmc_command', { action: 'updateSchoolNode', args: [outside, { name: 'Forbidden change' }] })).error);
    }
    pass(`${role} cannot create or manage sibling or parent units`);
    await denied(`${role} cannot target another unit`, { audienceTarget: { mode: 'group_list', groups: [`node:${prefix}-outside`] } }, manager.who);
    await denied(`${role} cannot target a parent unit`, { audienceTarget: { mode: 'directory_node', nodeId: `${prefix}-campus` } }, manager.who);
    const managed = await command('createEvent', [event({ audienceTarget: { mode: 'group_list', groups: [`node:${prefix}-department`, `node:${childId}`] } })], manager.who);
    assert.equal(checked(await service.from('rmc_events').select('node_id').eq('id', managed).single()).node_id, `${prefix}-department`);
    await command('updateEvent', [managed, { description: 'Managed within assignment' }], manager.who);
    assert.ok((await manager.who.rpc('rmc_command', { action: 'updateEvent', args: [managed, { audienceTarget: { mode: 'group_list', groups: [`node:${prefix}-outside`] } }] })).error);
    pass(`${role} can spearhead an event within assignment but cannot expand its recipients outside`);
  }
  const id = await command('createEvent', [event({ created_by: student.id, scopeNodeId: `${prefix}-outside` })], officer.who);
  let row = checked(await service.from('rmc_events').select('*').eq('id', id).single());
  assert.equal(row.created_by, officer.id); assert.equal(row.node_id, `${prefix}-department`);
  assert.deepEqual(row.data.attendanceWindows, windows); assert.deepEqual(row.data.sanctionRules, event().sanctionRules);
  assert.deepEqual(row.data.recipientGroups, ['All Students']);
  assert.equal(Date.parse(row.start_at), event().startTime); assert.equal(row.data.startDate, date);
  pass('officer creates persisted configuration with server-owned creator and scope');
  assert.equal(row.data.approvalStatus, 'pending');
  assert.ok(!checked(await student.who.rpc('rmc_snapshot')).events.some(e => e.id === id));
  checked(await osas.who.rpc('rmc_review_event', { event_id: id, decision: 'approved', notes: 'Verified' }));
  assert.ok(checked(await student.who.rpc('rmc_snapshot')).events.some(e => e.id === id));
  pass('recipient can reload saved event from a separate authenticated session');
  const targeted = await command('createEvent', [event({
    scopeNodeId: undefined, recipientGroups: ['Department', 'Outside section'],
    audienceTarget: { mode: 'group_list', groups: [`node:${prefix}-department`, `node:${prefix}-outside`] },
    participantsType: 'specific', target: { all: false },
  })]);
  const targetedRow = checked(await service.from('rmc_events').select('data').eq('id', targeted).single());
  assert.deepEqual(targetedRow.data.audienceTarget.groups, [`node:${prefix}-department`, `node:${prefix}-outside`]);
  assert.ok(checked(await student.who.rpc('rmc_snapshot')).events.some(e => e.id === targeted));
  pass('multiple directory recipients persist and a general unit includes its descendant student');
  await command('updateEvent', [targeted, { audienceTarget: { mode: 'group_list', groups: [`node:${prefix}-outside`] } }]);
  assert.ok(!checked(await student.who.rpc('rmc_snapshot')).events.some(e => e.id === targeted));
  pass('removing a directory recipient removes access for its descendants');
  const outside = await command('createEvent', [event({ scopeNodeId: `${prefix}-outside` })]);
  assert.ok(!checked(await officer.who.rpc('rmc_snapshot')).events.some(e => e.id === outside));
  pass('officer cannot read another scope event');
  assert.ok((await officer.who.rpc('rmc_command', { action: 'updateEvent', args: [outside, { title: `${prefix} Forbidden edit` }] })).error);
  pass('officer cannot edit another scope event');
  await command('setNodeFreezeStatus', [`${prefix}-department`, true, 'Temporary event verification']);
  try { await denied('frozen scope cannot create events', {}, officer.who); }
  finally { await command('setNodeFreezeStatus', [`${prefix}-department`, false, '']); }
  await denied('student cannot create events', {}, student.who);
  await denied('anonymous caller cannot create events', {}, client());
  await denied('blank title rejected', { title: '  ' });
  await denied('missing start time rejected', { startTime: null });
  await denied('reverse schedule rejected', { endTime: event().startTime - 1 });
  await denied('empty windows rejected', { attendanceWindows: [] });
  await denied('null window time rejected', { attendanceWindows: [{ ...windows[0], timeIn: null }] });
  await denied('missing window ID rejected', { attendanceWindows: [{ ...windows[0], id: undefined }] });
  await denied('duplicate window IDs rejected', { attendanceWindows: [windows[0], { ...windows[1], id: 'morning' }] });
  await denied('overlapping windows rejected', { attendanceWindows: [windows[0], { ...windows[1], timeIn: '09:00' }] });
  await denied('negative late threshold rejected', { attendanceWindows: [{ ...windows[0], lateAfterMinutes: -1 }] });
  await denied('negative sanctions rejected', { penaltyValue: -1 });
  await denied('unknown sanction unit rejected', { penaltyUnit: 'days' });
  await denied('invalid coordinates rejected', { geofenceEnabled: true, location: { lat: 91, lng: 125, radius_meters: 100 } });
  await denied('excessive radius rejected', { geofenceEnabled: true, location: { lat: 7, lng: 125, radius_meters: 5001 } });
  await denied('empty recipients rejected', { audienceTarget: { mode: 'group_list', groups: [] } });
  await denied('invalid recurrence rejected', { recurrence: { frequency: 'daily', occurrences: 2 } });
  await denied('fractional recurrence rejected', { recurrence: { frequency: 'weekly', occurrences: 1.5 } });
  await denied('excessive recurrence rejected', { recurrence: { frequency: 'weekly', occurrences: 53 } });
  await denied('zero merit hours rejected', { kind: 'merit', meritHours: 0 });
  const seriesId = await command('createEvent', [event({ recurrence: { frequency: 'weekly', occurrences: 3 }, geofenceEnabled: true, location: { lat: 7.0736, lng: 125.6126, radius_meters: 275 } })]);
  const series = checked(await service.from('rmc_events').select('id,data').eq('data->>seriesId', seriesId).order('start_at'));
  assert.equal(series.length, 3);
  series.forEach((item, i) => { assert.equal(item.data.startTime, event().startTime + i * 604800000); assert.equal(item.data.location.radius_meters, 275); });
  pass('weekly series persists all three occurrences and geofence');
  await command('updateEvent', [series[1].id, { title: `${prefix} Edited occurrence` }]);
  row = checked(await service.from('rmc_events').select('data').eq('id', series[1].id).single());
  assert.equal(row.data.seriesId, seriesId); assert.equal(row.data.title, `${prefix} Edited occurrence`);
  pass('editing an occurrence retains its series and persisted changes');
  for (const kind of ['service', 'merit', 'flag_ceremony']) {
    const activity = await command('createEvent', [event({ kind, meritHours: kind === 'merit' ? 2 : undefined })]);
    assert.equal(checked(await service.from('rmc_events').select('data').eq('id', activity).single()).data.kind, kind);
    pass(`${kind} activity persists`);
  }
  await command('cancelEvent', [id], officer.who);
  assert.equal(checked(await service.from('rmc_events').select('data').eq('id', id).single()).data.cancellationStatus, 'cancelled');
  pass('officer cancellation persists');
  const deletable = await command('createEvent', [event()]);
  await command('deleteEvent', [deletable]);
  assert.equal(checked(await service.from('rmc_events').select('id').eq('id', deletable)).length, 0);
  pass('unattended event deletion persists');
  console.log(`Verified ${checks.length} live event checks.`);
} finally {
  const eventIds = checked(await service.from('rmc_events').select('id').like('data->>title', `${prefix}%`)).map(e => e.id);
  if (eventIds.length) checked(await service.from('rmc_events').delete().in('id', eventIds));
  for (const id of users) checked(await service.auth.admin.deleteUser(id));
  for (const id of [...nodes].reverse()) checked(await service.from('rmc_nodes').delete().eq('id', id));
  // Keep the audit trail; remove only this run's temporary events, accounts, and units.
  console.log('Cleaned up temporary event verification records.');
}
