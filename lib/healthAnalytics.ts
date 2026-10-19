export function readableAction(action: string): string {
  const labels: Record<string, string> = { 'attendance.offline_prepare': 'Offline attendance roster prepared', reviewProfileRequest: 'Profile change request reviewed', reviewTransferRequest: 'Student transfer request reviewed', 'attendance.in': 'Attendance check-in recorded', 'attendance.out': 'Attendance check-out recorded', 'account.created': 'Account created', 'account.deactivated': 'Account deactivated' };
  return labels[action] || action.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]/g, ' ').replace(/^./, c => c.toUpperCase());
}
export function auditCategory(action: string): string {
  if (/attendance|scan|roster/i.test(action)) return 'Attendance';
  if (/account|profile|password|role|permission|login/i.test(action)) return 'Accounts & access';
  if (/event|excuse|transfer|application/i.test(action)) return 'Requests & events';
  return 'System';
}
