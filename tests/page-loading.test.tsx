import { Suspense, lazy, useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ profile: { role: 'student' }, mounts: 0 }));
vi.mock('../components/AuthContext', () => ({ useAuth: () => ({ profile: state.profile }) }));
import { PageSkeletonForRoute } from '../components/ui/PageLoading';
import RouteLoading from '../components/ui/RouteLoading';
import { AppLoading } from '../components/ui/Skeleton';

afterEach(cleanup);

it('announces loading once and keeps decorative placeholders out of the accessibility tree', () => {
  render(<MemoryRouter initialEntries={['/student/qr']}><RouteLoading embedded /></MemoryRouter>);
  expect(screen.getByRole('status', { name: 'Loading page' })).toHaveAttribute('aria-busy', 'true');
  expect(screen.queryByRole('main')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).not.toHaveClass('app-loading-shell');
});

it('reserves a square QR area within the same narrow page container', () => {
  const { container } = render(<PageSkeletonForRoute pathname="/student/qr" />);
  expect(container.querySelector('.app-page')).toHaveClass('student-qr-page');
  expect(container.querySelector('[data-skeleton="qr-card"] .aspect-square')).toBeInTheDocument();
  expect(container.querySelector('[data-skeleton="metrics"]')).not.toBeInTheDocument();
});

it.each([['2026-02', 28], ['2026-05', 31], ['2028-02', 29]])('matches the day count for %s rather than a fixed five-week grid', (month, count) => {
  const { container } = render(<PageSkeletonForRoute pathname="/student/calendar" search={`?month=${month}`} />);
  expect(container.querySelectorAll('[data-skeleton="calendar"] > .app-skeleton')).toHaveLength(count);
  expect(container.querySelector('[data-skeleton="metrics"]')?.children).toHaveLength(3);
});

it('falls back to the current month for an invalid month query', () => {
  const { container } = render(<PageSkeletonForRoute pathname="/student/calendar" search="?month=2026-99" />);
  expect(container.querySelectorAll('[data-skeleton="calendar"] > .app-skeleton').length).toBeGreaterThanOrEqual(28);
});

it('uses the student banner only for the student dashboard', () => {
  const view = render(<PageSkeletonForRoute pathname="/dashboard" role="student" />);
  expect(view.container.querySelector('[data-skeleton="identity"]')).toBeInTheDocument();
  view.rerender(<PageSkeletonForRoute pathname="/dashboard" role="admin" />);
  expect(view.container.querySelector('[data-skeleton="identity"]')).not.toBeInTheDocument();
});

it('maps public routes to their own containers instead of workspace metric cards', () => {
  const view = render(<PageSkeletonForRoute pathname="/register" />);
  expect(view.container.querySelector('[data-skeleton-page="enrollment"] .max-w-4xl')).toBeInTheDocument();
  view.rerender(<PageSkeletonForRoute pathname="/privacy-policy" />);
  expect(view.container.querySelector('[data-skeleton-page="legal"]')).toBeInTheDocument();
  expect(view.container.querySelector('[data-skeleton="metrics"]')).not.toBeInTheDocument();
});

it('keeps navigation mounted while a lazy page resolves', async () => {
  state.mounts = 0;
  let finish!: (value: { default: () => React.ReactNode }) => void;
  const Page = lazy(() => new Promise<{ default: () => React.ReactNode }>(resolve => { finish = resolve; }));
  function Workspace() {
    useEffect(() => { state.mounts += 1; }, []);
    return <><nav aria-label="Workspace navigation">Navigation</nav><Suspense fallback={<RouteLoading embedded />}><Page /></Suspense></>;
  }
  render(<MemoryRouter initialEntries={['/student/qr']}><Workspace /></MemoryRouter>);
  const navigation = screen.getByRole('navigation');
  expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
  await act(async () => finish({ default: () => <h1>Digital ID ready</h1> }));
  expect(screen.getByRole('heading', { name: 'Digital ID ready' })).toBeInTheDocument();
  expect(screen.getByRole('navigation')).toBe(navigation);
  expect(state.mounts).toBe(1);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('reserves the viewport only for standalone loading', () => {
  render(<AppLoading label="Loading workspace" />);
  expect(screen.getByRole('status')).toHaveClass('app-loading-shell');
});
