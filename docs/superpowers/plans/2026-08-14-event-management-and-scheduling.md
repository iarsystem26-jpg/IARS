# Event Management and Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a searchable SSG event registry and a separate full-page event scheduler with combined recipients, optional geofencing, multiple attendance windows, late thresholds, and sanction rules.

**Architecture:** Keep `/ssg/events` as the registry and add `/ssg/events/create` for scheduling. Extend `AppEvent` with additive scheduling metadata while preserving legacy fields, and teach attendance logging to use configured late thresholds with a legacy fallback.

**Tech Stack:** React 19, React Router, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Preserve unrelated uncommitted workspace changes.
- Scheduled events use `status: 'upcoming'`.
- Populate legacy `startTime`, `endTime`, `penaltyValue`, and `penaltyUnit` fields.
- Require at least one recipient and one valid attendance window.

---

### Task 1: Event model and late-threshold behavior

**Files:**
- Modify: `types.ts`
- Modify: `lib/mockBackend.ts`
- Test: `lib/mockBackend.test.ts`

**Interfaces:**
- Produces: `EventAttendanceWindow`, `EventSanctionRule`, and additive `AppEvent` scheduling properties.
- Consumes: the first matching attendance window when determining whether a scan is late.

- [x] Write a failing backend test for a configured 30-minute late threshold.
- [x] Run the focused test and verify the existing fixed 15-minute rule fails it.
- [x] Add scheduling types and configured-threshold logic with a 15-minute fallback.
- [x] Run the focused backend tests.

### Task 2: Searchable event registry

**Files:**
- Modify: `views/SSGEventCreation.tsx`
- Test: `tests/route-ui-audit.test.tsx`

**Interfaces:**
- Consumes: `mockData.getEvents()`.
- Produces: grouped Ongoing, Scheduled, and Archived event sections plus search/status/audience/geofence filters and `/ssg/events/create` navigation.

- [x] Write a failing UI test for all three groups, search, filters, and Create Event navigation.
- [x] Run the focused UI test and verify it fails against the current inline form.
- [x] Replace the inline form with the registry UI.
- [x] Run the focused UI tests.

### Task 3: Full-page event scheduler

**Files:**
- Create: `views/SSGCreateEvent.tsx`
- Modify: `App.tsx`
- Test: `tests/route-ui-audit.test.tsx`

**Interfaces:**
- Consumes: `mockData.createEvent()` and the authenticated profile.
- Produces: `/ssg/events/create` and a complete `Omit<AppEvent, 'id'>` scheduling payload.

- [x] Write a failing UI test for combined recipients, optional geofencing, multiple windows, sanctions, and scheduling.
- [x] Run the focused UI test and verify the page is missing.
- [x] Implement the route and form with validation and backward-compatible fields.
- [x] Run focused tests, the complete suite, and the production build.

### Task 4: Unified event form, recipient autosuggest, and Leaflet geofence

**Files:**
- Modify: `index.css`
- Modify: `views/SSGCreateEvent.tsx`
- Create: `components/events/RecipientCombobox.tsx`
- Create: `components/events/GeofenceMap.tsx`
- Modify: `tests/route-ui-audit.test.tsx`
- Modify: `package.json`

**Interfaces:**
- `RecipientCombobox` consumes recipient labels plus the current comma-separated draft and emits the normalized selected label list.
- `GeofenceMap` consumes `{ lat, lng, radius }` and emits a new center after a map click or drag while rendering the selected radius as a Leaflet circle.
- `SSGCreateEvent` continues producing the backward-compatible `Omit<AppEvent, 'id'>` payload documented above.

- [ ] Add failing UI coverage that requires visible unified form controls, a searchable recipient combobox, a selected-recipient summary, and an enabled Leaflet map with customizable radius.
- [ ] Run the focused test and confirm it fails because these controls and map do not exist.
- [ ] Install Leaflet bindings and add the map/recipient components.
- [ ] Replace undefined form classes with shared visible input and label styling, then integrate both components into the scheduler.
- [ ] Run the focused UI tests, complete test suite, production build, and browser UI audit.
