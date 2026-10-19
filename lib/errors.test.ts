import { describe, expect, it } from 'vitest';
import { classifyError, errorCatalog, errorMessage } from './errors';

describe('error catalog', () => {
  it('keeps every code unique and every entry readable', () => {
    expect(new Set(errorCatalog.map(entry => entry.code)).size).toBe(errorCatalog.length);
    for (const entry of errorCatalog) {
      expect(entry.message.length).toBeGreaterThan(7);
      expect(entry.message).not.toMatch(/\{value\}|the selected value|TEST FAILED:/);
      expect(['user', 'school', 'developer', 'unknown']).toContain(entry.owner);
    }
  });
  it('marks confirmed deployment faults as developer work', () => {
    expect(classifyError({ code: 'PGRST202', status: 404 })).toMatchObject({ code: 'SYS-002', owner: 'developer' });
    expect(classifyError({ code: '42703', status: 400 })).toMatchObject({ code: 'SYS-003', owner: 'developer' });
  });
  it('does not tell users that network or access failures require a developer', () => {
    expect(classifyError(new TypeError('Failed to fetch')).owner).toBe('user');
    expect(classifyError({ code: '42501' }).owner).toBe('school');
  });
  it('preserves an exact business rule instead of guessing from the word reason', () => {
    const error = classifyError('Enter all billing details and a positive outstanding balance.');
    expect(error.message).toContain('positive outstanding balance');
    expect(error.code).not.toBe('ATT-005');
  });
  it('keeps unknown causes neutral with a stable reference and hides server internals', () => {
    const error = { message: 'secret database payload at https://private-host/internal', status: 500 };
    const result = classifyError(error);
    expect(result.owner).toBe('unknown');
    expect(result.reference).toMatch(/^REF-/);
    expect(result).toEqual(classifyError(error));
    expect(result.message).not.toContain('private-host');
    expect(result.message).not.toContain('secret');
  });
  it('preserves ownership and reference through inline string formatting', () => {
    const result = classifyError({ message: 'unrecognized cause' });
    expect(classifyError(errorMessage({ message: 'unrecognized cause' }))).toEqual(result);
    expect(classifyError(errorMessage({ code: 'PGRST202' })).owner).toBe('developer');
  });
  it('can log circular errors without failing while serializing them', () => {
    const error: { message: string; cause?: unknown } = { message: 'Failed to fetch' }; error.cause = error;
    expect(classifyError(error).code).toBe('NET-001');
  });
  it('explains dynamic confirmation prompts without publishing server substitutions', () => {
    const result = classifyError('Type “Example School” exactly to confirm what you are freezing.');
    expect(result.message).toBe('Type the target name exactly as it appears in the confirmation dialog.');
    expect(result.message).not.toContain('Example School');
    expect(result.code).not.toBe('SYS-001');
  });
});
