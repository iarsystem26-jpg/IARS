import { afterEach, expect, it, vi } from 'vitest';
import { downloadCsv, escapeHtml } from './export';
vi.mock('./toast', () => ({ toast: { sync: (operation: () => unknown) => operation() } }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('neutralizes spreadsheet formulas including whitespace and control-character prefixes', async () => {
  let saved!: Blob;
  vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { saved = blob; return 'blob:export'; }, revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  downloadCsv('records.csv', [['=1+1', '  =HYPERLINK("https://example.com")', '\n=1+1', '+1', '@SUM(A1)', 'Regular, name']]);
  const text = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(saved); });
  expect(text).toContain('"\'=1+1"');
  expect(text).toContain('"\'  =HYPERLINK(""https://example.com"")"');
  expect(text).toContain('"\'\n=1+1"');
  expect(text).toContain('"\'+1"');
  expect(text).toContain('"\'@SUM(A1)"');
  expect(text).toContain('"Regular, name"');
});
it('escapes untrusted content in exported HTML', () => {
  expect(escapeHtml('<img src="x" onerror=\'alert(1)\'>&')).toBe('&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt;&amp;');
});
