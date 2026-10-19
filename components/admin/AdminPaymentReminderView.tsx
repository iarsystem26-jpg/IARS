import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { formatManilaDate, formatManilaDateTime, parseManilaDateTime } from '../../lib/dateTime';
import { SelectField } from '../ui/SelectField';
import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, BellRing, Calendar, Send, CheckCircle2, Clock, AlertTriangle, ShieldCheck, DollarSign, History } from 'lucide-react';
import { appData } from '../../lib/backend';
import { manilaDateInput, paymentAmount, paymentSummary } from '../../lib/paymentBilling';
import { classifyError } from '../../lib/toast';
import { PaymentInfo, PaymentReminderLog } from '../../types';
import { MetricCard } from '../ui/Page';
import { Modal } from '../ui/Modal';

export const AdminPaymentReminderView: React.FC<{ actorName?: string }> = ({ actorName }) => {
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>(appData.getPaymentInfo());
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  const [reminderData, setReminderData] = useState({ recipientEmail: '', subject: '', urgency: 'normal' as PaymentReminderLog['urgency'], message: '' });

  const [newStatus, setNewStatus] = useState<'paid' | 'unpaid'>('unpaid');
  const [newAmount, setNewAmount] = useState('');
  const [billing, setBilling] = useState({ accountName: '', schoolId: '', billingCycle: '', dueDate: '', paymentDate: '' });
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [now, setNow] = useState(Date.now());
  const summary = paymentSummary(paymentInfo, now);
  const canPost = summary.configured && summary.status !== 'paid' && paymentInfo.amountDue > 0;
  const refreshData = () => { setPaymentInfo(appData.getPaymentInfo()); setNow(Date.now()); };
  useEffect(() => {
    refreshData();
    window.addEventListener('rmc_data_update', refreshData);
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => { window.removeEventListener('rmc_data_update', refreshData); window.clearInterval(timer); };
  }, []);
  const openBilling = () => {
    setNewStatus(paymentInfo.status === 'paid' && paymentInfo.amountDue === 0 ? 'paid' : 'unpaid');
    setNewAmount(String(paymentInfo.amountDue));
    setBilling({ accountName: paymentInfo.accountName || '', schoolId: paymentInfo.schoolId || '', billingCycle: paymentInfo.billingCycle || '', dueDate: manilaDateInput(paymentInfo.dueDate), paymentDate: manilaDateInput(paymentInfo.lastPaymentDate || Date.now()) });
    setError(''); setFeedback(''); setShowStatusModal(true);
  };
  const openReminder = () => {
    if (!canPost) return;
    setReminderData({ recipientEmail: '', subject: `Subscription payment reminder: ${paymentInfo.billingCycle}`, urgency: summary.status === 'overdue' ? 'urgent' : 'normal',
      message: `Dear OSSA team,\n\nThe outstanding subscription balance for ${paymentInfo.accountName} (${paymentInfo.schoolId}) is ${paymentAmount(paymentInfo)} for ${paymentInfo.billingCycle}. Payment is due on ${formatManilaDate(paymentInfo.dueDate)}.\n\nPlease coordinate payment and provide confirmation to System Administration.\n\nThank you,\n${actorName || 'System Administration'}` });
    setError(''); setFeedback(''); setShowReminderModal(true);
  };
  const handleSendReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    if (!canPost || !reminderData.subject.trim() || !reminderData.message.trim()) { setError('Configure an outstanding bill and enter a subject and message.'); return; }
    busy.current = true; setSaving(true); setError('');
    try {
      const result: PaymentReminderLog = await appData.sendPaymentReminderToOSAS({ subject: reminderData.subject.trim(), message: reminderData.message.trim(), urgency: reminderData.urgency, recipientEmail: '', actorName: actorName || 'System Admin' });
      const latest = appData.getPaymentInfo();
      setPaymentInfo(result && !latest.reminders.some(item => item.id === result.id) ? { ...latest, reminders: [result, ...latest.reminders] } : latest);
      setShowReminderModal(false); setFeedback('Payment notice posted to the OSSA Hub.');
    } catch (failure) { setError(errorMessage(classifyError(failure))); }
    finally { busy.current = false; setSaving(false); }
  };
  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const amount = newStatus === 'paid' ? 0 : Number(newAmount);
    const dueDate = parseManilaDateTime(billing.dueDate);
    const paymentDate = parseManilaDateTime(billing.paymentDate);
    if (!billing.accountName.trim() || !billing.schoolId.trim() || !billing.billingCycle.trim() || !Number.isFinite(dueDate) || !Number.isFinite(amount) || (newStatus !== 'paid' && (newAmount.trim() === '' || amount <= 0))) { setError('Enter all billing details and a positive outstanding balance.'); return; }
    if (newStatus === 'paid' && (!Number.isFinite(paymentDate) || paymentDate > parseManilaDateTime(manilaDateInput(Date.now())))) { setError('Enter a payment date that is today or earlier.'); return; }
    const updated: Partial<PaymentInfo> = { accountName: billing.accountName.trim(), schoolId: billing.schoolId.trim(), billingCycle: billing.billingCycle.trim(), dueDate, currency: 'PHP', amountDue: Math.round(amount * 100) / 100, status: newStatus,
      ...(newStatus === 'paid' ? { lastPaymentDate: paymentDate } : {}) };
    if (newStatus !== 'paid') updated.status = paymentSummary({ ...paymentInfo, ...updated }).status as PaymentInfo['status'];
    busy.current = true; setSaving(true); setError('');
    try {
      const result = await appData.updatePaymentInfo(updated);
      setPaymentInfo(result || { ...appData.getPaymentInfo(), ...updated });
      setShowStatusModal(false); setFeedback('Billing details saved.');
    } catch (failure) { setError(errorMessage(classifyError(failure))); }
    finally { busy.current = false; setSaving(false); }
  };
  const statusBadge = {
    not_configured: { bg: 'bg-slate-600', label: 'BILLING NOT CONFIGURED', icon: Clock },
    paid: { bg: 'bg-emerald-600', label: 'PAID', icon: CheckCircle2 },
    due_soon: { bg: 'bg-amber-600', label: 'PAYMENT DUE SOON', icon: Clock },
    overdue: { bg: 'bg-red-600', label: 'PAYMENT OVERDUE', icon: AlertTriangle },
    unpaid: { bg: 'bg-amber-700', label: 'UNPAID', icon: AlertTriangle },
  }[summary.status];

  const StatusIcon = statusBadge.icon;

  return (
    <div className="space-y-6 animate-in fade-in duration-fast">
      {/* HERO BANNER */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl shrink-0">
              <CreditCard className="w-8 h-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold uppercase tracking-tight">School Subscription Billing</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white flex items-center gap-1 ${statusBadge.bg}`}>
                  <StatusIcon size={12} /> {statusBadge.label}
                </span>
              </div>
              <p className="text-slate-300 text-xs mt-1 max-w-2xl">
                Maintain the school bill, record settlement, and post payment reminders to the OSSA Hub.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={openBilling}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition"
            >
              <DollarSign size={14} /> {summary.configured ? 'Edit Billing / Record Payment' : 'Set Up Billing'}
            </button>
            <button
              disabled={!canPost} onClick={openReminder}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-brand-950 text-xs font-black uppercase tracking-wider flex items-center gap-2 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <BellRing size={14} /> Post OSSA Notice
            </button>
          </div>
        </div>
      </div>
      {feedback && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{feedback}</p>}
      {!summary.configured && <p className="text-sm text-slate-600 dark:text-slate-300">Set up the school account, billing period, amount, and due date to enable reminders.</p>}
      {summary.status === 'paid' && <p className="text-sm text-emerald-700 dark:text-emerald-300">This bill is settled{paymentInfo.lastPaymentDate ? ` as of ${formatManilaDate(paymentInfo.lastPaymentDate)}` : ''}. Edit billing to begin the next billing period.</p>}
      {/* BILLING METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={<DollarSign size={20} className="text-emerald-500" />}
          label="Outstanding Balance"
          value={summary.configured ? paymentAmount(paymentInfo) : 'Not configured'}
          detail={paymentInfo.billingCycle || 'Set a billing period'}
        />
        <MetricCard
          icon={<Calendar size={20} className="text-amber-500" />}
          label="Due Date"
          value={paymentInfo.dueDate ? formatManilaDate(paymentInfo.dueDate) : 'Not configured'}
          detail={summary.dueDetail}
        />
        <MetricCard
          icon={<BellRing size={20} className="text-cyan-500" />}
          label="Notices Posted"
          value={paymentInfo.reminders.length}
          detail="In-app notices for OSSA"
        />
        <MetricCard
          icon={<ShieldCheck size={20} className="text-purple-500" />}
          label="Account Name"
          value={paymentInfo.accountName || 'Not configured'}
          detail={paymentInfo.schoolId ? `School ID: ${paymentInfo.schoolId}` : 'Set the school ID'}
        />
      </div>

      {/* REMINDER HISTORY TABLE */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <History size={18} className="text-amber-500" /> Payment Notice History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Notices appear in the OSSA Hub. This workflow does not send email or automatically freeze accounts.
            </p>
          </div>

          <button
            disabled={!canPost} onClick={openReminder}
            className="px-3.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-bold uppercase tracking-wider hover:bg-amber-100 flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} /> Post Reminder
          </button>
        </div>

        <div className="space-y-3">
          {paymentInfo.reminders.length > 0 ? (
            [...paymentInfo.reminders].sort((a, b) => b.sentAt - a.sentAt).map(rem => (
              <div
                key={rem.id}
                className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2"
              >
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      rem.urgency === 'critical' ? 'bg-red-500 text-white' : rem.urgency === 'urgent' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                    }`}>
                      {rem.urgency}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">{rem.subject}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Posted: {formatManilaDateTime(rem.sentAt)}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700 font-mono text-[11px]">
                  {rem.message}
                </p>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
                  <span>To: <strong className="text-slate-700 dark:text-slate-200">OSSA team</strong> · Posted by {rem.sentBy || 'System Admin'}{rem.recipientEmail ? ` · Recipient reference: ${rem.recipientEmail}` : ''}</span>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                    <CheckCircle2 size={12} /> {rem.status === 'in_app' ? 'Posted in app' : 'Legacy notice'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              No payment notices posted yet. Click &quot;Post OSSA Notice&quot; to notify the OSSA team in the OSSA Hub.
            </div>
          )}
        </div>
      </div>
      {/* REMINDER MODAL */}
      <Modal
        open={showReminderModal}
        onClose={() => { if (!busy.current) setShowReminderModal(false); }}
        title="Post OSSA Payment Notice"
        description="Visible to the OSSA team in the OSSA Hub."
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              disabled={saving} onClick={() => setShowReminderModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 uppercase"
            >
              Cancel
            </button>
            <button
              disabled={saving} type="submit"
              form="reminder-form"
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-amber-500 hover:bg-amber-600 text-brand-950 shadow-md flex items-center gap-1.5"
            >
              <Send size={14} /> {saving ? 'Posting...' : 'Post Notice'}
            </button>
          </div>
        }
      >
        <form id="reminder-form" onSubmit={handleSendReminder} className="space-y-3">
          <fieldset disabled={saving} className="space-y-3">
          {error && <ErrorNotice error={error} operation="Admin Payment Reminder View"></ErrorNotice>}
          <p className="text-sm text-slate-500">To: OSSA team ? Posted in app</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Urgency Level</label>
              <SelectField disabled={saving} aria-label="Urgency Level"
                value={reminderData.urgency}
                onChange={(e) => setReminderData(prev => ({ ...prev, urgency: e as PaymentReminderLog['urgency'] }))}
                className="mt-1 min-w-0"
              >
                <option value="normal">Normal Reminder</option>
                <option value="urgent">Urgent Notice</option>
                <option value="critical">Critical Notice</option>
              </SelectField>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Due Balance</label>
              <input
                type="text"
                disabled
                value={`${paymentInfo.currency} ${paymentInfo.amountDue.toLocaleString()}`}
                className="app-control w-full h-10 px-3 mt-1 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400"
              />
            </div>
          </div>

          <div>
            <label htmlFor="payment-notice-subject" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Subject Line</label>
            <input
              id="payment-notice-subject"
              maxLength={200}
              type="text"
              required
              value={reminderData.subject}
              onChange={(e) => setReminderData(prev => ({ ...prev, subject: e.target.value }))}
              className="app-control w-full h-10 px-3 mt-1 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          <div>
            <label htmlFor="payment-notice-message" className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Message Body</label>
            <textarea
              id="payment-notice-message"
              maxLength={5000}
              required
              rows={5}
              value={reminderData.message}
              onChange={(e) => setReminderData(prev => ({ ...prev, message: e.target.value }))}
              className="app-control w-full p-3 mt-1 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
            />
          </div>
          </fieldset>
        </form>
      </Modal>
      {/* UPDATE STATUS MODAL */}
      <Modal
        open={showStatusModal}
        onClose={() => { if (!busy.current) setShowStatusModal(false); }}
        title="School Billing Details"
        description="Due soon and overdue are calculated from the due date in Manila time."
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              disabled={saving} onClick={() => setShowStatusModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 uppercase"
            >
              Cancel
            </button>
            <button
              disabled={saving} type="submit"
              form="status-form"
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
            >
              {saving ? 'Saving...' : 'Save Billing'}
            </button>
          </div>
        }
      >
        <form id="status-form" onSubmit={handleUpdateStatus} className="space-y-3">
          {error && <ErrorNotice error={error} operation="Admin Payment Reminder View"></ErrorNotice>}
          <fieldset disabled={saving} className="space-y-3">
            {(['accountName', 'schoolId', 'billingCycle'] as const).map(field => <label key={field} className="block text-sm font-medium">
              {{ accountName: 'School account name', schoolId: 'School ID', billingCycle: 'Billing period' }[field]}
              <input required maxLength={160} value={billing[field]} onChange={e => setBilling(prev => ({ ...prev, [field]: e.target.value }))} className="app-control w-full px-3 py-2 mt-1 rounded-xl border" placeholder={field === 'billingCycle' ? 'e.g. School year 2026-2027' : undefined} />
            </label>)}
            <label className="block text-sm font-medium">Due date<input required type="date" value={billing.dueDate} onChange={e => setBilling(prev => ({ ...prev, dueDate: e.target.value }))} className="app-control w-full px-3 py-2 mt-1 rounded-xl border" /></label>
            <div className="text-sm font-medium">Payment state<SelectField aria-label="Payment state" value={newStatus} disabled={saving} onChange={e => setNewStatus(e as 'paid' | 'unpaid')}><option value="unpaid">Outstanding balance</option><option value="paid">Paid in full</option></SelectField></div>
            {newStatus === 'paid' ? <>
              <p className="text-sm text-slate-500">Saving a full payment clears the outstanding balance to PHP 0.00.</p>
              <label className="block text-sm font-medium">Payment date<input required type="date" max={manilaDateInput(Date.now())} value={billing.paymentDate} onChange={e => setBilling(prev => ({ ...prev, paymentDate: e.target.value }))} className="app-control w-full px-3 py-2 mt-1 rounded-xl border" /></label>
            </> : <label className="block text-sm font-medium">Outstanding balance (PHP)<input required type="number" min="0.01" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} className="app-control w-full px-3 py-2 mt-1 rounded-xl border" /></label>}
          </fieldset>
        </form>
      </Modal>
    </div>
  );
};
