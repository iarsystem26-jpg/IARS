import { selectUploadFile, uploadFileText } from '../../lib/fileUploads';
import { errorMessage } from '../../lib/errors';
import ErrorNotice from '../ui/ErrorNotice';
import { SelectField } from '../ui/SelectField';
import { useMemo, useRef, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import Button from '../ui/Button';
import { Modal } from '../ui/Modal';
import {
  createMemberCsvTemplate,
  ExistingMemberIdentity,
  MemberCsvColumn,
  MemberCsvRow,
  parseMemberCsv,
  validateMemberCsvRows,
} from '../../lib/memberCsv';

interface BulkMemberImportModalProps {
  open: boolean;
  sectionName: string;
  onClose: () => void;
  onConfirm: (rows: MemberCsvRow[]) => void | Promise<void>;
  existingMembers?: ExistingMemberIdentity[];
}

const fields: Array<{ key: MemberCsvColumn; label: string; type?: string }> = [
  { key: 'name', label: 'Legal full name' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'username', label: 'Username' },
  { key: 'student_id', label: 'Student ID' },
  { key: 'phone', label: 'Phone' },
  { key: 'guardian_name', label: 'Guardian name' },
  { key: 'guardian_contact', label: 'Guardian contact' },
  { key: 'guardian_email', label: 'Guardian email', type: 'email' },
];

export default function BulkMemberImportModal({
  open,
  sectionName,
  onClose,
  onConfirm,
  existingMembers = [],
}: BulkMemberImportModalProps) {
  const [rows, setRows] = useState<MemberCsvRow[]>([]);
  const [reviewIds, setReviewIds] = useState<number[]>([]);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const nextReviewId = useRef(1);
  const uploadRequest = useRef(0);
  const validation = useMemo(() => validateMemberCsvRows(rows, existingMembers), [existingMembers, rows]);

  const resetAndClose = () => {
    setRows([]);
    setReviewIds([]);
    setFileName('');
    setFileError('');
    setSubmitting(false);
    setReadingFile(false);
    uploadRequest.current += 1;
    onClose();
  };

  const downloadTemplate = () => {
    const blob = new Blob([createMemberCsvTemplate()], { type: 'text/csv;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${sectionName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'section'}-members-template.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const uploadFile = async (file?: File) => {
    if (!file) return;
    const request = ++uploadRequest.current;
    setFileName(file.name);
    setFileError('');
    setRows([]);
    setReviewIds([]);
    setReadingFile(true);
    try {
      const parsed = parseMemberCsv(await uploadFileText(file));
      if (request !== uploadRequest.current) return;
      setRows(parsed);
      setReviewIds(parsed.map(() => nextReviewId.current++));
      if (parsed.length === 0) setFileError('No people were found. Add at least one completed row and upload the file again.');
    } catch (error) {
      if (request !== uploadRequest.current) return;
      setRows([]);
      setReviewIds([]);
      setFileError(errorMessage(error));
    } finally {
      if (request === uploadRequest.current) setReadingFile(false);
    }
  };

  const updateRow = (rowIndex: number, field: MemberCsvColumn, value: string) => {
    setRows((current) => current.map((row, index) => (
      index === rowIndex
        ? { ...row, [field]: field === 'role' ? value.toLowerCase() : value }
        : row
    )));
  };

  const confirm = async () => {
    if (!validation.valid || submitting || readingFile) return;
    setSubmitting(true);
    setFileError('');
    try {
      await onConfirm(rows);
      setRows([]);
      setReviewIds([]);
      setFileName('');
      setSubmitting(false);
    } catch (error) {
      setFileError(errorMessage(error));
      setSubmitting(false);
    }
  };

  const detectedLabel = `${rows.length} ${rows.length === 1 ? 'person' : 'people'} detected`;

  return (
    <Modal
      closeOnBackdrop={false}
      description={`Import members into ${sectionName}. Nothing is created until you review and confirm every row.`}
      footer={(
        <>
          <Button variant="secondary" onClick={resetAndClose}>Cancel</Button>
          <Button
            aria-label={`Create ${rows.length} ${rows.length === 1 ? 'member' : 'members'}`}
            disabled={!validation.valid || readingFile}
            loading={submitting}
            onClick={confirm}
            variant="gold"
          >
            Create {rows.length} {rows.length === 1 ? 'member' : 'members'}
          </Button>
        </>
      )}
      onClose={resetAndClose}
      open={open}
      size="xl"
      title={`Bulk create members in ${sectionName}`}
    >
      <div className="space-y-6">
        <section aria-labelledby="bulk-import-instructions" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60 sm:p-5">
          <div className="flex items-start gap-3">
            <FileSpreadsheet aria-hidden="true" className="mt-0.5 shrink-0 text-gold-600 dark:text-gold-400" size={22} />
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-brand-900 dark:text-white" id="bulk-import-instructions">Prepare the CSV file</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                <li>Download the template and open it in Excel, Google Sheets, or LibreOffice.</li>
                <li>Complete the required columns: name, email, username, and student ID.</li>
                <li>Use <strong>student</strong> or <strong>mayor</strong> for role. Optional blanks are allowed.</li>
                <li>Save as CSV, upload it below, then inspect and edit every detected person.</li>
              </ol>
              <Button className="mt-4 sm:w-auto" onClick={downloadTemplate} variant="secondary">
                <Download size={16} /> Download CSV template
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="bulk-upload-heading">
          <div>
            <h3 className="font-bold text-brand-900 dark:text-white" id="bulk-upload-heading">Upload and detect members</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">CSV files stay on this device until you confirm creation.</p>
          </div>
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-4 py-5 text-center transition-colors hover:border-gold-400 dark:border-slate-600 dark:hover:border-gold-400">
            <Upload aria-hidden="true" className="text-slate-400" size={24} />
            <span className="mt-2 text-sm font-semibold text-brand-900 dark:text-white">Upload completed CSV</span>
            <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">{readingFile ? `Reading ${fileName}…` : fileName || 'Choose a .csv file'}</span>
            <input
              accept=".csv,text/csv,application/csv"
              aria-label="Upload completed CSV"
              className="sr-only"
              onChange={async (event) => {
                await uploadFile(selectUploadFile(event.currentTarget, 10 * 1024 * 1024));
              }}
              type="file"
            />
          </label>
        </section>

        {fileError ? (
          <ErrorNotice error={fileError} operation="Bulk Member Import Modal"><AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={16} /></ErrorNotice>
        ) : null}

        {rows.length > 0 ? (
          <section className="space-y-4" aria-labelledby="bulk-review-heading">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-bold text-brand-900 dark:text-white" id="bulk-review-heading">Review every person</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{detectedLabel}. Correct highlighted fields before creating accounts.</p>
              </div>
              {!validation.valid ? <span className="text-xs font-semibold text-red-600 dark:text-red-300">Fix all errors to continue</span> : null}
            </div>

            {validation.rows.map(({ row, errors }, rowIndex) => (
              <fieldset
                aria-label={`Review person ${rowIndex + 1}`}
                className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"
                key={reviewIds[rowIndex]}
              >
                <legend className="font-bold text-brand-900 dark:text-white">Person {rowIndex + 1}</legend>
                <div className="-mt-6 mb-4 flex justify-end">
                  <Button
                    aria-label={`Remove person ${rowIndex + 1}`}
                    iconOnly
                    onClick={() => {
                      setRows((current) => current.filter((_, index) => index !== rowIndex));
                      setReviewIds((current) => current.filter((_, index) => index !== rowIndex));
                    }}
                    size="sm"
                    variant="danger"
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {fields.map(({ key, label, type = 'text' }) => (
                    <label className="space-y-1.5" key={key}>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
                      <input
                        aria-label={`${label} for person ${rowIndex + 1}`}
                        aria-describedby={errors[key] ? `review-${reviewIds[rowIndex]}-${key}-error` : undefined}
                        aria-invalid={Boolean(errors[key])}
                        className={`app-control ${`h-11 w-full rounded-xl border bg-white px-3 text-sm text-brand-900 outline-none focus:border-gold-400 dark:bg-slate-900 dark:text-white ${errors[key] ? 'border-amber-600 dark:border-amber-400' : 'border-slate-200 dark:border-slate-700'}`}`}
                        onChange={(event) => updateRow(rowIndex, key, event.target.value)}
                        placeholder={key === 'student_id' ? 'YYYY-XXXXXL' : undefined}
                        type={type}
                        value={row[key]}
                      />
                      {errors[key] ? <ErrorNotice id={`review-${reviewIds[rowIndex]}-${key}-error`} error={errors[key]} /> : null}
                    </label>
                  ))}
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Role</span>
                    <SelectField
                      aria-label={`Role for person ${rowIndex + 1}`}
                      aria-describedby={errors.role ? `review-${reviewIds[rowIndex]}-role-error` : undefined}
                      aria-invalid={Boolean(errors.role)}
                      className="mt-1 min-w-0"
                      onChange={(event) => updateRow(rowIndex, 'role', event)}
                      value={row.role}
                    >
                      {!['student', 'mayor'].includes(row.role) ? <option value={row.role}>{row.role || 'Invalid role'}</option> : null}
                      <option value="student">Student</option>
                      <option value="mayor">Mayor</option>
                    </SelectField>
                    {errors.role ? <ErrorNotice id={`review-${reviewIds[rowIndex]}-role-error`} error={errors.role} /> : null}
                  </label>
                </div>
              </fieldset>
            ))}
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
