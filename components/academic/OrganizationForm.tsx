import { selectUploadFile, retainedUploadFile } from '../../lib/fileUploads';
import ErrorNotice from '../ui/ErrorNotice';
import { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import { Organization, UserProfile } from '../../types';
import { appData } from '../../lib/backend';
import { flattenDirectory, getDirectorySubtree } from '../../lib/academicDirectory';
import { createDriveImage, deleteDriveImage, validateProfileImage } from '../../lib/googleDrive';
import { canCreateOrganization, organizationError } from '../../lib/organizations';
import Button from '../ui/Button';
import CustomSelect from '../ui/CustomSelect';
import ProfileAvatar from '../ui/ProfileAvatar';
import { Modal } from '../ui/Modal';

export default function OrganizationForm({ organization, profile, onClose, initialNodeId, initialName = '', lockScope = false }: {
  organization?: Organization; profile: UserProfile; onClose: () => void;
  initialNodeId?: string | null; lockScope?: boolean;
  initialName?: string;
}) {
  const [name, setName] = useState(organization?.name || initialName);
  const [description, setDescription] = useState(organization?.description || '');
  const assignment = profile.official_data?.assignment_node_id || profile.school_data.academic_assignment?.terminalGroupId || '';
  const [node, setNode] = useState(organization ? organization.node_id || '' : initialNodeId !== undefined ? initialNodeId || '' : profile.role === 'admin' ? '' : assignment);
  const [heads, setHeads] = useState(organization?.head_ids || (initialNodeId ? [] : [profile.uid]));
  const [visible, setVisible] = useState(organization?.visible ?? true);
  const [joining, setJoining] = useState(organization?.joining || 'closed');
  const [keyRequired, setKeyRequired] = useState(organization?.key_required ?? false);
  const [key, setKey] = useState('');
  const [logo, setLogo] = useState<File>();
  const [preview, setPreview] = useState('');
  const logoInput = useRef<HTMLInputElement>(null);
  const logoId = useId();
  const [people, setPeople] = useState<Array<{ uid: string; name: string; student_id?: string; photo_url?: string }>>([]);

  useEffect(() => {
    if (!logo) { setPreview(''); return; }
    let active = true;
    let url = '';
    setPreview('');
    void retainedUploadFile(logo).then(file => {
      if (!active) return;
      url = URL.createObjectURL(file);
      setPreview(url);
    }).catch(error => { if (active) setError(organizationError(error)); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [logo]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canAssign = organization?.can_assign_heads ?? (canCreateOrganization(profile) && (profile.role === 'admin' || Boolean(organization?.node_id || node)));
  const roots = appData.getSchoolStructure();
  const units = flattenDirectory(profile.role === 'admin' ? roots : getDirectorySubtree(roots, assignment));

  useEffect(() => {
    let active = true;
    if (canAssign) appData.getOrganizationPeople(organization?.id || null, node || null)
      .then(value => { if (active) setPeople(value); }).catch(error => { if (active) setError(organizationError(error)); });
    return () => { active = false; };
  }, [organization?.id, node, canAssign]);

  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    let uploaded: { id: string; url: string } | undefined;
    try {
      if (!name.trim()) throw new Error('Enter an organization name.');
      if (!logo && !organization?.logo_url) throw new Error('Choose an organization logo.');
      if (keyRequired && ((!organization?.key_required && !key) || (key && (key.length < 6 || key.length > 128)))) throw new Error('Use a join key with 6 to 128 characters.');
      if (logo) uploaded = await createDriveImage(logo, name.trim(), `organization-${organization?.id || crypto.randomUUID()}`);
      await appData.organizationCommand(organization ? 'update' : 'create', {
        organizationId: organization?.id, name: name.trim(), description, node_id: organization ? organization.node_id : node || null,
        ...(canAssign ? { head_ids: heads } : {}), visible, joining, key_required: keyRequired,
        ...(key ? { key } : {}), logo_url: uploaded?.url || organization?.logo_url || '',
      });
      onClose();
    } catch (error) {
      setError(organizationError(error));
      if (uploaded) await deleteDriveImage(uploaded.id, 'failed-save').catch(() => {});
    } finally { setBusy(false); }
  };

  return <Modal open onClose={() => { if (!busy) onClose(); }} title={organization ? 'Organization settings' : 'Establish organization'}
    description="Choose its academic scope, heads, and membership policy. Students can belong to several organizations."
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save organization'}</Button></>}>
    <div className="space-y-4">
      {error && <ErrorNotice error={error} operation="Organization Form"></ErrorNotice>}
      <label className="app-field-label">Organization name<input className="input-field mt-2" maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="app-field-label">Description<textarea className="input-field mt-2" maxLength={4000} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="space-y-2">
        <label className="app-field-label" htmlFor={logoId}>Organization logo</label>
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 dark:border-slate-600 dark:bg-slate-900">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
            {preview ? <img src={preview} alt="Selected organization logo preview" className="h-full w-full object-contain" />
              : organization?.logo_url ? <ProfileAvatar src={organization.logo_url} alt="Current organization logo" className="h-full w-full object-contain" />
              : <ImagePlus aria-hidden="true" size={28} className="text-slate-400" />}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Button fullWidth={false} variant="secondary" size="sm" disabled={busy} onClick={() => logoInput.current?.click()}><Upload size={16} />{logo || organization?.logo_url ? 'Change image' : 'Choose image'}</Button>
            <p className="break-all text-xs text-slate-600 dark:text-slate-300">{logo?.name || 'Choose a logo for your organization.'}</p>
            <p id={`${logoId}-help`} className="text-xs text-slate-500">JPG, PNG, or WebP, up to 5 MB.</p>
            {logo && <button type="button" disabled={busy} className="text-xs font-semibold text-brand-700 underline dark:text-gold-300" onClick={() => { setLogo(undefined); if (logoInput.current) logoInput.current.value = ''; }}>Remove selected image</button>}
          </div>
          <input id={logoId} ref={logoInput} className="sr-only" tabIndex={-1} disabled={busy} aria-describedby={`${logoId}-help`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => {
            const file = selectUploadFile(e.currentTarget); if (!file) return;
            try { validateProfileImage(file); setLogo(file); setError(''); } catch (error) { setError(organizationError(error)); e.target.value = ''; }
          }} />
        </div>
      </div>
      <CustomSelect label="Organization unit" disabled={Boolean(organization) || lockScope} searchable value={node} onChange={v => { setNode(String(v)); setHeads([]); }} options={[
        ...(profile.role === 'admin' ? [{ value: '', label: 'General school — all units' }] : []), ...units.map(n => ({ value: n.id, label: n.name })),
      ]} />
      {lockScope && !organization && <p className="text-sm text-slate-500 dark:text-slate-400">Assigned to the unit you opened in the hierarchy. To use another unit, close this form and open that unit first.</p>}
      {canAssign && <CustomSelect label="Organization heads" multi searchable searchPlaceholder="Search by name or student ID" value={heads} onChange={v => setHeads(v as string[])} options={people.map(p => ({ value: p.uid, label: p.name, searchText: p.student_id,
        content: <span className="flex items-center gap-3 text-left"><ProfileAvatar src={p.photo_url || appData.getUserDetail?.(p.uid)?.profile.photo_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /><span className="min-w-0"><span className="block truncate">{p.name}</span><span className="block truncate text-xs font-normal text-slate-500 dark:text-slate-400">{p.student_id || 'No student ID'}</span></span></span>,
      }))} />}
      <CustomSelect label="Self joining" value={joining} onChange={v => setJoining(v as Organization['joining'])} options={[
        { value: 'closed', label: 'Closed — heads add members' }, { value: 'open', label: 'Open — join immediately' }, { value: 'approval', label: 'Applications — head approval required' },
      ]} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={keyRequired} onChange={e => setKeyRequired(e.target.checked)} /> Require a join key</label>
      {keyRequired && <label className="app-field-label">{organization?.key_required ? 'Replace join key (leave blank to keep)' : 'Join key'}<input autoComplete="new-password" type="password" className="input-field mt-2" minLength={6} maxLength={128} value={key} onChange={e => setKey(e.target.value)} /><span className="mt-1 block text-xs font-normal">Share the key with eligible students. Saved keys cannot be displayed.</span></label>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} /> Visible in the public organization directory</label>
      {!visible && <p className="text-sm text-slate-500">Members and heads retain access. Public discovery and self joining are hidden.</p>}
    </div>
  </Modal>;
}
