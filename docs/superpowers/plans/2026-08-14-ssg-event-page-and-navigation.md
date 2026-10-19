# SSG Event Page and Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SSG officers a dedicated event-creation page and role-appropriate navigation without exposing privileged Admin links.

**Architecture:** Extract the existing SSG event form and event log into `views/SSGEventCreation.tsx`, expose it at `/ssg/events`, and link it from both the shared sidebar and SSG panel. Keep role authorization in `App.tsx` and role-specific labels/visibility in `Layout.tsx`.

**Tech Stack:** React 19, React Router, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Preserve the existing event payload and academic-directory audience targeting.
- Do not expose `/admin/attendance` or `/admin/members` in the SSG navigation or role allowlists.
- Preserve all unrelated uncommitted workspace changes.

---

### Task 1: Role-specific navigation and authorization

**Files:**
- Modify: `components/ui/Layout.tsx`
- Modify: `App.tsx`
- Test: `components/ui/Layout.test.tsx`

**Interfaces:**
- Consumes: `profile.role` from `useAuth()`
- Produces: `/ssg/events` navigation and admin-only/OSSA-only privileged navigation

- [x] Add a failing SSG navigation test asserting “Attendance Scanner” and “Event Creation” are visible while “Mayor Hub” and “Admin” are absent.
- [x] Run `npm test -- components/ui/Layout.test.tsx` and confirm the new assertion fails.
- [x] Split mayor and staff scanner labels, add the event route link, and restrict the Admin group to `admin` and `ossa`.
- [x] Restrict the two `/admin/*` role allowlists to `admin` and `ossa`.
- [x] Run `npm test -- components/ui/Layout.test.tsx` and confirm it passes.

### Task 2: Dedicated event-creation page

**Files:**
- Create: `views/SSGEventCreation.tsx`
- Modify: `views/SSGPanel.tsx`
- Modify: `App.tsx`
- Test: `tests/route-ui-audit.test.tsx`

**Interfaces:**
- Consumes: `mockData.getEvents()`, `mockData.getSchoolStructure()`, `mockData.createEvent()`, and `createEventAudienceTarget()`
- Produces: default export `SSGEventCreation` mounted at `/ssg/events`

- [x] Replace the modal workflow test with a failing dedicated-page test that asserts the form is part of the page and preserves the event payload.
- [x] Run the focused Vitest test and confirm it fails because `SSGEventCreation` does not exist.
- [x] Move the event state, form, event cards, and create handler into `SSGEventCreation.tsx` with an inline form surface.
- [x] Change the SSG panel Events control into navigation to `/ssg/events`.
- [x] Register `/ssg/events` in `App.tsx` for `ssg`, `admin`, and `ossa`.
- [x] Run focused tests, the complete test suite, and `npm run build`.
