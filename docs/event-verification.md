# Event creation verification

Event creation uses `appData.createEvent` → `rmc_command` → `app_private.command` → `rmc_events`. The command gateway enforces event-management permission, assignment scope, frozen scopes, and the authenticated creator. Writes refresh the shared snapshot; the event registry follows snapshot revisions.

OSAS and SSG recipient selectors start at their assigned unit and include only its descendants. Broad choices such as “All Students” are restricted to that assignment. Accounts without an assignment cannot schedule events. Editing controls also respect the current assignment, including after reassignment. Migration `20260928160748_restrict_event_and_unit_scope.sql` rejects explicit unit or person recipients outside a non-administrator's assignment. The live checks exercise both OSAS and SSG directory and event permissions. Set `EVENT_TEST_ROLE=ossa` or `ssg` to exercise those accounts in the browser test.

Migration `20260928154613_validate_event_configuration.sql` adds a private, invoker-security validation trigger for persisted schedules, attendance windows, sanctions, geofences, activity types, and recurrence. It preserves the series link when an occurrence is edited. Legacy events with no `attendanceWindows` property retain the existing single-session behavior; explicitly empty or malformed windows are rejected.

Run local checks:

```sh
npx vitest run tests/event-creation.test.tsx lib/backend.test.ts
npm run typecheck
npm run build
```

Run live backend checks with the existing `.env.local`, `.env.server.local`, and admin credentials in `.demo-accounts.local`:

```sh
npm run test:events
```

This creates uniquely named temporary units, an SSG officer, a student, and events. It checks persistence, recipient visibility, authorization, frozen scopes, malformed payloads, weekly recurrence, edits, activity kinds, cancellation, and deletion. The `finally` block removes the temporary records and retains the audit trail.

With the local app running, test the actual browser form:

```sh
npm run dev
# In another terminal:
npm run test:events:browser
```

The browser test logs in, creates a geofenced event with two attendance windows, verifies its database row, reloads the registry, reopens and edits it, and checks the mobile layout and runtime errors. It removes its event afterward. Override `AUDIT_BASE_URL` (default `http://127.0.0.1:3000`) and `CHROME_PATH` as needed.

If headless Chrome suppresses native input, `EVENT_INPUT_MODE=dom` runs the browser/database checks using DOM clicks. This mode verifies saved data and rendering but does not verify pointer hit targets or keyboard interaction. Unassigned staff accounts instead verify that scheduling is blocked.

The broad `npm run test:integration` script currently stops at its admission fixture, which does not satisfy the newer enrollment validation rules. Event verification runs independently through `test:events`.
