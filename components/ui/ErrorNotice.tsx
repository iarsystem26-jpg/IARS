import type { ReactNode } from 'react';
import { classifyError, errorOwnerLabels } from '../../lib/errors';
const operationLabels: Record<string, string> = {
  'Landing Page': 'Sign-in and enrollment', 'Activity Form': 'Save activity',
  'Activity Approval Queue': 'Review activity', 'Organization Approval Queue': 'Review organization request',
  'Excuse Approval Queue': 'Review excuse', 'Bulk Member Import Modal': 'Import members',
  'Sensitive Action Modal': 'Confirm action', 'Auth Challenge': 'Verify your identity',
  'Directory Node Modal': 'Academic unit', 'Organization Form': 'Organization details',
  'Node Officer Manager': 'Assign officers', 'Admin Freeze View': 'Freeze access',
  'Admin Account View': 'Manage accounts', 'Account Profile Panel': 'Account details',
  'Managed Accounts Table': 'Account access', 'Admin Homepage Video View': 'Homepage video',
  'Admin Payment Reminder View': 'School billing', 'Admin System Health View': 'System health',
  'Student Transfer Workspace': 'Transfer students', 'Clearance Certificates': 'Clearance certificates',
  'Student QR': 'My digital ID', 'Student Profile': 'My profile', 'Student Events': 'My events',
  'Student Ceremonies': 'My ceremonies', 'Profile Requests': 'Information requests',
  'Register Status': 'Enrollment status', 'Class Student Detail': 'Student record',
  'SSG Panel': 'Academic directory', 'Manage Members': 'Class members',
};

/** Shared accessible error display. Unknown errors stay neutral until diagnosed. */
export default function ErrorNotice({ error, operation, className = '', id, children }: {
  error: unknown; operation?: string; className?: string; id?: string; children?: ReactNode;
}) {
  const detail = classifyError(error);
  return <span id={id} role="alert" className={`error-notice ${className}`} data-owner={detail.owner}>
    <span className="error-notice-label">{errorOwnerLabels[detail.owner]}</span>
    {operation && <span className="error-notice-operation">{operationLabels[operation] || operation}</span>}
    <span className="error-notice-message">{detail.message}</span>
    <span className="error-notice-code">{detail.code}{detail.reference && ` · ${detail.reference}`}</span>
    {children}
  </span>;
}
