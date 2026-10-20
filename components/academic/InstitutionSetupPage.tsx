import { useRef, useState } from 'react';
import { ArrowLeft, Check, Upload } from 'lucide-react';
import CustomSelect from '../ui/CustomSelect';
import ManagedPasswordField from '../ui/ManagedPasswordField';
import { generatePassword, isValidPassword } from '../../lib/passwordPolicy';
import { Page, PageHeader, Surface } from '../ui/Page';
import { InstitutionSetup, colorsFromLogo, standardColors, accessibleColor, validateInstitutionSetup } from '../../lib/institutionBranding';
import { createInstitution, InstitutionRecord } from '../../lib/institutions';
import { retainProfileImage } from '../../lib/googleDrive';
import Button from '../ui/Button';
import InstitutionPreview from './InstitutionPreview';

const empty: InstitutionSetup = { name: '', shortName: '', slug: '', legalName: '', address: '', supportEmail: '', privacyEmail: '', adminName: '', adminEmail: '', adminUsername: '', logoUrl: '', ...standardColors, theme: 'standard', appearance: 'system' };
const control = 'app-control mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white';
export default function InstitutionSetupPage({ onClose, onCreated, institution }: { onClose: () => void; onCreated: () => void; institution?: InstitutionRecord }) {
  const form = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const steps = institution ? ['Institution details', 'Logo and theme', 'Review'] : ['Institution details', 'Administrator', 'Logo and theme', 'Review'];
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState(() => generatePassword());
  const currentStep = steps[step];
  const [setup, setSetup] = useState<InstitutionSetup>(institution?.config || empty);
  const [logo, setLogo] = useState<File>();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [logoBusy, setLogoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggestionNotice, setSuggestionNotice] = useState('');
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>(() => institution?.config.appearance === 'dark' ? 'dark' : institution?.config.appearance !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const update = <K extends keyof InstitutionSetup>(key: K, value: InstitutionSetup[K]) => setSetup(current => ({ ...current, [key]: value }));
  const field = (key: keyof InstitutionSetup, label: string, type = 'text', help?: string) => <label className="block text-sm font-semibold">{label}<input required disabled={Boolean(institution && (key === 'slug' || key.startsWith('admin')))} type={type} pattern={key === 'slug' ? String.raw`[a-z0-9][a-z0-9\-]{2,63}` : key === 'adminUsername' ? String.raw`[a-z0-9_.\-]{3,100}` : undefined} maxLength={type === 'email' ? 254 : 200} className={control} value={setup[key]} onChange={e => update(key, e.target.value as never)} />{help && <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">{help}</span>}</label>;
  const selectLogo = async (file?: File) => {
    if (!file) return;
    setLogoBusy(true); setError(''); setSuggestionNotice('');
    try {
      const retained = await retainProfileImage(file); setLogo(retained.file); update('logoUrl', retained.preview);
      try {
        const colors = await colorsFromLogo(retained.preview); setSuggestions(colors);
        if (colors.length) setSetup(current => ({ ...current, theme: 'logo', primaryColor: colors[0], accentColor: colors[1] || colors[0] }));
        else setSuggestionNotice('No distinct colors found. Use Standard or choose custom colors.');
      } catch { setSuggestions([]); setSuggestionNotice('Color suggestions are unavailable for this image. You can still choose custom colors.'); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to read logo.'); }
    finally { setLogoBusy(false); }
  };
  const save = async () => {
    setError('');
    try { validateInstitutionSetup(setup); setBusy(true); await createInstitution(setup, logo, institution?.id, institution ? undefined : password); onCreated(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Institution setup failed.'); }
    finally { setBusy(false); }
  };
  const next = () => {
    setError('');
    if (!form.current?.reportValidity()) return;
    if (currentStep === 'Administrator' && !isValidPassword(password)) { setError('Choose a password that meets every requirement.'); return; }
    setStep(value => value + 1);
  };
  return <Page aria-label="Institution setup">
    <PageHeader eyebrow="Independent institutions" title={institution ? 'Edit institution branding' : 'Create an independent institution'} description="Set up its workspace, administrator account, and visual identity." actions={<Button variant="secondary" fullWidth={false} disabled={busy || logoBusy} onClick={onClose}><ArrowLeft size={16} /> Back to institutions</Button>} />
    <nav aria-label="Setup progress"><ol className="grid grid-cols-2 gap-2 sm:flex sm:gap-4">{steps.map((label, index) => <li key={label} className="min-w-0 flex-1"><button type="button" disabled={index > step || busy || logoBusy} aria-current={index === step ? 'step' : undefined} onClick={() => { setError(''); setStep(index); }} className={`flex w-full items-center gap-2 rounded-xl border p-3 text-left text-sm font-semibold ${index === step ? 'border-brand-500 bg-brand-50 text-brand-900 dark:bg-brand-900 dark:text-white' : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">{index < step ? <Check size={15} /> : index + 1}</span>{label}</button></li>)}</ol></nav>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Surface className="min-w-0 p-5 sm:p-6">
      <h2 className="mb-1 text-lg font-bold text-brand-900 dark:text-white">{currentStep}</h2><p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Step {step + 1} of {steps.length}</p>
      <form ref={form} onSubmit={event => { event.preventDefault(); if (step === steps.length - 1) void save(); else next(); }}>
      <fieldset disabled={busy || logoBusy} className="min-w-0 space-y-5 text-slate-800 dark:text-slate-100">
        {error && <p role="alert" className="rounded-xl border border-red-300 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
        {currentStep === 'Institution details' && <>
        <div className="grid gap-4 sm:grid-cols-2">{field('name','Institution name')}{field('shortName','Short name')}{field('slug','Institution ID','text','Stable ID for its workspace link, e.g. north-academy.')}{field('legalName','Registered legal name')}</div>
        {field('address','Institution address')}
        <div className="grid gap-4 sm:grid-cols-2">{field('supportEmail','Support email','email')}{field('privacyEmail','Privacy contact email','email')}</div>
        </>}
        {currentStep === 'Administrator' && <>
        {field('adminName','Administrator name')}
        <div className="grid gap-4 sm:grid-cols-2">{field('adminEmail','Administrator email','email')}{field('adminUsername','Administrator username')}</div>
        <ManagedPasswordField label="Administrator password" value={password} onChange={setPassword} />
        <p className="text-xs text-slate-500 dark:text-slate-400">A strong password is generated automatically. You can replace it manually or generate another. After setup, the administrator will receive an email with their username, initial password, and workspace link.</p>
        </>}
        {currentStep === 'Logo and theme' && <>
        <div className="rounded-xl border border-dashed border-slate-300 p-5 dark:border-slate-600">
          <p className="mb-3 text-sm font-semibold">Institution logo</p>
          <div className="flex flex-wrap items-center gap-4"><img src={setup.logoUrl || '/iars-icon.png'} alt="Selected institution logo" className="h-16 w-16 rounded-xl border bg-white p-2 object-contain" /><div className="min-w-0 flex-1"><input ref={fileInput} aria-label="Institution logo file" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={e => { void selectLogo(e.target.files?.[0]); e.target.value = ''; }} /><Button variant="secondary" fullWidth={false} onClick={() => fileInput.current?.click()}><Upload size={16} /> {logoBusy ? 'Reading logo...' : setup.logoUrl ? 'Change logo' : 'Upload logo'}</Button><p className="mt-2 break-all text-xs text-slate-500">{logo?.name || 'PNG, JPG, or WebP - Up to 5 MB'}</p></div></div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Leave empty to use IARS artwork. Colors can be suggested from your logo.</p>
        </div>
        {setup.logoUrl && <button type="button" className="text-sm underline" onClick={() => { setLogo(undefined); setSuggestions([]); setSetup(current => ({ ...current, logoUrl: '', theme: 'standard' })); }}>Remove logo</button>}
        <CustomSelect label="Color theme" value={setup.theme} options={[{ value: 'standard', label: 'Standard - IARS system colors' }, ...((suggestions.length || setup.theme === 'logo') ? [{ value: 'logo', label: 'Suggested from logo' }] : []), { value: 'custom', label: 'Custom colors' }]} onChange={value => setSetup(current => ({ ...current, theme: value as InstitutionSetup['theme'], ...(value === 'logo' && suggestions.length ? { primaryColor: suggestions[0], accentColor: suggestions[1] || suggestions[0] } : {}) }))} />
        {suggestionNotice && <p role="status" className="text-xs">{suggestionNotice}</p>}
        {setup.theme !== 'standard' && <>
          {suggestions.length > 0 && <div><p className="mb-2 text-xs">Logo colors · Select a suggestion for the primary color</p><div className="flex flex-wrap gap-2">{suggestions.map(color => <button key={color} type="button" aria-label={`Use ${color} as primary color`} title={color} className="h-11 w-11 rounded-lg border-2 border-slate-300" style={{ backgroundColor: color }} onClick={() => update('primaryColor', color)} />)}</div></div>}
          <div className="grid grid-cols-2 gap-4">{(['primaryColor','accentColor'] as const).map(key => <label key={key} className="text-sm font-semibold">{key === 'primaryColor' ? 'Primary color' : 'Accent color'}<input type="color" aria-label={key === 'primaryColor' ? 'Primary color' : 'Accent color'} className="mt-2 h-11 w-full cursor-pointer" value={setup[key]} onChange={e => update(key, e.target.value)} /><span className="text-xs font-normal">{setup[key]}</span></label>)}</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Dashboard shades are adjusted for readable controls. Primary action shade: {accessibleColor(setup.primaryColor)}.</p>
        </>}
        <CustomSelect label="Default appearance" value={setup.appearance} options={[{ value: 'system', label: 'System - follow the device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={value => { update('appearance', value as InstitutionSetup['appearance']); setPreviewMode(value === 'dark' ? 'dark' : value === 'light' ? 'light' : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }} />
        <p className="text-xs text-slate-500 dark:text-slate-400">Members can change their own light/dark preference. Institution colors and logo stay consistent.</p>
        </>}
        {currentStep === 'Review' && <>
          <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-slate-800 dark:text-brand-200">{institution ? 'Members will see the updated branding after reloading their workspace.' : 'Creating an institution provisions a separate database and may incur hosting charges. Its administrator email is queued after the workspace passes verification.'}</p>
          <dl className="space-y-4 text-sm">{[['Institution', setup.name], ['Short name', setup.shortName], ['Workspace ID', setup.slug], ['Legal name', setup.legalName], ['Address', setup.address], ['Support email', setup.supportEmail], ['Privacy email', setup.privacyEmail], ['Administrator', setup.adminName], ['Administrator email', setup.adminEmail], ['Username', setup.adminUsername], ['Appearance', setup.appearance]].map(([label, value]) => <div key={label}><dt className="text-slate-500 dark:text-slate-400">{label}</dt><dd className="break-words font-semibold">{value}</dd></div>)}</dl>
          {!institution && <p className="text-sm text-slate-500 dark:text-slate-400">The initial password will be emailed to {setup.adminEmail}. The administrator can change it in their account settings.</p>}
        </>}
      </fieldset>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-700"><Button type="button" fullWidth={false} variant="secondary" disabled={busy || logoBusy} onClick={() => { if (step) { setError(''); setStep(step - 1); } else onClose(); }}>{step ? 'Back' : 'Cancel'}</Button><Button type="submit" fullWidth={false} disabled={busy || logoBusy} loading={busy}>{step === steps.length - 1 ? institution ? 'Save branding' : 'Create institution' : 'Continue'}</Button></div>
      </form></Surface>
      <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900 dark:text-white">Live dashboard preview</h3><div className="flex gap-1">{(['light','dark'] as const).map(mode => <button type="button" key={mode} aria-pressed={previewMode === mode} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm capitalize dark:border-slate-600" onClick={() => setPreviewMode(mode)}>{mode}</button>)}</div></div><InstitutionPreview branding={setup} mode={previewMode} /><p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Try the navigation, records, and QR buttons. All preview data is fictional.</p></aside>
    </div>
  </Page>;
}
