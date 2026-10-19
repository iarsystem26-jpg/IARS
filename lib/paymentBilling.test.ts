import { expect, it } from 'vitest';
import { paymentSummary, manilaDateInput } from './paymentBilling';
import { parseManilaDateTime } from './dateTime';
import type { PaymentInfo } from '../types';
const bill: PaymentInfo = { accountName: 'RMC', schoolId: 'RMC', billingCycle: '2026–2027', amountDue: 2500, currency: 'PHP', dueDate: parseManilaDateTime('2026-10-09'), status: 'unpaid', reminders: [] };
it('does not label missing billing details or a missing date overdue', () => {
  expect(paymentSummary({ ...bill, dueDate: 0 }).status).toBe('not_configured');
  expect(paymentSummary({ ...bill, dueDate: 0 }).dueDetail).toBe('Set a billing due date');
});
it('keeps a bill due today until midnight in Manila, then marks it overdue', () => {
  expect(paymentSummary(bill, parseManilaDateTime('2026-10-09T23:59')).dueDetail).toBe('Due today');
  expect(paymentSummary(bill, parseManilaDateTime('2026-10-10')).status).toBe('overdue');
  expect(manilaDateInput(Date.parse('2026-10-08T16:00:00Z'))).toBe('2026-10-09');
});
it('calculates the seven day warning and keeps cleared bills paid after the due date', () => {
  expect(paymentSummary(bill, parseManilaDateTime('2026-10-02')).status).toBe('due_soon');
  expect(paymentSummary(bill, parseManilaDateTime('2026-10-01')).status).toBe('unpaid');
  expect(paymentSummary({ ...bill, status: 'paid', amountDue: 0 }, parseManilaDateTime('2026-10-20')).status).toBe('paid');
  expect(paymentSummary({ ...bill, status: 'paid' }, parseManilaDateTime('2026-10-20')).status).toBe('overdue');
});
