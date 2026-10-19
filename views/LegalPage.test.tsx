import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LegalPage from './LegalPage';

const state = vi.hoisted(() => ({ role: 'admin', load: vi.fn(), save: vi.fn() }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: state.role ? { role: state.role } : null }) }));
vi.mock('../components/ui/PublicHeader', () => ({ default: () => null }));
vi.mock('../components/ui/PublicFooter', () => ({ default: () => null }));
vi.mock('../lib/legalPageStore', () => ({ loadLegalPage: state.load, saveLegalPage: state.save }));
const saved = { kind: 'privacy', title: 'Saved policy', summary: 'Saved summary', sections: [{ heading: 'Information', paragraphs: ['Saved paragraph'] }], updated_at: '2026-10-08T00:00:00Z' };
beforeEach(() => {
  state.role = 'admin'; state.load.mockReset().mockResolvedValue(structuredClone(saved)); state.save.mockReset();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const open = () => render(<MemoryRouter><LegalPage kind="privacy" adminPreview /></MemoryRouter>);

it('opens the current saved preview before entering edit mode and saves back to preview', async () => {
  state.save.mockImplementation(async (_kind, draft) => ({ ...saved, ...draft, updated_at: '2026-10-09T00:00:00Z' }));
  open();
  expect(await screen.findByRole('heading', { name: 'Saved policy' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit page' }));
  fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'Updated policy' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('heading', { name: 'Updated policy' })).toBeInTheDocument();
  expect(state.save).toHaveBeenCalledWith('privacy', expect.objectContaining({ title: 'Updated policy' }), saved.updated_at);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('cancels without changing the saved page', async () => {
  open(); await screen.findByRole('heading', { name: 'Saved policy' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit page' }));
  fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'Unsaved policy' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('heading', { name: 'Saved policy' })).toBeInTheDocument();
  expect(state.save).not.toHaveBeenCalled();
});

it('keeps the draft on save failure', async () => {
  state.save.mockRejectedValue(new Error('Connection failed'));
  open(); await screen.findByRole('heading', { name: 'Saved policy' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit page' }));
  fireEvent.change(screen.getByLabelText('Page title'), { target: { value: 'Retry policy' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('SYS-001');
  expect(screen.getByLabelText('Page title')).toHaveValue('Retry policy');
});

it.each(['student', 'ssg', ''])('shows a read-only saved page for role %s', async role => {
  state.role = role; open();
  await screen.findByRole('heading', { name: 'Saved policy' });
  expect(screen.queryByRole('button', { name: 'Edit page' })).not.toBeInTheDocument();
});

it('does not allow saving original fallback content when loading fails', async () => {
  state.load.mockRejectedValue(new Error('Unavailable')); open();
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Edit page' })).toBeDisabled());
  expect(state.save).not.toHaveBeenCalled();
});

it('keeps embedded preview links in Admin Controls and omits the public home navigation', async () => {
  open(); await screen.findByRole('heading', { name: 'Saved policy' });
  expect(screen.queryByRole('link', { name: 'Back to home' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/admin/controls?tab=legal&page=terms');
});

it('keeps the public page read-only even for administrators', async () => {
  render(<MemoryRouter><LegalPage kind="privacy" /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Saved policy' });
  expect(screen.queryByRole('button', { name: 'Edit page' })).not.toBeInTheDocument();
});
