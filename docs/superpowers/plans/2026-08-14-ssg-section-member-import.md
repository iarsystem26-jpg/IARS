# SSG Section Member Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SSG officers create and review individual or CSV-imported section members and assign exactly one mayor per section.

**Architecture:** Keep directory navigation and section context in `ManageMembers`, isolate universal CSV behavior in a pure library, and isolate the upload/review workflow in a focused modal component. Extend the mock backend with a section-aware mayor assignment operation while retaining existing user creation.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, localStorage mock backend, Tailwind CSS.

## Global Constraints

- Preserve existing uncommitted workspace changes.
- CSV output must use UTF-8 BOM, CRLF line endings, comma delimiters, and RFC 4180 quoting.
- Academic placement always comes from the currently selected section, never from uploaded data.
- At most one member may have the `mayor` role in one academic terminal group.

---

### Task 1: Universal member CSV contract

**Files:**
- Create: `lib/memberCsv.ts`
- Test: `lib/memberCsv.test.ts`

**Interfaces:**
- Produces: `MEMBER_CSV_COLUMNS`, `createMemberCsvTemplate()`, `parseMemberCsv(text)`, and `validateMemberCsvRows(rows)`.

- [ ] Write tests proving BOM/CRLF template output, RFC 4180 quoted parsing, header normalization, defaults, and duplicate/invalid-field errors.
- [ ] Run `npm test -- lib/memberCsv.test.ts` and confirm failure because the module does not exist.
- [ ] Implement typed parsing, serialization, normalization, and validation.
- [ ] Run `npm test -- lib/memberCsv.test.ts` and confirm all CSV tests pass.

### Task 2: Single-mayor backend rule

**Files:**
- Modify: `lib/mockBackend.ts`
- Modify: `lib/mockBackend.test.ts`

**Interfaces:**
- Produces: `mockData.assignSectionMayor(uid: string, terminalGroupId: string, sectionName?: string): boolean`, global account-identity validation, and atomic `mockData.createSectionMembers(...)`.

- [ ] Write a backend test with two members in one terminal group and one member in another.
- [ ] Run the focused test and confirm it fails because `assignSectionMayor` is missing.
- [ ] Implement promotion of the selected member and demotion of only the prior mayor in the same group.
- [ ] Run the focused backend tests and confirm they pass.

### Task 3: Editable bulk-import modal

**Files:**
- Create: `components/members/BulkMemberImportModal.tsx`
- Create: `components/members/BulkMemberImportModal.test.tsx`

**Interfaces:**
- Consumes: CSV helpers from Task 1 and `onConfirm(rows)` supplied by the section registry.
- Produces: an instructions/template/upload/review modal with editable rows and validation.

- [ ] Write component tests for template download, file detection, row rendering, inline correction, invalid-row blocking, row removal, and confirm callback.
- [ ] Run the component test and confirm failure because the component does not exist.
- [ ] Implement the modal using the existing `Modal` and `Button` components.
- [ ] Run the component tests and confirm they pass.

### Task 4: Section registry integration and SSG access

**Files:**
- Modify: `views/ManageMembers.tsx`
- Modify: `App.tsx`
- Modify: `components/ui/Layout.tsx`
- Modify: `tests/route-ui-audit.test.tsx`
- Modify: `components/ui/Layout.test.tsx`

**Interfaces:**
- Consumes: `BulkMemberImportModal`, `mockData.createSectionMembers`, and `mockData.assignSectionMayor`.
- Produces: SSG-visible member navigation, individual member creation, bulk creation, registry refresh, and per-row mayor controls.

- [ ] Write route and navigation tests proving SSG access, bulk modal launch, reviewed creation, and mayor assignment.
- [ ] Run focused UI tests and confirm the new expectations fail.
- [ ] Add the SSG route permission/navigation item and integrate the single/bulk creation and mayor actions.
- [ ] Run focused UI tests and confirm they pass.

### Task 5: Full verification

**Files:**
- Modify only files required to correct verification failures caused by this feature.

- [ ] Run `npm test` and resolve feature-related regressions.
- [ ] Run `npm run build` and resolve TypeScript or bundling failures.
- [ ] Review the final diff for accidental changes, accessibility gaps, and incomplete requirements.
