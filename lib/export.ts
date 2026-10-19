export function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  return toast.sync(() => {
  const quote = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s\uFEFF]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  }, 'Export CSV', 'CSV download started');
}
export const escapeHtml = (text: unknown) => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
import { toast } from './toast';
