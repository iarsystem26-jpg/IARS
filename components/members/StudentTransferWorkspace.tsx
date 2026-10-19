import { selectUploadFile, uploadFileBytes, uploadFileText } from '../../lib/fileUploads';
import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { useEffect, useState } from 'react';
import { SchoolNode } from '../../types';
import { appData } from '../../lib/backend';
import { Surface } from '../ui/Page';
import { findNodePath } from '../../lib/academicDirectory';
import { AcademicPathPicker } from '../academic/AcademicPathPicker';
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, Info, Search, Upload, Users } from 'lucide-react';
import Button from '../ui/Button';
import ProfileAvatar from '../ui/ProfileAvatar';
import { assignmentLabel, csvText, downloadTransferFile, exportTransferWorkbook, parseTransferCsv, readTransferWorkbook, sortedTransferStudents, StudentTransfer, TransferStudent, SIMPLE_TRANSFER_COLUMNS, transferClassChoices, transferDestinations, simpleTransferExportRows, validateTransferRecords } from '../../lib/studentTransfers';

function TransferStudentIdentity({ student, onShowProfile }: { student?: TransferStudent; onShowProfile?: (student: TransferStudent) => void }) {
  return <div className="flex min-w-0 items-start gap-3">
    <ProfileAvatar src={student?.photo_url} alt={student ? `Profile picture of ${student.name}` : ''} loading="lazy" className="h-11 w-11 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700" />
    <div className="min-w-0"><span className="block text-sm font-semibold">{student?.name}</span><span className="mt-1 block font-mono text-xs font-normal text-slate-500">{student?.student_id}</span>{student && onShowProfile && <Button fullWidth={false} size="sm" variant="secondary" className="mt-2" aria-label={`Show profile for ${student.name} (${student.student_id})`} onClick={() => onShowProfile(student)}>Show profile</Button>}</div>
  </div>;
}

export default function StudentTransferWorkspace({ nodes, initialNodeId, onShowProfile }: { nodes: SchoolNode[]; initialNodeId?: string; onShowProfile?: (student: TransferStudent) => void }) {
  const [students, setStudents] = useState<TransferStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [sourcePath, setSourcePath] = useState<SchoolNode[]>(() => initialNodeId ? findNodePath(nodes, initialNodeId) || [] : []);
  const [destinationPath, setDestinationPath] = useState<SchoolNode[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<StudentTransfer[]>([]);
  const [page, setPage] = useState(0);
  const [method, setMethod] = useState<'manual' | 'spreadsheet'>('manual');
  const [fileName, setFileName] = useState('');
  const destinations = transferDestinations(nodes);
  const destinationNode = destinationPath.at(-1);
  const destination = destinations.find(node => node.id === destinationNode?.id)?.id || '';
  const destinationHint = !destinationNode ? 'Choose a destination block or section to continue.'
    : !destination && !destinations.some(node => findNodePath(nodes, node.id)?.some(parent => parent.id === destinationNode.id))
      ? `“${destinationNode.name}” has no active blocks or sections. Ask a school administrator to add a block or section inside this group, or choose another destination class.`
      : !destination ? `“${destinationNode.name}” is a group. Continue to a specific block or section to transfer students.`
        : !selected.size ? 'Select at least one student to continue.' : '';
  useEffect(() => {
    let active = true;
    appData.getTransferRoster().then(data => { if (active) setStudents(data); }).catch(e => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const sourceNodeId = sourcePath.at(-1)?.id;
  const filtered = sortedTransferStudents(students, nodes).filter(student => (!sourceNodeId || findNodePath(nodes, student.node_id)?.some(node => node.id === sourceNodeId)) && `${student.name} ${student.student_id}`.toLowerCase().includes(search.toLowerCase()));
  const displayed = filtered.slice(page * 50, (page + 1) * 50);
  const perform = async (task: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await task(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const toggle = (uid: string) => setSelected(previous => { const next = new Set(previous); next.has(uid) ? next.delete(uid) : next.add(uid); return next; });
  const prepare = () => {
    setError(''); setMessage('');
    try {
      const rows = students.filter(s => selected.has(s.uid)).map(s => [s.student_id, s.node_id, destination]);
      setPreview(validateTransferRecords([['student_id', 'source_node_id', 'destination_node_id'], ...rows], students, nodes));
    } catch (e) { setError(errorMessage((e as Error))); }
  };
  const apply = () => perform(async () => {
    const count = await appData.transferStudents(preview);
    // Clear the submitted preview immediately so a refresh failure cannot cause resubmission.
    setPreview([]); setSelected(new Set()); setMessage(`${count} student${count === 1 ? '' : 's'} transferred.`);
    setLoading(true);
    try { setStudents(await appData.getTransferRoster()); } finally { setLoading(false); }
  });
  const cardTitle = 'text-lg font-bold text-brand-900 dark:text-white';
  const muted = 'text-sm leading-6 text-slate-600 dark:text-slate-300';
  const tableHead = 'bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900/60 dark:text-slate-400';
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2" aria-label="Transfer workflow">
      {['Choose students', 'Review changes', 'Apply transfers'].map((label, index) => <div key={label} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${index === (preview.length ? 1 : 0) ? 'bg-brand-900 text-white dark:bg-brand-700' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}><span className="flex h-5 w-5 items-center justify-center rounded-full border border-current">{index + 1}</span>{label}</div>)}
    </div>
    {error && <ErrorNotice error={error} operation="Student Transfer Workspace"></ErrorNotice>}
    {message && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><CheckCircle2 size={18} />{message}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Surface className="min-w-0 overflow-hidden">
        {preview.length ? <>
          <div className="border-b border-slate-200 p-5 sm:p-6 dark:border-slate-700"><p className="mb-1 text-xs font-bold uppercase tracking-widest text-gold-600 dark:text-gold-300">Confirm assignments</p><h2 className={cardTitle}>Review {preview.length} assignment changes</h2><p className={`mt-2 ${muted}`}>Check each student's current and destination class before applying this batch.</p></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className={tableHead}><tr><th scope="col" className="px-5 py-3">Student</th><th scope="col" className="px-5 py-3">From</th><th scope="col" className="px-5 py-3">To</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{preview.map(change => <tr key={change.uid}><td className="px-5 py-4 font-semibold"><TransferStudentIdentity student={students.find(s => s.uid === change.uid)} onShowProfile={onShowProfile} /></td><td className="px-5 py-4">{assignmentLabel(nodes, change.source_node_id)}</td><td className="px-5 py-4 font-semibold text-brand-800 dark:text-brand-200">{assignmentLabel(nodes, change.destination_node_id)}</td></tr>)}</tbody></table></div>
          <div className="space-y-4 border-t border-slate-200 p-5 sm:p-6 dark:border-slate-700"><p className={muted}>All changes will be applied together. Any invalid or outdated assignment will reject the entire batch.</p><div className="flex flex-wrap gap-3"><Button fullWidth={false} disabled={busy} onClick={apply}>{busy ? 'Applying...' : `Apply ${preview.length} transfers`}<ArrowRight size={16} /></Button><Button fullWidth={false} disabled={busy} variant="secondary" onClick={() => setPreview([])}>Back</Button></div></div>
        </> : <>
          <div className="border-b border-slate-200 p-5 sm:p-6 dark:border-slate-700"><h2 className={cardTitle}>Choose your transfer method</h2><p className={`mt-1 ${muted}`}>Select students here, or upload an edited template for a batch transfer.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{([{ id: 'manual', label: 'Select students', icon: Users }, { id: 'spreadsheet', label: 'Use a spreadsheet', icon: FileSpreadsheet }] as const).map(item => <Button key={item.id} variant={method === item.id ? 'primary' : 'secondary'} disabled={busy} aria-pressed={method === item.id} onClick={() => setMethod(item.id)}><item.icon size={17} />{item.label}</Button>)}</div></div>
          {method === 'spreadsheet' ? <div className="space-y-6 p-5 sm:p-6">
            <fieldset disabled={busy || loading} className="space-y-4"><legend className="mb-2 text-sm font-bold">1. Download your template</legend><p className={muted}>The easy workbook has student names, current classes, and a yellow column with a dropdown for the new class.</p><Button fullWidth={false} onClick={() => perform(() => exportTransferWorkbook(students, nodes))}><Download size={16} />Download easy template</Button><div className="flex flex-wrap gap-2"><Button fullWidth={false} size="sm" variant="secondary" onClick={() => downloadTransferFile(csvText([[...SIMPLE_TRANSFER_COLUMNS], ...simpleTransferExportRows(students, nodes)]), 'student-transfers.csv', 'text/csv;charset=utf-8')}>Export students CSV</Button><Button fullWidth={false} size="sm" variant="secondary" onClick={() => downloadTransferFile(csvText([['Move to class'], ...transferClassChoices(nodes).map(choice => [choice.label])]), 'assignment-legend.csv', 'text/csv;charset=utf-8')}>Export class names CSV</Button></div></fieldset>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-900/50"><h3 className="text-sm font-bold">2. Choose the new class</h3><p className={`mt-2 ${muted}`}>In the Students tab, choose a class from the dropdown in the yellow <strong>Move to class</strong> column. Leave it blank for students who are staying. To move a whole section, choose a class once, then copy that cell into the other students' yellow cells. Keep the other columns unchanged.</p><p className={`mt-2 ${muted}`}>Using CSV, or a spreadsheet app without dropdowns? Copy the class name from Assignment Legend or the class names CSV.</p></div>
            <fieldset disabled={busy || loading}><legend className="mb-3 text-sm font-bold">3. Import and review</legend><label className="block rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-600 dark:bg-slate-900/40"><span className="flex items-center gap-2 text-sm font-semibold"><Upload size={18} />Import CSV or workbook</span><span className={`mt-2 block ${muted}`}>Choose a .csv or .xlsx file, up to 10 MB. Uploading opens a preview for your review.</span><input aria-label="Import student transfers" type="file" accept=".csv,.xlsx" className="mt-4 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-900 file:px-4 file:py-2 file:font-semibold file:text-white" onChange={event => {
              const file = selectUploadFile(event.currentTarget, 10 * 1024 * 1024); if (!file) return;
              setPreview([]); setFileName(file.name);
              void perform(async () => {
                if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file of 10 MB or smaller.');
                const changes = file.name.toLowerCase().endsWith('.xlsx') ? validateTransferRecords(await readTransferWorkbook(await uploadFileBytes(file)), students, nodes) : parseTransferCsv(await uploadFileText(file), students, nodes);
                setPreview(changes);
              });
            }} /></label>{fileName && <p className={`mt-2 break-all ${muted}`}>Selected file: {fileName}</p>}</fieldset>
            {loading && <p role="status" className={muted}>Loading students...</p>}
          </div> : <>
            <fieldset aria-label="Student filters" disabled={busy || loading} className="space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Filter by academic unit</h3><Button fullWidth={false} size="sm" variant="secondary" disabled={busy || loading || !sourcePath.length} onClick={() => { setSourcePath([]); setPage(0); }}>All units in your scope</Button></div>
              <p className="text-xs leading-5 text-slate-500">Choose a campus, then continue through its units to a class. Choose All of to include every class under a unit. Empty classes are also available.</p>
              <AcademicPathPicker roots={nodes} value={sourcePath.map(node => node.id)} allowParentSelection includeArchived disabled={busy || loading} onChange={path => { setSourcePath(path); setPage(0); }} />
              <label className="block text-sm font-semibold">Search student name or ID<div className="relative mt-1"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-slate-400" /><input type="search" placeholder="Enter a name or student ID" className="app-control min-h-11 w-full py-2 pl-10 pr-3" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></div></label>
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 bg-slate-50/70 px-5 py-3 dark:border-slate-700 dark:bg-slate-900/40"><span className="text-sm font-semibold">{filtered.length} students <span className="font-normal text-slate-500">&middot; {selected.size} selected</span></span><div className="flex flex-wrap gap-2"><Button fullWidth={false} size="sm" variant="secondary" disabled={busy || loading || !filtered.length} onClick={() => setSelected(new Set(filtered.map(s => s.uid)))}>Select all filtered ({filtered.length})</Button><Button fullWidth={false} size="sm" variant="secondary" disabled={busy || loading || !selected.size} onClick={() => setSelected(new Set())}>Clear selection</Button></div></div>
            {loading ? <p role="status" className="p-6 text-sm text-slate-500">Loading students...</p> : <>
              <div className="hidden overflow-x-auto sm:block"><table className="w-full text-left text-sm"><thead className={tableHead}><tr><th scope="col" className="w-16 px-5 py-3">Select</th><th scope="col" className="px-5 py-3">Name / ID</th><th scope="col" className="px-5 py-3">Institutional unit / class</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{displayed.map(s => <tr key={s.uid} className={selected.has(s.uid) ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}><td className="px-5 py-4"><input type="checkbox" className="h-4 w-4 accent-brand-900" disabled={busy} aria-label={`Select ${s.name} (${s.student_id})`} checked={selected.has(s.uid)} onChange={() => toggle(s.uid)} /></td><td className="px-5 py-4 font-semibold"><TransferStudentIdentity student={s} onShowProfile={onShowProfile} /></td><td className="px-5 py-4 text-slate-600 dark:text-slate-300">{assignmentLabel(nodes, s.node_id)}</td></tr>)}</tbody></table>{!filtered.length && <div className="p-10 text-center"><Users className="mx-auto mb-3 text-slate-400" size={28} /><p className="font-semibold">No students match these filters.</p><p className={`mt-1 ${muted}`}>Try another name or choose a different current class.</p></div>}</div>
              <div className="divide-y divide-slate-200 sm:hidden dark:divide-slate-700">{displayed.map(s => <div key={s.uid} className={`flex items-start gap-3 p-5 ${selected.has(s.uid) ? 'bg-brand-50 dark:bg-brand-900/30' : ''}`}><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-brand-900" disabled={busy} aria-label={`Select ${s.name} (${s.student_id})`} checked={selected.has(s.uid)} onChange={() => toggle(s.uid)} /><div className="min-w-0"><TransferStudentIdentity student={s} onShowProfile={onShowProfile} /><span className="mt-2 block text-xs leading-5 text-slate-600 dark:text-slate-300">{assignmentLabel(nodes, s.node_id)}</span></div></div>)}{!filtered.length && <p className="p-6 text-center text-sm text-slate-500">No students match these filters.</p>}</div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700"><span className="text-xs text-slate-500">Page {page + 1} of {Math.max(1, Math.ceil(filtered.length / 50))}</span><div className="flex gap-2"><Button fullWidth={false} size="sm" variant="secondary" disabled={!page || busy} onClick={() => setPage(p => p - 1)}>Previous</Button><Button fullWidth={false} size="sm" variant="secondary" disabled={(page + 1) * 50 >= filtered.length || busy} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
            </>}
            <fieldset aria-label="Destination class" disabled={busy || loading} className="space-y-4 border-t border-slate-200 bg-slate-50/70 p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-900/40">
              <h3 className="text-sm font-semibold">Destination class (higher or lower year)</h3>
              <p className="text-xs leading-5 text-slate-500">Choose a campus, then continue through its academic units to a specific block or section. Select a class before reviewing the transfer.</p>
              <AcademicPathPicker roots={nodes} value={destinationPath.map(node => node.id)} disabled={busy || loading} onChange={setDestinationPath} />
              {destinationHint && <p role="status" className="text-sm leading-6 text-slate-600 dark:text-slate-300">{destinationHint}</p>}
              {!destinations.length && <p role="status" className={muted}>No active destination classes are available in your scope.</p>}
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Selections stay selected when you change filters.</p><Button fullWidth={false} disabled={busy || loading || !destination || !selected.size} onClick={prepare}>Review selected students ({selected.size})<ArrowRight size={16} /></Button></div>
            </fieldset>
          </>}
        </>}
      </Surface>
      <aside className="space-y-4" aria-label="Transfer instructions">
        <Surface className="p-5"><h2 className={`flex items-center gap-2 ${cardTitle}`}><Info size={19} className="text-gold-600" />How to transfer</h2><ol className="mt-4 space-y-4">{(method === 'manual' ? [['Select students', 'Choose a campus, then follow its units down to a class, just like enrollment. Choose All of to include a whole unit. Tick the students you want to move.'], ['Choose a destination', 'Choose a campus, then follow its academic units to a specific block or section, just like enrollment. Choose a higher year to move up, or a lower year to move down.'], ['Review and apply', 'Review the list and class assignments. Press Apply transfers to save the changes.']] : [['Download the easy template', 'Open Students in the workbook. The yellow column is the only column you need to edit.'], ['Choose new classes', 'Use the Move to class dropdown. Leave blank to keep the current class, or copy the same choice down for a whole section.'], ['Import, review, and apply', 'Upload your edited file, check every change in the preview, then apply the batch.']]).map(([title, text], index) => <li key={title} className="flex gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-800 dark:bg-brand-900 dark:text-brand-200">{index + 1}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className={`mt-1 ${muted}`}>{text}</p></div></li>)}</ol></Surface>
        <Surface className="p-5"><h2 className="text-sm font-bold">Before you apply</h2><ul className={`mt-3 list-disc space-y-2 pl-4 ${muted}`}><li>Attendance records and balances stay with each student.</li><li>Transferred mayors become students. Appoint a mayor separately in the new class.</li><li>Transfer up to 1,000 students per batch within your assigned scope.</li><li>Students already in the destination class are skipped.</li></ul></Surface>
      </aside>
    </div>
  </div>;
}
