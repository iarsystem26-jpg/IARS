import { describe, expect, it } from 'vitest';
import {
  getProfileSchoolName,
  profileMatchesDirectorySection,
  createAcademicPreset,
  createEventAudienceTarget,
  findNodePath,
  getAllowedChildTypes,
  migrateAcademicDirectory,
  serializeAcademicAssignment,
  validateChildType,
} from './academicDirectory';
import type { SchoolNode, UserProfile } from '../types';

describe('account school / branch identity', () => {
  const nodes: SchoolNode[] = [{ id: 'campus', name: 'Campus container', type: 'campus', children: [
    { id: 'branch-a', name: 'School Branch A', type: 'education_unit', children: [{ id: 'a-section', name: 'Shared Section', type: 'section' }] },
    { id: 'branch-b', name: 'School Branch B', type: 'education_unit', children: [{ id: 'b-section', name: 'Shared Section', type: 'section' }] },
  ] }];
  const profile = { school_data: { section: 'Shared Section', academic_assignment: { terminalGroupId: 'b-section' } } } as UserProfile;

  it('uses the first academic unit on the assigned path, rather than the first sibling or campus container', () => {
    expect(getProfileSchoolName(profile, nodes)).toBe('School Branch B');
    expect(getProfileSchoolName(profile, [{ ...nodes[0], children: [...nodes[0].children!].reverse() }])).toBe('School Branch B');
    const renamed = structuredClone(nodes);
    renamed[0].children![1].name = 'A renamed school with a long branch name';
    expect(getProfileSchoolName(profile, renamed)).toBe('A renamed school with a long branch name');
  });

  it('resolves official assignments and units that are directory roots', () => {
    expect(getProfileSchoolName({ ...profile, official_data: { body: 'OSSA', assignment_node_id: 'a-section' } }, nodes)).toBe('School Branch A');
    expect(getProfileSchoolName(profile, nodes[0].children!)).toBe('School Branch B');
  });

  it('resolves legacy enrollment only when its branch is unambiguous', () => {
    const legacy = { school_data: { section: 'Shared Section' } } as UserProfile;
    expect(getProfileSchoolName(legacy, nodes)).toBe('School / branch not assigned');
    expect(getProfileSchoolName({ ...legacy, school_data: { ...legacy.school_data, department: 'School Branch B' } }, nodes)).toBe('School Branch B');
    expect(getProfileSchoolName(null, nodes)).toBe('School / branch not assigned');
  });
});

const collectTypes = (node: any): string[] => [
  node.type,
  ...(node.children || []).flatMap(collectTypes),
];

describe('academic directory presets', () => {
  it('creates Junior High School grades without track or strand parents', () => {
    const preset = createAcademicPreset('jhs', 'RMC Main Campus');
    expect(preset.name).toBe('Junior High School');
    expect(preset.children?.map((node) => node.name)).toEqual(['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']);
    expect(collectTypes(preset)).not.toContain('track');
    expect(collectTypes(preset)).not.toContain('strand');
  });

  it('creates Strengthened SHS with Academic and TechPro but no legacy strands', () => {
    const preset = createAcademicPreset('strengthened_shs', 'RMC Main Campus');
    expect(preset.children?.map((node) => node.name)).toEqual(['Academic', 'Technical Professional (TechPro)']);
    expect(collectTypes(preset)).not.toContain('strand');
    expect(preset.metadata?.curriculumCode).toBe('strengthened_shs');
  });

  it('retains legacy academic strands for transition cohorts', () => {
    const preset = createAcademicPreset('legacy_shs', 'RMC Main Campus');
    const academic = preset.children?.find((node) => node.name === 'Academic');
    expect(academic?.children?.map((node) => node.name)).toEqual(['STEM', 'ABM', 'HUMSS', 'GAS']);
  });

  it('creates higher education around colleges and programs with optional majors', () => {
    const preset = createAcademicPreset('higher_ed', 'RMC Main Campus');
    expect(preset.children?.[0].type).toBe('college');
    expect(getAllowedChildTypes(preset.children![0])).toContain('program');
    expect(getAllowedChildTypes({ id: 'p', name: 'BSIT', type: 'program' })).toEqual(['major', 'year_level']);
  });

  it('creates a blank editable unit without imposing a hierarchy', () => {
    const preset = createAcademicPreset('blank', 'RMC Main Campus');
    expect(preset).toMatchObject({ name: 'RMC Main Campus Academic Unit', type: 'education_unit', children: [] });
    expect(preset.metadata?.allowedChildTypes).toEqual(expect.arrayContaining(['custom', 'grade_level', 'year_level', 'section', 'block']));
  });
});

describe('legacy directory migration', () => {
  it('maps legacy JHS and college aliases by path context without changing IDs', () => {
    const legacy: any[] = [{
      id: 'school-rmc', name: 'RMC', type: 'school', children: [
        { id: 'jhs', name: 'Junior High School', type: 'department', children: [
          { id: 'g7', name: 'Grade 7', type: 'level', children: [{ id: 'narra', name: 'Narra', type: 'section' }] },
        ] },
        { id: 'college-root', name: 'College', type: 'department', children: [
          { id: 'cas', name: 'College of Arts and Sciences', type: 'track', children: [
            { id: 'bscs', name: 'BS Computer Science', type: 'strand', children: [{ id: 'cs1a', name: 'CS-1A', type: 'section' }] },
          ] },
        ] },
      ],
    }];

    const result = migrateAcademicDirectory(legacy);
    expect(result.changed).toBe(true);
    expect(findNodePath(result.nodes, 'g7')?.at(-1)?.type).toBe('grade_level');
    expect(findNodePath(result.nodes, 'cas')?.at(-1)?.type).toBe('college');
    expect(findNodePath(result.nodes, 'bscs')?.at(-1)?.type).toBe('program');
    expect(findNodePath(result.nodes, 'cs1a')?.at(-1)?.type).toBe('block');
    expect(findNodePath(result.nodes, 'bscs')?.map((entry) => entry.id)).toEqual(['school-rmc', 'college-root', 'cas', 'bscs']);
  });

  it('is idempotent after semantic types are assigned', () => {
    const current = [createAcademicPreset('jhs', 'RMC')];
    const first = migrateAcademicDirectory(current);
    const second = migrateAcademicDirectory(first.nodes);
    expect(first.changed).toBe(false);
    expect(second.changed).toBe(false);
    expect(second.nodes).toEqual(first.nodes);
  });

  it('flags ambiguous legacy unit aliases for administrator review', () => {
    const legacy: any[] = [{ id: 'root', name: 'RMC', type: 'school', children: [
      { id: 'unmapped', name: 'Special Learning Unit', type: 'special', children: [] },
    ] }];

    const result = migrateAcademicDirectory(legacy);
    expect(result.needsReview).toEqual(['unmapped']);
    expect(findNodePath(result.nodes, 'unmapped')?.at(-1)).toMatchObject({
      id: 'unmapped',
      type: 'custom',
      metadata: { legacyType: 'special', migrationStatus: 'needs_review' },
    });
  });
});

describe('semantic directory behavior', () => {
  it('rejects a strand directly under Junior High School', () => {
    const jhs = createAcademicPreset('jhs', 'RMC Main Campus');
    expect(validateChildType(jhs, 'strand')).toBe(false);
    expect(validateChildType(jhs, 'grade_level')).toBe(true);
  });

  it('finds a stable path and serializes canonical and compatibility assignment data', () => {
    const jhs = createAcademicPreset('jhs', 'RMC Main Campus');
    const grade7 = jhs.children![0];
    grade7.children = [{ id: 'section-narra', name: 'Narra', type: 'section' }];
    const path = findNodePath([jhs], 'section-narra');

    expect(path?.map((node) => node.name)).toEqual(['Junior High School', 'Grade 7', 'Narra']);
    expect(serializeAcademicAssignment(path!)).toEqual({
      assignment: {
        campusId: '',
        nodePathIds: [jhs.id, grade7.id, 'section-narra'],
        terminalGroupId: 'section-narra',
        curriculumCode: 'matatag',
      },
      schoolData: {
        type: 'High School',
        department: 'Junior High School',
        level: 'Grade 7',
        section: 'Narra',
      },
    });
  });

  it('serializes an unmigrated legacy college path using higher-education semantics', () => {
    const path: any[] = [
      { id: 'campus', name: 'RMC', type: 'school' },
      { id: 'higher-ed', name: 'College', type: 'department' },
      { id: 'cas', name: 'College of Arts and Sciences', type: 'track' },
      { id: 'bscs', name: 'BS Computer Science', type: 'strand' },
      { id: 'cs1a', name: 'CS-1A', type: 'section' },
    ];

    expect(serializeAcademicAssignment(path).schoolData).toEqual({
      type: 'College',
      department: 'College of Arts and Sciences',
      program: 'BS Computer Science',
      level: '',
      section: 'CS-1A',
    });
  });

  it('builds a path-based event audience for arbitrary academic nodes', () => {
    const path: any[] = [
      { id: 'campus', name: 'RMC', type: 'campus' },
      { id: 'higher-ed', name: 'Higher Education', type: 'education_unit' },
      { id: 'bsit', name: 'BS Information Technology', type: 'program' },
    ];
    expect(createEventAudienceTarget(path)).toEqual({
      audienceTarget: { mode: 'directory_node', nodeId: 'bsit', includeDescendants: true, snapshotLabel: 'RMC / Higher Education / BS Information Technology' },
      participantsType: 'department',
      targetValue: 'BS Information Technology',
    });
  });
});

it('keeps same-named sections separate by assignment ID or an unambiguous department', () => {
  const nodes: any = ['Engineering', 'Business'].map((name, index) => ({
    id: `dept-${index}`, name, type: 'department',
    children: [{ id: `section-${index}`, name: 'A', type: 'section' }],
  }));
  const profile: any = { school_data: { section: 'A', department: 'Engineering', academic_assignment: { terminalGroupId: 'section-1' } } };
  expect(profileMatchesDirectorySection(profile, 'section-0', nodes)).toBe(false);
  expect(profileMatchesDirectorySection(profile, 'section-1', nodes)).toBe(true);
  delete profile.school_data.academic_assignment;
  expect(profileMatchesDirectorySection(profile, 'section-0', nodes)).toBe(true);
  expect(profileMatchesDirectorySection(profile, 'section-1', nodes)).toBe(false);
  delete profile.school_data.department;
  expect(profileMatchesDirectorySection(profile, 'section-0', nodes)).toBe(false);
});
