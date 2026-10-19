import { Suspense, lazy, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import RouteErrorBoundary from './RouteErrorBoundary';

afterEach(() => vi.restoreAllMocks());

it('shows recovery after a rejected page import and clears the error on navigation', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const BrokenPage = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /views/AdminControls.tsx')));
  render(<MemoryRouter initialEntries={['/admin/controls']}>
    <Link to="/dashboard">Dashboard</Link>
    <RouteErrorBoundary><Suspense fallback={<p>Loading</p>}><Routes>
      <Route path="/admin/controls" element={<BrokenPage />} />
      <Route path="/dashboard" element={<p>Dashboard loaded</p>} />
    </Routes></Suspense></RouteErrorBoundary>
  </MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('This page could not be downloaded');
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
  expect(await screen.findByText('Dashboard loaded')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('preserves the controls workspace through section query changes', () => {
  function Workspace() {
    const [count, setCount] = useState(0);
    return <><button onClick={() => setCount(count + 1)}>Local state: {count}</button>
      <Link to="/admin/controls?tab=updates">Updates</Link>
      <Link to="/admin/controls?tab=enrollment">Enrollment</Link></>;
  }
  render(<MemoryRouter initialEntries={['/admin/controls?tab=enrollment']}>
    <RouteErrorBoundary><Workspace /></RouteErrorBoundary>
  </MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Local state: 0' }));
  fireEvent.click(screen.getByRole('link', { name: 'Updates' }));
  expect(screen.getByRole('button', { name: 'Local state: 1' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'Enrollment' }));
  expect(screen.getByRole('button', { name: 'Local state: 1' })).toBeInTheDocument();
});

it('recovers from a controls section error when selecting a different section', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Section() {
    const location = useLocation();
    if (location.search === '?tab=enrollment') throw new Error('Section failed');
    return <p>Updates loaded</p>;
  }
  render(<MemoryRouter initialEntries={['/admin/controls?tab=enrollment']}>
    <Link to="/admin/controls?tab=updates">Open updates</Link>
    <RouteErrorBoundary><Section /></RouteErrorBoundary>
  </MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('This page could not be displayed');
  fireEvent.click(screen.getByRole('link', { name: 'Open updates' }));
  expect(await screen.findByText('Updates loaded')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
