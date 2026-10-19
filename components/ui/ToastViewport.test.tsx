import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ToastViewport from './ToastViewport';
import { toast, toastStore } from '../../lib/toast';

afterEach(() => { cleanup(); toastStore.getSnapshot().forEach(item => toast.dismiss(item.id)); vi.useRealTimers(); });

it('retains dismissed popups for their exit animation and removes them afterwards', () => {
  vi.useFakeTimers(); render(<ToastViewport />);
  let id = 0;
  act(() => { id = toast.success('New notification'); });
  expect(screen.getByText('New notification').closest('.app-toast')).toHaveAttribute('data-state', 'open');
  act(() => { toast.dismiss(id); });
  expect(screen.getByText('New notification').closest('.app-toast')).toHaveAttribute('data-state', 'closing');
  act(() => { vi.advanceTimersByTime(200); });
  expect(screen.queryByText('New notification')).not.toBeInTheDocument();
});

it('animates the success popup again when an operation finishes', () => {
  render(<ToastViewport />);
  let progress!: ReturnType<typeof toast.start>;
  act(() => { progress = toast.start('Save changes'); });
  const before = screen.getByText('Save changes').closest('.app-toast');
  act(() => { progress.complete('Changes saved'); });
  const after = screen.getByText('Changes saved').closest('.app-toast');
  expect(after).not.toBe(before);
  expect(after).toHaveAttribute('data-state', 'open');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});

it('renders repeated failures once, including during the exit animation', () => {
  vi.useFakeTimers(); render(<ToastViewport />);
  act(() => { toast.start('Refresh data').fail(new Error('network')); });
  const before = document.querySelector('.app-toast[data-kind="error"]');
  act(() => { toast.start('Refresh data').fail(new Error('network')); });
  expect(document.querySelectorAll('.app-toast[data-kind="error"]')).toHaveLength(1);
  expect(document.querySelector('.app-toast[data-kind="error"]')).toBe(before);
  act(() => { vi.advanceTimersByTime(200); });
  expect(document.querySelectorAll('.app-toast')).toHaveLength(1);
});

it('keeps distinct calls with identical messages visible as separate toasts', () => {
  render(<ToastViewport />);
  act(() => { toast.success('Changes saved'); toast.success('Changes saved'); });
  expect(screen.getAllByText('Changes saved')).toHaveLength(2);
});

it('keeps a visible background completion readable while another action runs', () => {
  vi.useFakeTimers(); render(<ToastViewport />);
  let request!: ReturnType<typeof toast.start>;
  act(() => { request = toast.start('Loading information', undefined, true); });
  act(() => { vi.advanceTimersByTime(500); });
  expect(screen.getByText('Loading information')).toBeInTheDocument();
  act(() => { request.complete(); toast.start('Save changes'); });
  expect(screen.getByText('Loading information completed')).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(4999); });
  expect(screen.getByText('Loading information completed')).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(1); });
  expect(screen.getByText('Loading information completed').closest('.app-toast')).toHaveAttribute('data-state', 'closing');
  act(() => { vi.advanceTimersByTime(200); });
  expect(screen.queryByText('Loading information completed')).not.toBeInTheDocument();
});
