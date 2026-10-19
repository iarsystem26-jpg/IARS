import {
  AcademicAssignment,
  AcademicNodeType,
  AcademicPresetId,
  SchoolNode,
  UserProfile,
} from '../types';

const childRules: Partial<Record<AcademicNodeType, AcademicNodeType[]>> = {
  campus: ['education_unit', 'college', 'custom'],
  school: ['education_unit', 'department', 'college', 'custom'],
  education_unit: ['curriculum', 'track', 'grade_level', 'college', 'program', 'custom'],
  curriculum: ['track', 'grade_level', 'custom'],
  department: ['college', 'program', 'grade_level', 'track', 'custom'],
  college: ['department', 'program', 'custom'],
  track: ['strand', 'grade_level', 'specialization', 'elective_cluster', 'custom'],
  strand: ['grade_level', 'specialization', 'custom'],
  program: ['major', 'year_level'],
  major: ['year_level'],
  grade_level: ['section'],
  year_level: ['block', 'section'],
  level: ['section', 'block'],
  custom: ['custom', 'grade_level', 'year_level', 'section', 'block'],
};

const node = (
  id: string,
  name: string,
  type: AcademicNodeType,
  children: SchoolNode[] = [],
  metadata: SchoolNode['metadata'] = {},
): SchoolNode => ({ id, name, type, children, metadata });

export const createAcademicPreset = (preset: AcademicPresetId, campusName = 'Campus'): SchoolNode => {
  const token = `${preset}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const grades = (prefix: string, values: number[], type: 'grade_level' | 'year_level' = 'grade_level') =>
    values.map((value) => node(`${token}_${prefix}_${value}`, type === 'grade_level' ? `Grade ${value}` : `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'} Year`, type));

  if (preset === 'jhs') {
    return node(`${token}_root`, 'Junior High School', 'education_unit', grades('grade', [7, 8, 9, 10]), {
      educationLevel: 'jhs', curriculumCode: 'matatag', selectableForEvents: true,
      allowedChildTypes: ['grade_level', 'specialization', 'custom'],
    });
  }

  if (preset === 'strengthened_shs') {
    return node(`${token}_root`, 'Strengthened Senior High School', 'education_unit', [
      node(`${token}_academic`, 'Academic', 'track', grades('academic_grade', [11, 12])),
      node(`${token}_techpro`, 'Technical Professional (TechPro)', 'track', grades('techpro_grade', [11, 12])),
    ], { educationLevel: 'shs', curriculumCode: 'strengthened_shs', selectableForEvents: true });
  }

  if (preset === 'legacy_shs') {
    const strands = ['STEM', 'ABM', 'HUMSS', 'GAS'].map((name) =>
      node(`${token}_${name.toLowerCase()}`, name, 'strand', grades(`${name.toLowerCase()}_grade`, [11, 12])),
    );
    return node(`${token}_root`, 'Legacy Senior High School', 'education_unit', [
      node(`${token}_academic`, 'Academic', 'track', strands),
      node(`${token}_tvl`, 'TVL', 'track'),
      node(`${token}_arts`, 'Arts and Design', 'track'),
      node(`${token}_sports`, 'Sports', 'track'),
    ], { educationLevel: 'shs', curriculumCode: 'legacy_shs', selectableForEvents: true });
  }

  if (preset === 'higher_ed') {
    return node(`${token}_root`, 'Higher Education', 'education_unit', [
      node(`${token}_college`, 'New College', 'college'),
    ], { educationLevel: 'higher_ed', selectableForEvents: true });
  }

  return node(`${token}_root`, `${campusName} Academic Unit`, 'education_unit', [], {
    educationLevel: 'other', allowedChildTypes: ['custom', 'grade_level', 'year_level', 'section', 'block'],
  });
};

export const getAllowedChildTypes = (parent: Partial<SchoolNode> & { type: AcademicNodeType }): AcademicNodeType[] =>
  parent.metadata?.allowedChildTypes || childRules[parent.type] || [];

export const validateChildType = (parent: Pick<SchoolNode, 'type' | 'metadata'>, childType: AcademicNodeType): boolean =>
  getAllowedChildTypes(parent).includes(childType);

export const flattenDirectory = (nodes: SchoolNode[]): SchoolNode[] =>
  nodes.flatMap((item) => [item, ...flattenDirectory(item.children || [])]);

export const findNodeById = (nodes: SchoolNode[], id: string): SchoolNode | undefined =>
  flattenDirectory(nodes).find((item) => item.id === id);

export const findNodePath = (nodes: SchoolNode[], id: string): SchoolNode[] | undefined => {
  for (const item of nodes) {
    if (item.id === id) return [item];
    const childPath = findNodePath(item.children || [], id);
    if (childPath) return [item, ...childPath];
  }
  return undefined;
};

/** The first academic unit below a campus container identifies the school/branch. */
export const getProfileSchoolName = (profile: UserProfile | null | undefined, nodes: SchoolNode[]): string => {
  if (!profile) return 'School / branch not assigned';
  const assignment = profile.school_data?.academic_assignment;
  const ids = [
    profile.official_data?.assignment_node_id,
    ...(profile.official_data?.assignment_node_path_ids || []).slice().reverse(),
    assignment?.terminalGroupId,
    ...(assignment?.nodePathIds || []).slice().reverse(),
  ];
  let path = ids.filter(Boolean).map(id => findNodePath(nodes, id!)).find(Boolean);
  // Older accounts store names instead of a directory path. Resolve only unique matches.
  if (!path) {
    const matches = flattenDirectory(nodes).filter(node =>
      ['section', 'block'].includes(node.type) && node.name === profile.school_data?.section
      && (!profile.school_data?.department || findNodePath(nodes, node.id)?.some(parent => parent.name === profile.school_data.department)),
    );
    if (matches.length === 1) path = findNodePath(nodes, matches[0].id);
  }
  if (!path) {
    const matches = flattenDirectory(nodes).filter(node => node.name === profile.school_data?.department);
    if (matches.length === 1) path = findNodePath(nodes, matches[0].id);
  }
  if (!path) {
    const container = findNodeById(nodes, assignment?.campusId || profile.school_data?.school_id || '');
    if (container) {
      const children = (container.children || []).filter(node => !node.metadata?.archived);
      path = ['campus', 'school'].includes(container.type) && children.length === 1
        ? [container, children[0]] : [container];
    }
  }
  return (path?.find(node => !['campus', 'school'].includes(node.type)) || path?.[0])?.name.trim() || 'School / branch not assigned';
};

export const getDirectorySubtree = (nodes: SchoolNode[], rootId: string): SchoolNode[] => {
  const root = findNodeById(nodes, rootId);
  return root ? [root] : [];
};

export const isNodeInSubtree = (nodes: SchoolNode[], rootId: string, candidateId: string): boolean => {
  const root = findNodeById(nodes, rootId);
  return Boolean(root && findNodeById([root], candidateId));
};

const semanticType = (type: AcademicNodeType): AcademicNodeType => {
  if (type === 'school') return 'campus';
  if (type === 'level') return 'grade_level';
  return type;
};

export const serializeAcademicAssignment = (path: SchoolNode[]): {
  assignment: AcademicAssignment;
  schoolData: Pick<UserProfile['school_data'], 'type' | 'department' | 'track' | 'strand' | 'program' | 'major' | 'level' | 'section'>;
} => {
  const higherEducationContext = path.some((item) =>
    item.metadata?.educationLevel === 'higher_ed'
    || ['college', 'program', 'year_level', 'block'].includes(item.type)
    || (item.type === 'department' && /\bcollege\b|higher education/i.test(item.name)),
  );
  const contextualType = (item: SchoolNode): AcademicNodeType => {
    const type = semanticType(item.type);
    if (!higherEducationContext) return type;
    if (type === 'track') return 'college';
    if (type === 'strand') return 'program';
    if (type === 'grade_level') return 'year_level';
    if (type === 'section') return 'block';
    return type;
  };
  const byType = (type: AcademicNodeType) => path.find((item) => contextualType(item) === type);
  const unit = byType('education_unit') || byType('department');
  const college = byType('college');
  const program = byType('program');
  const major = byType('major');
  const track = byType('track');
  const strand = byType('strand');
  const level = byType('grade_level') || byType('year_level');
  const terminal = [...path].reverse().find((item) => ['section', 'block'].includes(contextualType(item)));
  const campus = byType('campus');
  const curriculumCode = [...path].reverse().find((item) => item.metadata?.curriculumCode)?.metadata?.curriculumCode;
  const isCollege = Boolean(college || program || path.some((item) => item.metadata?.educationLevel === 'higher_ed'));

  const schoolData: any = {
    type: isCollege ? 'College' : 'High School',
    department: college?.name || unit?.name,
    level: level?.name || '',
    section: terminal?.name || '',
  };
  if (track) schoolData.track = track.name;
  if (strand) schoolData.strand = strand.name;
  if (program) schoolData.program = program.name;
  if (major) schoolData.major = major.name;

  return {
    assignment: {
      campusId: campus?.id || '',
      nodePathIds: path.map((item) => item.id),
      terminalGroupId: terminal?.id || path[path.length - 1]?.id || '',
      ...(curriculumCode ? { curriculumCode } : {}),
    },
    schoolData,
  };
};

export const getAcademicNodeLabel = (type: AcademicNodeType): string => ({
  campus: 'Campus', school: 'Campus', education_unit: 'Education Unit', curriculum: 'Curriculum',
  college: 'College / School', department: 'Department', track: 'Track', elective_cluster: 'Elective Cluster',
  strand: 'Legacy Strand', program: 'Degree Program', major: 'Major / Specialization', grade_level: 'Grade Level',
  year_level: 'Year Level', level: 'Level', section: 'Section', block: 'Block / Section', specialization: 'Specialization',
  custom: 'Custom Unit', sub_department: 'Academic Unit', secondary: 'Secondary Unit', elementary: 'Elementary Unit', special: 'Special Unit',
}[type]);

export const academicNodeTypeOptions: AcademicNodeType[] = [
  'education_unit', 'curriculum', 'college', 'department', 'track', 'elective_cluster', 'strand',
  'program', 'major', 'grade_level', 'year_level', 'section', 'block', 'specialization', 'custom',
];

export const migrateAcademicDirectory = (nodes: SchoolNode[]): {
  nodes: SchoolNode[];
  changed: boolean;
  needsReview: string[];
} => {
  let changed = false;
  const needsReview: string[] = [];

  const migrate = (item: SchoolNode, ancestors: SchoolNode[]): SchoolNode => {
    const parent = ancestors[ancestors.length - 1];
    const rootUnit = ancestors.find((entry) => entry.type === 'department' || entry.type === 'education_unit');
    const collegeContext = Boolean(
      rootUnit?.metadata?.educationLevel === 'higher_ed'
      || /\bcollege\b|higher education/i.test(rootUnit?.name || '')
      || ancestors.some((entry) => entry.type === 'college'),
    );
    const jhsContext = /junior high/i.test(rootUnit?.name || item.name);
    const shsContext = /senior high/i.test(rootUnit?.name || item.name);
    let type = item.type;
    let educationLevel = item.metadata?.educationLevel;
    const needsManualReview = ['sub_department', 'secondary', 'elementary', 'special'].includes(item.type);

    if (needsManualReview) {
      type = 'custom';
      needsReview.push(item.id);
    } else if (type === 'school') type = 'campus';
    else if (type === 'department' && !parent?.id) type = 'education_unit';
    else if (type === 'department' && (jhsContext || shsContext || /\bcollege\b/i.test(item.name))) type = 'education_unit';
    else if (collegeContext && type === 'track') type = 'college';
    else if (collegeContext && type === 'strand') type = 'program';
    else if (collegeContext && type === 'section') type = 'block';
    else if (type === 'level') type = collegeContext ? 'year_level' : 'grade_level';

    if (/junior high/i.test(item.name)) educationLevel = 'jhs';
    else if (/senior high/i.test(item.name)) educationLevel = 'shs';
    else if (/^college$|higher education/i.test(item.name)) educationLevel = 'higher_ed';

    if (type !== item.type || educationLevel !== item.metadata?.educationLevel) changed = true;
    const migrated: SchoolNode = {
      ...item,
      type,
      metadata: {
        ...(item.metadata || {}),
        ...(educationLevel ? { educationLevel } : {}),
        ...(type !== item.type ? {
          legacyType: item.type,
          migrationStatus: needsManualReview ? 'needs_review' as const : 'migrated' as const,
        } : {}),
        schemaVersion: 2,
      },
    };
    migrated.children = (item.children || []).map((child) => migrate(child, [...ancestors, migrated]));
    return migrated;
  };

  return { nodes: nodes.map((item) => migrate(item, [])), changed, needsReview };
};

export const createEventAudienceTarget = (path: SchoolNode[]): {
  audienceTarget: NonNullable<import('../types').AppEvent['audienceTarget']>;
  participantsType: import('../types').AppEvent['participantsType'];
  targetValue: string;
} => {
  const selected = path[path.length - 1];
  const type = selected?.type;
  const participantsType = ['section', 'block'].includes(type) ? 'section'
    : ['grade_level', 'year_level', 'level'].includes(type) ? 'level'
      : type === 'strand' ? 'strand'
        : type === 'track' ? 'track'
          : 'department';
  return {
    audienceTarget: {
      mode: 'directory_node', nodeId: selected?.id, includeDescendants: true,
      snapshotLabel: path.map((item) => item.name).join(' / '),
    },
    participantsType,
    targetValue: selected?.name || 'Selected directory group',
  };
};

// IDs take precedence; legacy names must resolve to one section across the directory.
export const profileMatchesDirectorySection = (profile: UserProfile, sectionId: string, nodes: SchoolNode[]): boolean => {
  const data = profile.school_data;
  const assignment = data?.academic_assignment;
  if (assignment?.terminalGroupId) return assignment.terminalGroupId === sectionId;
  if (assignment?.nodePathIds?.length) return assignment.nodePathIds.includes(sectionId);
  const normalize = (value?: string) => value?.trim().toLowerCase();
  const matches = flattenDirectory(nodes).filter(node => {
    if (!['section', 'block'].includes(node.type) || normalize(node.name) !== normalize(data?.section)) return false;
    const path = findNodePath(nodes, node.id) || [];
    return !data?.department || path.some(parent => normalize(parent.name) === normalize(data.department));
  });
  return matches.length === 1 && matches[0].id === sectionId;
};
