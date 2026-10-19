export const STUDENT_ID_ERROR = 'Use Student ID format YYYY-XXXXXL: four year digits, five numbers, and one letter (for example 2025-00046A).';
export const validStudentId = (value: string) => /^[0-9]{4}-[0-9]{5}[a-zA-Z]$/.test(value.trim());
export const validEmergencyPhone = (value: string) => /^(09[0-9]{9}|\+639[0-9]{9})$/.test(value.replace(/[\s()-]/g, ''));
export function enrollmentUsername(username: string, studentId: string) {
  return username.trim().toLowerCase() || (studentId.trim() ? `student_${studentId.trim().replace(/[^a-zA-Z0-9_.-]/g, '_')}`.toLowerCase().slice(0, 100) : '');
}
