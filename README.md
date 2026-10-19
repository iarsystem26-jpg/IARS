# RMC Attendance

React/Vite application connected to Supabase project `iqnjyebkcetcmwammxff`.

```sh
npm ci
npm run dev
```

The local environment is already configured. For another workstation, copy `.env.example` to `.env.local` and supply the project's publishable key. Only `VITE_SUPABASE_URL` and the publishable key belong in the frontend environment. Never put a service-role key in a `VITE_` variable.

Student IDs use `YYYY-XXXXXL`: four year digits, a hyphen, five numbers, and one letter, for example `2025-00046A`. Registration and student/mayor member imports require this format; letter matching is case-insensitive. Apply the `student_id_letter_suffix` database migration before using the updated enrollment flow.

## Connected workflows

- Supabase Auth login by username or email, persistent sessions, password changes, password recovery, and authenticator MFA.
- Academic directory creation, hierarchy templates, officer assignment, role permissions, enrollment keys, account creation, and CSV member imports.
- Student admission, private photo/ID uploads, rejection, resubmission, and approval.
- Events, weekly recurrence, recipient scopes, daily attendance windows, geofences, and late/absence rules.
- Expiring QR passes, officer identity checks, manual attendance with a reason, scan-in/out, service hours, and merit credits.
- Scheduled absence finalization, sanction adjustments, excuse documents/review, reports, and audit records.
- System/unit freezes, role administration, and stored in-app payment notices.
- Organizations at school-wide or any academic-unit scope, multiple student memberships, organization heads, public visibility, optional join keys, and reviewed applications.
- Organization attendance and merit events, with OSAS approval before sanction-bearing events open and before individual organization sanctions affect balances.

## Excuse submissions

In an event or ceremony's **Rules & Location** step, authorized creators/editors can set **Days to submit after the activity ends** (0–30; default 3). Zero closes filing at the activity's end. Each recurring occurrence uses its own end time. Students may file in advance once the activity is approved and see the exact deadline in Philippine time. Existing activities without a setting use the three-day default. The existing restrictions on editing activities with attendance still apply.

An explanation of at least 10 characters and a supporting PDF, JPG, PNG, or WebP document up to 5 MB are required. The database enforces deadlines, document ownership/existence, and one pending or approved request per student/activity. Rejected requests can be resubmitted before the deadline. General events, cancelled activities, service, merit, and unapproved activities do not accept excuses. Existing scope and freeze checks still apply. Filing alone does not excuse an absence; OSSA approval is required, and OSSA may review a timely request after the submission window closes. Exceptional late cases must be handled by OSSA through its existing case/sanction tools.

Run `node scripts/verify-excuses.mjs` with the server environment and local test-admin credentials to verify the live policy. It creates and removes temporary records and uploads.

## Organizations

Open **School Hierarchy** (or your role's hierarchy page), select an academic unit, and use the same **Add** tile as educational units, then choose **Organization** from **Semantic type**. Existing organizations remain separately labeled; empty organization panels are hidden. The form automatically locks the selected unit. The administrator's hierarchy root contains school-wide organizations. Accounts with directory-structure permission can establish organizations within their assigned scope. Students retain the Organizations directory for discovery and joining. Assign organization heads without changing their existing account roles. Heads can change the logo, public visibility, and joining policy, review applications, remove members, and manually add students from their own academic unit. Organization scope is fixed after creation.

Joining can be closed, immediate, or subject to head approval, with an optional hashed join key. Students can join multiple organizations while retaining their academic enrollment. Hidden organizations remain accessible to their members, heads, and authorized reviewers, and are omitted from the public directory at `/#/organizations/public`.

Heads submit individual sanctions to OSAS. Attendance events with penalties also remain pending until OSAS approves them; changing their configuration requires another review. Only scoped OSAS accounts can approve sanctions, including submissions made by administrators. Merit events use the existing attendance completion rules: complete all required sessions, deduct outstanding sanction hours first, then credit excess hours as merit. Admin, OSAS, and SSG retain their existing merit-event creation tools; organization heads create them from the organization page.

Logos use the existing Google Apps Script image uploader and Google Drive display mechanism. The configured web-app URL must be deployed and accessible. Failed uploads leave the organization form open with a readable error.

The organization schema is in `20260930160615_organizations_membership_approval.sql`. Verification commands create uniquely named temporary records and clean them up:

```sh
npm run test:organizations
npm run test:organizations:browser
```

The browser check expects a local server at `http://127.0.0.1:4173` (override with `AUDIT_BASE_URL`) and tests a real logo upload. Set `MOCK_ORGANIZATION_UPLOAD=1` only to verify the remaining UI when the image service is unavailable; that mode does not verify the live uploader.

Attendance uses database time and database authorization. Concurrent duplicate scans do not award credits or penalties twice. Geofenced saves require a new GPS reading; offline scans are not accepted. The displayed student identity must still be verified by the officer. A browser's GPS can be spoofed, so it is not a guarantee of physical presence.

School data is loaded into an authorized in-memory snapshot and refreshed after writes, on focus, and every 15 seconds while visible. It is not stored in a browser demo database. Supabase stores its Auth session locally. The old simulator exists only under `tests/fixtures` for isolated component regression tests.

## Checking accounts

The five original test identities are retained in Supabase Auth: `admin`, `ossa`, `ssg`, `mayor`, and `student`. Their current demo passwords are in the ignored local file `.demo-accounts.local`. Credentials are never included in the website or committed to Git.

The administrator can create the actual academic hierarchy and assign staff to the appropriate units. Other checking accounts initially have no academic assignment. There are no sample directory units, events, attendance records, admissions, or sanctions.

`npm run seed:test-accounts` is an explicit, server-only maintenance command. It needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the ignored `.env.server.local`; it preserves existing accounts and does not seed business data. Provisioned members without an explicit initial password receive an unguessable password and must request a password reset. Provisioning does not send emails automatically.

## Database and functions

Eight migrations in `supabase/migrations` have been applied to the connected project. Both Edge Functions, `rmc-login` and `rmc-accounts`, are deployed. The private `rmc-documents` bucket and the once-per-minute `rmc-finalize-attendance` cron job are installed.

Public tables have RLS and explicit grants. Business writes go through authorized database functions. Account provisioning authenticates the caller and performs role/scope checks before using server-only Auth administration. Deactivation and enrolled MFA also restrict personal reads and private documents.

The Edge Function gateway setting `verify_jwt = false` is intentional: login accepts a password without an existing JWT, and account management verifies its bearer token with `auth.getUser`, then runs authorization RPCs with that caller's JWT. Never remove those checks.

Future changes should use new migrations, not edits to applied migrations:

```sh
npx supabase login
npx supabase link --project-ref iqnjyebkcetcmwammxff
npx supabase migration new describe_change
npx supabase db push
npx supabase functions deploy rmc-login
npx supabase functions deploy rmc-accounts
```

Use the correct Supabase account when linking. The Codex MCP connection is separately authenticated; it does not replace the CLI's account login. The installed Supabase agent skills are in the local Codex skill directory.

## Passkey login

Users sign in with their existing username/password or Google account, open **My Profile → Passkeys**, and choose **Add passkey**. Later they can choose **Sign in with passkey** on the login screen. The device or password manager controls face, fingerprint, PIN, or security-key verification. Biometric data is not uploaded to this app. Users can remove individual passkeys in My Profile, with confirmation; password and Google recovery remain available. Account approval, authorization, and enrolled authenticator MFA still apply.

Supabase's native passkey API is experimental. The installed SDK already supports it and the client explicitly opts in. No additional biometric database or recognition service is needed. See the [Supabase passkey guide](https://supabase.com/docs/guides/auth/passkeys).

On Windows, configure the connected project using the existing Supabase CLI login (or a terminal-only `SUPABASE_ACCESS_TOKEN`):

```powershell
# Inspect the relevant settings without exposing credentials.
powershell -NoProfile -File scripts/configure-supabase-passkeys.ps1
# Enable passkeys, retain the configured RP ID/origins or infer them from Site URL,
# verify the saved configuration, and set the public VITE_PASSKEY_RP_ID locally.
npm run configure:passkeys
```

The current hosted RP ID is `rmcssg.vercel.app`, with origin `https://rmcssg.vercel.app`. Passkeys bound to that domain cannot be used on localhost. The app explains this and leaves password/Google login available. Keep the RP ID stable; changing it invalidates existing credentials. Set `VITE_PASSKEY_RP_ID` to the same value in deployment environment settings before rebuilding. To configure a different initial domain, the PowerShell script accepts `-RpId` and `-Origins`; it refuses to change an RP ID already enabled on the project. Local Supabase testing requires its own localhost RP configuration and separate local backend.

Verification:

```sh
npm test -- lib/passkeys.test.ts components/Passkeys.test.tsx components/AuthContext.test.tsx lib/supabase.test.ts
npm run typecheck
npm run build
npm run test:passkeys:browser
```

The browser check needs Chrome, `.demo-accounts.local`, and the server key in ignored `.env.server.local`. It serves the local build at the configured HTTPS origin inside an isolated browser, uses Chrome's virtual WebAuthn authenticator against the live Supabase project, and verifies enrollment, login, replay rejection, revocation, and password fallback. It temporarily adds one passkey to the student test account and removes that credential afterward. It does not publish the website or test physical Face ID/fingerprint hardware.

## Google login and enrollment setup

Cloud configuration was completed on 2026-10-08 for Vercel project `rmcssg` and Supabase project `iqnjyebkcetcmwammxff`: Google client ID in all three Vercel environments and the Edge Function environment, Google provider credentials, nonce checks, production Site URL, and local redirect URLs. `rmc-enroll` is deployed. The Google enrollment migration and updated frontend release still need to be deployed together. Google Cloud authorized origins and real browser consent must be checked in the OAuth client's console.

On this Windows workspace, `node scripts/configure-cloud-environment.mjs` synchronizes allowlisted public frontend variables and the Edge Function's Google client ID. `node scripts/configure-google-provider.mjs` previews provider/URL differences and verifies hosted settings; add `--apply` to save the declared configuration and the Google secret. These scripts read `.env.local` and `.env.server.local`, keep credentials out of command arguments, and suppress secret values. `node scripts/verify-cloud-google.mjs` verifies matching cloud values, authorization callback, deployed invalid-token rejection, and absence of the Google client secret from the frontend build. Supply `GOOGLE_CLIENT_SECRET` only in the ignored server environment file.

Google selection verifies an email without creating an Auth user, profile, or application. Unknown emails are prompted to enroll. Google enrollment locks the verified email and creates a pending account/application only after the complete form passes server validation. Existing emails sign in to their existing account; pending applicants are routed to application status by the existing route guard. Google enrollment still asks for a password so username/password login remains available. Suspended/inactive/graduated accounts cannot use Google to regain access.

Creation is limited to one attempt per email every 60 seconds and five attempts per IP every ten minutes, including failed Auth creation attempts. Existing Google accounts can sign in during this cooldown. Database tickets prevent direct Auth signup/OAuth from bypassing final enrollment. Existing email/name/username/student-ID unique indexes remain the final duplicate guard. Staff provisioning retains its separate authenticated reservation flow.

1. Create a **Web application** OAuth client in Google Cloud's Google Auth Platform. Configure branding/audience and add your deployed origin plus `http://127.0.0.1:3000` (or the exact development origin you use) under **Authorized JavaScript origins**. Add test users if the audience is still in Testing. Add `https://iqnjyebkcetcmwammxff.supabase.co/auth/v1/callback` under **Authorized redirect URIs**.
2. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and save that client ID and client secret. Keep nonce verification enabled. Set the production Site URL/redirect allowlist for signup confirmation and password recovery. Follow the [Supabase Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google).
3. Set `VITE_GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com` in `.env.local` and your frontend hosting environment. Set the same ID as the Edge Function secret `GOOGLE_CLIENT_ID` in Supabase. The Google client secret belongs only in Supabase's provider settings.
4. Deploy `rmc-enroll`, apply `supabase/migrations/20261008111610_google_enrollment_guard.sql`, and deploy this frontend in the same release. The database guard requires the updated frontend for regular enrollment too. The linked project's history has older gaps and a newer applied migration, so use the targeted query below rather than a general `db push --include-all`. Run the repair command only after the query succeeds; it records this migration without changing other history entries. If migration list already shows this version applied remotely, skip the query/repair pair.

```sh
npx supabase secrets set GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
npx supabase functions deploy rmc-enroll
npx supabase migration list --linked
npx supabase db query --linked --file supabase/migrations/20261008111610_google_enrollment_guard.sql
npx supabase migration repair 20261008111610 --status applied --linked
npm run configure:hosting
npm run build
```

The implementation uses Google's popup button and passes verified ID tokens through the enrollment Edge Function; no Google credentials are saved in browser storage. Restart Vite after editing `.env.local`. Production needs HTTPS. The CSP in the generated hosting headers permits Google's sign-in script/frame/connections.

After setup, test a new Google email: login must prompt enrollment and leave Auth Users unchanged, selecting Google during enrollment must lock the email without creating a user, and final submission must create exactly one pending application. Sign in again through either Google button to open the existing status page. Test an approved account, an inactive account, duplicate tabs, a cooldown retry, and normal email confirmation. Automated tests verify the handler/UI branches; real Google popup/provider integration requires your OAuth configuration and browser consent.

Focused checks: `npm test -- tests/google-enrollment-edge.test.ts tests/enrollment.test.tsx lib/backend.test.ts tests/security-config.test.ts`. `tests/google-enrollment.sql` exercises the real database guard/cooldown/duplicate behavior; run it with the migration inside a transaction and **ROLLBACK**. It creates temporary records and requires an existing active administrator for the directory fixture. The live database checks performed during development were rolled back; this feature's migration/function have not been deployed.

## Verification commands

```sh
npm run typecheck
npm test
npm run build
npm audit
npm run test:integration
npm run audit:browser
node scripts/verify-browser-writes.mjs
```

Integration checks require both ignored environment files and `.demo-accounts.local`. They create uniquely named temporary records in the configured project and remove only those records in cleanup. They exercise actual Auth, RPCs, RLS, Edge Functions, storage, concurrency, cron, and TOTP. No email is sent by the test suite.

The browser write check creates and removes temporary directory/event records using the actual forms.

The browser check requires Chrome and the application running at `http://127.0.0.1:4173`. Start it with `npm run dev -- --host 127.0.0.1 --port 4173`, or set `AUDIT_BASE_URL` to your local server. `CHROME_PATH` can override the Chrome executable. Results are saved in ignored `.supabase-verification.local` and `.browser-verification.local`.

Verified on 2026-09-19: 133 automated tests, 53 live integration checks, and 28 authenticated browser routes at desktop/mobile widths. Type checking and the production build passed; dependency audit reported zero vulnerabilities.

## Required before public launch

The application and backend are connected; public deployment has not been completed or certified.

1. Supply the production HTTPS URL and deploy `dist` with the two public Supabase environment variables. Set that origin as Supabase Auth's Site URL and allow it in redirect URLs. The production host is not known yet. HTTPS is required for camera/GPS outside localhost.
2. In Supabase Auth settings, verify email confirmation, configure a production SMTP provider, enforce a minimum password length of 12, and enable leaked-password protection when supported by the project plan. The MCP OAuth client cannot request the Auth configuration scopes needed to change those settings. Local `supabase/config.toml` settings do not change the hosted project. Leaked-password protection remains the security advisor's outstanding warning.
3. Test signup confirmation and password-recovery email delivery on the deployed origin. Those messages have not been sent during automated checks.
4. Test a physical phone camera and GPS: valid QR, expired QR, duplicate scan, outside-boundary scan, and service scan-out. API validation and mocked camera callbacks are tested; physical hardware and deployed permissions are not.
5. Enter the real academic hierarchy, officer assignments, and optional verified support contact environment values. Confirm the school's intended attendance/sanction rules before creating live events. Enrollment keys are stored as hashes; share a newly set key when saving it because existing keys cannot be retrieved.

Payment reminders are in-app notices, not outbound emails or payment processing. Database capacity, backups, and hosting uptime are managed in the Supabase dashboard rather than fabricated in the application.

## Offline attendance and roster lookup

1. While connected, sign in as an authorized scanner. The app automatically prepares scoped rosters for approved ongoing events and events starting within 24 hours, without opening the scanner. It checks in the background every minute while open and refreshes cached rosters after 15 minutes, also checking after login, reconnection, and workspace refresh. Preparation is limited to two events per pass and 20 successful grants per rolling hour on this device to leave capacity for manual refresh and other devices; larger event sets take longer. Open an event and check **students saved on this device** before disconnecting. **Download offline roster** / **Refresh offline roster** remains available for immediate preparation. Preparation must finish successfully on the same device/browser used in the field.
2. The downloaded roster contains only eligible students within the scanner's scope: names, exact student IDs, roles, basic section/level details, and authorized profile-photo references. Contact information, guardians, and private documents are excluded. Online and offline lookup check indexed local student IDs and prepared QR hashes first. A missing online ID or QR uses one scoped backend RPC, which authorizes the identity/hash and updates both the server grant and encrypted local roster. A newly encountered ID or rotating QR needs internet; an issued printed QR already in the cache can be identified locally. Local identity lookup is provisional: current server permission, revocation, and attendance checks still apply before confirmation.
3. Prepared scans are committed to encrypted IndexedDB before the UI displays **Saved on this device**. They remain **pending sync**, including across page reloads. Opening the prepared scanner offline also works when the Auth token cannot refresh; this restores only the attendance workspace and gives no online authorization. Camera and fresh GPS are still required for events that use them; GPS availability depends on the physical device, and map tiles need internet.
4. Reconnection, foreground polling, and the **Sync pending attendance** button retry pending submissions while the app is open. Requests keep their identifiers and original payloads across retries. Server receipts make concurrent retries idempotent. The UI marks confirmation only after the server acknowledges the matching request.
5. Rejected captures remain on the device as **Needs review**. Resolve the stated issue and retry, or use **Export sync review** for an administrator. Dependent scan-outs wait behind unresolved scan-ins. The export contains review details and receipts, not raw QR passes or GPS. **Clear confirmed from device** removes only acknowledged records. Logout waits for downloaded roster cleanup and preserves encrypted attendance records for that same account's next verified sign-in. Account switching also clears the previous roster. Cleanup invalidates in-flight preparation across tabs, so a late download cannot restore a signed-out account's roster.

The server grants capture for at most 24 hours after preparation, bounded by the event end, with another 72 hours for synchronization. It rechecks active account/MFA, current scope and permissions, roster membership, freezes, event settings, QR validity/revocation, event windows, and GPS at capture time. Attendance uses the captured timestamp, not the synchronization time. Valid delayed scans can replace automatically generated absences and their absence penalties after event finalization. Changes to event settings, revoked passes, and expired deadlines require review rather than silent acceptance. Existing attendance recording without preparation retains its online workflow.

Local roster, thumbnail, and attendance payloads use AES-GCM with a non-exportable account key stored in IndexedDB. Account/event identifiers, preparation timestamps, record kind, and queue state remain as indexing metadata; names, student IDs, photo references/bytes, capture details, and receipts are encrypted. This protects stored payloads from casual plaintext inspection, not compromised code running on the same origin or someone using an unlocked, signed-in device. Offline timestamps and GPS are evidence supplied by a trusted authorized operator, not cryptographic proof of physical presence. Keep automatic device date/time enabled. Browser storage clearing, device loss, private browsing, or storage eviction can remove unsynced data; a persistence request is made but cannot guarantee retention. Closed-browser background sync is not promised. Export review records when needed and keep storage until synchronization completes.

Known cached names, IDs, section details, and photo references refresh from authorized workspace snapshots (normally every 15 seconds while visible). These updates never add a student or QR hash to an offline grant without backend authorization. Full grants refresh on the bounded 15-minute schedule described above. Each event retains two recent local roster versions; pending submissions keep their original server grant IDs and are not discarded by roster compaction. Capture uses the warmed roster/index without decrypting every roster again, and UI queue updates reuse committed decrypted records. Only pending/rejected submissions are read during sync. Three independent student queues may sync concurrently, while each student's in/out sequence remains ordered across grant versions. New captures added during a sync trigger another drain automatically. Snapshot statistics group attendance, merit, and memberships once rather than scanning all records for every student. The pending list displays its latest 50 captures; export includes all rows.

Profile thumbnails prefetch in the background with two workers. The authenticated `rmc-scanner-photo` function obtains the current profile source through a scoped database RPC; callers cannot supply arbitrary fetch URLs. It checks active account/MFA, grant ownership, event/scope, student status, and source freshness. Google Drive bytes use a fixed thumbnail host; private Supabase Storage photos must belong to the student under a photo/profile path. Responses use `no-store`, supported raster MIME/signature checks, and size/time limits. The browser resizes to at most 256 pixels, encrypts the thumbnail in IndexedDB, and renders it locally online/offline. Online thumbnails refresh after 15 minutes; successfully cached images remain available offline for up to 24 hours within the grant's sync deadline. The photo cache is capped at 50 MiB and the memory image cache at 500 entries; pictures never hold up the attendance capture. Logout/account switching clears photos and roster data, including late-write protection. An inaccessible, missing, unsupported, or not-yet-downloaded photo still requires physical school-ID verification.

For geofenced events, the open scanner watches high-accuracy GPS and reuses a fix only when it is at most 15 seconds old and its reported accuracy is within 100 meters. Otherwise recording requests a new fix. Closing the scanner stops the watch. The capture and backend still validate position freshness, accuracy, and the event boundary; this avoids unnecessary GPS requests without relaxing attendance validation.

The fast-scanner migration `20261008134611_fast_scanner_cache.sql` and `rmc-scanner-photo` Edge Function are deployed to the configured project. Run `npm run test:scanner:integration` for scoped lookup/photograph checks. A desktop simulation with 10,000 students exercised 10,000 indexed ID lookups and 100 encrypted captures with zero lookup RPCs and zero roster decryptions per capture. Measurements are saved in ignored `.fast-scanner-benchmark.local`; fake IndexedDB, camera/GPS/network exclusion, and desktop hardware mean these are not physical-phone throughput guarantees. Browser checks additionally cover encrypted-photo prefetch, offline photo display after cold reload, automatic identity updates, reconnection, and logout cleanup.

The offline attendance migration `20261008124124_offline_attendance_queue.sql` has been applied to the configured Supabase project. Its tables and processing helper are private; three authenticated RPC wrappers authorize preparation, online QR attachment, and synchronization. A daily retention job removes expired roster grants/receipts seven days after their sync deadline while retaining the normal attendance/audit records. Deploy the updated frontend over HTTPS to make the feature available to users.

Current fast-scanner validation: 61 focused tests, eight scanner UI checks (including fresh/stale/inaccurate watched GPS), 18 live scoped lookup/photo checks, 14 Chrome offline attendance checks, nine PWA checks, production build, and typecheck passed. The 57 live offline-backend checks also passed after the new migration. Checks cover preparation from the dashboard without opening a scanner, encrypted storage, a non-exportable AES-GCM 256-bit key, tamper rejection, refresh cadence/rate bounds, MFA and account isolation, cancellation of late downloads across tabs and during encryption, awaited logout cleanup, preservation of pending attendance, scoped backend fallback, concurrent ordered synchronization, and automatic profile updates. The browser run covers actual encrypted-photo display after disconnected cold reload, recording/reconnection, and logout cleanup. The security advisor returned no error-level findings. This does not resolve the existing full-suite failures or launch findings below.

Earlier offline validation included 84 focused security/backend/offline tests and five existing scanner UI regression tests. Live checks covered permissions/MFA, QR revocation, GPS, automatic versus manually reviewed absences, capture-time service duration, fixed merit awards, and an audit that persists after temporary receipt retention. The earlier full run had 352 passing tests and 39 failures across the same six older UI files already identified before this work. Run `npm run test:offline:integration` and `npm run test:offline:browser` with the established local test credentials; the browser check uses production preview at port 4175. Both scripts clean up only their own fixtures. Existing full-suite failures and build-tool advisories described below remain separate unresolved findings.

## PWA and browser security

`npm run build` generates an installable manifest, standard/maskable icons, an Apple touch icon, and a service worker. The worker precaches only this build's app assets. Supabase requests, private documents, QR passes, and external images are never added to its runtime cache. Authentication callback query parameters are not cached. Prepared attendance has a separate encrypted, account-specific IndexedDB queue described below; other private records and writes require a connection. Saved sessions resume loading on reconnect.

Supported browsers offer **Install IARS** when installation is available. On iOS, use Safari's **Share > Add to Home Screen**. App updates prompt for a reload so users can finish their work first. Development does not register a worker; test the production build with `npm run preview -- --host 127.0.0.1 --port 4175` and `npm run test:pwa` (Chrome required; `AUDIT_BASE_URL` and `CHROME_PATH` can override defaults). Production must use HTTPS.

`security.config.mjs` provides a CSP permitting the app's Supabase, Google image service, fonts, and map tiles while blocking inline scripts, plugins, and framing. Camera and GPS remain permitted for this origin. Vite preview applies these headers, and each build emits `dist/_headers` for Netlify/Cloudflare Pages; `netlify.toml` selects the build and output directory. `vercel.json` supplies equivalent Vercel headers for the current backend; if that origin changes, run `npm run configure:hosting` with the production environment and commit the regenerated configuration before deployment. For another host, apply the equivalent HTTP headers and serve `sw.js` without caching and HTML/manifest with revalidation. Do not apply long immutable caching to `sw.js` or HTML. Rebuild when the backend origin changes so CSP matches the environment.

Builds reject secret/service-role keys in frontend environment variables. API fetches and deployed Edge Function responses use `no-store`; Edge Functions also bound request sizes. Sensitive-action RPCs use the session that just verified the password and MFA, sending only confirmation text and a reason to the command API. The `20261008110405_enforce_qr_mfa.sql` migration protects live QR issuance and printed QR access/rotation with the same enrolled-MFA checks as private reads. Accounts without enrolled MFA retain their existing QR behavior.

The Google Drive web app needs its separate [deployment and ownership setup](google-apps-script/README.md). Updating this repository alone does not close the existing hosted script's unauthenticated photo-management vulnerability. Deploy the new frontend first, update the existing script deployment, and assign verified ownership to legacy images to retain old-photo cleanup.

Verification on 2026-10-08: production build, typecheck, nine Chrome PWA/installability/offline/cache/CSP checks, 28 authenticated browser routes at desktop/mobile widths, 67 focused security/backend regression tests, and 61 live backend checks passed. QR PNG export and decoding from a simulated camera frame also passed under the production CSP. The runtime dependency audit reports zero known vulnerabilities. The full unit/UI suite is not green: the original checkout reproduces 40 failures across six older UI test files, and the working tree reproduces 39 of them. The last full run had 306 passes and 41 failures, including two registration mock failures during concurrent signup edits; the updated backend's 15 tests subsequently passed on a focused rerun. Its older integration fixtures were updated for the current enrollment and excuse requirements. The complete dependency audit still reports five high-severity entries from the unpatched `braces` build-tool advisory through Tailwind's dependency chain. These are unresolved findings, not a claim of complete security. Hosted Auth leaked-password protection and intentional public validation/lookup function advisor warnings also require launch review. The QR MFA fix and hardened Edge Functions have been applied to the configured Supabase project; website hosting and the Google Apps Script redeployment remain outstanding. Google enrollment and notification changes were being edited concurrently and need their own coordinated deployment/verification; their implementation was preserved.

## Load distribution and capacity

Operational scenario clarified by the school: approximately **1,500 enrolled students presenting downloaded permanent QR IDs**, with officers using the scanner. Those students do not need an active app session during scanning. Capacity depends on simultaneous scanner/user sessions, scan throughput, roster preparation, and synchronization; enrollment count alone is not the concurrent connection count. This scenario remains to be load-tested. The larger scenario below is the earlier planning stress target.

Target: **5,000 active students plus 100 scanners**. This is a planning target, not a certified limit. Vercel serves the static Vite frontend through its managed CDN; Supabase handles the REST API and stateless Edge Functions. The database is a dedicated Postgres instance with a finite compute/connection budget, not an application-managed horizontally sharded cluster. Browser API calls use HTTPS and do not open a direct database connection per student. Do not raise `max_connections` as a substitute for database capacity.

Current preference: use free resources; do not purchase infrastructure or disable spending limits. The polling optimization is deployed to production. Free Realtime's documented 200 concurrent connections cannot support the existing one-connection-per-user design at the target. Reducing Realtime subscriptions would require a separate behavior change and would not establish database capacity by itself. Full target capacity remains unverified.

The October 9, 2026 inspection found a 60-connection Postgres limit, a 22 MB database, and six profile rows according to database statistics. Historical snapshot statements averaged approximately 64–139 ms of database execution; these are different recorded statement groups, not a controlled role comparison. The dataset is too small to establish semester-scale performance. The bounded baseline (`npm run test:capacity`) made six requests at each concurrency level 1, 3, and 5 for Student, Mayor, and Admin snapshots, plus six static asset requests with concurrency five. All 60 measured requests returned 200. Student and Mayor snapshot p95s were below 1 second, and the Admin maximum sampled p95 was 1.081 seconds. The JS asset was served through Vercel; cache/region headers and response sizes are in `artifacts/load-capacity-baseline.local.json`. Six samples per stage are only a smoke baseline, not statistically reliable tail latency or 5,100-user validation. The harness stops on failures and never records session tokens or response bodies in the report.

Background refreshes use 120–144 seconds for students/public sessions, 45–54 seconds for other staff, and 15–18 seconds for accounts with scanner permission. Requests are scheduled after completion rather than on overlapping fixed intervals. Failures back off exponentially up to 300–360 seconds; a successful refresh or new identity resets the backoff. Hidden/offline tabs skip background reads. Explicit actions, focus/reconnection, and attendance Realtime events still refresh immediately. For 5,000 visible student sessions, the background snapshot component falls from about 333 requests/second at 15 seconds to about 38 requests/second at an average 132 seconds (before request duration). Add scanner reads, writes, initial logins, focus events, and Realtime refreshes separately; this is not total load.

Full acceptance requires a separate staging project with 5,000 synthetic students, realistic academic scopes, events, a semester's attendance/sanction history, and distinct users/scanners. Ramp 100 → 500 → 1,000 → 2,500 → 5,100 sessions, then hold the target for at least 30 minutes, including a 100-scanner burst at roughly one student every three seconds. Validate successful writes, duplicate handling, permissions, offline synchronization, and absence/service jobs. Initial acceptance criteria: p95 under 2 seconds for snapshots and attendance writes, fewer than 1% unexpected failures, no growing queue, and database CPU/connection headroom of at least 20%. Stop escalation when failures exceed 1%, p95 stays above 2 seconds for two minutes, or database CPU/connections exceed 80%. A single account repeatedly queried cannot represent 5,000 distinct users, because RLS, data volume, and per-account counters differ.

Every online signed-in account currently opens an attendance Realtime connection. Provision at least 5,100 concurrent Realtime connections plus headroom before the target test. The documented standard Free and capped Pro limits (200 and 500) are insufficient; Pro without a spend cap and Team document 10,000. Confirm the project's actual configured quota in Supabase, as it was not readable through the available MCP tools. Paid plan changes, removal of spend caps, larger database compute, and staging resources require a reviewed budget; none were purchased or resized in this work. Compute sizes do not automatically upgrade. Start capacity sizing with measured staging CPU/query latency and upgrade only against those measurements. Keep all financial ledger/attendance writes on the primary; replicas are not a write-scaling solution.

Operational references: [Vercel CDN](https://vercel.com/docs/cdn), [Supabase compute](https://supabase.com/docs/guides/platform/compute-and-disk), [Realtime limits](https://supabase.com/docs/guides/realtime/limits), [Supabase observability](https://supabase.com/docs/guides/observability). Deployment source filtering in `.vercelignore` keeps local credentials, reports, logs, backend migrations, and tests out of frontend uploads.

## Rate limiting and bot protection

The rate-limit implementation in `supabase/migrations/20261009144806_abuse_rate_limits.sql` and all four Edge Functions was **deployed through Supabase MCP on October 9, 2026**. The configured production project has the private counter table, retention job, and combined request-budget/freeze hook. Normal account operations, snapshots, public organizations, and login validation passed live checks. A controlled demo-account test returned HTTP 429 with `Retry-After`; its counter was restored afterward. Apply the migration before deploying these functions to another project, otherwise they fail closed with HTTP 503.

The private counters are atomic across server instances, contain hashed IP identifiers, saturate at the limit, and expire through hourly cleanup. Edge limits run before parsing bodies, Google token verification, account operations, or photo downloads. Allowed requests return a zero delay; blocked requests return HTTP 429 with `Retry-After`. Counter-service failures return 503 rather than admitting unlimited work. Existing login/enrollment limits remain active.

| Endpoint | Per-IP limit per minute | Additional verified-account limit per minute |
| --- | --- | --- |
| Password login | 300 | Existing identifier limit: 20 attempts per 15 minutes |
| Enrollment / Google enrollment | 120 | Existing email and account-creation cooldowns |
| Account management | 600 | 30 |
| Scanner photos | 6,000 | 600 |
| Data API requests in writable transactions | 300 anonymous | 600 per signed-in account |

The Data API pre-request hook preserves the existing freeze enforcement. Snapshot and public organization RPCs become VOLATILE so their normal POST calls can persist a counter; GET calls to these two RPCs are no longer supported. GET/HEAD table reads and other read-only RPC transactions cannot persist counters. Failed database transactions roll back their counter changes. Service-role calls bypass this hook because the Edge Functions enforce their separate budgets. This does not cover direct Storage, Auth, Realtime, or Google Apps Script traffic. IP protection assumes the deployed gateway overwrites `x-forwarded-for`; verify that trust boundary before relying on it against spoofed headers. Authenticated budgets always use verified user identities.

Website-wide protection runs at the host, before JavaScript or database work. **Vercel firewall version 1 was activated on October 9, 2026**, with managed Bot Protection challenges and a single fixed-window rule covering all paths: 10,000 requests per minute per IP + JA4 fingerprint, returning 429 above the ceiling. The active configuration was read back with the rule enabled and valid; the homepage returned HTTP 200. This initial ceiling allows for shared school Wi-Fi and asset loading; tune it from observed traffic. Vercel counts limits per region, and many distributed sources can exceed a single-source cap.

`node scripts/vercel-firewall.mjs --prepare` reads the linked Vercel project's current configuration, saves a timestamped local backup, and prepares `artifacts/firewall-proposed.local.json` without publishing. `--publish` publishes and verifies the active settings; Vercel may activate PUT updates immediately. The script preserves existing settings and stops if an existing draft or legacy ruleset format needs review.

In Vercel, open the `rmcssg` project → Firewall → Configure. Enable Bot Protection with Challenge, add the rate-limit rule from `scripts/firewall-rate-limit.json`, review, and publish. Check plan allowances and any displayed usage charges before publishing. Observe legitimate sign-in, enrollment, scanner preparation, and school-network bursts after enabling it. Roll back by disabling the new rule and restoring the prior bot-protection setting. Vercel rules do not protect requests sent directly to the separate Supabase domain.

Validation: run `npm test -- tests/rate-limit-edge.test.ts tests/login-edge.test.ts tests/google-enrollment-edge.test.ts tests/edge-http.test.ts`. Run `tests/rate-limits.sql` after the migration inside a transaction that is rolled back. Verify actual HTTP 429/Retry-After and normal school workflows after deployment; no production flood test has been performed. These controls reduce abuse and do not guarantee that all bots or distributed attacks are blocked.

References: [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api), [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [Vercel Bot Management](https://vercel.com/docs/bot-management).

## Automatic app updates and admin refresh

Every production build emits a unique `version.json` outside the service worker cache. The app checks it before mounting, then every minute while visible, on focus, and on reconnect. Vercel and Netlify configurations prevent caching that endpoint and revalidate HTML. A GitHub push must successfully deploy through your hosting provider before clients can receive its changes.

Administrators can open **Admin Controls → App Updates → Refresh everyone now**. Confirmation requires the current password, the authenticator code when enrolled, and the exact word `initiate`. A temporary Auth session performs verification without replacing the active session. The database independently enforces the active `admin` role, fresh password/MFA claims, session existence, account freezes, and a 30-second cooldown, and writes an audit entry without credentials. Custom roles and OSSA cannot initiate refreshes.

The public release singleton sends a Supabase Realtime update to signed-in and signed-out clients. Clients re-read the authoritative revision before refreshing; polling recovers missed events. Refresh unregisters the old app worker, removes only its Workbox caches, and navigates with a cache-busting query while preserving the current route, authentication storage, and saved offline attendance. Unsaved forms can be lost. Offline and suspended clients refresh after reconnecting or becoming active. Older clients from before this feature need to receive this first deployment through their existing update flow once; code cannot remotely alter a browser that has not loaded it.

Database migration: `supabase/migrations/20261012145703_app_refresh.sql`. Verify permissions and authentication checks with `supabase/tests/app_refresh.sql` (all changes roll back and no real refresh is sent). Run `npx vitest run lib/appUpdates.test.ts lib/supabase.test.ts components/admin/AdminAppUpdates.test.tsx`, then `npm run build` and `node scripts/browser-app-updates-check.mjs` against a preview server at port 4178. The browser check simulates a release signal without refreshing production users.

## Public homepage and legal pages

The homepage uses plain language and links to four public pages: `/#/privacy-policy`, `/#/data-deletion`, `/#/data-privacy-agreement`, and `/#/terms-of-service`. They remain readable without signing in, including for signed-in users. The registration dialog opens the notices in separate tabs to preserve the application in progress. The Organizations shortcut has been removed from the homepage navigation.

Set verified `VITE_SCHOOL_LEGAL_NAME`, `VITE_PRIVACY_EMAIL`, and `VITE_PRIVACY_OFFICE` values before the production build. These values are public. If absent, the pages direct users to school administration rather than inventing an institution or email address. The shared footer and notices read the same settings.

The school must review and approve these notices against its actual practices before launch. In particular, confirm the responsible institution and address, Data Protection Officer contact, lawful grounds for each information use (including education and health records), approved retention schedule, service provider arrangements and overseas processing, safeguards for public photo links and enrollment lookup feedback, consent records where required, and parent/guardian involvement for minors. Publish the verified retention periods or criteria once approved. The app currently has no separate recorded privacy-consent flow or self-service account deletion; the pages describe those limitations and the manual school request process. Account deactivation and an application marked deleted are not represented as complete erasure. Page wording alone cannot establish legal compliance or resolve the hosted security findings documented above.
