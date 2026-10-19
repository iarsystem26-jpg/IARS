# Customizable DepEd and CHED Academic Directory Design

## Purpose

Replace the application's fixed `school → department → track → strand → level → section` assumption with a customizable, typed academic directory that supports current DepEd Junior High School, legacy and Strengthened Senior High School, and CHED higher-education structures.

The feature must preserve existing learners, events, and directory records while allowing authorized officers to adapt the hierarchy to the institution's actual organization.

## Scope

This design covers:

- Academic directory types, presets, and customization
- Migration of the existing mock/local database
- Directory administration in the SSG panel and member-management screen
- Learner registration and academic assignment
- Event audience targeting
- Backward compatibility with existing profiles and events
- Validation, recovery, and automated testing

It does not attempt to model subject enrollment, grading, curriculum delivery, room scheduling, or CHED accreditation workflows. Metadata such as a COPC number may be recorded, but this application will not determine regulatory compliance.

## Design Principles

1. Regulatory presets are starting points, not immutable rules.
2. Semantic node types remain stable even when display labels are renamed.
3. Official attendance grouping is separate from elective or specialization membership.
4. Existing data is never silently discarded during migration.
5. Registration and event targeting derive their controls from the directory instead of hard-coded name checks.
6. Legacy and current curricula may coexist during transition years.

## Data Model

### Academic node

Extend `SchoolNode` into a typed academic node while retaining the existing recursive shape:

```ts
type AcademicNodeType =
  | 'campus'
  | 'education_unit'
  | 'curriculum'
  | 'college'
  | 'department'
  | 'track'
  | 'elective_cluster'
  | 'strand'
  | 'program'
  | 'major'
  | 'grade_level'
  | 'year_level'
  | 'section'
  | 'block'
  | 'specialization'
  | 'custom';

interface SchoolNode {
  id: string;
  name: string;
  type: AcademicNodeType;
  children?: SchoolNode[];
  metadata?: {
    schemaVersion?: number;
    educationLevel?: 'elementary' | 'jhs' | 'shs' | 'higher_ed' | 'graduate' | 'other';
    curriculumCode?: 'matatag' | 'legacy_shs' | 'strengthened_shs' | string;
    academicYearStart?: number;
    academicYearEnd?: number;
    officialGrouping?: boolean;
    selectableForRegistration?: boolean;
    selectableForEvents?: boolean;
    allowedChildTypes?: AcademicNodeType[];
    shortCode?: string;
    programLevel?: 'certificate' | 'associate' | 'bachelor' | 'post_baccalaureate' | 'master' | 'doctorate' | string;
    durationYears?: number;
    copcNumber?: string;
    archived?: boolean;
    legacyType?: string;
    migrationStatus?: 'migrated' | 'needs_review';
    customFields?: Record<string, string | number | boolean>;
  };
}
```

Node IDs remain the durable foreign key. Names are editable labels and must not be used as identity or curriculum detection.

### Learner academic assignment

Keep the current human-readable fields for display compatibility, but add a canonical path:

```ts
interface AcademicAssignment {
  campusId: string;
  nodePathIds: string[];
  terminalGroupId: string;
  curriculumCode?: string;
  academicYear?: string;
  affiliations?: Array<{
    nodeId?: string;
    type: 'tle_specialization' | 'academic_elective' | 'techpro_elective' | 'major' | 'other';
    name: string;
  }>;
}
```

`terminalGroupId` points to the learner's official section or block. `affiliations` stores non-hierarchical elective and specialization membership.

The existing `school_data.department`, `track`, `strand`, `program`, `major`, `level`, and `section` fields remain populated during the transition so older views keep working.

### Event targeting

Replace hard-coded participant depths with path-based targets:

```ts
interface EventAudienceTarget {
  mode: 'all' | 'directory_node' | 'specific_people';
  nodeId?: string;
  includeDescendants?: boolean;
  specificUserIds?: string[];
  snapshotLabel?: string;
}
```

Existing `participantsType` and `targetValue` fields remain readable. New events store the new target plus compatibility fields derived from the selected node.

## Preset Templates

Presets create editable structures. Applying a preset never prevents later renaming, reordering, addition, or archival.

### Junior High School preset

```text
Junior High School
├── Grade 7
├── Grade 8
├── Grade 9
└── Grade 10
    └── Sections under each grade
```

TLE exploration and specialization are affiliations or optional specialization nodes, not mandatory track parents.

### Strengthened SHS preset

```text
Strengthened Senior High School
├── Academic
│   ├── Grade 11
│   └── Grade 12
└── Technical Professional (TechPro)
    ├── Grade 11
    └── Grade 12
```

Academic and TechPro elective clusters are configurable affiliations. A school may remove a track it does not offer.

### Legacy SHS preset

```text
Legacy Senior High School
├── Academic
│   ├── STEM
│   ├── ABM
│   ├── HUMSS
│   └── GAS
├── TVL
├── Arts and Design
└── Sports
```

This preset remains available for Grade 12 transition cohorts and historical records.

### Higher Education preset

```text
Higher Education
└── College / School / Faculty
    └── Degree Program
        └── Major or Specialization (optional)
            └── Year Level
                └── Block / Section
```

The college/department layer, major layer, program duration, year labels, and block naming are configurable. No SHS track or strand is required.

### Blank custom preset

Creates only a campus or education unit. Administrators choose semantic types and allowed child types as they build.

## Directory Administration Experience

### Main directory browser

The SSG Directory tab retains breadcrumb navigation and cards. Each card displays:

- Name and optional short code
- Semantic type
- Active/archived status
- Child and learner counts where available
- Curriculum badge when applicable

Available actions are Add child, Edit, Reorder, Archive, and Delete. Delete is only enabled when a node has no children, assigned learners, or referenced events. Otherwise the interface offers Archive.

### Add and edit dialog

The dialog contains:

- Display name
- Semantic node type
- Short code
- Academic-year availability
- Registration/event selection toggles
- Optional regulatory and custom metadata
- Allowed next child types

Suggested child types come from the preset and current parent, but an authorized user may select another valid type. The application prevents cycles, duplicate sibling IDs, and terminal sections containing children unless explicitly converted.

### Template setup and migration review

A setup action offers the four official presets and a blank structure. Applying a preset presents a preview and supports merge or add-as-new-unit.

The migration review lists:

- Automatically matched nodes and learners
- Nodes whose legacy type changed
- Learners or events needing manual resolution
- A downloadable JSON backup identifier and restore action

## Migration and Recovery

### Schema versioning

Add `schema_version` and `directory_backups` to the mock database. Migration runs once when an older schema is loaded.

### Migration mapping

Legacy mappings use type and path context, not name alone:

- Root `school` → `campus`
- JHS `department` → `education_unit`
- JHS `level` → `grade_level`
- SHS `department` → `education_unit`
- SHS legacy `track` and `strand` retain their semantic meanings
- College root `department` → `education_unit`
- College child formerly stored as `track` → `college`
- College child formerly stored as `strand` → `program`
- College section names matching year/block patterns are placed under inferred `year_level` only when the mapping is unambiguous

Ambiguous records keep their original node, receive `migrationStatus: 'needs_review'`, and remain usable.

### Backup behavior

Before migration, store a timestamped deep copy of the directory and affected profile/event assignment fields. Keep the newest three backups. Restoration replaces migrated directory/assignment data but does not roll back unrelated attendance or sanction records.

Migration is idempotent. Reopening the application must not duplicate presets, nodes, or backups.

## Registration

Registration becomes a generic path picker driven by node metadata:

1. Select campus.
2. Select an education unit.
3. Continue through selectable child nodes until a registration terminal group is reached.
4. Show optional affiliations only when configured for that unit.

Labels come from semantic types: Track, Program, Major, Grade Level, Year Level, Section, or Block. No detection uses phrases such as `includes('senior')` or `includes('college')`.

Submission stores canonical node IDs and a readable snapshot. If a selected node is archived before submission, registration stops with a clear instruction to choose another group.

## Member Management

Member creation uses the same generic path picker and assignment serializer as registration. Directory navigation filters members by descendant membership using node IDs. Renaming a node updates future display through path resolution without rewriting every learner profile; snapshot fields may be refreshed in a background compatibility pass.

## Event Targeting

The event form replaces the fixed Department/Track/Strand/Level/Section cascade with a searchable directory picker:

- All institution members
- Any selectable directory node and all descendants
- Specific people

The selected node shows an audience preview containing its path and an estimated learner count. Archived nodes cannot be selected for new events but remain displayed on historical events using their snapshot label.

Affiliation-based event targeting is deferred. The first version targets official directory nodes and specific people only, avoiding inaccurate assumptions about elective rosters.

## Customization Rules

- Preset labels can be renamed without changing semantic meaning.
- Layers may be optional or omitted when the institution does not use them.
- Custom nodes are allowed and can define permitted child types.
- Program duration and year labels are not fixed to four years.
- Both legacy and Strengthened SHS units can coexist.
- Custom metadata is accepted as simple key/value data and must not drive core behavior unless promoted to a supported field.
- Regulatory presets show their source/version date, but the app does not automatically overwrite locally customized structures when policies change.

## Error Handling

- Failed migration leaves the original database untouched and records a diagnostic message.
- Missing node references show “Assignment needs review” while retaining saved snapshots.
- Duplicate names are allowed across different parents; duplicate names under one parent require confirmation.
- Destructive operations require confirmation and dependency checks.
- Invalid preset merges display conflicts before writing.
- Storage quota failures preserve the in-memory state only long enough to report that changes were not saved.

## Accessibility and Responsive Behavior

- Directory cards and action menus are keyboard operable.
- Dialogs have accessible names, focus trapping, and validation summaries.
- The hierarchy remains usable as stacked cards on small screens.
- Type, curriculum, and archived states use text in addition to color.
- Reordering provides Move up/Move down controls in addition to any drag interaction.

## Testing Strategy

### Unit tests

- Preset construction and unique IDs
- Allowed-child validation
- Generic path traversal and labels
- Assignment serialization and compatibility snapshots
- Legacy migration mappings
- Ambiguous migration handling
- Backup retention and restoration
- Migration idempotency
- Descendant membership and event audience counts

### Component tests

- Creating and editing nodes with custom child rules
- Applying and merging each preset
- Preventing unsafe deletion and permitting archival
- Registration across JHS, Strengthened SHS, legacy SHS, and college paths
- Optional major and variable-duration college programs
- Generic event target selection
- Migration review and restore controls

### Regression tests

- Existing seeded students remain discoverable after migration
- Existing events retain readable targets
- SSG directory, registration, member management, attendance, and applicant approval remain operable
- Production build and current UI audit suite pass

## Rollout Order

1. Introduce typed model, schema versioning, presets, migration, and tests.
2. Add shared directory traversal and assignment utilities.
3. Replace SSG directory creation with the customizable editor.
4. Replace registration and member assignment cascades.
5. Replace event targeting with the node picker.
6. Add migration review, restore, and final compatibility cleanup.

## Acceptance Criteria

- An SSG officer can create a standards-aligned directory from a preset and customize every layer.
- JHS can be represented without a track or strand.
- Strengthened SHS can use Academic and TechPro without old strands.
- Legacy SHS remains available for transition and historical cohorts.
- College uses programs, optional majors, configurable year levels, and blocks.
- Existing directory, profile, and event data migrates without silent loss and can be restored.
- Registration, member creation, and event targeting work from semantic node types rather than names.
- Tests cover all presets, migration recovery, and primary workflows.
