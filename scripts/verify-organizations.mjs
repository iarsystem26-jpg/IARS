import { testStudentId } from './test-student-id.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
process.loadEnvFile('.env.server.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const admin = client(), anon = client();
const credentials = JSON.parse(fs.readFileSync('.demo-accounts.local', 'utf8')).find(a => a.role === 'admin');
const prefix = `verify-org-${Date.now()}`;
const nodes = [], users = [], organizations = [], events = [], checks = [];
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const command = async (who, action, payload) => checked(await who.rpc('rmc_organization_command', { action, payload }));
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const denied = async (who, action, payload, name) => {
  assert.ok((await who.rpc('rmc_organization_command', { action, payload })).error, name); pass(name);
};
const snapshot = async who => checked(await who.rpc('rmc_snapshot'));
async function account(role, unit, label = role) {
  const who = client(), password = `${crypto.randomUUID()}Aa!`;
  const profile = { name: `${prefix} ${label}`, username: `${prefix}-${label}`, email: `${prefix}-${label}@example.test`, role,
    student_id: testStudentId(), school_data: { academic_assignment: { terminalGroupId: unit } },
    ...(['ssg','ossa'].includes(role) ? { official_data: { body: role === 'ossa' ? 'OSSA' : 'SSG', assignment_node_id: unit } } : {}) };
  const response = await admin.functions.invoke('rmc-accounts', { body: { action: 'create', data: { members: [{ profile, password }] } } });
  if (response.error) throw new Error((await response.error.context?.json?.())?.error || response.error.message);
  if (response.data.error) throw new Error(response.data.error);
  users.push(...response.data.ids);
  checked(await who.auth.signInWithPassword({ email: profile.email, password }));
  return { who, id: response.data.ids[0] };
}
const event = (extra = {}) => ({ title: `${prefix} Event`, kind: 'attendance', status: 'upcoming',
  startTime: Date.now() + 600000, endTime: Date.now() + 3600000,
  penaltyValue: 1, penaltyUnit: 'hours', sanctionRules: { late: { value: 1, unit: 'hours' }, absent: { value: 1, unit: 'hours' } },
  participantsType: 'all', target: { all: true }, geofenceEnabled: false, location: { lat: 0, lng: 0, radius_meters: 0 }, ...extra });
const balance = data => data.sanctions.reduce((total, row) => total + Number(row.data.change), 0);

try {
  checked(await admin.auth.signInWithPassword({ email: credentials.email, password: credentials.password }));
  for (const [suffix, parent, type] of [['school', null, 'school'], ['department', 'school', 'department'], ['section','department','section'], ['sibling','department','section'], ['outside','school','section']]) {
    const id = `${prefix}-${suffix}`;
    checked(await admin.rpc('rmc_command', { action: 'addSchoolNode', args: [parent ? `${prefix}-${parent}` : null, { id, name: `${prefix} ${suffix}`, type }] }));
    nodes.push(id);
  }
  const head = await account('student', `${prefix}-section`, 'head');
  const student = await account('student', `${prefix}-section`);
  const peer = await account('student', `${prefix}-sibling`, 'peer');
  const outsider = await account('student', `${prefix}-outside`, 'outside');
  const osas = await account('ossa', `${prefix}-department`);
  const ssg = await account('ssg', `${prefix}-department`);
  const org = await command(admin, 'create', { name: `${prefix} Club`, node_id: `${prefix}-department`, head_ids: [head.id], joining: 'approval', key_required: true, key: 'secret-key', visible: true });
  organizations.push(org);
  assert.equal((await snapshot(head.who)).organizations.find(o => o.id === org).head_ids[0], head.id);
  pass('student can be appointed head without a global privileged role');
  const publicItems = checked(await anon.rpc('rmc_public_organizations'));
  assert.ok(publicItems.some(o => o.id === org));
  assert.ok(!JSON.stringify(publicItems).includes('secret-key'));
  assert.ok(!publicItems.find(o => o.id === org).head_ids);
  assert.ok((await anon.from('rmc_organization_members').select('*')).error);
  pass('public discovery includes visible organizations without heads, keys, or rosters');
  await denied(student.who, 'update', { organizationId: org, visible: false }, 'ordinary students cannot manage organizations');
  await denied(student.who, 'join', { organizationId: org, key: 'wrong-key' }, 'wrong join keys are rejected');
  await denied(outsider.who, 'join', { organizationId: org, key: 'secret-key' }, 'students outside the organization unit cannot join');
  await command(student.who, 'join', { organizationId: org, key: 'secret-key' });
  assert.equal((await snapshot(student.who)).organization_members.find(m => m.organization_id === org).status, 'pending');
  await denied(student.who, 'reviewMember', { organizationId: org, studentId: student.id, status: 'approved' }, 'students cannot approve their own application');
  await command(head.who, 'reviewMember', { organizationId: org, studentId: student.id, status: 'approved' });
  pass('heads can see and approve pending applications');
  await denied(head.who, 'addMember', { organizationId: org, studentId: peer.id }, 'heads cannot manually add students outside their own academic unit');
  await command(head.who, 'addMember', { organizationId: org, studentId: head.id });
  await command(head.who, 'update', { organizationId: org, visible: false });
  assert.ok(!checked(await anon.rpc('rmc_public_organizations')).some(o => o.id === org));
  assert.ok(!(await snapshot(peer.who)).organizations.some(o => o.id === org));
  assert.ok((await snapshot(student.who)).organizations.some(o => o.id === org));
  await denied(peer.who, 'join', { organizationId: org, key: 'secret-key' }, 'hidden organizations cannot be self joined');
  pass('hidden organizations remain accessible to members and heads only');
  await denied(head.who, 'update', { organizationId: org, head_ids: [outsider.id] }, 'heads cannot grant head access or expand their scope');
  await command(head.who, 'update', { organizationId: org, visible: true, joining: 'open', key_required: false });
  await command(peer.who, 'join', { organizationId: org });
  assert.equal((await snapshot(peer.who)).organization_members.find(m => m.organization_id === org).status, 'approved');
  pass('open joining without a key admits eligible students immediately');
  const general = await command(admin, 'create', { name: `${prefix} General`, node_id: null, head_ids: [head.id], joining: 'open' }); organizations.push(general);
  await command(student.who, 'join', { organizationId: general });
  assert.equal((await snapshot(student.who)).organization_members.filter(m => m.status === 'approved').length, 2);
  pass('students can join several organizations, including school-wide organizations');
  const request = await command(head.who, 'requestSanction', { organizationId: org, studentId: student.id, hours: 2, reason: 'Verified organization violation' });
  assert.equal(balance(await snapshot(student.who)), 0);
  await denied(head.who, 'reviewSanction', { organizationId: org, requestId: request, status: 'approved' }, 'heads cannot approve sanctions');
  await denied(admin, 'reviewSanction', { organizationId: org, requestId: request, status: 'approved' }, 'administrator submission still requires OSAS approval');
  const reviews = await Promise.all([1,2].map(() => osas.who.rpc('rmc_organization_command', { action: 'reviewSanction', payload: { organizationId: org, requestId: request, status: 'approved' } })));
  assert.equal(reviews.filter(r => !r.error).length, 1);
  assert.equal(balance(await snapshot(student.who)), 2);
  pass('concurrent OSAS approval applies a sanction exactly once');
  const rejected = await command(head.who, 'requestSanction', { organizationId: org, studentId: student.id, hours: 9, reason: 'Request to reject for testing' });
  await command(osas.who, 'reviewSanction', { organizationId: org, requestId: rejected, status: 'rejected', notes: 'Not substantiated' });
  assert.equal(balance(await snapshot(student.who)), 2); pass('rejected sanctions leave balances unchanged');
  const eid = await command(head.who, 'saveEvent', { organizationId: org, event: event({ approvalStatus: 'approved' }) }); events.push(eid);
  assert.equal(checked(await service.from('rmc_events').select('data').eq('id', eid).single()).data.approvalStatus, 'pending');
  assert.ok(!(await snapshot(student.who)).events.some(e => e.id === eid));
  await denied(head.who, 'reviewEvent', { organizationId: org, eventId: eid, status: 'approved' }, 'heads cannot self approve event sanctions');
  await command(osas.who, 'reviewEvent', { organizationId: org, eventId: eid, status: 'approved' });
  assert.ok((await snapshot(student.who)).events.some(e => e.id === eid));
  await command(head.who, 'saveEvent', { organizationId: org, eventId: eid, event: event({ title: `${prefix} Changed`, penaltyValue: 4 }) });
  assert.equal(checked(await service.from('rmc_events').select('data').eq('id', eid).single()).data.approvalStatus, 'pending');
  pass('event sanctions need OSAS approval and edits reset approval');
  const forged = await admin.rpc('rmc_command', { action: 'updateEvent', args: [eid, { approvalStatus: 'approved' }] });
  assert.ok(forged.error || checked(await service.from('rmc_events').select('data').eq('id', eid).single()).data.approvalStatus === 'pending');
  pass('generic event API cannot bypass OSAS approval');
  const merit = await command(head.who, 'saveEvent', { organizationId: org, event: event({ title: `${prefix} Merit`, kind: 'merit', meritHours: 3, startTime: Date.now() + 2500, endTime: Date.now() + 3600000 }) }); events.push(merit);
  const stored = checked(await service.from('rmc_events').select('data').eq('id', merit).single()).data;
  assert.equal(stored.approvalStatus, 'approved'); assert.equal(stored.penaltyValue, 0);
  const future = event({ kind: 'merit', meritHours: 1, penaltyValue: 0, sanctionRules: { late: { value: 0, unit: 'hours' }, absent: { value: 0, unit: 'hours' } } });
  for (const who of [admin, osas.who, ssg.who]) {
    const id = checked(await who.rpc('rmc_command', { action: 'createEvent', args: [future] })); events.push(id);
  }
  pass('admin, OSAS, SSG, and organization heads can create merit events');
  // Allow for small differences between the workstation and database clocks.
  await new Promise(resolve => setTimeout(resolve, Math.max(0, stored.startTime - Date.now() + 5000)));
  const attendance = (who, direction, studentId = student.id) => who.rpc('rmc_record_attendance', { event_id: merit, student_id: studentId, direction, manual_reason: 'Identity verified in person' });
  assert.ok((await attendance(student.who, 'in')).error);
  assert.ok((await attendance(head.who, 'in', outsider.id)).error);
  checked(await attendance(head.who, 'in'));
  const outs = await Promise.all([attendance(head.who, 'out'), attendance(head.who, 'out')]); outs.forEach(checked);
  const completed = await snapshot(student.who);
  assert.equal(balance(completed), 0);
  assert.equal(completed.merit_credits.filter(c => c.event_id === merit).reduce((sum,c) => sum + Number(c.hours),0), 1);
  pass('head attendance clears two sanction hours and awards one excess merit exactly once');
  await command(head.who, 'removeMember', { organizationId: org, studentId: student.id });
  assert.ok(!(await snapshot(student.who)).organization_members.some(m => m.organization_id === org));
  assert.ok(!(await snapshot(student.who)).events.some(e => e.id === merit));
  pass('removing membership revokes organization event access');
  const direct = await student.who.from('rmc_organization_members').insert({ organization_id: org, student_id: student.id, status: 'approved' });
  assert.ok(direct.error); pass('direct table writes cannot bypass membership checks');
  fs.writeFileSync('.organization-verification.local', JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2));
  console.log(`${checks.length} organization checks passed.`);
} finally {
  if (events.length) {
    checked(await service.from('rmc_merit_credits').delete().in('event_id', events));
    checked(await service.from('rmc_sanctions').delete().in('event_id', events));
    checked(await service.from('rmc_attendance').delete().in('event_id', events));
    checked(await service.from('rmc_events').delete().in('id', events));
  }
  if (organizations.length) {
    checked(await service.from('rmc_organization_sanctions').delete().in('organization_id', organizations));
    checked(await service.from('rmc_organizations').delete().in('id', organizations));
  }
  if (users.length) checked(await service.from('rmc_sanctions').delete().in('student_id', users));
  for (const id of users.reverse()) checked(await service.auth.admin.deleteUser(id));
  for (const id of nodes.reverse()) checked(await service.from('rmc_nodes').delete().eq('id', id));
  checked(await service.from('rmc_audit').delete().like('data->>target_name', `${prefix}%`));
  console.log('Temporary organization verification records removed.');
}
