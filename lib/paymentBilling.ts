import { parseManilaDateTime } from './dateTime';
import type { PaymentInfo } from '../types';

export const manilaDateInput = (timestamp: number) => timestamp > 0 && Number.isFinite(timestamp)
  ? new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10) : '';

export function paymentSummary(info: PaymentInfo, now = Date.now()) {
  const configured = Boolean(info.accountName?.trim() && info.schoolId?.trim() && info.billingCycle?.trim() && info.dueDate > 0);
  const today = parseManilaDateTime(manilaDateInput(now));
  const due = info.dueDate > 0 ? parseManilaDateTime(manilaDateInput(info.dueDate)) : null;
  const days = due === null ? null : Math.round((due - today) / 86400000);
  const status = !configured ? 'not_configured' : info.status === 'paid' && info.amountDue === 0 ? 'paid'
    : days !== null && days < 0 ? 'overdue' : days !== null && days <= 7 ? 'due_soon' : 'unpaid';
  const dueDetail = days === null ? 'Set a billing due date' : status === 'paid' ? 'Balance cleared'
    : days === 0 ? 'Due today' : days < 0 ? `${-days} days overdue` : `${days} days remaining`;
  return { configured, status, dueDetail };
}

export const paymentAmount = (info: Pick<PaymentInfo, 'currency' | 'amountDue'>) =>
  `${info.currency || 'PHP'} ${info.amountDue.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
