import { testStudentId } from './test-student-id.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const url = process.env.SUPABASE_URL;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const prefix = `verify-${Date.now()}`;
const ids = [], nodes = [], uploaded = [];
const checks = [];
const admin = client();
const credentials = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'admin');
const ok = async (name, result) => { if (result.error) { const body = await result.error.context?.json?.().catch(() => null); throw new Error(`${name}: ${body?.error || result.error.message}`); } checks.push(name); console.log(`PASS ${name}`); return result.data; };
const deny = (name, result) => { assert.ok(result.error, `${name} should be denied`); checks.push(name); console.log(`PASS ${name}`); };
const command = async (action, args, who = admin) => { const r = await who.rpc('rmc_command', { action, args }); if (r.error) throw new Error(`${action}: ${r.error.message}`); return r.data; };
const person = (name, node = `${prefix}-section`, role = 'student') => ({ name: `${prefix} ${name}`, username: `${prefix}-${name}`, email: `${prefix}-${name}@example.test`, student_id: testStudentId(), role, school_data: { type: 'College', level: '1', section: 'Test section', academic_assignment: { campusId: `${prefix}-campus`, terminalGroupId: node, nodePathIds: [`${prefix}-campus`, `${prefix}-department`, node] } }, ...(role !== 'student' ? { official_data: { body: 'SSG', assignment_node_id: node } } : {}) });
const password = crypto.randomBytes(24).toString('base64url');
async function enrollmentTicket(email) {
  const ticket = crypto.randomUUID();
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const result = await service.rpc('rmc_enrollment_reserve', { email_hash: hash(email.trim().toLowerCase()), ip_hash: hash(prefix), ticket_hash: hash(ticket) });
  if (result.error) throw new Error(`Enrollment reservation: ${result.error.message}. Apply the Google enrollment migration before running this integration check.`);
  assert.equal(result.data, 0, 'Test enrollment was unexpectedly throttled');
  return ticket;
}
async function create(name, node, role = 'student') {
  const profile = person(name, node, role);
  const data = await ok(`provision ${name}`, await admin.functions.invoke('rmc-accounts', { body: { action: 'create', data: { members: [{ profile, password }] } } }));
  ids.push(...data.ids); const who = client();
  await ok(`sign in ${name}`, await who.auth.signInWithPassword({ email: profile.email, password }));
  return { who, id: data.ids[0], profile };
}
function event(title, extra = {}) {
  const now = Date.now();
  return { title: `${prefix} ${title}`, description: 'Automated integration verification', kind: 'attendance', status: 'active', startTime: now - 30 * 60000, endTime: now + 30 * 60000, participantsType: 'all', target: { all: true }, audienceTarget: { mode: 'all' }, scopeNodeId: `${prefix}-department`, penaltyValue: 2, penaltyUnit: 'hours', sanctionRules: { late: { value: 30, unit: 'minutes' }, absent: { value: 2, unit: 'hours' } }, geofenceEnabled: false, location: { lat: 7.0736, lng: 125.6126, radius_meters: 100 }, ...extra };
}
try {
  const login = await ok('username/password Edge Function login', await admin.functions.invoke('rmc-login', { body: { identifier: credentials.username, password: credentials.password } }));
  await ok('establish Supabase session', await admin.auth.setSession(login));
  await ok('authenticated snapshot', await admin.rpc('rmc_snapshot'));
  deny('anonymous profile access blocked', await client().from('rmc_profiles').select('*'));
  for (const [suffix, parent, type] of [['campus', null, 'campus'], ['department', 'campus', 'department'], ['section', 'department', 'section'], ['other', 'campus', 'section']]) {
    const id = `${prefix}-${suffix}`;
    await command('addSchoolNode', [parent ? `${prefix}-${parent}` : null, { id, name: `Test ${suffix}`, type }]); nodes.push(id);
  }
  const anonDirectory = await ok('public admission directory', await client().from('rmc_nodes').select('id,parent_id,data'));
  assert.ok(anonDirectory.some(n => n.id === `${prefix}-section`));
  const student = await create('student');
  const other = await create('outsider', `${prefix}-other`);
  const mayor = await create('mayor', `${prefix}-section`, 'mayor');
  deny('student cannot grant own admin role', await student.who.from('rmc_profiles').update({ role_id: 'admin' }).eq('id', student.id));
  deny('student cannot create an event', await student.who.rpc('rmc_command', { action: 'createEvent', args: [event('forbidden')] }));
  const visible = await ok('scoped officer snapshot', await mayor.who.rpc('rmc_snapshot'));
  assert.ok(!visible.profiles.some(p => p.uid === other.id), 'Out-of-scope student leaked');
  console.log('PASS officer cannot read another section'); checks.push('officer cannot read another section');
  // Auth admin creates without sending email. This runs the exact signup trigger
  // used by public sign-up, with deliberately forged privileged metadata.
  const admissionProfile = person('admission');
  // Public signup enforces the current enrollment fields; provisioning does not
  // follow the applicant workflow. Keep this test independent of real images.
  admissionProfile.guardian = { name: 'Verification Guardian', contact: '09123456789' };
  admissionProfile.photo_url = `https://drive.google.com/thumbnail?id=${prefix}_photo&sz=w1600`;
  const admission = await ok('admission trigger', await service.auth.admin.createUser({ email: admissionProfile.email, password, email_confirm: true, user_metadata: { profile: { ...admissionProfile, role: 'admin', account_status: 'active' }, enrollment_ticket: await enrollmentTicket(admissionProfile.email) } }));
  ids.push(admission.user.id);
  const pending = await ok('read pending admission', await service.from('rmc_profiles').select('role_id,status').eq('id', admission.user.id).single());
  assert.deepEqual(pending, { role_id: 'student', status: 'pending' });
  await command('rejectApplication', [admission.user.id, 'Please correct the submitted details.']);
  const applicant = client(); await ok('pending applicant login', await applicant.auth.signInWithPassword({ email: admissionProfile.email, password }));
  await ok('resubmit rejected admission', await applicant.rpc('rmc_admission_update', { documents: {}, person: admissionProfile }));
  await command('approveApplication', [admission.user.id, 'student']);
  deny('admission cannot be approved twice', await admin.rpc('rmc_command', { action: 'approveApplication', args: [admission.user.id, 'student'] }));
  await command('setSectionSecurityKey', [`${prefix}-section`, 'VERIFY-SECRET-123']);
  const wrongKey = await service.auth.admin.createUser({ email: person('wrongkey').email, password, email_confirm: true, user_metadata: { profile: person('wrongkey'), enrollment_key: 'WRONG', enrollment_ticket: await enrollmentTicket(person('wrongkey').email) } });
  deny('invalid enrollment key rejected on server', wrongKey);
  const id = await command('createEvent', [event('attendance')]);
  const qr = await ok('issue expiring QR', await student.who.rpc('rmc_issue_qr'));
  await ok('resolve student QR as scanner', await mayor.who.rpc('rmc_resolve_qr', { token: qr.token }));
  const printedQr = await ok('issue persistent printed QR', await student.who.rpc('rmc_get_print_qr'));
  assert.equal(printedQr.persistent, true);
  assert.equal(printedQr.expiresAt, null);
  const printedQrAgain = await ok('reuse persistent printed QR', await student.who.rpc('rmc_get_print_qr'));
  assert.equal(printedQrAgain.token, printedQr.token);
  await ok('resolve persistent printed QR as scanner', await mayor.who.rpc('rmc_resolve_qr', { token: printedQr.token }));
  const replacedQr = await ok('replace persistent printed QR', await student.who.rpc('rmc_refresh_print_qr'));
  assert.notEqual(replacedQr.token, printedQr.token);
  deny('replaced printed QR is revoked', await mayor.who.rpc('rmc_resolve_qr', { token: printedQr.token }));
  deny('reject forged legacy QR', await mayor.who.rpc('rmc_resolve_qr', { token: `RMC_SECURE_PASSPORT:${student.id}:fake` }));
  deny('out-of-scope QR rejected', await mayor.who.rpc('rmc_resolve_qr', { token: (await other.who.rpc('rmc_issue_qr')).data.token }));
  const scan = { event_id: id, student_id: student.id, direction: 'in', qr_token: qr.token };
  const records = await Promise.all([mayor.who.rpc('rmc_record_attendance', scan), mayor.who.rpc('rmc_record_attendance', scan)]);
  for (const r of records) assert.equal(r.error, null, r.error?.message);
  assert.equal(records.filter(r => r.data.already_recorded).length, 1);
  checks.push('concurrent duplicate scan is idempotent'); console.log('PASS concurrent duplicate scan is idempotent');
  assert.equal(records[0].data.status, 'late');
  const sanctions = await service.from('rmc_sanctions').select('data').eq('student_id', student.id);
  assert.equal(sanctions.data.length, 1); assert.equal(sanctions.data[0].data.change, 0.5);
  checks.push('late sanction applied once'); console.log('PASS late sanction applied once');
  const fenced = await command('createEvent', [event('geofenced', { geofenceEnabled: true })]);
  deny('missing GPS rejected by database', await mayor.who.rpc('rmc_record_attendance', { ...scan, event_id: fenced }));
  deny('outside geofence rejected by database', await mayor.who.rpc('rmc_record_attendance', { ...scan, event_id: fenced, scan_position: { latitude: 0, longitude: 0, accuracy: 5, timestamp: Date.now() } }));
  await ok('valid GPS accepted by database', await mayor.who.rpc('rmc_record_attendance', { ...scan, event_id: fenced, scan_position: { latitude: 7.0736, longitude: 125.6126, accuracy: 5, timestamp: Date.now() } }));
  const recurring = await command('createEvent', [event('weekly series', { recurrence: { frequency: 'weekly', occurrences: 3 } })]);
  const series = await service.from('rmc_events').select('id,start_at').eq('data->>seriesId', recurring);
  assert.equal(series.data.length, 3); checks.push('weekly recurrence creates three persisted events'); console.log('PASS weekly recurrence creates three persisted events');
  deny('overlapping attendance windows rejected', await admin.rpc('rmc_command', { action: 'createEvent', args: [event('invalid windows', { attendanceWindows: [{ id: 'first', timeIn: '08:00', timeOut: '10:00', lateAfterMinutes: 15 }, { id: 'second', timeIn: '09:00', timeOut: '11:00', lateAfterMinutes: 15 }] })] }));
  const future = await command('createEvent', [event('scheduled', { startTime: Date.now() + 3600000, endTime: Date.now() + 7200000 })]);
  deny('early scan rejected by server clock', await mayor.who.rpc('rmc_record_attendance', { ...scan, event_id: future }));
  await command('setNodeFreezeStatus', [`${prefix}-department`, true, 'Verification freeze']);
  deny('frozen scope scan rejected', await mayor.who.rpc('rmc_record_attendance', { ...scan, direction: 'out' }));
  await command('setNodeFreezeStatus', [`${prefix}-department`, false]);
  const serviceEvent = await command('createEvent', [event('merit', { kind: 'merit', meritHours: 1 })]);
  await ok('merit check-in', await mayor.who.rpc('rmc_record_attendance', { ...scan, event_id: serviceEvent }));
  const outs = await Promise.all([mayor.who.rpc('rmc_record_attendance', { ...scan, event_id: serviceEvent, direction: 'out' }), mayor.who.rpc('rmc_record_attendance', { ...scan, event_id: serviceEvent, direction: 'out' })]);
  outs.forEach(r => assert.equal(r.error, null, r.error?.message)); assert.equal(outs.filter(r => r.data.already_recorded).length, 1);
  checks.push('merit credit applied once'); console.log('PASS merit credit applied once');
  const path = `${student.id}/excuses/${crypto.randomUUID()}.pdf`; uploaded.push(path);
  await ok('private document upload', await student.who.storage.from('rmc-documents').upload(path, new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' })));
  await ok('submit excuse', await student.who.rpc('rmc_command', { action: 'submitExcuseApplication', args: [{ event_id: id, category: 'medical', reason: 'Integration test supporting explanation.', proof_url: `storage://${path}` }] }));
  const excuses = await student.who.from('rmc_excuses').select('id').eq('student_id', student.id);
  await command('reviewExcuseApplication', [excuses.data[0].id, 'approved', 'Verified explanation', 1]);
  deny('excuse cannot be waived twice', await admin.rpc('rmc_command', { action: 'reviewExcuseApplication', args: [excuses.data[0].id, 'approved', 'Duplicate', 1] }));
  deny('another student cannot open private document', await other.who.storage.from('rmc-documents').createSignedUrl(path, 60));
  await ok('owner can open private document', await student.who.storage.from('rmc-documents').createSignedUrl(path, 60));
  const after = await ok('persisted attendance and sanction snapshot', await student.who.rpc('rmc_snapshot'));
  assert.ok(after.attendance.length >= 3);
  assert.equal(after.profiles.length, 1);
  deny('events with attendance cannot be deleted', await admin.rpc('rmc_command', { action: 'deleteEvent', args: [id] }));
  const endedId = await command('createEvent', [event('finalization', { startTime: Date.now() + 1000, endTime: Date.now() + 2000 })]);
  let finalized;
  for (let attempt = 0; attempt < 40; attempt++) {
    finalized = await service.from('rmc_attendance').select('data').eq('event_id', endedId).eq('student_id', student.id);
    if (finalized.data?.length) break;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  assert.equal(finalized.data?.[0]?.data.status, 'absent', 'Scheduled absence job did not record the missed event');
  const absentPenalties = await service.from('rmc_sanctions').select('data').eq('event_id', endedId).eq('student_id', student.id);
  assert.equal(absentPenalties.data?.length, 1); assert.equal(absentPenalties.data[0].data.change, 2);
  checks.push('scheduled absence finalization and penalty'); console.log('PASS scheduled absence finalization and penalty');
  const factor = await ok('enroll real TOTP factor', await student.who.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Verification' }));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...factor.totp.secret.replace(/=+$/, '').toUpperCase()].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  function totp() {
    const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
    const hash = crypto.createHmac('sha1', key).update(counter).digest(); const offset = hash[19] & 15;
    return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0');
  }
  await ok('verify real TOTP factor', await student.who.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp() }));
  const lowAssurance = client(); await ok('sign in enrolled user without second factor', await lowAssurance.auth.signInWithPassword({ email: student.profile.email, password }));
  deny('MFA protected operation rejects password-only session', await lowAssurance.rpc('rmc_issue_qr'));
  deny('MFA protected printed QR rejects password-only session', await lowAssurance.rpc('rmc_get_print_qr'));
  deny('MFA protected printed QR rotation rejects password-only session', await lowAssurance.rpc('rmc_refresh_print_qr'));
  const restricted = await ok('MFA read restrictions', await lowAssurance.rpc('rmc_snapshot'));
  assert.equal(restricted.profiles.length, 0); assert.equal(restricted.attendance.length, 0); assert.equal(restricted.sanctions.length, 0);
  deny('MFA password-only session cannot sign private documents', await lowAssurance.storage.from('rmc-documents').createSignedUrl(path, 60));
  await ok('deactivate temporary account', await admin.functions.invoke('rmc-accounts', { body: { action: 'deactivate', data: { uid: mayor.id } } }));
  const deactivated = await mayor.who.rpc('rmc_snapshot');
  assert.ok(deactivated.error || deactivated.data?.profiles?.length === 0);
  checks.push('deactivation revokes existing-session records'); console.log('PASS deactivation revokes existing-session records');
  await ok('MFA verified session can issue QR', await student.who.rpc('rmc_issue_qr'));
  await ok('MFA verified session can read printed QR', await student.who.rpc('rmc_get_print_qr'));
  console.log(`Verified ${checks.length} live checks.`);
} finally {
  if (uploaded.length) await service.storage.from('rmc-documents').remove(uploaded);
  const { data: events } = await service.from('rmc_events').select('id').like('data->>title', `${prefix}%`);
  const eventIds = (events || []).map(e => e.id);
  const { data: excuses } = await service.from('rmc_excuses').select('id').in('student_id', ids);
  const excuseIds = (excuses || []).map(e => e.id);
  for (const table of ['rmc_excuses', 'rmc_sanctions', 'rmc_attendance']) {
    if (eventIds.length) { const r = await service.from(table).delete().in('event_id', eventIds); if (r.error) throw r.error; }
  }
  if (eventIds.length) await service.from('rmc_events').delete().in('id', eventIds);
  for (const id of ids) { await service.from('rmc_sanctions').delete().eq('student_id', id); await service.auth.admin.deleteUser(id); }
  for (const id of [...nodes].reverse()) { const r = await service.from('rmc_nodes').delete().eq('id', id); if (r.error) throw r.error; }
  const { data: audit } = await service.from('rmc_audit').select('id,target,actor_id').gte('created_at', new Date(Number(prefix.split('-')[1])).toISOString());
  const targets = [...ids, ...eventIds, ...nodes, ...excuseIds];
  const auditIds = (audit || []).filter(a => ids.includes(a.actor_id) || targets.includes(a.target) || a.target?.includes(prefix)).map(a => a.id);
  if (auditIds.length) await service.from('rmc_audit').delete().in('id', auditIds);
  fs.writeFileSync('.supabase-verification.local', JSON.stringify({ timestamp: new Date().toISOString(), checks, cleanedUp: true }, null, 2));
  console.log('Removed only records created by this verification run.');
}
