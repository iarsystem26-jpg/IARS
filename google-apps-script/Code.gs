/**
 * RMC Attendance profile image API.
 * Deploy as a web app: execute as the owner, who has access: anyone.
 */
const DRIVE_FOLDER_ID = '1ZMkmdQ2TRLJQuMhPO0e66SQms1q3UETw';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Run installSupabaseKeepAlive once from the trusted Apps Script editor.
// Time-driven triggers run on Google's servers even when the app is closed.
function installSupabaseKeepAlive() {
  pingSupabase(); // Verify configuration before changing an existing schedule.
  const previous = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === 'pingSupabase';
  });
  ScriptApp.newTrigger('pingSupabase').timeBased().everyHours(6).create();
  previous.forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  console.log('Supabase keep-alive installed: every 6 hours.');
}

function removeSupabaseKeepAlive() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'pingSupabase') ScriptApp.deleteTrigger(trigger);
  });
}

function pingSupabase() {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('SUPABASE_URL');
  const key = properties.getProperty('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(url) || !key) {
    throw new Error('Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in Script properties first.');
  }
  // Query the existing public directory through RLS, without reading profiles
  // or changing data. An Auth health check alone is not a database query.
  const response = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/rest/v1/rmc_nodes?select=id&limit=1', {
    method: 'get',
    headers: { apikey: key },
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status !== 200) {
    // Do not log keys, response bodies, or school records.
    throw new Error('Supabase keep-alive failed (HTTP ' + status + '). Check project status and Script properties.');
  }
  if (!Array.isArray(JSON.parse(response.getContentText()))) {
    throw new Error('Supabase keep-alive returned an unexpected response.');
  }
  const lastSuccess = new Date().toISOString();
  properties.setProperty('SUPABASE_KEEPALIVE_LAST_SUCCESS', lastSuccess);
  console.log('Supabase keep-alive succeeded at ' + lastSuccess);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  // Credentials must never appear in URLs, logs, or referrers. No public inventory.
  return json_({ success: false, error: 'Use an authorized POST request.' });
}

function doPost(e) {
  try {
    const contents = (e && e.postData && e.postData.contents) || '{}';
    if (contents.length > 7 * 1024 * 1024) throw new Error('Request is too large.');
    const request = JSON.parse(contents);
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid request.');
    const action = request.action || 'create';
    if (action === 'email_setup' || action === 'email_health' || action === 'email_flush') {
      const config = authEmailConfig_();
      if (!config.secret || typeof request.secret !== 'string' || request.secret !== config.secret) throw new Error('Unauthorized email service request.');
      if (action === 'email_setup') installAuthEmailDelivery();
      if (action === 'email_flush') deliverAuthEmails();
      GmailApp.getAliases(); // Verify Gmail permission without sending a message.
      return json_({ success: true, gmailAuthorized: true, installed: ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === 'deliverAuthEmails'; }) });
    }
    const actor = actor_(request.accessToken);
    if (action === 'create') {
      return json_({ success: true, ...createFile_(request, actor) });
    }
    if (action === 'update') return json_({ success: true, ...updateFile_(request, actor) });
    if (action === 'delete') return json_({ success: true, ...deleteFile_(request, actor) });
    if (action === 'read') return json_(readFile_(request, actor));
    if (action === 'list') {
      if (!actor) throw new Error('Sign in first.');
      return json_({ success: true, files: listFiles_(actor) });
    }
    return json_({ success: false, error: 'Unsupported action.' });
  } catch (error) {
    return json_({ success: false, error: error.message || String(error) });
  }
}

// The deployment script installs this configuration as a separate server-only
// source file. Secrets are not embedded in this repository or returned publicly.
// Run once as the owner if Google asks for consent to the new Gmail permission.
function installAuthEmailDelivery() {
  GmailApp.getAliases();
  const config = authEmailConfig_();
  if (!config.secret || !config.workerUrl) throw new Error('Deploy the authentication email configuration first.');
  const previous = ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === 'deliverAuthEmails'; });
  if (!previous.length) ScriptApp.newTrigger('deliverAuthEmails').timeBased().everyMinutes(1).create();
  previous.slice(1).forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  console.log('Gmail authentication email worker installed: every minute.');
}

function emailWorkerRequest_(body) {
  const config = authEmailConfig_();
  const result = UrlFetchApp.fetch(config.workerUrl, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + config.secret }, payload: JSON.stringify(body), muteHttpExceptions: true });
  if (result.getResponseCode() !== 200) throw new Error('Email queue service unavailable.');
  return JSON.parse(result.getContentText());
}

function deliverAuthEmails() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const now = Date.now();
    let budget = JSON.parse(properties.getProperty('AUTH_EMAIL_BUDGET') || '{}');
    if (!budget.started || now - budget.started >= 24 * 60 * 60 * 1000) {
      budget = { started: now, sent: 0 };
      properties.deleteProperty('AUTH_EMAIL_ERROR_CODE');
    }
    const batch = emailWorkerRequest_({ action: 'claim', heartbeat: { started: budget.started, sent: budget.sent || 0, errorCode: properties.getProperty('AUTH_EMAIL_ERROR_CODE') || null } });
    let logo;
    const markerFor = function (id) { return 'IARS-DELIVERY-' + id; };
    const sentFor = function (id) {
      const threads = GmailApp.search('in:sent "' + markerFor(id) + '"', 0, 1);
      if (!threads.length) return null;
      const messages = threads[0].getMessages();
      return messages.filter(function (message) { return message.getPlainBody().indexOf(markerFor(id)) >= 0; })[0] || null;
    };
    const remember = function (id, entry) { entry.updated = Date.now(); properties.setProperty('AUTH_EMAIL_JOB_' + id, JSON.stringify(entry)); };
    const countSent = function (id, entry, messageId) {
      if (!entry.counted) { budget.sent += 1; entry.counted = true; properties.setProperty('AUTH_EMAIL_BUDGET', JSON.stringify(budget)); }
      entry.state = 'sent'; entry.messageId = messageId; remember(id, entry);
    };
    (batch.review || []).forEach(function (item) {
      try {
        const found = sentFor(item.id);
        if (found) {
          const entry = JSON.parse(properties.getProperty('AUTH_EMAIL_JOB_' + item.id) || '{}');
          countSent(item.id, entry, found.getId());
          emailWorkerRequest_({ action: 'reconciled', id: item.id, messageId: found.getId() });
        }
      } catch (_) { /* An uncertain send remains held, never blindly duplicated. */ }
    });
    (batch.messages || []).forEach(function (item) {
      let entry = JSON.parse(properties.getProperty('AUTH_EMAIL_JOB_' + item.id) || '{}');
      let draft;
      let sendAttempted = false;
      try {
        if (entry.state === 'sent') {
          emailWorkerRequest_({ action: 'ack', id: item.id, lease: item.lease, delivered: true });
          return;
        }
        const draftId = entry.draftId || item.draftId;
        if (draftId) {
          try { draft = GmailApp.getDraft(draftId); } catch (_) {
            const found = sentFor(item.id);
            if (found) { countSent(item.id, entry, found.getId()); emailWorkerRequest_({ action: 'ack', id: item.id, lease: item.lease, delivered: true }); }
            else { emailWorkerRequest_({ action: 'uncertain', id: item.id, lease: item.lease }); properties.setProperty('AUTH_EMAIL_ERROR_CODE', 'uncertain'); }
            return;
          }
        } else if (entry.state === 'creating') {
          draft = GmailApp.getDrafts().filter(function (candidate) { return candidate.getMessage().getPlainBody().indexOf(markerFor(item.id)) >= 0; })[0];
        }
        if (budget.sent >= 90) { emailWorkerRequest_({ action: 'ack', id: item.id, lease: item.lease, delivered: false }); return; }
        const prepared = emailWorkerRequest_({ action: 'prepare', id: item.id, lease: item.lease });
        if (!prepared.message) { if (draft) draft.deleteDraft(); properties.deleteProperty('AUTH_EMAIL_JOB_' + item.id); return; }
        const message = prepared.message;
        const options = { name: 'Institution Attendance and Records System', htmlBody: message.html + '<p style="color:#64748b;font-size:10px;">Delivery reference: ' + markerFor(item.id) + '</p>' };
        if (!logo) {
          const image = UrlFetchApp.fetch('https://iars-tau.vercel.app/academic-seal-transparent.png', { muteHttpExceptions: true });
          if (image.getResponseCode() === 200) logo = image.getBlob().setName('iars-seal.png');
        }
        if (logo) { options.inlineImages = { iarsSeal: logo }; options.htmlBody = options.htmlBody.split('https://iars-tau.vercel.app/academic-seal-transparent.png').join('cid:iarsSeal'); }
        const plain = message.text + '\n\nDelivery reference: ' + markerFor(item.id);
        if (!draft) { entry.state = 'creating'; remember(item.id, entry); draft = GmailApp.createDraft(message.to, message.subject, plain, options); }
        else draft.update(message.to, message.subject, plain, options);
        entry.draftId = draft.getId(); entry.state = 'drafted'; remember(item.id, entry);
        // Persist the provider object before sending. Every retry reuses this draft.
        emailWorkerRequest_({ action: 'draft', id: item.id, lease: item.lease, draftId: entry.draftId });
        sendAttempted = true;
        const sent = draft.send();
        countSent(item.id, entry, sent.getId());
        properties.deleteProperty('AUTH_EMAIL_ERROR_CODE');
        emailWorkerRequest_({ action: 'ack', id: item.id, lease: item.lease, delivered: true });
      } catch (error) {
        if (entry.state === 'sent') return; // Lost acknowledgement: the durable ledger retries it.
        let reusable = !sendAttempted;
        if (sendAttempted && entry.draftId) { try { GmailApp.getDraft(entry.draftId); reusable = true; } catch (_) { reusable = false; } }
        try { emailWorkerRequest_({ action: reusable ? 'ack' : 'uncertain', id: item.id, lease: item.lease, delivered: false }); } catch (_) { /* Lease expiry resumes recovery. */ }
        const code = /quota|too many|limit exceeded|service invoked too many/i.test(String(error)) ? 'quota' : reusable ? 'provider' : 'uncertain';
        properties.setProperty('AUTH_EMAIL_ERROR_CODE', code);
        properties.setProperty('AUTH_EMAIL_LAST_ERROR', 'Email delivery is delayed; check the live email tracker.');
      }
    });
    properties.setProperty('AUTH_EMAIL_LAST_RUN', new Date().toISOString());
    // Heartbeat-only calls do not claim more mail and report a newly detected quota.
    if ((batch.messages || []).length || (batch.review || []).length) emailWorkerRequest_({ action: 'heartbeat', heartbeat: { started: budget.started, sent: budget.sent, errorCode: properties.getProperty('AUTH_EMAIL_ERROR_CODE') || null } });
    if (now - Number(properties.getProperty('AUTH_EMAIL_LEDGER_CLEANUP') || 0) > 24 * 60 * 60 * 1000) {
      const saved = properties.getProperties();
      Object.keys(saved).filter(function (key) { return key.indexOf('AUTH_EMAIL_JOB_') === 0; }).forEach(function (key) {
        try { const job = JSON.parse(saved[key]); if (job.state === 'sent' && now - job.updated > 7 * 24 * 60 * 60 * 1000) properties.deleteProperty(key); } catch (_) {}
      });
      properties.setProperty('AUTH_EMAIL_LEDGER_CLEANUP', String(now));
    }
  } finally { lock.releaseLock(); }
}
function actor_(token) {
  if (!token) return null; // Registration uploads happen before signup.
  if (typeof token !== 'string' || token.length > 8192) throw new Error('Invalid session.');
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty('SUPABASE_URL');
  const key = properties.getProperty('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(url) || !key) throw new Error('Image service authentication is not configured.');
  const options = { headers: { apikey: key, Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
  const identity = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/auth/v1/user', options);
  if (identity.getResponseCode() !== 200) throw new Error('Invalid session.');
  const user = JSON.parse(identity.getContentText());
  if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new Error('Invalid session.');
  // RLS checks account status and enrolled MFA as well as identity.
  const profile = UrlFetchApp.fetch(url.replace(/\/$/, '') + '/rest/v1/rmc_profiles?select=id&id=eq.' + encodeURIComponent(user.id), options);
  if (profile.getResponseCode() !== 200 || !JSON.parse(profile.getContentText()).some(function (row) { return row.id === user.id; })) {
    throw new Error('Verify your account and security code before managing images.');
  }
  return user.id;
}

function tokenHash_(token) {
  if (typeof token !== 'string' || !/^[a-z0-9-]{72}$/i.test(token)) throw new Error('Image management token is required.');
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token).map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function ownership_(file) {
  try { return JSON.parse(file.getDescription() || '{}'); } catch (_) { return {}; }
}

function authorizedFile_(request, actor) {
  const file = managedFile_(request.fileId);
  const owner = ownership_(file);
  if (actor && owner.owner === actor) return file;
  if (owner.capability && request.managementToken && owner.capability === tokenHash_(request.managementToken)) return file;
  // Existing files without ownership remain viewable, but cannot be claimed by
  // supplying a filename, student ID, or a user-editable profile URL.
  throw new Error('You do not have permission to manage this image.');
}

function limitAnonymousUploads_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const day = new Date().toISOString().slice(0, 10);
    const saved = JSON.parse(properties.getProperty('ANONYMOUS_UPLOAD_COUNT') || '{}');
    const count = saved.day === day ? Number(saved.count) || 0 : 0;
    const limit = Number(properties.getProperty('ANONYMOUS_DAILY_UPLOAD_LIMIT')) || 200;
    if (count >= limit) throw new Error('The daily registration photo limit has been reached. Contact school support.');
    properties.setProperty('ANONYMOUS_UPLOAD_COUNT', JSON.stringify({ day: day, count: count + 1 }));
  } finally { lock.releaseLock(); }
}

// Run only from the trusted Apps Script editor after verifying the file's
// existing owner against school records. This is never exposed by doPost.
function assignLegacyImageOwner(fileId, ownerId) {
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error('A verified Supabase user ID is required.');
  const file = managedFile_(fileId);
  const current = ownership_(file);
  if (current.owner || current.capability) throw new Error('This image already has ownership protection.');
  file.setDescription(JSON.stringify({ owner: ownerId }));
}

function safePart_(value, fallback) {
  const clean = String(value || fallback).trim().replace(/[\\/:*?"<>|#%{}~]/g, '-').replace(/\s+/g, ' ').replace(/-+/g, '-');
  return clean.substring(0, 100) || fallback;
}

function extension_(mimeType) {
  return mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
}

function blobFromRequest_(request) {
  const mimeType = String(request.mimeType || '');
  if (ALLOWED_MIME_TYPES.indexOf(mimeType) < 0) throw new Error('Only JPG, PNG, and WebP images are allowed.');
  const encoded = String(request.dataUrl || '').replace(/^data:[^;]+;base64,/, '');
  if (!encoded) throw new Error('Image data is required.');
  const bytes = Utilities.base64Decode(encoded);
  if (!bytes.length) throw new Error('Image data is required.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Profile images must be 5 MB or smaller.');
  const unsigned = bytes.map(function (byte) { return (byte + 256) % 256; });
  const valid = mimeType === 'image/jpeg' ? unsigned[0] === 255 && unsigned[1] === 216 && unsigned[2] === 255
    : mimeType === 'image/png' ? unsigned.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
    : unsigned.slice(0, 4).join(',') === '82,73,70,70' && unsigned.slice(8, 12).join(',') === '87,69,66,80';
  if (!valid) throw new Error('The file content does not match its image type.');
  return Utilities.newBlob(bytes, mimeType);
}

function filename_(request, mimeType) {
  return safePart_(request.name, 'Profile') + ' - ' + safePart_(request.studentId, 'Unknown ID') + '.' + extension_(mimeType);
}

function publicUrl_(file) {
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600';
}

function managedFile_(fileId) {
  const file = DriveApp.getFileById(String(fileId || ''));
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === DRIVE_FOLDER_ID) return file;
  }
  throw new Error('The requested file is outside the profile image folder.');
}

function createFile_(request, actor) {
  const capability = tokenHash_(request.managementToken);
  const blob = blobFromRequest_(request).setName(filename_(request, request.mimeType));
  if (!actor) limitAnonymousUploads_();
  const file = DriveApp.getFolderById(DRIVE_FOLDER_ID).createFile(blob);
  file.setDescription(JSON.stringify({ owner: actor || null, capability: capability }));
  return { id: file.getId(), name: file.getName(), url: publicUrl_(file) };
}

function updateFile_(request, actor) {
  const file = authorizedFile_(request, actor);
  // Drive's Apps Script File API cannot replace binary content in place reliably;
  // create the replacement first, then trash the old object after it succeeds.
  if (request.dataUrl) {
    const replacement = createFile_(Object.assign({}, request, { managementToken: request.replacementManagementToken }), actor);
    file.setTrashed(true);
    return replacement;
  }
  if (request.name || request.studentId) {
    const current = file.getName().split('.').pop();
    file.setName(safePart_(request.name, 'Profile') + ' - ' + safePart_(request.studentId, 'Unknown ID') + '.' + current);
  }
  return { id: file.getId(), name: file.getName(), url: publicUrl_(file) };
}

function readFile_(request, actor) {
  const file = authorizedFile_(request, actor);
  return { success: true, id: file.getId(), name: file.getName(), url: publicUrl_(file) };
}

function deleteFile_(request, actor) {
  const file = authorizedFile_(request, actor);
  file.setTrashed(true);
  return { id: file.getId() };
}

function listFiles_(actor) {
  const files = [];
  const iterator = DriveApp.getFolderById(DRIVE_FOLDER_ID).getFiles();
  while (iterator.hasNext()) {
    const file = iterator.next();
    if (ownership_(file).owner === actor && ALLOWED_MIME_TYPES.indexOf(file.getMimeType()) >= 0) files.push({ id: file.getId(), name: file.getName(), url: publicUrl_(file) });
  }
  return files;
}
