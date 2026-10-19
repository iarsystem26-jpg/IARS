import { cleanup, render, screen, act, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'student' }, profile: { uid: 'student', role: 'student', account_status: 'active' }, loading: false },
  resolveQr: null as null | ((value: { default: () => ReactNode }) => void),
}));
vi.mock('../components/AuthContext', () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children, useAuth: () => state.auth }));
vi.mock('../components/ThemeContext', () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('../components/NavigationMemory', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('../components/ui/Layout', () => ({ default: ({ children }: { children: ReactNode }) => <><nav aria-label="Workspace navigation">Sidebar</nav>{children}</> }));
vi.mock('../components/ui/PwaStatus', () => ({ default: ({ children }: { children: ReactNode }) => children }));
vi.mock('../components/ui/ToastViewport', () => ({ default: () => null }));
vi.mock('../views/StudentQR', () => new Promise(resolve => { state.resolveQr = resolve; }));
import App from '../App';

afterEach(() => { cleanup(); window.location.hash = ''; });

it('keeps the app sidebar visible while loading a protected route module', async () => {
  window.location.hash = '#/student/qr';
  const view = render(<App />);
  const sidebar = screen.getByRole('navigation', { name: 'Workspace navigation' });
  expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
  expect(view.container.querySelector('[data-skeleton-page="qr"]')).toBeInTheDocument();
  await waitFor(() => expect(state.resolveQr).toBeTypeOf('function'));
  await act(async () => { state.resolveQr!({ default: () => <h1>Digital ID ready</h1> }); });
  expect(await screen.findByRole('heading', { name: 'Digital ID ready' })).toBeInTheDocument();
  expect(screen.getByRole('navigation')).toBe(sidebar);
});

it('uses the route skeleton during an authenticated workspace refresh', () => {
  window.location.hash = '#/student/profile';
  state.auth.loading = true;
  const view = render(<App />);
  expect(screen.getByRole('navigation')).toBeInTheDocument();
  expect(screen.getByRole('status', { name: 'Loading your workspace' })).toBeInTheDocument();
  expect(view.container.querySelector('[data-skeleton-page="profile"]')).toBeInTheDocument();
  state.auth.loading = false;
});
