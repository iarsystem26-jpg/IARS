# Personal calendar and academic closures

Any role with **View Calendar** opens **My Calendar** at `/#/student/calendar`. The month grid and daily agenda combine approved institutional events, ceremonies, organization membership activities, service, and merit. Ceremony class windows and individual exemptions follow the existing recipient rules. The daily agenda groups specific activities beneath their general-event container, with separate controls for opening general and specific details. When a filter or access scope omits the parent entry, the child retains its general-event context without exposing a parent details action. General events do not count as attendance sessions or conflicts.

All displayed dates and times use Philippine time. Conflicts are overlapping sessions from different activities; adjacent sessions, suspended sessions, cancelled sessions, and general-event containers are excluded. Filters affect the agenda and export. Export downloads an iCalendar (`.ics`) snapshot of the selected month and filter, with stable session UIDs, UTC timestamps, escaped text, and UTF-8 line folding. Download another snapshot after schedules change; this is not a live subscription.

Any role with **Manage Holidays & Suspensions** opens **Holidays & Suspensions** at `/#/admin/calendar`, using the **Holidays & Suspensions** button on My Calendar or the Event Management shortcut. Enter a title, official reason, date range from today onwards, and either school-wide scope or selected academic units and descendants. The academic picker follows the same cascading path as enrollment; choose a unit or "All of" its parent, then add it. Several paths can be added. Preview includes affected and unaffected recipient counts. Review before applying:

- **Suspend affected attendance only** retains event schedules and pauses participation within scope.
- **Cancel selected activities together** changes wholly affected future activities without attendance.
- **Reschedule selected activities together** lists affected events and related general/specific activities with their details. Select activities and choose a new start date for each, then preview the resulting schedules before applying. Selecting a general event moves all its specific activities by the same interval, preserving their relative dates, times, duration, and attendance settings. A specific activity can move independently if its final schedule stays inside the parent's date range. Ineligible activities remain visible with the reason they cannot move. Ceremonies require individual rescheduling so exemptions and class windows can be reviewed. Destinations overlapping another applicable closure are rejected.

Every operation also saves the closure, protects newly created activities, notifies affected students, and writes audit history. Batches commit atomically. Changed schedules, recipient counts, eligibility, or closure history invalidate the preview. Rescheduled activities that require OSSA approval return through the existing review rules. A date range can span up to 366 days; a batch can change up to 500 activities.

Scoped closures never cancel shared activities for unaffected students. Multi-day activities with attendance windows are suspended only on affected session dates. Legacy activities without windows have a single session; any overlapping closure suspends that session. Existing check-ins and earned service/merit credits remain in history. Automatic absence records on today's suspended sessions are removed, with an appended sanction reversal capped at the outstanding balance; previously completed service is not refunded.

Online recording, offline synchronization, absence finalization, and attendance-correction options all enforce the closure on the server. Previously downloaded offline rosters may still capture locally; the server rejects suspended captures on synchronization. Suspended open service sessions do not block future service or merit participation. Fixed merit completion checks the remaining required sessions and cannot award merely because every session is suspended.

The app records school decisions; it does not automatically import national holidays, weather announcements, or class suspensions. Saved closures expire after their end date and remain in the administrator history. They are not editable or withdrawable through this initial screen; verify the preview before applying.

Implementation: `lib/personalCalendar.ts`, `views/PersonalCalendar.tsx`, `views/HolidayManagement.tsx`, and calendar migrations under `supabase/migrations/`. Database verification: `supabase/tests/calendar_suspensions.sql` and `supabase/tests/calendar_date_rescheduling.sql`; UI/domain verification: `tests/calendar-ui.test.tsx` and `tests/personal-calendar.test.ts`. Run `npm run test:calendar:browser` for a populated calendar and real export against test accounts. Run `npm run test:calendar:reschedule:browser` for the editor navigation, unit picker, grouped destination-date preview, and responsive review flow; it does not apply closures. Export follows the [iCalendar format (RFC 5545)](https://www.rfc-editor.org/rfc/rfc5545).

## Role permissions

Configure built-in or custom roles under **System Controls → RBAC Roles → Events**:

| Toggle | Access |
| --- | --- |
| View Calendar | Own activities, agenda, conflicts and export. Enabled for all built-in roles by default. |
| View Scoped Calendar | Also includes activities within the assigned academic scope; System Admin sees school-wide schedules. Requires View Calendar. Default: Admin, OSSA Administrator, OSSA Staff. |
| Manage Holidays & Suspensions | Preview and apply attendance suspensions, eligible cancellations and reschedules within the assigned unit and descendants. Default: Admin only. |
| Manage School-wide Suspensions | Allow entire school and any academic unit. Requires Manage Holidays & Suspensions. Default: Admin only. |

Permissions are enforced on routes, navigation and database RPCs, including revocation from Admin. A custom role or Student role can receive delegated management; without school-wide permission, the saved academic assignment remains the boundary. Unassigned scoped delegates cannot apply closures. Existing permissions still control creating and editing the underlying activities. Calendar viewing alone does not grant activity editing. Entries open a full calendar detail dialog for every role, including the overall schedule and selected session, instructions, venue/perimeter, parent event and organization context, attendance windows, and applicable sanction, service, merit, and excuse rules. General containers do not show attendance requirements. Scoped overlap indicators show competing activity times, rather than asserting that each attendee must attend both activities.

Saved closures still cannot be edited or withdrawn. Granting calendar permissions does not change that limitation. Database grant/revocation verification: `supabase/tests/calendar_rbac.sql`.


## Informational schedules

In My Calendar, use **Add schedule** to publish dates, details, an optional venue, and recipients. The Recipients section combines **Recipients in** (a school unit) with **Recipient type** (all students, mayors only, or SSG officers only). Both filters apply together: College + Mayors only informs only college mayors. Changing the unit keeps the selected recipient type. There is no separate school-unit setting or Add recipient step. These entries are labelled **No attendance required** and generate inbox notifications. They do not create events, attendance requirements, sanctions, or credits, and they do not suspend other activities. They appear in the daily agenda, the Informational schedules filter, PDF exports, and ICS exports (as transparent entries).

Admin, SSG, and OSSA receive the Manage Informational Schedules permission by default. Existing roles that manage events or calendar closures receive it during migration. Role administrators can grant it to custom roles. Holiday and suspension managers can also manage informational schedules. Scoped managers must choose a unit and recipients within their assigned scope; admin and roles with schoolwide calendar permission can choose the whole school.

Use View schedule to edit an upcoming entry or cancel an entry that has not ended. Saving an edit notifies the previous and current recipients; cancelling notifies the current recipients. Cancelled schedules stay visible for reference and are omitted from ICS exports.

Apply the informational_calendar_schedules migration before deploying the frontend. Database regression coverage is in supabase/tests/informational_calendar_schedules.sql and rolls back its fixtures.
