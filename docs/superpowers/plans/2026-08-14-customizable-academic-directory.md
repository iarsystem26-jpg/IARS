# Customizable Academic Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed Department/Track/Strand hierarchy with standards-aligned, customizable academic presets and semantic path-based registration, member assignment, and event targeting.

**Architecture:** A focused `academicDirectory` module owns node types, presets, migration, traversal, validation, and assignment serialization. Existing recursive directory storage remains intact but gains schema metadata and backups. UI consumers use shared semantic traversal instead of inferring behavior from display names.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, Testing Library, Tailwind CSS, localStorage mock backend.

## Global Constraints

- Preserve existing node IDs, learner records, and readable event targets.
- Create a recoverable directory backup before the one-time migration.
- Presets remain fully editable and never overwrite customized data automatically.
- JHS must not require track or strand.
- Strengthened SHS must support Academic and TechPro without legacy strands.
- Legacy SHS and Strengthened SHS may coexist.
- Higher education uses colleges, programs, optional majors, configurable year levels, and blocks.
- Core behavior uses semantic node types and IDs, never name substring detection.

---

### Task 1: Semantic Directory Core

**Files:**
- Create: `lib/academicDirectory.ts`
- Create: `lib/academicDirectory.test.ts`
- Modify: `types.ts`

**Interfaces:**
- Produces `AcademicNodeType`, `AcademicPresetId`, `AcademicAssignment`, `DirectoryBackup` types.
- Produces `createAcademicPreset(id, campusName)`, `getAllowedChildTypes(node)`, `validateChildType(parent, childType)`, `flattenDirectory(nodes)`, `findNodeById(nodes, id)`, `findNodePath(nodes, id)`, `serializeAcademicAssignment(path)`.

- [ ] Write failing tests for all four presets and the blank template, proving JHS omits tracks, Strengthened SHS omits strands, legacy SHS retains strands, and college supports optional majors.
- [ ] Run `npm test -- --run lib/academicDirectory.test.ts` and verify failures are caused by missing exports.
- [ ] Add the semantic types and minimal preset/traversal implementation.
- [ ] Run the focused tests and verify they pass.
- [ ] Add failing tests for child validation and assignment serialization.
- [ ] Implement validation and serialization, then rerun focused tests.

### Task 2: Versioned Migration and Recovery

**Files:**
- Modify: `lib/academicDirectory.ts`
- Modify: `lib/academicDirectory.test.ts`
- Modify: `lib/mockBackend.ts`
- Modify: `lib/mockBackend.test.ts`

**Interfaces:**
- Produces `migrateAcademicDirectory(nodes)` returning `{ nodes, changed, needsReview }`.
- Produces backend methods `getDirectoryBackups()`, `restoreDirectoryBackup(id)`, `replaceSchoolStructure(nodes)`, `updateSchoolNode(id, changes)`, `archiveSchoolNode(id)`, `deleteSchoolNode(id)`.

- [ ] Write failing migration tests using the current seeded JHS, SHS, and college legacy shapes.
- [ ] Verify failures, implement context-aware mapping with stable IDs, and verify passes.
- [ ] Write failing backend tests for one-time backup, idempotency, restore, safe delete, update, and archive.
- [ ] Add `schema_version` and a three-entry `directory_backups` ring to the mock database and implement methods.
- [ ] Run `npm test -- --run lib/academicDirectory.test.ts lib/mockBackend.test.ts`.

### Task 3: Customizable SSG Directory Editor

**Files:**
- Create: `components/academic/DirectoryNodeModal.tsx`
- Create: `components/academic/DirectoryNodeModal.test.tsx`
- Create: `components/academic/PresetPickerModal.tsx`
- Modify: `views/SSGPanel.tsx`
- Modify: `tests/route-ui-audit.test.tsx`

**Interfaces:**
- Consumes semantic node types and mock backend mutation methods.
- Produces create/edit/archive/delete and preset-merge user flows.

- [ ] Write failing component tests for custom display names, semantic type selection, allowed child overrides, and preset choice.
- [ ] Verify the focused tests fail before components exist.
- [ ] Implement accessible modal forms with semantic labels and metadata fields.
- [ ] Replace SSG's inferred `nextType` logic with the modal and add Edit/Archive/Delete actions.
- [ ] Add a preset action that inserts an editable education unit under the selected campus.
- [ ] Run component and route audit tests.

### Task 4: Shared Semantic Academic Path Picker

**Files:**
- Create: `components/academic/AcademicPathPicker.tsx`
- Create: `components/academic/AcademicPathPicker.test.tsx`
- Modify: `views/Register.tsx`
- Modify: `views/LandingPage.tsx`

**Interfaces:**
- `AcademicPathPicker({ roots, value, onChange, terminalTypes, includeArchived })` returns the selected node path through `onChange(path)`.
- Uses semantic label mapping for campus, education unit, curriculum, college, program, major, grade, year, section, and block.

- [ ] Write failing tests for JHS, Strengthened SHS, legacy SHS, and college selection paths.
- [ ] Verify failures and implement the generic cascading picker.
- [ ] Replace registration's fixed selectedDept/Track/Strand logic and save canonical `academic_assignment` plus compatibility fields.
- [ ] Replace the landing application flow with the same picker.
- [ ] Run picker, registration, and route audit tests.

### Task 5: Member Assignment and Directory Filtering

**Files:**
- Modify: `views/ManageMembers.tsx`
- Modify: `tests/route-ui-audit.test.tsx`

**Interfaces:**
- Consumes `AcademicPathPicker` and `serializeAcademicAssignment`.
- Member profiles retain readable compatibility fields and canonical node IDs.

- [ ] Write a failing route test that creates members under JHS and college semantic paths.
- [ ] Verify the failure is caused by fixed path derivation.
- [ ] Replace fixed path derivation and add the shared picker to member creation.
- [ ] Run route audit tests.

### Task 6: Generic Event Audience Targeting

**Files:**
- Modify: `types.ts`
- Modify: `views/SSGPanel.tsx`
- Modify: `tests/route-ui-audit.test.tsx`

**Interfaces:**
- Adds `AppEvent.audienceTarget` with `mode`, `nodeId`, `includeDescendants`, and `snapshotLabel`.
- Existing `participantsType` and `targetValue` remain populated for compatibility.

- [ ] Write a failing route test that targets an arbitrary program or grade node without a fixed depth.
- [ ] Verify the fixed cascade cannot satisfy the test.
- [ ] Replace the Department/Track/Strand cascade with `AcademicPathPicker` and an audience summary.
- [ ] Store path-based target plus compatibility fields.
- [ ] Run event and route audit tests.

### Task 7: Migration Review and Full Verification

**Files:**
- Create: `components/academic/MigrationReview.tsx`
- Modify: `views/SSGPanel.tsx`
- Modify: `tests/route-ui-audit.test.tsx`

**Interfaces:**
- Consumes backend backup and restore methods plus node migration status.

- [ ] Write a failing test for unresolved-node visibility and backup restore.
- [ ] Implement a compact review surface with backup timestamp, flagged nodes, and restore confirmation.
- [ ] Run all tests with `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and inspect the final scoped diff.

