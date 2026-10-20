// The provisioning script replaces driveDeploymentConfig_ remotely with values
// bound to ONE educational unit. Browser input never selects a different unit.
function driveDeploymentConfig_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    folderId: properties.getProperty('UNIT_DRIVE_FOLDER_ID'),
    supabaseUrl: properties.getProperty('SUPABASE_URL'),
    publishableKey: properties.getProperty('SUPABASE_PUBLISHABLE_KEY')
  };
}

function folderWithinUnit_(id) {
  const folder = DriveApp.getFolderById(String(id || driveRootId_()));
  if (folder.isTrashed()) throw new Error('This folder is in Drive trash.');
  let current = folder;
  for (let depth = 0; depth < 32; depth++) {
    if (current.getId() === driveRootId_()) return folder;
    const parents = current.getParents();
    if (!parents.hasNext()) break;
    current = parents.next();
  }
  throw new Error('This folder is outside your educational unit.');
}

function folderResult_(folder) {
  return { id: folder.getId(), name: folder.getName(), url: folder.getUrl(), system: /^iars-category:/.test(folder.getDescription() || '') };
}

function categoryFolder_(category) {
  const names = { photos: 'Profile Photos', logos: 'Organization Logos', banners: 'Event Banners', reports: 'Reports' };
  if (!Object.prototype.hasOwnProperty.call(names, category)) throw new Error('Invalid upload category.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const root = folderWithinUnit_(driveRootId_());
    const folders = root.getFolders();
    while (folders.hasNext()) {
      const folder = folders.next();
      if (!folder.isTrashed() && folder.getDescription() === 'iars-category:' + category) return folder;
    }
    const folder = root.createFolder(names[category]);
    folder.setDescription('iars-category:' + category);
    return folder;
  } finally { lock.releaseLock(); }
}

function requireDriveAdmin_(token, actor) {
  if (!actor) throw new Error('Sign in as an administrator first.');
  const config = driveAuthConfig_();
  const response = UrlFetchApp.fetch(config.url.replace(/\/$/, '') + '/rest/v1/rmc_profiles?select=id,role_id,status&id=eq.' + encodeURIComponent(actor), {
    headers: { apikey: config.key, Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Unable to verify administrator access.');
  const rows = JSON.parse(response.getContentText());
  if (!Array.isArray(rows) || !rows.some(function (row) { return row.id === actor && row.role_id === 'admin' && row.status === 'active'; })) throw new Error('Only active administrators can manage folders.');
}

function manageDriveFolder_(request, actor) {
  requireDriveAdmin_(request.accessToken, actor);
  if (request.action === 'folder_setup') {
    ['photos', 'logos', 'banners', 'reports'].forEach(categoryFolder_);
  }
  const folder = folderWithinUnit_(request.folderId);
  if (request.action === 'folder_create') {
    const name = String(request.name || '').trim();
    if (!name || name.length > 100 || /[\\/\x00-\x1f]/.test(name)) throw new Error('Enter a folder name of 1–100 characters without slashes.');
    return { success: true, folder: folderResult_(folder.createFolder(name)) };
  }
  if (request.action === 'folder_update' || request.action === 'folder_delete') {
    if (folder.getId() === driveRootId_()) throw new Error('Manage the educational unit root through provisioning.');
    if (request.action === 'folder_delete') {
      if (/^iars-category:/.test(folder.getDescription() || '')) throw new Error('Required upload folders cannot be deleted.');
      if (folder.getFiles().hasNext() || folder.getFolders().hasNext()) throw new Error('Only empty folders can be moved to trash.');
      folder.setTrashed(true);
      return { success: true, id: folder.getId() };
    }
    const name = String(request.name || '').trim();
    if (!name || name.length > 100 || /[\\/\x00-\x1f]/.test(name)) throw new Error('Enter a folder name of 1–100 characters without slashes.');
    folder.setName(name);
  }
  const folders = [], iterator = folder.getFolders();
  while (iterator.hasNext()) {
    const child = iterator.next();
    if (!child.isTrashed()) folders.push(folderResult_(child));
  }
  return { success: true, folder: folderResult_(folder), folders: folders };
}
