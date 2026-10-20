import crypto from 'node:crypto';

export function resolveEmailEncryptionKey(localKey, installedConfig) {
  const installedKey = installedConfig?.encryptionKey;
  if (installedConfig && !installedKey) throw new Error('The installed Gmail worker has no encryption key. Restore its server configuration before continuing.');
  for (const key of [localKey, installedKey]) {
    if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32)) {
      throw new Error('AUTH_EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    }
  }
  if (localKey && installedKey && localKey !== installedKey) throw new Error('AUTH_EMAIL_ENCRYPTION_KEY does not match the key already installed in the Gmail worker.');
  return installedKey || localKey || crypto.randomBytes(32).toString('base64');
}

export function saveEmailEncryptionKey(source, key) {
  const line = `AUTH_EMAIL_ENCRYPTION_KEY=${key}`;
  const pattern = /^(?:export\s+)?AUTH_EMAIL_ENCRYPTION_KEY\s*=.*$/m;
  return pattern.test(source) ? source.replace(pattern, line) : `${source}${source && !source.endsWith('\n') ? '\n' : ''}${line}\n`;
}
