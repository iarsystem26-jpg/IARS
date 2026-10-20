import { educationalUnitConfig } from '../config/educationalUnit';
import { runtimeBackend, runtimeInstitution } from './institutionRuntime';
import { paletteVariables, themeColors } from './institutionBranding';

export const educationalUnit = educationalUnitConfig(import.meta.env);
// Include the complete backend identity: a reused unit slug cannot reuse another project's session or offline data.
export let unitStoragePrefix = `iars:${educationalUnit.id}:${encodeURIComponent(runtimeBackend.url || 'unconfigured')}:`;
export const unitStorageKey = (key: string) => `${unitStoragePrefix}${key}`;

export function applyEducationalUnitBranding() {
  if (runtimeInstitution) {
    const colors = themeColors(runtimeInstitution);
    Object.assign(educationalUnit, runtimeInstitution, colors, {
      id: runtimeInstitution.slug, displayName: runtimeInstitution.name,
      appName: `IARS · ${runtimeInstitution.name}`,
    });
    unitStoragePrefix = `iars:${educationalUnit.id}:${encodeURIComponent(runtimeBackend.url)}:`;
  }
  document.title = educationalUnit.appName;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', educationalUnit.primaryColor);
  const root = document.documentElement;
  const palette = (family: string, color: string) => {
    const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
    for (const [shade, white, black] of [[50,.96,0],[100,.9,0],[200,.75,0],[300,.55,0],[400,.28,0],[500,0,0],[600,0,.16],[700,0,.34],[800,0,.52],[900,0,.68],[950,0,.8]]) {
      root.style.setProperty(`--palette-${family}-${shade}`, rgb.map(value => Math.round(value * (1 - white) * (1 - black) + 255 * white)).join(' '));
    }
  };
  palette('brand', educationalUnit.primaryColor);
  palette('gold', educationalUnit.accentColor);
  palette('emerald', educationalUnit.accentColor);
  if (runtimeInstitution) {
    root.classList.add('institution-branded');
    for (const [key, value] of Object.entries(paletteVariables(educationalUnit.primaryColor, educationalUnit.accentColor))) root.style.setProperty(key, value);
  }
}
