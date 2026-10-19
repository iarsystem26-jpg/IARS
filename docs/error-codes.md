# Error codes and messages

This reference contains all 802 published codes in the current application error catalog. Generated from the catalog; run `node scripts/document-error-codes.mjs` after editing it.

Each error shows its message, code, and a text label explaining who can resolve it. The outline uses amber for user actions, blue for school staff, red for confirmed developer faults, and grey when the cause needs investigation. Colors also have text labels and work in light and dark appearance.

Unknown failures include a stable REF reference. Send the code, reference, screen, and action to support. A reference groups the same failure; it is not a claim that a support ticket was automatically created. Check the latest records before repeating a write whose result could not be confirmed.

The catalog includes current frontend and backend rules as well as published legacy messages from migration history, so an older deployed backend can still be understood. Arbitrary server messages and private details are not shown. Specific source-defined rules use exact matching; unknown responses are shown honestly without guessing a cause.

| Code | Outline and label | Exact message shown |
| --- | --- | --- |
| `ACCESS-001` | Blue · School staff can help | Your account cannot perform this action. Ask a school administrator to check your permissions and assigned unit. |
| `ACT-001` | Amber · You can resolve this | The action was cancelled. Start it again when you are ready. |
| `ATT-001` | Amber · You can resolve this | This QR code has expired or was replaced. Ask the student to open My QR, or present their latest downloaded ID. |
| `ATT-002` | Amber · You can resolve this | Attendance is already recorded for this session. Check the student’s Records before recording again. |
| `ATT-003` | Amber · You can resolve this | Attendance is closed for this session. Check the activity’s time-in and time-out schedule. |
| `ATT-004` | Amber · You can resolve this | The scanner cannot confirm the event location. Enable location access and move inside the event perimeter. |
| `ATT-005` | Amber · You can resolve this | Enter a reason for recording attendance manually. |
| `ATT-006` | Amber · You can resolve this | Attendance is saved on this device but is not confirmed yet. Reconnect and select Sync pending attendance. Keep the saved records on this device. |
| `ATT-01D33F72` | Amber · You can resolve this | Offline preparation expired or this event is outside its attendance period. Reconnect to prepare again. |
| `ATT-0BB7F261` | Amber · You can resolve this | Connect and download this event’s offline roster first. |
| `ATT-0CC0F32F` | Amber · You can resolve this | Time-out must be within the selected session. |
| `ATT-0CC576D3` | Blue · School staff can help | No eligible student was found in this event scope. |
| `ATT-0ED95081` | Blue · School staff can help | No eligible students are available in your event scope. |
| `ATT-0EDFA1F7` | Amber · You can resolve this | QR preparation limit reached. |
| `ATT-0F3FD4D0` | Amber · You can resolve this | We could not determine your current location. Please try again. |
| `ATT-0FE82175` | Amber · You can resolve this | Sign in and complete MFA before preparing offline attendance. |
| `ATT-100BB5C2` | Amber · You can resolve this | Take attendance on a specific event, not its general event. |
| `ATT-10DB9A8C` | Amber · You can resolve this | Student is not in this roster. |
| `ATT-110E9564` | Amber · You can resolve this | Time-out must follow time-in within the selected session. |
| `ATT-1508467B` | Amber · You can resolve this | Offline encryption setup failed. |
| `ATT-16FE59D2` | Amber · You can resolve this | Only future events without attendance can be edited. |
| `ATT-17011304` | Amber · You can resolve this | Choose an attendance or merit event. |
| `ATT-17196204` | Amber · You can resolve this | Check class attendance windows and volunteer merit hours (greater than 0 and up to 24). |
| `ATT-1A3D3EC7` | Amber · You can resolve this | Attendance windows must not overlap. |
| `ATT-1B4C37A3` | Amber · You can resolve this | The roster was cleared. Sign in again. |
| `ATT-1CD59D8A` | Amber · You can resolve this | Provide a reason for manual attendance entry. |
| `ATT-1D338EBD` | Amber · You can resolve this | This session is unavailable for correction or already has a pending request. Contact OSSA if needed. |
| `ATT-20283696` | Amber · You can resolve this | Select a specific attendance event to download its roster. |
| `ATT-205F180E` | Amber · You can resolve this | Class attendance windows require valid, non-overlapping times and a nonnegative whole-minute late threshold. |
| `ATT-217468A4` | Amber · You can resolve this | Activities with attendance cannot be changed. |
| `ATT-230D7DA6` | Blue · School staff can help | Attendance is frozen. |
| `ATT-26993182` | Amber · You can resolve this | Allow pop-ups to open the evidence. |
| `ATT-27701C9B` | Amber · You can resolve this | The server did not authorize this roster lookup. |
| `ATT-2A1D09E1` | Amber · You can resolve this | QR unavailable. Reopen the preview. |
| `ATT-304BFB87` | Amber · You can resolve this | Submission identifier was reused with different data. |
| `ATT-30E26BD0` | Amber · You can resolve this | Enter an explanation between 10 and 2000 characters. |
| `ATT-35E7FEFA` | Amber · You can resolve this | Invalid student ID. |
| `ATT-3AF02EF8` | Amber · You can resolve this | Verified time-in must be within the session. |
| `ATT-3B3B89C7` | Amber · You can resolve this | Attendance is unavailable for this account or unit. |
| `ATT-3BC6114F` | Amber · You can resolve this | Event settings changed. Refresh the offline roster. |
| `ATT-3C68326A` | Blue · School staff can help | Location permission was denied. Enable it in your browser settings. |
| `ATT-3E51A4BE` | Amber · You can resolve this | This event was rejected. Its offline roster is unavailable. |
| `ATT-4066FFFB` | Amber · You can resolve this | Only wholly affected, future activities without attendance can be changed together. |
| `ATT-4149515F` | Amber · You can resolve this | Offline preparation is unavailable or expired. |
| `ATT-4155298E` | Amber · You can resolve this | Add at least one attendance window. |
| `ATT-42BA4A9C` | Amber · You can resolve this | Camera access requires HTTPS (or localhost). Open the secure site in your browser. |
| `ATT-44B376E9` | Amber · You can resolve this | This event is cancelled. Its offline roster is unavailable. |
| `ATT-48E93A03` | Amber · You can resolve this | The account changed. Sign in again before preparing. |
| `ATT-495FB77C` | Amber · You can resolve this | Event settings changed after preparation. Review this record. |
| `ATT-4B0915C5` | Amber · You can resolve this | A fresh, accurate GPS location is required for offline attendance. |
| `ATT-4C5A02C7` | Amber · You can resolve this | NotAllowedError |
| `ATT-503C1F53` | Amber · You can resolve this | Enter a valid Manila date and time. |
| `ATT-51461181` | Amber · You can resolve this | QR expired. Ask the student to refresh it. |
| `ATT-51DD9D24` | Amber · You can resolve this | Sign in and complete MFA. |
| `ATT-539BE632` | Amber · You can resolve this | Time-in must be within the selected session. |
| `ATT-5A642654` | Amber · You can resolve this | This event needs approval before its offline roster can be downloaded. |
| `ATT-5B0D3ED6` | Amber · You can resolve this | The server did not confirm this attendance record. It remains pending. |
| `ATT-5CFCB5E1` | Amber · You can resolve this | Offline roster cleanup failed. |
| `ATT-5E6918D5` | Amber · You can resolve this | Scanner is outside the event geofence. |
| `ATT-6071D876` | Blue · School staff can help | Offline storage could not be opened. Check browser storage permissions. |
| `ATT-60C4F4A1` | Amber · You can resolve this | Prepare an approved ongoing event or one starting within 24 hours. |
| `ATT-64538F56` | Amber · You can resolve this | Set this device to automatic date and time, then prepare the roster again. |
| `ATT-657A90AF` | Amber · You can resolve this | Printed QR unavailable. |
| `ATT-664B980A` | Amber · You can resolve this | Sign in again before preparing an offline roster. |
| `ATT-66BA46AE` | Amber · You can resolve this | Offline storage is unavailable. Use a supported browser with storage enabled. |
| `ATT-67A2B325` | Blue · School staff can help | This activity is cancelled or unapproved. |
| `ATT-6881A98D` | Amber · You can resolve this | Resolve the pending or approved excuse with OSSA first. |
| `ATT-69B1A560` | Amber · You can resolve this | Attendance is suspended for this student and session. |
| `ATT-6A207300` | Amber · You can resolve this | QR code expired. Ask the student to refresh it. |
| `ATT-6B685F5B` | Amber · You can resolve this | Verified time-out must follow time-in within the session. |
| `ATT-6D27CA7E` | Amber · You can resolve this | This QR is unavailable offline. Use a prepared printed QR or check the exact student ID with a school ID. |
| `ATT-70CB5461` | Amber · You can resolve this | attended |
| `ATT-717752C0` | Amber · You can resolve this | Invalid offline submission. |
| `ATT-71788E02` | Amber · You can resolve this | Attendance windows must be a list. |
| `ATT-74033C60` | Amber · You can resolve this | Photo decoding is unavailable. |
| `ATT-74EE17BD` | Amber · You can resolve this | Camera access failed. Close other apps using the camera or select another camera, then try again. |
| `ATT-7686EB39` | Amber · You can resolve this | Location is not supported by this device. |
| `ATT-777F6DBF` | Amber · You can resolve this | Attendance could not be saved on this device. Free storage space and retry; keep this page open. |
| `ATT-77F046FF` | Amber · You can resolve this | Student is not in the downloaded event roster. |
| `ATT-8363AC66` | Amber · You can resolve this | QR does not match this student. |
| `ATT-838452A4` | Amber · You can resolve this | Close other app tabs to finish offline storage setup. |
| `ATT-8442DEA1` | Amber · You can resolve this | Student is not in the prepared roster. |
| `ATT-89567B34` | Amber · You can resolve this | The decision was saved. Refresh to load the updated attendance and balance. |
| `ATT-8B64F1D9` | Amber · You can resolve this | The account changed. Roster preparation was cancelled. |
| `ATT-8E232C6F` | Amber · You can resolve this | Invalid attendance direction. |
| `ATT-8EEE56EA` | Amber · You can resolve this | Provide decision notes between 5 and 2000 characters. |
| `ATT-8F2CD49D` | Amber · You can resolve this | General events only define a duration. Configure attendance, locations and sanctions on specific events. |
| `ATT-8F682CD9` | Amber · You can resolve this | Events with attendance cannot be edited. |
| `ATT-91ED0F7C` | Amber · You can resolve this | application/pdf |
| `ATT-923D35D7` | Amber · You can resolve this | No attendance window is open. |
| `ATT-92D7E0C1` | Amber · You can resolve this | Enter valid, non-overlapping attendance windows and non-negative late thresholds. |
| `ATT-937691B0` | Amber · You can resolve this | No active student was found with that exact student ID. |
| `ATT-93CBB2F5` | Amber · You can resolve this | Add attendance windows. |
| `ATT-96485ABC` | Amber · You can resolve this | image/png |
| `ATT-9A7E208A` | Amber · You can resolve this | Student assignment changed. Refresh the class roster. |
| `ATT-9DB6FC38` | Amber · You can resolve this | Choose a non-empty PDF, JPG, PNG, or WebP file up to 5 MB. |
| `ATT-9E51E90B` | Amber · You can resolve this | This photo is no longer in the authorized roster. |
| `ATT-A2749196` | Amber · You can resolve this | Enter the time you arrived, or choose “Mark me absent” if the attendance entry is incorrect. |
| `ATT-A36C308F` | Amber · You can resolve this | The session configuration changed. Contact administration. |
| `ATT-A4C4CFD4` | Amber · You can resolve this | Invalid attendance window. |
| `ATT-A6628304` | Amber · You can resolve this | Choose an image for the profile photo. |
| `ATT-A714F4DC` | Amber · You can resolve this | Photo thumbnail is too large. |
| `ATT-AD828B8C` | Blue · School staff can help | Student or activity operations are frozen or inactive. |
| `ATT-B2798E92` | Amber · You can resolve this | Sign in again to verify this student. |
| `ATT-B38AA43B` | Amber · You can resolve this | Missing offline submission fields. |
| `ATT-B582082B` | Amber · You can resolve this | Unsupported or oversized scanner thumbnail. |
| `ATT-B5F1E182` | Amber · You can resolve this | Photo caching was cancelled or device storage is full. |
| `ATT-B7BDC6B2` | Blue · School staff can help | Student is inactive or attendance is frozen. |
| `ATT-B8871799` | Amber · You can resolve this | Scan in before scanning out. |
| `ATT-B933A711` | Amber · You can resolve this | Roster limit reached. Refresh the roster. |
| `ATT-BCBCF6B0` | Amber · You can resolve this | Invalid QR code. |
| `ATT-BCEE43A6` | Amber · You can resolve this | This student or QR is unavailable in the saved roster. Reconnect to verify it. |
| `ATT-BDD36F71` | Amber · You can resolve this | The authorized profile photo is unavailable. |
| `ATT-BEB5A08F` | Blue · School staff can help | Camera permission was denied. Allow camera access in your browser settings, then try again. |
| `ATT-BEC98534` | Amber · You can resolve this | Time-out must follow time-in. |
| `ATT-C120EDE8` | Amber · You can resolve this | QR expired or revoked. Ask the student to refresh it. |
| `ATT-C161EE2F` | Amber · You can resolve this | Attendance changed after submission. Reject this request and ask the student to resubmit against the latest record. |
| `ATT-C484762C` | Amber · You can resolve this | This event needs a valid start and end time before its roster can be downloaded. |
| `ATT-C72FA444` | Amber · You can resolve this | QR was not prepared or was expired at capture. Review this record. |
| `ATT-C77D4B4F` | Amber · You can resolve this | Provide an identity-check reason for manual attendance. |
| `ATT-C94D30DB` | Amber · You can resolve this | Enter a student ID to continue. |
| `ATT-CE66B440` | Amber · You can resolve this | Upload valid supporting evidence to your account first. |
| `ATT-CF526AA6` | Amber · You can resolve this | Student is not in the authorized roster. |
| `ATT-CFECD245` | Amber · You can resolve this | Sign in and complete MFA to sync attendance. |
| `ATT-D176EAE7` | Amber · You can resolve this | Scan-out predates the saved scan-in. Review the device clock or conflicting record. |
| `ATT-D2E3977E` | Amber · You can resolve this | Offline QR preparation limit reached. Download a fresh roster. |
| `ATT-D326B3F0` | Amber · You can resolve this | Your certificate changed. Review the refreshed preview and download again. |
| `ATT-D406AE8D` | Amber · You can resolve this | Printed QR was replaced. Review this record. |
| `ATT-D4F63331` | Amber · You can resolve this | The downloaded roster was removed. Prepare it again. |
| `ATT-D8D76B88` | Amber · You can resolve this | Scanning is only available during the scheduled event. |
| `ATT-DA21DB2B` | Amber · You can resolve this | Too many offline preparations. Use the downloaded roster or try again later. |
| `ATT-DD045988` | Amber · You can resolve this | This offline roster belongs to another account or is unavailable. |
| `ATT-DD4C6D44` | Amber · You can resolve this | Offline roster download opens 24 hours before this activity starts. Check its start date and prepare the roster within that period. |
| `ATT-DDAB9EEA` | Amber · You can resolve this | Scan out of the other service or merit activity before starting this one. |
| `ATT-DE0C7003` | Amber · You can resolve this | Offline queue indexing failed. |
| `ATT-DE395E8A` | Blue · School staff can help | An authorized reviewer in the student scope is required; self-review is unavailable. |
| `ATT-E02FDABF` | Amber · You can resolve this | Each attendance window needs a unique ID, valid times, and a nonnegative late threshold. |
| `ATT-E117E751` | Amber · You can resolve this | Printed QR image unavailable |
| `ATT-E322AB12` | Amber · You can resolve this | Attendance or credits changed after submission. Reject and resubmit against the latest records. |
| `ATT-E333BEF8` | Amber · You can resolve this | Profile photo could not be decoded. |
| `ATT-E3A3B11D` | Amber · You can resolve this | Invalid QR code. Ask the student to open their current QR. |
| `ATT-E616AC31` | Amber · You can resolve this | Provide one QR or exact student ID. |
| `ATT-E83FE42D` | Amber · You can resolve this | Offline capture time or synchronization deadline is invalid. Review this record. |
| `ATT-E859F64C` | Amber · You can resolve this | This event was closed before automatic finalization. Review this record. |
| `ATT-E8BCF190` | Amber · You can resolve this | Invalid offline QR. |
| `ATT-E8DB230E` | Amber · You can resolve this | The account changed or signed out. Roster preparation was cancelled. |
| `ATT-E97E81A9` | Amber · You can resolve this | QR code expired or was replaced. Ask the student to use the current QR. |
| `ATT-EB124367` | Amber · You can resolve this | This event has ended. Its offline roster is unavailable. |
| `ATT-EC142C80` | Amber · You can resolve this | image/webp |
| `ATT-ED8C3C06` | Amber · You can resolve this | Connect to download this event’s offline roster before recording attendance. |
| `ATT-EE58618D` | Blue · School staff can help | Student scope changed. Refresh the queue. |
| `ATT-F1A6B5CA` | Amber · You can resolve this | QR unavailable. |
| `ATT-F1BABA20` | Blue · School staff can help | The encrypted roster could not be saved. Check browser storage permissions. |
| `ATT-F33DECED` | Amber · You can resolve this | Connect to download an authorized event roster first. |
| `ATT-F3DF972E` | Amber · You can resolve this | Verify your account and security code before requesting a QR pass. |
| `ATT-F4B6B318` | Amber · You can resolve this | Canvas unavailable |
| `ATT-F55BA2BE` | Amber · You can resolve this | Attendance was reviewed or excused. Review the queued scan. |
| `ATT-F70EE0EF` | Amber · You can resolve this | This session is unavailable or already has a pending correction. Refresh or contact OSSA. |
| `ATT-F70FE0CB` | Amber · You can resolve this | Events with attendance records cannot be edited. Archive or cancel this event. |
| `ATT-F890CEAD` | Blue · School staff can help | Attendance is frozen for your unit. |
| `ATT-F917A727` | Amber · You can resolve this | Offline preparation is unavailable. |
| `ATT-FA2FB060` | Amber · You can resolve this | Download this event’s roster while online first. |
| `ATT-FAC50789` | Amber · You can resolve this | Enter whole hours and minutes from 0 to less than 60, with a total of at least 0.6 minutes and no more than 24 hours. |
| `ATT-FCF4C69C` | Amber · You can resolve this | This absence was manually reviewed. Review the queued scan. |
| `ATT-FD824FCE` | Amber · You can resolve this | image/jpeg |
| `AUTH-001` | Amber · You can resolve this | Sign-in could not be verified. Check your username or email and password, then sign in again. |
| `AUTH-002` | Amber · You can resolve this | Your current password is incorrect. Enter it again. |
| `AUTH-003` | Amber · You can resolve this | The security code is invalid or expired. Enter the latest authenticator code and check that your device time is automatic. |
| `AUTH-03048C8B` | Amber · You can resolve this | Unable to complete the passkey request. Please try again. |
| `AUTH-06E40C88` | Amber · You can resolve this | Incorrect current password. |
| `AUTH-081634F8` | Amber · You can resolve this | Check your email for a password reset link. |
| `AUTH-0B5FCF18` | Amber · You can resolve this | Enter your password and six-digit authenticator code. |
| `AUTH-0EEA79D4` | Amber · You can resolve this | Sign in first. |
| `AUTH-1A5DCE37` | Amber · You can resolve this | This browser does not support passkeys. Use your password or Google, or try another browser. |
| `AUTH-1CB22923` | Amber · You can resolve this | Sign in again to change your password. |
| `AUTH-20935C2D` | Grey · Support needs to check this | Unable to load sign-in activity. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `AUTH-2109797D` | Amber · You can resolve this | Too many sign-in attempts. Try again in 15 minutes. |
| `AUTH-21210C2F` | Amber · You can resolve this | An authenticated author is required. |
| `AUTH-220A4B56` | Amber · You can resolve this | Verification failed. |
| `AUTH-25E2AC1F` | Amber · You can resolve this | Passkeys require HTTPS or localhost. You can still use your password or Google. |
| `AUTH-26F2510F` | Amber · You can resolve this | Invalid or expired authenticator code. |
| `AUTH-27C1F6B3` | Amber · You can resolve this | Unsupported authentication email request. |
| `AUTH-3348049F` | Blue · School staff can help | Your session has expired. Sign in again before freezing a scope. |
| `AUTH-356FD3E2` | Amber · You can resolve this | Passwords do not match. |
| `AUTH-35FD744B` | Amber · You can resolve this | Unsupported authentication email action. |
| `AUTH-3E0762B6` | Amber · You can resolve this | The passkey request expired. Please try again. |
| `AUTH-3F64E5BB` | Amber · You can resolve this | Passwords must contain between 12 and 1024 characters. |
| `AUTH-3F7F4D90` | Amber · You can resolve this | This passkey could not be verified. Try another passkey, or sign in with your password or Google. |
| `AUTH-43BC9038` | Amber · You can resolve this | Passkeys are unavailable at this address. Open the school’s official app address to use a passkey, or sign in here with your password or Google. |
| `AUTH-45CDBB4D` | Blue · School staff can help | OSSA review permission is required; authors cannot review their own requests. |
| `AUTH-46279B2A` | Amber · You can resolve this | Current password is incorrect. |
| `AUTH-48D42873` | Amber · You can resolve this | Use your profile security settings to change your own password. |
| `AUTH-49D5FDB5` | Amber · You can resolve this | Invalid authentication token. |
| `AUTH-4E4B8417` | Amber · You can resolve this | Set up Google Authenticator in your profile security settings before continuing. |
| `AUTH-4F1250CA` | Amber · You can resolve this | Enter your email address above, then choose Forgot password. |
| `AUTH-51605BD7` | Grey · Support needs to check this | Unable to connect to Supabase. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `AUTH-52506F58` | Grey · Support needs to check this | Unable to queue authentication email. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `AUTH-591FEB03` | Amber · You can resolve this | Please sign in again to load your account. |
| `AUTH-5A10702D` | Amber · You can resolve this | Enter your current password to continue. |
| `AUTH-5C077068` | Grey · Support needs to check this | Unable to update password. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `AUTH-5DAA18E2` | Amber · You can resolve this | Please meet all password requirements before creating the account. |
| `AUTH-5F583B57` | Amber · You can resolve this | Invalid authentication email request. |
| `AUTH-6276D75F` | Amber · You can resolve this | Invalid authentication link. |
| `AUTH-62BBBB50` | Amber · You can resolve this | Enter your Google Authenticator code. |
| `AUTH-63B548AF` | Amber · You can resolve this | Password must be at least 12 characters. |
| `AUTH-65FD8B58` | Amber · You can resolve this | No login session was created. Please try again. |
| `AUTH-6C27C2C9` | Amber · You can resolve this | Unable to sign in. Check your credentials and email verification. |
| `AUTH-6E742391` | Amber · You can resolve this | Unable to check two-factor authentication. Reopen this dialog to retry. |
| `AUTH-6EB1081D` | Amber · You can resolve this | Invalid email recipient. |
| `AUTH-6EB38CD2` | Amber · You can resolve this | Invalid or expired Google Authenticator code. Try the latest code. |
| `AUTH-7201A2F7` | Amber · You can resolve this | Unable to connect. Try again. |
| `AUTH-768F3C2B` | Amber · You can resolve this | Temporary password must contain at least 12 characters. |
| `AUTH-783916D2` | Amber · You can resolve this | Passkey login is currently unavailable. Use your password or Google. |
| `AUTH-792D806A` | Amber · You can resolve this | Verify your current password again before initiating a refresh. |
| `AUTH-7D3C6A71` | Amber · You can resolve this | Unable to queue authentication email. Try again later. |
| `AUTH-82FD2676` | Amber · You can resolve this | No matching passkey was found. Sign in with your password or Google, then add a passkey in My Profile. |
| `AUTH-8B6C734D` | Amber · You can resolve this | Unable to sign in. Check your credentials. |
| `AUTH-8DB7A9CF` | Grey · Support needs to check this | Unable to update two-factor authentication. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `AUTH-911ED2BE` | Blue · School staff can help | An active, unfrozen authenticated account is required. |
| `AUTH-9A47EF90` | Grey · Support needs to check this | Unable to disable two-factor authentication. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `AUTH-ADF2076A` | Amber · You can resolve this | You have reached the passkey limit. Remove an unused passkey before adding another. |
| `AUTH-B444DC21` | Amber · You can resolve this | Passkey request cancelled. Please try again. |
| `AUTH-B67ACC7F` | Amber · You can resolve this | The passkey was not saved. Please try again. |
| `AUTH-BA390253` | Amber · You can resolve this | Sign in again before continuing. |
| `AUTH-BD68CC01` | Amber · You can resolve this | Confirm your email before adding or using a passkey. |
| `AUTH-C217F162` | Amber · You can resolve this | Your change was saved, but the passkey list could not refresh. Reload this page. |
| `AUTH-C803F344` | Blue · School staff can help | Only an administrator can manage this account. |
| `AUTH-CA44887A` | Amber · You can resolve this | Connect to the internet to add or use a passkey. |
| `AUTH-CBFCDE2C` | Grey · Support needs to check this | Failed to sign in. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `AUTH-D57C76DD` | Grey · Support needs to check this | Unable to prepare a fresh authentication link. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `AUTH-DB3615B8` | Amber · You can resolve this | The passkey request was cancelled or could not be completed. Try again, or use your password or Google. |
| `AUTH-E195A271` | Amber · You can resolve this | AUTH_EMAIL_ENCRYPTION_KEY |
| `AUTH-E8646BCA` | Amber · You can resolve this | Invalid or expired Google Authenticator code. |
| `AUTH-E976B782` | Amber · You can resolve this | Sign in and verify your email before uploading documents. |
| `AUTH-EA65436C` | Amber · You can resolve this | An active authenticated account is required. |
| `AUTH-EC4EEF40` | Amber · You can resolve this | Temporary passwords must contain between 12 and 1024 characters. |
| `AUTH-EE62C74B` | Amber · You can resolve this | Sign in to view your calendar. |
| `AUTH-F103EEEA` | Amber · You can resolve this | Enter the Google Authenticator code to continue. |
| `AUTH-F2A4B3EB` | Amber · You can resolve this | Invalid authentication email event. |
| `AUTH-FC9BC666` | Amber · You can resolve this | Reconnect to load your school information and records. |
| `AUTH-FFDE174E` | Blue · School staff can help | Authors cannot review their own requests. |
| `CASE-001` | Blue · School staff can help | The excuse submission deadline has passed. Contact OSSA to ask about exceptional handling. |
| `CASE-002` | Amber · You can resolve this | You already have an excuse request for this activity. Open the existing request to check its status. |
| `CASE-003` | Blue · School staff can help | The balance update could not be confirmed. Refresh Records and ask OSSA to check the balance before making another adjustment. |
| `CLEAR-1D66F5DB` | Blue · School staff can help | Clearance operations are frozen. |
| `CLEAR-297BC735` | Amber · You can resolve this | Enter a title and a clearing period with an end after its start. |
| `CLEAR-504D0873` | Amber · You can resolve this | Verification is unavailable. Please try again when connected. |
| `CLEAR-B02C0ED5` | Amber · You can resolve this | Unknown clearance operation. |
| `CORR-2061CDCA` | Amber · You can resolve this | Invalid fixed merit award. Contact administration. |
| `CORR-4E867AB3` | Amber · You can resolve this | Wait until the activity has ended. |
| `CORR-7D912831` | Amber · You can resolve this | An authorized reviewer is required; self-review is unavailable. |
| `CORR-86B874CE` | Amber · You can resolve this | Unsupported credit correction. |
| `CORR-881B3E4F` | Amber · You can resolve this | Verified participation overlaps another service or merit session. Resolve that record first. |
| `CORR-8BAD0937` | Amber · You can resolve this | The session configuration changed. |
| `CORR-C381A15F` | Amber · You can resolve this | Authorized access is required. |
| `CORR-E2F3CD0C` | Amber · You can resolve this | The session configuration changed. Reject and resubmit. |
| `CORR-E9F368EE` | Amber · You can resolve this | Credit preview changed. Refresh the preview and review the balances before approval. |
| `DATA-001` | Amber · You can resolve this | A matching record already exists. Refresh the list and open the existing record. |
| `DATA-002` | Amber · You can resolve this | This record is unavailable. Refresh the list; it may have been removed or moved outside your access. |
| `DEV-5E3E1281` | Red · Developer fix needed | Could not prepare the verification QR. Send this code to technical support; the developer needs to check the app setup. |
| `DEV-926DA333` | Red · Developer fix needed | Could not prepare the PDF preview. Send this code to technical support; the developer needs to check the app setup. |
| `DEV-C0119CFD` | Red · Developer fix needed | Could not load the school seal. Please retry. Send this code to technical support; the developer needs to check the app setup. |
| `DEV-CAE8A1F5` | Red · Developer fix needed | Could not load the certificate font. Please retry. Send this code to technical support; the developer needs to check the app setup. |
| `DEV-D255C63C` | Red · Developer fix needed | Could not draw the report charts. Send this code to technical support; the developer needs to check the app setup. |
| `DEV-D46B3385` | Red · Developer fix needed | Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local. Send this code to technical support; the developer needs to check the app setup. |
| `DEV-EBBA6654` | Red · Developer fix needed | Could not prepare the certificate. Send this code to technical support; the developer needs to check the app setup. |
| `DEV-FBDB322B` | Red · Developer fix needed | Could not load the transcript logo. Send this code to technical support; the developer needs to check the app setup. |
| `DEV-FF5A3903` | Red · Developer fix needed | Could not load the school logo. Please try again. Send this code to technical support; the developer needs to check the app setup. |
| `DEVICE-001` | Amber · You can resolve this | Camera or location access was blocked. Allow the requested permission in your browser’s site settings. |
| `DEVICE-002` | Amber · You can resolve this | The camera is unavailable or in use. Close other camera apps, reconnect the camera, and select it again. |
| `ENROLL-001` | Blue · School staff can help | The section enrollment key is incorrect. Ask your class manager for the current key. |
| `ENROLL-002` | Amber · You can resolve this | An application already exists for these details. Open Check enrollment progress or sign in to continue it. |
| `ENROLL-08551499` | Amber · You can resolve this | Invalid enrollment key. |
| `ENROLL-0C795CFD` | Amber · You can resolve this | Admissions may only approve student accounts. |
| `ENROLL-10BE77E4` | Amber · You can resolve this | Unable to validate enrollment. Please try again. |
| `ENROLL-12962CF0` | Blue · School staff can help | Custom confirmation email delivery is not configured. Contact your school administrator. |
| `ENROLL-14F8107A` | Amber · You can resolve this | Choose a profile picture before registering. |
| `ENROLL-1F47E12A` | Amber · You can resolve this | This Student ID is already registered. |
| `ENROLL-203A7D75` | Blue · School staff can help | Enrollment is frozen for this unit. |
| `ENROLL-2550A117` | Amber · You can resolve this | Name, email, username, or student ID already exists. |
| `ENROLL-26E694C4` | Amber · You can resolve this | Unable to check enrollment status. |
| `ENROLL-281B46DE` | Amber · You can resolve this | Sign up with Google to continue enrollment. |
| `ENROLL-28DA53A6` | Amber · You can resolve this | This email already has an account. Sign in to track your application. |
| `ENROLL-297E7999` | Amber · You can resolve this | Too many attempts. Try again in 15 minutes. |
| `ENROLL-2BE4545D` | Amber · You can resolve this | Invalid admission decision. |
| `ENROLL-2DD3523F` | Amber · You can resolve this | Password must contain between 12 and 1024 characters. |
| `ENROLL-31A7E879` | Amber · You can resolve this | Invalid enrollment step. |
| `ENROLL-38341ED8` | Amber · You can resolve this | Confirmation email delivery failed. |
| `ENROLL-38A1002D` | Amber · You can resolve this | You already have an account. Open your application status or sign out to register another student. |
| `ENROLL-51BC3855` | Amber · You can resolve this | Enrollment requires a verified Google account. Choose Sign up with Google. |
| `ENROLL-531D2AF4` | Amber · You can resolve this | Confirm your email address using the link in your inbox first. |
| `ENROLL-565FBC9F` | Amber · You can resolve this | Invalid clarification field. |
| `ENROLL-5845226E` | Amber · You can resolve this | Unable to sign in with Google. Check the Google provider setup or contact your school officer. |
| `ENROLL-5BC2D8B2` | Amber · You can resolve this | This account is inactive. Contact your school officer. |
| `ENROLL-60D48208` | Amber · You can resolve this | Invalid enrollment reservation. |
| `ENROLL-653DA21B` | Grey · Support needs to check this | Unable to upload document. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `ENROLL-67B18005` | Amber · You can resolve this | Verify your current password again. |
| `ENROLL-68321DE7` | Amber · You can resolve this | Choose an enrolled student with an assigned class. |
| `ENROLL-6A431FDD` | Grey · Support needs to check this | Unable to resubmit the application. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `ENROLL-6CB36C87` | Grey · Support needs to check this | Unable to complete enrollment. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `ENROLL-729014AB` | Amber · You can resolve this | Upload the document first. |
| `ENROLL-7C8CDE18` | Amber · You can resolve this | This application cannot be resubmitted. |
| `ENROLL-7FC7F799` | Amber · You can resolve this | Complete enrollment before creating an account. Use the enrollment form. |
| `ENROLL-88AB8162` | Amber · You can resolve this | Section Enrollment Security Key is required for enrollment into this section. |
| `ENROLL-88EA6C70` | Amber · You can resolve this | Google email verification failed. Choose your account again. |
| `ENROLL-896D672D` | Amber · You can resolve this | Sign in to continue enrollment. |
| `ENROLL-8C39BC35` | Amber · You can resolve this | Choose an enrolled student. |
| `ENROLL-8F470097` | Amber · You can resolve this | Provide a reason for this decision. |
| `ENROLL-91368A07` | Amber · You can resolve this | Enter the enrollment key for the selected section. |
| `ENROLL-91A78EB3` | Amber · You can resolve this | Invalid enrollment action. |
| `ENROLL-92E0C0F2` | Amber · You can resolve this | Choose your Google account again. |
| `ENROLL-A0E21AD5` | Amber · You can resolve this | Enrollment confirmation settings are unavailable. Try again later. |
| `ENROLL-AAFEA598` | Amber · You can resolve this | Only pending admissions can be updated. |
| `ENROLL-AC5B8921` | Amber · You can resolve this | Choose at least one item that the enrollee must clarify. |
| `ENROLL-C83D1E9E` | Amber · You can resolve this | Account creation is temporarily limited. Wait for the displayed cooldown to end before creating another account. |
| `ENROLL-CA85F95F` | Amber · You can resolve this | This passkey is already registered to your account. |
| `ENROLL-CAA13088` | Amber · You can resolve this | Rate limit reached. |
| `ENROLL-CC16A5E6` | Amber · You can resolve this | Invalid section enrollment key. |
| `ENROLL-CD06F188` | Amber · You can resolve this | Choose a Google account. |
| `ENROLL-D2DE12E2` | Amber · You can resolve this | Google sign-in has not been configured by the school. |
| `ENROLL-D483C6FB` | Amber · You can resolve this | Enter your enrollment email address. |
| `ENROLL-D58A9E0A` | Amber · You can resolve this | Unable to check email confirmation. |
| `ENROLL-D62B07B7` | Amber · You can resolve this | An enrolled authenticator is required to verify this action. |
| `ENROLL-D85DC4B0` | Blue · School staff can help | Enrollment is frozen. |
| `ENROLL-D864F3D7` | Amber · You can resolve this | Use an enrollment key of at least 8 characters. |
| `ENROLL-DA076DBF` | Amber · You can resolve this | Only an active Super Admin can change enrollment confirmation. |
| `ENROLL-DA6554C2` | Amber · You can resolve this | Complete the enrollment form. |
| `ENROLL-DFFB247B` | Amber · You can resolve this | Unable to save your approval notice. Reconnect and try again. |
| `ENROLL-E432977A` | Blue · School staff can help | You are not authorized to review admissions. |
| `ENROLL-E753F257` | Amber · You can resolve this | Choose at least one field that needs clarification. |
| `ENROLL-ECBE45F0` | Grey · Support needs to check this | Unable to update enrollment confirmation. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `ENROLL-F0F5B56C` | Amber · You can resolve this | Name is required. |
| `ENROLL-F2F1CB1E` | Amber · You can resolve this | Invalid document. |
| `ENROLL-F41B5D1A` | Amber · You can resolve this | The enrollment key could not be cleared. |
| `ENROLL-FB69B76B` | Amber · You can resolve this | Unable to load the agreement. Please retry before continuing. |
| `ENROLL-FC91D1EC` | Amber · You can resolve this | Enrollment settings could not be loaded. Reload this page before signing up. |
| `ENROLL-FD121586` | Amber · You can resolve this | Complete the admission form to create an account. |
| `EVENT-001` | Blue · School staff can help | This activity needs OSSA approval before attendance can open. Ask an eligible OSSA reviewer to check it. |
| `EVENT-002` | Blue · School staff can help | You cannot approve your own activity. Ask another eligible OSSA reviewer to review it. |
| `EVENT-003` | Blue · School staff can help | This activity was cancelled. It cannot accept attendance or excuse requests. |
| `EVENT-0132D894` | Amber · You can resolve this | Enter a title and instructions before continuing. |
| `EVENT-070AF0EE` | Amber · You can resolve this | An event may span at most one year. |
| `EVENT-0A5A9720` | Amber · You can resolve this | This event was not found or you do not have access to it. |
| `EVENT-0C9041DD` | Amber · You can resolve this | Invalid ceremony settings. |
| `EVENT-0DF8903B` | Amber · You can resolve this | Date-specific exemptions must be an object. |
| `EVENT-0E4C3F4B` | Blue · School staff can help | Student is outside the ceremony scope. |
| `EVENT-0ED4BA78` | Amber · You can resolve this | Explain why this request was rejected. |
| `EVENT-119EBD43` | Amber · You can resolve this | Select people only within your assigned unit. |
| `EVENT-15063D65` | Amber · You can resolve this | Enter valid coordinates and a radius between 10 and 5000 meters. |
| `EVENT-160987C1` | Amber · You can resolve this | Class windows must fit inside the ceremony schedule. |
| `EVENT-1623ADEF` | Amber · You can resolve this | Each time out must be later than its time in. |
| `EVENT-16348542` | Amber · You can resolve this | Each flag ceremony must take place on one date. |
| `EVENT-165ECC97` | Amber · You can resolve this | Reschedule the activity before approving it. |
| `EVENT-183E5284` | Amber · You can resolve this | Invalid ceremony date. |
| `EVENT-18F83B31` | Blue · School staff can help | An assigned school unit is required to create events. Contact your administrator. |
| `EVENT-19DC1C11` | Amber · You can resolve this | Choose the event management unit. |
| `EVENT-1A5FAC74` | Amber · You can resolve this | Enter a title and a valid event schedule. |
| `EVENT-223E842A` | Amber · You can resolve this | Choose a start and end date. The end date must be on or after the start date. |
| `EVENT-2B51E8C3` | Amber · You can resolve this | Enter a title and a valid event schedule of at most one year. |
| `EVENT-2BD2B660` | Amber · You can resolve this | Only flag ceremonies can use this scheduler. |
| `EVENT-2CB450E0` | Amber · You can resolve this | Invalid recipient group. |
| `EVENT-2F83F4BF` | Blue · School staff can help | Class overrides must be within your assigned ceremony scope. |
| `EVENT-3981F327` | Amber · You can resolve this | Choose allowed ceremony dates, valid class windows, and positive volunteer merit hours (up to 24). |
| `EVENT-39D8D9D0` | Blue · School staff can help | Events are frozen for your scope. |
| `EVENT-3C634E4A` | Amber · You can resolve this | Ceremony settings require a flag ceremony. |
| `EVENT-3D086F66` | Amber · You can resolve this | Select an event assigned to you. |
| `EVENT-3EEA4606` | Blue · School staff can help | This event is outside your scope. |
| `EVENT-408948FB` | Amber · You can resolve this | This activity is closed. Reschedule before review. |
| `EVENT-4142520F` | Amber · You can resolve this | Specific event dates must fit within the general event duration. |
| `EVENT-41C0D2DF` | Amber · You can resolve this | Choose a valid month. |
| `EVENT-4349CC7D` | Amber · You can resolve this | Wait for the event to end or cancel it. |
| `EVENT-45706C73` | Amber · You can resolve this | Choose a future start and a valid end. |
| `EVENT-492F54C0` | Amber · You can resolve this | Recipients must be within the selected school unit. |
| `EVENT-4B9CBAB7` | Amber · You can resolve this | Invalid weekly class schedule. |
| `EVENT-4CD630B9` | Amber · You can resolve this | Select recipients only within your assigned unit. |
| `EVENT-4DB71755` | Amber · You can resolve this | Select at least one recipient group. |
| `EVENT-503D1A3B` | Amber · You can resolve this | Choose at least one recipient within your assigned school unit. |
| `EVENT-51FE64FC` | Amber · You can resolve this | The general event group exceeds 500 activities. |
| `EVENT-549A76B6` | Amber · You can resolve this | An activity was selected more than once. |
| `EVENT-57E9B821` | Amber · You can resolve this | The rescheduling was saved. Refresh to load updated schedules. |
| `EVENT-59AB7631` | Grey · Support needs to check this | Unable to submit excuse. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `EVENT-5B4D59BE` | Amber · You can resolve this | Click Add recipient to include your selected unit before continuing. |
| `EVENT-5D9D1F80` | Amber · You can resolve this | Choose a new date after the suspension, within 366 days of the original start. |
| `EVENT-5DB0E45F` | Amber · You can resolve this | Each class day needs a valid start time and a later end time. |
| `EVENT-5E911DB9` | Amber · You can resolve this | Specific events must belong to the same school unit and organization as their general event. |
| `EVENT-618B9E79` | Amber · You can resolve this | Review ceremony exemptions and class windows individually before rescheduling. |
| `EVENT-618EC3F1` | Blue · School staff can help | School unit outside your assigned scope. |
| `EVENT-627E01BF` | Amber · You can resolve this | Suspension-only does not change event schedules. |
| `EVENT-63FF8812` | Amber · You can resolve this | You can manage events only within your current assigned unit. |
| `EVENT-65BB47A8` | Amber · You can resolve this | Choose ceremony dates. |
| `EVENT-65D1251D` | Amber · You can resolve this | Invalid event activity type. |
| `EVENT-6A4450B3` | Amber · You can resolve this | Check the activity hours and weekly occurrences before continuing. |
| `EVENT-6AEB4F71` | Amber · You can resolve this | Choose an activity and its new date. |
| `EVENT-702D7591` | Blue · School staff can help | Keep all specific events within the general event duration and scope. |
| `EVENT-71B1F2AA` | Amber · You can resolve this | Schedules changed. Refresh the preview before applying. |
| `EVENT-7AB803B2` | Amber · You can resolve this | Only pending requests can be approved or rejected. |
| `EVENT-8164C292` | Amber · You can resolve this | Cannot add specific events to an ended or cancelled general event. |
| `EVENT-84011A07` | Amber · You can resolve this | End date must be on or after the start date and within the selected general event. |
| `EVENT-88D91F15` | Amber · You can resolve this | Choose 1 to 62 unique ceremony dates. |
| `EVENT-8B19763C` | Amber · You can resolve this | Archive events that have records. |
| `EVENT-8D6CEA1F` | Amber · You can resolve this | OSSA review access is required. |
| `EVENT-8EF515B0` | Amber · You can resolve this | A weekly schedule object is required. |
| `EVENT-91548C90` | Amber · You can resolve this | Only upcoming schedules can be updated. |
| `EVENT-93ABD601` | Amber · You can resolve this | Sanction values must be zero or greater. |
| `EVENT-93FB109D` | Amber · You can resolve this | Sanctions require a nonnegative value and hours or minutes. |
| `EVENT-94F69A0C` | Blue · School staff can help | Choose a school unit within your assigned scope. |
| `EVENT-956CD621` | Amber · You can resolve this | Schedules changed. Refresh the new schedule preview before applying. |
| `EVENT-97072502` | Blue · School staff can help | Permission required: calendar.manage_closures |
| `EVENT-99FB4698` | Amber · You can resolve this | A specific activity must move with its selected general event. Choose the general event date only. |
| `EVENT-9C3C63B2` | Amber · You can resolve this | Choose valid destination dates and review the schedule preview. |
| `EVENT-9D91F083` | Amber · You can resolve this | Clear all sanctions during the scheduled clearing period to qualify. |
| `EVENT-9D945B18` | Amber · You can resolve this | An event cannot contain itself. |
| `EVENT-9F1E67E6` | Amber · You can resolve this | Enter a whole number from 0 to 30 excuse submission days. |
| `EVENT-A7E46EDD` | Amber · You can resolve this | Choose 1 to 100 recipient groups. |
| `EVENT-AA2350DF` | Amber · You can resolve this | Volunteer merit must be between 0.01 and 24 hours. |
| `EVENT-AAD50EC5` | Blue · School staff can help | Exempt students must be within your assigned ceremony scope. |
| `EVENT-AB219E04` | Blue · School staff can help | Schedule unavailable or outside your scope. |
| `EVENT-ABE65D64` | Amber · You can resolve this | Remove recipients outside your assigned unit before saving. |
| `EVENT-ACBDB420` | Amber · You can resolve this | Remove preview-only dates before saving. Past dates cannot be scheduled. |
| `EVENT-AD680D6C` | Amber · You can resolve this | Choose 1 to 62 allowed ceremony dates. Remove preview-only dates and follow the selected ceremony weekday. |
| `EVENT-B21F6BA5` | Amber · You can resolve this | Create ceremonies only in the current month or next 7 days, before their start time. |
| `EVENT-B2E92671` | Amber · You can resolve this | The form is not ready to save. Go back to check the configuration and your assigned unit. |
| `EVENT-B72073E7` | Blue · School staff can help | Schedule management permission required. |
| `EVENT-BA901CD2` | Amber · You can resolve this | Invalid class day. |
| `EVENT-BB95EC38` | Amber · You can resolve this | Choose a JPG, PNG, or WebP banner of 5 MB or smaller. |
| `EVENT-BC41F513` | Amber · You can resolve this | This event is outside your assigned unit. |
| `EVENT-C1447556` | Grey · Support needs to check this | Unable to load your calendar. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `EVENT-C4A71EB9` | Amber · You can resolve this | Choose a valid schedule range of up to one year. |
| `EVENT-C4F23A12` | Amber · You can resolve this | Invalid event status. |
| `EVENT-C6CB9AD2` | Amber · You can resolve this | Enter a whole number from 0 to 30 days. |
| `EVENT-C88C5152` | Amber · You can resolve this | This request is no longer pending. |
| `EVENT-CA750B82` | Amber · You can resolve this | Choose an active class section or block. |
| `EVENT-CAE24311` | Amber · You can resolve this | Geofencing must be enabled or disabled. |
| `EVENT-CBB3119D` | Amber · You can resolve this | Student is not a recipient or eligible volunteer of this event. |
| `EVENT-D43E6C4C` | Amber · You can resolve this | Standard schedule must be enabled or disabled. |
| `EVENT-D4708B87` | Amber · You can resolve this | Class end time must be later than its valid start time. |
| `EVENT-D50D8527` | Amber · You can resolve this | Logo unavailable |
| `EVENT-D7825AE3` | Blue · School staff can help | Permission required: calendar.view |
| `EVENT-D7B89F93` | Blue · School staff can help | School-wide suspension permission required. |
| `EVENT-D8E8EF4B` | Amber · You can resolve this | Class windows must be a nonempty list. |
| `EVENT-DE0BFF1C` | Amber · You can resolve this | Completed schedules cannot be cancelled. |
| `EVENT-DE4B721B` | Amber · You can resolve this | The event type and general event cannot be changed after creation. |
| `EVENT-DFD4C6D7` | Amber · You can resolve this | Select an available general event. |
| `EVENT-E3614659` | Amber · You can resolve this | Choose recipients. |
| `EVENT-E3CE2975` | Blue · School staff can help | This academic unit is outside your assigned scope. |
| `EVENT-E6BBF968` | Blue · School staff can help | Only OSAS and admins can change class schedules within their assigned scope. |
| `EVENT-EA3D2A6B` | Grey · Support needs to check this | Unable to save decision. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `EVENT-EAF7B779` | Amber · You can resolve this | Exemptions must reference a selected ceremony date and a list of students. |
| `EVENT-EC671FFE` | Blue · School staff can help | Keep all specific events within the general event duration and scope. Cancel upcoming specific events before cancelling the general event. |
| `EVENT-F3C488A8` | Amber · You can resolve this | Student is not a recipient of this event. |
| `EVENT-F7A7A0C8` | Amber · You can resolve this | Choose up to 500 activities and destination dates. |
| `EVENT-F9B37F11` | Amber · You can resolve this | The suspension was saved. Refresh to load updated schedules. |
| `EVENT-FAE20EEE` | Amber · You can resolve this | Refresh the affected activity list before selecting dates. |
| `EVENT-FEBCE4AB` | Amber · You can resolve this | Choose a calendar range of up to 63 days. |
| `FILE-001` | Amber · You can resolve this | The file could not be uploaded. Check the allowed file type and size shown beside the upload field, then choose the file again. |
| `FILE-002` | Amber · You can resolve this | The photo could not be read. Save it on your device and choose a JPG, PNG, or WebP photo up to 5 MB. |
| `FILE-003` | Amber · You can resolve this | The file is empty or could not be read. Save a complete copy on your device and choose it again. |
| `FILE-0821520B` | Amber · You can resolve this | Google Drive image service is unavailable. Redeploy the Apps Script web app and update VITE_GOOGLE_DRIVE_GAS_URL. |
| `FILE-0B69D02D` | Amber · You can resolve this | Allow pop-ups to view this document. |
| `FILE-0BD3C730` | Amber · You can resolve this | This file is not a readable image. Choose another photo. |
| `FILE-0FB98D49` | Amber · You can resolve this | Google Drive returned an invalid file ID. |
| `FILE-132591E5` | Amber · You can resolve this | Profile fields must be at most 200 characters. |
| `FILE-15AE8254` | Amber · You can resolve this | Upload a valid profile photo first. |
| `FILE-1DBB3A86` | Grey · Support needs to check this | Could not delete the photo from Drive. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `FILE-2023D765` | Amber · You can resolve this | Use a valid public Google Drive profile photo URL. |
| `FILE-26F10573` | Amber · You can resolve this | Google Drive returned no public image URL. |
| `FILE-2A574188` | Blue · School staff can help | Profile updates are frozen. |
| `FILE-2F14BAE8` | Amber · You can resolve this | Attach an excuse letter or supporting document uploaded to your account. |
| `FILE-3186BAF6` | Amber · You can resolve this | Choose a JPG, PNG, WebP, or PDF file up to 5 MB. |
| `FILE-3E8DFC17` | Amber · You can resolve this | No people were found. Add at least one completed row and upload the file again. |
| `FILE-42685D99` | Amber · You can resolve this | Could not read this file. Save it to your device and choose it again. |
| `FILE-444A2BBE` | Amber · You can resolve this | Add at least one person to the CSV file. |
| `FILE-44BA0E16` | Amber · You can resolve this | Image reading was cancelled. Choose the photo again. |
| `FILE-49BEDFE0` | Amber · You can resolve this | This image is empty. Choose another photo. |
| `FILE-5417FF63` | Amber · You can resolve this | Card image could not be rendered |
| `FILE-5FDC5CF8` | Amber · You can resolve this | Allow pop-ups to open the supporting document. |
| `FILE-66BB4335` | Amber · You can resolve this | Choose a readable image. |
| `FILE-69B51BE1` | Grey · Support needs to check this | Unable to save your profile photo. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `FILE-74F97963` | Amber · You can resolve this | The supporting document could not be found. Upload it again. |
| `FILE-811F9E6D` | Amber · You can resolve this | This file contains duplicate entries. Remove duplicates and import the corrected file. |
| `FILE-86B0A972` | Amber · You can resolve this | The decision was saved and the student notified. Refresh to load the latest profile. |
| `FILE-86E2E5A8` | Amber · You can resolve this | Unable to open the supporting document. Please try again. |
| `FILE-8858F8AD` | Grey · Support needs to check this | Unable to select this image. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `FILE-8E61263C` | Amber · You can resolve this | Attach an excuse letter or supporting document. |
| `FILE-91DA4E06` | Amber · You can resolve this | Profile images must be 5 MB or smaller. |
| `FILE-97792347` | Amber · You can resolve this | Unable to read this image. Save the photo to your phone, then choose it again. |
| `FILE-A560198D` | Amber · You can resolve this | Invalid document URL. |
| `FILE-A7A0AD13` | Amber · You can resolve this | Could not clean up the unsaved upload. An extra copy may remain in Drive. |
| `FILE-B443599E` | Blue · School staff can help | Profile requests are temporarily frozen. |
| `FILE-B59A7793` | Grey · Support needs to check this | Unable to read the photo. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `FILE-B6473B98` | Amber · You can resolve this | Card image took too long to load |
| `FILE-B96C8DD1` | Amber · You can resolve this | The photo upload service rejected the request. Send this code to technical support so they can check the upload service. |
| `FILE-C4D25854` | Amber · You can resolve this | Choose a file of the selected value MB or smaller. |
| `FILE-C89414CC` | Amber · You can resolve this | Your new photo is saved, but the old copy could not be removed from Drive. |
| `FILE-CB67197C` | Grey · Support needs to check this | Unable to preview this image. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `FILE-CFC3DF69` | Amber · You can resolve this | Choose a JPG, PNG, or WebP image. |
| `FILE-D9F987F2` | Amber · You can resolve this | [ProfileAvatar] Unable to display the image. Using the placeholder. |
| `FILE-DF1F19D7` | Amber · You can resolve this | Unable to read this banner. Choose another image. |
| `FILE-E67156A1` | Amber · You can resolve this | The CSV file could not be read. |
| `FILE-E95ACFEE` | Amber · You can resolve this | Unsupported profile field. |
| `FILE-EA485C04` | Amber · You can resolve this | This file is empty. Choose another file. |
| `FILE-F1B5E970` | Amber · You can resolve this | Unable to open this document. Please try again. |
| `FILE-F66DA4DF` | Amber · You can resolve this | Document unavailable. |
| `FILE-F779B1B5` | Amber · You can resolve this | The CSV file is empty. |
| `FILE-FE019101` | Amber · You can resolve this | The image could not be read completely. Choose the photo again. |
| `FREEZE-001` | Blue · School staff can help | School administration has paused access. Contact your school officer about the freeze. |
| `INPUT-001` | Grey · Support needs to check this | The server rejected the submitted details without naming the field. Keep your entries and report this code to support. |
| `LIMIT-001` | Amber · You can resolve this | Too many requests were sent. Wait a few minutes before trying again. |
| `NET-001` | Amber · You can resolve this | The connection was interrupted. Reconnect, then check whether your change was saved before submitting again. |
| `NET-002` | Amber · You can resolve this | The server did not respond in time. Check whether your change was saved before retrying. |
| `ORG-001` | Amber · You can resolve this | Joining could not be confirmed. Check the organization’s joining policy and your membership status before applying again. |
| `ORG-002` | Blue · School staff can help | The transfer could not be confirmed. Refresh the roster and select an available destination class. |
| `ORG-0D3599A0` | Amber · You can resolve this | This sanction has already been reviewed. |
| `ORG-0E7DA647` | Amber · You can resolve this | Choose a future event schedule. |
| `ORG-10B9299C` | Amber · You can resolve this | The organization unit cannot be moved. Create a new organization for another unit. |
| `ORG-1E0E5A63` | Amber · You can resolve this | Organization events must stay within their unit. |
| `ORG-3CF1A49F` | Amber · You can resolve this | The student is no longer an eligible member. |
| `ORG-40CA8B5B` | Amber · You can resolve this | Sanctions can only be requested for current organization members. |
| `ORG-543C1AE3` | Amber · You can resolve this | This organization is not open for self joining. |
| `ORG-5D97F53E` | Amber · You can resolve this | The organization join key is incorrect. |
| `ORG-5FDAD379` | Amber · You can resolve this | Add students only from your own assigned unit. |
| `ORG-63BF223A` | Amber · You can resolve this | This application is no longer pending. |
| `ORG-6528C611` | Amber · You can resolve this | Reschedule the event before approving it. |
| `ORG-6B8DE218` | Amber · You can resolve this | Event not found. |
| `ORG-756F5ACD` | Grey · Support needs to check this | Unable to save this change. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `ORG-79AC9005` | Amber · You can resolve this | Select your assigned unit. |
| `ORG-7E4F6212` | Amber · You can resolve this | Upload the organization logo through the image service. |
| `ORG-822C051D` | Blue · School staff can help | OSAS approval is required. |
| `ORG-87DE3C0E` | Amber · You can resolve this | Set a join key before requiring it. |
| `ORG-957A07ED` | Amber · You can resolve this | This event is no longer pending. |
| `ORG-A56616E3` | Amber · You can resolve this | Use a join key with 6 to 128 characters. |
| `ORG-B36E1D34` | Amber · You can resolve this | Select an active student within the organization unit. |
| `ORG-B3A0E736` | Amber · You can resolve this | Enter an organization name. |
| `ORG-B82E60AC` | Amber · You can resolve this | Heads must be active accounts within the organization unit. |
| `ORG-B9905FA8` | Amber · You can resolve this | Join keys must contain 6 to 128 characters. |
| `ORG-C43B6872` | Amber · You can resolve this | You have already joined or submitted an application. |
| `ORG-E1563871` | Amber · You can resolve this | Choose an organization logo. |
| `ORG-E6BF65FE` | Amber · You can resolve this | Unsupported organization operation. |
| `ORG-EE4E3ACB` | Blue · School staff can help | Operations are frozen for this school or unit. |
| `ORG-F1B75079` | Amber · You can resolve this | Organization management access is required. |
| `ORG-F32C82BC` | Blue · School staff can help | Only an administrator can assign school-wide organization heads. |
| `ORG-F52197EA` | Amber · You can resolve this | An event cannot be moved into or out of an organization. |
| `ORG-FE08B3BF` | Amber · You can resolve this | Review only pending events before they start. |
| `ROSTER-001` | Amber · You can resolve this | Download the roster for an approved activity that is ongoing or starts within 24 hours. |
| `RULE-0076C43D` | Amber · You can resolve this | error-notice-operation |
| `RULE-0245BDA0` | Amber · You can resolve this | Amount must not be negative. |
| `RULE-02634A2A` | Amber · You can resolve this | Account not found. Sign up with this email to create your account. |
| `RULE-0466C359` | Amber · You can resolve this | /avatar-placeholder.svg |
| `RULE-04B2BAA1` | Grey · Support needs to check this | Unable to restore this unit. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-052A2E54` | Amber · You can resolve this | Enter the emergency contact’s full name and a valid mobile number (09XXXXXXXXX or +639XXXXXXXXX). |
| `RULE-05E2D773` | Grey · Support needs to check this | Account operation failed. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-065FD7B6` | Amber · You can resolve this | student_id |
| `RULE-0664AEA8` | Amber · You can resolve this | Only an unarchived service activity can be extended. |
| `RULE-06C04709` | Blue · School staff can help | This student account is frozen. |
| `RULE-0740D09C` | Amber · You can resolve this | Submit an information request for OSSA or admin approval. |
| `RULE-07B4E02B` | Blue · School staff can help | Operations are frozen for this school or class. |
| `RULE-08787B0E` | Amber · You can resolve this | Unit name and type are required. |
| `RULE-0AB3AEBE` | Amber · You can resolve this | Provide a rejection reason. |
| `RULE-0BD94409` | Amber · You can resolve this | Enter a title, official reason, and a valid action. |
| `RULE-0C1E7729` | Amber · You can resolve this | Only optional contact and guardian information can be deleted. |
| `RULE-0C880480` | Amber · You can resolve this | The selection changed or your admin access expired. Reload before saving again. |
| `RULE-0D91DCBC` | Amber · You can resolve this | Enter a valid category and at least 10 characters of explanation. |
| `RULE-0ED369A2` | Amber · You can resolve this | Email configuration unavailable. |
| `RULE-10BDD7D9` | Amber · You can resolve this | Please select a valid section to proceed. |
| `RULE-1158EC80` | Amber · You can resolve this | Unexpected command gateway. Review before applying the designation fix. |
| `RULE-12A518DC` | Blue · School staff can help | Only an administrator can create administrator accounts. |
| `RULE-12ADF7E1` | Amber · You can resolve this | Type initiate exactly to confirm. |
| `RULE-1489A1AE` | Amber · You can resolve this | useTheme must be used within a ThemeProvider |
| `RULE-14E720C7` | Amber · You can resolve this | Unable to queue email. Please try again later. |
| `RULE-15F9580E` | Blue · School staff can help | Service is outside your assigned scope. |
| `RULE-167EC1BD` | Grey · Support needs to check this | Could not save notification read status. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-16E527BD` | Amber · You can resolve this | Your excuse is pending OSSA review. |
| `RULE-17F2458D` | Amber · You can resolve this | Edit units individually to preserve references. |
| `RULE-19E783C1` | Amber · You can resolve this | Read and agree to the data privacy agreement first. |
| `RULE-1A23C86E` | Blue · School staff can help | Only OSSA and administrators can review requests. |
| `RULE-1A4F3A8C` | Amber · You can resolve this | Invalid attachment owner. |
| `RULE-1B31B076` | Amber · You can resolve this | Enter a valid guardian email address. |
| `RULE-1D9C8518` | Amber · You can resolve this | Standard flag raising is Monday morning; standard flag retreat is Friday afternoon. Adjust the dates/times or disable the standard toggle. |
| `RULE-1E138A65` | Amber · You can resolve this | The account could not be deleted. |
| `RULE-1FFC0862` | Grey · Support needs to check this | Unable to load email analytics. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-238D17D9` | Amber · You can resolve this | Only an active Super Admin can view email delivery statistics. |
| `RULE-24B50B1C` | Amber · You can resolve this | Fixed merit must be between 0.01 and 24 hours. |
| `RULE-2687F86E` | Amber · You can resolve this | approved |
| `RULE-272D4A45` | Amber · You can resolve this | Select a valid assigned unit. |
| `RULE-283E144F` | Amber · You can resolve this | This field is required. |
| `RULE-29235951` | Amber · You can resolve this | Unable to save the request. Please try again. |
| `RULE-29657151` | Amber · You can resolve this | Provide between 1 and 100 accounts. |
| `RULE-2ADFA999` | Amber · You can resolve this | Enter a freeze reason of up to 2000 characters. |
| `RULE-2B4AC806` | Amber · You can resolve this | Only Super Admins can preview emails. |
| `RULE-2C46AA17` | Blue · School staff can help | This account is outside your scope. |
| `RULE-2C7100BA` | Amber · You can resolve this | Choose an available video. |
| `RULE-2D6BB619` | Amber · You can resolve this | The application decision could not be saved. |
| `RULE-2E12E65C` | Amber · You can resolve this | Configure an outstanding bill and enter a subject and message. |
| `RULE-2F07B156` | Amber · You can resolve this | Invalid field selection. |
| `RULE-3125C664` | Amber · You can resolve this | Choose a release state. |
| `RULE-318F9B26` | Amber · You can resolve this | Unable to load email history. Try refreshing. |
| `RULE-322CD108` | Amber · You can resolve this | Select up to 200 accounts per batch. |
| `RULE-3235AB27` | Amber · You can resolve this | This account cannot be removed here. |
| `RULE-32E2C670` | Amber · You can resolve this | Unable to load the latest notifications. Reconnect to try again. |
| `RULE-334E344C` | Amber · You can resolve this | Every section needs a paragraph or bullet point. |
| `RULE-34808253` | Amber · You can resolve this | OSSA has not released this certificate. |
| `RULE-34A82508` | Amber · You can resolve this | Unable to initiate refresh. Try again. |
| `RULE-34D3671E` | Amber · You can resolve this | Invalid analytics period. |
| `RULE-355166C9` | Amber · You can resolve this | Invalid role assignment. |
| `RULE-357C3676` | Amber · You can resolve this | The officer could not be assigned. |
| `RULE-36C6AF46` | Amber · You can resolve this | Enter a reason for this account freeze. |
| `RULE-373D4D02` | Amber · You can resolve this | Enter all billing details and a positive outstanding balance. |
| `RULE-38484944` | Amber · You can resolve this | The CSV contains characters after a closing quote. |
| `RULE-3A9960D4` | Amber · You can resolve this | Invalid email history filters. |
| `RULE-3AD171EA` | Amber · You can resolve this | The preview could not load. Try another video. |
| `RULE-3C863D9A` | Amber · You can resolve this | Merit hours must be positive. |
| `RULE-3ED9E4E4` | Amber · You can resolve this | Invalid excess service hours policy. |
| `RULE-3FF6D0FF` | Amber · You can resolve this | Enter your full name. |
| `RULE-4127A4BE` | Amber · You can resolve this | You already have a pending request. Wait for its decision. |
| `RULE-44B234FE` | Amber · You can resolve this | Paragraphs and bullet points must contain 1 to 20000 characters. |
| `RULE-46CD2A89` | Amber · You can resolve this | Unable to update. Reconnect and try again. |
| `RULE-47986376` | Amber · You can resolve this | Choose Student or Mayor. |
| `RULE-482991B5` | Amber · You can resolve this | Section content must be an array. |
| `RULE-486818E0` | Blue · School staff can help | An unfrozen active admin account is required. |
| `RULE-494746E1` | Amber · You can resolve this | Choose a later service end date. |
| `RULE-4ED0D132` | Amber · You can resolve this | Use Student ID format YY-NNNN-NNN with an optional letter. |
| `RULE-50427321` | Amber · You can resolve this | This excuse has already been reviewed. |
| `RULE-507191CE` | Blue · School staff can help | Excuse submissions are frozen. |
| `RULE-52E7600B` | Amber · You can resolve this | Invalid email request budget. |
| `RULE-53DB3F1F` | Amber · You can resolve this | Choose an available account role. |
| `RULE-558B1514` | Amber · You can resolve this | error-notice-label |
| `RULE-55BCE084` | Amber · You can resolve this | Select at least one eligible activity. |
| `RULE-585DDEDD` | Amber · You can resolve this | Unable to save. Your edits are still here; try again. |
| `RULE-5A20AC93` | Amber · You can resolve this | Every section needs a heading of 1 to 200 characters. |
| `RULE-5A4F4B92` | Amber · You can resolve this | One or more accounts no longer exist. No accounts were changed. |
| `RULE-5AF75D7B` | Amber · You can resolve this | Email history entry not found. |
| `RULE-5D0C6930` | Amber · You can resolve this | The excuse submission window has closed. Contact OSSA for exceptional cases. |
| `RULE-5D9D821C` | Blue · School staff can help | Only the administrator can create campuses. |
| `RULE-5E91FD40` | Amber · You can resolve this | Invalid recipient role. |
| `RULE-5E961B26` | Amber · You can resolve this | Excuses are unavailable for this activity. |
| `RULE-60C6AE6B` | Amber · You can resolve this | Verify your current two-factor code again. |
| `RULE-61C4A074` | Amber · You can resolve this | Username must be 3–100 letters, numbers, dots, underscores, or hyphens. |
| `RULE-62DB3947` | Amber · You can resolve this | Unable to load the saved page. Showing the original content. Reload to try again. |
| `RULE-634365C7` | Grey · Support needs to check this | Unable to load this preview. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-63DA4A44` | Amber · You can resolve this | System owner access cannot be assigned here. |
| `RULE-640E766F` | Amber · You can resolve this | Unable to save the page. Check your connection and admin access, then try again. |
| `RULE-672338AE` | Amber · You can resolve this | An active student account is required. |
| `RULE-67953216` | Amber · You can resolve this | Only Super Admins can view email analytics. |
| `RULE-67D99B46` | Amber · You can resolve this | This field was not requested. |
| `RULE-6811CD5B` | Grey · Support needs to check this | Unable to update account freezes. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-6A9A2F00` | Amber · You can resolve this | Select an existing officer. |
| `RULE-6AAE0E63` | Blue · School staff can help | Keep at least one active admin unfrozen to restore access. |
| `RULE-6EA02C50` | Amber · You can resolve this | Invalid request. |
| `RULE-6EB4270E` | Amber · You can resolve this | A core role is required. |
| `RULE-6ECB7C36` | Amber · You can resolve this | Email delivery is not configured. |
| `RULE-6F51CE32` | Amber · You can resolve this | Your excuse has already been approved. |
| `RULE-70531A59` | Amber · You can resolve this | You cannot create an account with this level of access. |
| `RULE-70B40E75` | Amber · You can resolve this | The system owner role is protected. |
| `RULE-718B1BB3` | Amber · You can resolve this | Enter the emergency contact’s full name and a valid mobile number. |
| `RULE-7274DAED` | Amber · You can resolve this | This role cannot be assigned to this unit. |
| `RULE-72FF35BD` | Amber · You can resolve this | Email worker request failed. |
| `RULE-7393D2C8` | Amber · You can resolve this | This certificate has been revoked. |
| `RULE-7653CC9E` | Amber · You can resolve this | Unable to save the video. Check your connection and admin access, then try again. |
| `RULE-782DA643` | Amber · You can resolve this | Service settings require a service activity. |
| `RULE-7C05335A` | Amber · You can resolve this | Select between 1 and 200 valid accounts. |
| `RULE-7CBC1349` | Amber · You can resolve this | The CSV is missing a required column. Download a fresh import template and keep its column headings. |
| `RULE-7D23DED4` | Amber · You can resolve this | Too many requests. Please wait before trying again. |
| `RULE-7ECAC1E2` | Grey · Support needs to check this | Unable to resend confirmation email. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-815DF985` | Amber · You can resolve this | studentId |
| `RULE-829AB29E` | Amber · You can resolve this | Only one mayor can be assigned to a section. |
| `RULE-8310EBC3` | Amber · You can resolve this | Invalid credentials |
| `RULE-84CF4E96` | Amber · You can resolve this | Account creation failed. |
| `RULE-85D22667` | Amber · You can resolve this | Enter the reason for this adjustment. |
| `RULE-8602B134` | Amber · You can resolve this | Choose a student in this section. |
| `RULE-864FD0EC` | Amber · You can resolve this | Unknown rate limit route |
| `RULE-86745AFB` | Amber · You can resolve this | The CSV contains an unclosed quoted field. |
| `RULE-86746504` | Amber · You can resolve this | Choose flag raising or retreat. |
| `RULE-88E342A1` | Amber · You can resolve this | Choose an active Student or Mayor. |
| `RULE-8C6DD66D` | Amber · You can resolve this | The latest application data could not be loaded. Displayed record counts may be outdated. |
| `RULE-8CFE333B` | Amber · You can resolve this | The CSV contains duplicate member headers. |
| `RULE-8FAFA7ED` | Blue · School staff can help | This record is outside your assigned scope. |
| `RULE-8FC08279` | Amber · You can resolve this | Built-in roles cannot be removed. |
| `RULE-9004D979` | Amber · You can resolve this | Sanctions must not be negative. |
| `RULE-9049F633` | Amber · You can resolve this | Too many email requests. Please wait before trying again. |
| `RULE-90968E87` | Amber · You can resolve this | An academic unit no longer exists. |
| `RULE-90FF6B0F` | Grey · Support needs to check this | Unable to save unit. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-936FFF35` | Amber · You can resolve this | The destination overlaps another holiday or suspension. |
| `RULE-93DF65D0` | Amber · You can resolve this | This application has already been reviewed. |
| `RULE-93E8E8FF` | Amber · You can resolve this | No information has changed. |
| `RULE-946C5131` | Amber · You can resolve this | Use Student ID format YYYY-XXXXXL: four year digits, five numbers, and one letter (for example 2025-00046A). |
| `RULE-94FBE7BF` | Amber · You can resolve this | Unable to load the saved video. Check your connection and reload. |
| `RULE-96363687` | Amber · You can resolve this | Invalid email queue request. |
| `RULE-97AD0213` | Amber · You can resolve this | Section not found. |
| `RULE-97E2072E` | Amber · You can resolve this | Enter a payment date that is today or earlier. |
| `RULE-97F92989` | Grey · Support needs to check this | Unable to save the video. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-98779E5A` | Amber · You can resolve this | Enter a valid full name. |
| `RULE-989D4647` | Amber · You can resolve this | Invalid account role. |
| `RULE-9939DD77` | Amber · You can resolve this | Unable to load saved closures. |
| `RULE-9E04A614` | Amber · You can resolve this | Invalid account provisioning request. |
| `RULE-9E3743D0` | Amber · You can resolve this | Request body is required. |
| `RULE-9F268C74` | Amber · You can resolve this | All priorities |
| `RULE-A12D37A9` | Amber · You can resolve this | You already have a pending or approved excuse for this activity. |
| `RULE-A3E0E535` | Amber · You can resolve this | Type the target name exactly as it appears in the confirmation dialog. |
| `RULE-A56918D6` | Amber · You can resolve this | A refresh was just initiated. Wait 30 seconds before trying again. |
| `RULE-A5E51281` | Amber · You can resolve this | Select a section or block. |
| `RULE-A7AA7F33` | Amber · You can resolve this | Service must end in the future and span at most one year. |
| `RULE-A98743D9` | Amber · You can resolve this | This activity has not been approved. |
| `RULE-A98D1ECA` | Blue · School staff can help | Only administrators can manage holidays and suspensions. |
| `RULE-A9EDA1A8` | Amber · You can resolve this | /admin/controls |
| `RULE-AAB8C27E` | Amber · You can resolve this | The member could not be created. |
| `RULE-ABD573FE` | Amber · You can resolve this | The page changed or your admin access expired. Copy your edits, then reload the page before saving again. |
| `RULE-ABF77650` | Amber · You can resolve this | Confirm your email address before signing in. Use the resend confirmation option. |
| `RULE-AC3E9624` | Amber · You can resolve this | Excuse submission days must be a whole number from 0 to 30. |
| `RULE-AF3432D2` | Amber · You can resolve this | Enter at least 10 characters of explanation. |
| `RULE-AF68FB8A` | Amber · You can resolve this | Email requests are temporarily unavailable. Try again later. |
| `RULE-B12D2DFE` | Amber · You can resolve this | A CSV row has the wrong number of columns. Use the import template and check quotation marks around values containing commas. |
| `RULE-B28D595B` | Blue · School staff can help | Frozen status is unavailable for this account. |
| `RULE-B3D97101` | Amber · You can resolve this | Choose information to change or delete. |
| `RULE-B57E0567` | Blue · School staff can help | The current Mayor account is frozen. |
| `RULE-B666E845` | Amber · You can resolve this | Name, student ID, and a valid username are required. |
| `RULE-B763E8C7` | Amber · You can resolve this | Enter a title and a current or future clearing period, with an end after its start. |
| `RULE-B7A86152` | Amber · You can resolve this | Confirmation email sent. Check your inbox and spam folder. |
| `RULE-B7C61473` | Amber · You can resolve this | Enter a valid email address. |
| `RULE-BAF58209` | Amber · You can resolve this | error-notice-code |
| `RULE-BB349F9A` | Amber · You can resolve this | This student account is no longer eligible. |
| `RULE-BC0E72C8` | Blue · School staff can help | Only an active administrator can initiate an app refresh. |
| `RULE-BC540609` | Amber · You can resolve this | Invalid rate limit subject |
| `RULE-BD2A9D25` | Amber · You can resolve this | Request is too large. |
| `RULE-BE33AB01` | Amber · You can resolve this | Select a valid academic unit. |
| `RULE-BE4FB6A2` | Amber · You can resolve this | Method not allowed |
| `RULE-C16E46A3` | Blue · School staff can help | An assigned scope is required. |
| `RULE-C27C3F00` | Amber · You can resolve this | Role must be student or mayor. |
| `RULE-C4B6B99E` | Amber · You can resolve this | Only Super Admins can view email history. |
| `RULE-C69C2ED2` | Amber · You can resolve this | Choose at least one pending change. |
| `RULE-C6E7FD65` | Grey · Support needs to check this | Unable to request email. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-C78D352A` | Amber · You can resolve this | An active account is required. |
| `RULE-C817AB76` | Amber · You can resolve this | A fresh, accurate GPS location is required. |
| `RULE-C9C84B97` | Amber · You can resolve this | This service is temporarily unavailable. Please try again shortly. |
| `RULE-CABFF0E5` | Amber · You can resolve this | Choose a section or block. |
| `RULE-CC08C070` | Amber · You can resolve this | Invalid worker heartbeat. |
| `RULE-CEAE2A6C` | Amber · You can resolve this | The action could not be completed. |
| `RULE-D550A297` | Amber · You can resolve this | Unit not found. |
| `RULE-DA576134` | Amber · You can resolve this | An account already uses one of these details. Check the username, email, and student ID before creating another account. |
| `RULE-DC19A608` | Amber · You can resolve this | The CSV contains a quote inside an unquoted field. |
| `RULE-DC7A7DF7` | Amber · You can resolve this | Move activities beyond the affected dates. |
| `RULE-DDF47C80` | Grey · Support needs to check this | Unable to create account. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-E1E6FEE1` | Amber · You can resolve this | Invalid session. |
| `RULE-E234FD63` | Amber · You can resolve this | Choose valid dates from today onwards, academic units, and a shift of 0–366 days. |
| `RULE-E2E92CFA` | Amber · You can resolve this | error-notice-message |
| `RULE-E366AA42` | Amber · You can resolve this | This section already has a mayor. |
| `RULE-E385E50C` | Amber · You can resolve this | Choose approve or reject. |
| `RULE-E3CD88D6` | Grey · Support needs to check this | Unable to submit the application. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `RULE-E76F339C` | Amber · You can resolve this | Choose a valid academic assignment. |
| `RULE-E7CBC3B8` | Amber · You can resolve this | This academic unit is archived. |
| `RULE-EA709382` | Amber · You can resolve this | Enter a valid geofence. |
| `RULE-EA957665` | Amber · You can resolve this | Provide a decision note in 3 to 2000 characters. |
| `RULE-EACA92CF` | Amber · You can resolve this | Google could not load. Check your connection and reopen this window. |
| `RULE-EACD1C3E` | Amber · You can resolve this | Could not refresh accounts. Try again. |
| `RULE-EC2C2521` | Blue · School staff can help | Only OSAS or an administrator can change the excess service hours policy. |
| `RULE-EDEF262D` | Amber · You can resolve this | Core role not found. |
| `RULE-EE9274CA` | Amber · You can resolve this | Choose the student's current class. |
| `RULE-EEA18BFD` | Amber · You can resolve this | An activity no longer exists. |
| `RULE-EF862BD1` | Amber · You can resolve this | An assigned OSSA reviewer is required. |
| `RULE-F1B4908A` | Amber · You can resolve this | Invalid review. |
| `RULE-F1BF5F94` | Amber · You can resolve this | System owner accounts cannot be reassigned. |
| `RULE-F22225F8` | Amber · You can resolve this | Rate limiter unavailable |
| `RULE-F2DD0D30` | Amber · You can resolve this | Choose 1 to 52 weekly occurrences. |
| `RULE-F3E47655` | Blue · School staff can help | You do not have permission to manage accounts. |
| `RULE-F3EB5254` | Blue · School staff can help | Excuse submissions are temporarily frozen. Contact OSSA. |
| `RULE-F3F3F07A` | Amber · You can resolve this | A student account is required. |
| `RULE-F43FEFD7` | Amber · You can resolve this | Unable to load the email tracker. It will retry automatically. |
| `RULE-F47E11CA` | Blue · School staff can help | This request is outside your review scope. |
| `RULE-F59C3CE8` | Amber · You can resolve this | This change has already been reviewed. Refresh the request. |
| `RULE-F757C893` | Amber · You can resolve this | Legal pages require 1 to 50 sections and at most 200 KB of content. |
| `RULE-F8E5F0A5` | Amber · You can resolve this | This request has already been reviewed. |
| `RULE-F9BFC3A4` | Blue · School staff can help | Access is frozen by school administration. |
| `RULE-F9E0C1D2` | Amber · You can resolve this | Explain your request in 10 to 2000 characters. |
| `RULE-FA37F6A1` | Amber · You can resolve this | Choose a different active destination class. |
| `RULE-FA6B116A` | Amber · You can resolve this | Use Student ID format YYYY-NNNNNL (for example 2025-00046A). |
| `RULE-FABBC2F2` | Blue · School staff can help | Shared diagnostics could not be loaded. Check database deployment and your system-health permission. |
| `RULE-FC1E5530` | Amber · You can resolve this | Email, username, or student ID already exists. |
| `RULE-FD191614` | Amber · You can resolve this | Student information changed after submission. Reject this request and ask for a new one. |
| `RULE-FD8D53C8` | Amber · You can resolve this | This record has linked records or children. Archive it instead. |
| `RULE-FDF07766` | Amber · You can resolve this | The members could not be created. |
| `RULE-FFA7FF0C` | Amber · You can resolve this | Reassign accounts before deleting this role. |
| `SYS-001` | Grey · Support needs to check this | The result of this request could not be confirmed. Check the latest records before repeating it. If it continues, send the code and reference to support. |
| `SYS-002` | Red · Developer fix needed | This feature’s server update is missing. Send this code to technical support so the developer can update the backend. |
| `SYS-003` | Red · Developer fix needed | The app and server are using different data definitions. Send this code to technical support so the developer can fix the deployment. |
| `SYS-004` | Red · Developer fix needed | The app encountered a programming error. Send this code to technical support with the screen and action you were using. |
| `TRANSFER-092392B5` | Amber · You can resolve this | Choose a file of 10 MB or smaller. |
| `TRANSFER-12DED02E` | Amber · You can resolve this | Duplicate student in transfer batch. |
| `TRANSFER-139F7D5E` | Amber · You can resolve this | Use plain values, not formulas, in the Students tab. |
| `TRANSFER-32104753` | Amber · You can resolve this | Student identity or assignment changed. Export a fresh template. |
| `TRANSFER-39DB7A90` | Blue · School staff can help | Permission required: directory.transfer_students |
| `TRANSFER-5607E6B4` | Amber · You can resolve this | The workbook needs a Students tab. |
| `TRANSFER-655506A5` | Amber · You can resolve this | Transfer at most 1,000 students per batch. |
| `TRANSFER-6E487434` | Grey · Support needs to check this | Could not load students. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `TRANSFER-8D962CFA` | Amber · You can resolve this | Select a class from the dropdown or leave this cell blank. |
| `TRANSFER-ABA81129` | Amber · You can resolve this | Choose a different destination class. |
| `TRANSFER-AFEBD1DB` | Amber · You can resolve this | Choose a destination class. |
| `TRANSFER-BDB5224C` | Amber · You can resolve this | Use the exported Students template and keep its column headings unchanged. |
| `TRANSFER-C33E1618` | Amber · You can resolve this | Provide a transfer batch. |
| `TRANSFER-D473550D` | Blue · School staff can help | Transfer requests are temporarily frozen. |
| `TRANSFER-DE5B403E` | Amber · You can resolve this | No assignment changes found. Choose a new class in Move to class. |
| `TRANSFER-E2042E27` | Amber · You can resolve this | Invalid transfer request. |
| `TRANSFER-EEC0B4DC` | Grey · Support needs to check this | The operation failed. The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues. |
| `TRANSFER-F805CCD4` | Amber · You can resolve this | Transfer between 1 and 1,000 students per batch. |
