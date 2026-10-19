import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { useEffect, useMemo, useState } from 'react';
import { AcademicNodeType, SchoolNode } from '../../types';
import { academicNodeTypeOptions, getAcademicNodeLabel, getAllowedChildTypes } from '../../lib/academicDirectory';
import Button from '../ui/Button';
import CustomSelect from '../ui/CustomSelect';
import { Modal } from '../ui/Modal';

interface DirectoryNodeModalProps {
  open: boolean;
  parent?: SchoolNode | null;
  node?: SchoolNode | null;
  onClose: () => void;
  onSave: (node: SchoolNode) => void | Promise<void>;
  onCreateOrganization?: (name: string) => void;
}

export function DirectoryNodeModal({ open, parent, node, onClose, onSave, onCreateOrganization }: DirectoryNodeModalProps) {
  const suggestedTypes = useMemo(() => parent ? getAllowedChildTypes(parent) : academicNodeTypeOptions, [parent]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AcademicNodeType>('custom');
  const [shortCode, setShortCode] = useState('');
  const [registration, setRegistration] = useState(true);
  const [events, setEvents] = useState(true);
  const [customizeChildren, setCustomizeChildren] = useState(false);
  const [allowedChildTypes, setAllowedChildTypes] = useState<AcademicNodeType[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(node?.name || '');
    setType(node?.type || suggestedTypes[0] || 'custom');
    setShortCode(node?.metadata?.shortCode || '');
    setRegistration(node?.metadata?.selectableForRegistration ?? true);
    setEvents(node?.metadata?.selectableForEvents ?? true);
    setCustomizeChildren(Boolean(node?.metadata?.allowedChildTypes));
    setAllowedChildTypes(node?.metadata?.allowedChildTypes || []);
  }, [node, open, suggestedTypes]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true); setSaveError('');
    try { await onSave({
      id: node?.id || `${type}_${Date.now()}`,
      name: name.trim(),
      type,
      children: node?.children || [],
      metadata: {
        ...(node?.metadata || {}), shortCode: shortCode.trim() || undefined,
        selectableForRegistration: registration, selectableForEvents: events,
        allowedChildTypes: customizeChildren ? allowedChildTypes : undefined,
      },
    }); } catch (error) { setSaveError(errorMessage(error)); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={node ? 'Edit academic unit' : 'Establish unit'} description="Names are customizable; semantic types keep registration and targeting accurate." size="md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button aria-label={node ? 'Save unit' : 'Establish unit'} variant="gold" onClick={save} disabled={!name.trim() || saving}>Save unit</Button></>}>
      <div className="space-y-4">
        {saveError && <ErrorNotice error={saveError} operation="Directory Node Modal"></ErrorNotice>}
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Unit name<input aria-label="Unit designation" value={name} onChange={(event) => setName(event.target.value)} className="app-control mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="e.g. STEM-12-Newton or College of Computing" /></label>
        <CustomSelect
          label="Semantic type"
          onChange={(value) => value === 'organization' ? onCreateOrganization?.(name) : setType(value as AcademicNodeType)}
          options={[...academicNodeTypeOptions.map((option) => ({
            value: option,
            label: `${getAcademicNodeLabel(option)}${suggestedTypes.includes(option) ? ' — suggested' : ''}`,
          })), ...(!node && onCreateOrganization ? [{ value: 'organization', label: 'Organization' }] : [])]}
          searchable
          value={type}
        />
        <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Short code <span className="font-normal text-slate-400">(optional)</span><input aria-label="Short code" value={shortCode} onChange={(event) => setShortCode(event.target.value)} className="app-control mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm uppercase dark:border-slate-700 dark:bg-slate-900" placeholder="e.g. CCE" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><input type="checkbox" checked={registration} onChange={(event) => setRegistration(event.target.checked)} /> Available in registration</label><label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"><input type="checkbox" checked={events} onChange={(event) => setEvents(event.target.checked)} /> Available for events</label></div>
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={customizeChildren} onChange={(event) => { setCustomizeChildren(event.target.checked); if (!event.target.checked) setAllowedChildTypes([]); }} /> Customize allowed child types</label>
          {customizeChildren && <div className="mt-3 grid gap-2 sm:grid-cols-2">{academicNodeTypeOptions.map((option) => <label key={option} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-200"><input type="checkbox" checked={allowedChildTypes.includes(option)} onChange={(event) => setAllowedChildTypes((current) => event.target.checked ? [...current, option] : current.filter((item) => item !== option))} /> {getAcademicNodeLabel(option)}</label>)}</div>}
        </div>
      </div>
    </Modal>
  );
}
