import { errorMessage } from '../lib/errors';
import ErrorNotice from '../components/ui/ErrorNotice';
import { signInDestination } from '../lib/navigationMemory';
import { toast } from '../lib/toast';
import { supabase } from '../lib/supabase';
import { requestAuthEmail } from '../lib/emailDelivery';
import EnrollmentEmailConfirmation from '../components/EnrollmentEmailConfirmation';
import { defaultConfirmationSettings, loadConfirmationSettings } from '../lib/enrollmentConfirmation';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { useTheme } from '../components/ThemeContext';
import PublicHeader from '../components/ui/PublicHeader';
import PublicFooter from '../components/ui/PublicFooter';
import ExplainerVideo from '../components/ui/ExplainerVideo';
import { appAuth, appData, refreshData, lookupEnrollment, EnrollmentLookup } from '../lib/backend';
import { TEST_ACCOUNTS } from '../lib/seed';
import { SchoolNode } from '../types';
import Button from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Collapsible } from '../components/ui/Collapsible';
import { AcademicPathPicker } from '../components/academic/AcademicPathPicker';
import { serializeAcademicAssignment, findNodePath } from '../lib/academicDirectory';
import PasswordStrengthMeter from '../components/ui/PasswordStrengthMeter';
import { createDriveImage, driveFileIdFromUrl, retainProfileImage } from '../lib/googleDrive';
import { enrollmentUsername, STUDENT_ID_ERROR, validEmergencyPhone, validStudentId } from '../lib/enrollment';
import GoogleSignIn from '../components/GoogleSignIn';
import EnrollmentPrivacyAgreement from '../components/EnrollmentPrivacyAgreement';
import PasskeySignIn from '../components/PasskeySignIn';
import { checkGoogle, submitGoogleEnrollment, type GoogleEnrollment } from '../lib/googleAuth';
import { ArrowRight, Shield, MapPin, Mail, Phone, Eye, EyeOff, Loader2, ShieldAlert, ChevronDown, ChevronLeft, Check, ExternalLink, UserCircle, Camera, KeyRound, QrCode, ShieldCheck, Clock, FileCheck2, BarChart3, UserCheck, Smartphone, CheckCircle2, Layers, Lock, Zap, Building2 } from 'lucide-react';

interface LandingPageProps {
  defaultOpenLogin?: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ defaultOpenLogin = false }) => {
  const navigate = useNavigate();
  const [confirmationSettings, setConfirmationSettings] = useState(defaultConfirmationSettings);
  const [confirmationSettingsReady, setConfirmationSettingsReady] = useState(false);
  const [confirmationSettingsError, setConfirmationSettingsError] = useState('');
  const [confirmationDeliveryWarning, setConfirmationDeliveryWarning] = useState('');
  useEffect(() => {
    let active = true;
    void loadConfirmationSettings().then(settings => { if (active) { setConfirmationSettings(settings); setConfirmationSettingsReady(true); } }).catch(() => { if (active) setConfirmationSettingsError('Enrollment settings could not be loaded. Reload this page before signing up.'); });
    return () => { active = false; };
  }, []);
  const location = useLocation();
  const { isMock, user, profile, revision, loading } = useAuth();
  
  // --- UI STATE ---
  const { resolvedTheme } = useTheme();
  const isDarkMode = resolvedTheme === 'dark';
  
  // Modals
  const [showLoginModal, setShowLoginModal] = useState(defaultOpenLogin);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const isEnrollmentPage = location.pathname === '/register';
  const [selectedFeature, setSelectedFeature] = useState<any>(null);

  // Login Logic State
  const [identifier, setIdentifier] = useState(''); 
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [emailNotice,setEmailNotice] = useState('');
  const [confirmationUntil,setConfirmationUntil] = useState(0);
  const [resetBusy,setResetBusy] = useState(false);
  const [resetUntil,setResetUntil] = useState(0);
  const [emailClock,setEmailClock] = useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setEmailClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const [googleEnrollment, setGoogleEnrollment] = useState<GoogleEnrollment | null>(null);
  const [googleNeedsEnrollment, setGoogleNeedsEnrollment] = useState(false);
  const [missingAccountEmail, setMissingAccountEmail] = useState('');
  const accountPromptRef = useRef<HTMLDivElement>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [lookupId, setLookupId] = useState('');
  const [lookupResult, setLookupResult] = useState<EnrollmentLookup | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [showLookupModal, setShowLookupModal] = useState(false);

  // Register Logic State
  const [regStep, setRegStep] = useState(0);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [checkingEnrollment, setCheckingEnrollment] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [savedPhotoUrl, setSavedPhotoUrl] = useState('');
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [regError, setRegError] = useState('');
  const [structure, setStructure] = useState<SchoolNode[]>([]);
  const [academicPath, setAcademicPath] = useState<SchoolNode[]>([]);
  const [securityKey, setSecurityKey] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);
  const [regData, setRegData] = useState({
    name: '', username: '', email: '', password: '', confirmPassword: '', student_id: '',
    guardianName: '', guardianPhone: '', profilePic: '', idFront: '', idBack: ''
  });

  const enrollmentTitleRef = useRef<HTMLHeadingElement>(null);
  const enrollmentSteps = ['Data privacy agreement', 'Account details', 'Academic assignment', 'Emergency contact', 'Profile picture'];

  // --- EFFECTS ---
  useEffect(() => {
    if (!isEnrollmentPage) return;
    enrollmentTitleRef.current?.focus({ preventScroll: true });
    enrollmentTitleRef.current?.closest('main')?.scrollIntoView?.({ block: 'start' });
  }, [isEnrollmentPage, regStep, regSuccess]);

  useEffect(() => {
    if (missingAccountEmail && showLoginModal) {
      accountPromptRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      accountPromptRef.current?.focus({ preventScroll: true });
    }
  }, [missingAccountEmail, showLoginModal]);

  useEffect(() => {
    const section = (location.state as { homeSection?: string } | null)?.homeSection;
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' });
  }, [location.key, location.state]);

  useEffect(() => {
    setShowLoginModal(defaultOpenLogin && !isEnrollmentPage);
    setShowForgotPassword(false);
  }, [defaultOpenLogin, isEnrollmentPage]);



  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  useEffect(() => {
    if (!loading && user && !isEnrollmentPage) {
      navigate(signInDestination(user.uid, profile?.role, location.state), { replace: true, state: null });
    }
  }, [loading, user, profile, navigate, isEnrollmentPage, location.state]);

  useEffect(() => {
    setStructure(appData.getSchoolStructure());
    setShowTestPanel(import.meta.env.DEV && import.meta.env.VITE_SHOW_TEST_ACCOUNTS === 'true');
  }, [revision]);

  useEffect(() => {
    if (!isEnrollmentPage || structure.length > 0) return;
    void refreshData().catch(() => {
      // AuthContext reports connection errors; keep enrollment usable while it retries.
    });
  }, [isEnrollmentPage, structure.length]);

  const hydratedApplication = useRef<string | null>(null);
  useEffect(() => {
    if (!isEnrollmentPage || !user || hydratedApplication.current === user.uid) return;
    const application = appData.getApplications().find(a => a.id === user.uid && ['rejected', 'bounced', 'deleted'].includes(a.status));
    if (!application) return;
    const saved = application.form_data;
    setSavedPhotoUrl(application.documents?.photo?.startsWith('https://drive.google.com/') ? application.documents.photo : saved.photo_url || '');
    setRegData(current => ({ ...current, name: saved.name, username: saved.username, email: saved.email, student_id: saved.student_id, guardianName: saved.guardian?.name || '', guardianPhone: saved.guardian?.contact || '' }));
    const terminalId = saved.school_data.academic_assignment?.terminalGroupId;
    if (terminalId) setAcademicPath(findNodePath(appData.getSchoolStructure(), terminalId) || []);
    hydratedApplication.current = user.uid;
  }, [user, revision, isEnrollmentPage]);

  // --- HANDLERS ---
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  // Login Handlers
  const handleGoogle = async (credential: string, nonce: string, enrolling: boolean) => {
    if (enrolling && !privacyAccepted) { setRegError('Read and agree to the data privacy agreement first.'); return; }
    setLoginError(''); setRegError('');
    setMissingAccountEmail(''); setGoogleNeedsEnrollment(false);
    const result = await checkGoogle(credential, nonce);
    if (result.session) {
      setGoogleEnrollment(null); setGoogleNeedsEnrollment(false);
      setShowLoginModal(false);
      if (enrolling) navigate('/dashboard', { replace: true });
      // Existing-account sign-in uses the profile-ready redirect effect.
      return;
    }
    setGoogleEnrollment(result.enrollment);
    setRegData(current => ({ ...current, email: result.email }));
    if (enrolling) {
      setGoogleNeedsEnrollment(false);
    } else {
      setGoogleNeedsEnrollment(true);
      setMissingAccountEmail(result.email);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError('');
    setMissingAccountEmail(''); setGoogleNeedsEnrollment(false); setGoogleEnrollment(null);
    try {
      await appAuth.signIn(identifier, password);
      // AuthContext hydrates the current profile before the effect redirects.
    } catch (err: any) {
      if (err.code === 'ACCOUNT_NOT_FOUND' && identifier.includes('@')) {
        setMissingAccountEmail(identifier.trim().toLowerCase());
      } else {
        setLoginError(errorMessage(err));
      }
      setIsLoggingIn(false);
    }
  };

  const quickLogin = (usr: string) => {
    setIdentifier(usr);
    setPassword('');
    setLoginError('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  // Register Handlers
  const enrollmentPerson = () => ({
    name: regData.name.trim(), username: enrollmentUsername(regData.username, regData.student_id),
    email: regData.email.trim().toLowerCase(), student_id: regData.student_id.trim(),
    guardian: { name: regData.guardianName.trim(), contact: regData.guardianPhone.trim() },
    photo_url: savedPhotoUrl,
    school_data: { academic_assignment: { terminalGroupId: academicPath.at(-1)?.id } },
  } as any);

  const selectEnrollmentPhoto = async (file?: File) => {
    if (!file) return;
    setReadingPhoto(true); setRegError('');
    try {
      const retained = await retainProfileImage(file);
      const preview = retained.preview;
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => img.naturalWidth && img.naturalHeight ? resolve() : reject(new Error('Choose a readable image.'));
        img.onerror = () => reject(new Error('This file is not a readable image. Choose another photo.'));
        img.src = preview;
      });
      setPhotoFile(retained.file); setPhotoPreview(preview); setSavedPhotoUrl('');
    } catch (error) { setRegError(errorMessage(error)); }
    finally { setReadingPhoto(false); }
  };

  const resendConfirmation = async () => {
    if (!identifier.includes('@') || resendingConfirmation || emailClock<confirmationUntil) return;
    setResendingConfirmation(true);
    try { await appAuth.resendConfirmation(identifier);setConfirmationUntil(Date.now()+120000);setLoginError('');setEmailNotice('If email confirmation is needed, one request is queued. It sends automatically when Gmail’s allowance is available. A fresh link is created just before sending; repeated requests do not add duplicate emails.'); }
    catch (error) { console.error('[Auth] resend confirmation failed', error); setLoginError(errorMessage(error)); }
    finally { setResendingConfirmation(false); }
  };

  const handleEnrollmentLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setLookupError(''); setLookupResult(null);
    if (!validStudentId(lookupId)) { setLookupError(STUDENT_ID_ERROR); return; }
    setLookingUp(true);
    try { setLookupResult(await lookupEnrollment(lookupId)); }
    catch (error) { setLookupError(errorMessage(error)); }
    finally { setLookingUp(false); }
  };

  const terminal = academicPath[academicPath.length - 1];
  const isMayorRegistered = terminal && ['section', 'block'].includes(terminal.type)
    ? appData.isMayorRegisteredForSection(terminal.id, terminal.name)
    : false;

  useEffect(() => {
    setSecurityKey('');
  }, [terminal?.id]);

  const handleRegisterSubmit = async () => {
    if (isRegistering || readingPhoto) return;
    if (!privacyAccepted) { setRegError('Read and agree to the data privacy agreement first.'); setRegStep(0); return; }
    setRegError('');
    const terminalNode = academicPath[academicPath.length - 1];
    if (!terminalNode || !['section', 'block'].includes(terminalNode.type)) {
      setRegError('Please select a valid section to proceed.');
      return;
    }
    if (!user && regData.password !== regData.confirmPassword) {
      setRegError('Passwords do not match.');
      return;
    }
    if (terminalNode && appData.isMayorRegisteredForSection(terminalNode.id, terminalNode.name)) {
      if (appData.isMayorRegisteredForSection(terminalNode.id, terminalNode.name) && !securityKey.trim()) {
        setRegError('Section Enrollment Security Key is required for enrollment into this section.');
        return;
      }

    }
    setIsRegistering(true);
    const uid = '';
    const serialized = serializeAcademicAssignment(academicPath);
    const profile: any = {
      uid,
      name: regData.name.trim(),
      username: regData.username.trim().toLowerCase() || `student_${regData.student_id.trim().replace(/[^a-zA-Z0-9_.-]/g, '_')}`.toLowerCase().slice(0, 100),
      email: regData.email.trim().toLowerCase(),
      student_id: regData.student_id.trim(),
      role: 'student',
      guardian: { name: regData.guardianName, contact: regData.guardianPhone },
      photo_url: '',
      school_data: { ...serialized.schoolData, school_id: serialized.assignment.campusId, academic_assignment: serialized.assignment }
    };

    try {
      if (!validStudentId(regData.student_id)) throw new Error(STUDENT_ID_ERROR);
      if (regData.guardianName.trim().length < 2 || !validEmergencyPhone(regData.guardianPhone)) throw new Error('Enter the emergency contact’s full name and a valid mobile number.');
      if (!photoFile && !savedPhotoUrl) throw new Error('Choose a profile picture before registering.');
      await appData.validateEnrollment(profile, securityKey.trim(), 3);
      let photoUrl = savedPhotoUrl;
      if (!photoUrl && photoFile) {
        const uploaded = await createDriveImage(photoFile, profile.name, profile.student_id);
        photoUrl = uploaded.url;
        setSavedPhotoUrl(photoUrl);
      }
      const photoId = driveFileIdFromUrl(photoUrl);
      if (photoId) photoUrl = `https://drive.google.com/thumbnail?id=${photoId}&sz=w1600`;
      profile.photo_url = photoUrl;
      // Validate the exact payload that the signup trigger will receive.
      await appData.validateEnrollment(profile, securityKey.trim(), 4);
      const result = googleEnrollment && !user
        ? await submitGoogleEnrollment(profile, regData.password, securityKey.trim(), googleEnrollment)
        : await appData.submitApplication(profile, regData.password, securityKey.trim());
      setNeedsEmailConfirmation(result.needsEmailConfirmation);
      setConfirmationDeliveryWarning(result.deliveryWarning || '');
      setRegSuccess(true);
    } catch (submissionError) {
      // Keep the uploaded photo for retries. A lost signup response can also
      // mean an account already references it, so deleting it here is unsafe.
      setRegError(errorMessage(submissionError));
    } finally {
      setIsRegistering(false);
    }
  };

  // --- DATA FOR IARS FEATURES & MODULES ---
  const systemFeatures = [
    {
      icon: QrCode,
      title: "Your student QR pass",
      desc: "Show your QR code to the attendance officer. The code expires after a short time, so open your current pass before checking in.",
      tag: "Easy student identification",
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20"
    },
    {
      icon: MapPin,
      title: "Check in at the event",
      desc: "For events with a location check, the officer's device confirms that the scan takes place in the event area.",
      tag: "Attendance at the right place",
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20"
    },
    {
      icon: ShieldCheck,
      title: "Understand your service hours",
      desc: "See service hours recorded for late arrivals or absences under school rules, and follow their completion. Ask the school about any entry that seems wrong.",
      tag: "Clear records for school review",
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20"
    },
    {
      icon: FileCheck2,
      title: "Send an excuse request",
      desc: "Explain why you missed an event, provide supporting documents when needed, and check the school's response.",
      tag: "Follow your request",
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-900/20"
    },
    {
      icon: Building2,
      title: "Keep school details organized",
      desc: "The school organizes students by department, course, year level, and section so officers can find the right class records.",
      tag: "Up-to-date class lists",
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-50 dark:bg-indigo-900/20"
    },
    {
      icon: BarChart3,
      title: "View attendance reports",
      desc: "Authorized officers can review attendance totals, find missing entries, and download reports for school use.",
      tag: "Useful school reports",
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-50 dark:bg-rose-900/20"
    }
  ];

  const systemModules = [
    {
      role: "For students",
      icon: UserCheck,
      desc: "Open your QR pass, find upcoming school events, review your attendance, and submit an excuse when you need one.",
      highlights: ["Your current QR pass", "Event times and locations", "Recorded service hours", "Excuse request updates"]
    },
    {
      role: "For class attendance officers",
      icon: Smartphone,
      desc: "Class mayors and other authorized officers can use a phone to scan student passes and check whether attendance was accepted.",
      highlights: ["Scan with your camera", "Check saved attendance", "View attendance totals", "Find a student by ID"]
    },
    {
      role: "For student affairs officers",
      icon: Shield,
      desc: "Authorized student government and school staff can manage events, review excuse requests, and follow up on service hours according to their assigned duties.",
      highlights: ["Plan school events", "Review excuse requests", "Review service hours", "Download school reports"]
    },
    {
      role: "For school administrators",
      icon: Layers,
      desc: "Keep department, course, and class information current, and assign school officers to the duties they are allowed to perform.",
      highlights: ["College and high school", "Assign school officers", "Manage class lists", "Import and download lists"]
    }
  ];

  const workflowSteps = [
    {
      step: "01",
      title: "Open your student pass",
      desc: "Log in and open your QR pass before reaching the attendance officer. Have your current pass ready on your phone."
    },
    {
      step: "02",
      title: "Let the officer scan it",
      desc: "The officer checks your identity and scans your pass. If the event requires a location check, the officer must be in the event area."
    },
    {
      step: "03",
      title: "Check your attendance record",
      desc: "Confirm that your attendance was saved. Scans taken without an internet connection remain pending until accepted after reconnection. Ask the officer about a missing or incorrect entry."
    }
  ];

  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL || '';
  const supportPhone = import.meta.env.VITE_SUPPORT_PHONE || '';
  const campusName = import.meta.env.VITE_CAMPUS_NAME || '';
  const campusMap = import.meta.env.VITE_CAMPUS_MAP_URL || '';
  const contactLinks = [
    ...(supportEmail ? [{ icon: Mail, label: 'System Support', value: supportEmail, action: () => window.open(`mailto:${supportEmail}`), color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' }] : []),
    ...(supportPhone ? [{ icon: Phone, label: 'School office', value: supportPhone, action: () => window.open(`tel:${supportPhone}`), color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' }] : []),
    ...(campusName && campusMap.startsWith('https://') ? [{ icon: MapPin, label: 'Main Campus', value: campusName, action: () => window.open(campusMap, '_blank', 'noopener,noreferrer'), color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' }] : []),
  ];

  return (
    <div className={`min-h-dvh overflow-x-hidden font-inter transition-colors duration-base ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      <PublicHeader onSection={isEnrollmentPage ? undefined : scrollTo} onLogin={isEnrollmentPage ? undefined : () => setShowLoginModal(true)} />

      {/* --- MODALS --- */}

      {/* LOGIN MODAL */}
      <Modal
        open={showLoginModal && !showForgotPassword}
        onClose={() => { setShowLoginModal(false); if (defaultOpenLogin) navigate('/'); }}
        size="md"
        title="Log in to IARS"
        description="Use your account to view attendance and school records"
      >
           <div className="min-w-0">
              <div className="flex flex-col justify-between">
                <div>
                   {emailNotice && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900 dark:bg-slate-800 dark:text-slate-100">{emailNotice}</p>}
                   {loginError && (
                     <div className="mb-4 sm:mb-5">
                       <ShieldAlert size={18} className="shrink-0" /> 
                       <ErrorNotice error={loginError} operation="Landing Page"></ErrorNotice>
                     </div>
                   )}
                   {((loginError && /confirm|verification/i.test(loginError)) || /email confirmation/.test(emailNotice)) && identifier.includes('@') && (
                     <button type="button" onClick={() => void resendConfirmation()} disabled={resendingConfirmation || emailClock<confirmationUntil} className="mb-4 text-xs font-bold text-brand-700 underline dark:text-gold-400">
                       {resendingConfirmation ? 'Queueing confirmation email…' : emailClock<confirmationUntil ? `Resend available in ${Math.ceil((confirmationUntil-emailClock)/1000)}s` : 'Resend confirmation email'}
                     </button>
                   )}

                   <form onSubmit={handleLogin} className="space-y-4">
                      <div className="space-y-1.5">
                        <label htmlFor="landing-login-identifier" className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Username or email</label>
                        <div className="relative">
                          <UserCircle size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                          <input
                            id="landing-login-identifier"
                            aria-label="Username or email"
                            type="text"
                           required
                           value={identifier}
                           onChange={(e) => { setIdentifier(e.target.value); setMissingAccountEmail(''); setGoogleNeedsEnrollment(false); setGoogleEnrollment(null); setLoginError(''); }}
                           className="app-control w-full py-3.5 pl-12 pr-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20 focus:outline-none transition-all font-bold text-base text-brand-900 dark:text-white"
                           placeholder="Your username or email address"
                         />
                       </div>
                     </div>

                     <div className="space-y-1.5">
                       <label htmlFor="landing-login-password" className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Password</label>
                       <div className="relative">
                         <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                         <input
                           id="landing-login-password"
                           aria-label="Password"
                           type={showPassword ? "text" : "password"}
                           required
                           value={password}
                           onChange={(e) => setPassword(e.target.value)}
                           className="app-control w-full py-3.5 pl-12 pr-12 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20 focus:outline-none transition-all font-bold text-base text-brand-900 dark:text-white"
                           placeholder="••••••••"
                         />
                         <button 
                           aria-label={showPassword ? 'Hide password' : 'Show password'}
                           type="button" 
                           onClick={() => setShowPassword(!showPassword)} 
                           className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-900 dark:hover:text-gold-400 transition-colors p-1"
                         >
                           {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                         </button>
                       </div>
                     </div>

                     <Button type="submit" disabled={isLoggingIn} className="!rounded-2xl text-xs font-black uppercase tracking-widest py-4 mt-2 shadow-lg hover:shadow-xl transition-all">
                       {isLoggingIn ? <span className="flex items-center gap-2"><Loader2 className="animate-spin" size={18}/> Logging in...</span> : 'Log In'}
                     </Button>
                     <button type="button" disabled={isLoggingIn} className="text-sm underline disabled:opacity-50" onClick={() => {
                       setResetEmail(identifier.includes('@') ? identifier.trim() : '');
                       setResetError('');
                       setShowForgotPassword(true);
                     }}>Forgot password?</button>
                   </form>
                   {showLoginModal && <div className="mt-4 space-y-3">
                     <PasskeySignIn disabled={isLoggingIn} onSuccess={() => {
                       setIsLoggingIn(true);
                     }} />
                     <GoogleSignIn onCredential={(credential, nonce) => handleGoogle(credential, nonce, false)} onError={setLoginError} />
                     {missingAccountEmail && <div ref={accountPromptRef} tabIndex={-1} role="alert" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-slate-100">
                       <p className="font-bold">Account not found</p>
                       <p className="break-words">We couldn’t find an account for {missingAccountEmail}. Sign up with this email to create your account.</p>
                       <Button type="button" onClick={() => {
                         setRegData(current => ({ ...current, email: missingAccountEmail }));
                         setRegError(''); setLoginError(''); setPassword('');
                         setShowLoginModal(false); navigate('/register'); setRegStep(0); setPrivacyAccepted(false);
                         setMissingAccountEmail(''); setGoogleNeedsEnrollment(false);
                       }}>{googleNeedsEnrollment ? 'Sign up with this Google email' : 'Sign up with this email'}</Button>
                     </div>}
                   </div>}
                </div>

                <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3.5">
                  <button 
                    onClick={() => { setShowLoginModal(false); navigate('/register'); }}
                    className="w-full py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-brand-900 dark:text-slate-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2"
                  >
                    <span>Register</span>
                    <ArrowRight size={14} />
                  </button>

                  {import.meta.env.DEV && import.meta.env.VITE_SHOW_TEST_ACCOUNTS === 'true' && (
                     <div className="space-y-2 pt-1">
                       <button 
                         aria-controls="landing-test-accounts"
                         aria-expanded={showTestPanel}
                         type="button"
                         onClick={() => setShowTestPanel(!showTestPanel)} 
                         className="w-full text-[10px] font-black text-gold-600 dark:text-gold-400 uppercase tracking-widest flex items-center justify-between p-2.5 rounded-xl bg-gold-50/60 dark:bg-gold-950/30 border border-gold-200/60 dark:border-gold-900/40 hover:bg-gold-100/60 transition-colors"
                       >
                         <span className="flex items-center gap-1.5"><Zap size={13}/> Tests</span>
                         <ChevronDown className="app-disclosure-chevron" size={14}/>
                       </button>

                       <Collapsible id="landing-test-accounts" open={showTestPanel} innerClassName="bg-slate-50 dark:bg-slate-800/90 rounded-2xl p-2.5 space-y-1.5 border border-slate-200 dark:border-slate-700">
                            <p className="text-[10px] text-slate-400 dark:text-slate-400 font-bold px-1 uppercase tracking-wider">Click to auto-fill test credentials:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {TEST_ACCOUNTS.map((acc) => (
                                <button 
                                  key={acc.user} 
                                  type="button"
                                  onClick={() => quickLogin(acc.user)} 
                                  className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 hover:border-gold-400 border border-slate-200 dark:border-slate-700 rounded-xl transition-all text-left group"
                                >
                                  <div>
                                    <p className="text-xs font-bold text-brand-900 dark:text-slate-100 leading-tight">{acc.name}</p>
                                    <p className="text-[9px] font-black text-gold-600 dark:text-gold-400 uppercase tracking-wider">{acc.role}</p>
                                  </div>
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 group-hover:bg-gold-500 group-hover:text-brand-950 transition-colors">
                                    Fill
                                  </span>
                                </button>
                              ))}
                            </div>
                       </Collapsible>
                     </div>
                  )}
                </div>

              </div>
           </div>
      </Modal>

      <Modal open={showLoginModal && showForgotPassword} onClose={() => setShowForgotPassword(false)} size="md"
        title="Forgot password?" description="Enter your account email address to request a password reset link.">
        <form className="space-y-4" onSubmit={async event => {
          event.preventDefault();
          if (resetBusy || Date.now() < resetUntil) return;
          setResetBusy(true); setResetError(''); setResetNotice('');
          try {
            const result = await requestAuthEmail('recovery', resetEmail.trim());
            setResetUntil(Date.now() + (result.cooldownSeconds || 120) * 1000);
            setResetNotice('If this email has an account, its reset request is queued. Check your inbox and Spam or Junk for a reset link. Delivery may be delayed when the daily email allowance is reached. A fresh link is created just before sending; repeated requests do not add duplicate emails.');
          } catch (error) { setResetError(errorMessage(error)); }
          finally { setResetBusy(false); }
        }}>
          <div className="space-y-2">
            <label htmlFor="forgot-password-email" className="block text-sm font-bold text-brand-900 dark:text-white">Email address</label>
            <input id="forgot-password-email" type="email" autoComplete="email" required maxLength={254}
              value={resetEmail} disabled={resetBusy} onChange={event => { setResetEmail(event.target.value); setResetError(''); setResetNotice(''); }}
              className="input-field w-full" placeholder="you@example.com" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">Open the link in your email to choose a new password. If you have two-factor authentication enabled, verify your authenticator code first.</p>
          {resetNotice && <p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900 dark:bg-slate-800 dark:text-slate-100">{resetNotice}</p>}
          {resetError && <ErrorNotice error={resetError} operation="Request password reset" />}
          <Button type="submit" disabled={resetBusy || emailClock < resetUntil}>
            {resetBusy ? 'Queueing reset email…' : emailClock < resetUntil ? `Try again in ${Math.ceil((resetUntil - emailClock) / 1000)}s` : 'Send reset link'}
          </Button>
          <Button variant="secondary" onClick={() => setShowForgotPassword(false)}>Back to login</Button>
        </form>
      </Modal>

      {isEnrollmentPage && <main className="mx-auto w-full max-w-4xl px-4 pb-12 pt-28 sm:px-6 sm:pt-32" aria-labelledby="enrollment-title">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button type="button" disabled={checkingEnrollment || isRegistering || readingPhoto} onClick={() => navigate('/')} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-brand-900 hover:bg-slate-200 disabled:opacity-50 dark:text-white dark:hover:bg-slate-800">
            <ChevronLeft size={18} /> Back to home
          </button>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Student enrollment</span>
        </div>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div className="mb-6 space-y-3">
            <h1 id="enrollment-title" ref={enrollmentTitleRef} tabIndex={-1} className="scroll-mt-28 text-2xl font-black tracking-tight text-brand-900 focus:outline-none dark:text-white sm:text-3xl">{regSuccess ? 'Enrollment Submitted' : 'Create your student account'}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{regSuccess ? 'Your application is waiting for school review' : `Step ${regStep + 1} of ${enrollmentSteps.length}: ${enrollmentSteps[regStep]}`}</p>
            {!regSuccess && <ol aria-label="Enrollment progress" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {enrollmentSteps.map((label, index) => <li key={label} aria-current={regStep === index ? 'step' : undefined} className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold ${index <= regStep ? 'border-gold-300 bg-gold-50 text-brand-900 dark:border-gold-700 dark:bg-gold-500/10 dark:text-gold-300' : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white dark:bg-slate-800">{index < regStep ? <Check size={14} aria-label="Completed" /> : index + 1}</span>{label}
              </li>)}
            </ol>}
          </div>
        {!regSuccess && <p className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-800">
          Before providing your details, read our <a href="#/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Privacy Policy</a>, <a href="#/data-privacy-agreement" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Data Privacy Act Agreement</a>, and <a href="#/terms-of-service" target="_blank" rel="noopener noreferrer" className="font-semibold underline">Terms of Service</a> (open in a new tab). Ask your school about anything unclear.
        </p>}
        {regSuccess ? (
          <div className="space-y-5 text-center py-2 animate-in fade-in zoom-in-95">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-500 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 size={36} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Registration Submitted!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">{needsEmailConfirmation ? `Check ${regData.email.trim()} (including spam) to confirm your address, then sign in to upload documents and track admission review.` : 'Your application has been saved. Open your application status to upload documents and track admission review.'}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-left space-y-2 text-xs">
              <div className="flex justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Legal Name</span>
                <span className="font-bold text-slate-900 dark:text-white">{regData.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Student ID</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{regData.student_id}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Assigned Section</span>
                <span className="font-bold text-slate-900 dark:text-white">{academicPath[academicPath.length - 1]?.name || 'Assigned Section'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Status</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Pending Approval
                </span>
              </div>
            </div>
            {needsEmailConfirmation && <EnrollmentEmailConfirmation email={regData.email.trim()} settings={confirmationSettings} onConfirmed={() => { setNeedsEmailConfirmation(false); navigate('/register/status'); }} />}
            {confirmationDeliveryWarning && <p role="status" className="text-sm text-amber-800 dark:text-amber-200">{confirmationDeliveryWarning}</p>}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="gold" disabled={needsEmailConfirmation} className="!w-full !rounded-xl text-xs uppercase font-black tracking-widest" onClick={() => { navigate('/register/status'); }}>
                {needsEmailConfirmation ? 'Email confirmation required' : 'View Application Status'}
              </Button>
              <Button variant="secondary" className="!w-full !rounded-xl text-xs uppercase font-black tracking-widest" onClick={() => { navigate('/'); }}>
                Back to home
              </Button>
            </div>
          </div>
        ) : (
           <div className="space-y-5">
              <div hidden={regStep !== 0}>
                <EnrollmentPrivacyAgreement accepted={privacyAccepted} onChange={setPrivacyAccepted} />
              </div>
              {regStep === 1 && (
                 <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                     <p className="text-sm text-slate-500">Complete your account details, academic assignment, emergency contact, and profile picture.</p>
                     {!user && isEnrollmentPage && <GoogleSignIn enrollment onCredential={(credential, nonce) => handleGoogle(credential, nonce, true)} onError={setRegError} />}
                     {googleEnrollment && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">Google email verified: {googleEnrollment.email}. Your account will be created only when you finish enrollment.</p>}
                     {confirmationSettingsError && <ErrorNotice error={confirmationSettingsError} operation="Load enrollment settings" />}
                     {confirmationSettings.mode === 'google_only' && !googleEnrollment && !user && <p role="status">Sign up with Google to continue. Your Google email is already verified.</p>}
                     {confirmationSettings.mode === 'required' && !googleEnrollment && <p className="text-sm">After submitting, confirm the link sent to your email here before continuing to your application.</p>}

                    <div className="space-y-1">
                       <label htmlFor="landing-register-name" className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 ml-1">Legal Full Name</label>
                       <input id="landing-register-name" placeholder="Ex. Juan Dela Cruz" className="app-control w-full p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-base text-brand-900 dark:text-white focus:border-gold-400 focus:outline-none" value={regData.name} onChange={e => setRegData({...regData, name: e.target.value})} />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                       <div className="space-y-1">
                          <label htmlFor="landing-register-username" className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 ml-1">Username <span className="normal-case text-slate-400">(optional)</span></label>
                          <input id="landing-register-username" placeholder="3+ letters, numbers, dots or underscores" className="app-control w-full p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-base text-brand-900 dark:text-white focus:border-gold-400 focus:outline-none" value={regData.username} onChange={e => setRegData({...regData, username: e.target.value})} />
                       </div>
                       <div className="space-y-1">
                          <label htmlFor="landing-register-email" className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 ml-1">Email Address</label>
                          <input id="landing-register-email" placeholder="name@email.com" type="email" readOnly={Boolean(googleEnrollment) || Boolean(user)} className="app-control w-full p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-base text-brand-900 dark:text-white focus:border-gold-400 focus:outline-none" value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} />
                       </div>
                    </div>

                    <div className="space-y-1">
                       <label htmlFor="landing-register-password" className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 ml-1">Password</label>
                       <div className="relative">
                         <input
                           id="landing-register-password"
                           placeholder="••••••••"
                           type={showRegPassword ? "text" : "password"}
                           className="app-control w-full p-3.5 pr-12 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-base text-brand-900 dark:text-white focus:border-gold-400 focus:outline-none"
                           value={regData.password}
                           onChange={e => setRegData({...regData, password: e.target.value})}
                         />
                         <button 
                           aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                           type="button" 
                           onClick={() => setShowRegPassword(!showRegPassword)} 
                           className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-900 dark:hover:text-gold-400 transition-colors p-1"
                         >
                           {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                         </button>
                       </div>
                       <PasswordStrengthMeter password={regData.password} />
                    </div>

                    <div className="space-y-1">
                       <label htmlFor="landing-register-confirm-password" className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 ml-1">Confirm Password</label>
                       <div className="relative">
                         <input
                           id="landing-register-confirm-password"
                           placeholder="••••••••"
                           type={showRegConfirmPassword ? "text" : "password"}
                           className="app-control w-full p-3.5 pr-12 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-base text-brand-900 dark:text-white focus:border-gold-400 focus:outline-none"
                           value={regData.confirmPassword}
                           onChange={e => setRegData({...regData, confirmPassword: e.target.value})}
                         />
                         <button 
                           aria-label={showRegConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                           type="button" 
                           onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)} 
                           className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-900 dark:hover:text-gold-400 transition-colors p-1"
                         >
                           {showRegConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                         </button>
                       </div>
                       {regData.confirmPassword && regData.password !== regData.confirmPassword && (
                         <ErrorNotice error="Passwords do not match." operation="Confirm password" />
                       )}
                       {regData.confirmPassword && regData.password === regData.confirmPassword && (
                         <p className="mt-1 text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                           <CheckCircle2 size={12} /> Passwords match.
                         </p>
                       )}
                    </div>
                 </div>
              )}

              {regStep === 2 && (
                 <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                    <div className="space-y-1">
                       <label htmlFor="landing-register-student-id" className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 ml-1">Official Student ID #</label>
                       <input id="landing-register-student-id" required placeholder="YYYY-XXXXXL" className="app-control w-full min-w-0 p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-base text-brand-900 dark:text-white focus:border-gold-400 focus:outline-none" value={regData.student_id} onChange={e => setRegData({...regData, student_id: e.target.value})} />
                    </div>

                    <AcademicPathPicker roots={structure} value={academicPath.map((node) => node.id)} onChange={setAcademicPath} purpose="registration" />
                    {structure.length === 0 && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{loading ? 'Loading enrollment sections…' : 'Enrollment sections are not available yet. Ask your school administrator to set up the Academic Directory, then return to complete registration.'}</p>}

                    {terminal && appData.isMayorRegisteredForSection(terminal.id, terminal.name) && (
                      <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                          <KeyRound size={18} />
                          <label htmlFor="landing-register-security-key" className="text-xs font-black uppercase tracking-widest">
                            Section Enrollment Security Key <span className="text-red-500">*</span>
                          </label>
                        </div>
                        <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          Enter the enrollment key for &ldquo;{terminal.name}&rdquo;. Ask your class mayor or school officer for this key.
                        </p>
                        <input
                          id="landing-register-security-key"
                          placeholder="Enter Section Security Key (e.g. SEC-XXXXX)"
                          className="app-control w-full rounded-xl border border-amber-300 bg-white p-3.5 text-base font-bold text-brand-900 outline-none focus:border-amber-500 dark:border-amber-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                          value={securityKey}
                          onChange={(e) => setSecurityKey(e.target.value)}
                        />
                      </div>
                    )}

                    <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                      The school will check your student number and class details. You do not need to upload an image of your student ID.
                    </p>
                 </div>
              )}

              {regStep === 3 && (
                 <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800">
                       <Shield size={28} className="text-brand-900 dark:text-gold-400 shrink-0" />
                       <div>
                          <h4 className="text-xs font-black text-brand-900 dark:text-slate-100 uppercase">Emergency Contact — Required</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Provide a contact the school can reach in an emergency</p>
                       </div>
                    </div>
                    <div className="space-y-1">
                       <label htmlFor="landing-register-guardian-name" className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 ml-1">Guardian Name</label>
                       <input id="landing-register-guardian-name" required placeholder="Legal Full Name" className="app-control w-full p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-base text-brand-900 dark:text-white focus:border-gold-400 focus:outline-none" value={regData.guardianName} onChange={e => setRegData({...regData, guardianName: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                       <label htmlFor="landing-register-guardian-phone" className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 ml-1">Emergency Contact #</label>
                       <input id="landing-register-guardian-phone" required inputMode="tel" placeholder="+63 9XX XXX XXXX" className="app-control w-full p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-base text-brand-900 dark:text-white focus:border-gold-400 focus:outline-none" value={regData.guardianPhone} onChange={e => setRegData({...regData, guardianPhone: e.target.value})} />
                    </div>
                 </div>
              )}

              {regStep === 4 && (
                <section className="space-y-4">
                  <h3 className="font-bold">Profile picture — Required</h3>
                  <p className="text-sm text-slate-500">Choose a clear photo of yourself. JPG, PNG, or WebP, up to 5 MB. Your photo is saved through the school's Google Drive image service when you register.</p>
                  {(photoPreview || savedPhotoUrl) && <img src={photoPreview || savedPhotoUrl} alt="Profile picture preview" className="h-36 w-36 rounded-2xl object-cover" />}
                  <div className="space-y-2">
                    <label htmlFor="enrollment-photo" className="block text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Choose profile picture</label>
                    <input id="enrollment-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={readingPhoto || isRegistering} className="sr-only" onChange={e => {
                      const input = e.currentTarget;
                      void selectEnrollmentPhoto(input.files?.[0]).finally(() => { input.value = ''; });
                    }} />
                    <label
                      htmlFor="enrollment-photo"
                      className={`inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-3 text-sm font-black transition-colors ${readingPhoto || isRegistering ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800' : 'border-brand-200 bg-brand-50 text-brand-900 hover:border-gold-400 hover:bg-gold-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:hover:border-gold-400'}`}
                    >
                      <Camera size={18} />
                      {readingPhoto ? 'Checking image…' : photoFile ? 'Choose a different photo' : 'Choose a profile photo'}
                    </label>
                    {photoFile && <p className="truncate text-xs font-semibold text-slate-500" title={photoFile.name}>{photoFile.name}</p>}
                  </div>
                  {readingPhoto && <p role="status">Checking image…</p>}
                </section>
              )}
              {regError && (
                <ErrorNotice error={regError} operation="Landing Page"></ErrorNotice>
              )}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:gap-4">
                 {regStep > 0 && (
                   <Button disabled={checkingEnrollment || isRegistering || readingPhoto} variant="secondary" aria-label="Previous registration phase" className="!w-full !rounded-xl sm:!w-auto" onClick={() => { setRegError(''); setRegStep(regStep - 1); }}>
                     <ChevronLeft size={20} /> Back
                   </Button>
                 )}
                  {regStep < 4 ? (
                    <Button disabled={checkingEnrollment || !privacyAccepted} className="!rounded-xl text-xs uppercase font-black tracking-widest" onClick={async () => {
                      if (!privacyAccepted) { setRegError('Read and agree to the data privacy agreement first.'); return; }
                      if (regStep === 0) { setRegError(''); setRegStep(1); return; }
                      if (regStep === 1 && !regData.name.trim()) {
                        setRegError('Enter your full name.');
                        return;
                      }
                      if (regStep === 1 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regData.email.trim())) {
                        setRegError('Enter a valid email address.');
                        return;
                     }
                     if (regStep === 1 && regData.username.trim() && !/^[a-zA-Z0-9_.-]{3,100}$/.test(regData.username.trim())) {
                       setRegError('Username must be 3–100 letters, numbers, dots, underscores, or hyphens.');
                        return;
                      }
                      if (!user && regStep === 1 && regData.password.length < 12) {
                        setRegError('Password must be at least 12 characters.');
                        return;
                      }
                      if (!user && regStep === 1 && regData.password !== regData.confirmPassword) {
                        setRegError('Passwords do not match.');
                        return;
                     }
                     if (regStep === 2) {
                       if (!validStudentId(regData.student_id)) {
                         setRegError(STUDENT_ID_ERROR);
                         return;
                       }
                       const terminalNode = academicPath[academicPath.length - 1];
                       if (!terminalNode || !['section', 'block'].includes(terminalNode.type)) {
                         setRegError('Please select a valid section to proceed.');
                         return;
                       }
                       if (appData.isMayorRegisteredForSection(terminalNode.id, terminalNode.name) && !securityKey.trim()) {
                         setRegError('Section Enrollment Security Key is required for enrollment into this section.');
                         return;
                       }
                     }
                     if (regStep === 3 && (regData.guardianName.trim().length < 2 || !validEmergencyPhone(regData.guardianPhone))) {
                       setRegError('Enter the emergency contact’s full name and a valid mobile number (09XXXXXXXXX or +639XXXXXXXXX).');
                       return;
                     }
                     if (!confirmationSettingsReady && !user) { setRegError('Enrollment settings could not be loaded. Reload this page before signing up.'); return; }
                     if (confirmationSettings.mode === 'google_only' && !googleEnrollment && !user) { setRegError('Sign up with Google to continue enrollment.'); return; }
                     setCheckingEnrollment(true); setRegError('');
                     try {
                       await appData.validateEnrollment(enrollmentPerson(), securityKey.trim(), regStep);
                       setRegStep(regStep + 1);
                     } catch (error) {
                       setRegError(errorMessage(error));
                     } finally { setCheckingEnrollment(false); }
                    }}>
                     {checkingEnrollment ? 'Checking…' : 'Next'}
                   </Button>
                 ) : (
                   <Button variant="gold" className="!rounded-xl text-xs uppercase font-black tracking-widest" onClick={handleRegisterSubmit} disabled={isRegistering || readingPhoto}>
                     {isRegistering ? 'Submitting...' : 'Register'}
                   </Button>
                 )}
              </div>

              <div className="text-center pt-1 border-t border-slate-100 dark:border-slate-800">
                <button type="button" disabled={checkingEnrollment || isRegistering || readingPhoto} onClick={() => { navigate('/login'); }} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-brand-900 dark:hover:text-gold-400 transition-colors">
                  Already have an account? <span className="text-gold-500 underline">Log In</span>
                </button>
              </div>
           </div>
        )}
        </section>
      </main>}

      {!isEnrollmentPage && <main>
      {/* HERO SECTION */}
      <section id="home" className="scroll-mt-28 relative pt-32 pb-20 lg:pt-44 lg:pb-28 px-6 overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-gold-400/10 dark:bg-gold-500/5 rounded-full blur-3xl -z-10 animate-pulse"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-brand-900/5 dark:bg-brand-500/10 rounded-full blur-3xl -z-10"></div>
        
        <div className="max-w-4xl mx-auto text-center space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-base">
           <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black text-brand-900 dark:text-white tracking-tighter leading-[1.1]">
              Your school attendance <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 via-gold-500 to-amber-600">& student records</span>
           </h1>

           <p className="text-slate-600 dark:text-slate-300 text-sm lg:text-base font-medium max-w-2xl mx-auto leading-relaxed">
              Show your student QR pass at school events, check your attendance, and follow your excuse requests. IARS helps you and your school keep records clear and easy to find.
           </p>

           <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <button onClick={() => setShowLoginModal(true)} className="w-full sm:w-auto px-8 py-4 bg-brand-900 dark:bg-gold-500 text-white dark:text-brand-950 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-brand-800 dark:hover:bg-gold-400 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center justify-center gap-3">
                 Log In <ArrowRight size={16} />
              </button>
              <button onClick={() => navigate('/register')} className="w-full sm:w-auto px-8 py-4 bg-white dark:bg-slate-800 text-brand-900 dark:text-white border-2 border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-gold-400 hover:text-gold-600 dark:hover:text-gold-400 transition-all flex items-center justify-center gap-3 shadow-sm">
                 Register
              </button>
           </div>

           <button type="button" onClick={() => { setShowLookupModal(true); setLookupError(''); setLookupResult(null); }} className="mt-8 inline-flex items-center justify-center gap-3 rounded-2xl border-2 border-gold-300 bg-white px-7 py-4 text-xs font-black uppercase tracking-widest text-brand-900 shadow-lg transition hover:-translate-y-1 hover:border-gold-500 dark:border-gold-700 dark:bg-slate-900 dark:text-white">
             <Clock size={18} className="text-gold-500" /> Check enrollment progress
           </button>
        </div>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 text-left dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-brand-900 dark:text-white">New to IARS?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Have your student number, email address, class details, emergency contact, and profile photo ready. Your school reviews your account application before you can use student services. If your section needs an enrollment key, ask your class officer for it.</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">Already applied? Choose “Check enrollment progress” above to see an update, or log in to follow your application and respond to the school.</p>
        </div>

        <ExplainerVideo />

        {/* HERO FEATURE HIGHLIGHT CARDS */}
        <div className="max-w-6xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 transform hover:-translate-y-2 transition-transform duration-base">
              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                 <QrCode size={24} />
              </div>
              <h3 className="font-bold text-brand-900 dark:text-white text-lg mb-2">Your pass for school events</h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">Open your current student QR code and show it to the officer recording attendance.</p>
           </div>

           <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 transform hover:-translate-y-2 transition-transform duration-base relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gold-400/10 rounded-bl-full"></div>
              <div className="w-12 h-12 bg-gold-50 dark:bg-gold-900/20 rounded-2xl flex items-center justify-center text-gold-600 dark:text-gold-400 mb-4">
                 <MapPin size={24} />
              </div>
              <h3 className="font-bold text-brand-900 dark:text-white text-lg mb-2">Know where to check in</h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">Check the event time and location. Some events require the scanning officer to be inside the event area.</p>
           </div>

           <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800 transform hover:-translate-y-2 transition-transform duration-base">
              <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/20 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400 mb-4">
                 <ShieldCheck size={24} />
              </div>
              <h3 className="font-bold text-brand-900 dark:text-white text-lg mb-2">Keep track of your records</h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">Review attendance, service hours, and excuse decisions. Contact the school if a record needs correcting.</p>
           </div>
        </div>
      </section>

      <Modal open={showLookupModal} onClose={() => setShowLookupModal(false)} title="Check enrollment progress" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Enter your Student ID to see your latest application status.</p>
          <form className="space-y-3" onSubmit={handleEnrollmentLookup}>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500" htmlFor="enrollment-lookup-id">Student ID</label>
            <input id="enrollment-lookup-id" value={lookupId} onChange={event => setLookupId(event.target.value)} placeholder="YYYY-XXXXXL" autoFocus className="app-control w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800" />
            <Button type="submit" variant="gold" disabled={lookingUp} className="w-full">{lookingUp ? 'Checking…' : 'Check status'}</Button>
          </form>
          {lookupError && <ErrorNotice error={lookupError} operation="Landing Page"></ErrorNotice>}
          {lookupResult && <div role="status" className="space-y-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
            {!lookupResult.found ? <p>No enrollment application was found for that Student ID.</p> : <>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs"><div><dt className="text-slate-500">Enrollee</dt><dd className="font-semibold">{lookupResult.namePreview || '—'}</dd></div><div><dt className="text-slate-500">Student ID</dt><dd className="font-semibold">{lookupId}</dd></div><div><dt className="text-slate-500">Email</dt><dd className="font-semibold">{lookupResult.emailPreview || '—'}</dd></div><div><dt className="text-slate-500">Section</dt><dd className="font-semibold">{lookupResult.sectionPreview || '—'}</dd></div></dl>
              <p className="border-t border-slate-200 pt-3 dark:border-slate-700">{lookupResult.status === 'approved' ? 'Your enrollment is approved. You can log in to continue.' : lookupResult.status === 'bounced' ? 'Your application was returned for clarification.' : lookupResult.status === 'deleted' ? 'Your application was deleted. You may apply again.' : lookupResult.status === 'rejected' ? 'Your application was rejected. You may apply again.' : 'Your application is pending review by the school officer.'}</p>
              {lookupResult.rejectionReason && ['rejected', 'bounced'].includes(lookupResult.status || '') && <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30"><p className="text-[10px] font-black uppercase tracking-wider text-red-700 dark:text-red-300">Reviewer reason</p><p className="mt-1 whitespace-pre-wrap text-sm text-red-900 dark:text-red-100">{lookupResult.rejectionReason}</p>{lookupResult.clarificationFields?.length ? <p className="mt-2 text-xs font-semibold text-red-800 dark:text-red-200">Please update: {lookupResult.clarificationFields.join(', ')}.</p> : null}</div>}
              {lookupResult.status === 'bounced' && <Button type="button" variant="gold" className="w-full" onClick={() => user ? navigate('/register/status') : navigate('/login', { state: { returnTo: '/register/status' } })}>Edit and resubmit application</Button>}
              {lookupResult.status === 'rejected' && <Button type="button" variant="secondary" className="w-full" onClick={() => user ? navigate('/register/status') : navigate('/login', { state: { returnTo: '/register/status' } })}>Sign in to reapply</Button>}
            </>}
          </div>}
        </div>
      </Modal>

      {/* FEATURES SECTION */}
      <section id="features" className="scroll-mt-28 py-20 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 space-y-12">
           <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-3xl lg:text-4xl font-black text-brand-900 dark:text-white tracking-tight leading-tight">
                 What you can do with IARS
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-3 font-medium">
                 Keep attendance and school requests in one place, with records you can check and questions you can raise with the school.
              </p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {systemFeatures.map((feat, idx) => {
                 const IconComponent = feat.icon;
                 return (
                   <div key={idx} className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 hover:border-gold-400 dark:hover:border-gold-400 transition-all group flex flex-col justify-between">
                      <div>
                         <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${feat.bg} ${feat.color} mb-6 group-hover:scale-110 transition-transform`}>
                            <IconComponent size={24} />
                         </div>
                         <h3 className="font-black text-brand-900 dark:text-white text-lg mb-2 uppercase tracking-tight">{feat.title}</h3>
                         <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed font-medium">{feat.desc}</p>
                      </div>
                      <div className="mt-6 pt-4 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase tracking-wider text-gold-600 dark:text-gold-400">{feat.tag}</span>
                         <CheckCircle2 size={16} className="text-emerald-500" />
                      </div>
                   </div>
                 );
              })}
           </div>
        </div>
      </section>

      {/* MODULES SECTION */}
      <section id="modules" className="scroll-mt-28 py-20 bg-slate-50 dark:bg-slate-950">
         <div className="max-w-7xl mx-auto px-6 space-y-12">
            <div className="text-center max-w-2xl mx-auto">
               <h2 className="text-3xl lg:text-4xl font-black text-brand-900 dark:text-white tracking-tight">Tools for students and school officers</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {systemModules.map((mod, idx) => {
                  const Icon = mod.icon;
                  return (
                    <div key={idx} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-200/80 dark:border-slate-800 relative overflow-hidden group hover:shadow-xl transition-all">
                       <div className="flex items-center gap-4 mb-6">
                          <div className="w-14 h-14 bg-brand-900 text-gold-400 rounded-2xl flex items-center justify-center shrink-0 shadow-md">
                             <Icon size={28} />
                          </div>
                          <div>
                             <h3 className="text-xl font-black text-brand-900 dark:text-white uppercase tracking-tight">{mod.role}</h3>
                             <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">School access depends on assigned duties</span>
                          </div>
                       </div>
                       
                       <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed mb-6 font-medium">{mod.desc}</p>

                       <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/80 space-y-2">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-gold-600 dark:text-gold-400">Available tools</h4>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                             {mod.highlights.map((h, hIdx) => (
                               <div key={hIdx} className="flex items-center gap-2 text-xs font-bold text-brand-900 dark:text-slate-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-gold-500"></span>
                                  <span className="break-words">{h}</span>
                               </div>
                             ))}
                          </div>
                       </div>
                    </div>
                  );
               })}
            </div>
         </div>
      </section>

      {/* WORKFLOW SECTION */}
      <section id="workflow" className="scroll-mt-28 py-20 bg-white dark:bg-slate-900">
         <div className="max-w-7xl mx-auto px-6 space-y-12">
            <div className="text-center max-w-2xl mx-auto">
               <h2 className="text-3xl font-black text-brand-900 dark:text-white">How to record your attendance</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               {workflowSteps.map((step, idx) => (
                  <div key={idx} className="relative p-8 rounded-3xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-4">
                     <span className="text-4xl font-black text-gold-500/30 dark:text-gold-400/20 block">{step.step}</span>
                     <h3 className="text-lg font-black text-brand-900 dark:text-white uppercase tracking-tight">{step.title}</h3>
                     <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed font-medium">{step.desc}</p>
                  </div>
               ))}
            </div>
         </div>
      </section>

      {/* SECURITY & COMPLIANCE SECTION */}
      <section id="security" className="scroll-mt-28 py-20 bg-brand-900 dark:bg-black text-white relative overflow-hidden">
         <div className="max-w-7xl mx-auto px-6 relative z-10 text-center space-y-8">
            <h2 className="text-3xl lg:text-4xl font-black text-white max-w-2xl mx-auto tracking-tight">
               Know how your information is used
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 text-left">
               <div className="bg-white/5 dark:bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 space-y-2">
                  <Lock className="text-gold-400 mb-2" size={24} />
                  <h4 className="font-bold text-white text-sm uppercase">Access by school duty</h4>
                  <p className="text-slate-200 text-sm leading-relaxed">Students and school officers have different permissions based on their assigned duties.</p>
               </div>
               <div className="bg-white/5 dark:bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 space-y-2">
                  <ShieldCheck className="text-emerald-400 mb-2" size={24} />
                  <h4 className="font-bold text-white text-sm uppercase">Use your current pass</h4>
                  <p className="text-slate-200 text-sm leading-relaxed">QR passes expire after a short time. Officers check the student's identity before saving attendance.</p>
               </div>
               <div className="bg-white/5 dark:bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 space-y-2">
                  <Clock className="text-amber-400 mb-2" size={24} />
                  <h4 className="font-bold text-white text-sm uppercase">Recorded check-in times</h4>
                  <p className="text-slate-200 text-sm leading-relaxed">Records include the attendance time and officer so the school can review a disputed entry.</p>
               </div>
               <div className="bg-white/5 dark:bg-white/5 backdrop-blur-md p-6 rounded-2xl border border-white/10 space-y-2">
                  <Zap className="text-purple-400 mb-2" size={24} />
                  <h4 className="font-bold text-white text-sm uppercase">Your privacy choices</h4>
                  <p className="text-slate-200 text-sm leading-relaxed">Read what information the app uses and how to request access, correction, or deletion in the pages below.</p>
               </div>
            </div>
         </div>
      </section>

      {/* CONTACT SECTION */}
      <section id="contact" className="scroll-mt-28 py-20 bg-slate-50 dark:bg-slate-950">
         <div className="max-w-6xl mx-auto px-6 space-y-12">
            <div className="text-center">
               <h2 className="text-3xl font-black text-brand-900 dark:text-white">Need help?</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 md:col-span-3">For registration or sign-in help, contact your class officer or school administration. For a missing attendance entry or an excuse decision, ask the officer responsible for that event.</p>
               {contactLinks.map((link, idx) => (
                 <div key={idx} onClick={link.action} className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex items-center gap-4 hover:shadow-lg transition-all group cursor-pointer">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${link.bg} ${link.color} group-hover:scale-110 transition-transform`}>
                       <link.icon size={20} />
                    </div>
                    <div className="min-w-0">
                       <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{link.label}</p>
                       <p className="break-words text-xs font-bold text-brand-900 dark:text-white">{link.value}</p>
                    </div>
                    <button aria-label={`Open ${link.label}`} className="ml-auto shrink-0 p-2 text-slate-300 hover:text-brand-900 dark:hover:text-white transition-colors">
                       <ExternalLink size={16} />
                    </button>
                 </div>
               ))}
            </div>
         </div>
      </section>

      </main>}
      <PublicFooter />
    </div>
  );
};

export default LandingPage;
