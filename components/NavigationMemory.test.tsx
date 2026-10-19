import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import NavigationMemory, { useSmartBack } from './NavigationMemory';
import { usePageMemory } from './usePageMemory';
import { isReturnDestination, readReturnHistory, writeMemory } from '../lib/navigationMemory';

const auth = vi.hoisted(() => ({ user: { uid: 'alice' } as { uid: string } | null, loading: false }));
vi.mock('./AuthContext', () => ({ useAuth: () => auth }));

function Page() {
  const location = useLocation();
  const navigate = useNavigate();
  const back = useSmartBack();
  const [tab, setTab] = usePageMemory('tab', 'overview');
  return <><output>{location.pathname}</output><span>{tab}</span>
    <button onClick={() => setTab('details')}>Select details</button>
    <button onClick={() => navigate('/student/events')}>Events</button>
    <button onClick={() => navigate('/ssg/events/create')}>Create</button>
    <button onClick={() => navigate('/student/records')}>Records</button>
    <button onClick={() => back()}>Smart back</button>
    <button onClick={() => navigate(-1)}>Browser back</button>
    <button onClick={() => navigate('/admin/controls?tab=updates')}>App updates</button>
    <button onClick={() => navigate('/admin/controls?tab=legal&page=terms')}>Legal terms</button>
  </>;
}

function mount(path = '/dashboard') {
  return render(<MemoryRouter initialEntries={[path]}><NavigationMemory><Page /></NavigationMemory></MemoryRouter>);
}

beforeEach(() => {
  sessionStorage.clear(); auth.user = { uid: 'alice' }; auth.loading = false;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('restores the selected page section after a full remount', () => {
  const view = mount('/student/records');
  fireEvent.click(screen.getByText('Select details'));
  view.unmount(); mount('/student/records');
  expect(screen.getByText('details')).toBeInTheDocument();
});

it('preserves back history through refresh and skips creation pages', () => {
  const view = mount();
  fireEvent.click(screen.getByText('Events'));
  fireEvent.click(screen.getByText('Create'));
  fireEvent.click(screen.getByText('Records'));
  view.unmount(); mount('/student/records');
  fireEvent.click(screen.getByText('Smart back'));
  expect(screen.getByRole('status').textContent).toBe('/student/events');
  fireEvent.click(screen.getByText('Smart back'));
  expect(screen.getByRole('status').textContent).toBe('/dashboard');
});

it('skips a form reached with browser Back but allows a direct form refresh', () => {
  const view = mount('/ssg/events/create');
  expect(screen.getByRole('status').textContent).toBe('/ssg/events/create');
  view.unmount(); mount();
  fireEvent.click(screen.getByText('Events'));
  fireEvent.click(screen.getByText('Create'));
  fireEvent.click(screen.getByText('Records'));
  fireEvent.click(screen.getByText('Browser back'));
  expect(screen.getByRole('status').textContent).toBe('/student/events');
});

it('clears account navigation on logout and uses a safe fallback with no history', () => {
  const view = mount();
  fireEvent.click(screen.getByText('Events'));
  auth.user = null;
  act(() => view.rerender(<MemoryRouter><NavigationMemory><Page /></NavigationMemory></MemoryRouter>));
  expect(readReturnHistory('alice')).toEqual([]);
  fireEvent.click(screen.getByText('Smart back'));
  expect(screen.getByRole('status').textContent).toBe('/dashboard');
});

it('keeps browsing state isolated between accounts and handles corrupt storage', () => {
  const view = mount(); fireEvent.click(screen.getByText('Select details')); view.unmount();
  auth.user = { uid: 'bob' }; mount();
  expect(screen.getByText('overview')).toBeInTheDocument();
  writeMemory('bob:history', ['/login', '/ssg/events/create', '/student/events', 'https://example.com']);
  expect(readReturnHistory('bob')).toEqual(['/student/events']);
  writeMemory('bob:history', { bad: true });
  expect(readReturnHistory('bob')).toEqual([]);
  expect(isReturnDestination('/ssg/events/123/edit')).toBe(false);
  expect(isReturnDestination('/register/status')).toBe(false);
});

it('restores scroll after reload and saves subsequent scrolling', async () => {
  writeMemory('alice:scroll:/student/records', { x: 0, y: 420 });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 420 });
  mount('/student/records');
  await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 420, behavior: 'instant' }));
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 650 });
  fireEvent.scroll(window);
  expect(JSON.parse(sessionStorage.getItem('rmc:navigation:v1:alice:scroll:/student/records')!)).toEqual({ x: 0, y: 650 });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});

it('keeps navigation functional when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  mount('/student/events');
  fireEvent.click(screen.getByText('Select details'));
  expect(screen.getByText('details')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Smart back'));
  expect(screen.getByRole('status').textContent).toBe('/dashboard');
});

it('keeps the workspace scroll position when switching control sections and legal pages', async () => {
  writeMemory('alice:scroll:/admin/controls', { x: 0, y: 180 });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 180 });
  mount('/admin/controls?tab=enrollment');
  await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 180, behavior: 'instant' }));
  vi.mocked(window.scrollTo).mockClear();
  fireEvent.click(screen.getByText('App updates'));
  fireEvent.click(screen.getByText('Legal terms'));
  fireEvent.click(screen.getByText('Browser back'));
  await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(readReturnHistory('alice')).toEqual(['/admin/controls?tab=enrollment', '/admin/controls?tab=updates']);
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });
  fireEvent.scroll(window);
  expect(JSON.parse(sessionStorage.getItem('rmc:navigation:v1:alice:scroll:/admin/controls')!)).toEqual({ x: 0, y: 240 });
  fireEvent.click(screen.getByText('Records'));
  await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0, behavior: 'instant' }));
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});
