import { describe, expect, it } from 'vitest';
import { accessibleColor, contrast, paletteVariables, suggestLogoColors, validateInstitutionSetup, type InstitutionSetup } from './institutionBranding';
const setup: InstitutionSetup = { slug: 'north-academy', name: 'North Academy', shortName: 'NA', legalName: 'North Academy Inc.', address: 'Davao City', supportEmail: 'support@example.com', privacyEmail: 'privacy@example.com', adminName: 'Owner', adminEmail: 'owner@example.com', adminUsername: 'owner', logoUrl: '', primaryColor: '#ffffee', accentColor: '#000022', theme: 'custom', appearance: 'system' };
const hex = (value: string) => '#' + value.split(' ').map(v => Number(v).toString(16).padStart(2, '0')).join('');
describe('institution branding', () => {
  it('handles pale, dark, and neutral logo colors with readable dashboard actions', () => {
    for (const primary of ['#ffffee','#000000','#ffffff','#123456','#ff00ff','#0066ff']) {
      const vars = paletteVariables(primary, setup.accentColor);
      expect(contrast(accessibleColor(primary), '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex(vars['--palette-brand-900']), '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex(vars['--palette-gold-400']), vars['--color-on-accent'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex(vars['--palette-gold-500']), hex(vars['--palette-brand-950']))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('ignores transparency and background colors and suggests distinct colors by frequency', () => {
    expect(suggestLogoColors([255,255,255,255, 0,0,0,255, 255,0,0,0, 20,80,160,255, 22,82,162,255, 180,40,20,255]))
      .toEqual(['#1551a1','#b42814']);
  });
  it('validates contacts, stable identifiers, and administrators', () => {
    expect(() => validateInstitutionSetup(setup)).not.toThrow();
    for (const change of [{ slug: '../other' }, { privacyEmail: '' }, { adminUsername: 'not valid' }, { name: '' }, { primaryColor: 'url(x)' }]) expect(() => validateInstitutionSetup({ ...setup, ...change })).toThrow();
  });
});
