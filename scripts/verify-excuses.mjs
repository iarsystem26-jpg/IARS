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
const prefix = `verify-excuses-${Date.now()}`;
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

const uploads = [];
async function reject(action, args, who, message) {
  const result = await who.rpc('rmc_command', { action, args });
  assert.ok(result.error, message);
  if (message) assert.match(result.error.message, message);
  pass(`rejected: ${message}`);
}
try {
  checked(await admin.auth.signInWithPassword({ email: credentials.email, password: credentials.password }));
  for (const [suffix, parent, type] of [['department', null, 'department'], ['section', 'department', 'section']]) {
    const id = `${prefix}-${suffix}`;
    await command('addSchoolNode', [parent ? `${prefix}-${parent}` : null, { id, name: `${prefix} ${suffix}`, type }]); nodes.push(id);
  }
  const student = await account('student', `${prefix}-section`);
  const path = `${student.id}/excuses/${crypto.randomUUID()}.pdf`;
  checked(await student.who.storage.from('rmc-documents').upload(path, new Blob(['%PDF-1.4\nVerification supporting document'], { type: 'application/pdf' })));
  uploads.push(path);
  const proof = `storage://${path}`;
  const application = id => ({ event_id: id, category: 'medical', reason: 'Documented medical reason for this absence.', proof_url: proof });
  async function create(extra = {}, ageDays = -7) {
    const end = Date.now() - ageDays * 86400000;
    const start = end - 3600000;
    const manila = stamp => new Date(stamp + 8 * 3600000).toISOString();
    const data = event({ ...extra, title: `${prefix} Activity ${crypto.randomUUID()}`, startTime: start, endTime: end,
      startDate: manila(start).slice(0,10), endDate: manila(end).slice(0,10),
      attendanceWindows: [{ id:'window', timeIn:manila(start).slice(11,16), timeOut:manila(end).slice(11,16), lateAfterMinutes:15 }] });
    return command('createEvent', [data]);
  }
  for (const value of [-1, 31, 1.5, '3', null]) {
    await reject('createEvent', [event({ excuseWindowDays: value })], admin, /whole number/);
  }
  const future = await create({ excuseWindowDays: 7 });
  await reject('submitExcuseApplication', [{ ...application(future), proof_url: undefined }], student.who, /Attach/);
  await reject('submitExcuseApplication', [{ ...application(future), proof_url: `storage://${student.id}/excuses/missing.pdf` }], student.who, /could not be found/);
  await reject('submitExcuseApplication', [{ ...application(future), reason: 'short' }], student.who, /10 characters/);
  const submitted = await command('submitExcuseApplication', [application(future)], student.who);
  assert.equal(submitted.status, 'pending');
  const stored = checked(await service.from('rmc_excuses').select('data').eq('id', submitted.id).single());
  assert.ok(stored.data.submission_deadline > Date.now());
  pass('advance submission accepted with server deadline');
  await reject('submitExcuseApplication', [application(future)], student.who, /pending or approved/);
  await command('reviewExcuseApplication', [submitted.id, 'rejected', 'Please provide a clearer document.', 0]);
  const revised = await command('submitExcuseApplication', [application(future)], student.who);
  pass('rejected request can be resubmitted within the window');
  await command('reviewExcuseApplication', [revised.id, 'approved', 'Verified document.', 0]);
  await reject('submitExcuseApplication', [application(future)], student.who, /pending or approved/);
  await reject('reviewExcuseApplication', [revised.id, 'approved', 'Duplicate', 0], admin, /already been reviewed/);
  const expired = await create({}, 4);
  await reject('submitExcuseApplication', [application(expired)], student.who, /window has closed/);
  const extended = await create({ excuseWindowDays: 7 }, 4);
  await command('submitExcuseApplication', [application(extended)], student.who);
  pass('custom seven-day deadline accepts an activity four days ago');
  const zero = await create({ excuseWindowDays: 0 }, 0.1);
  await reject('submitExcuseApplication', [application(zero)], student.who, /window has closed/);
  const closing = await create({ excuseWindowDays: 0 }, -2000 / 86400000);
  const timely = await command('submitExcuseApplication', [application(closing)], student.who);
  await new Promise(resolve => setTimeout(resolve, 3000));
  await reject('submitExcuseApplication', [application(closing)], student.who, /window has closed/);
  await command('reviewExcuseApplication', [timely.id, 'approved', 'Submitted before the deadline.', 0]);
  pass('OSSA can approve a timely request after the deadline passes');
  const cancelled = await create();
  await command('cancelEvent', [cancelled]);
  await reject('submitExcuseApplication', [application(cancelled)], student.who, /unavailable/);
  for (const kind of ['service', 'merit']) {
    const id = await create({ kind, ...(kind === 'merit' ? { meritHours: 1 } : {}) });
    await reject('submitExcuseApplication', [application(id)], student.who, /unavailable/);
  }
  console.log(`Verified ${checks.length} live excuse checks.`);
} finally {
  const eventIds = checked(await service.from('rmc_events').select('id').like('data->>title', `${prefix}%`)).map(e => e.id);
  if (eventIds.length) {
    for (const table of ['rmc_excuses', 'rmc_attendance', 'rmc_sanctions']) checked(await service.from(table).delete().in('event_id', eventIds));
    checked(await service.from('rmc_events').delete().in('id', eventIds));
  }
  if (uploads.length) checked(await service.storage.from('rmc-documents').remove(uploads));
  for (const id of users) checked(await service.auth.admin.deleteUser(id));
  for (const id of [...nodes].reverse()) checked(await service.from('rmc_nodes').delete().eq('id', id));
  console.log('Cleaned up temporary excuse verification records and uploads.');
}
