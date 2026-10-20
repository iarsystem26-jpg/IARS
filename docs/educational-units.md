# Educational units in IARS

IARS is the system identity. An independent institution supplies its name, logo, theme, legal contacts, academic directory, and its own Supabase project. Each project has a separate database, Auth user directory, Storage buckets, Edge Functions, secrets, and authorization policies. Academic directory nodes are organizational scopes inside that institution; adding a node does not provision an isolated database.

## Create an independent institution in the app

As a hub administrator, open **School Hierarchy & Accounts → Independent institutions → Add institution**. Provide the institution name, short name, permanent lowercase ID, registered legal name, address, support/privacy contacts, and initial administrator name/email/username. Upload a PNG/JPG/WebP logo up to 5 MB, or keep IARS artwork. Choose Standard colors, logo suggestions, or custom colors. Appearance defaults to System; Light and Dark are also available. Members retain their own appearance preference. Preview either appearance using the dashboard's actual styles and controls before saving.

The request stays **Setup pending** while the operator worker creates a project, applies the repository migrations, copies the logo into that project's Storage, configures Auth, deploys required Edge Functions, and provisions the initial administrator. It publishes the institution link only after verifying its identity and rejecting a credential from the hub. The private first-access link appears only to active hub administrators; it expires and is redeemable once. New administrators automatically receive a welcome email through the hub Gmail queue with their initial password and workspace link. After a first-access link expires, use the institution's password recovery once its outgoing mail is configured.

The shared portal opens institutions at `/?institution=<id>`. Its entrypoint resolves that ID from the hub's published routes **before importing the Auth client**. Unknown/unavailable/mismatched IDs stop startup; they never open the hub's backend. Authentication, offline stores, and preference keys include the complete selected backend URL and institution ID. These links use the same frontend origin, with physically separate databases. A dedicated hostname/deployment remains available through the build-time configuration below. Browser-origin isolation requires separate hostnames; database isolation does not rely on the frontend's filtering.

Existing academic nodes and accounts are not copied or moved into a new institution. Create its academic directory after opening its own workspace. Existing school nodes remain in the current institution's database. **Edit branding** updates an existing institution project without creating another project; members reload to pick up the changes. Failed setup can be retried without replacing the recorded project.

### Automatic provisioning worker

Use the existing Supabase CLI login, or supply `SUPABASE_ACCESS_TOKEN` to the server process. The Windows wrapper reads the CLI credential in memory and passes it on stdin; the token never enters browser settings, command arguments, source files, or logs. On other hosts, pass a JSON object containing `managementToken` to `node scripts/institution-worker.mjs` through stdin from the host's secret store.

Keep the verified hub settings in the ignored `.env.server.local`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IARS_EXPECTED_PROJECT_REF`, and `IARS_SITE_URL`. `SUPABASE_URL` must match the frontend's hub URL. Configure and activate the Gmail delivery worker with `npm run configure:email` and `powershell -NoProfile -File scripts/configure-gas-email.ps1 -Activate`. The installer recovers the existing Gmail encryption key, or generates one for a new installation, and saves `AUTH_EMAIL_ENCRYPTION_KEY` in the ignored `.env.server.local` for the institution worker. It rejects a conflicting or malformed key instead of rotating existing queue encryption. Restart an already running institution worker after configuration. The institution worker refuses to process creation requests until the key is present. Optional operator settings:

- `IARS_SUPABASE_ORGANIZATION_ID`: defaults to the verified hub's organization. The worker rejects a different organization.
- `IARS_SUPABASE_REGION`: defaults to `ap-southeast-1`.
- `IARS_INSTITUTION_APP_URL`: the origin serving this updated portal, defaults to `IARS_SITE_URL`. Local development may use `http://localhost:3000`. Deploy the updated frontend before using a public origin.
- `IARS_INSTITUTION_SMTP_HOST`, `IARS_INSTITUTION_SMTP_PORT`, `IARS_INSTITUTION_SMTP_USER`, `IARS_INSTITUTION_SMTP_PASSWORD`, `IARS_INSTITUTION_SMTP_FROM`: optional operator-controlled SMTP configuration for newly created projects. Without this, Supabase's default mail limits and recipient restrictions apply. Never expose SMTP credentials as `VITE_` variables.

The full-page setup has four steps: institution details, administrator, logo/theme, and review. Passwords are generated with the existing password policy or entered manually, with a strength meter. The worker verifies and installs `20261020100000_institution_administrator_credentials.sql` automatically before processing requests; `-Install` remains available for an explicit one-time installation check. Creation uses an admin-only RPC that atomically stores the setup and a transient credential in a service-only table. The worker reuses that credential across retries, queues an encrypted welcome email with a stable event key, and deletes the transient credential after successful setup. Passwords are never part of the public branding or readable institution list. Branding edits do not reset passwords or resend account emails.

The welcome message includes the administrator username, initial password, and institution workspace URL. It is delivered through the hub's existing Gmail queue; the directory reports it as queued rather than claiming delivery. Other institution account emails still require the institution's own mail integration. The preview has working dashboard, attendance, events, records, and sample QR views; its QR is explicitly invalid for attendance.

Run `powershell -NoProfile -File scripts/institution-worker.ps1 -Install -Check` to install the hub registry and verify operator access without creating a project. Run `npm run institutions:worker` continuously on a trusted server to process requests automatically. `-Once` processes the current queue and exits; `npm run institutions:check` only validates setup. The worker uses leases, an institution-specific project name, and transactional migration-history markers to resume safely. It preserves failed projects for operator review and never deletes a project automatically. Project creation uses your organization's plan and can incur charges.

When SMTP is configured, the worker installs branded Supabase Auth email templates. Free projects using Supabase's default email provider retain its standard templates, limits, and recipient restrictions. Google OAuth, passkeys, and Apps Script/Gmail remain separate institution-specific integrations. They are not inherited from the hub. In particular, an institution never sends its sessions or uploads to the hub's Apps Script. Configure its own Drive deployment and set the server-owned `driveGasUrl` in its `rmc_institution_branding.config` to enable Drive-backed uploads. Until then, Drive uploads show a setup error. This does not affect institution logo upload, which uses the institution's own Storage.

Validation: `node scripts/verify-institution-access.mjs` checks live registry permissions with the existing test accounts and removes its temporary request without provisioning a project. `node scripts/browser-institution-setup.mjs` checks logo suggestions, preview contrast, mobile layout, and unknown-ID rejection without submitting a project request.

The explicit cloud check, `powershell -NoProfile -File scripts/institution-worker.ps1 -VerifyCloud`, requires the worker and localhost frontend to be running. It creates a temporary billable project, verifies administrator recovery/login, branding, browser session namespacing, and rejection of its token by the hub, then removes the temporary project, registry entries, and source logo. This also queues a welcome email for the test administrator through the hub email worker. During schema replay, the worker tolerates byte-order marks in legacy SQL files and conditionally hardens the optional Supabase `rls_auto_enable` helper; deployed historical migration files remain unchanged.

## Configure a unit

1. Create a separate Supabase project and hosting project with a unique hostname. Do not reuse another institution’s project URL or copy its student data. Apply the repository migrations and deploy its Edge Functions to the new project, using an explicitly verified project reference. Set up the initial administrator using the existing backend provisioning workflow.
2. Copy `.env.example` into a private environment file for that deployment. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and a stable `VITE_EDUCATIONAL_UNIT_ID` slug. Set `VITE_INSTITUTION_NAME` and optionally `VITE_INSTITUTION_SHORT_NAME`. Populate the legal name, privacy contacts, support contacts, and campus map fields with the unit’s verified details.
3. Put the unit’s PNG logo under `public/units/<unit-id>/` and set `VITE_INSTITUTION_LOGO` to its absolute site path. Set the primary and accent colors to six-digit hex values. The default artwork is the supplied IARS identity.
4. To customize the installed app icon, supply PNG files sized 192×192, 512×512, a 512×512 maskable icon with the artwork in the central safe area, and a 180×180 Apple icon. Point `VITE_PWA_ICON_192`, `VITE_PWA_ICON_512`, `VITE_PWA_MASKABLE_ICON`, and `VITE_APPLE_TOUCH_ICON` at those files. The manifest, page title, theme color, and Apple title are generated from the same unit configuration. Missing assets fail the build.
5. Set the unit’s Supabase Auth site URL and redirect allowlist, Google OAuth callback/origins, passkey RP ID/origins, and Apps Script configuration for its own project and hostname. The Google setup script requires an explicit `-ProjectRef`. In `.env.server.local`, set `IARS_EXPECTED_PROJECT_REF`, `IARS_SITE_URL` (HTTPS origin), `IARS_GAS_OWNER_EMAIL`, and `IARS_CLASP_ACCOUNT` (the named account in your clasp credentials). The email installer verifies the project and signed-in owner, then sets the server branding secrets alongside its worker secrets. For manual setup, set Edge Function secrets `IARS_SITE_URL`, `IARS_INSTITUTION_NAME`, and `IARS_INSTITUTION_LOGO` (the same absolute PNG path as the frontend). Use a separate Apps Script project per unit. Email delivery refuses to send without `IARS_SITE_URL`.
6. Run `npm run configure:hosting`, `npm run typecheck`, `npm test`, and `npm run build` with that unit’s environment. Deploy the generated build and security headers to its hostname. Production environment variables must be set before building. Never put a service-role key or database password in a `VITE_` setting.
7. Sign in to that deployment to configure its academic directory and roles. Verify that an account/token from another unit cannot read its profiles, attendance, documents, or administrative data. Verify installation and offline scanning on the unit’s hostname before rollout.

## Drive folders and email provisioning

Each institution uses its own Apps Script project and a dedicated folder below the owner's uploads folder. Provisioning identifies that folder by the Supabase project reference, rather than its editable name. Adding an academic directory node inside the app does not provision another institution or another Drive root.

Set these server-only operator settings in the ignored `.env.server.local` for the unit:

```dotenv
IARS_EXPECTED_PROJECT_REF=your-verified-project-reference
IARS_SITE_URL=https://your-institution.example
IARS_GAS_OWNER_EMAIL=your-google-owner@example.com
IARS_CLASP_ACCOUNT=your-clasp-account-name
IARS_DRIVE_PARENT_FOLDER_ID=your-owned-parent-folder-id
```

Run `npm run configure:drive` when provisioning the educational unit. It creates or reuses its folder and the Profile Photos, Organization Logos, Event Banners, and Reports subfolders, binds the GAS service to its Supabase project, and deploys the service. It updates `VITE_GOOGLE_DRIVE_GAS_URL` locally only after the anonymous endpoint responds correctly. A pending deployment's non-secret details are retained in `supabase/.temp/drive-service.json` if Google owner authorization is needed. Existing files outside the new unit root are not moved or claimed automatically.

Run `npm run configure:email` to provision email secrets and deploy the email functions. As the Google owner, open the connected Apps Script editor, run `installAuthEmailDelivery`, and approve Google's permissions. Then run `npm run configure:drive` again and `powershell -NoProfile -File scripts/configure-gas-email.ps1 -Activate`. Activation verifies Gmail authorization and the delivery trigger before enabling the Supabase Send Email hook. No test message is sent unless `-SendTestEmail` is explicitly supplied.

Deploy the frontend with the verified `VITE_GOOGLE_DRIVE_GAS_URL`. Administrators can open **Operations center → Drive folders** to browse, create, and rename subfolders, and move empty custom folders to trash. Required upload folders cannot be deleted; renaming them preserves routing through their stored category identity. Folder APIs validate the active administrator through Supabase and restrict IDs to the deployment's unit root. The root is managed through provisioning. Folder deletion does not delete school records.

Profile images, logos, and banners remain public by link. Supporting documents remain private in Supabase Storage, and reports continue to download to the user's device; the Reports folder is available for manual archiving. Provisioning does not automatically upload downloaded reports.

The provisioning scripts preserve remote server-only mail configuration. A plain `clasp push` replaces generated configuration with repository templates; use provisioning for service updates, or supply the equivalent Script Properties before deploying templates. Never copy generated mail configuration into source control.

## Existing installations

Synchronize pending offline attendance on the old build before upgrading or changing unit/backend identity. Browser Auth, encrypted offline stores, cross-tab notifications, and theme preferences now use a namespace containing the unit slug and full backend URL. Users sign in again after this change; old local data is not copied into a different unit. Keep the unit ID stable after rollout.

The existing `rmc_*` SQL tables, RPCs, Edge Function names, Storage bucket names, QR protocol tags, and internal events are compatibility identifiers for deployed databases. They are not institution branding or tenant selectors. Renaming them requires a separately coordinated backend/client migration; this change preserves their contracts and existing records. Historical migrations and legacy institution import scripts are not run to brand a new unit. Existing institution names stored as directory data remain owned by that installation and can be edited through its administration tools.

This repository change does not create or bill new Supabase/hosting projects, migrate live student data, or deploy changes to existing installations.
