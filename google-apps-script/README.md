# Profile image API

## Connected clasp project

The root `.clasp.json` links `google-apps-script/` to the IARS Production Services project owned by `iarsystem26@gmail.com`.

```powershell
clasp --user iarsystem26 show-authorized-user
clasp --user iarsystem26 status
clasp --user iarsystem26 push
```

The source is uploaded, but Google sign-in, the public image service, and Gmail delivery remain on hold. Pushing source does not authorize Gmail/Drive access, install triggers, or activate a web app deployment. Configure the new account's services before setting the frontend Google variables or activating the email hook.

## Automatic Supabase keep-alive

The script includes a database ping every **6 hours** (about four requests per day). It runs on Google's servers even when the website is closed or idle, using the existing public `rmc_nodes` directory and publishable key. It does not read profiles or modify records.

1. Paste the updated `Code.gs` into the existing Apps Script project and save it.
2. Confirm **Project Settings > Script properties** contains `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for this app's project. Use a publishable key or legacy anon key, never a service-role key.
3. As the script owner, select **`installSupabaseKeepAlive`** in the editor's function dropdown and click **Run**. Approve Google's authorization prompt if shown. Setup first verifies a real database request, then creates the time-driven trigger. Running setup again replaces this account's previous ping triggers.
4. Confirm `pingSupabase` appears under **Triggers**. Check **Executions** for failures and `SUPABASE_KEEPALIVE_LAST_SUCCESS` in Script properties for the latest successful ping (UTC). Use one owner account for setup; Apps Script accounts cannot manage each other's triggers.

You can run `pingSupabase` manually to check connectivity, or `removeSupabaseKeepAlive` to stop the schedule. These functions are editor/trigger helpers and are not exposed by `doGet` or `doPost`. Saving and installing the trigger activates the schedule; updating the web app deployment is only needed for changes to the image API.

Supabase considers database activity over a seven-day window; [a few database requests per day typically avoid inactivity pausing](https://supabase.com/docs/guides/platform/free-project-pausing). A scheduled ping is best effort, and paid plans are exempt from inactivity pausing. If the project is already paused, resume it in the Supabase dashboard before installing the trigger. Apps Script [installable triggers](https://developers.google.com/apps-script/guides/triggers/installable) run under the account that creates them and report execution failures to that account.

## Image API deployment

1. Build and deploy the updated frontend before updating the script. Its requests include per-upload management capabilities and, for signed-in users, their access token. The earlier script ignores these extra fields, so this deployment order preserves uploads.
2. Open Google Apps Script and paste `Code.gs` into the project. In **Project Settings > Script properties**, configure `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the same project as the frontend. Do not use a service-role key. The script verifies each signed-in caller with Supabase Auth and checks their account/MFA access through RLS.
3. Set `ANONYMOUS_DAILY_UPLOAD_LIMIT` to the school's expected registration capacity (default 200 per UTC day). Public registration still uploads before signup; its storage consumption is limited. This daily limit is not a CAPTCHA or a per-person abuse limit.
4. Update the existing deployment under **Deploy > Manage deployments > Edit > New version**, retaining **Execute as** the Drive owner and **Who has access** **Anyone**. Deploying a separate URL while leaving the old unauthenticated deployment active leaves the old vulnerability reachable. Archive obsolete deployments.
5. Confirm the retained `/exec` URL matches `VITE_GOOGLE_DRIVE_GAS_URL`, then test registration, profile replacement, organization logo upload, and failed-save cleanup against the deployed script.

The folder must remain shared according to the Drive owner’s policy; the script sets each image to **Anyone with the link / Viewer** and returns a public `thumbnail?id=...&sz=w1600` URL. Drive’s `uc?export=view` endpoint can return 403 when embedded by a browser, so the thumbnail endpoint is used for display.

Endpoints:

- `POST { action: "create", name, studentId, mimeType, dataUrl, managementToken, accessToken? }`
- `POST { action: "update", fileId, name, studentId, mimeType, dataUrl, replacementManagementToken, managementToken?, accessToken? }`
- `POST { action: "delete" | "read", fileId, managementToken?, accessToken? }`
- `POST { action: "list", accessToken }` returns only the caller's owned images.

The frontend generates random management capabilities, retains them in the current tab, and sends them only in POST bodies. The script stores their hashes in the file description. Read/update/delete require that capability or a validated owner session. GET inventory requests, forged sessions, incomplete MFA, and management of another user's files are rejected. Image MIME types, signatures, and sizes are checked on the server.

Existing public image links continue to display. Legacy files lack verified ownership metadata and cannot safely be claimed using browser-supplied names, student IDs, or profile URLs. After verifying each image's owner against school records, the Drive administrator can call `assignLegacyImageOwner(fileId, supabaseUserId)` from the trusted Apps Script editor. This helper is never exposed by the web app. Until ownership is assigned, replacement still saves the new photo, but cleanup of the old file is denied. Anonymous uploads can be managed only while the uploading tab retains its capability.

These changes in the repository do not update an existing Google Apps Script deployment. The deployed service remains vulnerable until its owner completes the deployment steps above. Photos and organization logos remain public by link as required by the existing display flow; private supporting documents use Supabase Storage.
