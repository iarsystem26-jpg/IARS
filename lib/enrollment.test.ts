import { describe, expect, it } from 'vitest';
import { validStudentId } from './enrollment';
import { MEMBER_CSV_COLUMNS, parseMemberCsv, validateMemberCsvRows } from './memberCsv';

describe('student ID format', () => {
  it.each(['2025-00046A', '2026-12345z', ' 2024-00000B '])('accepts %s', value => {
    expect(validStudentId(value)).toBe(true);
  });
  it.each(['2025-00046', '2025-00046AB', '2025-000461', '2025-0046A', '2025-000046A', '25-00046A', '202500046A', '2025-00046!', '2025-00046A\nextra', ''])('rejects %s', value => {
    expect(validStudentId(value)).toBe(false);
  });
  it('blocks numeric-only IDs in imports and accepts the corrected letter suffix', () => {
    const rows = parseMemberCsv(`${MEMBER_CSV_COLUMNS.join(',')}\r\nStudent,student@example.edu,student,2025-00046,student,,,,`);
    expect(validateMemberCsvRows(rows).rows[0].errors.student_id).toContain('YYYY-XXXXXL');
    rows[0].student_id += 'A';
    expect(validateMemberCsvRows(rows).valid).toBe(true);
  });
});
