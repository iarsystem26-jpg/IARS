import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BulkMemberImportModal from './BulkMemberImportModal';
import { MEMBER_CSV_COLUMNS } from '../../lib/memberCsv';
import * as fileUploads from '../../lib/fileUploads';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BulkMemberImportModal', () => {
  it('downloads the universal CSV template from the instructions panel', async () => {
    const user = userEvent.setup();
    const objectUrl = vi.fn(() => 'blob:member-template');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: objectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<BulkMemberImportModal open sectionName="Newton" onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByText(/complete the required columns/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /download csv template/i }));

    expect(objectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it('detects uploaded people, blocks invalid data, and submits corrected review rows', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulkMemberImportModal open sectionName="Newton" onClose={vi.fn()} onConfirm={onConfirm} />);
    const csv = [
      MEMBER_CSV_COLUMNS.join(','),
      'Ada Lovelace,invalid-email,ada.lovelace,2026-01001A,mayor,09170000000,Ann Lovelace,09171111111,ann@example.edu',
    ].join('\r\n');
    const file = new File([csv], 'newton-members.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => csv });

    await user.upload(screen.getByLabelText(/upload completed csv/i), file);

    expect(await screen.findByText(/1 person detected/i)).toBeInTheDocument();
    const review = screen.getByRole('group', { name: /review person 1/i });
    expect(within(review).getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    expect(within(review).getByText(/valid email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create 1 member/i })).toBeDisabled();

    const email = within(review).getByRole('textbox', { name: /^email for person 1$/i });
    expect(email).toHaveAccessibleDescription(/valid email/i);
    await user.clear(email);
    await user.type(email, 'ada@example.edu');
    expect(screen.getByRole('button', { name: /create 1 member/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /create 1 member/i }));

    expect(onConfirm).toHaveBeenCalledWith([expect.objectContaining({
      name: 'Ada Lovelace',
      email: 'ada@example.edu',
      role: 'mayor',
      guardian_name: 'Ann Lovelace',
    })]);
  });

  it('lets the officer remove a detected person before confirmation', async () => {
    const user = userEvent.setup();
    render(<BulkMemberImportModal open sectionName="Newton" onClose={vi.fn()} onConfirm={vi.fn()} />);
    const csv = `${MEMBER_CSV_COLUMNS.join(',')}\r\nAda,ada@example.edu,ada,2026-00001A,student,,,,\r\nGrace,grace@example.edu,grace,2026-00002A,student,,,,`;
    const file = new File([csv], 'members.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => csv });
    await user.upload(screen.getByLabelText(/upload completed csv/i), file);
    await screen.findByText(/2 people detected/i);

    await user.click(screen.getByRole('button', { name: /remove person 1/i }));

    await waitFor(() => expect(screen.getByText(/1 person detected/i)).toBeInTheDocument());
    expect(screen.queryByDisplayValue('Ada')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Grace')).toBeInTheDocument();
  });

  it('keeps focus while correcting a student ID across multiple characters', async () => {
    const user = userEvent.setup();
    render(<BulkMemberImportModal open sectionName="Newton" onClose={vi.fn()} onConfirm={vi.fn()} />);
    const csv = `${MEMBER_CSV_COLUMNS.join(',')}\r\nAda,ada@example.edu,ada,X,student,,,,`;
    const file = new File([csv], 'members.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'text', { value: async () => csv });
    await user.upload(screen.getByLabelText(/upload completed csv/i), file);
    const studentId = await screen.findByRole('textbox', { name: /student id for person 1/i });

    await user.clear(studentId);
    await user.type(studentId, '2026-01001A');

    expect(studentId).toHaveValue('2026-01001A');
    expect(studentId).toHaveFocus();
  });

  it('clears stale review rows and only applies the latest overlapping upload', async () => {
    const user = userEvent.setup();
    render(<BulkMemberImportModal open sectionName="Newton" onClose={vi.fn()} onConfirm={vi.fn()} />);
    const input = screen.getByLabelText(/upload completed csv/i);
    const initialCsv = `${MEMBER_CSV_COLUMNS.join(',')}\r\nInitial,initial@example.edu,initial,2026-00001A,student,,,,`;
    const initial = new File([initialCsv], 'initial.csv', { type: 'text/csv' });
    Object.defineProperty(initial, 'text', { value: async () => initialCsv });
    await user.upload(input, initial);
    await screen.findByDisplayValue('Initial');

    let resolveSlow!: (value: string) => void;
    const slowCsv = `${MEMBER_CSV_COLUMNS.join(',')}\r\nSlow,slow@example.edu,slow,2026-00002A,student,,,,`;
    const slow = new File([slowCsv], 'slow.csv', { type: 'text/csv' });
    const readText = fileUploads.uploadFileText;
    vi.spyOn(fileUploads, 'uploadFileText').mockImplementation(file => file === slow
      ? new Promise<string>(resolve => { resolveSlow = resolve; }) : readText(file));
    const latestCsv = `${MEMBER_CSV_COLUMNS.join(',')}\r\nLatest,latest@example.edu,latest,2026-00003A,student,,,,`;
    const latest = new File([latestCsv], 'latest.csv', { type: 'text/csv' });
    Object.defineProperty(latest, 'text', { value: async () => latestCsv });

    fireEvent.change(input, { target: { files: [slow] } });
    expect(screen.queryByDisplayValue('Initial')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create 0 members/i })).toBeDisabled();
    fireEvent.change(input, { target: { files: [latest] } });
    expect(await screen.findByDisplayValue('Latest')).toBeInTheDocument();
    await act(async () => resolveSlow(slowCsv));

    expect(screen.getByDisplayValue('Latest')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Slow')).not.toBeInTheDocument();
  });
});
