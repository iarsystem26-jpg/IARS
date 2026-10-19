# Enrollment email confirmation

System Controls → Enrollment is restricted to the built-in `admin` role (System Owner / Super Admin). Delegated roles and custom roles cannot open or save these controls. Opening the editor and saving both require a new password login, an enrolled authenticator when present, and the exact word `initiate`. Database authorization checks the active role, session, signed authentication events within two minutes, and MFA. Direct table writes are denied and changes are audited.

The default is required confirmation using the standard IARS Gmail layout. After submitting an enrollment, applicants see queue instructions, an illustrative email example (or the configured HTTPS image), resend, and a confirmation check. A verified Auth email is required to continue. School admission approval is still separate from email confirmation.

Policies apply to new student accounts:

- **Required:** create an unconfirmed account, send a verification email, and wait for confirmation.
- **Bypass:** create a confirmed account and sign it in without an email link.
- **Google only:** reject password-only enrollment on the server; verify Google's signed email ownership proof before creation. Existing accounts can still sign in using their existing credentials.

The Gmail draft sender display name is **Institution Attendance and Records System**. Inbox avatars use the sending Google account's profile picture and visibility settings; the inline school seal is part of the email body. Updating GitHub does not publish Apps Script source: deploy the updated worker to apply sender-name changes.

## Installation

Apply the enrollment confirmation, GAS delivery, and `20261012163737_email_queue_reliability.sql` migrations through the normal migration process. Keep Supabase Auth email confirmations enabled. No Management API token or service-role key is sent to the browser.

Delivery uses a Supabase Send Email hook, an encrypted request queue, and the existing owner's Apps Script project using `GmailApp` drafts. Supabase still creates and verifies authentication tokens. Enrollment and forgot-password requests use the same queue; an Apps Script trigger polls every minute and sends using `ssgrmctagum.2@gmail.com`. Both layouts retain the logo, action button, website button and legal links. Custom subject/body values are escaped as text.

Enrollment and password reset requests contain no expiring Supabase token while waiting. The worker verifies the stored user ID and email, creates a fresh Supabase link immediately before sending, and refreshes an unsent draft's link on retry. Waiting for the next quota window therefore does not consume the link lifetime. Once sent, Supabase's normal single-use token expiry applies for security. Requests have a seven-day queue retention limit, not an indefinitely valid login token. Reauthentication OTPs are short-lived by design and cannot be renewed without the original authentication context; expired OTP jobs are discarded safely.

Automated installation: run `powershell -NoProfile -File scripts/configure-gas-email.ps1` while logged into the existing Supabase CLI and clasp owner accounts. The script generates and installs secrets in server-only locations, updates Apps Script source, creates a separate email deployment, and deploys the email Edge Functions. It preserves the existing image-upload deployment. It installs the Gmail worker automatically if Google authorization is available. Otherwise it gives the exact Google setup step and leaves the Auth hook unchanged.

If Google requests Gmail permission, sign in as `ssgrmctagum.2@gmail.com`, open the RMC GAS editor and run `installAuthEmailDelivery`. Review and approve Google's permission prompt. Then run `powershell -NoProfile -File scripts/configure-gas-email.ps1 -Activate`. Activation verifies Gmail authorization, installs/checks the trigger, sends one test to the authenticated owner, checks its queue acknowledgement, enables the Supabase Auth hook, verifies the setting, and deploys enrollment delivery. The script retains existing server secrets on reruns. Build/deploy the frontend after activation.

The consumer Apps Script account currently permits about 100 email recipients per rolling day ([Google quotas](https://developers.google.com/apps-script/guides/services/quotas)). This worker uses a 90-recipient safety allowance and stops claiming jobs when it is reached. `GmailApp` does not remove Google quotas; other scripts/account activity can reduce available capacity. Expired verification messages are discarded rather than delivered late.

Queue access is restricted to `service_role`; even Super Admin browser sessions cannot read recipients or links. Payloads use AES-GCM encryption, claims reserve quota with leases, and acknowledgements require a matching lease. Quota accounting reconciles worker reports with distinct delivery acknowledgements so lost/repeated acknowledgements do not double-count usage. Every job reuses one persisted Gmail draft. A sent-job ledger handles lost acknowledgements; a delivery reference lets the worker reconcile a missing draft against Sent mail. An ambiguous outcome is held as `uncertain`, never blindly resent. The tracker exposes these held jobs for review. No distributed service can guarantee both exactly-once delivery and uninterrupted retry after every unknown provider failure. Delivered/expired payloads are cleared and completed metadata is retained for seven days.

System Controls → Enrollment shows the live tracker only after the existing password/MFA/`initiate` verification. Its RPC and Realtime row policy enforce the exact active `admin` role and MFA. It displays the tracked allowance, reservations, queued jobs, worker heartbeat, quota reset, suppressed duplicates/spam, failures and uncertain delivery count. Realtime updates have a 15-second polling fallback. The tracker labels its count as the IARS worker allowance: `GmailApp` has no API for Google's exact remaining sending quota, and unrelated account activity may consume quota.

Spam prevention includes shared atomic per-IP request budgets (10/minute and 60/hour), a two-minute same-action recipient cooldown, three requests per recipient per hour, one pending job per user/action/recipient, stable event IDs, and a 1,000-job backlog cap. Duplicate queued requests are coalesced without generating another token. Unknown, inactive, confirmed and suppressed recipient requests share a generic response. Both confirmation and forgot-password buttons enforce a client cooldown too; the server remains authoritative.

Saved accounts remain recoverable if mail delivery fails. Resend uses the current approved enrollment message configuration and coalesces an existing queued job. A changed/deleted user or an already-confirmed enrollment is cancelled before any fresh token is generated. Login and school approval remain separate from email request acceptance.

Run `supabase/tests/enrollment_confirmation.sql` against a migrated test database. The test transaction rolls back its settings, factors, sessions, role changes, and audit entries.

## Original hosted email configuration

Activated October 13, 2026 and upgraded to GAS version 12: the Send Email hook is enabled at `rmc-send-email`, the separate email deployment uses draft-based delivery, and the owner-authorized every-minute Gmail trigger is installed. A real GmailApp draft test to `ssgrmctagum.2@gmail.com` was acknowledged as sent, and its encrypted queue payload was cleared. Auth's direct email request limit remains 30/hour; app enrollment/recovery use the protected intent endpoint and its IP/recipient budgets instead. Google's daily quota and the worker's 90-recipient safety allowance apply. The original image deployment remains on version 8. Supabase still requires email confirmation; default SMTP is bypassed by the hook.

Verification includes unit/UI tests, the rollback-only `supabase/tests/email_queue_reliability.sql` quota/security test, live fresh recovery link preparation for an existing test fixture (without sending it), generic unknown-account recovery behavior, actual Gmail draft delivery to the owner, and published enrollment/forgot-password browser checks. `scripts/verify-email-reliability.mjs` does not create accounts or change passwords; it rotates only the recovery token of the known test fixture.

Checked October 12, 2026: the project was created September 19, 2026; email authentication and confirmation are enabled. Custom SMTP and the Send Email hook are not configured. The configured email send limit is two per hour. The current confirmation subject is "Confirm your email address" and the template is a simple heading, paragraph, and confirmation link.

Supabase's [June 3, 2026 free-tier change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier) locks Auth template customization for new free projects using the default email provider. This project falls within that restriction. Custom SMTP allows template customization while retaining the Supabase free plan; the external provider has its own pricing and limits. Supabase's [default SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp) also limit delivery to project team addresses, so standard default mail is unsuitable for general student enrollment.

`supabase/templates/confirmation.html` is an optional SMTP template retained for an alternative future SMTP setup. GAS delivery uses `supabase/functions/_shared/authEmail.ts`. Run `node scripts/preview-auth-email.mjs` to generate HTML and screenshot previews at 320, 390, 768, and 1440 pixels. The preview uses an invalid authentication token and cannot confirm a real account.
# Email activity in Admin Controls

System Controls → Email contains the Gmail quota tracker, delivery analytics, separate sent and queue tables, and enrollment confirmation settings. The old `?tab=enrollment` link opens the Email section. Opening the section requires the existing Super Admin password, enrolled MFA, and `initiate` verification; saving settings requires another verification.

Tables use server-side pagination (10/25/50 rows), literal recipient/subject search, type, date, and queue-status filters. Activity refreshes every 15 seconds. Analytics offer 7/30/90-day request totals, completion rate, retries, failures, average send wait, and daily sent volume in Manila time. Gmail acceptance does not establish inbox delivery or email opening.

`rmc_email_history` retains delivery metadata independently of the seven-day temporary queue cleanup. A queue trigger records status transitions; the request and dispatch functions archive a safe rendering of the message copy. Authentication URLs and codes are never copied into preview history. Previews use a sandboxed iframe and selectable phone/tablet widths. Legacy entries whose original payload was already deleted show an unavailable preview; history begins with the queue records present when archiving was introduced.

History has RLS enabled and no browser table grants. Role-checked RPCs require an active built-in Super Admin and an allowed, unfrozen session. The service role alone writes archive contents. `supabase/tests/email_admin_history.sql` verifies pagination, literal search, preview, analytics, history retention, and denial of anonymous/non-superadmin reads without sending mail.
