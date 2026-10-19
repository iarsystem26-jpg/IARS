# SSG Institutional Events Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SSG event registry visually match the existing Institutional Events page while retaining SSG management controls.

**Architecture:** Reuse the existing `Page`, `PageHeader`, `Surface`, and `Collapsible` patterns from `StudentEvents.tsx`. Keep current search/filter state and `/ssg/events/create` navigation unchanged; only restructure cards and sections.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, Testing Library

## Global Constraints

- Preserve Create Event, search, status, recipient, and geofence behavior.
- Use the existing Institutional Events page as the visual reference.
- Preserve unrelated uncommitted workspace changes.

---

### Task 1: Institutional Events visual parity

**Files:**
- Modify: `views/SSGEventCreation.tsx`
- Test: `tests/route-ui-audit.test.tsx`

**Interfaces:**
- Consumes: the existing filtered `AppEvent[]` registry data.
- Produces: Institutional Events header/filter composition, navy ongoing cards, and collapsible scheduled/archive sections.

- [x] Add failing assertions for the Institutional Events heading, ongoing card treatment, and collapsed scheduled/archive controls.
- [x] Run the focused route UI test and confirm those assertions fail against the current registry.
- [x] Rebuild the registry presentation using the shared Institutional Events layout while retaining all SSG controls.
- [x] Run the focused test, complete suite, and production build.
