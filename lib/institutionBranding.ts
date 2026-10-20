export type InstitutionAppearance = 'system' | 'light' | 'dark';
export type InstitutionTheme = 'standard' | 'logo' | 'custom';
export interface InstitutionBranding {
  name: string;
  shortName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  theme: InstitutionTheme;
  appearance: InstitutionAppearance;
}
export interface InstitutionSetup extends InstitutionBranding {
  slug: string;
  legalName: string;
  address: string;
  supportEmail: string;
  privacyEmail: string;
  adminName: string;
  adminEmail: string;
  adminUsername: string;
}
export const standardColors = { primaryColor: '#0066ff', accentColor: '#00b88a' };
export const hexColor = /^#[\da-f]{6}$/i;
export const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = (values: number[]) => '#' + values.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export function contrast(a: string, b: string) {
  const luminance = (hex: string) => rgb(hex).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
/** Keep white button labels readable, including very pale logo colors. */
export function accessibleColor(color: string) {
  if (!hexColor.test(color)) throw new Error('Choose a six-digit hex color.');
  let values = rgb(color);
  while (contrast(toHex(values), '#ffffff') < 4.5) values = values.map(v => v * .94);
  return toHex(values);
}
export function paletteVariables(primary: string, accent: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [family, raw] of [['brand', primary], ['gold', accent], ['emerald', accent]]) {
    let base = rgb(accessibleColor(raw));
    if (family === 'gold') {
      base = rgb(raw);
      while (contrast(toHex(base), '#172033') < 5.5) base = base.map(v => v + (255 - v) * .08);
    }
    for (const [shade, white, black] of [[50,.96,0],[100,.9,0],[200,.75,0],[300,.55,0],[400,.28,0],[500,0,0],[600,0,.16],[700,0,.34],[800,0,.52],[900,0,.68],[950,0,.8]]) {
      const shadeBase = family === 'gold' && shade >= 600 ? rgb(accessibleColor(raw)) : base;
      result[`--palette-${family}-${shade}`] = shadeBase.map(v => Math.round(v * (1 - white) * (1 - black) + 255 * white)).join(' ');
    }
  }
  result['--color-on-accent'] = '#172033';
  return result;
}
export function themeColors(branding: Pick<InstitutionBranding, 'theme' | 'primaryColor' | 'accentColor'>) {
  return branding.theme === 'standard' ? standardColors : branding;
}
/** Quantized color clusters, ignoring transparent pixels and near-white/black backgrounds. */
export function suggestLogoColors(pixels: ArrayLike<number>): string[] {
  const clusters = new Map<string, { count: number; sum: number[] }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const values = [pixels[i], pixels[i + 1], pixels[i + 2]];
    if (pixels[i + 3] < 180 || Math.min(...values) > 235 || Math.max(...values) < 22) continue;
    const key = values.map(v => Math.floor(v / 32)).join(',');
    const cluster = clusters.get(key) || { count: 0, sum: [0, 0, 0] };
    cluster.count++; cluster.sum = cluster.sum.map((v, j) => v + values[j]); clusters.set(key, cluster);
  }
  const colors: string[] = [];
  const values = [...clusters.values()];
  const chroma = (cluster: { count: number; sum: number[] }) => (Math.max(...cluster.sum) - Math.min(...cluster.sum)) / cluster.count;
  const colored = values.filter(cluster => chroma(cluster) >= 40);
  for (const cluster of (colored.length ? colored : values).sort((a, b) => b.count - a.count)) {
    const color = toHex(cluster.sum.map(v => v / cluster.count));
    if (colors.every(other => rgb(other).reduce((s, v, i) => s + (v - rgb(color)[i]) ** 2, 0) > 3600)) colors.push(color);
    if (colors.length === 5) break;
  }
  return colors;
}
export async function colorsFromLogo(url: string): Promise<string[]> {
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Your browser cannot suggest logo colors. Choose colors manually.');
  context.drawImage(image, 0, 0, 64, 64);
  return suggestLogoColors(context.getImageData(0, 0, 64, 64).data);
}
export function validateInstitutionSetup(value: InstitutionSetup) {
  const fields: Array<[keyof InstitutionSetup, string]> = [['name','Institution name'],['shortName','Short name'],['legalName','Legal name'],['address','Address'],['adminName','Administrator name']];
  for (const [key, label] of fields) if (!value[key]?.trim() || value[key].length > 200) throw new Error(`${label} is required (up to 200 characters).`);
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(value.slug)) throw new Error('Institution ID must be 3–64 lowercase letters, numbers, or hyphens.');
  for (const key of ['supportEmail','privacyEmail','adminEmail'] as const) if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value[key]) || value[key].length > 254) throw new Error(`Enter a valid ${key.replace('Email', '')} email.`);
  if (!/^[a-z0-9_.-]{3,100}$/.test(value.adminUsername)) throw new Error('Administrator username must be 3–100 lowercase letters, numbers, periods, underscores, or hyphens.');
  if (!hexColor.test(value.primaryColor) || !hexColor.test(value.accentColor)) throw new Error('Choose valid theme colors.');
  if (!['standard','logo','custom'].includes(value.theme) || !['system','light','dark'].includes(value.appearance)) throw new Error('Choose a valid theme and appearance.');
}
