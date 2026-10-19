# IARS / RMC Attendance — Demo Script and Feature Guide

Prepared from the current application source on October 9, 2026.

Use the quoted paragraphs as your speaking script and the bullets as your demonstration checklist. Routes below are hash routes: `/student/qr` means `/#/student/qr` on your app's address.

This guide describes the implemented screens. Available actions depend on saved role permissions, academic assignments, organization membership, account status, and deployed backend configuration. OSSA and OSAS both appear in the interface; they refer to the Office of the Students Services and Affairs in this guide.

## 1. Opening script

> “This is IARS, our attendance and records system. It connects student enrollment, school events, flag ceremonies, attendance recording, excuses, and sanction management. Students can see their own records, officers can record attendance, OSSA can review requests, and administrators can manage access and school operations.”

> “I’ll follow one student through the system: from applying for an account, to attending an approved event, to viewing the resulting record. Then I’ll show how the school handles exceptions, service credits, organizations, and administration.”

## 2. Prepare before the demo

- Prepare approved accounts for Student, Mayor, SSG, OSSA Administrator, OSSA Staff, and System Administrator. Keep credentials outside this document.
- Use separate browser profiles or devices for the student and scanner so switching accounts does not interrupt the attendance demonstration.
- Prepare a sample academic unit and class, with the officers assigned to the correct scope.
- Prepare a pending enrollment application, a future activity awaiting approval, and an approved activity whose attendance window overlaps the demo.
- Prepare one completed event and a sample supporting PDF or image for the excuse workflow.
- Prepare a completed institutional event and service/merit activity within the last 30 days with a missing or incorrect attendance record for the correction workflow.
- Prepare a student with a sample sanction balance for service and clearance examples.
- Prepare an organization with a head, a pending membership application, and an approved member.
- Check camera access, location access, network connectivity, photo uploads, and document opening on the devices you will use.
- Download the student's permanent ID and prepare the scanner's offline roster while online if demonstrating offline attendance.
- Schedule in Philippine time, UTC+8. Approve activities before they start. Allow enough time between service check-in and check-out to show actual rendered time.
- Use demonstration records for changes such as transfers, account freezes, sanctions, and cancellations.

### Suggested presentation order — approximately 25–35 minutes

| Order | Account / screen | What to demonstrate |
| --- | --- | --- |
| 1 | Public homepage | Purpose, login, enrollment, public notices |
| 2 | Applicant + SSG/OSSA | Submit, review, approve, and open the workspace |
| 3 | Student | Home, digital ID, events, ceremonies, records, profile |
| 4 | SSG | Academic directory and event creation |
| 5 | OSSA Administrator | Review the event before attendance opens |
| 6 | Mayor + Student | Verify identity, record attendance, show the receipt |
| 7 | Student + OSSA | Submit an excuse and review the decision |
| 8 | OSSA / Admin | Service, merit, sanctions, analytics, reports |
| 9 | Organization head | Membership, activities, sanction requests |
| 10 | Admin | Accounts, roles, freezes, health, billing, public content |

For a shorter demo, use steps 1, 3, 4, 5, 6, and 8 with prepared accounts and records.

## 3. Roles at a glance

These are the built-in defaults. Custom permissions can change permission-based access; some screens also check the actual role or organization position.

| Role | Main responsibility | Default features to highlight |
| --- | --- | --- |
| Student | Personal attendance and records | Digital ID, personal events and ceremonies, records, excuses, profile requests, eligible organization membership |
| Mayor / Attendance Officer | Classroom attendance | Student features, attendance scanner, assigned classroom and student detail views |
| SSG Officer | Events and assigned rosters | Staff home, personal QR/events/records, directory and member management, scanner, attendance dashboard, event and ceremony creation requiring OSSA review |
| OSSA Administrator | Student affairs and activity oversight | OSSA Hub, activity approvals, information requests, excuses, sanctions, attendance, events, directory creation and management, transfers, system health |
| OSSA Staff | Operational student affairs work | OSSA Hub case handling, information requests, excuses, sanctions, scanner, attendance dashboard, assigned hierarchy views |
| System Owner / Super Admin | School-wide administration | School hierarchy, accounts, permissions, events, attendance, cases, transfers, freezes, diagnostics, payments, legal pages, homepage video |
| Organization head | Management of a specific organization | Settings, membership applications, organization activities, attendance, sanction requests, according to organization access |

**Explain these distinctions:**

- A Mayor records attendance; the default role does not create institutional events or manage classroom membership.
- SSG can manage existing assigned directory structures and members. Creating academic units, transferring students, and managing sanction balances are separate permissions not granted to SSG by default.
- OSSA Staff does not receive institutional event creation or institutional activity approval permission by default. An administrator can configure eligible staff permissions.
- Institutional activity reviewers must be OSSA or OSSA Staff with `events.approve`; authors cannot approve their own requests. The default Admin role does not have this approval permission.
- Organization heads are assigned people, not a separate built-in sign-in role. A student can be a head while retaining their student account.
- Organization membership is separate from academic classroom enrollment. A student can belong to several organizations.

> “The system separates responsibility by role and academic scope. Giving someone a title does not automatically give them every administrative action.”

## 4. Public pages and enrollment

### Homepage / login — `/`, `/login`, `/register`

- Introduces attendance and records, with an explainer video when configured.
- Opens sign-in and enrollment dialogs. `/register` uses the same landing page.
- Password login accepts a username or email; the homepage also offers **Check enrollment progress** using the requested lookup details.
- Supports the configured password, Google, and passkey sign-in options.
- Handles security verification for accounts with enrolled two-factor authentication.
- Links to Privacy Policy, Data Deletion, Data Privacy Agreement, and Terms of Service.
- Offers light and dark appearance.

### Enrollment workflow

1. Open enrollment from the homepage.
2. Follow the five steps: **Data privacy agreement → Account details → Academic assignment → Emergency contact → Profile picture**. Read the privacy notice, then enter the student's name, email, optional username, and password for password enrollment.
3. Choose the academic path down to the student's class or section, and provide the student ID and required **Section Enrollment Security Key**.
4. Enter the emergency contact details.
5. Upload the required profile photo: JPG, PNG, or WebP, up to 5 MB. Additional documents requested during review are handled through the application status workflow.
6. Review the application and submit. Complete email confirmation when required by the configured sign-in method.
7. Open the application status page and show the pending review state.
8. Switch to an authorized member manager in the appropriate hierarchy scope, open the applicant, and review the identity, academic assignment, and documents.
9. Approve the application, or demonstrate a return for clarification, rejection, or application deletion with the required reason.
10. Return to the applicant's status screen and show the approved account opening its dashboard.

For Google enrollment, selecting a Google account identifies the email; it does not by itself complete school enrollment. A new Google identity must finish the application. Existing applications can reopen their status through Google sign-in.

### Application status — `/register/status`

- Shows the current application outcome and review feedback.
- Shows submitted or requested documents.
- Allows eligible applicants to correct details and resubmit clarifications or reapply.
- Opens the dashboard after approval and account readiness.
- Provides sign-out.

> “Creating an application and receiving school approval are separate steps. Reviewers can ask for specific corrections before admitting the student.”

### Public notices and organization discovery

- `/privacy-policy`: information handling notice.
- `/data-deletion`: school request process and deletion limitations.
- `/data-privacy-agreement`: privacy agreement page.
- `/terms-of-service`: use of the service.
- `/organizations/public`: public organization directory, search, membership policy, and sign-in-to-join entry point. It is reachable by direct link even though the homepage navigation does not expose an Organizations shortcut.

Do not describe optional-information deletion as complete account erasure. The app's information deletion request preserves identity, academic assignment, and attendance records.

## 5. Student — features per page

### Home — `/dashboard`

- Personal summary: attendance rate, sanction hours, attended events, and missed events.
- Quick access to QR, Events, Ceremonies, Records, and Profile.
- Activity information and personal attendance context.
- Notifications and attendance confirmation through the shared interface.

> “The student can immediately see their attendance standing and outstanding service balance.”

### My QR / My Digital ID — `/student/qr`

- Displays the school identity card, student photo, name, ID, and academic details.
- Displays a live rotating QR for attendance verification.
- Downloads a permanent ID card as a PNG using a separate persistent QR.
- Replaces the printed QR if a card is lost or compromised; download a new card afterward.

> “The live QR and the printed ID use different tokens. Replacing the printed QR invalidates the previous printed code.”

### My Calendar — `/student/calendar`

Available to any role with **View Calendar**. **View Scoped Calendar** adds schedules within the assigned scope; Admin, OSSA Administrator, and OSSA Staff have it by default.

- Combines institutional events, ceremonies, organization activities, service, and merit sessions in a monthly calendar and daily agenda. Specific activities appear inside their labelled general-event group; standalone activities keep their own cards.
- Highlights conflicting sessions and affected holidays/suspensions in Philippine time.
- Filters by activity type. **Export calendar** offers a printable PDF with a monthly grid and detailed agenda, or an ICS (iCalendar) file to import into Google Calendar, Outlook, or Apple Calendar. PDF includes suspended/cancelled activities with status labels; ICS excludes those sessions. ICS is a snapshot, not a live subscription; export again after schedule changes and check for duplicates when importing again.
- Open a full activity details modal from the agenda: schedule, instructions, venue/perimeter, academic or organization context, attendance windows, applicable sanction/credit rules, and excuse window. The general-event modal lists its accessible specific activities across the full duration, including their attendance windows when configured. General-event containers are excluded from attendance counts and conflict checks.

### Events — `/student/events`

- Lists relevant institutional activities in active, upcoming, and archived groups.
- Searches events and filters by status.
- Opens activity details: description, schedule, recipients, venue/location, attendance windows, and sanctions where applicable.
- Opens general events and their specific activities.
- Offers excuse submission when the activity and submission window allow it.

### Ceremonies — `/student/ceremonies`

- Lists flag raising and flag retreat activities in active, upcoming, and archived groups.
- Searches and filters by ceremony type.
- Shows ceremony details, attendance requirements, and applicable schedule information.
- Offers supported excuse/exemption letter submission.
- Shows creation/editing actions to eligible managers using the same ceremony page.

### Records — `/student/records`

- Shows attendance rate, late check-ins, unexcused absences, active sanctions, and earned merit.
- Searches and filters the attendance ledger by category and status.
- Opens attendance details, including timestamps and recording information.
- Shows service and merit sessions with rendered hours, sanctions cleared, and merit earned separately.
- Shows the sanctions/demerits ledger and individual sanction details.
- Exports a personal PDF transcript.
- Displays the clearance message when the student qualifies.
- Opens **Clearance certificates**: shows scheduled clearing periods and eligibility, waits for OSSA release, then requests, previews, and downloads a verifiable A4 landscape PDF with a school seal, issue date, reference, and verification QR.
- Certificates use the student's highest academic unit as the school name, Old English headings, and the office name **Office of the Students Services and Affairs**.
- Reports missing or incorrect institutional event, ceremony, service, or merit attendance through **Attendance corrections**, with requested times, an explanation, optional evidence, and decision history.

> “Students can trace individual attendance entries and see why their balance changed. Rendered time, cleared sanctions, and earned merit are shown separately.”

### My Profile — `/student/profile`

- Shows identity, academic assignment, and contact details.
- Edits the available contact fields and saves profile photos.
- Opens information change, optional-information deletion, and transfer requests, with request history.
- Provides password change with the required verification steps.
- Enrolls or disables Google Authenticator two-factor authentication.
- Adds, lists, and removes passkeys where supported and configured.
- Offers app installation controls where supported, plus sign-out.

### Organizations — `/organizations`, `/organizations/:organizationId`

- Searches available organizations and views their descriptions and joining policies.
- Joins immediately, applies for head approval, or supplies a join key according to policy.
- Shows approved, pending, or rejected membership status.
- Opens organization activities and permitted details.
- Leaves an organization or withdraws an application.

## 6. Mayor / Attendance Officer — features per page

The Mayor keeps the student pages above and receives attendance responsibilities for the assigned scope.

### My Classroom — `/ssg/panel`

- Opens the assigned classroom/hierarchy context.
- Searches and views the accessible class roster.
- Opens a student's detail page for authorized records and attendance context.
- Does not grant the default Mayor role member editing, role assignment, or event creation.

### Attendance Scanner — `/mayor/scan`

- Chooses an eligible attendance activity.
- Selects scan-in or scan-out.
- Selects the device camera and starts/stops QR scanning.
- Shows the matched student's photo, name, ID, and class for identity verification.
- Records after confirmation, or uses **Waive** to dismiss the match without recording.
- Supports exact student-ID lookup and manual recording with a reason.
- Applies the event's schedule and geofence checks.
- Shows successful and already-recorded receipts.
- Shows completed service credit results after scan-out.
- Provides offline roster preparation, pending capture status, synchronization, review export, retry, and clearing confirmed device records.

> “Scanning identifies the account. The officer still checks that the person presenting the code matches the student before recording.”

## 7. SSG Officer — features per page

### Home — `/dashboard`

- Uses the staff home with campus, pending application, active event, and available workspace summaries.
- Provides administrative quick actions based on the account's access.
- Still has personal My QR, Events, Ceremonies, Records, and Profile pages.

### SSG Panel / Institution Control Hub — `/ssg/panel`

- Navigates the assigned academic hierarchy and class rosters.
- Edits, archives, and restores existing units where permitted.
- Creates academic units only when the separate creation permission is granted.
- Creates and manages organizations under permitted units.
- Manages available unit officer assignments.
- Adds individual class members when manual member creation is permitted.
- Reviews enrollment applications: inspect, approve, return for clarification, reject, or delete as allowed.
- Opens member details and designation controls according to access.
- Provides a quick event/deployment form with schedule, audience, location/perimeter, and penalty configuration. Use the dedicated Event Management form for the full demo.

### Student detail — `/ssg/panel/students/:studentUid`

- Opens student identity and assignment information.
- Shows authorized attendance/sanction records and a monthly attendance trend.
- Shows student request information allowed for the viewer. Information request history and review are restricted to OSSA and administrators under current rules.

### Event Management — `/ssg/events`

- Lists institutional events as active, scheduled, or archived.
- Searches and filters by status, recipients, and geofence configuration.
- Opens event information and general-event details.
- Opens the creation wizard and authorized edit forms.
- Shows event approval requests and decision status where applicable.

### Event and ceremony forms

- `/ssg/events/create` and `/ssg/events/:eventId/edit`: general events, attendance events, cleaning/service, and merit activities.
- `/ssg/ceremonies/create` and `/ssg/ceremonies/:eventId/edit`: flag raising/retreat scheduling.
- Default SSG submissions require OSSA approval. Changes to an activity requiring approval trigger another review.
- Pending or rejected activities do not open attendance or apply sanctions.

### Attendance — `/admin/attendance`

- Available to SSG through the default attendance-management permission despite the `/admin` route name.
- Filters and reviews scoped attendance, analytics, and report exports described below.

## 8. OSSA Administrator and OSSA Staff — features per page

### OSSA Hub — `/ossa/dashboard`

- Opens workspaces with pending counts and student affairs summaries.
- Shows enrolled students, students with sanctions, clearance counts, outstanding hours, and excuse application counts within the available scope.
- Provides refresh and school payment notices where applicable.

### Event & ceremony approvals — `/ossa/dashboard/activities`

- Searches and filters submitted institutional activity requests.
- Opens requester, schedule, recipient, attendance, location, and sanction details.
- Approves eligible future activities or rejects with decision notes.
- Blocks approval by the activity's own author.
- Requires `events.approve`: default OSSA Administrator has it; default OSSA Staff does not.

### Student information requests — `/ossa/dashboard/requests`

- Reviews information corrections, optional-information deletions, and transfer requests.
- Compares current and requested values.
- Approves/rejects individual changes or all remaining pending changes.
- Stores review decisions and updates approved fields.

### Student sanctions & analytics — `/ossa/dashboard/sanctions`

- Shows sanction/clearance metrics and department charts.
- Searches students by name, ID, or section; filters by department and sanction status.
- Opens the student full record, academic assignment, contact details, and sanction action history.
- Adds, deducts, or clears sanction hours with an official reason when authorized.
- Exports the sanction roster as CSV.

### Excuse applications — `/ossa/dashboard/excuses`

- Searches and filters submitted excuses by status/category.
- Opens student information, explanation, event, supporting document, and submission time.
- Approves with the selected sanction hours to waive, or rejects with notes.
- Shows decision notes, hours waived, review time, and reviewer for completed requests.

### Clearance certificates — `/ossa/dashboard/clearance`

- An assigned OSSA Administrator or OSSA Staff account with `ossa.manage_cases` creates a clearing schedule for its assigned academic unit and descendants.
- Enter a period name and start/end times in Philippine time before clearing begins. Schedules cannot be backdated or edited; certificates initially remain on hold.
- Eligibility requires an actual positive-to-zero sanction balance transition recorded by the server during the scheduled period. An existing zero balance or clearance outside the period does not qualify. Offline service qualifies when its credit is accepted by the server.
- Shows eligible and issued counts. Use **Enable release → Confirm release** to allow qualified students to request and download; **Hold release** pauses further downloads, including repeat downloads.
- Issue date, identity, release authority, and reference are saved when the student first requests the certificate. Repeated downloads reuse that certificate.
- New outstanding sanctions revoke issued certificates. Clearing again during an eligible scheduled period permits a new certificate; the previous revoked certificate stays invalid.
- Verification through the QR opens `/verify/clearance/:token` without signing in. It reveals only validity, student name, school, clearing period, reference, issue date, and clearance date. Student IDs, attendance, sanction history, balances, and contact details remain private.
- A release hold preserves verification of already issued certificates. The certificate confirms sanction clearance; other school requirements are assessed separately.

### Organization approvals — `/ossa/dashboard/organizations`

- Reviews organization activity and sanction requests within scope.
- Opens request details and approves or rejects eligible requests.
- Opens organizations for membership, activity, attendance, and sanction oversight as permitted.

### Attendance corrections — `/ossa/dashboard/corrections`

- Reviews missing or incorrect institutional attendance, ceremony, service, and merit sessions.
- Shows original recording details, requested times, explanation, and optional evidence.
- Approves using verified Manila times; the server derives present/late/absent and reconciles the affected session penalty or service/merit credits. Service and merit approvals require a current server credit preview.
- Requires decision notes for both approval and rejection; retains the original, corrected result, reviewer, balance adjustment, notification, and audit history.
- Requires an Admin/OSSA/OSSA Staff account with case-management access within the student's scope. Self-review is blocked.

### OSSA Hierarchy — `/ssg/panel`

- Administrator: directory/member management, unit creation, officer assignment, application review, organization management, and permitted transfers.
- Administrator: weekly class schedules for sections/blocks, used to preview ceremony exemptions.
- Staff: hierarchy access follows scanner permissions and assignment; default staff does not manage structure or members.

### Other available pages

- Both roles: staff Home, Profile, Ceremonies, Attendance Scanner, and Attendance Dashboard.
- OSSA Administrator: Event Management and event/ceremony creation, Student Transfers, and the System Health tab in System Controls through permission-based access. Some pages may be reached by quick action or direct route rather than a dedicated sidebar link.
- Staff event creation/approval requires additional configuration; do not present it as default access.

## 9. Administrator — features per page

### School Hierarchy & Accounts — `/admin/hierarchy`

- Navigates and manages the school-wide academic structure.
- Adds units or applies supported hierarchy presets; edits unit details.
- Archives/restores units and deletes units when the required checks allow it.
- Manages members, academic assignments, unit officers, and enrollment review.
- Opens detailed student records and authorized information request history.
- Creates/manages organizations at school or academic unit scope.
- Maintains weekly class schedules.
- Opens Student Transfers.

### Holidays & Suspensions — `/admin/calendar`

Available to any role granted **Manage Holidays & Suspensions**. Assigned scope applies unless **Manage School-wide Suspensions** is also enabled. Open the editor using **Holidays & Suspensions** on My Calendar. Configure these toggles under System Controls → RBAC Roles → Events. Only System Admin receives management by default; saved notices cannot yet be edited or withdrawn.

- Marks school-wide or scoped academic dates, including descendants, with an official reason. Select academic units through the enrollment-style academic path and add one or several units.
- Previews affected activities and affected/unaffected recipients before applying attendance suspension, bulk cancellation, or bulk rescheduling.
- Changes schedules only for wholly affected future activities without attendance; shared or ongoing activities suspend affected participation while retaining other students' schedules.
- Blocks recording and absence sanctions for suspended sessions, including new activities; notifies affected students and records the action history.
- Rescheduling shows activity details and asks for a new start date for each selected activity, followed by a schedule preview. Selecting a general event moves its specific activities together while preserving their relative dates and attendance configuration. Specific activities can move independently within their parent dates. Applicable OSSA review is retained; ceremonies require individual review before rescheduling.

### Student Transfers — `/ssg/transfers`

- Selects one or several students and chooses a destination class.
- Supports moving up or down a year through the selected destination.
- Exports an easy Excel template with a destination dropdown, plus CSV and class-reference options.
- Imports edited CSV or Excel workbooks and previews assignment changes.
- Applies the reviewed batch together; invalid or outdated assignments reject the batch.
- Preserves attendance records and balances with the student.
- Transferred Mayors become Students; appoint the new class Mayor separately.
- Supports up to 1,000 students per batch within the user's scope.

### Attendance Dashboard — `/admin/attendance`

Also available to OSSA, OSSA Staff, and SSG when granted attendance-management access.

- Filters by event scope, period/custom date range, education level, and available academic filters.
- Shows attendance summary, analytics, and detailed ledger entries.
- Opens recorded attendance details, including timing and recorder information.
- Exports PDF reports with scope/content choices and a preview.
- Exports formatted Excel reports with summary, charts, and detail records.
- Exports plain CSV data for other tools.

> “The school can move from a broad attendance summary to individual records, then export a report for the selected scope.”

### System Controls — `/admin/controls`

| Tab | Demonstrate |
| --- | --- |
| Accounts | Create managed official accounts, choose role and assigned unit, enter/generate initial passwords, open profiles, reset passwords, and use available account access/freeze controls |
| RBAC Roles | Edit built-in role permissions, create/edit/delete custom roles, distinguish access roles from positions, and assign roles through the available controls |
| Freeze Controls | Freeze/unfreeze the entire system or an academic unit and its descendants, with a reason and required confirmation/security verification |
| System Health | Authorized data connection and freshness, snapshot response times, application record counts, reported error groups, and searchable security/activity history |
| Payments | School subscription billing details, balance, due date, paid/unpaid state, and payment notices posted to OSSA |
| Homepage Video | Select a repository video, preview it, and save the public homepage selection |
| Legal pages | Preview and edit saved privacy, deletion, agreement, and terms content |

The Payments tab tracks school subscription billing and posts in-app notices. Do not present it as online checkout, student fee collection, or an automatic email-payment service.

The System Health screen measures application reads and reported diagnostics. Do not describe it as a complete infrastructure CPU/storage monitoring console.

### Shared operational pages

- Home, Profile, Ceremonies, Event Management, event/ceremony forms, Attendance Scanner, and Attendance Dashboard.
- OSSA Hub case work through case-management permissions.
- Institutional event review still requires an eligible OSSA reviewer; administrator access is not the same as an activity approval role.

## 10. Detailed event creation workflows

### A. Create an institutional attendance event

**Account:** SSG, OSSA Administrator, or Admin with event-management access.

1. Open **Event Management → Create Event**.
2. **Details:** choose **Attendance event**; enter the title, description/instructions, venue, and optional banner.
3. Choose **Standalone event** or an existing general event. For eligible standalone attendance events, choose weekly occurrences: 1 for a single activity, up to 52 for recurrence.
4. **Schedule:** choose start/end dates and attendance windows. Give each window a title, time-in, time-out, and late threshold. Add separate windows for morning/afternoon sessions or breaks.
5. **Attendees:** select the responsible unit where offered, then choose recipient groups through the academic hierarchy or specific people using the available picker. Add multiple groups as needed.
6. **Rules & Location:** choose the excuse submission period, separate late and absent sanction values/units, and geofence settings.
7. If geofencing is enabled, select coordinates using the map/current location and set the radius in meters.
8. **Review:** check all configuration. Go back to earlier phases if needed.
9. Click **Submit for OSSA Approval** when approval is required, or **Schedule Event** when it is not.
10. Show the resulting activity and its current approval/schedule status in Event Management.
11. If submitted for review, switch to a different eligible OSSA reviewer, open **OSSA Hub → Event & ceremony approvals**, review, and approve before the start time.
12. At its scheduled time, show the activity as available to the recipients and scanner.

> “One event can have multiple attendance sessions, different penalties for late and absent students, and a physical scan perimeter. SSG's event stays inactive until OSSA approves it.”

**Scope behavior:** “All Students” is limited to the creator's assigned scope for non-admin accounts. An unassigned officer cannot schedule institutional activities. Recipients outside the permitted scope cannot be added.

### B. Create a general event with specific activities

**Example:** School Week as the general event; Opening Program and Closing Program as specific events.

1. Choose **General event (duration)** in Create Event.
2. Enter its title, description, banner/venue where offered, overall date range, and recipients.
3. Save/submit the general event and open its detail page.
4. Click **Add specific event**.
5. Create an attendance or other supported child activity within the parent's date range.
6. Configure attendance windows, location, sanctions, and other rules on the specific activity.
7. Open the general-event page to show its grouped specific activities.

A general event groups activities over a duration. It does not itself take attendance or apply attendance sanctions; those belong to the specific events.

### C. Create a flag ceremony series

1. Open **Ceremonies → Create Ceremony**.
2. Choose flag raising or flag retreat and enter the title/instructions.
3. Configure the standard-week option or an exceptional schedule. Standard mode uses Monday raising / Friday retreat with editable school times.
4. Choose weekdays and monthly occurrence limit. Predict dates, navigate the calendar, and add/remove selected dates manually.
5. Keep only dates allowed for saving: in the current Philippine month or the next seven days, and before the ceremony begins. Calendar preview can extend further than the permitted saving range.
6. Set default attendance windows and recipients.
7. Search and add individual student exemptions. Add class-specific attendance-window overrides where needed.
8. As OSSA/Admin, optionally use class or weekly-schedule exemption filters. Preview affected students for each ceremony date before applying.
9. Configure optional volunteer merit, geofence, sanctions, and excuse window.
10. Review and schedule/submit the selected dates. Each date becomes a separate linked occurrence.
11. Review the approval state and open a saved occurrence to show its details.

> “The calendar predicts matching weekdays. Administrators can record holidays and suspensions to pause attendance for the affected units. Each saved ceremony still has its own attendance and exemption rules.”

- Editing an occurrence does not edit the whole series.
- Weekly class schedules help select exemptions; saving a class schedule does not automatically exempt students.
- Individual exemptions apply across selected dates; schedule filters can produce date-specific exemptions.
- Exempt students are excluded from required attendance, related sanctions, and volunteer merit.
- Eligible non-recipients within scope may volunteer; configured volunteer merit is awarded after scan-out and capped at the outstanding sanction balance.

### D. Create a cleaning / sanction service activity

1. Open Create Event and choose **Sanction / Cleaning Service**.
2. Enter title, instructions, date range, recipients, location, and daily attendance windows.
3. Use separate windows to exclude breaks.
4. As OSSA/Admin, choose whether excess rendered service clears only current sanctions or also becomes earned merit.
5. Review and schedule/submit; complete any required activity approval.
6. Scan the student in at the service window and out after participation.
7. Show the receipt and Records: actual rendered hours, sanctions cleared, and any saved earned merit.
8. If extra service days are needed, open the authorized edit form and **Extend service duration** to a later end date with the same windows.

- Unfinished sessions do not earn completed service credit.
- A student cannot start overlapping service/merit participation while an earlier one remains open.
- Extending the duration preserves existing attendance/credits; it does not reopen an archived/cancelled activity.

### E. Create a fixed merit activity

1. Choose **Merit activity**.
2. Set the fixed award, from 0.01 to 24 hours.
3. Configure dates, recipients, required attendance windows, and location/geofence.
4. Schedule/submit and obtain review if required.
5. Complete scan-in and scan-out for every required session on every scheduled date.
6. Show the one-time award in Records: sanctions are cleared first, and any remainder is saved as earned merit.

> “Service credits depend on completed time. A merit activity releases a fixed award only after the full attendance requirement is complete.”

Saved earned merit is a separate balance; do not promise it automatically cancels future sanctions.

### F. Edit, reschedule, cancel, or finish an activity

- Open the authorized edit form for the activity.
- Upcoming activities expose applicable save/reschedule, drop, cancel, archive, and delete actions.
- Active institutional activities expose applicable cancel and finish/archive actions.
- Recorded attendance locks normal configuration changes. Service duration extension is a separate supported action.
- Changes to activities requiring OSSA review return through approval; pending/rejected activities remain unavailable for attendance.
- Explain actions against a prepared demo event; do not delete the activity needed for the attendance walkthrough.

## 11. Attendance workflows

### A. Online QR attendance

1. Student opens My QR, or presents the prepared printed ID.
2. Mayor/authorized officer opens Attendance Scanner and selects the approved activity.
3. Choose **Scan in**, select the camera, and click **Start**.
4. Read the QR and show the matched identity.
5. Verify the student and click **Record**; use **Waive** if the presented identity should not be recorded.
6. Show the attendance receipt, then choose **Scan next student**.
7. Attempt the same attendance action again to show the already-recorded behavior.
8. For activities requiring checkout, switch to **Scan out** and record at the appropriate time.
9. Return to the student's Records and the staff Attendance Dashboard to show the result.

Geofence checks use the recording device's location. Camera/location errors or an invalid attendance window must be resolved before the record is accepted.

### B. Manual attendance

1. Choose the activity and scan direction.
2. Enter the exact student ID in **Manual recording → Check student**.
3. Verify the returned identity in person.
4. Enter the reason for manual entry and record.
5. Show the resulting receipt and recorder information.

### C. Offline attendance

1. While online and signed in, select an eligible activity and **Download offline roster** or **Refresh offline roster**.
2. Check readiness, saved student count, capture deadline, and sync deadline.
3. Go offline and use a prepared printed QR or exact student ID. Generating a new rotating QR requires internet.
4. Verify identity using the saved information; use the school ID if no photo is available.
5. Record and show **Saved on this device — pending server confirmation**.
6. Reconnect and keep the app open; use **Sync pending attendance** as needed.
7. Show confirmed records or **Needs review** failures. Resolve the issue before retrying.
8. Optionally export the sync review; clear confirmed records from the device after successful synchronization.

> “Offline attendance is prepared in advance. A local capture becomes official after the server accepts it.”

Do not clear device storage with unsynchronized attendance. Sign-out removes downloaded rosters but retains pending captures for the same account's next sign-in. This is a prepared scanner workflow, not full offline access to every page.

## 12. Excuses, sanctions, and student requests

### A. Submit and review an excuse

1. Student opens the eligible event/ceremony and chooses **File for excuse** or the available letter submission action.
2. Select a reason, provide the explanation and requested contact details, and attach supporting evidence.
3. Submit a non-empty PDF, JPG, PNG, or WebP file up to 5 MB.
4. Show the pending submission.
5. OSSA opens **Excuse applications**, reviews the letter and evidence, and chooses hours to waive on approval.
6. Approve, or reject with notes.
7. Reopen the request/student records to show the decision and resulting attendance/sanction treatment.

- The normal excuse window defaults to three days after the activity ends; creators can configure 0–30 days.
- Pending/approved duplicate applications block another submission for that activity.
- Excuses are unavailable for general events, service/merit activities, cancelled activities, and unapproved activities.
- Closed windows and frozen submissions direct the student to OSSA for exceptional handling.

### B. Adjust or clear sanctions

1. OSSA opens **Student sanctions & analytics** and finds the demo student.
2. Open **Manage** and inspect the current balance and history.
3. Choose **Add**, **Subtract**, or **Clear**.
4. Enter hours where required and the official reason; confirm.
5. Show the updated balance and action history.
6. Return to Student Records; show the clearance message if all sanctions are resolved.

Use the permitted sanction tools rather than assuming every directory member manager can adjust sanctions.

### B.1. Release and download a clearance certificate

1. OSSA opens **OSSA Hub → Clearance certificates**, creates a current/future clearing period, and keeps release on hold.
2. During that period, complete the demo student's service or authorize a sanction adjustment that takes their positive balance to zero.
3. Student opens **Records → Clearance certificates** and shows **Qualified · Waiting for OSSA release**.
4. OSSA opens the period, chooses **Enable release**, and confirms the release.
5. Student refreshes the certificate panel, chooses **Request certificate**, reviews the preview, and downloads the **A4 landscape PDF**.
6. Scan the certificate's QR using another device to show the public verification result. The QR includes a random verification token, not the student's attendance QR.
7. Optionally add a new sanction to the demo account and verify that the previous certificate no longer reports valid clearance.

> “Zero sanctions alone do not release a certificate. The student must clear during the published schedule, and OSSA must authorize release. Anyone with the certificate's QR can verify its limited clearance information.”

### C. Information correction or optional deletion

1. Student opens Profile → **Manage information requests**.
2. Choose **Request information change** or **Request information deletion**.
3. Enter corrections or select optional fields for removal, add a reason, and submit.
4. Show request history. Only one pending request can be submitted at a time.
5. OSSA/Admin opens the request and compares current versus requested values.
6. Decide per field or approve/reject all pending changes.
7. Return to the profile and request history to show what was applied and the recorded decisions.

### D. Student-requested or staff-managed transfer

- Student route: Profile → **Request transfer** → choose the destination and reason → authorized review → updated assignment.
- Staff route: Hierarchy → **Transfer students** → select students or import a template → choose/review destinations → apply the batch.
- Explain that personal records stay with the student after reassignment.

### E. Report and review an attendance recording mistake — phases 1 and 2

1. Student opens Records → **Report a problem / missing record**, or opens an attendance entry → **Report a problem with this record**.
2. Choose a completed institutional attendance, ceremony, service, or merit activity/session ending within the last 30 days. Missing records can also be selected.
3. Choose **I attended** and enter the requested arrival time using the AM/PM controls, with optional departure time. Choose **Mark me absent** only to remove an incorrectly recorded attendance entry. All times use Philippine time. Check the **Current record → Requested change** preview, explain the mistake (10–2,000 characters), and optionally use **Choose file** to attach a non-empty PDF, JPG, PNG, or WebP up to 5 MB. The selected filename and size are shown, with replace/remove controls.
4. Submit. A pending request does not change attendance or sanctions; only one pending request is allowed per student/event/session.
5. Authorized OSSA/Admin opens **Attendance corrections**, reviews the original recording and evidence, and enters verified times and decision notes (5–2,000 characters).
6. For service or merit, review the server preview of rendered time, sanctions cleared, saved merit, and outstanding sanctions. A fixed merit award requires every scheduled session to have both check-in and checkout. Refresh the preview if balances change. Approve to apply the correction, or reject with notes. No time-in means absent; otherwise the server calculates present/late using the session's late threshold.
7. Return to Student Records and open the request history to show the original recording, decision, corrected record, reviewer, and sanction adjustment. Show the in-app decision notification.

- Phase 1 covers institutional attendance events and flag ceremonies; phase 2 also covers institutional service and merit activities. Volunteer credit, general events, and organization activities remain excluded.
- Service and merit corrections append signed ledger adjustments. Reducing credits removes saved merit first and then restores previously cleared sanctions. Increasing service credits clears current sanctions first; excess follows the activity’s saved overflow policy. Unchanged service times do not clear newly added sanctions again.
- Overlapping service/merit participation is rejected. Changes to another session or the relevant credit ledger after submission block approval and require rejection/resubmission. Changes to the current balance require refreshing the credit preview. Original attendance snapshots and original award entries remain in the history.
- Pending/approved excuses block corrections for that activity. Use excuses for justified non-attendance and corrections for recording mistakes.
- Invalid session times, unapproved/cancelled activities, account/scope freezes, and unauthorized reviews are rejected by the backend.
- If attendance changes after submission (for example, an offline capture synchronizes), approval is blocked. The reviewer can reject it and ask for a new request against the latest record.
- For institutional attendance/ceremony penalties, reconciliation appends an adjustment for the affected session. Reductions stop at the outstanding balance; previously completed service is not refunded or turned into merit. Service/merit corrections use their separate credit reversal rules above. Unrelated sanction entries remain intact.

## 13. Organization workflows

### A. Establish an organization

1. Authorized directory manager opens the hierarchy at the intended unit, or general school scope for Admin.
2. Use the Add flow to establish an organization.
3. Enter its name, description, logo, academic unit, and heads where authorized.
4. Choose self-joining policy: closed, immediate joining, or applications requiring head approval.
5. Optionally require a join key and choose public visibility.
6. Save and open **Manage organization** from the hierarchy.

### B. Join and manage membership

1. Student opens Organizations and finds an eligible organization.
2. Choose Join/Apply, supplying a join key if required.
3. Head opens **Members & applications** and accepts/rejects a pending application.
4. Show the student's updated membership status.
5. Head can add eligible students from the available unit picker or remove members.
6. Student can leave or withdraw through the organization page.

### C. Organization events and attendance

1. Head/authorized manager opens **Create event / merit activity**.
2. Create a general event, attendance event, or merit activity with the available form.
3. Organization activities with late/absence sanctions require OSAS review; other approval requirements follow the applicable rules.
4. Eligible OSSA reviewer opens the organization approval queue or organization review controls and approves/rejects.
5. For an approved active specific activity, manager opens **Record organization attendance**, chooses the approved member, provides a reason, and records time-in/time-out.
6. Show resulting attendance/merit credit in the student's records.

Organization event creation does not offer the institutional cleaning/service activity option.

### D. Organization sanction request

1. Head selects an approved member, enters hours and the reason, and clicks **Submit to OSAS**.
2. Show the pending request: the student's balance has not yet changed.
3. OSSA reviews and approves/rejects the request with the available notes.
4. Show the decision and, if approved, the updated sanction record.

## 14. Administration mini-walkthroughs

- **Managed account:** Accounts → Create account → identity/username/email → role → assigned unit for non-admin → initial/generated password → create → open profile. Handle temporary credentials outside the projected screen.
- **Roles:** RBAC Roles → open a role → show permissions grouped by responsibility → explain one change and save only on demo accounts if demonstrating the write.
- **Freeze:** Freeze Controls → select a demo unit → enter the target name/reason and required verification → freeze → show affected account screen → unfreeze. Descendant units are included.
- **Reporting:** Attendance → choose scope/date range → show analytics → open PDF preview → download PDF/Excel/CSV as appropriate.
- **Billing notice:** Payments → show school billing details → prepare an OSSA notice → post it only when part of the intended demo → open the OSSA notice view.
- **Health/audit:** System Health → refresh → show data freshness and response times → find the attendance or sanction action in authorized audit history.
- **Public content:** Homepage Video or Legal pages → preview → save an intended demo change → show the public page.

## 15. Closing script

> “We followed the same student across enrollment, approved activities, attendance, records, and student affairs review. Each person works from the pages and scope relevant to their responsibility. The school can review supporting evidence, manage service and sanctions, and export records while keeping an action history.”

> “For students, the main benefit is visibility into their own attendance and requirements. For officers, it is a consistent recording process. For OSSA and administrators, it is a connected review and reporting workflow.”

## 16. Presenter accuracy notes

- Error notices show a code, a plain-language message, and who can help: amber for user actions, blue for school staff, red for confirmed developer faults, and grey for causes support must investigate. Unknown failures include a reference; check the latest records before repeating a change whose result is uncertain. See [all error codes and exact messages](error-codes.md).
- Demonstrate saved permissions and deployed behavior, not just the default role names in this guide.
- Some existing source components are not connected to the current routes. For example, the separate `ManageMembers` screen contains bulk member CSV import, but `App.tsx` does not route to it. Do not promise bulk account/member import as a current hierarchy feature. The routed Student Transfers CSV/Excel workflow is available.
- Camera scanning, GPS, Google sign-in, passkeys, uploads, app installation, and offline sync depend on browser permissions and deployment setup. Verify the features you intend to demonstrate beforehand.
- The Apps Script profile image service and Supabase keep-alive are supporting services, not separate role pages. A keep-alive trigger runs only after installation/configuration; it is not a guarantee that a backend will never pause.
- This document is a source-based demo guide, not a live acceptance test or a claim that every deployed feature has been verified.

### Source references

- Error catalog and responsibility labels: [`lib/errors.ts`](../lib/errors.ts), [`lib/errorCatalog.json`](../lib/errorCatalog.json), and [`docs/error-codes.md`](error-codes.md).
- Role defaults and permissions: [`lib/accessControl.ts`](../lib/accessControl.ts).
- Routes and access gates: [`App.tsx`](../App.tsx).
- Navigation labels: [`components/ui/Layout.tsx`](../components/ui/Layout.tsx).
- Activity wizard: [`components/events/ActivityForm.tsx`](../components/events/ActivityForm.tsx).
- Ceremony behavior: [`docs/ceremonies.md`](ceremonies.md).
- Scope and event checks: [`docs/event-verification.md`](event-verification.md).
- Page implementations: [`views/`](../views/).
- Offline attendance: [`components/attendance/OfflineAttendancePanel.tsx`](../components/attendance/OfflineAttendancePanel.tsx).
