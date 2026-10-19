import { selectUploadFile } from '../lib/fileUploads';
import { errorMessage } from '../lib/errors';
import ErrorNotice from '../components/ui/ErrorNotice';
import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, FileText, GraduationCap, Info, LogOut, Maximize2, ShieldCheck, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import Button from '../components/ui/Button';
import ThemeToggle from '../components/ui/ThemeToggle';
import { appData, appAuth, uploadDocument, refreshData } from '../lib/backend';
import { supabase } from '../lib/supabase';
import { PageSkeletonForRoute } from '../components/ui/PageLoading';
import { AppLoading } from '../components/ui/Skeleton';
import { toast } from '../lib/toast';
import ProfileAvatar from '../components/ui/ProfileAvatar';
import CountdownBar from '../components/ui/CountdownBar';
import { claimApprovalNotice } from '../lib/approvalNotice';
import FrozenAccess from '../components/admin/FrozenAccess';
import { Modal } from '../components/ui/Modal';

const fieldLabels: Record<string, string> = {
  name: 'Full name', student_id: 'Student ID', guardian_name: 'Guardian name',
  guardian_phone: 'Guardian contact number', photo: 'Profile photo',
};

export default function RegisterStatus() {
  const { user, profile, loading, revision, markApprovalNoticeSeen } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ src: string; title: string; alt: string } | null>(null);
  const [approvalReady, setApprovalReady] = useState(false);
  const [approvalRetry, setApprovalRetry] = useState(0);
  const application = appData.getApplications().find(a => a.id === user?.uid);
  const frozen = appData.isUserScopeFrozen(profile);
  const [corrections, setCorrections] = useState({ name: '', student_id: '', guardian_name: '', guardian_phone: '' });
  const clarificationFields = application?.clarification_fields || [];
  const canResubmit = Boolean(application && ['rejected', 'bounced', 'deleted'].includes(application.status));
  const savedProfilePhoto = application?.documents?.photo || application?.form_data?.photo_url || '';
  const photoNeedsCorrection = application?.status === 'bounced' && clarificationFields.includes('photo');
  const schoolData = application?.form_data?.school_data;

  useEffect(() => { if (!loading && !user) navigate('/login'); }, [loading, user, navigate]);
  useEffect(() => {
    if (loading || !profile || !user || frozen) return;
    let cancelled = false;
    setApprovalReady(false);
    setError('');
    void claimApprovalNotice(user.uid).then(show => {
      if (cancelled) return;
      markApprovalNoticeSeen?.();
      if (show) setApprovalReady(true);
      else navigate('/dashboard', { replace: true });
    }).catch(() => {
      if (!cancelled) setError('Unable to save your approval notice. Reconnect and try again.');
    });
    return () => { cancelled = true; };
  }, [loading, Boolean(profile), user?.uid, navigate, approvalRetry, frozen]);
  useEffect(() => {
    if (!application) return;
    setCorrections({
      name: application.form_data.name || '',
      student_id: application.form_data.student_id || '',
      guardian_name: application.form_data.guardian?.name || '',
      guardian_phone: application.form_data.guardian?.contact || '',
    });
  }, [application?.id, application?.reviewed_at, revision]);

  if (loading) return <AppLoading label="Loading application status"><PageSkeletonForRoute pathname="/register/status" /></AppLoading>;
  if (frozen) return <main><FrozenAccess /></main>;
  if (profile && !approvalReady) return error
    ? <main className="app-surface mx-auto my-20 max-w-lg space-y-4 p-6"><ErrorNotice error={error} operation="Register Status"></ErrorNotice><Button onClick={() => setApprovalRetry(value => value + 1)}>Try again</Button><Button variant="secondary" onClick={() => void appAuth.signOut()}>Sign out</Button></main>
    : <AppLoading label="Loading account approval"><PageSkeletonForRoute pathname="/register/status" /></AppLoading>;

  const upload = async (file: File | undefined, kind: string) => {
    if (!file) return;
    setUploading(true); setError('');
    try {
      const path = await uploadDocument(file, kind);
      const { error } = await toast.result(() => supabase.rpc('rmc_admission_update', { documents: { [kind]: path } }), 'Save admission document');
      if (error) throw error;
      await refreshData();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setUploading(false); }
  };

  const resubmit = async () => {
    if (!application) return;
    setError('');
    try {
      const updated = {
        ...application.form_data,
        name: corrections.name.trim(),
        student_id: corrections.student_id.trim(),
        guardian: {
          ...application.form_data.guardian,
          name: corrections.guardian_name.trim(),
          contact: corrections.guardian_phone.trim(),
        },
      };
      await appData.submitApplication(updated, '');
      await refreshData();
    } catch (caught) { setError(errorMessage(caught)); }
  };

  const heading = profile ? 'Account approved'
    : application?.status === 'bounced' ? 'Clarification requested'
      : application?.status === 'rejected' ? 'Application rejected'
        : application?.status === 'deleted' ? 'Application deleted'
          : application ? 'Admission review pending' : 'No application found';
  const description = profile ? 'Your account is active.'
    : canResubmit ? application?.rejection_reason || 'Update your application and submit it again.'
      : 'Your school officer will review your admission details and supporting documents.';

  const statusLabel = profile ? 'Approved'
    : application?.status === 'bounced' ? 'Action needed'
      : application?.status === 'pending' ? 'Pending review'
        : application?.status === 'rejected' ? 'Rejected'
          : application?.status === 'deleted' ? 'Deleted' : 'Not submitted';
  const StatusIcon = profile ? CheckCircle2 : canResubmit ? Info : Clock3;
  const statusStyle = profile
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
    : canResubmit
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
      : 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-200';
  const details = application ? [
    ['Full name', application.form_data.name],
    ['Student ID', application.form_data.student_id],
    ['School unit', schoolData?.department || schoolData?.type],
    ['Program / track', schoolData?.program || schoolData?.track || schoolData?.strand],
    ['Level', schoolData?.level],
    ['Section', schoolData?.section],
  ] : [];

  return <div className="auth-challenge-background min-h-dvh px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
    <header className="mx-auto mb-6 flex max-w-5xl items-center justify-between gap-3 sm:mb-8">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" aria-label="View app logo" aria-haspopup="dialog" className="shrink-0 rounded-full" onClick={() => setImagePreview({ src: `${import.meta.env.BASE_URL}academic-seal-transparent.png`, title: 'App logo', alt: 'IARS Academic Seal' })}>
          <img src={`${import.meta.env.BASE_URL}academic-seal-transparent.png`} alt="IARS Academic Seal" className="h-11 w-11 rounded-full bg-white object-contain p-0.5 shadow-sm ring-2 ring-gold-400/60 sm:h-12 sm:w-12" />
        </button>
        <div className="min-w-0"><p className="text-sm font-bold text-slate-900 dark:text-slate-100">Institution Attendance &amp; Records</p><p className="text-xs text-slate-600 dark:text-slate-400">Student admission</p></div>
      </div>
      <div className="shrink-0"><ThemeToggle /></div>
    </header>
    <main className="mx-auto max-w-5xl space-y-5 [overflow-wrap:anywhere]" aria-labelledby="admission-heading">
      <section className="app-surface p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${statusStyle}`}><StatusIcon aria-hidden="true" size={25} /></span>
          <div className="min-w-0 flex-1">
            <span className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${statusStyle}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{statusLabel}</span>
            <h1 id="admission-heading" className="text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">{heading}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">{application || profile ? description : 'No admission application is linked to this account. Return to registration to complete your details.'}</p>
            {application?.status === 'pending' && !profile && <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400"><ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />You can return to this page to check your status. If a reviewer requests changes, they will appear here.</p>}
            {profile && approvalReady && <div className="mt-5"><CountdownBar seconds={8} label="Opening your dashboard" onComplete={() => navigate('/dashboard', { replace: true })} /></div>}
          </div>
        </div>
      </section>

      {application && <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <section className="app-surface p-5 sm:p-6" aria-labelledby="application-details-heading">
            <div className="mb-5 flex items-center gap-2.5"><GraduationCap size={20} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" /><h2 id="application-details-heading" className="text-base font-bold">Application details</h2></div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
              {details.map(([label, value]) => <div key={label} className="min-w-0 border-t border-slate-200 pt-3 dark:border-slate-700"><dt className="text-xs font-semibold text-slate-600 dark:text-slate-400">{label}</dt><dd className="mt-1.5 font-semibold leading-relaxed text-slate-900 dark:text-slate-100">{value || '—'}</dd></div>)}
            </dl>
          </section>
          {['bounced', 'rejected'].includes(application.status) && <section className="app-surface space-y-4 p-5 sm:p-6" aria-labelledby="corrections-heading">
            <div><h2 id="corrections-heading" className="flex items-center gap-2 text-base font-bold"><Info aria-hidden="true" size={20} className="shrink-0 text-amber-600 dark:text-amber-400" />Update your application</h2><p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Review your details, make corrections, and submit the application again.</p></div>
            {(application.status === 'rejected' ? Object.keys(corrections) : clarificationFields.filter(field => field in corrections)).map(field => <label className="block text-sm font-semibold" key={field}>{fieldLabels[field]}
              <input className="app-control mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900" placeholder={field === 'student_id' ? 'YYYY-XXXXXL' : undefined} value={corrections[field as keyof typeof corrections]} onChange={event => setCorrections(current => ({ ...current, [field]: event.target.value }))} />
            </label>)}
          </section>}
        </div>

        {application.status !== 'approved' && <section className="app-surface min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby="admission-documents-heading">
          <div><div className="flex items-center gap-2.5"><FileText size={20} className="shrink-0 text-brand-600 dark:text-brand-300" aria-hidden="true" /><h2 id="admission-documents-heading" className="text-base font-bold">{application.status === 'bounced' ? 'Requested documents' : 'Admission documents'}</h2></div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">Profile photo is required.</p>
          </div>
          {([['photo', 'Profile photo']] as const)
            .map(([kind, label]) => <div key={kind} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
              {kind === 'photo' && savedProfilePhoto && !photoNeedsCorrection ? <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Submitted profile photo</p><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 aria-hidden="true" size={14} />Uploaded</span></div>
                <button type="button" aria-label="View submitted profile photo" aria-haspopup="dialog" className="group relative block rounded-xl" onClick={() => setImagePreview({ src: savedProfilePhoto, title: 'Submitted profile photo', alt: 'Full submitted profile photo' })}>
                  <ProfileAvatar src={savedProfilePhoto} alt="Submitted profile" className="h-28 w-28 rounded-xl border border-slate-200 object-cover dark:border-slate-700" />
                  <span className="absolute bottom-2 right-2 rounded-lg bg-slate-950/70 p-1.5 text-white transition-colors group-hover:bg-brand-700"><Maximize2 size={16} aria-hidden="true" /></span>
                </button>
                <button type="button" aria-haspopup="dialog" onClick={() => setImagePreview({ src: savedProfilePhoto, title: 'Submitted profile photo', alt: 'Full submitted profile photo' })} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 underline underline-offset-4 dark:text-brand-300">Open submitted photo</button>
              </div> : <label className="block min-w-0">
                <span className="flex items-center gap-2 font-semibold"><UploadCloud size={18} className="shrink-0 text-slate-500" aria-hidden="true" />{photoNeedsCorrection ? 'Replace profile photo' : label}</span>
                <span className="mt-2 block text-xs leading-relaxed text-slate-600 dark:text-slate-400">{kind === 'photo' ? 'JPG, PNG or WebP' : 'JPG, PNG, WebP or PDF'}</span>
                <input className="mt-3 block min-h-11 w-full min-w-0 max-w-full rounded-lg text-xs text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-100 file:px-3 file:py-3 file:font-semibold file:text-brand-800 disabled:opacity-60 dark:text-slate-300 dark:file:bg-brand-900 dark:file:text-brand-100" type="file" aria-label={photoNeedsCorrection && kind === 'photo' ? 'Replace profile photo' : label} accept={kind === 'photo' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} disabled={uploading} onChange={event => void upload(selectUploadFile(event.currentTarget), kind)} />
              </label>}
            </div>)}
        </section>}
      </div>}
      {error && <ErrorNotice error={error} operation="Register Status" />}
      {uploading && <p role="status" className="text-sm font-semibold text-brand-700 dark:text-brand-300">Uploading…</p>}
      <footer className="app-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{canResubmit ? 'Save your corrections by submitting your application again.' : profile ? 'Your dashboard is ready. Continue to access your account.' : 'Your application details stay saved when you sign out.'}</p>
        <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:shrink-0">
          {profile && <Button onClick={() => navigate('/dashboard', { replace: true })}>Open dashboard</Button>}
          {canResubmit && <Button disabled={uploading} className="[&>span]:whitespace-normal" onClick={resubmit}>{application?.status === 'bounced' ? 'Submit clarifications' : 'Reapply with updated details'}</Button>}
          {!application && !profile && <Button onClick={() => navigate('/register')}>Complete registration</Button>}
          <Button variant="secondary" onClick={async () => { await appAuth.signOut(); navigate('/login'); }}><LogOut size={16} aria-hidden="true" />Sign out</Button>
        </div>
      </footer>
    </main>
    <Modal open={Boolean(imagePreview)} onClose={() => setImagePreview(null)} title={imagePreview?.title || 'Image preview'} size="xl" bodyClassName="min-h-0 min-w-0 overflow-auto bg-slate-50 p-4 dark:bg-slate-900 sm:p-6">
      {imagePreview && <ProfileAvatar src={imagePreview.src} alt={imagePreview.alt} className="mx-auto block h-auto max-h-[calc(100dvh-12rem)] w-auto max-w-full rounded-lg object-contain" />}
    </Modal>
  </div>;
}
