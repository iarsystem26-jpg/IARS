# Ceremony scheduling

Admins, OSAS (`ossa` in the existing role model), and SSG with `events.manage` can create ceremonies. Staff retain their existing assigned-unit boundaries. Open **Ceremonies → Create Ceremony**.

- Choose weekdays and a monthly occurrence limit. Start and End Date are optional prediction filters: leave both blank to predict the full calendar month. Near month-end the calendar initially opens the upcoming month; navigate Previous/Next or choose Calendar month to change it. Prediction is independent of the current-month/next-seven-days creation restriction. Enter both for a custom preview range. Selected ceremony dates determine the saved schedule. **Automatically predict dates** selects the earliest matching dates in each month, up to that limit. This is calendar-based prediction, not a holiday or school-calendar lookup.
- Edit the prediction by clicking calendar dates, removing listed dates, or adding a manual date. Each selected date becomes its own event, grouped by a series ID. Saving the series is atomic.
- Future dates can be previewed for up to one year. Saving permits only dates in the current Philippine month or the next 7 days, and only before the ceremony starts. Remove preview-only dates before saving. The database enforces the same rule for direct API calls and rescheduling.
- Default attendance windows apply to all recipients. Class overrides replace those windows for the selected section/block; the event envelope expands to include every configured window. OSAS and SSG can change scheduled class windows within their assigned event scope before attendance is recorded. These controls do not rewrite recorded attendance timestamps.
- Exempt students are excluded from required attendance, late/absence sanctions, and volunteer merit. Individual checkboxes apply to all selected dates. OSAS/admin class and schedule filters preview each date separately and add date-specific exemption snapshots. Each saved occurrence receives only its applicable exemptions.
- Non-recipients within the event scope may attend voluntarily without late/absence sanctions. The optional merit setting awards configured hours after scan-out, once per ceremony, capped at the student's outstanding sanction balance. Merit is a sanction-hours deduction, following the app's existing model.
- Edit a saved occurrence through its ceremony details. Existing backend rules prevent edits once attendance records exist. Editing one occurrence does not change the other dates in its series.

## Activity types and Philippine flag defaults

Ceremonies have a dedicated flag raising/retreat form. The Events form offers attendance events, **Sanction / Cleaning Service**, and **Merit activity**.

[Republic Act 8491, Section 18](https://lawphil.net/statutes/repacts/ra1998/ra_8491_1998.html) calls for Monday-morning flag raising and Friday-afternoon flag lowering. Section 15 addresses daily flag display from sunrise to sunset. Neither specifies one national school clock time. The standard-week toggle sets Monday or Friday and suggests school windows of 07:00?07:30 or 16:30?17:00; those clock times remain editable. Standard mode enforces the weekday and morning/afternoon period on the server. Turn it off for an exceptional schedule. Check holidays and school suspensions manually.

Service credits actual completed scan-in/scan-out time within each daily window. Separate windows exclude breaks. No check-out means no credited hours. A participant cannot concurrently start another service/merit activity while a previous one remains open. Duplicate scans do not double-credit hours.

OSAS or admins choose the service overflow policy. Both policies clear existing sanctions first. **Clear only** discards excess credit while retaining actual rendered hours in attendance; **Earned merit** stores the excess separately. The separate merit balance does not automatically cancel future sanctions.

Merit Activities have a fixed award (0.01?24 hours), released once after all configured windows on all scheduled dates have completed scan-ins and scan-outs. The award clears sanctions first and stores any remainder as earned merit. This is distinct from the elapsed service duration.

Service duration can be extended to a later date with the same daily windows, even after attendance has been recorded. The scoped extension RPC preserves existing attendance and credited hours, rejects shortening, and limits the overall schedule to one year. Archived/cancelled activities cannot be reopened by this action. Other configuration remains locked once attendance exists.

Scanner receipts and Student Records show rendered time, sanctions cleared, and earned merit separately.

## Verification

```text
npm.cmd test -- lib/ceremonySchedule.test.ts lib/eventAudience.test.ts tests/event-creation.test.tsx components/ui/Layout.test.tsx
npm.cmd run typecheck
npm.cmd run build
npx.cmd supabase db query --linked --file tests/ceremony-database.sql
npx.cmd supabase db query --linked --file tests/activity-rewards-database.sql
node scripts/verify-ceremony-browser.mjs
```

The database verification uses existing marked test accounts and rolls back all fixture changes. The browser check requires the local app and existing local test credentials; it creates and removes only its uniquely named test ceremonies. It checks prediction, manual adjustments, responsive layout, real persistence, and occurrence editing.

## Regular class schedules and exemption filters

Open the school directory and navigate to a section or block. OSAS and admins can save its **Weekly class schedule**, using Philippine time: the first class start and last class end for each weekday, explicit **No classes**, or **Not configured**. OSAS is limited to its assigned subtree. A dedicated audited RPC and node trigger enforce these restrictions even through generic directory updates.

In ceremony creation, open **Filter exempt students by class or schedule**. Select classes through the same hierarchy picker as recipients, or filter first class start / last class end using an exact time, at-or-after, or at-or-before comparison. No-class filtering requires an explicit no-class day; missing schedules do not qualify. Schedule filters may optionally be narrowed to chosen classes.

Preview student names and counts per ceremony date, then apply to all selected dates or one date. For example, Monday first-class starts at/after 10:00 may exempt students from raising; Friday last-class ends at/before 12:00 may exempt students from retreat. To filter a noon **start**, choose First class starts instead. Class schedules do not themselves impose an automatic exemption policy.

Filters add to existing exemptions. Date-specific entries can be removed before saving; individual checkboxes exempt students across all selected dates. Changing/removing ceremony dates does not apply exemptions to other weekdays. Saving materializes each occurrence independently, and subsequent schedule edits do not retroactively change saved attendance rules. Ceremony scan-window overrides are separate from regular class schedules.

Validation: `npx vitest run tests/class-exemptions.test.tsx lib/classSchedules.test.ts tests/event-creation.test.tsx lib/ceremonySchedule.test.ts`; `npx supabase db query --linked --file tests/class-schedules-database.sql` (transaction rolled back); `node scripts/verify-class-schedules-browser.mjs` (temporary class fixture cleaned up).

Individual exemptions and ceremony class overrides use search-only autosuggestions. Search students by name, student ID or class context; search classes by section name/code or hierarchy context. Matching ignores case, accents and punctuation, ranks exact names first, and supports tokens in any order. Selected items are excluded from suggestions. Use arrows/Enter or click to add, and remove selected exemptions or revert a class to default windows. Class overrides initially copy the configured ceremony windows. No student roster is shown until searching.
