import { describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: {} }));
import { groupDiagnostics, sanitizeDiagnostic, triageDiagnostic, type Diagnostic } from './diagnostics';
import { readableAction } from './healthAnalytics';
const report = (id: string, message: string, reporter = 'user-1'): Diagnostic => ({ id, message, reporter_id: reporter, details: message, source: 'console.error', route: '#/student/records', occurred_at: '2026-10-09T04:00:00Z', occurrences: 1 });
describe('diagnostic triage', () => {
  it('puts crashes and unavailable server features ahead of input errors', () => {
    const result = groupDiagnostics([report('a', 'Invalid input'), report('b', 'PGRST202'), report('c', '[App] uncaught error TypeError')]);
    expect(result.map(row => row.priority)).toEqual(['Critical', 'High', 'Low']);
    expect(triageDiagnostic('attendance.offline_prepare').priority).toBe('Medium');
    expect(readableAction('attendance.offline_prepare')).toBe('Offline attendance roster prepared');
  });
  it('combines repeated reports and counts distinct affected accounts', () => {
    const result = groupDiagnostics([report('a', 'Network failed'), { ...report('b', 'Network failed'), occurrences: 3 }, report('c', 'Network failed', 'user-2')]);
    expect(result).toHaveLength(1); expect(result[0].occurrences).toBe(5); expect(result[0].users.size).toBe(2);
  });
  it('uses affected users to break priority ties and keeps different screens separate', () => {
    const result = groupDiagnostics([report('a', 'Network A'), report('b', 'Network B'), report('c', 'Network B', 'user-2'), { ...report('d', 'Network B'), route: '#/admin/controls' }]);
    expect(result).toHaveLength(3); expect(result[0].message).toBe('Network B'); expect(result[0].users.size).toBe(2);
  });
  it('redacts credentials, email addresses and URL query values', () => {
    const result = sanitizeDiagnostic('Bearer abc123 token=private password=secret user@example.edu https://example.test/?key=xyz&code=private eyJabc.def.ghi');
    for (const secret of ['abc123', 'private', 'secret', 'user@example.edu', 'xyz', 'eyJabc.def.ghi']) expect(result).not.toContain(secret);
    expect(result).toContain('[redacted]'); expect(sanitizeDiagnostic('x'.repeat(7000))).toHaveLength(6000);
  });
  it('does not confuse timestamps or fetch TypeErrors with server outages or crashes', () => {
    expect(triageDiagnostic('verify-health-1791522285117 network request failed').priority).toBe('Medium');
    expect(triageDiagnostic('TypeError: Failed to fetch').priority).toBe('Medium');
    expect(triageDiagnostic('errorStatus: 503').priority).toBe('High');
  });
});
