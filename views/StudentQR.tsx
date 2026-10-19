import { errorMessage } from '../lib/errors';
import ErrorNotice from '../components/ui/ErrorNotice';
import { getDigitalIdRole, renderDigitalId } from '../lib/digitalId';
import { getProfileSchoolName } from '../lib/academicDirectory';
import { toast } from '../lib/toast';
import React, { useEffect, useRef, useState } from 'react';
import { appData } from '../lib/backend';
import QRCode from 'react-qr-code';
import { useAuth } from '../components/AuthContext';
import { ShieldCheck, Info, Download, Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';
import Button from '../components/ui/Button';
import { Page, PageHeader, Surface } from '../components/ui/Page';
import { Skeleton } from '../components/ui/Skeleton';

const StudentQR: React.FC = () => {
  const { profile } = useAuth();
  const schoolName = getProfileSchoolName(profile, appData.getSchoolStructure());
  const qrWrapperRef = useRef<HTMLDivElement>(null);
  const printQrWrapperRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [qrError, setQrError] = useState('');
  const [printQrToken, setPrintQrToken] = useState('');
  const [printQrError, setPrintQrError] = useState('');
  const [refreshingPrintQr, setRefreshingPrintQr] = useState(false);
  useEffect(() => {
    let active = true;
    const renewLiveQr = async () => {
      try {
        const result = await appData.issueQr();
        if (active) { setQrToken(result.token); setExpiresAt(result.expiresAt); setQrError(''); }
      } catch (error) { if (active) { setQrToken(''); setQrError(errorMessage(error)); } }
    };
    const loadPrintQr = async () => {
      try {
        const result = await appData.getPrintQr();
        if (active) { setPrintQrToken(result.token); setPrintQrError(''); }
      } catch (error) { if (active) { setPrintQrToken(''); setPrintQrError(errorMessage(error)); } }
    };
    void renewLiveQr();
    void loadPrintQr();
    const timer = setInterval(renewLiveQr, 45000);
    return () => { active = false; clearInterval(timer); };
  }, [profile?.uid]);

  if (!profile) return null;

  const handleRefreshPrintQr = async () => {
    if (refreshingPrintQr || !printQrToken) return;
    setRefreshingPrintQr(true);
    try {
      const result = await appData.refreshPrintQr();
      setPrintQrToken(result.token);
      setPrintQrError('');
      toast.success('Printed QR replaced. Download a new card.');
    } catch (error) {
      setPrintQrError(errorMessage(error));
      toast.error(error);
    } finally {
      setRefreshingPrintQr(false);
    }
  };

  const handleDownloadPNG = async () => {
    if (downloading || !printQrToken) return;
    const toastId = toast.progress('Preparing ID card...');
    setDownloading(true);
    setDownloadSuccess(false);
    try {
      const svg = printQrWrapperRef.current?.querySelector('svg');
      if (!svg) throw new Error('Printed QR image unavailable');
      const canvas = await renderDigitalId(profile, schoolName, svg);
      const link = document.createElement('a');
      link.download = `RMC_Student_QR_${profile.student_id}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('ID card download started', toastId);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
    } catch (error) {
      toast.error(error, toastId);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Page className="student-qr-page animate-in zoom-in duration-fast">
      <PageHeader
        className="text-center [&>div]:w-full"
        eyebrow={<span className="inline-flex items-center gap-1.5"><Sparkles size={12} /> Digital Access Card</span>}
        title="My Digital ID"
        description="Use the live QR for quick check-in, or download a permanent printed ID card."
      />

      {/* Main Card */}
      <Surface className="w-full overflow-hidden shadow-lg transition-all">
        <div className="bg-brand-gradient flex items-center gap-4 p-5 sm:p-6 border-b-2 border-gold-400">
          <img
            src={`${import.meta.env.BASE_URL}academic-seal-transparent.png`}
            alt="IARS Academic Seal"
            className="w-16 h-16 shrink-0 rounded-full object-contain p-0.5 ring-2 ring-gold-400/60"
          />
          <div className="min-w-0 text-left">
            <p className="text-gold-300 text-[10px] font-bold uppercase tracking-widest mb-1.5">Digital access card</p>
            <h2 className="text-sm sm:text-base font-bold leading-snug text-white [overflow-wrap:anywhere]">{schoolName}</h2>
            <p className="text-slate-300 text-xs mt-2">IARS · Attendance & event check-in</p>
          </div>
        </div>

        <div className="p-5 sm:p-6 flex flex-col items-center">
          {/* Student Header */}
          <div className="w-full text-center mb-5">
            <h3 className="text-xl font-bold leading-snug text-brand-900 dark:text-slate-100 uppercase tracking-tight [overflow-wrap:anywhere]">{profile.name}</h3>
            <p className="text-slate-500 dark:text-slate-400 font-mono text-sm font-semibold mt-2 [overflow-wrap:anywhere]">ID: {profile.student_id}</p>

            <span className="inline-block mt-3 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-900/40 dark:text-brand-200">{getDigitalIdRole(profile.role)}</span>
            <div className="mt-5 grid grid-cols-1 min-[400px]:grid-cols-2 gap-3 text-left">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Program / department</p>
                <p className="mt-1 text-sm font-semibold text-brand-900 dark:text-slate-100 [overflow-wrap:anywhere]">{profile.school_data.department || profile.school_data.program || profile.school_data.track || profile.school_data.strand || 'General studies'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Year & section</p>
                <p className="mt-1 text-sm font-semibold text-brand-900 dark:text-slate-100 [overflow-wrap:anywhere]">{[profile.school_data.level, profile.school_data.section].filter(Boolean).join(' · ') || 'Not assigned'}</p>
              </div>
            </div>
          </div>

          <p className="mb-4 text-center text-sm font-semibold text-brand-900 dark:text-slate-100">Scan for attendance check-in</p>
          {/* QR Code Container */}
          <div
            ref={qrWrapperRef}
            role="img"
            aria-label={`Student QR code for ${profile.name}`}
            className="mb-4 w-full max-w-[min(17rem,calc(100vw-4rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-inner transition-all hover:border-gold-400/60 dark:border-slate-700"
          >
            {qrToken && expiresAt > Date.now() ? <QRCode
              value={qrToken}
              size={170}
              fgColor="#0E1B42"
              level="H"
              className="h-auto w-full"
            /> : qrError ? <ErrorNotice error={qrError} operation="Open live QR" /> : <div role="status" aria-label="Generating live QR" aria-busy="true"><Skeleton className="aspect-square w-full" /></div>}
          </div>

          {/* The printed card uses a separate persistent QR token. Keep its SVG out of the live preview. */}
          <div ref={printQrWrapperRef} aria-hidden="true" className="pointer-events-none absolute left-[-10000px] top-0 h-60 w-60 opacity-0">
            {printQrToken ? <QRCode value={printQrToken} size={240} fgColor="#0E1B42" level="H" /> : null}
          </div>

          {/* Download Action Button */}
          <Button
            aria-label="Download card as PNG"
            onClick={handleDownloadPNG}
            disabled={downloading || !printQrToken}
            className="w-full border border-gold-400/30 uppercase tracking-wider sm:w-auto"
          >
            {downloading ? (
              <span className="animate-pulse">Working...</span>
            ) : downloadSuccess ? (
              <>
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Download size={16} className="text-gold-400 group-hover:translate-y-0.5 transition-transform" />
                <span>Download permanent ID</span>
              </>
            )}
          </Button>

          {/* Manual rotation for a lost or compromised printed card. */}
          <div className="mt-4 w-full rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-left">
                <p className="text-[11px] font-bold text-amber-950 dark:text-amber-100">Printed ID QR</p>
                <p className="text-[9px] leading-relaxed text-amber-800 dark:text-amber-200">Stays valid until you replace it. Download a new card after replacing the QR.</p>
              </div>
              <Button
                variant="warning"
                size="sm"
                fullWidth={false}
                className="shrink-0"
                disabled={refreshingPrintQr || !printQrToken}
                aria-busy={refreshingPrintQr}
                aria-label="Replace printed QR"
                onClick={() => { void handleRefreshPrintQr(); }}
              >
                <RefreshCw size={13} className={refreshingPrintQr ? 'animate-spin' : ''} aria-hidden="true" />
                <span>{refreshingPrintQr ? 'Replacing...' : 'Replace QR'}</span>
              </Button>
            </div>
            {printQrError ? <ErrorNotice error={printQrError} operation="Student QR"></ErrorNotice> : null}
          </div>

          {/* Live QR status */}
          <div className="mt-4 flex w-full items-center gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/50">
             <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs">
                <ShieldCheck size={15} />
             </div>
             <div className="min-w-0 text-left">
                <p className="text-[11px] font-bold text-emerald-900 dark:text-emerald-200">Live web QR</p>
                <p className="text-[9px] text-emerald-700 font-medium [overflow-wrap:anywhere] dark:text-emerald-300">Refreshes automatically every 45 seconds and is separate from your permanent printed ID QR.</p>
             </div>
          </div>
        </div>
        {/* Card Footer */}
        <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-900/60">
          <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Present this card during active attendance scanning for institutional events and mandatory flag ceremonies.
          </p>
        </div>
      </Surface>
    </Page>
  );
};

export default StudentQR;
