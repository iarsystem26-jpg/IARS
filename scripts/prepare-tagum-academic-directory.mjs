import assert from 'node:assert/strict';
import fs from 'node:fs';

// Prepare only. Run the resulting SQL through Supabase MCP after inspecting
// the live directory. This script never connects to or changes a database.
const rootName = 'Rizal Memorial Colleges, Inc., Tagum Campus';
const rows = [];
const add = (key, parent, name, type, metadata = {}) => {
  const id = `tagum_2026_2027_${key}`;
  rows.push({ id, parent_id: parent, data: { id, name, type, metadata: {
    schemaVersion: 2, academicYear: '2026-2027',
    selectableForEvents: true, selectableForRegistration: true, ...metadata,
  } } });
  return id;
};
const junior = add('jhs', null, 'Junior High School', 'education_unit', { educationLevel: 'jhs' });
for (const [grade, sections] of [[7, ['Sapphire']], [8, ['Ametrine', 'Emerald']], [9, ['Labradorite']]]) {
  const parent = add(`jhs_g${grade}`, junior, `Grade ${grade}`, 'grade_level');
  for (const name of sections) add(`jhs_g${grade}_${name.toLowerCase()}`, parent, name, 'section');
}
const senior = add('shs', null, 'Senior High School', 'education_unit', { educationLevel: 'shs' });
const groups = {
  11: [
    ['Business and Entrepreneurship', ['Delphinus']],
    ['Social Sciences and Humanities', ['Auriga', 'Orion', 'Leo', 'Hercules', 'Lyra']],
    ['Engineering', ['Aries', 'Aquarius']],
    ['Health and Sciences', ['Aquila', 'Hydra', 'Perseus']],
    ['TVL–Kitchen Op.', ['Taurus']],
    ['TVL–Bakery Op.', ['Carina']],
    ['ICT–CSS', ['Sagittarius', 'Pisces']],
  ],
  12: [
    ['ABM', ['Pythagoras', 'Fleming']],
    ['GAS', ['Aristotle', 'Carson']],
    ['HUMSS', ['Da Vinci', 'Descartes', 'Tharp']],
    ['STEM', ['Darwin', 'Franklin', 'Galilei', 'Hawking', 'Newton']],
    ['TVL–ICT', ['Faraday']],
    ['TVL–HE', ['Mendeleev']],
  ],
};
// Keep the two cohorts' terminology distinct. Custom child rules allow each
// grade to contain its printed strands/specializations, then their sections.
for (const [grade, entries] of Object.entries(groups)) {
  const parent = add(`shs_g${grade}`, senior, `Grade ${grade}`, 'grade_level', {
    curriculumCode: grade === '11' ? 'strengthened_shs' : 'legacy_shs',
    allowedChildTypes: ['strand', 'specialization', 'section'],
  });
  for (const [index, [name, sections]] of entries.entries()) {
    const group = add(`shs_g${grade}_group${index + 1}`, parent, name,
      grade === '11' ? 'specialization' : 'strand', { allowedChildTypes: ['section'] });
    for (const section of sections) add(`shs_g${grade}_${section.toLowerCase().replaceAll(' ', '_')}`, group, section, 'section');
  }
}
assert.equal(rows.filter(row => row.data.type === 'section').length, 33);
assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
const visited = new Set();
for (const row of rows) {
  assert.ok(row.parent_id === null || visited.has(row.parent_id), `Missing parent for ${row.id}`);
  visited.add(row.id);
}
const literal = value => `'${value.replaceAll("'", "''")}'`;
const adminId = process.argv[2];
if (adminId) assert.match(adminId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const sql = `-- Prepared import; NOT applied. No rooms or advisers are included.
-- Run with Supabase MCP execute_sql. Existing College Department is preserved.
-- Before execution, inspect the live schema/triggers and establish a verified
-- active administrator JWT context within this transaction; the existing
-- enforce_unit_creation trigger requires it. Never disable that trigger.
begin;
${adminId ? `-- Verified active administrator, transaction-local context for existing permission triggers.\nselect set_config('request.jwt.claim.sub', ${literal(adminId)}, true);\nselect set_config('request.jwt.claims', ${literal(JSON.stringify({ sub: adminId, role: 'authenticated', aal: 'aal1' }))}, true);` : '-- Establish a verified active administrator context before running this import.'}
select pg_advisory_xact_lock(hashtext('rmc-directory'));
do $import$
declare
  campus_id text;
  item jsonb;
  parent text;
  expected jsonb := ${literal(JSON.stringify(rows))}::jsonb;
begin
  if not exists (select 1 from public.rmc_profiles where id = auth.uid()
    and role_id = 'admin' and status = 'active') then
    raise exception 'Import requires a verified active administrator context';
  end if;
  select id into strict campus_id from public.rmc_nodes
  where parent_id is null and data->>'name' = ${literal(rootName)};
  for item in select value from jsonb_array_elements(expected) loop
    parent := coalesce(item->>'parent_id', campus_id);
    if exists (select 1 from public.rmc_nodes where parent_id = parent
      and lower(data->>'name') = lower(item#>>'{data,name}') and id <> item->>'id') then
      raise exception 'Existing matching unit requires reconciliation: %', item#>>'{data,name}';
    end if;
    if exists (select 1 from public.rmc_nodes where id = item->>'id'
      and (parent_id is distinct from parent or data->>'name' is distinct from item#>>'{data,name}'
        or data->>'type' is distinct from item#>>'{data,type}'
        or data#>>'{metadata,archived}' = 'true')) then
      raise exception 'Conflicting or archived import ID: %', item->>'id';
    end if;
    insert into public.rmc_nodes (id, parent_id, data)
    values (item->>'id', parent, item->'data') on conflict (id) do nothing;
  end loop;
  if (select count(*) from public.rmc_nodes n join jsonb_array_elements(expected) e
    on n.id = e->>'id' where n.data->>'type' = 'section') <> 33 then
    raise exception 'Expected 33 imported sections';
  end if;
end;
$import$;
commit;

-- Independent readback for verification after the transaction.
select id, parent_id, data->>'name' as name, data->>'type' as type,
  data->'metadata' as metadata from public.rmc_nodes
where starts_with(id, 'tagum_2026_2027_') order by id;
`;
fs.writeFileSync('scripts/import-tagum-academic-directory.sql', sql);
console.log(`Prepared ${rows.length} academic nodes including 33 sections. No database changes made.`);
