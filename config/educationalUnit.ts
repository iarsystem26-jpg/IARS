/** Public build-time configuration. Each unit is deployed on its own origin and Supabase project. */
export function educationalUnitConfig(env: Record<string, string | undefined>) {
  const text = (key: string, fallback = '') => env[key]?.trim() || fallback;
  const color = (key: string, fallback: string) => {
    const value = text(key, fallback);
    if (!/^#[\da-f]{6}$/i.test(value)) throw new Error(`${key} must be a six-digit hex color.`);
    return value;
  };
  const asset = (key: string, fallback: string) => {
    const value = text(key, fallback);
    // Same-origin assets work offline and can be rendered into IDs and reports.
    if (!/^\/(?!\/)[\w./-]+\.png$/.test(value) || value.includes('..')) throw new Error(`${key} must be an absolute same-origin PNG path.`);
    return value;
  };
  const id = text('VITE_EDUCATIONAL_UNIT_ID', 'iars');
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) throw new Error('VITE_EDUCATIONAL_UNIT_ID must be a lowercase slug.');
  const name = text('VITE_INSTITUTION_NAME', text('VITE_CAMPUS_NAME'));
  const shortName = text('VITE_INSTITUTION_SHORT_NAME', name ? name.slice(0, 20) : 'IARS');
  return {
    id, name, shortName,
    displayName: name || 'Institution Attendance & Records System',
    appName: name ? `IARS · ${name}` : 'Institution Attendance & Records System (IARS)',
    logoUrl: asset('VITE_INSTITUTION_LOGO', '/iars-icon.png'),
    wordmarkUrl: '/iars-wordmark.png',
    primaryColor: color('VITE_INSTITUTION_PRIMARY_COLOR', '#0066ff'),
    accentColor: color('VITE_INSTITUTION_ACCENT_COLOR', '#00b88a'),
    pwaIcon192: asset('VITE_PWA_ICON_192', '/icons/pwa-192.png'),
    pwaIcon512: asset('VITE_PWA_ICON_512', '/icons/pwa-512.png'),
    pwaMaskable: asset('VITE_PWA_MASKABLE_ICON', '/icons/pwa-maskable-512.png'),
    appleIcon: asset('VITE_APPLE_TOUCH_ICON', '/icons/apple-touch-icon.png'),
  };
}
