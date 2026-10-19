import { selectUploadFile, retainedUploadFile } from '../lib/fileUploads';
import { errorMessage } from '../lib/errors';
import ErrorNotice from '../components/ui/ErrorNotice';
import { getProfileSchoolName } from '../lib/academicDirectory';
import { formatManilaDate } from '../lib/dateTime';
import ProfileAvatar from '../components/ui/ProfileAvatar';
import { toast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { appAuth, appData } from '../lib/backend';
import { verifyPassword } from '../lib/supabase';
import { createDriveImage, deleteDriveImage, driveFileIdFromUrl, fileAsDataUrl, validateProfileImage } from '../lib/googleDrive';
import { User, KeyRound, Smartphone, CheckCircle2, Building2, GraduationCap, School, Save, Eye, EyeOff, AlertCircle, LogOut, Pencil, Upload, X, FilePenLine } from 'lucide-react';
import QRCode from 'react-qr-code';
import Button from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Page, PageHeader, Surface } from '../components/ui/Page';
import { Collapsible } from '../components/ui/Collapsible';
import PasswordStrengthMeter from '../components/ui/PasswordStrengthMeter';
import InstallAppSettings from '../components/ui/InstallAppSettings';
import PasskeySettings from '../components/PasskeySettings';
import ProfileRequests from '../components/members/ProfileRequests';

const StudentProfile: React.FC = () => {
  const { profile, isMock } = useAuth();
  const schoolName = getProfileSchoolName(profile, appData.getSchoolStructure());
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await appAuth.signOut();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      navigate('/login');
    }
  };

  // Password Reset state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [passwordStep, setPasswordStep] = useState<'current' | 'mfa' | 'change'>('current');
  const [passwordMfaCode, setPasswordMfaCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  // 2FA Google Auth State
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [factorUri, setFactorUri] = useState('');
  const [factorSecret, setFactorSecret] = useState('');
  const [factorCreatedAt, setFactorCreatedAt] = useState<string | null>(null);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);
  const [factorError, setFactorError] = useState('');
  useEffect(() => { void supabase.auth.mfa.listFactors().then(({ data }) => { const factor = data?.totp.find(f => f.status === 'verified'); setIs2FAEnabled(Boolean(factor)); if (factor) { setFactorId(factor.id); setFactorCreatedAt((factor as { created_at?: string }).created_at || null); } }); }, []);
  const [twoFactorStatus, setTwoFactorStatus] = useState<'idle' | 'success'>('idle');

  // Editable Profile fields
  const [contactNumber, setContactNumber] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianContact, setGuardianContact] = useState('');
  const [isEditingContacts, setIsEditingContacts] = useState(false);
  const [isSavingContacts, setIsSavingContacts] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showProfileRequests, setShowProfileRequests] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const photoSelection = useRef(0);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(profile?.photo_url || '');
  const [photoError, setPhotoError] = useState('');
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  useEffect(() => {
    if (profile && !photoFile) setPhotoPreview(profile.photo_url || '');
  }, [profile?.photo_url, photoFile]);

  useEffect(() => {
    if (!profile || isEditingContacts) return;
    setContactNumber(profile.phone || '');
    setGuardianName(profile.guardian?.name || '');
    setGuardianContact(profile.guardian?.contact || '');
  }, [profile, isEditingContacts]);

  if (!profile) return null;

  const openPasswordChange = () => {
    setPasswordStatus('idle'); setPasswordMessage(''); setPasswordStep('current'); setPasswordMfaCode('');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setShowPasswordSection(true);
  };
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordStep === 'current') {
      if (!currentPassword) { setPasswordStatus('error'); setPasswordMessage('Enter your current password to continue.'); return; }
      let verified = false;
      try { verified = await verifyPassword(profile.email, currentPassword); }
      catch (error) { setPasswordStatus('error'); setPasswordMessage(errorMessage(error)); return; }
      if (!verified) { setPasswordStatus('error'); setPasswordMessage('Current password is incorrect.'); return; }
      setPasswordStatus('idle'); setPasswordMessage(''); setPasswordStep(is2FAEnabled ? 'mfa' : 'change'); return;
    }
    if (passwordStep === 'mfa') {
      if (!/^\d{6}$/.test(passwordMfaCode)) { setPasswordStatus('error'); setPasswordMessage('Enter the six-digit authenticator code.'); return; }
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: passwordMfaCode });
      if (error) { setPasswordStatus('error'); setPasswordMessage(errorMessage(error)); return; }
      setPasswordMfaCode(''); setPasswordStatus('idle'); setPasswordStep('change'); return;
    }
    if (!newPassword) {
      setPasswordStatus('error');
      setPasswordMessage('Please fill in all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus('error');
      setPasswordMessage('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 12) {
      setPasswordStatus('error');
      setPasswordMessage('Password must be at least 12 characters long.');
      return;
    }

    try { await appAuth.changePassword(currentPassword, newPassword); }
    catch (error) { setPasswordStatus('error'); setPasswordMessage(errorMessage(error)); return; }
    setPasswordStatus('success');
    setPasswordMessage('Password updated successfully!');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => {
      setPasswordStatus('idle');
      setShowPasswordSection(false);
    }, 2500);
  };

  const handleToggle2FA = async () => {
    setFactorError('');
    try {
      if (is2FAEnabled) {
        setDisablePassword(''); setShowDisablePassword(false); setDisableCode(''); setShowDisable2FA(true); return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all || []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await toast.result(() => supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'RMC Attendance' }), 'Prepare authenticator', 'Authenticator ready to verify');
      if (error) throw error;
      setFactorId(data.id); setFactorUri(data.totp.uri); setFactorSecret(data.totp.secret); setFactorCreatedAt(new Date().toISOString()); setShow2FASetup(true);
    } catch (error) { setFactorError(errorMessage(error)); }
  };
  const close2FASetup = () => { setShow2FASetup(false); setTwoFactorCode(''); setTwoFactorStatus('idle'); };
  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault(); setFactorError('');
    const { error } = await toast.result(() => supabase.auth.mfa.challengeAndVerify({ factorId, code: twoFactorCode }), 'Verify authenticator');
    if (error) { setFactorError(errorMessage(error)); return; }
    setTwoFactorStatus('success'); setIs2FAEnabled(true); close2FASetup();
  };

  const resetContactDraft = () => {
    setContactNumber(profile.phone || '');
    setGuardianName(profile.guardian?.name || '');
    setGuardianContact(profile.guardian?.contact || '');
  };

  const handleCancelProfile = () => {
    resetContactDraft();
    setIsEditingContacts(false);
    setIsSaved(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const changes: { phone?: string; guardianName?: string; guardianContact?: string } = {};
    if (contactNumber.trim() !== (profile.phone || '').trim()) changes.phone = contactNumber.trim();
    if (guardianName.trim() !== (profile.guardian?.name || '').trim()) changes.guardianName = guardianName.trim();
    if (guardianContact.trim() !== (profile.guardian?.contact || '').trim()) changes.guardianContact = guardianContact.trim();

    if (Object.keys(changes).length > 0) {
      setIsSavingContacts(true);
      try {
        await appData.updateContactDetails(profile.uid, changes);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      } finally {
        setIsSavingContacts(false);
      }
    }
    setIsEditingContacts(false);
  };
  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault(); setFactorError(''); setDisableBusy(true);
    try {
      if (!disablePassword || !/^\d{6}$/.test(disableCode)) throw new Error('Enter your password and six-digit authenticator code.');
      if (!await verifyPassword(profile.email, disablePassword)) throw new Error('Current password is incorrect.');
      const { error: challengeError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: disableCode });
      if (challengeError) throw challengeError;
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setIs2FAEnabled(false); setFactorId(''); setFactorCreatedAt(null); setShowDisable2FA(false);
    } catch (error) { setFactorError(errorMessage(error)); }
    finally { setDisableBusy(false); }
  };

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = selectUploadFile(event.currentTarget);
    if (!file) return;
    const selection = ++photoSelection.current;
    setReadingPhoto(true);
    setPhotoError('');
    try {
      validateProfileImage(file);
      const retained = await retainedUploadFile(file);
      const preview = await fileAsDataUrl(retained);
      if (selection !== photoSelection.current) return;
      setPhotoPreview(preview);
      setPhotoFile(retained);
    } catch (error) {
      if (selection !== photoSelection.current) return;
      setPhotoFile(null);
      setPhotoPreview(profile.photo_url || '');
      setPhotoError(errorMessage(error));
    } finally { if (selection === photoSelection.current) setReadingPhoto(false); }
  };

  const cancelPhotoChange = () => {
    photoSelection.current++;
    setReadingPhoto(false);
    setPhotoFile(null);
    setPhotoPreview(profile.photo_url || '');
    setPhotoError('');
  };

  const savePhoto = async () => {
    if (!photoFile || isSavingPhoto || readingPhoto) return;
    setPhotoError('');
    setIsSavingPhoto(true);
    let uploadedId = '';
    try {
      const previousUrl = profile.photo_url;
      const uploaded = await createDriveImage(photoFile, profile.name, profile.student_id);
      uploadedId = uploaded.id;
      await appData.updatePhoto(profile.uid, uploaded.url);
      // Remove the replaced Drive object only after Supabase points at the new one.
      const previousId = driveFileIdFromUrl(previousUrl);
      if (previousId && previousId !== uploaded.id) {
        try { await deleteDriveImage(previousId, 'replacement'); } catch (error) { console.warn('Old profile image could not be removed from Drive.', error); }
      }
      setPhotoFile(null);
      setPhotoPreview(uploaded.url);
    } catch (error) {
      // Supabase errors are plain objects in some browser builds, so do not lose
      // their useful message behind an instanceof Error check.
      const detail = error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : error instanceof Error ? error.message : '';
      setPhotoError(detail || 'Unable to save your profile photo.');
      if (uploadedId) await deleteDriveImage(uploadedId, 'failed-save').catch(() => undefined);
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const isStudent = profile.role === 'student' || profile.role === 'mayor';
  const roleLabel = profile.role === 'mayor'
    ? 'Student · Section Mayor'
    : profile.role === 'ssg'
      ? 'SSG Official'
      : profile.role === 'ossa'
        ? 'OSSA Official'
        : profile.role === 'ossa_staff'
          ? 'OSSA Staff'
        : profile.role === 'admin'
          ? 'System Administrator'
          : 'Student';

  return (
    <Page className="max-w-5xl animate-in fade-in duration-fast">

      {/* HEADER */}
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-1.5"><User size={14} /> Account Management</span>}
        title="My Profile"
        description="Manage your personal credentials, security settings, and emergency contacts."
      />

      {/* TOP CARD: PROFILE SUMMARY */}
      <Surface className="relative overflow-hidden border-gold-400/40 bg-gradient-to-br from-brand-900 to-brand-950 p-4 text-white shadow-md sm:p-5">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gold-400/5 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 relative z-10">
          {/* Avatar Photo */}
          <div className="relative shrink-0">
            <ProfileAvatar
              src={profile.photo_url || '/avatar-placeholder.svg'}
              alt={profile.name}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border-2 border-gold-400 shadow-md object-cover"
            />
            <span className="absolute -bottom-1 -right-1 bg-gold-400 text-brand-900 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full shadow-xs">
              {profile.role}
            </span>
          </div>

          {/* Details */}
          <div className="text-center sm:text-left space-y-1.5 flex-1 w-full">
            <div className="inline-block max-w-full rounded-full border border-gold-400/30 bg-gold-400/20 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold-300 [overflow-wrap:anywhere]">
              {isStudent ? 'Student ID' : 'Official ID'}: {profile.student_id}
            </div>
            <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight text-white">{profile.name}</h2>
            <p className="text-[11px] font-medium text-slate-300 [overflow-wrap:anywhere]">{profile.email}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">{roleLabel} · {profile.account_status || 'active'}</p>

            {/* School Info Pills */}
            <div className="pt-2 flex flex-wrap items-center gap-1.5 text-[11px] border-t border-white/10 mt-3">
              <span className="flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 font-bold text-gold-300 [overflow-wrap:anywhere]">
                <School size={12} className="shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{schoolName}</span>
              </span>
              <span className="flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 font-bold text-white [overflow-wrap:anywhere]">
                <Building2 size={12} /> {isStudent ? (profile.school_data.department || 'Academic unit') : (profile.official_data?.body || profile.school_data.department || 'Official body')}
              </span>
              <span className="flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 font-bold text-gold-300 [overflow-wrap:anywhere]">
                <GraduationCap size={12} /> {isStudent ? `${profile.school_data.level || 'Level pending'} - ${profile.school_data.section || 'Section pending'}` : (profile.official_data?.position || 'Authorized official')}
              </span>
            </div>
          </div>
        </div>
      </Surface>

      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        Name, {isStudent ? 'student ID and academic assignment' : 'official ID, body and access role'} are verified institutional records. {isStudent ? 'Submit information corrections below for OSSA or admin approval.' : 'They can only be changed by an authorized administrator.'}
      </p>

      {isStudent && (
        <>
          <div>
            <Button
              variant="secondary"
              className="sm:w-auto"
              aria-haspopup="dialog"
              onClick={() => setShowProfileRequests(true)}
            >
              <FilePenLine size={18} /> Information requests
            </Button>
          </div>
          <Modal
            open={showProfileRequests}
            onClose={() => setShowProfileRequests(false)}
            title="Manage information requests"
            size="xl"
          >
            <ProfileRequests />
          </Modal>
        </>
      )}

      {/* GRID: PERSONAL INFO EDIT & SECURITY TOGGLES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* LEFT: PERSONAL & GUARDIAN DETAILS */}
        <Surface className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2.5">
            <h3 className="text-xs font-bold text-brand-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <User size={15} className="text-gold-600 dark:text-gold-400" /> Contact Details
            </h3>
            {!isEditingContacts && !isStudent ? (
              <Button aria-label="Edit contact details" className="!w-auto" onClick={() => setIsEditingContacts(true)} size="sm" variant="secondary">
                <Pencil size={14} /> Edit
              </Button>
            ) : null}
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor={isEditingContacts ? 'student-contact' : undefined} className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Mobile Contact (optional)</label>
              {isEditingContacts ? (
                <input id="student-contact" type="text" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} className="input-field text-base sm:text-sm" />
              ) : (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-brand-900 dark:bg-slate-800 dark:text-slate-100">{contactNumber || 'Not provided'}</p>
              )}
            </div>

            {isStudent && <div className="space-y-1">
              <label htmlFor={isEditingContacts ? 'guardian-name' : undefined} className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Parent / Guardian Name</label>
              {isEditingContacts ? (
                <input id="guardian-name" type="text" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="input-field text-base sm:text-sm" />
              ) : (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-brand-900 dark:bg-slate-800 dark:text-slate-100">{guardianName || 'Not provided'}</p>
              )}
            </div>}

            {isStudent && <div className="space-y-1">
              <label htmlFor={isEditingContacts ? 'guardian-contact' : undefined} className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest">Guardian Emergency Hotline</label>
              {isEditingContacts ? (
                <input id="guardian-contact" type="text" value={guardianContact} onChange={(e) => setGuardianContact(e.target.value)} className="input-field text-base sm:text-sm" />
              ) : (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-brand-900 dark:bg-slate-800 dark:text-slate-100">{guardianContact || 'Not provided'}</p>
              )}
            </div>}

            {isEditingContacts ? (
              <div className="flex justify-end gap-2">
                <Button className="!w-auto" onClick={handleCancelProfile} size="sm" variant="secondary">Cancel</Button>
                <Button aria-label="Save contact details" className="!w-auto" disabled={isSavingContacts} size="sm" type="submit">
                  <Save size={14} className="text-gold-400" />
                  {isSavingContacts ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : isSaved ? (
              <p className="text-right text-xs font-bold text-emerald-600 dark:text-emerald-400" role="status">Saved</p>
            ) : null}
          </form>
        </Surface>

        {/* RIGHT: SECURITY & TOGGLES */}
        <div className="space-y-6">

          <InstallAppSettings />
          <PasskeySettings />

          {/* PASSWORD RESET TOGGLE */}
          <Surface className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-brand-50 dark:bg-brand-900/40 text-brand-900 dark:text-brand-300 flex items-center justify-center font-bold">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-brand-900 dark:text-slate-100 uppercase tracking-tight">Password Reset</h3>
                  <p className="text-slate-400 dark:text-slate-400 text-[10px] font-medium">Update account login password</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => showPasswordSection ? setShowPasswordSection(false) : openPasswordChange()}
                aria-expanded={showPasswordSection}
                aria-controls="password-fields"
                aria-label={showPasswordSection ? 'Cancel password change' : 'Change password'}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-brand-900 transition-all hover:bg-gold-400 dark:bg-slate-700 dark:text-slate-100"
              >
                {showPasswordSection ? 'Cancel' : 'Change'}
              </button>
            </div>

            <Collapsible id="password-fields" open={showPasswordSection} innerClassName="pt-4">
              <form onSubmit={handlePasswordReset} className="border-t border-slate-200 pt-4 dark:border-slate-700 space-y-3">
                {passwordStatus === 'error' && (
                  <ErrorNotice error={passwordMessage} operation="Change password" />
                )}
                {passwordStatus === 'success' && (
                  <div role="status" className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-2">
                    <CheckCircle2 size={16} /> {passwordMessage}
                  </div>
                )}

                {passwordStep === 'current' && <>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">First, verify your current password.</p>
                <div className="relative">
                  <label htmlFor="current-password" className="sr-only">Current password</label>
                  <input
                    id="current-password"
                    type={showPass ? 'text' : 'password'}
                    placeholder="Current Password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input-field p-3 pr-12 text-base sm:text-sm"
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowPass((visible) => !visible)}
                    aria-label={showPass ? 'Hide current password' : 'Show current password'}
                    aria-pressed={showPass}
                    className="absolute inset-y-0 right-1 z-10 flex w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <Button type="submit" className="uppercase tracking-widest">Continue</Button>
                </>}

                {passwordStep === 'mfa' && <>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Enter the code from Google Authenticator to continue.</p>
                  <label htmlFor="password-mfa-code" className="sr-only">Authenticator code</label>
                  <input id="password-mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit authenticator code" value={passwordMfaCode} onChange={(e) => setPasswordMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input-field p-3 text-center font-mono tracking-widest" />
                  <Button type="submit" className="uppercase tracking-widest">Verify code</Button>
                </>}

                {passwordStep === 'change' && <>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Choose a new password.</p>

                <div className="relative">
                  <label htmlFor="new-password" className="sr-only">New password</label>
                  <input
                    id="new-password"
                    type={showNewPass ? 'text' : 'password'}
                    placeholder="New Password (min 12 chars)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-field p-3 pr-12 text-base sm:text-sm"
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowNewPass((visible) => !visible)}
                    aria-label={showNewPass ? 'Hide new password' : 'Show new password'}
                    aria-pressed={showNewPass}
                    className="absolute inset-y-0 right-1 z-10 flex w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {showNewPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="relative">
                  <label htmlFor="confirm-password" className="sr-only">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type={showConfirmPass ? 'text' : 'password'}
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field p-3 pr-12 text-base sm:text-sm"
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowConfirmPass((visible) => !visible)}
                    aria-label={showConfirmPass ? 'Hide password confirmation' : 'Show password confirmation'}
                    aria-pressed={showConfirmPass}
                    className="absolute inset-y-0 right-1 z-10 flex w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <PasswordStrengthMeter password={newPassword} />
                <Button type="submit" className="uppercase tracking-widest">
                  Update
                </Button>
                </>}
              </form>
            </Collapsible>
          </Surface>

          {/* ENROLL GOOGLE AUTH (2FA) TOGGLE */}
          <Surface className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Smartphone size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-brand-900 dark:text-slate-100 uppercase tracking-tight">Google Authenticator (2FA)</h3>
                  <p className="text-slate-400 dark:text-slate-400 text-[10px] font-medium">
                    {is2FAEnabled ? 'Status: Active & Enrolled' : 'Status: Disabled'}
                  </p>
                  {is2FAEnabled && factorCreatedAt && <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Added {formatManilaDate(factorCreatedAt)}</p>}
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={handleToggle2FA}
                aria-label={is2FAEnabled ? 'Disable two-factor authentication' : 'Enable two-factor authentication'}
                aria-pressed={is2FAEnabled}
                className={`relative h-6 w-12 shrink-0 rounded-full transition-colors ${
                  is2FAEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full transition-transform shadow-md ${
                  is2FAEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`} />
              </button>
            </div>

          </Surface>

        </div>

      </div>

      {factorError && <ErrorNotice error={factorError} operation="Student Profile"></ErrorNotice>}
      <Modal
        open={show2FASetup}
        onClose={close2FASetup}
        size="sm"
        title="Enroll Google Authenticator"
        description="Scan the QR code in Google Authenticator, then enter the six-digit code to finish enrollment."
        footer={(
          <>
            <Button className="sm:!w-auto" onClick={close2FASetup} variant="secondary">
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 sm:!w-auto"
              disabled={!/^\d{6}$/.test(twoFactorCode) || twoFactorStatus === 'success'}
              form="two-factor-enrollment-form"
              type="submit"
            >
              {twoFactorStatus === 'success' ? 'Enrolled' : 'Enroll'}
            </Button>
          </>
        )}
      >
        <form id="two-factor-enrollment-form" onSubmit={handleVerify2FA} className="space-y-5 text-center">{factorError && <ErrorNotice error={factorError} operation="Student Profile"></ErrorNotice>}
          <p className="text-xs font-bold text-brand-900 dark:text-slate-100">Scan QR in Google Authenticator App</p>

          <div role="img" aria-label="Two-factor authentication QR code" className="mx-auto w-full max-w-48 rounded-2xl border border-slate-200 bg-white p-4 shadow-inner dark:border-slate-700">
            <QRCode value={factorUri} size={140} className="h-auto w-full" />
          </div>

          <p className="font-mono text-[10px] font-bold text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">Secret: {factorSecret}</p>

          <div>
            <label htmlFor="two-factor-code" className="sr-only">Six-digit authentication code</label>
            <input
              id="two-factor-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              placeholder="Enter 6-digit Code"
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input-field p-2.5 text-center font-mono text-base font-black tracking-widest sm:text-sm"
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={showDisable2FA}
        onClose={() => { if (!disableBusy) setShowDisable2FA(false); }}
        size="sm"
        title="Disable Google Authenticator"
        description="Verify your password and current authenticator code before disabling two-factor authentication."
        footer={(
          <>
            <Button className="sm:!w-auto" onClick={() => setShowDisable2FA(false)} variant="secondary" disabled={disableBusy}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 sm:!w-auto" form="disable-2fa-form" type="submit" disabled={disableBusy || !disablePassword || !/^\d{6}$/.test(disableCode)}>{disableBusy ? 'Verifying...' : 'Disable 2FA'}</Button>
          </>
        )}
      >
        <form id="disable-2fa-form" onSubmit={handleDisable2FA} className="space-y-3">
          {factorError && <ErrorNotice error={factorError} operation="Student Profile"></ErrorNotice>}
          <div className="relative">
            <label htmlFor="disable-2fa-password" className="sr-only">Current password</label>
            <input id="disable-2fa-password" type={showDisablePassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Current password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="input-field p-3 pr-12" />
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setShowDisablePassword((visible) => !visible)} aria-label={showDisablePassword ? 'Hide current password' : 'Show current password'} aria-pressed={showDisablePassword} className="absolute inset-y-0 right-1 z-10 flex w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700">
              {showDisablePassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <label htmlFor="disable-2fa-code" className="sr-only">Authenticator code</label>
          <input id="disable-2fa-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit authenticator code" value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="input-field p-3 text-center font-mono tracking-widest" />
        </form>
      </Modal>

      <Surface className="mt-6 space-y-4 p-5">
        <div>
          <h3 className="text-sm font-black uppercase tracking-tight text-brand-900 dark:text-slate-100">Profile photo</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose a JPG, PNG, or WebP image up to 5 MB. It uploads to Drive only when you press Save.</p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ProfileAvatar src={photoPreview || '/avatar-placeholder.svg'} alt={`${profile.name} preview`} className="h-24 w-24 rounded-2xl border-2 border-gold-400 object-cover shadow-sm" />
          <div className="min-w-0 flex-1 space-y-3">
            <label htmlFor="profile-photo-file" className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-brand-900 transition hover:border-gold-500 hover:bg-gold-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
              <Upload size={16} /> Choose image
            </label>
            <input id="profile-photo-file" type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={isSavingPhoto} onChange={handlePhotoSelected} />
            {readingPhoto && <p role="status" className="text-xs text-slate-500">Checking image…</p>}
            {photoFile && <p className="break-all text-xs font-semibold text-slate-600 dark:text-slate-300">{photoFile.name} · {(photoFile.size / 1024 / 1024).toFixed(2)} MB</p>}
            {photoError && <ErrorNotice error={photoError} operation="Student Profile"></ErrorNotice>}
            {photoFile && <div className="flex flex-wrap gap-2">
              <Button className="!w-auto" disabled={isSavingPhoto || readingPhoto} onClick={savePhoto} size="sm"><Save size={14} /> {isSavingPhoto ? 'Uploading...' : 'Save photo'}</Button>
              <Button className="!w-auto" disabled={isSavingPhoto} onClick={cancelPhotoChange} size="sm" variant="secondary"><X size={14} /> Cancel</Button>
            </div>}
          </div>
        </div>
      </Surface>
      {/* ACCOUNT SESSION & SIGN OUT CARD */}
      <Surface className="mt-6 flex flex-col items-center justify-between gap-4 p-5 sm:flex-row">
        <div className="flex items-center gap-3.5 text-center sm:text-left">
          <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center font-bold shrink-0 border border-red-200/50 dark:border-red-900/50">
            <LogOut size={22} />
          </div>
          <div>
            <h3 className="text-sm font-black text-brand-900 dark:text-slate-100 uppercase tracking-tight">Active Portal Session</h3>
            <p className="text-xs font-medium text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">Logged in as <span className="font-bold text-brand-900 dark:text-white">{profile.name}</span> ({profile.email})</p>
          </div>
        </div>

        <button
          aria-label="Sign out of portal"
          onClick={handleLogout}
          className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 shrink-0 cursor-pointer"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </Surface>

    </Page>
  );
};

export default StudentProfile;
